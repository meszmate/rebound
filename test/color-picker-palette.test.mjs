import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

// Minimal DOM implementation sufficient to exercise dom.js, controls.js,
// color-picker.js, modal.js, color.js, and palette.js in Node.
function createDomEnv() {
  let activeElement = null;

  class ClassList {
    constructor(el) {
      this._el = el;
      this._set = new Set();
    }
    _syncFromAttr(str) {
      this._set = new Set(String(str || '').split(/\s+/).filter(Boolean));
    }
    _syncToAttr() {
      this._el._className = Array.from(this._set).join(' ');
    }
    add(...names) {
      names.forEach((n) => { if (n) this._set.add(n); });
      this._syncToAttr();
    }
    remove(...names) {
      names.forEach((n) => this._set.delete(n));
      this._syncToAttr();
    }
    contains(n) {
      return this._set.has(n);
    }
    toggle(n, force) {
      const has = this._set.has(n);
      const next = force !== undefined ? !!force : !has;
      if (next) this._set.add(n);
      else this._set.delete(n);
      this._syncToAttr();
      return next;
    }
  }

  class MockEvent {
    constructor(type, opts = {}) {
      this.type = type;
      this.bubbles = !!opts.bubbles;
      this.cancelable = opts.cancelable !== false;
      this.key = opts.key || '';
      this.button = opts.button ?? 0;
      this.clientX = opts.clientX ?? 0;
      this.clientY = opts.clientY ?? 0;
      this.ctrlKey = !!opts.ctrlKey;
      this.metaKey = !!opts.metaKey;
      this.altKey = !!opts.altKey;
      this.shiftKey = !!opts.shiftKey;
      this.defaultPrevented = false;
      this._stopped = false;
      this._immediateStopped = false;
      this.target = null;
      this.currentTarget = null;
    }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this._stopped = true; }
    stopImmediatePropagation() { this._stopped = true; this._immediateStopped = true; }
  }

  class EventTargetNode {
    constructor() {
      this._listeners = [];
      this.parentNode = null;
      this.children = [];
    }
    addEventListener(type, fn, capture) {
      if (typeof fn !== 'function') return;
      this._listeners.push({ type, fn, capture: !!capture });
    }
    removeEventListener(type, fn, capture) {
      const cap = !!capture;
      this._listeners = this._listeners.filter((l) => !(l.type === type && l.fn === fn && l.capture === cap));
    }
    _invokeListeners(event, capture) {
      const list = this._listeners.slice();
      for (const l of list) {
        if (event._immediateStopped) break;
        if (l.type === event.type && l.capture === capture) {
          event.currentTarget = this;
          l.fn.call(this, event);
        }
      }
      if (!capture && typeof this['on' + event.type] === 'function' && !event._immediateStopped) {
        event.currentTarget = this;
        this['on' + event.type].call(this, event);
      }
    }
    dispatchEvent(event) {
      if (!event.target) event.target = this;
      const path = [];
      let cur = this;
      while (cur) {
        path.unshift(cur);
        cur = cur.parentNode;
      }
      if (path[0] !== win) {
        if (path[0] !== doc) path.unshift(doc);
        path.unshift(win);
      }
      for (let i = 0; i < path.length - 1; i++) {
        if (event._stopped) break;
        path[i]._invokeListeners(event, true);
      }
      if (!event._stopped) {
        this._invokeListeners(event, true);
        if (!event._stopped) this._invokeListeners(event, false);
      }
      if (event.bubbles && !event._stopped) {
        for (let i = path.length - 2; i >= 0; i--) {
          if (event._stopped) break;
          path[i]._invokeListeners(event, false);
        }
      }
      return !event.defaultPrevented;
    }
  }

  function matchesSimpleSelector(el, sel) {
    if (!el || !el.tagName) return false;
    sel = sel.trim();
    if (!sel) return false;
    // Handle attribute selector like input[type="color"]
    const attrRe = /\[([^=\]]+)(?:=["']?([^"'\]]*)["']?)?\]/g;
    let m;
    const attrs = [];
    while ((m = attrRe.exec(sel)) !== null) {
      attrs.push({ name: m[1], val: m[2] });
    }
    const clean = sel.replace(attrRe, '');
    const parts = clean.split('.').filter(Boolean);
    let tagPart = null;
    const classes = [];
    if (clean.startsWith('.')) {
      classes.push(...parts);
    } else if (parts.length) {
      tagPart = parts[0].toUpperCase();
      classes.push(...parts.slice(1));
    }
    if (tagPart && el.tagName !== tagPart) return false;
    for (const c of classes) {
      if (!el.classList.contains(c)) return false;
    }
    for (const a of attrs) {
      const actual = a.name === 'type' ? (el.type || el.getAttribute('type')) : el.getAttribute(a.name);
      if (a.val !== undefined) {
        if (String(actual || '') !== a.val) return false;
      } else if (actual == null) {
        return false;
      }
    }
    return true;
  }

  function matchesSelectorChain(el, selectorGroup) {
    const groups = selectorGroup.split(',').map((s) => s.trim()).filter(Boolean);
    for (const grp of groups) {
      const tokens = grp.split(/\s+/).filter(Boolean);
      if (!tokens.length) continue;
      if (!matchesSimpleSelector(el, tokens[tokens.length - 1])) continue;
      let cur = el.parentNode;
      let idx = tokens.length - 2;
      while (idx >= 0 && cur) {
        if (matchesSimpleSelector(cur, tokens[idx])) idx--;
        cur = cur.parentNode;
      }
      if (idx < 0) return true;
    }
    return false;
  }

  class MockElement extends EventTargetNode {
    constructor(tagName) {
      super();
      this.tagName = String(tagName || 'DIV').toUpperCase();
      this.nodeType = 1;
      this._className = '';
      this.classList = new ClassList(this);
      this.style = {
        setProperty(k, v) { this[k] = v; },
        removeProperty(k) { delete this[k]; }
      };
      this.dataset = {};
      this._attrs = {};
      this.value = '';
      this._textContent = '';
      this.innerHTML = '';
      this.disabled = false;
      this.type = this.tagName === 'INPUT' ? 'text' : '';
      this._rect = { left: 240, top: 440, right: 316, bottom: 464, width: 76, height: 24 };
    }
    get textContent() {
      if (this.children.length) {
        return this.children.map((c) => c.textContent).join('');
      }
      return this._textContent;
    }
    set textContent(v) {
      this.children = [];
      this._textContent = String(v ?? '');
    }
    get className() { return this._className; }
    set className(v) {
      this._className = String(v || '');
      this.classList._syncFromAttr(this._className);
    }
    get parentElement() {
      return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
    }
    get firstChild() {
      return this.children[0] || null;
    }
    get offsetParent() {
      return this.style.display === 'none' ? null : (this.parentElement || doc.body);
    }
    get offsetWidth() { return this._rect.width || 0; }
    get offsetHeight() { return this._rect.height || 0; }
    setAttribute(k, v) {
      const sv = String(v);
      this._attrs[k] = sv;
      if (k === 'class') this.className = sv;
      else if (k === 'id') this.id = sv;
      else if (k === 'type') this.type = sv;
      else if (k === 'value') this.value = sv;
      else if (k === 'title') this.title = sv;
    }
    getAttribute(k) {
      if (k === 'class') return this._className || null;
      if (k === 'type') return this.type || this._attrs.type || null;
      return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null;
    }
    removeAttribute(k) {
      delete this._attrs[k];
    }
    appendChild(child) {
      if (!child) return child;
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx >= 0) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }
    contains(target) {
      let cur = target;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentNode;
      }
      return false;
    }
    closest(sel) {
      let cur = this;
      while (cur && cur.nodeType === 1) {
        if (matchesSelectorChain(cur, sel)) return cur;
        cur = cur.parentNode;
      }
      return null;
    }
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const ch of node.children) {
          if (matchesSelectorChain(ch, sel)) out.push(ch);
          walk(ch);
        }
      };
      walk(this);
      return out;
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }
    getBoundingClientRect() {
      return { ...this._rect };
    }
    focus() {
      activeElement = this;
      this.dispatchEvent(new MockEvent('focus', { bubbles: false }));
    }
    blur() {
      if (activeElement === this) activeElement = null;
      this.dispatchEvent(new MockEvent('blur', { bubbles: false }));
    }
    select() {
      this._selected = true;
    }
    click() {
      const ev = new MockEvent('click', { bubbles: true, cancelable: true });
      this.dispatchEvent(ev);
    }
  }

  const win = new EventTargetNode();
  const doc = new EventTargetNode();
  doc.nodeType = 9;
  doc.parentNode = win;
  doc.documentElement = new MockElement('HTML');
  doc.documentElement.parentNode = doc;
  doc.body = new MockElement('BODY');
  doc.body.parentNode = doc.documentElement;
  doc.documentElement.children.push(doc.body);
  doc.readyState = 'complete';
  doc.createElement = (tag) => new MockElement(tag);
  doc.createElementNS = (_ns, tag) => new MockElement(tag);
  doc.createTextNode = (txt) => {
    const t = new MockElement('#TEXT');
    t.textContent = String(txt ?? '');
    return t;
  };
  doc.querySelectorAll = (sel) => doc.documentElement.querySelectorAll(sel);
  doc.querySelector = (sel) => doc.documentElement.querySelector(sel);
  doc.contains = (target) => doc.documentElement.contains(target);
  doc.getElementById = (id) => {
    const all = doc.documentElement.querySelectorAll('*');
    return all.find((n) => n.id === id) || null;
  };
  Object.defineProperty(doc, 'activeElement', {
    get() { return activeElement || doc.body; }
  });

  win.document = doc;
  doc.defaultView = win;
  win.window = win;
  win.Event = MockEvent;
  win.innerWidth = 320;
  win.innerHeight = 520;
  win.requestAnimationFrame = (fn) => fn();
  win.setTimeout = (fn) => { fn(); return 1; };
  win.clearTimeout = () => {};
  win.getComputedStyle = () => ({ getPropertyValue: () => '' });
  win.localStorage = {
    _data: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
    setItem(k, v) { this._data[k] = String(v); }
  };
  win.Rebound = {};

  const ctx = vm.createContext(win);
  const run = (relPath) => vm.runInContext(read(relPath), ctx, { filename: relPath });

  run('client/js/core/dom.js');
  run('client/js/core/store.js');
  run('client/js/core/registry.js');
  run('client/js/ui/controls.js');
  run('client/js/ui/modal.js');
  run('client/js/ui/color-picker.js');
  run('client/js/features/color.js');
  run('client/js/features/palette.js');

  return { win, doc, R: win.Rebound, MockEvent };
}

