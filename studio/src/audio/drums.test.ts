import { describe, it, expect } from 'vitest';
import { whiteNoiseSamples, DRUM_VOICES, DRUM_LABELS } from './drums';

describe('whiteNoiseSamples', () => {
  it('tiene la longitud pedida', () => { expect(whiteNoiseSamples(500).length).toBe(500); });
  it('es determinista con la misma semilla', () => {
    expect(Array.from(whiteNoiseSamples(32, 9))).toEqual(Array.from(whiteNoiseSamples(32, 9)));
  });
  it('está acotado en [-1,1] y no es todo ceros', () => {
    const s = whiteNoiseSamples(1000, 3);
    let energy = 0;
    for (let i = 0; i < s.length; i++) { expect(Math.abs(s[i])).toBeLessThanOrEqual(1); energy += Math.abs(s[i]); }
    expect(energy).toBeGreaterThan(0);
  });
});

describe('DRUM_VOICES', () => {
  it('tiene las 6 voces y una etiqueta por voz', () => {
    expect(DRUM_VOICES).toEqual(['kick', 'snare', 'hatClosed', 'hatOpen', 'clap', 'tom']);
    for (const v of DRUM_VOICES) expect(typeof DRUM_LABELS[v]).toBe('string');
  });
});
