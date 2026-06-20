/*
 * Rebound, smart unit + time parsing, shared by every tool so the whole panel
 * speaks one unit dialect.
 *
 * Time accepts a suffix: ms, s, f (frames), m (minutes), h (hours). A bare
 * number is interpreted in the caller's default unit. Lengths accept px or %.
 *
 * UMD: registers on Rebound.units in the panel and exports for Vitest.
 */
;(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.Rebound = root.Rebound || {};
  root.Rebound.units = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TIME_RE = /^\s*([+-]?\d*\.?\d+)\s*(ms|s|f|m|h)?\s*$/i;
  var LEN_RE = /^\s*([+-]?\d*\.?\d+)\s*(px|%)?\s*$/i;

  function parseNumber(str) {
    if (typeof str === 'number') return isFinite(str) ? str : null;
    if (str == null) return null;
    var n = parseFloat(String(str).replace(/[, ]+/g, ''));
    return isFinite(n) ? n : null;
  }

  // Parse a duration string to SECONDS. `fps` is needed for frame units.
  // `defaultUnit` (default 's') applies when no suffix is given.
  function parseTime(str, fps, defaultUnit) {
    if (typeof str === 'number') str = String(str);
    if (str == null) return null;
    var m = TIME_RE.exec(str);
    if (!m) return null;
    var value = parseFloat(m[1]);
    var unit = (m[2] || defaultUnit || 's').toLowerCase();
    switch (unit) {
      case 'ms': return value / 1000;
      case 's': return value;
      case 'f': return fps ? value / fps : null;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      default: return value;
    }
  }

  // Parse a duration string to whole FRAMES (rounded), given fps.
  function parseFrames(str, fps, defaultUnit) {
    var seconds = parseTime(str, fps, defaultUnit || 'f');
    if (seconds == null || !fps) return null;
    return Math.round(seconds * fps);
  }

  // Format seconds as a friendly string in the requested unit.
  function formatTime(seconds, fps, unit) {
    unit = (unit || 's').toLowerCase();
    switch (unit) {
      case 'ms': return Math.round(seconds * 1000) + 'ms';
      case 'f': return fps ? Math.round(seconds * fps) + 'f' : seconds + 's';
      case 'm': return round(seconds / 60, 3) + 'm';
      case 'h': return round(seconds / 3600, 4) + 'h';
      default: return round(seconds, 4) + 's';
    }
  }

  // Parse a length to a { value, unit } pair where unit is 'px' or '%'.
  // `basis` (optional) resolves a percentage to an absolute value.
  function parseLength(str, basis) {
    if (typeof str === 'number') return { value: str, unit: 'px', absolute: str };
    if (str == null) return null;
    var m = LEN_RE.exec(str);
    if (!m) return null;
    var value = parseFloat(m[1]);
    var unit = (m[2] || 'px').toLowerCase();
    var absolute = unit === '%' && typeof basis === 'number' ? (value / 100) * basis : value;
    return { value: value, unit: unit, absolute: absolute };
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function round(v, decimals) {
    var f = Math.pow(10, decimals || 0);
    return Math.round(v * f) / f;
  }

  return {
    parseNumber: parseNumber,
    parseTime: parseTime,
    parseFrames: parseFrames,
    formatTime: formatTime,
    parseLength: parseLength,
    clamp: clamp,
    round: round
  };
});
