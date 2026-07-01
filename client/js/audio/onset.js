/*
 * Rebound, audio analysis (WAV decode + onset/beat detection).
 *
 * Pure and dependency-free so it is unit-tested. The Audio tool reads an audio
 * layer's file via Node fs (the panel has --enable-nodejs), decodes it here, and
 * detects transients to drop as comp/layer markers — feeding Stagger/Sequence.
 * Also generates a BPM beat grid and snaps times to a grid, for music sync where
 * onset detection is overkill.
 *
 * Scope: PCM WAV (8/16/24-bit) and 32-bit float WAV. Compressed audio (MP3/AAC)
 * needs a decoder we don't bundle — the tool falls back to the BPM grid there.
 */
;(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.Rebound = root.Rebound || {};
  root.Rebound.audio = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Accept Uint8Array | ArrayBuffer | Node Buffer -> a DataView over the bytes.
  function asDataView(bytes) {
    if (bytes instanceof ArrayBuffer) return new DataView(bytes);
    if (bytes && bytes.buffer) return new DataView(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
    throw new Error('Unsupported byte source.');
  }

  function fourcc(dv, off) {
    return String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));
  }

  // Decode a WAV into { sampleRate, channels, samples } where samples is a mono
  // Float32Array in [-1, 1] (channels averaged).
  function parseWav(bytes) {
    var dv = asDataView(bytes);
    if (dv.byteLength < 44 || fourcc(dv, 0) !== 'RIFF' || fourcc(dv, 8) !== 'WAVE') {
      throw new Error('Not a WAV file.');
    }
    var fmt = null, dataOff = -1, dataSize = 0;
    var p = 12;
    while (p + 8 <= dv.byteLength) {
      var id = fourcc(dv, p);
      var size = dv.getUint32(p + 4, true);
      var body = p + 8;
      if (id === 'fmt ') {
        fmt = {
          format: dv.getUint16(body, true),
          channels: dv.getUint16(body + 2, true),
          sampleRate: dv.getUint32(body + 4, true),
          bits: dv.getUint16(body + 14, true)
        };
      } else if (id === 'data') {
        dataOff = body;
        dataSize = Math.min(size, dv.byteLength - body);
      }
      p = body + size + (size & 1); // chunks are word-aligned
    }
    if (!fmt || dataOff < 0) throw new Error('WAV missing fmt/data.');
    var isFloat = fmt.format === 3;
    var ch = fmt.channels || 1;
    var bytesPer = fmt.bits / 8;
    var blockAlign = bytesPer * ch;
    var frames = Math.floor(dataSize / blockAlign);
    var out = new Float32Array(frames);

    function readSample(off) {
      if (isFloat && fmt.bits === 32) return dv.getFloat32(off, true);
      if (fmt.bits === 16) return dv.getInt16(off, true) / 32768;
      if (fmt.bits === 8) return (dv.getUint8(off) - 128) / 128;
      if (fmt.bits === 24) {
        var b0 = dv.getUint8(off), b1 = dv.getUint8(off + 1), b2 = dv.getUint8(off + 2);
        var v = b0 | (b1 << 8) | (b2 << 16);
        if (v & 0x800000) v |= ~0xffffff; // sign-extend
        return v / 8388608;
      }
      if (fmt.bits === 32) return dv.getInt32(off, true) / 2147483648;
      return 0;
    }

    for (var i = 0; i < frames; i++) {
      var base = dataOff + i * blockAlign, acc = 0;
      for (var c = 0; c < ch; c++) acc += readSample(base + c * bytesPer);
      out[i] = acc / ch;
    }
    return { sampleRate: fmt.sampleRate, channels: ch, samples: out };
  }

  // Per-frame RMS energy envelope.
  function energyEnvelope(samples, frameSize, hop) {
    var n = samples.length, frames = [];
    for (var start = 0; start + frameSize <= n; start += hop) {
      var s = 0;
      for (var i = 0; i < frameSize; i++) { var v = samples[start + i]; s += v * v; }
      frames.push(Math.sqrt(s / frameSize));
    }
    return frames;
  }

  // Detect onsets (transients) -> times in seconds. Positive energy flux with an
  // adaptive moving-average threshold and a minimum spacing, then local-max peak
  // picking. sensitivity in [0,1] (higher = more onsets).
  function detectOnsets(samples, sampleRate, opts) {
    opts = opts || {};
    var frameSize = opts.frameSize || 1024;
    var hop = opts.hop || 512;
    var sensitivity = opts.sensitivity != null ? opts.sensitivity : 0.5;
    var minInterval = opts.minIntervalSec != null ? opts.minIntervalSec : 0.12;
    if (samples.length < frameSize) return [];

    var env = energyEnvelope(samples, frameSize, hop);
    var flux = [0];
    for (var i = 1; i < env.length; i++) flux.push(Math.max(0, env[i] - env[i - 1]));

    // Adaptive threshold: moving average of flux scaled up; higher sensitivity
    // lowers the multiplier so weaker transients pass.
    var win = 8;
    var mult = 1.6 - sensitivity; // 0.6 .. 1.6
    var times = [];
    var minHops = Math.max(1, Math.round((minInterval * sampleRate) / hop));
    var lastIdx = -minHops - 1;
    var peak = 0;
    for (var k = 0; k < flux.length; k++) if (flux[k] > peak) peak = flux[k];
    var floor = peak * 0.04; // ignore near-silence noise

    for (var j = 1; j < flux.length - 1; j++) {
      var lo = Math.max(0, j - win), hi = Math.min(flux.length, j + win + 1), sum = 0, cnt = 0;
      for (var w = lo; w < hi; w++) { sum += flux[w]; cnt++; }
      var thresh = (sum / cnt) * mult + floor;
      if (flux[j] >= thresh && flux[j] >= flux[j - 1] && flux[j] > flux[j + 1] && (j - lastIdx) >= minHops) {
        times.push((j * hop) / sampleRate);
        lastIdx = j;
      }
    }
    return times;
  }

  // A BPM beat grid (seconds) across a duration. subdiv multiplies the beat
  // (1 = quarter notes, 2 = eighths, 4 = sixteenths).
  function beatGrid(bpm, offsetSec, subdiv, durationSec) {
    bpm = bpm || 120;
    subdiv = subdiv || 1;
    offsetSec = offsetSec || 0;
    var step = (60 / bpm) / subdiv;
    if (step <= 0) return [];
    var out = [];
    for (var t = offsetSec; t <= durationSec + 1e-9; t += step) out.push(Math.round(t * 1e6) / 1e6);
    return out;
  }

  // Snap each time to its nearest grid value. Returns [{ from, to }].
  function snapToGrid(times, grid) {
    if (!grid || !grid.length) return times.map(function (t) { return { from: t, to: t }; });
    return times.map(function (t) {
      var best = grid[0], bestD = Math.abs(grid[0] - t);
      for (var i = 1; i < grid.length; i++) {
        var d = Math.abs(grid[i] - t);
        if (d < bestD) { bestD = d; best = grid[i]; }
      }
      return { from: t, to: best };
    });
  }

  return {
    parseWav: parseWav,
    energyEnvelope: energyEnvelope,
    detectOnsets: detectOnsets,
    beatGrid: beatGrid,
    snapToGrid: snapToGrid
  };
});
