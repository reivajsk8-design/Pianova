import { describe, it, expect } from 'vitest';
import { meterNorm } from './meter';

describe('meterNorm', () => {
  it('0 → 0; 1 (0 dB) → 1; −6 dB (0.5) ≈ 0.875; muy bajo → 0 (recorta)', () => {
    expect(meterNorm(0)).toBe(0);
    expect(meterNorm(1)).toBe(1);
    expect(meterNorm(0.5)).toBeCloseTo(0.875, 2);
    expect(meterNorm(1e-3)).toBe(0);   // −60 dB < −48 floor
  });
  it('floorDb configurable', () => {
    expect(meterNorm(1, 60)).toBe(1);
    expect(meterNorm(0.5, 60)).toBeCloseTo((20 * Math.log10(0.5) + 60) / 60, 6);
  });
});
