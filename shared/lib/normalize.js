/*
 * Rebound shared, normalisation helpers.
 *
 * Pure math that every exporter and the After Effects importer agree on:
 * colour clamping (0..1 RGBA), affine-matrix decomposition, angle conversion,
 * and the text-unit conversions (letter spacing -> tracking, line height ->
 * leading) so a font lands with the same metrics on every side.
 *
 * Written to the ES3/ES5 common denominator so the identical file runs in the
 * CEP panel, the ExtendScript host, Node/Vitest, and the Figma bundler. No
 * arrow functions, no const/let, no Array/Object ES5 helpers, no JSON.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else if (root) {
    root.ReboundNormalize = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clamp(n, lo, hi) {
    if (typeof n !== 'number' || isNaN(n)) return lo;
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  function clamp01(n) {
    return clamp(n, 0, 1);
  }

  // Round to a number of decimal places (keeps the IR and AE values tidy).
  function round(n, dp) {
    var f = Math.pow(10, dp || 0);
    return Math.round(n * f) / f;
  }

  // Accept {r,g,b,a} 0..1, or [r,g,b(,a)] 0..1, and return a clamped colour.
  function normalizeColor(c) {
    if (!c) return { r: 0, g: 0, b: 0, a: 1 };
    var r, g, b, a;
    if (Object.prototype.toString.call(c) === '[object Array]') {
      r = c[0]; g = c[1]; b = c[2]; a = c.length > 3 ? c[3] : 1;
    } else {
      r = c.r; g = c.g; b = c.b; a = typeof c.a === 'number' ? c.a : 1;
    }
    return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) };
  }

  // Convert 0..255 channels (some exporters read these) down to 0..1.
  function rgb255ToUnit(arr) {
    return {
      r: clamp01(arr[0] / 255),
      g: clamp01(arr[1] / 255),
      b: clamp01(arr[2] / 255),
      a: arr.length > 3 ? clamp01(arr[3] / 255) : 1
    };
  }

  // After Effects colour properties take a plain [r,g,b] (0..1) array.
  function colorToAE(c) {
    var n = normalizeColor(c);
    return [n.r, n.g, n.b];
  }

  function degToRad(d) { return d * Math.PI / 180; }
  function radToDeg(r) { return r * 180 / Math.PI; }

  // Decompose an affine [a,b,c,d,tx,ty] (Y-down) into translation, rotation
  // (degrees, clockwise), scale, and skew. Mirrors the standard QR-style
  // decomposition so a rotated/scaled source node maps onto AE transforms.
  function decomposeMatrix(m) {
    var a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5];
    var out = { x: e, y: f, rotation: 0, scaleX: 0, scaleY: 0, skew: 0 };
    var det = a * d - b * c;
    if (a !== 0 || b !== 0) {
      var r = Math.sqrt(a * a + b * b);
      out.rotation = b > 0 ? Math.acos(a / r) : -Math.acos(a / r);
      out.scaleX = r;
      out.scaleY = det / r;
      out.skew = Math.atan((a * c + b * d) / (r * r));
    } else if (c !== 0 || d !== 0) {
      var s = Math.sqrt(c * c + d * d);
      out.rotation = Math.PI / 2 - (d > 0 ? Math.acos(-c / s) : -Math.acos(c / s));
      out.scaleX = det / s;
      out.scaleY = s;
      out.skew = 0;
    }
    out.rotationDeg = radToDeg(out.rotation);
    out.skewDeg = radToDeg(out.skew);
    return out;
  }

  // Apply an affine to a point.
  function applyMatrix(m, p) {
    return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
  }

  // Flip a Y coordinate from a bottom-left origin (Illustrator) into the IR's
  // top-left, Y-down space given the artboard/document height.
  function flipY(y, height) {
    return height - y;
  }

  // Figma letter spacing -> After Effects tracking (1000 = 1em). PERCENT is a
  // share of the em; PIXELS is converted through the font size.
  function trackingFromLetterSpacing(letterSpacing, fontSize) {
    if (!letterSpacing) return 0;
    if (letterSpacing.unit === 'PERCENT') return letterSpacing.value * 10;
    if (letterSpacing.unit === 'PIXELS') return fontSize ? (letterSpacing.value / fontSize) * 1000 : 0;
    if (typeof letterSpacing === 'number') return fontSize ? (letterSpacing / fontSize) * 1000 : 0;
    return 0;
  }

  // Illustrator tracking is already in 1/1000 em, so it passes straight through.
  function trackingFromThousandthEm(value) {
    return value || 0;
  }

  // Resolve a line height to an AE leading in pixels plus an auto flag.
  function leadingFromLineHeight(lineHeight, fontSize) {
    if (!lineHeight || lineHeight.unit === 'AUTO') return { leading: 0, auto: true };
    if (lineHeight.unit === 'PIXELS') return { leading: lineHeight.value, auto: false };
    if (lineHeight.unit === 'PERCENT') return { leading: (lineHeight.value / 100) * fontSize, auto: false };
    if (typeof lineHeight === 'number') return { leading: lineHeight, auto: false };
    return { leading: 0, auto: true };
  }

  return {
    clamp: clamp,
    clamp01: clamp01,
    round: round,
    normalizeColor: normalizeColor,
    rgb255ToUnit: rgb255ToUnit,
    colorToAE: colorToAE,
    degToRad: degToRad,
    radToDeg: radToDeg,
    decomposeMatrix: decomposeMatrix,
    applyMatrix: applyMatrix,
    flipY: flipY,
    trackingFromLetterSpacing: trackingFromLetterSpacing,
    trackingFromThousandthEm: trackingFromThousandthEm,
    leadingFromLineHeight: leadingFromLineHeight
  };
});
