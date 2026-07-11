/*
 * Rebound, Lottie (bodymovin) serializer.
 *
 * Pure: turns a read-out of a comp's layers + transform animation (see the
 * `doc` contract below) into Lottie v5 JSON, so animation authored in After
 * Effects can hand off to web/app (lottie-web, Lottie iOS/Android) — closing the
 * Figma -> AE -> code loop. The host reads keyframes; this module shapes JSON; a
 * tiny host command writes the file. Kept dependency-free so it is unit-tested.
 *
 * Lottie's per-keyframe `o`/`i` ARE a normalized cubic-bezier of the segment's
 * value progress — identical to Rebound's {x1,y1,x2,y2}. So a segment ease maps
 * directly: o = {x:[x1], y:[y1]}, i = {x:[x2], y:[y2]}. Times are in FRAMES.
 *
 * doc = {
 *   name, width, height, fps, durationFrames,
 *   layers: [{
 *     name, inFrame, outFrame, type: 'solid'|'null'|'shape'|'text'|'other',
 *     color?: [r,g,b] (0..1), size?: [w,h],
 *     shapes?: [SHAPE],                       // static geometry (shape layers)
 *     transform: { anchor, position, scale, rotation, opacity }   // each a PROP
 *   }]
 * }
 * PROP = { static:true, value:Number|Number[] }
 *      | { static:false, keys:[ { t:frame, v:Number|Number[], bez:{x1,y1,x2,y2}|null } ] }
 *   bez is the ease of the segment FROM this key to the next (null => linear).
 * SHAPE = { ty:'gr', name, transform:{anchor,position,scale,rotation,skew,skewAxis,opacity}, items:[SHAPE] }
 *       | { ty:'sh', name, closed, vertices:[[x,y]], inTangents:[[x,y]], outTangents:[[x,y]] }
 *       | { ty:'rc', name, size:[w,h], position:[x,y], roundness }
 *       | { ty:'el', name, size:[w,h], position:[x,y] }
 *       | { ty:'fl', name, color:[r,g,b], opacity }
 *       | { ty:'st', name, color:[r,g,b], opacity, width, lineCap, lineJoin }
 *   Coordinates are group-local, exactly as AE nests them, which is also
 *   Lottie's convention — so the tree maps 1:1 (each 'gr' gains a trailing
 *   'tr' item carrying its transform).
 */
