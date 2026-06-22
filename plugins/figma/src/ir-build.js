/*
 * Rebound Relay (Figma), IR builder.
 *
 * Walks the current selection and produces a Rebound IR document: the same
 * app-agnostic contract the After Effects importer consumes. Runs in the Figma
 * sandbox (main thread), so it can read the full scene graph and fetch image
 * bytes. Geometry is emitted in node-local space with each node's absolute
 * (frame-relative) affine, colours are 0..1 RGBA, Y is already down.
 *
 * Depends on the shared libs concatenated ahead of it at build time:
 *   ReboundNormalize (tracking conversion), ReboundBezier (SVG path -> vertices).
 */
(function (root) {
  'use strict';

  var N = root.ReboundNormalize;
  var B = root.ReboundBezier;
  var IR_VERSION = '1.1.0';

  function isFrameLike(node) {
    return node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'SECTION';
  }

  // Figma absoluteTransform is [[a,c,e],[b,d,f]]; return a frame-relative
  // [a,b,c,d,tx,ty] for the IR.
  function relMatrix(node, origin) {
    var m = node.absoluteTransform;
    return [m[0][0], m[1][0], m[0][1], m[1][1], m[0][2] - origin.x, m[1][2] - origin.y];
  }

  function mapPaint(p, w, h) {
    if (!p) return null;
    if (p.type === 'SOLID') {
      return {
        type: 'SOLID',
        color: { r: p.color.r, g: p.color.g, b: p.color.b, a: 1 },
        opacity: (p.opacity == null ? 1 : p.opacity),
        visible: p.visible !== false
      };
    }
    if (p.type === 'GRADIENT_LINEAR' || p.type === 'GRADIENT_RADIAL' || p.type === 'GRADIENT_ANGULAR' || p.type === 'GRADIENT_DIAMOND') {
      var stops = [];
      var gs = p.gradientStops || [];
      for (var i = 0; i < gs.length; i++) {
        var c = gs[i].color;
        stops.push({ position: gs[i].position, color: { r: c.r, g: c.g, b: c.b, a: (c.a == null ? 1 : c.a) } });
      }
      var handles = [];
      var hp = p.gradientHandlePositions || [];
      for (var k = 0; k < hp.length; k++) handles.push([hp[k].x * w, hp[k].y * h]);
      return { type: p.type, stops: stops, gradientHandles: handles, opacity: (p.opacity == null ? 1 : p.opacity), visible: p.visible !== false };
    }
    return null; // IMAGE handled at the node level
  }

  function mapFills(fills, w, h) {
    var out = [];
    if (!fills || fills === figma.mixed) return out;
    for (var i = 0; i < fills.length; i++) {
      var m = mapPaint(fills[i], w, h);
      if (m) out.push(m);
    }
    return out;
  }

  function mapStroke(node) {
    var strokes = node.strokes;
    if (!strokes || !strokes.length) return null;
    var weight = (typeof node.strokeWeight === 'number') ? node.strokeWeight : 1;
    var cap = (node.strokeCap && node.strokeCap !== figma.mixed) ? node.strokeCap : 'NONE';
    var join = (node.strokeJoin && node.strokeJoin !== figma.mixed) ? node.strokeJoin : 'MITER';
    var stroke = {
      paints: mapFills(strokes, node.width, node.height),
      weight: weight,
      align: node.strokeAlign,
      cap: cap,
      join: join
    };
    if (typeof node.strokeMiterLimit === 'number') stroke.miterLimit = node.strokeMiterLimit;
    if (node.dashPattern && node.dashPattern.length) stroke.dashPattern = node.dashPattern.slice();
    return stroke;
  }

  function mapEffects(effects) {
    var out = [];
    if (!effects) return out;
    for (var i = 0; i < effects.length; i++) {
      var e = effects[i];
      if (e.visible === false) continue;
      if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
        out.push({
          type: e.type,
          color: { r: e.color.r, g: e.color.g, b: e.color.b, a: (e.color.a == null ? 1 : e.color.a) },
          offset: [e.offset.x, e.offset.y],
          radius: e.radius,
          spread: e.spread || 0,
          visible: true
        });
      } else if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
        out.push({ type: e.type, radius: e.radius, visible: true });
      }
    }
    return out;
  }

  function mapCorners(node) {
    if (typeof node.cornerRadius === 'number') {
      return { topLeft: node.cornerRadius, topRight: node.cornerRadius, bottomRight: node.cornerRadius, bottomLeft: node.cornerRadius, smoothing: node.cornerSmoothing || 0 };
    }
    if ('topLeftRadius' in node) {
      return { topLeft: node.topLeftRadius || 0, topRight: node.topRightRadius || 0, bottomRight: node.bottomRightRadius || 0, bottomLeft: node.bottomLeftRadius || 0, smoothing: node.cornerSmoothing || 0 };
    }
    return null;
  }

  function uniformCorner(node) {
    return (typeof node.cornerRadius === 'number') ? node.cornerRadius : 0;
  }

  // Editable vector paths first, fall back to the rendered fill outline.
  function mapPaths(node) {
    var entries = (node.vectorPaths && node.vectorPaths.length) ? node.vectorPaths : (node.fillGeometry || []);
    var paths = [];
    for (var i = 0; i < entries.length; i++) {
      var subs = B.svgPathToSubpaths(entries[i].data);
      var winding = entries[i].windingRule === 'EVENODD' ? 'EVENODD' : 'NONZERO';
      for (var j = 0; j < subs.length; j++) {
        paths.push({ vertices: subs[j].vertices, closed: subs[j].closed, windingRule: winding });
      }
    }
    return paths;
  }

  function mapLineHeight(lh) {
    if (!lh) return undefined;
    if (lh.unit === 'AUTO') return { unit: 'AUTO' };
    return { unit: lh.unit, value: lh.value };
  }

  function mapText(node) {
    var runs = [];
    try {
      var segs = node.getStyledTextSegments(['fontName', 'fontSize', 'fills', 'letterSpacing', 'lineHeight', 'textCase', 'textDecoration']);
      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        runs.push({
          start: s.start,
          end: s.end,
          characters: s.characters,
          fontFamily: s.fontName ? s.fontName.family : undefined,
          fontStyle: s.fontName ? s.fontName.style : undefined,
          fontSize: s.fontSize,
          fills: mapFills(s.fills, node.width, node.height),
          tracking: N.trackingFromLetterSpacing(s.letterSpacing, s.fontSize),
          lineHeight: mapLineHeight(s.lineHeight),
          textCase: s.textCase,
          textDecoration: s.textDecoration
        });
      }
    } catch (e) {
      runs.push({ start: 0, end: node.characters.length, characters: node.characters, fontSize: node.fontSize });
    }
    return {
      characters: node.characters,
      runs: runs,
      textAlignHorizontal: node.textAlignHorizontal,
      textAlignVertical: node.textAlignVertical,
      autoResize: node.textAutoResize,
      paragraphSpacing: node.paragraphSpacing,
      boxSize: [node.width, node.height]
    };
  }

  function findImagePaint(fills) {
    if (!fills || fills === figma.mixed) return null;
    for (var i = 0; i < fills.length; i++) {
      if (fills[i] && fills[i].type === 'IMAGE' && fills[i].visible !== false) return fills[i];
    }
    return null;
  }

  function detectMime(bytes) {
    if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
    if (bytes.length > 3 && bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image/jpeg';
    if (bytes.length > 3 && bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
    if (bytes.length > 12 && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp';
    return 'image/png';
  }

  async function addImageAsset(imagePaint, assets) {
    var hash = imagePaint.imageHash;
    if (!hash || assets[hash]) return hash;
    try {
      var img = figma.getImageByHash(hash);
      var bytes = await img.getBytesAsync();
      var size = { width: 0, height: 0 };
      try { size = await img.getSizeAsync(); } catch (e) { /* older API */ }
      assets[hash] = {
        hash: hash,
        mime: detectMime(bytes),
        width: size.width,
        height: size.height,
        bytesBase64: figma.base64Encode(bytes)
      };
    } catch (e2) { /* leave unresolved; importer will flag it */ }
    return hash;
  }

  // Fills After Effects shape gradients cannot reproduce: angular (conic) and
  // diamond gradients, and pattern paints.
  function hasUnreproducibleFill(node) {
    var fills = node.fills;
    if (!fills || fills === figma.mixed) return false;
    for (var i = 0; i < fills.length; i++) {
      var f = fills[i];
      if (!f || f.visible === false) continue;
      if (f.type === 'GRADIENT_ANGULAR' || f.type === 'GRADIENT_DIAMOND' || f.type === 'PATTERN') return true;
    }
    return false;
  }

  // Rasterise a node to a 2x PNG and return it as an IMAGE node, so anything we
  // cannot rebuild vectorially still comes across pixel-exact.
  async function rasterizeNodeToImage(node, base, assets) {
    try {
      var bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
      var hash = 'figraster-' + String(node.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      assets[hash] = { hash: hash, mime: 'image/png', width: Math.round(node.width * 2), height: Math.round(node.height * 2), bytesBase64: figma.base64Encode(bytes) };
      base.type = 'IMAGE';
      base.imageHash = hash;
      base.scaleMode = 'FILL';
      base.effects = mapEffects(node.effects);
      return base;
    } catch (e) {
      return null;
    }
  }

  function baseFields(node, origin) {
    var m = relMatrix(node, origin);
    return {
      id: node.id,
      name: node.name,
      type: 'GROUP',
      visible: node.visible !== false,
      opacity: (node.opacity == null ? 1 : node.opacity),
      blendMode: node.blendMode || 'PASS_THROUGH',
      isMask: node.isMask || false,
      transform: { x: m[4], y: m[5], width: node.width, height: node.height, rotation: node.rotation || 0, matrix: m }
    };
  }

  async function childrenToIR(node, origin, assets) {
    var out = [];
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) {
      var ir = await nodeToIR(kids[i], origin, assets);
      if (ir) out.push(ir);
    }
    return out;
  }

  async function nodeToIR(node, origin, assets) {
    var base = baseFields(node, origin);
    var w = node.width, h = node.height;

    // Image-filled LEAF shapes become IMAGE nodes (the common placed-image case);
    // a container with an image fill must still recurse into its children.
    var imgPaint = findImagePaint(node.fills);
    if (imgPaint && (!node.children || !node.children.length)) {
      await addImageAsset(imgPaint, assets);
      base.type = 'IMAGE';
      base.imageHash = imgPaint.imageHash;
      base.scaleMode = imgPaint.scaleMode || 'FILL';
      base.effects = mapEffects(node.effects);
      return base;
    }

    // Angular/diamond gradients and pattern fills have no AE shape equivalent;
    // rasterise the node so it is pixel-exact rather than approximated.
    if (node.type !== 'TEXT' && hasUnreproducibleFill(node)) {
      var raster = await rasterizeNodeToImage(node, base, assets);
      if (raster) return raster;
    }

    switch (node.type) {
      case 'RECTANGLE':
        base.type = 'RECTANGLE';
        base.primitive = { rect: { size: [w, h], roundness: uniformCorner(node) } };
        base.cornerRadii = mapCorners(node);
        base.fills = mapFills(node.fills, w, h);
        base.stroke = mapStroke(node);
        // A squircle (corner smoothing) has no parametric rect form; bake the
        // exact outline to paths so the importer rebuilds it faithfully.
        if (node.cornerSmoothing && node.cornerSmoothing > 0 && node.fillGeometry && node.fillGeometry.length) {
          base.paths = mapPaths(node);
        }
        break;
      case 'ELLIPSE':
        base.type = 'ELLIPSE';
        base.primitive = { ellipse: { size: [w, h] } };
        base.fills = mapFills(node.fills, w, h);
        base.stroke = mapStroke(node);
        break;
      case 'LINE':
        base.type = 'LINE';
        base.paths = [{ vertices: [{ x: 0, y: 0, inTangent: [0, 0], outTangent: [0, 0] }, { x: w, y: 0, inTangent: [0, 0], outTangent: [0, 0] }], closed: false }];
        base.stroke = mapStroke(node);
        break;
      case 'POLYGON':
      case 'STAR':
      case 'VECTOR':
        base.type = node.type;
        base.paths = mapPaths(node);
        base.fills = mapFills(node.fills, w, h);
        base.stroke = mapStroke(node);
        break;
      case 'BOOLEAN_OPERATION':
        base.type = 'VECTOR'; // flatten to the exact rendered outline
        base.paths = mapPaths(node);
        base.fills = mapFills(node.fills, w, h);
        base.stroke = mapStroke(node);
        break;
      case 'TEXT':
        base.type = 'TEXT';
        base.text = mapText(node);
        base.fills = mapFills(node.fills, w, h);
        base.stroke = mapStroke(node);
        var tf = base.fills && base.fills[0];
        if (tf && tf.type && tf.type.indexOf('GRADIENT') === 0) base.text.gradientFill = tf;
        break;
      case 'FRAME':
      case 'GROUP':
      case 'COMPONENT':
      case 'COMPONENT_SET':
      case 'INSTANCE':
        base.type = 'GROUP';
        base.children = await childrenToIR(node, origin, assets);
        if (node.fills && node.fills !== figma.mixed && node.fills.length) base.fills = mapFills(node.fills, w, h);
        break;
      default:
        if (node.fillGeometry && node.fillGeometry.length) {
          base.type = 'VECTOR';
          base.paths = mapPaths(node);
          base.fills = mapFills(node.fills || [], w, h);
          base.stroke = mapStroke(node);
        } else if (node.children) {
          base.type = 'GROUP';
          base.children = await childrenToIR(node, origin, assets);
        } else {
          return null;
        }
    }
    base.effects = mapEffects(node.effects);
    return base;
  }

  async function frameToIR(frame, assets) {
    // Use the frame's transform translation, NOT absoluteBoundingBox: the bbox
    // grows with rotation/strokes/effects and would offset every child.
    var at = frame.absoluteTransform;
    var origin = at ? { x: at[0][2], y: at[1][2] } : (frame.absoluteBoundingBox || { x: frame.x, y: frame.y });
    var children = await childrenToIR(frame, origin, assets);
    var background = [];
    if (frame.fills && frame.fills !== figma.mixed) background = mapFills(frame.fills, frame.width, frame.height);
    return {
      id: frame.id,
      name: frame.name,
      width: frame.width,
      height: frame.height,
      background: background,
      clipsContent: frame.clipsContent !== false,
      buildMode: 'PRECOMP',
      children: children
    };
  }

  // Wrap loose (non-frame) selection in one synthetic frame sized to their bounds.
  async function looseFrame(nodes, assets) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < nodes.length; i++) {
      var b = nodes[i].absoluteBoundingBox;
      if (!b) continue;
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.width > maxX) maxX = b.x + b.width;
      if (b.y + b.height > maxY) maxY = b.y + b.height;
    }
    if (minX === Infinity) { minX = 0; minY = 0; maxX = 100; maxY = 100; }
    var origin = { x: minX, y: minY };
    var children = [];
    for (var k = 0; k < nodes.length; k++) {
      var ir = await nodeToIR(nodes[k], origin, assets);
      if (ir) children.push(ir);
    }
    return {
      id: 'selection',
      name: 'Selection',
      width: Math.max(1, Math.round(maxX - minX)),
      height: Math.max(1, Math.round(maxY - minY)),
      background: [],
      clipsContent: false,
      buildMode: 'PRECOMP',
      children: children
    };
  }

  async function buildIR(selection) {
    var assets = {};
    var frames = [];
    var loose = [];
    for (var i = 0; i < selection.length; i++) {
      var node = selection[i];
      if (isFrameLike(node)) frames.push(await frameToIR(node, assets));
      else loose.push(node);
    }
    if (loose.length) frames.push(await looseFrame(loose, assets));

    return {
      irVersion: IR_VERSION,
      source: { app: 'figma', exporterVersion: '0.1.0', fileName: figma.root.name, selectionCount: selection.length },
      document: { name: figma.root.name, colorSpace: 'srgb', unit: 'px', yAxis: 'down', assets: assets, frames: frames }
    };
  }

  root.ReboundFigma = { buildIR: buildIR };
})(typeof globalThis !== 'undefined' ? globalThis : this);