describe('CSS rules for color picker and text inputs', () => {
  it('enables user-select: text on input and textarea in base.css', () => {
    const baseCss = read('client/css/base.css');
    expect(baseCss).toMatch(/input,\s*textarea\s*\{[^}]*user-select:\s*text/s);
  });

  it('positions .rb-cp-pop as fixed with high z-index above modals and footers', () => {
    const compCss = read('client/css/components.css');
    expect(compCss).toMatch(/\.rb-cp-pop\s*\{[^}]*position:\s*fixed/s);
    expect(compCss).toMatch(/\.rb-cp-pop\s*\{[^}]*z-index:\s*1500/s);
  });
});

describe('R.ui.colorUtil & R.ui.colorPicker', () => {
  it('parses 6-digit, 3-digit, double-#, and whitespace-padded hex values', () => {
    const { R } = createDomEnv();
    const { hexToRgb, normHex, isValidHex } = R.ui.colorUtil;

    expect(hexToRgb('#1fa6e0')).toEqual([31, 166, 224]);
    expect(hexToRgb('1fa6e0')).toEqual([31, 166, 224]);
    expect(hexToRgb('##ff0088')).toEqual([255, 0, 136]);
    expect(hexToRgb('  #f00  ')).toEqual([255, 0, 0]);
    expect(hexToRgb('0f8')).toEqual([0, 255, 136]);
    expect(normHex(' #F0A ')).toBe('#ff00aa');
    expect(normHex('##1FA6E0')).toBe('#1fa6e0');
    expect(isValidHex('abc')).toBe(true);
    expect(isValidHex('zzzzzz')).toBe(false);
  });

  it('activates the popover on trigger click, clamps to viewport, and focuses hex input', () => {
    const { R, doc } = createDomEnv();
    const changes = [];
    const commits = [];
    const cp = R.ui.colorPicker({
      value: '#1fa6e0',
      onChange: (c) => changes.push(c.hex),
      onCommit: (c) => commits.push(c.hex)
    });
    doc.body.appendChild(cp.el);

    const trigger = cp.el.querySelector('.rb-cp-trigger');
    const swatch = cp.el.querySelector('.rb-cp-swatch');
    expect(cp.isOpen()).toBe(false);

    swatch.click();
    expect(cp.isOpen()).toBe(true);
    expect(cp.el.classList.contains('is-open')).toBe(true);
    expect(trigger.classList.contains('is-active')).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(cp.pop.parentNode).toBe(doc.body);
    expect(cp.pop.style.display).toBe('');

    // Viewport-clamped: trigger is at x=240..316, y=440..464 in 320x520 viewport
    const left = parseInt(cp.pop.style.left, 10);
    const top = parseInt(cp.pop.style.top, 10);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + 184).toBeLessThanOrEqual(320 - 8);
    expect(top).toBeLessThan(440);

    // Hex input in popover is focused and typing works
    const hexInput = cp.pop.querySelector('.rb-cp-hex');
    expect(doc.activeElement).toBe(hexInput);

    hexInput.value = '#ff0000';
    hexInput.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    expect(changes[changes.length - 1]).toBe('#ff0000');
    expect(cp.get().hex).toBe('#ff0000');

    // Typing 3-digit shorthand and pressing Enter commits and closes
    hexInput.value = '0f0';
    hexInput.dispatchEvent(new doc.defaultView.Event('keydown', { key: 'Enter', bubbles: true }));
    expect(cp.get().hex).toBe('#00ff00');
    expect(commits[commits.length - 1]).toBe('#00ff00');
    expect(cp.isOpen()).toBe(false);
  });

  it('supports typing directly into the inline trigger hex input (.rb-cp-hex-text)', () => {
    const { R, doc } = createDomEnv();
    const changes = [];
    const cp = R.ui.colorPicker({
      value: '#1fa6e0',
      onChange: (c) => changes.push(c.hex)
    });
    doc.body.appendChild(cp.el);

    const inlineHex = cp.el.querySelector('input.rb-cp-hex-text');
    expect(inlineHex).toBeTruthy();
    inlineHex.focus();
    inlineHex.value = '##ff8800';
    inlineHex.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    expect(cp.get().hex).toBe('#ff8800');
    expect(changes[changes.length - 1]).toBe('#ff8800');
  });

  it('handles mousedown drag on SV and Hue strips and updates hex input even when focused', () => {
    const { R, doc, MockEvent } = createDomEnv();
    const cp = R.ui.colorPicker({ value: '#1fa6e0' });
    doc.body.appendChild(cp.el);
    cp.open();

    const sv = cp.pop.querySelector('.rb-cp-sv');
    sv._rect = { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 };
    const hexInput = cp.pop.querySelector('.rb-cp-hex');
    hexInput.focus();

    sv.dispatchEvent(new MockEvent('mousedown', { clientX: 100, clientY: 0, button: 0, bubbles: true }));
    doc.defaultView.dispatchEvent(new MockEvent('mouseup', { clientX: 100, clientY: 0, button: 0 }));

    expect(hexInput.value).toBe(cp.get().hex);
    expect(cp.get().hex).not.toContain('NaN');
  });

  it('intercepts clicks on native <input type="color"> and opens the custom color popover', () => {
    const { R, doc } = createDomEnv();
    const inp = R.dom.el('input.rb-color-input', { type: 'color', value: '#4990e2' });
    doc.body.appendChild(inp);

    let inputFired = 0;
    let changeFired = 0;
    inp.addEventListener('input', () => { inputFired++; });
    inp.addEventListener('change', () => { changeFired++; });

    inp.click();
    expect(inp.classList.contains('is-active')).toBe(true);

    // Find the shared popover in document.body
    const pop = doc.body.querySelector('.rb-cp-pop');
    expect(pop).toBeTruthy();
    expect(pop.style.display).toBe('');

    const popHex = pop.querySelector('.rb-cp-hex');
    popHex.value = '#e5534b';
    popHex.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    expect(inp.value).toBe('#e5534b');
    expect(inputFired).toBeGreaterThan(0);

    popHex.dispatchEvent(new doc.defaultView.Event('keydown', { key: 'Enter', bubbles: true }));
    expect(changeFired).toBeGreaterThan(0);
    expect(inp.classList.contains('is-active')).toBe(false);
  });
});

