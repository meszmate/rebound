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

  function invert2x3(m) {
    var a = m[0][0], b = m[0][1], c = m[0][2], d = m[1][0], e = m[1][1], f = m[1][2];
    var det = a * e - b * d;
    if (!det) return null;
    var ia = e / det, ib = -b / det, id = -d / det, ie = a / det;
    return [[ia, ib, -(ia * c + ib * f)], [id, ie, -(id * c + ie * f)]];
  }
  function applyAffine(m, x, y) {
    return [x * m[0][0] + y * m[0][1] + m[0][2], x * m[1][0] + y * m[1][1] + m[1][2]];
  }

  // The Plugin API gives a gradient's geometry as gradientTransform (a 2x3 affine
  // from object space into the unit gradient square), NOT gradientHandlePositions
  // (that is REST-API only and is undefined here, which is why every gradient used
  // to fall back to a flat horizontal ramp). Invert the transform to recover the
  // gradient axis in normalised object space, then scale to node-local px. Linear
  // runs (0,0.5)->(1,0.5); radial hands the importer the centre (0.5,0.5) and an
  // edge (1,0.5) so it positions the radial instead of defaulting to the corner.
  // Radial/diamond also return a THIRD handle (the other axis edge, 0.5,1) so the
  // host can size the radial to the larger axis instead of assuming a circle.
  function gradientHandles(p, w, h) {
    var t = p.gradientTransform;
    if (!t || !t.length || !t[0]) return [];
    var inv = invert2x3(t);
    if (!inv) return [];
    var radial = (p.type === 'GRADIENT_RADIAL' || p.type === 'GRADIENT_DIAMOND');
    var s = applyAffine(inv, radial ? 0.5 : 0, 0.5);
    var e = applyAffine(inv, 1, 0.5);
    if (radial) {
      var p2 = applyAffine(inv, 0.5, 1);
      return [[s[0] * w, s[1] * h], [e[0] * w, e[1] * h], [p2[0] * w, p2[1] * h]];
    }
    return [[s[0] * w, s[1] * h], [e[0] * w, e[1] * h]];
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
      return { type: p.type, stops: stops, gradientHandles: gradientHandles(p, w, h), opacity: (p.opacity == null ? 1 : p.opacity), visible: p.visible !== false };
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

  // Per-side stroke weights differ (Figma dividers, input underlines, table cells):
  // strokeWeight then reads as figma.mixed. AE shape strokes have no per-side weight,
  // so a node carrying these is rasterised (see nodeToIR) for a pixel-exact result;
  // here we just detect the condition.
  function hasPerSideStroke(node) {
    if (typeof node.strokeTopWeight !== 'number') return false;
    var t = node.strokeTopWeight, r = node.strokeRightWeight, b = node.strokeBottomWeight, l = node.strokeLeftWeight;
    return !(t === r && r === b && b === l);
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
    if (typeof node.strokeDashOffset === 'number') stroke.dashOffset = node.strokeDashOffset;
    return stroke;
  }

  function mapEffects(effects) {
    var out = [];
    if (!effects) return out;
    for (var i = 0; i < effects.length; i++) {
      var e = effects[i];
      if (e.visible === false) continue;
      if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
        var sh = {
          type: e.type,
          color: { r: e.color.r, g: e.color.g, b: e.color.b, a: (e.color.a == null ? 1 : e.color.a) },
          offset: [e.offset.x, e.offset.y],
          radius: e.radius,
          spread: e.spread || 0,
          visible: true
        };
        // The shadow's own blend mode (the importer maps it to the layer-style
        // mode2 ordinal). Figma's default is the literal string 'NORMAL'.
        if (e.blendMode && e.blendMode !== 'NORMAL') sh.blendMode = e.blendMode;
        // Drop-shadow knockout: hide the shadow behind a (semi-)transparent node.
        if (e.type === 'DROP_SHADOW' && typeof e.showShadowBehindNode === 'boolean') sh.showShadowBehindNode = e.showShadowBehindNode;
        out.push(sh);
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

  // Map Figma's booleanOperation to the host's merge-paths enum (same names). An
  // unknown/absent value defaults to UNION so the host always has a valid op.
  function mapBoolOp(op) {
    switch (op) {
      case 'UNION': return 'UNION';
      case 'SUBTRACT': return 'SUBTRACT';
      case 'INTERSECT': return 'INTERSECT';
      case 'EXCLUDE': return 'EXCLUDE';
      default: return 'UNION';
    }
  }

  function mapLineHeight(lh) {
    if (!lh) return undefined;
    if (lh.unit === 'AUTO') return { unit: 'AUTO' };
    return { unit: lh.unit, value: lh.value };
  }

  // Collapse a font family/style into a PostScript-name fragment (strip spaces),
  // e.g. {family:'Inter', style:'Bold'} -> 'Inter-Bold'. The host prefers a real
  // postScriptName when matching AE fonts; this synthetic guess is a strong hint
  // when Figma exposes no canonical name.
  function collapse(s) {
    return (s == null ? '' : String(s)).replace(/\s+/g, '');
  }
  function psName(fontName) {
    if (!fontName || fontName === figma.mixed) return undefined;
    return collapse(fontName.family) + '-' + collapse(fontName.style);
  }

  function mapText(node) {
    var runs = [];
    try {
      var segs = node.getStyledTextSegments(['fontName', 'fontWeight', 'fontSize', 'fills', 'letterSpacing', 'lineHeight', 'textCase', 'textDecoration']);
      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        runs.push({
          start: s.start,
          end: s.end,
          characters: s.characters,
          fontFamily: s.fontName ? s.fontName.family : undefined,
          fontStyle: s.fontName ? s.fontName.style : undefined,
          fontWeight: s.fontWeight,
          postScriptName: s.fontName ? psName(s.fontName) : undefined,
          fontSize: s.fontSize,
          fills: mapFills(s.fills, node.width, node.height),
          tracking: N.trackingFromLetterSpacing(s.letterSpacing, s.fontSize),
          lineHeight: mapLineHeight(s.lineHeight),
          textCase: s.textCase,
          textDecoration: s.textDecoration
        });
      }
    } catch (e) {
      // Resilient fallback: keep the font even when getStyledTextSegments throws
      // (e.g. mixed/unavailable). Read node-level fontName (guarding figma.mixed)
      // so weight/family/PostScript name survive; size only when it is a number.
      var fn = (node.fontName && node.fontName !== figma.mixed) ? node.fontName : null;
      var run = {
        start: 0,
        end: node.characters.length,
        characters: node.characters,
        fontFamily: fn ? fn.family : undefined,
        fontStyle: fn ? fn.style : undefined,
        postScriptName: psName(node.fontName)
      };
      if (typeof node.fontSize === 'number') run.fontSize = node.fontSize;
      runs.push(run);
    }
    var text = {
      characters: node.characters,
      runs: runs,
      textAlignHorizontal: node.textAlignHorizontal,
      textAlignVertical: node.textAlignVertical,
      autoResize: node.textAutoResize,
      paragraphSpacing: node.paragraphSpacing,
      boxSize: [node.width, node.height]
    };
    // First-line indent: fires the host's paragraphIndent path.
    if ('paragraphIndent' in node) text.paragraphIndent = node.paragraphIndent;
    return text;
  }

  function findImagePaint(fills) {
    if (!fills || fills === figma.mixed) return null;
    for (var i = 0; i < fills.length; i++) {
      if (fills[i] && fills[i].type === 'IMAGE' && fills[i].visible !== false) return fills[i];
    }
    return null;
  }

  // A TILE (pattern) image paint repeats the source bitmap. Figma sizes each tile
  // via the paint's scalingFactor (a multiplier on the image's natural size) and,
  // on newer files, an imageTransform whose diagonal carries the per-axis scale.
  // Recover a tile scale (>0) so the host can drive the native "ADBE Tile"
  // (Motion Tile) effect; absent any hint, fall back to 1 (image natural size).
  function tileMeta(paint) {
    var meta = { scaleMode: 'TILE', tileScale: 1 };
    if (typeof paint.scalingFactor === 'number' && paint.scalingFactor > 0) {
      meta.tileScale = paint.scalingFactor;
    }
    var t = paint.imageTransform;
    if (t && t.length && t[0] && t[1]) {
      var sx = Math.sqrt(t[0][0] * t[0][0] + t[1][0] * t[1][0]);
      var sy = Math.sqrt(t[0][1] * t[0][1] + t[1][1] * t[1][1]);
      if (sx > 0) meta.tileWidthScale = sx;
      if (sy > 0) meta.tileHeightScale = sy;
    }
    return meta;
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

  // Fills with no faithful editable AE rebuild. Linear & radial gradients (any
  // stop count, up to AE's 8-stop ceiling) are rebuilt as TRUE native gradients by
  // the host (via the .ffx preset trick), so they are NOT rasterised here. Angular
  // (conic) and diamond gradients are ALSO rebuilt natively now: angular ramps
  // through a horizontal native G-Fill gradient + an "ADBE Polar Coordinates"
  // (Rect to Polar) effect; diamond builds a native vector gradient. They flow to
  // the host as GRADIENT_ANGULAR / GRADIENT_DIAMOND paints, so they are no longer
  // rasterised here. Only PATTERN fills (which are not IMAGE paints) have no
  // editable rebuild and stay rasterised for a pixel-exact result.
  function hasUnreproducibleFill(node) {
    var fills = node.fills;
    if (!fills || fills === figma.mixed) return false;
    for (var i = 0; i < fills.length; i++) {
      var f = fills[i];
      if (!f || f.visible === false) continue;
      if (f.type === 'PATTERN') return true;
    }
    return false;
  }

  // A fill or stroke paint with its own non-Normal blend mode has no faithful AE
  // shape equivalent (shape blend modes do not map 1:1), so rasterise the node.
  function hasBlendedPaint(node) {
    var lists = [node.fills, node.strokes];
    for (var l = 0; l < lists.length; l++) {
      var arr = lists[l];
      if (!arr || arr === figma.mixed) continue;
      for (var i = 0; i < arr.length; i++) {
        var p = arr[i];
        if (p && p.visible !== false && p.blendMode && p.blendMode !== 'NORMAL') return true;
      }
    }
    return false;
  }

  // A sheared/skewed node has a non-trivial off-diagonal in its 2x2. AE 2D layers
  // carry rotation + scale but cannot skew, so a sheared shape is rasterised for a
  // pixel-exact result. Decompose via the shared QR helper (skew in radians) and
  // require the skew angle to clear a small epsilon so a tiny numerical skew (from
  // an otherwise pure rotation/scale) does NOT trip the gate.
  function hasShear(node) {
    var m = node.absoluteTransform;
    if (!m || !m.length || !m[0]) return false;
    // absoluteTransform is [[a,c,e],[b,d,f]]; flatten to [a,b,c,d,e,f] for decompose.
    var dec = N.decomposeMatrix([m[0][0], m[1][0], m[0][1], m[1][1], m[0][2], m[1][2]]);
    return Math.abs(dec.skew) > 0.0017; // ~0.1deg
  }

  // Effects After Effects cannot rebuild as a layer style or a Gaussian blur:
  // the newer Figma Draw / 2024-2025 effects (noise, texture, glass, progressive
  // blur, and anything added later). Anything unknown counts, so a future Figma
  // effect rasterises (pixel-exact) instead of silently vanishing. Shadows and a
  // plain layer/background blur are rebuilt natively, so they do not count.
  function hasUnreproducibleEffect(node) {
    var fx = node.effects;
    if (!fx || fx === figma.mixed) return false;
    for (var i = 0; i < fx.length; i++) {
      var e = fx[i];
      if (!e || e.visible === false) continue;
      var t = e.type;
      if (t === 'DROP_SHADOW' || t === 'INNER_SHADOW') continue;
      if (t === 'LAYER_BLUR' || t === 'BACKGROUND_BLUR') {
        if (e.blurType === 'PROGRESSIVE') return true; // no native AE progressive blur
        continue;
      }
      return true; // NOISE / TEXTURE / GLASS / SHADER / future effects
    }
    return false;
  }

  // A Figma image paint with non-default photo adjustments (exposure, contrast,
  // saturation, temperature, tint, highlights, shadows). exportAsync bakes these
  // exactly, so an adjusted image is rasterised rather than placed raw.
  function imageHasFilters(paint) {
    var f = paint && paint.filters;
    if (!f) return false;
    var keys = ['exposure', 'contrast', 'saturation', 'temperature', 'tint', 'highlights', 'shadows'];
    for (var i = 0; i < keys.length; i++) {
      var v = f[keys[i]];
      if (typeof v === 'number' && (v > 0.001 || v < -0.001)) return true;
    }
    return false;
  }

  // Decide whether an image-filled node must be rasterised to look exact, rather
  // than placed as live footage. The importer can reproduce FIT (uniform contain),
  // an aspect-matched FILL (uniform stretch == the box), and TILE (a repeating
  // pattern, rebuilt with the native "ADBE Tile" Motion-Tile effect). Everything
  // else is wrong as live footage:
  //   - CROP uses a custom crop matrix (imageTransform) AE cannot rebuild,
  //   - a rotated image paint (rotation 90/180/270) would not be rotated,
  //   - FILL with a mismatched aspect is COVER (uniform scale + centre-crop), but
  //     the importer would stretch it and distort the picture.
  // exportAsync bakes whatever Figma actually shows, so rasterising these is
  // pixel-exact. Async because the cover check needs the image's natural size.
  // NOTE: TILE is handled structurally (see tileMeta / nodeToIR), not rasterised.
  async function imageNeedsRaster(node, paint) {
    var mode = paint.scaleMode || 'FILL';
    if (mode === 'CROP') return true;
    if (paint.rotation) return true;
    if (mode === 'FILL') {
      try {
        var img = figma.getImageByHash(paint.imageHash);
        var size = await img.getSizeAsync();
        if (size && size.width && size.height && node.width && node.height) {
          var imgA = size.width / size.height;
          var boxA = node.width / node.height;
          if (Math.abs(imgA - boxA) > 0.01) return true;
        }
      } catch (e) { /* size unknown: leave as live footage */ }
    }
    return false;
  }

  // An image-filled node whose silhouette is NOT a plain rectangle (a circular or
  // shaped avatar, a vector/boolean clip) OR which has rounded corners would lose
  // its outline if placed as a plain rectangular footage layer. Rasterising the
  // whole node bakes the exact silhouette, at the cost of footage editability.
  function imageNeedsSilhouetteRaster(node) {
    var t = node.type;
    if (t === 'ELLIPSE' || t === 'VECTOR' || t === 'POLYGON' || t === 'STAR' || t === 'BOOLEAN_OPERATION') return true;
    var c = mapCorners(node);
    if (c && (c.topLeft > 0 || c.topRight > 0 || c.bottomRight > 0 || c.bottomLeft > 0)) return true;
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
    var base = {
      id: node.id,
      name: node.name,
      type: 'GROUP',
      visible: node.visible !== false,
      opacity: (node.opacity == null ? 1 : node.opacity),
      blendMode: node.blendMode || 'PASS_THROUGH',
      isMask: node.isMask || false,
      transform: { x: m[4], y: m[5], width: node.width, height: node.height, rotation: node.rotation || 0, matrix: m }
    };
    // Luminance masks become a luma track matte; alpha / geometry / outline masks
    // all become an alpha track matte (the shape silhouette).
    if (node.isMask) base.maskType = (node.maskType === 'LUMINANCE') ? 'LUMA' : 'ALPHA';
    return base;
  }

  // A Figma mask masks every following sibling (children are ordered bottom -> top)
  // until the next mask. Record the masked ids so the importer can wire one track
  // matte per target. Run once per sibling list (each parent / frame / selection).
  function assignMaskTargets(siblings) {
    for (var i = 0; i < siblings.length; i++) {
      var m = siblings[i];
      if (!m || !m.isMask) continue;
      var targets = [];
      for (var j = i + 1; j < siblings.length; j++) {
        if (siblings[j] && siblings[j].isMask) break; // the next mask starts a new group
        if (siblings[j] && siblings[j].visible !== false) targets.push(siblings[j].id);
      }
      if (targets.length) {
        m.maskTargetId = targets[0];
        if (targets.length > 1) m.maskTargetIds = targets;
      }
    }
  }

  async function childrenToIR(node, origin, assets) {
    var out = [];
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) {
      var ir = await nodeToIR(kids[i], origin, assets);
      if (ir) out.push(ir);
    }
    assignMaskTargets(out);
    return out;
  }

  async function nodeToIR(node, origin, assets) {
    var base = baseFields(node, origin);
    var w = node.width, h = node.height;

    // Image-filled LEAF shapes become IMAGE nodes (the common placed-image case);
    // a container with an image fill must still recurse into its children. An
    // adjusted image (photo filters) or one carrying an unreproducible effect is
    // rasterised so the look is exact.
    var imgPaint = findImagePaint(node.fills);
    if (imgPaint && (!node.children || !node.children.length)) {
      // A non-rectangular / rounded silhouette (circular avatar, vector/boolean
      // clip) must be rasterised so its outline is exact; the FILL/FIT/TILE live-
      // footage path below only stays for plain rectangles with no rounding. This
      // trades footage editability for a pixel-exact silhouette.
      if (node.type !== 'TEXT' && (imageHasFilters(imgPaint) || hasUnreproducibleEffect(node) || imageNeedsSilhouetteRaster(node) || await imageNeedsRaster(node, imgPaint))) {
        var rfilt = await rasterizeNodeToImage(node, base, assets);
        if (rfilt) return rfilt;
      }
      await addImageAsset(imgPaint, assets);
      base.type = 'IMAGE';
      base.imageHash = imgPaint.imageHash;
      base.scaleMode = imgPaint.scaleMode || 'FILL';
      // A TILE (pattern) paint stays a live IMAGE carrying the tile size/scale, so
      // the host repeats it with the native "ADBE Tile" effect instead of baking
      // the whole shape to a PNG.
      if (base.scaleMode === 'TILE') {
        var tm = tileMeta(imgPaint);
        base.tileScale = tm.tileScale;
        if (tm.tileWidthScale != null) base.tileWidthScale = tm.tileWidthScale;
        if (tm.tileHeightScale != null) base.tileHeightScale = tm.tileHeightScale;
      }
      base.effects = mapEffects(node.effects);
      return base;
    }

    // Angular/diamond gradients and pattern fills have no AE shape equivalent;
    // noise / texture / glass / progressive-blur effects have no native rebuild;
    // per-side stroke weights and per-paint blend modes have no shape equivalent;
    // a sheared/skewed node cannot be reproduced by an AE 2D transform.
    // Rasterise the node so it is pixel-exact rather than dropped or approximated.
    if (node.type !== 'TEXT' && (hasUnreproducibleFill(node) || hasUnreproducibleEffect(node) || hasPerSideStroke(node) || hasBlendedPaint(node) || hasShear(node))) {
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
        // Arc / pie / ring (Figma arcData). A non-default sweep or inner radius
        // has no parametric AE ellipse; carry the exact rendered outline as paths
        // so the importer rebuilds the pie/ring faithfully, plus the arc metadata.
        var ad = node.arcData;
        if (ad && (ad.startingAngle !== 0 || ad.endingAngle < 6.2825 || ad.innerRadius > 0)) {
          base.primitive.ellipse.arc = {
            startAngle: ad.startingAngle * 180 / Math.PI,
            endAngle: ad.endingAngle * 180 / Math.PI,
            innerRadius: ad.innerRadius
          };
          if (node.fillGeometry && node.fillGeometry.length) base.paths = mapPaths(node);
        }
        break;
      case 'LINE':
        base.type = 'LINE';
        base.paths = [{ vertices: [{ x: 0, y: 0, inTangent: [0, 0], outTangent: [0, 0] }, { x: w, y: 0, inTangent: [0, 0], outTangent: [0, 0] }], closed: false }];
        base.stroke = mapStroke(node);
        break;
      case 'POLYGON':
      case 'STAR':
        base.type = node.type;
        base.paths = mapPaths(node); // always keep the baked outline as the fallback
        base.fills = mapFills(node.fills, w, h);
        base.stroke = mapStroke(node);
        // An editable native Polystar is inscribed in a CIRCLE and has no per-point
        // corner radius, so it only matches when the box is ~square AND there is no
        // corner rounding; otherwise keep ONLY the exact baked paths above.
        if (Math.abs(w - h) < 0.5 && !(uniformCorner(node) > 0)) {
          var rOuter = Math.min(w, h) / 2;
          if (node.type === 'STAR') {
            var inner = (node.innerRadius != null ? node.innerRadius : 0.5);
            base.primitive = { polystar: { starType: 'STAR', points: node.pointCount, outerRadius: rOuter, innerRadius: inner * rOuter, rotation: 0 } };
          } else {
            base.primitive = { polystar: { starType: 'POLYGON', points: node.pointCount, outerRadius: rOuter, rotation: 0 } };
          }
        }
        break;
      case 'VECTOR':
        base.type = node.type;
        base.paths = mapPaths(node);
        base.fills = mapFills(node.fills, w, h);
        base.stroke = mapStroke(node);
        break;
      case 'BOOLEAN_OPERATION':
        // Editable Merge Paths: emit the operands as children (same frame-local
        // origin) plus the op so the host rebuilds a native, re-editable boolean.
        // Keep the baked outline as paths so the host can fall back to it.
        base.type = 'BOOLEAN';
        base.boolean = { op: mapBoolOp(node.booleanOperation) };
        base.children = await childrenToIR(node, origin, assets);
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
      case 'COMPONENT':
      case 'COMPONENT_SET':
      case 'INSTANCE':
        // A nested frame keeps its own identity: the host rebuilds it as a real
        // precomp so its clipping, background, rounded corners and chrome survive
        // (a plain GROUP null cannot clip overflow or carry a frame background).
        // GROUP / SECTION stay flat nulls (decorateFrameLayer is a no-op for them).
        base.type = 'FRAME';
        // The host rebuilds this as its own precomp, so its children must be
        // re-based to the nested frame's OWN origin (top-left), not the top-level
        // frame's. Re-base from the nested frame's absolute transform translation;
        // fall back to the inherited origin if it has no absolute transform.
        var nestedAt = node.absoluteTransform;
        var nestedOrigin = nestedAt ? { x: nestedAt[0][2], y: nestedAt[1][2] } : origin;
        base.children = await childrenToIR(node, nestedOrigin, assets);
        applyFrameChrome(base, node, w, h);
        await addFrameImageBackground(base, node, w, h, assets);
        break;
      case 'GROUP':
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

  // A frame's own shadow / blur, border, rounded corners, background, clip, opacity
  // and blend live on the precomp layer (card-style frames rely on all of these).
  // Shared by the top-level frame and nested FRAME nodes so both reconstruct the
  // same chrome; `out` already carries the common node/frame fields.
  function applyFrameChrome(out, frame, w, h) {
    var background = [];
    if (frame.fills && frame.fills !== figma.mixed) background = mapFills(frame.fills, w, h);
    out.background = background;
    out.clipsContent = frame.clipsContent !== false;
    out.buildMode = 'PRECOMP';
    if (frame.opacity != null && frame.opacity < 1) out.opacity = frame.opacity;
    if (frame.blendMode && frame.blendMode !== 'PASS_THROUGH' && frame.blendMode !== 'NORMAL') out.blendMode = frame.blendMode;
    var fe = mapEffects(frame.effects);
    if (fe.length) out.effects = fe;
    var fs = mapStroke(frame);
    if (fs && fs.paints && fs.paints.length) out.stroke = fs;
    var fc = mapCorners(frame);
    if (fc && (fc.topLeft || fc.topRight || fc.bottomRight || fc.bottomLeft)) out.cornerRadii = fc;
    return out;
  }

  // A frame can carry an IMAGE FILL as its background (a photo-backed card). The
  // shape-based chrome can't hold an image, so emit it as a BOTTOM-MOST IMAGE child
  // sized to the frame; the host then places it as ordinary footage (and clips it
  // to the frame's rounded corners when the frame clips/precomps). Solid/gradient
  // frame fills still ride out.background (applyFrameChrome). Mutates out.children.
  async function addFrameImageBackground(out, frame, w, h, assets) {
    var imgPaint = findImagePaint(frame.fills);
    if (!imgPaint) return;
    await addImageAsset(imgPaint, assets);
    var bg = {
      id: String(frame.id) + ':imgbg',
      name: (frame.name || 'Frame') + ' Background',
      type: 'IMAGE',
      visible: true,
      opacity: (imgPaint.opacity == null ? 1 : imgPaint.opacity),
      blendMode: 'NORMAL',
      imageHash: imgPaint.imageHash,
      scaleMode: imgPaint.scaleMode || 'FILL',
      transform: { x: 0, y: 0, width: w, height: h, rotation: 0, matrix: [1, 0, 0, 1, 0, 0] }
    };
    out.children = [bg].concat(out.children || []);
  }

  async function frameToIR(frame, assets) {
    // Use the frame's transform translation, NOT absoluteBoundingBox: the bbox
    // grows with rotation/strokes/effects and would offset every child.
    var at = frame.absoluteTransform;
    var origin = at ? { x: at[0][2], y: at[1][2] } : (frame.absoluteBoundingBox || { x: frame.x, y: frame.y });
    var children = await childrenToIR(frame, origin, assets);
    var out = {
      id: frame.id,
      name: frame.name,
      width: frame.width,
      height: frame.height,
      // Absolute canvas position of the frame's top-left, so the importer can
      // lay multiple frames out in one comp (flat build) without overlap.
      offset: { x: origin.x, y: origin.y },
      children: children
    };
    // Carry the frame chrome so the importer can decorate the precomp instead of
    // dropping it.
    applyFrameChrome(out, frame, frame.width, frame.height);
    await addFrameImageBackground(out, frame, frame.width, frame.height, assets);
    return out;
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
    assignMaskTargets(children);
    return {
      id: 'selection',
      name: 'Selection',
      width: Math.max(1, Math.round(maxX - minX)),
      height: Math.max(1, Math.round(maxY - minY)),
      offset: { x: minX, y: minY },
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

  root.ReboundFigma = { buildIR: buildIR, irVersion: IR_VERSION };
})(typeof globalThis !== 'undefined' ? globalThis : this);
