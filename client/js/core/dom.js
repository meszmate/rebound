/*
 * Rebound — minimal DOM helpers.
 * A small, dependency-free toolkit so feature modules build UI declaratively
 * without a framework (each CEP panel is its own Chromium process — stay lean).
 */
;(function (R) {
  'use strict';

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  // el('button.primary', { onclick: fn, title: 'x' }, ['Label'])
  // Tag may carry a single class shorthand: 'div.row' or 'span#id'.
  function el(tag, props, children) {
    var idMatch = tag.match(/#([\w-]+)/);
    var classMatches = tag.match(/\.([\w-]+)/g) || [];
    var name = tag.replace(/[#.][\w-]+/g, '') || 'div';
    var node = document.createElement(name);

    if (idMatch) node.id = idMatch[1];
    for (var c = 0; c < classMatches.length; c++) {
      node.classList.add(classMatches[c].substring(1));
    }

    if (props) {
      for (var key in props) {
        if (!props.hasOwnProperty(key)) continue;
        var val = props[key];
        if (val == null) continue;
        if (key === 'class' || key === 'className') {
          node.className = node.className ? node.className + ' ' + val : val;
        } else if (key === 'style' && typeof val === 'object') {
          for (var s in val) {
            if (val.hasOwnProperty(s)) node.style[s] = val[s];
          }
        } else if (key === 'dataset' && typeof val === 'object') {
          for (var d in val) {
            if (val.hasOwnProperty(d)) node.dataset[d] = val[d];
          }
        } else if (key.indexOf('on') === 0 && typeof val === 'function') {
          node.addEventListener(key.substring(2).toLowerCase(), val);
        } else if (key === 'html') {
          node.innerHTML = val;
        } else if (key === 'text') {
          node.textContent = val;
        } else if (key in node && key !== 'list') {
          try { node[key] = val; } catch (e) { node.setAttribute(key, val); }
        } else {
          node.setAttribute(key, val);
        }
      }
    }

    appendChildren(node, children);
    return node;
  }

  function appendChildren(node, children) {
    if (children == null) return;
    if (!Array.isArray(children)) children = [children];
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child == null || child === false) continue;
      if (typeof child === 'string' || typeof child === 'number') {
        node.appendChild(document.createTextNode(String(child)));
      } else {
        node.appendChild(child);
      }
    }
  }

  function clear(node) {
    while (node && node.firstChild) {
      node.removeChild(node.firstChild);
    }
    return node;
  }

  function on(node, type, fn, opts) {
    node.addEventListener(type, fn, opts || false);
    return function off() {
      node.removeEventListener(type, fn, opts || false);
    };
  }

  // SVG element creator (curve editor etc. live in the SVG namespace).
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function svg(name, attrs, children) {
    var node = document.createElementNS(SVG_NS, name);
    if (attrs) {
      for (var key in attrs) {
        if (!attrs.hasOwnProperty(key)) continue;
        var val = attrs[key];
        if (val == null) continue;
        if (key.indexOf('on') === 0 && typeof val === 'function') {
          node.addEventListener(key.substring(2).toLowerCase(), val);
        } else {
          node.setAttribute(key, val);
        }
      }
    }
    appendChildren(node, children);
    return node;
  }

  R.dom = {
    qs: qs,
    qsa: qsa,
    el: el,
    svg: svg,
    clear: clear,
    on: on,
    SVG_NS: SVG_NS
  };
})(window.Rebound = window.Rebound || {});
