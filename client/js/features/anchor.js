/*
 * Rebound, Anchor tool.
 * A playful, tactile anchor-point picker. Instead of an abstract dotted box you
 * place a pin on a proxy of YOUR layer: the card shows the selected layer's kind,
 * name and (for solids) colour, nine handles sit on its corners / edges / centre,
 * and a ghost of the card gently pivots around the chosen point so you can SEE
 * that the anchor is the rotation / scale origin. Drag anywhere to place it
 * freely (even just outside the layer); it snaps to the nine points. The layer
 * never moves, the host compensates Position. Plus center-in-comp helpers.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  var POINTS = [
    [0, 0], [0.5, 0], [1, 0],
    [0, 0.5], [0.5, 0.5], [1, 0.5],
    [0, 1], [0.5, 1], [1, 1]
  ];
  // Fraction of the scene the card is inset by on each side. Mirrors the CSS
  // `inset` on .rb-anchor-card / .rb-anchor-ghost so drag math maps to the card.
  var PAD = 0.17;
  // How far past the layer edge you may pull the anchor (AE allows this).
  var OVERHANG = 0.35;

  var KIND_LABEL = {
    shape: 'Shape', text: 'Text', solid: 'Solid', 'null': 'Null',
    adjustment: 'Adjustment', camera: 'Camera', light: 'Light',
    precomp: 'Precomp', footage: 'Footage', still: 'Still', audio: 'Audio',
    av: 'Layer'
  };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // A small line glyph per layer kind, so the proxy card reads as a real layer.
  function kindGlyph(kind) {
    var P = {
      text: '<path d="M4 6h16M12 6v13M9 19h6"/>',
      shape: '<path d="M12 3l8 5v8l-8 5-8-5V8z"/>',
      solid: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
      'null': '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M5 5l14 14M19 5L5 19"/>',
      adjustment: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16"/>',
      camera: '<path d="M3 8h4l2-2h6l2 2h4v11H3z"/><circle cx="12" cy="13" r="3.2"/>',
      light: '<circle cx="12" cy="10" r="5"/><path d="M9 19h6M10 21h4"/>',
      precomp: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 5v14"/>',
      audio: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10v4"/>',
      image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.8"/><path d="M3 17l5-5 4 4 3-3 6 6"/>'
    };
    var inner = P[kind] || (kind === 'still' || kind === 'footage' ? P.image : P.image);
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }

  R.tools.register({
    id: 'anchor',
    title: 'Anchor',
    group: 'Transform',
    order: 0,
    keywords: ['anchor', 'anchor point', 'pivot', 'center', 'origin'],
    mount: mountAnchor,
    commands: [
      { id: 'center', title: 'Center anchor', run: function (ctx) { move(ctx, 0.5, 0.5); } }
    ]
  });

  function mountAnchor(ctx) {
    var target = { x: 0.5, y: 0.5 };
    var extents = false;

    // --- Scene: a proxy layer card you place a pin on -----------------------
    var box = el('div.rb-anchor-box');
    var ghost = el('div.rb-anchor-ghost');   // pivots around the anchor (demo)
    var card = el('div.rb-anchor-card');
    var grid = el('div.rb-anchor-grid');
    var glyph = el('div.rb-anchor-glyph');
    var nameEl = el('div.rb-anchor-name', { text: '' });
    var face = el('div.rb-anchor-face', null, [glyph, nameEl]);
    card.appendChild(grid);
    card.appendChild(face);
    box.appendChild(ghost);
    box.appendChild(card);

    var dots = POINTS.map(function (pt) {
      var d = el('button.rb-anchor-dot', {
        style: { left: (pt[0] * 100) + '%', top: (pt[1] * 100) + '%' },
        title: labelFor(pt), 'aria-label': labelFor(pt)
      });
      d.addEventListener('pointerdown', function (e) {
        e.stopPropagation(); e.preventDefault();
        setTarget(pt[0], pt[1]); move(ctx, pt[0], pt[1], extents);
      });
      card.appendChild(d);
      return d;
    });

    var pin = el('div.rb-anchor-pin');
    card.appendChild(pin);

    var readout = el('div.rb-anchor-readout', { text: '' });

    function place() {
      pin.style.left = (target.x * 100) + '%';
      pin.style.top = (target.y * 100) + '%';
      // Pivot the ghost around the live anchor so the pivot is unmistakable.
      ghost.style.transformOrigin = (target.x * 100) + '% ' + (target.y * 100) + '%';
      for (var i = 0; i < POINTS.length; i++) {
        dots[i].classList.toggle('is-active', POINTS[i][0] === target.x && POINTS[i][1] === target.y);
      }
      var off = target.x < 0 || target.x > 1 || target.y < 0 || target.y > 1;
      pin.classList.toggle('is-outside', off);
      var named = labelExact();
      readout.textContent = 'Anchor  ' + Math.round(target.x * 100) + '%  ·  ' + Math.round(target.y * 100) + '%' +
        (named ? '   ' + named : off ? '   outside layer' : '');
    }
    function setTarget(x, y) { target.x = x; target.y = y; place(); }
    function labelExact() {
      for (var i = 0; i < POINTS.length; i++) { if (POINTS[i][0] === target.x && POINTS[i][1] === target.y) return labelFor(POINTS[i]); }
      return '';
    }

    // Drag anywhere in the scene to place the anchor freely; coordinates are in
    // the card's (layer) space, so the padding lets you pull just outside it.
    // Snaps near any of the nine points.
    box.addEventListener('pointerdown', function (e) {
      function setFromEvent(ev) {
        var r = card.getBoundingClientRect();
        var x = clamp((ev.clientX - r.left) / (r.width || 1), -OVERHANG, 1 + OVERHANG);
        var y = clamp((ev.clientY - r.top) / (r.height || 1), -OVERHANG, 1 + OVERHANG);
        for (var i = 0; i < POINTS.length; i++) {
          if (Math.abs(x - POINTS[i][0]) < 0.06 && Math.abs(y - POINTS[i][1]) < 0.06) { x = POINTS[i][0]; y = POINTS[i][1]; }
        }
        target.x = x; target.y = y; place();
      }
      box.classList.add('is-dragging');
      setFromEvent(e);
      function mv(ev) { setFromEvent(ev); }
      function up() {
        document.removeEventListener('pointermove', mv);
        document.removeEventListener('pointerup', up);
        box.classList.remove('is-dragging');
        move(ctx, target.x, target.y, extents);
      }
      document.addEventListener('pointermove', mv);
      document.addEventListener('pointerup', up);
    });

    var extentsToggle = ui.toggle({ label: 'Include masks & effects', value: extents,
      title: 'Use the bounds grown to include masks, strokes, and effects, instead of the raw layer geometry.',
      onChange: function (v) { extents = v; } });

    var centerRow = el('div.rb-row', null, [
      el('button.rb-btn', { onclick: function () { centerInComp(ctx, true, true); } }, ['Center in comp']),
      el('button.rb-btn.is-ghost', { onclick: function () { centerInComp(ctx, true, false); } }, ['X only']),
      el('button.rb-btn.is-ghost', { onclick: function () { centerInComp(ctx, false, true); } }, ['Y only'])
    ]);

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-section-label', { text: 'Anchor point' }),
      el('div.rb-faint', { text: 'Tap a handle or drag anywhere on the layer to place the anchor. The layer stays put, Position is compensated. The faint card shows where it pivots.' }),
      el('div.rb-anchor-stage', null, [box]),
      readout,
      extentsToggle.el,
      el('div.rb-section-label', { text: 'Center layer in composition' }),
      centerRow
    ]));

    place();
    paintFace(ctx.getSelection());

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); paintFace(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    // Paint the proxy card so it reads as the actual selected layer.
    function paintFace(sel) {
      card.classList.remove('is-empty', 'is-multi');
      card.style.removeProperty('--rb-anchor-tint');
      var layers = (sel && sel.layers) || [];
      if (!sel || !sel.hasComp || !sel.selectedLayerCount) {
        card.classList.add('is-empty');
        glyph.innerHTML = kindGlyph('image');
        nameEl.textContent = sel && sel.hasComp ? 'Select a layer' : 'Open a composition';
        return;
      }
      if (sel.selectedLayerCount > 1) {
        card.classList.add('is-multi');
        glyph.innerHTML = kindGlyph('precomp');
        nameEl.textContent = sel.selectedLayerCount + ' layers';
        return;
      }
      var L = layers[0] || {};
      var kind = L.kind || sel.layerKind || 'av';
      glyph.innerHTML = kindGlyph(kind);
      nameEl.textContent = L.name || (KIND_LABEL[kind] || 'Layer');
      var col = L.kindState && L.kindState.color;
      if (kind === 'solid' && col && col.length >= 3) {
        card.style.setProperty('--rb-anchor-tint',
          'rgb(' + Math.round(col[0] * 255) + ',' + Math.round(col[1] * 255) + ',' + Math.round(col[2] * 255) + ')');
      }
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select one or more layers';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }

  function labelFor(pt) {
    var ny = pt[1] === 0 ? 'Top' : pt[1] === 1 ? 'Bottom' : 'Middle';
    var nx = pt[0] === 0 ? 'Left' : pt[0] === 1 ? 'Right' : 'Center';
    return ny + ' ' + nx;
  }

  function move(ctx, gx, gy, extents) {
    ctx.invoke('anchor.move', { gx: gx, gy: gy, extents: !!extents })
      .then(function (res) {
        var msg = 'Moved anchor on ' + res.moved + ' layer' + (res.moved === 1 ? '' : 's');
        if (res.skipped && res.skipped.length) {
          ctx.toast(msg + ' · skipped ' + res.skipped.length, { kind: 'info', action: 'why?', onAction: function () {
            ctx.toast('Skipped: ' + res.skipped.join(', '), { kind: 'info', duration: 6000 });
          } });
        } else {
          ctx.toast(msg, { kind: 'success' });
        }
        ctx.refreshSelection();
      })
      .catch(function (err) { ctx.toast(err.message || 'Could not move anchor', { kind: 'error' }); });
  }

  function centerInComp(ctx, x, y) {
    ctx.invoke('anchor.centerInComp', { x: x, y: y })
      .then(function (res) { ctx.toast('Centered ' + res.moved + ' layer' + (res.moved === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
      .catch(function (err) { ctx.toast(err.message || 'Could not center', { kind: 'error' }); });
  }
})(window.Rebound = window.Rebound || {});
