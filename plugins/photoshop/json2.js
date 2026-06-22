/*
 * Minimal JSON for ExtendScript (Illustrator's engine has no JSON).
 *
 * Only stringify is needed by the exporter, and only for the plain data the IR
 * uses (objects, arrays, strings, finite numbers, booleans, null). Undefined
 * object members are omitted, matching standard JSON.stringify. String escaping
 * is done character by character to stay unambiguous.
 */
if (typeof JSON === 'undefined') { JSON = {}; }
if (typeof JSON.stringify !== 'function') {
  JSON.stringify = function (value) {
    var META = { '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r' };
    function esc(s) {
      s = String(s);
      var out = '"';
      for (var i = 0; i < s.length; i++) {
        var c = s.charAt(i);
        var code = s.charCodeAt(i);
        if (c === '"') { out += '\\"'; }
        else if (c === '\\') { out += '\\\\'; }
        else if (code < 0x20) { out += (META[c] || ('\\u' + ('0000' + code.toString(16)).slice(-4))); }
        else { out += c; }
      }
      return out + '"';
    }
    function str(v) {
      if (v === null) return 'null';
      if (v === undefined) return undefined;
      var t = typeof v;
      if (t === 'number') return isFinite(v) ? String(v) : 'null';
      if (t === 'boolean') return String(v);
      if (t === 'string') return esc(v);
      if (t === 'object') {
        if (Object.prototype.toString.call(v) === '[object Array]') {
          var a = [];
          for (var i = 0; i < v.length; i++) {
            var sv = str(v[i]);
            a.push(sv === undefined ? 'null' : sv);
          }
          return '[' + a.join(',') + ']';
        }
        var parts = [];
        for (var k in v) {
          if (v.hasOwnProperty(k)) {
            var pv = str(v[k]);
            if (pv !== undefined) parts.push(esc(k) + ':' + pv);
          }
        }
        return '{' + parts.join(',') + '}';
      }
      return undefined;
    }
    return str(value);
  };
}