;(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.Rebound = root.Rebound || {};
  root.Rebound.exporters = root.Rebound.exporters || {};
  root.Rebound.exporters.lottie = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LINEAR = { x1: 1 / 3, y1: 1 / 3, x2: 2 / 3, y2: 2 / 3 };

  function r3(v) { return Math.round((v || 0) * 1000) / 1000; }
  function arr(v) { return v instanceof Array ? v.slice() : [v]; }

  function hex(rgb) {
    function c(x) { var n = Math.round(Math.max(0, Math.min(1, x || 0)) * 255); var s = n.toString(16); return s.length < 2 ? '0' + s : s; }
    rgb = rgb || [0, 0, 0];
    return '#' + c(rgb[0]) + c(rgb[1]) + c(rgb[2]);
  }

  // One Lottie animated/static property from a PROP.
  function lottieProp(prop) {
    if (!prop) return { a: 0, k: 0 };
    if (prop.static) {
      return { a: 0, k: prop.value instanceof Array ? prop.value.map(r3) : r3(prop.value) };
    }
    var keys = prop.keys || [];
    if (keys.length === 1) return { a: 0, k: keys[0].v instanceof Array ? keys[0].v.map(r3) : r3(keys[0].v) };
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var node = { t: k.t, s: arr(k.v).map(r3) };
      if (i < keys.length - 1) {
        var b = k.bez || LINEAR;
        node.o = { x: [r3(b.x1)], y: [r3(b.y1)] };
        node.i = { x: [r3(b.x2)], y: [r3(b.y2)] };
      }
      out.push(node);
    }
    return { a: 1, k: out };
  }

  // Normalize a transform PROP set into Lottie's ks block. Position/anchor pad to
  // 2D when scalar; scale defaults to [100,100], opacity to 100.
  function transformBlock(t) {
    t = t || {};
    return {
      o: lottieProp(t.opacity) || { a: 0, k: 100 },
      r: lottieProp(t.rotation) || { a: 0, k: 0 },
      p: lottieProp(t.position) || { a: 0, k: [0, 0] },
      a: lottieProp(t.anchor) || { a: 0, k: [0, 0] },
      s: lottieProp(t.scale) || { a: 0, k: [100, 100] }
    };
  }

  function layerType(type) {
    if (type === 'solid') return 1;
    if (type === 'shape') return 4;
    if (type === 'text') return 5;
    return 3; // null / other => transform-only null
  }

  function buildLayer(layer, index, doc) {
    var ty = layerType(layer.type);
    var L = {
      ddd: 0,
      ind: index + 1,
      ty: ty,
      nm: layer.name || ('Layer ' + (index + 1)),
      sr: 1,
      ks: transformBlock(layer.transform),
      ao: 0,
      ip: layer.inFrame != null ? layer.inFrame : 0,
      op: layer.outFrame != null ? layer.outFrame : doc.durationFrames,
      st: 0,
      bm: 0
    };
    if (ty === 1) {
      var size = layer.size || [doc.width, doc.height];
      L.sw = Math.round(size[0]);
      L.sh = Math.round(size[1]);
      L.sc = hex(layer.color);
    } else if (ty === 4) {
      // Real geometry when the host read it; otherwise fall back to a colored
      // rectangle the size of the layer so the transform animation still reads.
      L.shapes = (layer.shapes && layer.shapes.length)
        ? shapeItems(layer.shapes)
        : rectShape(layer.size || [100, 100], layer.color || [0.5, 0.5, 0.5]);
    }
    return L;
  }

  // ---- Shape geometry (static, group-local, mirrors the AE nesting) ---------

  function pt2(v, dx, dy) { return (v && v.length >= 2) ? [r3(v[0]), r3(v[1])] : [dx, dy]; }

  function shapeTransformItem(t) {
    t = t || {};
    var it = {
      ty: 'tr',
      p: { a: 0, k: pt2(t.position, 0, 0) },
      a: { a: 0, k: pt2(t.anchor, 0, 0) },
      s: { a: 0, k: pt2(t.scale, 100, 100) },
      r: { a: 0, k: r3(t.rotation || 0) },
      o: { a: 0, k: t.opacity == null ? 100 : r3(t.opacity) }
    };
    if (t.skew) {
      it.sk = { a: 0, k: r3(t.skew) };
      it.sa = { a: 0, k: r3(t.skewAxis || 0) };
    }
    return it;
  }

  function shapeItem(item) {
    if (!item || !item.ty) return null;
    if (item.ty === 'gr') {
      return {
        ty: 'gr',
        nm: item.name || 'Group',
        it: shapeItems(item.items).concat([shapeTransformItem(item.transform)])
      };
    }
    if (item.ty === 'sh') {
      var v = [], ti = [], to = [];
      var n = (item.vertices || []).length;
      for (var i = 0; i < n; i++) {
        v.push(pt2(item.vertices[i], 0, 0));
        ti.push(pt2(item.inTangents && item.inTangents[i], 0, 0));
        to.push(pt2(item.outTangents && item.outTangents[i], 0, 0));
      }
      return {
        ty: 'sh', d: 1, nm: item.name || 'Path',
        ks: { a: 0, k: { i: ti, o: to, v: v, c: !!item.closed } }
      };
    }
    if (item.ty === 'rc') {
      return {
        ty: 'rc', d: 1, nm: item.name || 'Rectangle',
        s: { a: 0, k: pt2(item.size, 100, 100) },
        p: { a: 0, k: pt2(item.position, 0, 0) },
        r: { a: 0, k: r3(item.roundness || 0) }
      };
    }
    if (item.ty === 'el') {
      return {
        ty: 'el', d: 1, nm: item.name || 'Ellipse',
        s: { a: 0, k: pt2(item.size, 100, 100) },
        p: { a: 0, k: pt2(item.position, 0, 0) }
      };
    }
    if (item.ty === 'fl') {
      var fc = item.color || [0, 0, 0];
      return {
        ty: 'fl', nm: item.name || 'Fill',
        c: { a: 0, k: [r3(fc[0]), r3(fc[1]), r3(fc[2]), 1] },
        o: { a: 0, k: item.opacity == null ? 100 : r3(item.opacity) },
        r: 1
      };
    }
    if (item.ty === 'st') {
      var sc = item.color || [0, 0, 0];
      return {
        ty: 'st', nm: item.name || 'Stroke',
        c: { a: 0, k: [r3(sc[0]), r3(sc[1]), r3(sc[2]), 1] },
        o: { a: 0, k: item.opacity == null ? 100 : r3(item.opacity) },
        w: { a: 0, k: item.width == null ? 1 : r3(item.width) },
        lc: item.lineCap || 1, // AE and Lottie share the enum: 1 butt, 2 round, 3 square
        lj: item.lineJoin || 1,
        ml: 4
      };
    }
    return null; // unknown item kinds are dropped, not corrupted
  }

  function shapeItems(items) {
    var out = [];
    for (var i = 0; i < (items || []).length; i++) {
      var it = shapeItem(items[i]);
      if (it) out.push(it);
    }
    return out;
  }

  function rectShape(size, color) {
    return [{
      ty: 'gr', nm: 'Rect', it: [
        { ty: 'rc', d: 1, s: { a: 0, k: [Math.round(size[0]), Math.round(size[1])] }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 0 } },
        { ty: 'fl', c: { a: 0, k: [r3(color[0]), r3(color[1]), r3(color[2]), 1] }, o: { a: 0, k: 100 }, r: 1 },
        { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }
      ]
    }];
  }

  // doc -> Lottie animation object.
  function exportLottie(doc) {
    doc = doc || {};
    var layers = (doc.layers || []).map(function (l, i) { return buildLayer(l, i, doc); });
    return {
      v: '5.7.0',
      fr: doc.fps || 30,
      ip: 0,
      op: doc.durationFrames || 0,
      w: doc.width || 0,
      h: doc.height || 0,
      nm: doc.name || 'Rebound Export',
      ddd: 0,
      assets: [],
      layers: layers
    };
  }

  return {
    exportLottie: exportLottie,
    lottieProp: lottieProp,
    transformBlock: transformBlock,
    buildLayer: buildLayer,
    shapeItems: shapeItems,
    hex: hex,
    LINEAR: LINEAR
  };
});
