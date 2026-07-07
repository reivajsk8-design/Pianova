import { describe, it, expect } from 'vitest';
import { SYNTH, getPresetNames } from './synth';

describe('presets del synth', () => {
  it('incluye guitarra y flauta', () => {
    expect(SYNTH.guitarra).toBeDefined();
    expect(SYNTH.flauta).toBeDefined();
  });
  it('getPresetNames devuelve las claves nuevas', () => {
    const keys = getPresetNames().map(([k]) => k);
    expect(keys).toContain('guitarra');
    expect(keys).toContain('flauta');
  });
  it('todos los presets tienen partials no vacíos y peak de 2 elementos', () => {
    for (const k of Object.keys(SYNTH)) {
      expect(SYNTH[k].partials.length).toBeGreaterThan(0);
      expect(SYNTH[k].peak.length).toBe(2);
    }
  });
});
