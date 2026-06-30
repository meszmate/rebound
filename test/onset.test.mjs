import { describe, it, expect } from 'vitest';
import '../client/js/audio/onset.js';

const audio = globalThis.Rebound.audio;
const { parseWav, detectOnsets, beatGrid, snapToGrid } = audio;

// Build a 16-bit PCM WAV (mono or stereo) from interleaved Float32 channel data.
function makeWav(channels, sampleRate, frames) {
  const ch = channels.length;
  const dataSize = frames * ch * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buf);
  const wc = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  wc(0, 'RIFF'); dv.setUint32(4, 36 + dataSize, true); wc(8, 'WAVE');
  wc(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * ch * 2, true);
  dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
  wc(36, 'data'); dv.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i] || 0));
      dv.setInt16(off, Math.round(v * 32767), true);
      off += 2;
    }
  }
  return new Uint8Array(buf);
}

describe('audio.parseWav', () => {
  it('decodes a mono 16-bit WAV with the right rate and length', () => {
    const frames = 100;
    const data = new Float32Array(frames);
    for (let i = 0; i < frames; i++) data[i] = Math.sin(i / 5) * 0.5;
    const wav = makeWav([data], 44100, frames);
    const out = parseWav(wav);
    expect(out.sampleRate).toBe(44100);
    expect(out.channels).toBe(1);
    expect(out.samples.length).toBe(frames);
    expect(out.samples[10]).toBeCloseTo(Math.sin(10 / 5) * 0.5, 3);
  });

  it('averages stereo channels to mono', () => {
    const L = new Float32Array([1, 1, 1]);
    const R = new Float32Array([-1, 0, 1]);
    const out = parseWav(makeWav([L, R], 8000, 3));
    expect(out.channels).toBe(2);
    expect(out.samples[0]).toBeCloseTo(0, 3);   // (1 + -1)/2
    expect(out.samples[1]).toBeCloseTo(0.5, 3);  // (1 + 0)/2
    expect(out.samples[2]).toBeCloseTo(1, 3);    // (1 + 1)/2
  });

  it('rejects non-WAV bytes', () => {
    expect(() => parseWav(new Uint8Array([1, 2, 3, 4, 5]))).toThrow();
  });
});

describe('audio.detectOnsets', () => {
  it('finds the transients in a click track', () => {
    const sr = 44100, dur = 3, n = sr * dur;
    const samples = new Float32Array(n);
    // Bursts at 0.25 + k*0.5s, each a short decaying hit (clear rising edge).
    const beats = [0.25, 0.75, 1.25, 1.75, 2.25, 2.75];
    beats.forEach((t) => {
      const start = Math.round(t * sr);
      for (let i = 0; i < 1200 && start + i < n; i++) samples[start + i] = 0.85 * Math.exp(-i / 350);
    });
    const onsets = detectOnsets(samples, sr, {});
    expect(onsets.length).toBeGreaterThanOrEqual(5);
    expect(onsets.length).toBeLessThanOrEqual(8);
    // Each beat should have a detected onset close to it (frame resolution ~23ms).
    beats.forEach((t) => {
      const near = onsets.some((o) => Math.abs(o - t) < 0.05);
      expect(near).toBe(true);
    });
  });

  it('returns nothing for silence', () => {
    expect(detectOnsets(new Float32Array(44100), 44100, {})).toEqual([]);
  });
});

describe('audio.beatGrid', () => {
  it('lays a 120bpm quarter-note grid', () => {
    expect(beatGrid(120, 0, 1, 2)).toEqual([0, 0.5, 1, 1.5, 2]);
  });
  it('honors offset and subdivision', () => {
    expect(beatGrid(120, 0.1, 2, 0.85)).toEqual([0.1, 0.35, 0.6, 0.85]);
  });
});

describe('audio.snapToGrid', () => {
  it('snaps each time to the nearest grid point', () => {
    const out = snapToGrid([0.06, 0.49, 0.9], [0, 0.5, 1]);
    expect(out.map((x) => x.to)).toEqual([0, 0.5, 1]);
  });
  it('is identity with an empty grid', () => {
    expect(snapToGrid([0.3], []).map((x) => x.to)).toEqual([0.3]);
  });
});
