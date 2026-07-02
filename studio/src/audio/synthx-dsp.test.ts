import { describe, it, expect } from 'vitest';
import {
  clamp01, clampHz, clampQ, clampTime, clampDetune, clampRate,
  unisonDetunes, subFreqRatio, SYNTHX_DEFAULT, SYNTHX_PRESETS, synthxPresetNames, normalizeParams
} from './synthx-dsp';

describe('synthx-dsp', () => {
  it('clamps acotan a sus rangos', () => {
    expect(clamp01(-1)).toBe(0); expect(clamp01(2)).toBe(1);
    expect(clampHz(5)).toBe(20); expect(clampHz(99999)).toBe(20000);
    expect(clampQ(0)).toBeCloseTo(0.3, 6); expect(clampQ(99)).toBe(20);
    expect(clampTime(-1)).toBe(0); expect(clampTime(9)).toBe(3);
    expect(clampDetune(-5)).toBe(0); expect(clampDetune(80)).toBe(50);
    expect(clampRate(0)).toBeCloseTo(0.1, 6); expect(clampRate(50)).toBe(20);
  });

  it('unisonDetunes: 0 da una voz; >0 da par simétrico', () => {
    expect(unisonDetunes(0)).toEqual([0]);
    expect(unisonDetunes(12)).toEqual([12, -12]);
  });

  it('el sub suena una octava por debajo', () => {
    expect(subFreqRatio()).toBeCloseTo(0.5, 6);
  });

  it('hay 4 presets con nombre', () => {
    expect(Object.keys(SYNTHX_PRESETS).sort()).toEqual(['bajo', 'lead', 'pad', 'pluck']);
    expect(synthxPresetNames().length).toBe(4);
  });

  it('normalizeParams: objeto vacío da el default completo', () => {
    expect(normalizeParams(undefined)).toEqual(SYNTHX_DEFAULT);
    expect(normalizeParams({})).toEqual(SYNTHX_DEFAULT);
  });

  it('normalizeParams: acota valores fuera de rango y corrige tipos inválidos', () => {
    const n = normalizeParams({ cutoff: 999999, resonance: 0, sine: 5, filterType: 'x' as never, lfoDest: 'z' as never });
    expect(n.cutoff).toBe(20000);
    expect(n.resonance).toBeCloseTo(0.3, 6);
    expect(n.sine).toBe(1);
    expect(n.filterType).toBe('lowpass');
    expect(n.lfoDest).toBe('off');
  });
});
