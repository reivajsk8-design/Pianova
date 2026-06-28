import { describe, it, expect } from 'vitest';
import { pinkNoiseSamples } from './noise-dsp';

describe('pinkNoiseSamples', () => {
  it('tiene la longitud pedida', () => {
    expect(pinkNoiseSamples(1000).length).toBe(1000);
  });
  it('es determinista con la misma semilla', () => {
    expect(Array.from(pinkNoiseSamples(64, 7))).toEqual(Array.from(pinkNoiseSamples(64, 7)));
  });
  it('genera señal (no todo ceros) y finita y acotada', () => {
    const s = pinkNoiseSamples(2000, 3);
    let energy = 0;
    for (let i = 0; i < s.length; i++) {
      expect(Number.isFinite(s[i])).toBe(true);
      expect(Math.abs(s[i])).toBeLessThan(2);
      energy += Math.abs(s[i]);
    }
    expect(energy).toBeGreaterThan(0);
  });
});
