/*
 * Rebound shared, gradient stop encoding.
 *
 * After Effects stores a shape gradient's stops in the flat "ADBE Vector Grad
 * Colors" array: 4 numbers per colour stop (position, r, g, b), then 2 numbers
 * per alpha stop (position, alpha), colour stops first, sorted by position. This
 * format is fiddly enough to be worth a single, tested implementation shared by
 * the host importer and the Gradient tool.
 *
 * ES3/ES5 common denominator (panel, ExtendScript, Node, Figma bundler).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else if (root) {
    root.ReboundGrad = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clamp01(v) {
    if (v == null || isNaN(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  // stops: [{ pos:Number(0..1), color:[r,g,b](0..1), alpha?:Number(0..1) }]
  function encode(stops) {
    var s = stops.slice().sort(function (a, b) { return a.pos - b.pos; });
    var arr = [];
    var i;
    for (i = 0; i < s.length; i++) {
      var c = s[i].color || [0, 0, 0];
      arr.push(clamp01(s[i].pos), clamp01(c[0]), clamp01(c[1]), clamp01(c[2]));
    }
    for (i = 0; i < s.length; i++) {
      var a = (typeof s[i].alpha === 'number') ? clamp01(s[i].alpha) : 1;
      arr.push(clamp01(s[i].pos), a);
    }
    return arr;
  }

  // Decode the flat array back to [{ pos, color:[r,g,b], alpha }]. The value is N
  // colour stops (4 each) then N alpha stops (2 each), so a well-formed length is
  // divisible by 6.
  function decode(data) {
    if (!data || !data.length || data.length % 6 !== 0) return null;
    var n = data.length / 6;
    var stops = [];
    for (var i = 0; i < n; i++) {
      var o = i * 4;
      var a = n * 4 + i * 2;
      stops.push({
        pos: clamp01(data[o]),
        color: [clamp01(data[o + 1]), clamp01(data[o + 2]), clamp01(data[o + 3])],
        alpha: clamp01(data[a + 1])
      });
    }
    return stops;
  }

  return { encode: encode, decode: decode };
});
