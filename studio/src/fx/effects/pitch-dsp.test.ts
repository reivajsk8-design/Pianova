import { describe, it, expect } from 'vitest';
import { triWindow } from './pitch-dsp';

describe('triWindow', () => {
  it('vale 0 en los bordes y 1 en el centro', () => {
    expect(triWindow(0)).toBeCloseTo(0, 6);
    expect(triWindow(0.5)).toBeCloseTo(1, 6);
    expect(triWindow(1)).toBeCloseTo(0, 6);
  });
  it('dos ventanas desfasadas media unidad suman 1 (crossfade constante)', () => {
    for (const x of [0.1, 0.25, 0.4, 0.7, 0.9]) {
      const x2 = (x + 0.5) % 1;
      expect(triWindow(x) + triWindow(x2)).toBeCloseTo(1, 6);
    }
  });
});
