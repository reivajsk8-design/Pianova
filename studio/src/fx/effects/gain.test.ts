import { describe, it, expect } from 'vitest';
import { dbToLin } from './gain';

describe('dbToLin', () => {
  it('0 dB = ganancia 1', () => { expect(dbToLin(0)).toBeCloseTo(1, 5); });
  it('+6 dB ≈ 1.995', () => { expect(dbToLin(6)).toBeCloseTo(1.99526, 4); });
  it('-6 dB ≈ 0.501', () => { expect(dbToLin(-6)).toBeCloseTo(0.50119, 4); });
});
