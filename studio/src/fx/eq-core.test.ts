import { describe, it, expect } from 'vitest';
import {
  defaultBands, bandsToParams, bandsFromParams, presetBands, presetNames,
  freqToX, xToFreq, gainToY, yToGain, EQ_GAIN_RANGE
} from './eq-core';

describe('eq-core', () => {
  it('defaultBands: 8 bandas, shelf en los extremos, ganancia 0', () => {
    const b = defaultBands();
    expect(b.length).toBe(8);
    expect(b[0].type).toBe('lowshelf');
    expect(b[7].type).toBe('highshelf');
    expect(b[3].type).toBe('peaking');
    expect(b.every(x => x.gain === 0 && x.on)).toBe(true);
  });
  it('bandsToParams/bandsFromParams: ida y vuelta', () => {
    const b = defaultBands();
    b[2] = { ...b[2], gain: 6, freq: 500, q: 2, on: false };
    const round = bandsFromParams(bandsToParams(b));
    expect(round).toEqual(b);
  });
  it('presetNames incluye Plano; presetBands da 8 bandas', () => {
    expect(presetNames()).toContain('Plano');
    expect(presetBands('Cuerpo').length).toBe(8);
    expect(presetBands('desconocido').every(x => x.gain === 0)).toBe(true);   // fallback Plano
  });
  it('freqToX/xToFreq son inversas', () => {
    expect(xToFreq(freqToX(1000, 800), 800)).toBeCloseTo(1000, 3);
  });
  it('gainToY/yToGain son inversas y 0 dB va al centro', () => {
    expect(gainToY(0, 300)).toBeCloseTo(150, 6);
    expect(yToGain(gainToY(6, 300), 300)).toBeCloseTo(6, 6);
    expect(yToGain(gainToY(-EQ_GAIN_RANGE, 300), 300)).toBeCloseTo(-EQ_GAIN_RANGE, 6);
  });
});