describe('Color tool and Palette tool', () => {
  it('Color tool preserves exact hex RGB, enables swatches without selection, and provides footer Apply', () => {
    const { R, doc } = createDomEnv();
    const colorTool = R.tools.get('color');
    const body = R.dom.el('div');
    const footer = R.dom.el('div.rb-action-bar');
    doc.body.appendChild(body);
    doc.body.appendChild(footer);

    const invoked = [];
    let sel = { hasComp: true, selectedLayerCount: 1 };
    const handle = colorTool.mount({
      body,
      footer,
      getSelection: () => sel,
      onSelection: () => () => {},
      refreshSelection: () => {},
      toast: () => {},
      invoke: (method, args) => {
        invoked.push({ method, args });
        return Promise.resolve({ colored: 1 });
      }
    });

    const primaryBtn = footer.querySelector('.rb-btn.is-primary');
    expect(primaryBtn).toBeTruthy();
    expect(primaryBtn.textContent).toBe('Apply');

    const inlineHex = body.querySelector('input.rb-cp-hex-text');
    expect(inlineHex.value).toBe('#1fa6e0');

    // Type a hex color and click Apply
    inlineHex.value = '#ff3366';
    inlineHex.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    primaryBtn.click();

    expect(invoked.length).toBe(1);
    expect(invoked[0].method).toBe('color.apply');
    expect(invoked[0].args.rgb[0]).toBeCloseTo(1, 3);
    expect(invoked[0].args.rgb[1]).toBeCloseTo(0x33 / 255, 3);
    expect(invoked[0].args.rgb[2]).toBeCloseTo(0x66 / 255, 3);

    handle.destroy();
  });

  it('Palette tool allows typing hex in open card detail and creating palettes in modal', () => {
    const { R, doc } = createDomEnv();
    R.disk = {
      _store: {},
      read(k, d) { return this._store[k] || d; },
      write(k, v) { this._store[k] = v; }
    };

    const paletteTool = R.tools.get('palette');
    const body = R.dom.el('div');
    const footer = R.dom.el('div.rb-action-bar');
    doc.body.appendChild(body);
    doc.body.appendChild(footer);

    paletteTool.mount({
      body,
      footer,
      getSelection: () => ({ hasComp: true, selectedLayerCount: 1 }),
      onSelection: () => () => {},
      refreshSelection: () => {},
      toast: () => {},
      invoke: () => Promise.resolve({ colored: 1 })
    });

    // Open the first palette card
    const firstFoot = body.querySelector('.rb-palette-foot');
    firstFoot.click();

    const detailHex = body.querySelector('input.rb-detail-hex');
    expect(detailHex).toBeTruthy();
    detailHex.value = '#123456';
    detailHex.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    detailHex.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
    expect(detailHex.value).toBe('#123456');

    // Clicking New palette opens modal where Create works even without typing a Name
    const newBtn = body.querySelector('.rb-palette-new');
    newBtn.click();

    const modal = doc.body.querySelector('.rb-modal-save');
    expect(modal).toBeTruthy();
    const rowInputs = modal.querySelectorAll('.rb-palette-edit-row input.rb-savedlg-input');
    expect(rowInputs.length).toBe(5);

    rowInputs[0].value = '##f00';
    rowInputs[0].dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    rowInputs[0].dispatchEvent(new doc.defaultView.Event('blur', { bubbles: false }));
    expect(rowInputs[0].value).toBe('#ff0000');

    const saveBtn = modal.querySelector('.rb-btn.is-primary');
    expect(saveBtn.disabled).toBe(false);
    saveBtn.click();

    expect(R.disk._store.palettes.items.length).toBe(1);
    expect(R.disk._store.palettes.items[0].name).toBe('Palette 1');
    expect(R.disk._store.palettes.items[0].colors[0]).toBe('#ff0000');
  });
});
