/*
 * Rebound — minimal JSON for the ExtendScript host.
 *
 * The legacy ExtendScript engine has no native JSON object, and Rebound's
 * panel <-> host bridge exchanges JSON strings. This is an original, compact
 * implementation: a straightforward recursive-descent parser (no string
 * evaluation) and a stringifier covering the value types the bridge uses
 * (null, boolean, finite number, string, array, plain object).
 *
 * Installs only if a JSON object is not already present.
 */
if (typeof JSON !== 'object' || JSON === null) {
  JSON = {};
}

(function () {
  if (typeof JSON.stringify === 'function' && typeof JSON.parse === 'function') {
    return;
  }

  var ESCAPES = {
    '"': '"',
    '\\': '\\',
    '/': '/',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t'
  };

  function encodeString(s) {
    var out = '"';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      var code = s.charCodeAt(i);
      if (ch === '"') {
        out += '\\"';
      } else if (ch === '\\') {
        out += '\\\\';
      } else if (ch === '\b') {
        out += '\\b';
      } else if (ch === '\f') {
        out += '\\f';
      } else if (ch === '\n') {
        out += '\\n';
      } else if (ch === '\r') {
        out += '\\r';
      } else if (ch === '\t') {
        out += '\\t';
      } else if (code < 0x20) {
        var hex = code.toString(16);
        out += '\\u' + '0000'.substring(hex.length) + hex;
      } else {
        out += ch;
      }
    }
    return out + '"';
  }

  function encode(value) {
    if (value === null || value === undefined) {
      return 'null';
    }
    var t = typeof value;
    if (t === 'number') {
      return isFinite(value) ? String(value) : 'null';
    }
    if (t === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (t === 'string') {
      return encodeString(value);
    }
    if (t === 'object') {
      var parts = [];
      var i;
      if (value instanceof Array) {
        for (i = 0; i < value.length; i++) {
          var item = encode(value[i]);
          parts.push(item === undefined ? 'null' : item);
        }
        return '[' + parts.join(',') + ']';
      }
      for (var key in value) {
        if (value.hasOwnProperty(key)) {
          var encoded = encode(value[key]);
          if (encoded !== undefined) {
            parts.push(encodeString(key) + ':' + encoded);
          }
        }
      }
      return '{' + parts.join(',') + '}';
    }
    return undefined; // functions, etc. are skipped
  }

  function makeReader(text) {
    var at = 0;
    var ch = text.charAt(0);

    function fail(message) {
      throw new Error('JSON parse error: ' + message + ' (index ' + at + ')');
    }

    function advance(expected) {
      if (expected && expected !== ch) {
        fail("expected '" + expected + "' but found '" + ch + "'");
      }
      at += 1;
      ch = text.charAt(at);
      return ch;
    }

    function skipWhite() {
      while (ch !== '' && ch <= ' ') {
        advance();
      }
    }

    function readKeyword() {
      if (ch === 't') {
        advance('t'); advance('r'); advance('u'); advance('e');
        return true;
      }
      if (ch === 'f') {
        advance('f'); advance('a'); advance('l'); advance('s'); advance('e');
        return false;
      }
      if (ch === 'n') {
        advance('n'); advance('u'); advance('l'); advance('l');
        return null;
      }
      fail("unexpected token '" + ch + "'");
    }

    function readNumber() {
      var s = '';
      if (ch === '-') {
        s = '-';
        advance('-');
      }
      while (ch >= '0' && ch <= '9') {
        s += ch;
        advance();
      }
      if (ch === '.') {
        s += '.';
        while (advance() !== '' && ch >= '0' && ch <= '9') {
          s += ch;
        }
      }
      if (ch === 'e' || ch === 'E') {
        s += ch;
        advance();
        if (ch === '-' || ch === '+') {
          s += ch;
          advance();
        }
        while (ch >= '0' && ch <= '9') {
          s += ch;
          advance();
        }
      }
      var n = +s;
      if (!isFinite(n)) {
        fail('invalid number');
      }
      return n;
    }

    function readString() {
      var s = '';
      var hex, i, codeUnit;
      if (ch !== '"') {
        fail('expected string');
      }
      while (advance() !== '') {
        if (ch === '"') {
          advance();
          return s;
        }
        if (ch === '\\') {
          advance();
          if (ch === 'u') {
            codeUnit = 0;
            for (i = 0; i < 4; i++) {
              hex = parseInt(advance(), 16);
              if (!isFinite(hex)) {
                fail('invalid unicode escape');
              }
              codeUnit = codeUnit * 16 + hex;
            }
            s += String.fromCharCode(codeUnit);
          } else if (typeof ESCAPES[ch] === 'string') {
            s += ESCAPES[ch];
          } else {
            fail('invalid escape');
          }
        } else {
          s += ch;
        }
      }
      fail('unterminated string');
    }

    function readValue() {
      skipWhite();
      switch (ch) {
        case '{':
          return readObject();
        case '[':
          return readArray();
        case '"':
          return readString();
        case '-':
          return readNumber();
        default:
          return ch >= '0' && ch <= '9' ? readNumber() : readKeyword();
      }
    }

    function readArray() {
      var arr = [];
      advance('[');
      skipWhite();
      if (ch === ']') {
        advance(']');
        return arr;
      }
      while (ch !== '') {
        arr.push(readValue());
        skipWhite();
        if (ch === ']') {
          advance(']');
          return arr;
        }
        advance(',');
        skipWhite();
      }
      fail('unterminated array');
    }

    function readObject() {
      var obj = {};
      var key;
      advance('{');
      skipWhite();
      if (ch === '}') {
        advance('}');
        return obj;
      }
      while (ch !== '') {
        if (ch !== '"') {
          fail('expected object key');
        }
        key = readString();
        skipWhite();
        advance(':');
        obj[key] = readValue();
        skipWhite();
        if (ch === '}') {
          advance('}');
          return obj;
        }
        advance(',');
        skipWhite();
      }
      fail('unterminated object');
    }

    return {
      run: function () {
        var result = readValue();
        skipWhite();
        if (ch !== '') {
          fail('unexpected trailing characters');
        }
        return result;
      }
    };
  }

  if (typeof JSON.stringify !== 'function') {
    JSON.stringify = function (value) {
      return encode(value);
    };
  }

  if (typeof JSON.parse !== 'function') {
    JSON.parse = function (text) {
      if (typeof text !== 'string') {
        text = String(text);
      }
      return makeReader(text).run();
    };
  }
})();
