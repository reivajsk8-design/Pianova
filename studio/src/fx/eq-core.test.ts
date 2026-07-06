import { describe, it, expect } from 'vitest';
import {
  defaultBands, bandsToParams, bandsFromParams, presetBands, presetNames,
  freqToX, xToFreq, gainToY, yToGain, EQ_GAIN_RANGE, defaultDyn, dynTarget, envCoef
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

describe('eq-core dinámica', () => {
  it('defaultBands: cada banda trae dinámica apagada por defecto', () => {
    const b = defaultBands();
    expect(b[0].dyn).toEqual(defaultDyn());
    expect(b.every(x => x.dyn.on === false)).toBe(true);
  });
  it('bandsToParams/bandsFromParams: ida y vuelta con dinámica', () => {
    const b = defaultBands();
    b[1] = { ...b[1], dyn: { on: true, threshold: -30, range: -9, attack: 5, release: 200 } };
    expect(bandsFromParams(bandsToParams(b))).toEqual(b);
  });
  it('bandsFromParams: sin params de dinámica → dinámica por defecto (compat v0.25)', () => {
    const b = bandsFromParams({ b0_freq: 100, b0_gain: 3 });   // proyecto viejo sin dyn
    expect(b[0].dyn).toEqual(defaultDyn());
  });
  it('dynTarget: 0 bajo umbral, proporcional hasta range en el knee', () => {
    expect(dynTarget(-30, -24, -6, 18)).toBe(0);          // por debajo del umbral
    expect(dynTarget(-24 + 18, -24, -6, 18)).toBeCloseTo(-6, 6);   // a un knee por encima → range completo
    expect(dynTarget(-24 + 9, -24, -6, 18)).toBeCloseTo(-3, 6);    // a medio knee → medio range
    expect(dynTarget(-24 + 36, -24, -6, 18)).toBeCloseTo(-6, 6);   // se satura en range
  });
  it('envCoef: entre 0 y 1, más lento (menor) con tau mayor', () => {
    const fast = envCoef(20, 16), slow = envCoef(200, 16);
    expect(fast).toBeGreaterThan(0); expect(fast).toBeLessThan(1);
    expect(slow).toBeLessThan(fast);
  });
});
