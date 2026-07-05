import { describe, it, expect } from 'vitest';
import { flashLevel, sliceProgress, padLevel, activeSlices } from './hitViz';

describe('flashLevel', () => {
  it('golpe recién dado a velocity máxima ≈ 1', () => {
    expect(flashLevel(0, 1, 0.15)).toBeCloseTo(1, 5);
  });
  it('a mitad de la ventana decae a la mitad', () => {
    expect(flashLevel(0.075, 1, 0.15)).toBeCloseTo(0.5, 5);
  });
  it('velocity baja mantiene un suelo visible (0.45 a edad 0)', () => {
    expect(flashLevel(0, 0, 0.15)).toBeCloseTo(0.45, 5);
  });
  it('fuera de la ventana o edad negativa = 0', () => {
    expect(flashLevel(0.15, 1, 0.15)).toBe(0);
    expect(flashLevel(0.2, 1, 0.15)).toBe(0);
    expect(flashLevel(-0.01, 1, 0.15)).toBe(0);
    expect(flashLevel(0, 1, 0)).toBe(0);
  });
  it('acota velNorm fuera de 0..1', () => {
    expect(flashLevel(0, 5, 0.15)).toBeCloseTo(1, 5);
    expect(flashLevel(0, -5, 0.15)).toBeCloseTo(0.45, 5);
  });
});

describe('sliceProgress', () => {
  it('devuelve la fracción recorrida', () => {
    expect(sliceProgress(10, 10, 2)).toBe(0);
    expect(sliceProgress(11, 10, 2)).toBe(0.5);
    expect(sliceProgress(12, 10, 2)).toBe(1);
  });
  it('antes de empezar es negativo', () => {
    expect(sliceProgress(9, 10, 2)).toBeLessThan(0);
  });
  it('dur <= 0 → 1 (inactivo)', () => {
    expect(sliceProgress(10, 10, 0)).toBe(1);
    expect(sliceProgress(10, 10, -1)).toBe(1);
  });
});

describe('padLevel', () => {
  it('sin golpe = 0', () => {
    expect(padLevel(undefined, 5, 0.15)).toBe(0);
  });
  it('usa la edad y la velocity del golpe', () => {
    expect(padLevel({ t: 5, vel: 1 }, 5, 0.15)).toBeCloseTo(1, 5);
    expect(padLevel({ t: 5, vel: 1 }, 5.2, 0.15)).toBe(0);   // ya caducó
  });
});

describe('activeSlices', () => {
  it('devuelve solo los slices con progress en [0,1) y su progreso', () => {
    const hits = [
      { index: 0, t: 10, dur: 2 },   // now=11 → 0.5 activo
      { index: 3, t: 8, dur: 1 },    // now=11 → 3 (caducado)
      { index: 5, t: 12, dur: 2 }    // now=11 → -0.5 (aún no)
    ];
    expect(activeSlices(hits, 11)).toEqual([{ index: 0, progress: 0.5 }]);
  });
  it('sin golpes activos → array vacío', () => {
    expect(activeSlices([], 3)).toEqual([]);
  });
});
