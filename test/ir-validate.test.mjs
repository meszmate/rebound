import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import validateMod from '../shared/lib/validate.js';

const { validate, checkVersion, parseVersion } = validateMod;

const here = dirname(fileURLToPath(import.meta.url));
const basic = JSON.parse(readFileSync(join(here, 'fixtures', 'ir-basic.json'), 'utf8'));

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

describe('validate: version', () => {
  it('parses semver', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion('nope')).toBe(null);
  });
  it('accepts matching major, rejects skew', () => {
    expect(checkVersion('1.4.0').ok).toBe(true);
    expect(checkVersion('2.0.0').ok).toBe(false);
    expect(checkVersion('').ok).toBe(false);
  });
});

describe('validate: documents', () => {
  it('passes the basic fixture with no errors', () => {
    const res = validate(basic);
    expect(res.errors).toEqual([]);
    expect(res.valid).toBe(true);
    expect(res.counts.frames).toBe(1);
    expect(res.counts.text).toBe(1);
    expect(res.counts.gradients).toBe(1);
  });

  it('flags a major version mismatch as an error', () => {
    const bad = clone(basic);
    bad.irVersion = '2.0.0';
    const res = validate(bad);
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toMatch(/not supported/);
  });

  it('requires document.frames to be an array', () => {
    const bad = clone(basic);
    bad.document.frames = {};
    const res = validate(bad);
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toMatch(/frames must be an array/);
  });

  it('errors on a TEXT node without characters', () => {
    const bad = clone(basic);
    bad.document.frames[0].children[1].text = {};
    const res = validate(bad);
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toMatch(/TEXT node without/);
  });

  it('warns (not errors) on an unknown node type', () => {
    const bad = clone(basic);
    bad.document.frames[0].children[0].type = 'WIDGET';
    const res = validate(bad);
    expect(res.valid).toBe(true);
    expect(res.warnings.join(' ')).toMatch(/unsupported type/);
  });

  it('warns on an image fill missing from assets', () => {
    const bad = clone(basic);
    bad.document.frames[0].children[0].fills = [{ type: 'IMAGE', imageHash: 'deadbeef' }];
    const res = validate(bad);
    expect(res.warnings.join(' ')).toMatch(/missing from document.assets/);
  });

  it('rejects a non-object', () => {
    expect(validate(null).valid).toBe(false);
    expect(validate('x').valid).toBe(false);
  });
});
