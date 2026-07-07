import { describe, it, expect } from 'vitest';
import { lfoValue, hash01, periodSeconds, RATE_FIGURES } from './lfo';

describe('lfoValue', () => {
  it('seno empieza en 0 y sube', () => {
    expect(lfoValue('sine', 0)).toBeCloseTo(0);
    expect(lfoValue('sine', 0.25)).toBeCloseTo(1);
  });
  it('triángulo empieza en 0, pico +1 y valle -1', () => {
    expect(lfoValue('tri', 0)).toBeCloseTo(0);
    expect(lfoValue('tri', 0.25)).toBeCloseTo(1);
    expect(lfoValue('tri', 0.5)).toBeCloseTo(0);
    expect(lfoValue('tri', 0.75)).toBeCloseTo(-1);
  });
  it('sierras y cuadrada', () => {
    expect(lfoValue('sawUp', 0)).toBeCloseTo(-1);
    expect(lfoValue('sawUp', 0.5)).toBeCloseTo(0);
    expect(lfoValue('sawDown', 0.5)).toBeCloseTo(0);
    expect(lfoValue('square', 0.25)).toBe(1);
    expect(lfoValue('square', 0.75)).toBe(-1);
  });
  it('la fase se repite por ciclo (t entero = misma fase)', () => {
    expect(lfoValue('sawUp', 1.5)).toBeCloseTo(lfoValue('sawUp', 0.5));
  });
  it('random (S&H): estable dentro del ciclo, distinto entre ciclos', () => {
    expect(lfoValue('random', 3.1)).toBe(lfoValue('random', 3.9));   // mismo ciclo
    expect(lfoValue('random', 3.1)).not.toBe(lfoValue('random', 4.1)); // otro ciclo
    expect(lfoValue('random', 0)).toBeGreaterThanOrEqual(-1);
    expect(lfoValue('random', 0)).toBeLessThanOrEqual(1);
  });
});

describe('hash01', () => {
  it('determinista y en [0,1)', () => {
    expect(hash01(5)).toBe(hash01(5));
    expect(hash01(5)).toBeGreaterThanOrEqual(0);
    expect(hash01(5)).toBeLessThan(1);
  });
});

describe('periodSeconds', () => {
  it('sincro: figura·(60/bpm)', () => {
    expect(periodSeconds('sync', '1/4', 1, 120)).toBeCloseTo(0.5);   // 1 beat a 120 = 0.5 s
    expect(periodSeconds('sync', '1c', 1, 120)).toBeCloseTo(2);      // 4 beats
  });
  it('libre: 1/Hz', () => {
    expect(periodSeconds('free', '1/4', 2, 120)).toBeCloseTo(0.5);
  });
  it('guardas: bpm 0 y hz 0 no explotan', () => {
    expect(periodSeconds('sync', '1/4', 1, 0)).toBeGreaterThan(0);
    expect(periodSeconds('free', '1/4', 0, 120)).toBeGreaterThan(0);
  });
  it('RATE_FIGURES incluye 1/4 con 1 beat', () => {
    expect(RATE_FIGURES.find(f => f.key === '1/4')?.beats).toBe(1);
  });
});
