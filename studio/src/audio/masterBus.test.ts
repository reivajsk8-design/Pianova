import { describe, it, expect } from 'vitest';
import { makeSoftClipCurve } from './masterBus';

describe('makeSoftClipCurve', () => {
  it('es tanh(drive·x) sobre [-1,1], monótona y acotada', () => {
    const drive = 2.5, n = 2048;
    const c = makeSoftClipCurve(n, drive);
    expect(c.length).toBe(n);
    expect(Math.abs(c[(n - 1) / 2 | 0])).toBeLessThan(0.01);     // centro ≈ 0
    expect(c[0]).toBeCloseTo(Math.tanh(-drive), 5);              // extremo -
    expect(c[n - 1]).toBeCloseTo(Math.tanh(drive), 5);           // extremo +
    for (let i = 1; i < n; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]); // monótona
    expect(Math.abs(c[n - 1])).toBeLessThan(1);                  // < 1 (sin clipping duro)
  });
});
