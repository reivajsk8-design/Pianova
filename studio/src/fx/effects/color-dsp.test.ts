import { describe, it, expect } from 'vitest';
import { makeCurve, tubeSample, sigmoidSample, bandwidthToQ } from './color-dsp';

describe('makeCurve', () => {
  it('muestrea fn sobre [-1,1] con la longitud pedida', () => {
    expect(Array.from(makeCurve(3, x => x))).toEqual([-1, 0, 1]);
  });
});

describe('tubeSample', () => {
  it('silencio → silencio', () => {
    expect(tubeSample(0, 0.5, 0.5)).toBeCloseTo(0, 6);
  });
  it('es monótona creciente en x', () => {
    expect(tubeSample(0.5, 0.5, 0.3)).toBeGreaterThan(tubeSample(-0.5, 0.5, 0.3));
  });
  it('es asimétrica cuando warmth > 0', () => {
    expect(tubeSample(0.5, 0.5, 0.5)).not.toBeCloseTo(-tubeSample(-0.5, 0.5, 0.5), 4);
  });
  it('es (casi) simétrica cuando warmth = 0', () => {
    expect(tubeSample(0.5, 0.5, 0)).toBeCloseTo(-tubeSample(-0.5, 0.5, 0), 6);
  });
});

describe('sigmoidSample', () => {
  it('silencio → silencio', () => {
    expect(sigmoidSample(0, 0.5)).toBeCloseTo(0, 6);
  });
  it('acotada en [-1,1]', () => {
    expect(sigmoidSample(1, 1)).toBeLessThanOrEqual(1);
    expect(sigmoidSample(-1, 1)).toBeGreaterThanOrEqual(-1);
  });
  it('más drive = más pendiente cerca de 0', () => {
    expect(sigmoidSample(0.1, 1)).toBeGreaterThan(sigmoidSample(0.1, 0));
  });
});

describe('bandwidthToQ', () => {
  it('1 octava ≈ 1.414', () => { expect(bandwidthToQ(1)).toBeCloseTo(1.41421, 4); });
  it('2 octavas ≈ 0.667', () => { expect(bandwidthToQ(2)).toBeCloseTo(0.66667, 4); });
  it('menos ancho = más Q', () => { expect(bandwidthToQ(0.5)).toBeGreaterThan(bandwidthToQ(2)); });
});
