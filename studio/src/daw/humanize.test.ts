import { describe, it, expect } from 'vitest';
import { humanizeHit, HUMANIZE_MAX_SHIFT, HUMANIZE_MAX_VEL } from './humanize';

describe('humanizeHit', () => {
  it('cantidad 0 ⇒ sin desvío (con cualquier rnd)', () => {
    expect(humanizeHit(0, () => 0)).toEqual({ dt: 0, dvel: 0 });
    expect(humanizeHit(0, () => 1)).toEqual({ dt: 0, dvel: 0 });
  });
  it('rnd = 0.5 ⇒ centro (sin desvío)', () => {
    expect(humanizeHit(1, () => 0.5)).toEqual({ dt: 0, dvel: 0 });
  });
  it('extremos de rnd escalan por la cantidad', () => {
    expect(humanizeHit(1, () => 1)).toEqual({ dt: HUMANIZE_MAX_SHIFT, dvel: HUMANIZE_MAX_VEL });
    expect(humanizeHit(1, () => 0)).toEqual({ dt: -HUMANIZE_MAX_SHIFT, dvel: -HUMANIZE_MAX_VEL });
    const half = humanizeHit(0.5, () => 1);
    expect(half.dt).toBeCloseTo(HUMANIZE_MAX_SHIFT / 2, 9);
    expect(half.dvel).toBeCloseTo(HUMANIZE_MAX_VEL / 2, 9);
  });
  it('recorta la cantidad a [0,1]', () => {
    expect(humanizeHit(5, () => 1)).toEqual({ dt: HUMANIZE_MAX_SHIFT, dvel: HUMANIZE_MAX_VEL });
    expect(humanizeHit(-3, () => 1)).toEqual({ dt: 0, dvel: 0 });
  });
});
