/*
 * Rebound, syntax-highlighted code editor.
 *
 * A dependency-free editor for JS / ExtendScript / AE expressions. It uses the
 * classic "highlight layer behind a transparent textarea" technique: a <pre>
 * holds tokenized, HTML-escaped markup while the real <textarea> sits on top
 * with transparent text and a visible caret. Both share identical font, size,
 * padding and line-height (via CSS), so the colored text lines up exactly under
 * the caret. Scrolling the textarea drives the highlight layer's scroll, so the
 * two never drift apart.
 *
 * Usage:
 *   var ed = Rebound.codeEditor.create({ value: '...', placeholder: '...', minHeight: 150 });
 *   container.appendChild(ed.el);
 *   ed.getValue(); ed.setValue('...');
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;

  // Language keywords (control flow, declarations, literals).
  var KEYWORDS = [
    'var', 'let', 'const', 'function', 'return', 'if', 'else', 'for', 'while',
    'do', 'switch', 'case', 'break', 'continue', 'new', 'this', 'typeof',
    'instanceof', 'try', 'catch', 'finally', 'throw', 'true', 'false', 'null',
    'undefined'
  ];

  // After Effects / expression globals worth highlighting distinctly.
  var GLOBALS = [
    'app', 'thisComp', 'thisLayer', 'thisProperty', 'comp', 'time', 'value',
    'wiggle', 'loopOut', 'loopIn', 'linear', 'ease', 'random', 'seedRandom',
    'valueAtTime', 'velocityAtTime', 'transform', 'position', 'scale',
    'rotation', 'opacity', 'sourceRectAtTime'
  ];

  var KEYWORD_SET = toSet(KEYWORDS);
  var GLOBAL_SET = toSet(GLOBALS);

  function toSet(list) {
    var s = {};
    for (var i = 0; i < list.length; i++) s[list[i]] = true;
    return s;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function span(cls, text) {
    return '<span class="rb-tok-' + cls + '">' + escapeHtml(text) + '</span>';
  }

  // One regex, alternation ordered so longer / greedier rules win first:
  // block comment, line comment, the three string flavours, identifiers (so a
  // keyword is matched whole, never mid-word), then numbers. Anything else
  // (operators, punctuation, whitespace) falls through and is escaped verbatim.
  var TOKEN_RE = new RegExp([
    '(\\/\\*[\\s\\S]*?\\*\\/)',                         // 1 block comment
    '(\\/\\/[^\\n]*)',                                  // 2 line comment
    '("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|`(?:\\\\.|[^`\\\\])*`)', // 3 string
    '([A-Za-z_$][A-Za-z0-9_$]*)',                       // 4 identifier
    '(\\b\\d[\\d.eExXa-fA-F]*\\b)'                       // 5 number
  ].join('|'), 'g');

  function highlight(code) {
    var out = '';
    var last = 0;
    var m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(code)) !== null) {
      // Escape any plain text (operators, spaces) skipped before this match.
      if (m.index > last) out += escapeHtml(code.slice(last, m.index));
      if (m[1] != null) out += span('comment', m[1]);
      else if (m[2] != null) out += span('comment', m[2]);
      else if (m[3] != null) out += span('string', m[3]);
      else if (m[4] != null) {
        var word = m[4];
        if (KEYWORD_SET[word]) out += span('keyword', word);
        else if (GLOBAL_SET[word]) out += span('global', word);
        else out += escapeHtml(word);
      } else if (m[5] != null) out += span('number', m[5]);
      last = TOKEN_RE.lastIndex;
      // Guard against a zero-width match locking the loop.
      if (m.index === TOKEN_RE.lastIndex) TOKEN_RE.lastIndex++;
    }
    if (last < code.length) out += escapeHtml(code.slice(last));
    return out;
  }

  function create(opts) {
    opts = opts || {};
    var value = opts.value || '';

    var code = el('code.rb-code-hl');
    var pre = el('pre.rb-code-pre', { 'aria-hidden': 'true' }, [code]);
    var ta = el('textarea.rb-code-input', {
      spellcheck: 'false',
      autocapitalize: 'off',
      autocomplete: 'off',
      placeholder: opts.placeholder || ''
    });
    ta.value = value;

    var wrap = el('div.rb-code-editor', null, [pre, ta]);
    if (opts.minHeight) {
      wrap.style.minHeight = opts.minHeight + 'px';
      ta.style.minHeight = opts.minHeight + 'px';
    }

    // Re-render the highlight layer from the textarea's current text. A trailing
    // newline needs a spacer so the <pre> keeps a final empty line in step with
    // the textarea, otherwise the last row's highlight is clipped.
    function render() {
      var text = ta.value;
      code.innerHTML = highlight(text) + (text.slice(-1) === '\n' ? '\n' : '');
    }

    // Keep the highlight layer scrolled in lockstep with the textarea.
    function syncScroll() {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }

    ta.addEventListener('input', function () { render(); syncScroll(); });
    ta.addEventListener('scroll', syncScroll);

    render();

    return {
      el: wrap,
      getValue: function () { return ta.value; },
      setValue: function (v) { ta.value = v == null ? '' : String(v); render(); syncScroll(); }
    };
  }

  R.codeEditor = { create: create, highlight: highlight };
})(window.Rebound = window.Rebound || {});
