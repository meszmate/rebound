/*
 * Rebound shared, bezier geometry.
 *
 * Converts the path data every source app speaks into the one form After
 * Effects wants: a Shape() with absolute vertices and tangents stored RELATIVE
 * to their vertex (handle - anchor). Two entry points:
 *
 *   svgPathToSubpaths(d)            Figma vectorPaths / exported SVG -> subpaths
 *   vertexFromDirections(a, l, r)   Illustrator pathPoints -> a vertex
 *
 * ES3/ES5 common denominator (runs in panel, ExtendScript, Node, Figma bundler).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else if (root) {
    root.ReboundBezier = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPS = 1e-4;

  function almostEqual(a, b) {
    return Math.abs(a - b) < EPS;
  }

  function absToRel(anchor, handle) {
    return [handle[0] - anchor[0], handle[1] - anchor[1]];
  }

  function relToAbs(anchor, rel) {
    return [anchor[0] + rel[0], anchor[1] + rel[1]];
  }

  // Build an AE-style vertex from an anchor and its absolute in/out handles.
  // Illustrator gives leftDirection (incoming) and rightDirection (outgoing).
  function vertexFromDirections(anchor, leftDirection, rightDirection) {
    return {
      x: anchor[0],
      y: anchor[1],
      inTangent: absToRel(anchor, leftDirection || anchor),
      outTangent: absToRel(anchor, rightDirection || anchor)
    };
  }

  // --- SVG path parsing -----------------------------------------------------

  function tokenize(d) {
    var re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
    var tokens = [];
    var m;
    while ((m = re.exec(d)) !== null) {
      if (m[1]) tokens.push({ cmd: m[1] });
      else tokens.push({ num: parseFloat(m[2]) });
    }
    return tokens;
  }

  // Split a 0..maxSweep arc into cubic bezier segments (each <= 90deg).
  function arcToCubics(x0, y0, rx, ry, phiDeg, largeArc, sweep, x, y) {
    var segs = [];
    if (rx === 0 || ry === 0) {
      segs.push({ c1: [x0, y0], c2: [x, y], p3: [x, y] });
      return segs;
    }
    var phi = phiDeg * Math.PI / 180;
    var cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
    var dx = (x0 - x) / 2, dy = (y0 - y) / 2;
    var x1p = cosPhi * dx + sinPhi * dy;
    var y1p = -sinPhi * dx + cosPhi * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    var lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) {
      var s = Math.sqrt(lambda);
      rx *= s; ry *= s;
    }
    var sign = largeArc === sweep ? -1 : 1;
    var num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    var den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    var co = sign * Math.sqrt(Math.max(0, num / den));
    var cxp = co * (rx * y1p) / ry;
    var cyp = co * (-ry * x1p) / rx;
    var cx = cosPhi * cxp - sinPhi * cyp + (x0 + x) / 2;
    var cy = sinPhi * cxp + cosPhi * cyp + (y0 + y) / 2;
    var theta1 = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
    var dtheta = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx) - theta1;
    if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
    else if (sweep && dtheta < 0) dtheta += 2 * Math.PI;
    var count = Math.ceil(Math.abs(dtheta) / (Math.PI / 2));
    var delta = dtheta / count;
    var t = (4 / 3) * Math.tan(delta / 4);
    var th = theta1;
    var px = x0, py = y0;
    for (var i = 0; i < count; i++) {
      var th2 = th + delta;
      var cosTh = Math.cos(th), sinTh = Math.sin(th);
      var cosTh2 = Math.cos(th2), sinTh2 = Math.sin(th2);
      var ep = [
        cosPhi * rx * cosTh2 - sinPhi * ry * sinTh2 + cx,
        sinPhi * rx * cosTh2 + cosPhi * ry * sinTh2 + cy
      ];
      var c1 = [
        px + t * (-cosPhi * rx * sinTh - sinPhi * ry * cosTh),
        py + t * (-sinPhi * rx * sinTh + cosPhi * ry * cosTh)
      ];
      var c2 = [
        ep[0] - t * (-cosPhi * rx * sinTh2 - sinPhi * ry * cosTh2),
        ep[1] - t * (-sinPhi * rx * sinTh2 + cosPhi * ry * cosTh2)
      ];
      segs.push({ c1: c1, c2: c2, p3: ep });
      px = ep[0]; py = ep[1];
      th = th2;
    }
    return segs;
  }

  // Parse an SVG path string into subpaths of cubic segments, then fold those
  // into AE vertices with relative tangents.
  function svgPathToSubpaths(d) {
    if (!d) return [];
    var tokens = tokenize(d);
    var i = 0;
    var subs = [];
    var cur = null; // current subpath { segments, closed, sx, sy }
    var cx = 0, cy = 0, sx = 0, sy = 0;
    var lastCmd = '';
    var lastC2 = null; // previous cubic second control (for S)
    var lastQ = null;  // previous quadratic control (for T)

    function startSub(x, y) {
      cur = { segments: [], closed: false, sx: x, sy: y, hasPoint: true };
      subs.push(cur);
    }
    function line(x, y) {
      cur.segments.push({ c1: [cx, cy], c2: [x, y], p3: [x, y] });
      cx = x; cy = y; lastC2 = null; lastQ = null;
    }
    function cubic(c1, c2, p3) {
      cur.segments.push({ c1: c1, c2: c2, p3: p3 });
      cx = p3[0]; cy = p3[1]; lastC2 = c2; lastQ = null;
    }
    function quad(qc, p3) {
      // Elevate quadratic to cubic.
      var c1 = [cx + 2 / 3 * (qc[0] - cx), cy + 2 / 3 * (qc[1] - cy)];
      var c2 = [p3[0] + 2 / 3 * (qc[0] - p3[0]), p3[1] + 2 / 3 * (qc[1] - p3[1])];
      cur.segments.push({ c1: c1, c2: c2, p3: p3 });
      cx = p3[0]; cy = p3[1]; lastQ = qc; lastC2 = null;
    }
    function next() { return tokens[i++].num; }

    while (i < tokens.length) {
      var tok = tokens[i];
      var cmd;
      if (tok.cmd !== undefined) { cmd = tok.cmd; i++; }
      else { cmd = (lastCmd === 'M') ? 'L' : (lastCmd === 'm') ? 'l' : lastCmd; }
      var rel = cmd >= 'a';
      var up = cmd.toUpperCase();

      if (up === 'M') {
        var mx = next(), my = next();
        if (rel) { mx += cx; my += cy; }
        cx = mx; cy = my; sx = cx; sy = cy;
        startSub(cx, cy);
      } else if (up === 'Z') {
        if (cur) {
          if (!almostEqual(cx, sx) || !almostEqual(cy, sy)) {
            cur.segments.push({ c1: [cx, cy], c2: [sx, sy], p3: [sx, sy] });
          }
          cur.closed = true;
          cx = sx; cy = sy;
        }
      } else if (up === 'L') {
        var lx = next(), ly = next();
        if (rel) { lx += cx; ly += cy; }
        line(lx, ly);
      } else if (up === 'H') {
        var hx = next(); if (rel) hx += cx;
        line(hx, cy);
      } else if (up === 'V') {
        var vy = next(); if (rel) vy += cy;
        line(cx, vy);
      } else if (up === 'C') {
        var c1x = next(), c1y = next(), c2x = next(), c2y = next(), ex = next(), ey = next();
        if (rel) { c1x += cx; c1y += cy; c2x += cx; c2y += cy; ex += cx; ey += cy; }
        cubic([c1x, c1y], [c2x, c2y], [ex, ey]);
      } else if (up === 'S') {
        var s2x = next(), s2y = next(), sex = next(), sey = next();
        if (rel) { s2x += cx; s2y += cy; sex += cx; sey += cy; }
        var rc1 = lastC2 ? [2 * cx - lastC2[0], 2 * cy - lastC2[1]] : [cx, cy];
        cubic(rc1, [s2x, s2y], [sex, sey]);
      } else if (up === 'Q') {
        var qcx = next(), qcy = next(), qex = next(), qey = next();
        if (rel) { qcx += cx; qcy += cy; qex += cx; qey += cy; }
        quad([qcx, qcy], [qex, qey]);
      } else if (up === 'T') {
        var tex = next(), tey = next();
        if (rel) { tex += cx; tey += cy; }
        var rq = lastQ ? [2 * cx - lastQ[0], 2 * cy - lastQ[1]] : [cx, cy];
        quad(rq, [tex, tey]);
      } else if (up === 'A') {
        var arx = next(), ary = next(), arot = next(), af = next(), asw = next(), aex = next(), aey = next();
        if (rel) { aex += cx; aey += cy; }
        var arcs = arcToCubics(cx, cy, arx, ary, arot, af !== 0, asw !== 0, aex, aey);
        for (var a = 0; a < arcs.length; a++) cubic(arcs[a].c1, arcs[a].c2, arcs[a].p3);
      } else {
        i++; // unknown token, skip defensively
      }
      lastCmd = cmd;
    }

    var out = [];
    for (var k = 0; k < subs.length; k++) {
      out.push(segmentsToVertices(subs[k]));
    }
    return out;
  }

  // Fold a subpath of cubic segments into AE vertices (relative tangents).
  function segmentsToVertices(sub) {
    var segs = sub.segments;
    var verts = [];
    if (!segs.length) {
      if (sub.hasPoint) verts.push({ x: sub.sx, y: sub.sy, inTangent: [0, 0], outTangent: [0, 0] });
      return { vertices: verts, closed: !!sub.closed };
    }
    var n = segs.length;
    // First vertex.
    var p0 = [sub.sx, sub.sy];
    verts.push({ x: p0[0], y: p0[1], inTangent: [0, 0], outTangent: absToRel(p0, segs[0].c1) });
    // Interior vertices: each is the end of seg[k] and start of seg[k+1].
    for (var k = 0; k < n - 1; k++) {
      var p = segs[k].p3;
      verts.push({
        x: p[0], y: p[1],
        inTangent: absToRel(p, segs[k].c2),
        outTangent: absToRel(p, segs[k + 1].c1)
      });
    }
    // Last vertex (end of final segment).
    var last = segs[n - 1].p3;
    var lastVert = {
      x: last[0], y: last[1],
      inTangent: absToRel(last, segs[n - 1].c2),
      outTangent: [0, 0]
    };
    if (sub.closed && almostEqual(last[0], p0[0]) && almostEqual(last[1], p0[1])) {
      // Closed loop: the final point coincides with the first; merge the final
      // in-tangent onto the first vertex and drop the duplicate.
      verts[0].inTangent = lastVert.inTangent;
    } else {
      verts.push(lastVert);
    }
    return { vertices: verts, closed: !!sub.closed };
  }

  return {
    absToRel: absToRel,
    relToAbs: relToAbs,
    vertexFromDirections: vertexFromDirections,
    svgPathToSubpaths: svgPathToSubpaths,
    arcToCubics: arcToCubics
  };
});
