import { describe, it, expect } from 'vitest';
import { valueToAngle } from './knob';

describe('valueToAngle', () => {
  it('el mínimo apunta a -135°', () => { expect(valueToAngle(0, 0, 1)).toBe(-135); });
  it('el máximo apunta a +135°', () => { expect(valueToAngle(1, 0, 1)).toBe(135); });
  it('el centro apunta a 0°', () => { expect(valueToAngle(0.5, 0, 1)).toBe(0); });
  it('acota fuera de rango', () => {
    expect(valueToAngle(-5, 0, 1)).toBe(-135);
    expect(valueToAngle(5, 0, 1)).toBe(135);
  });
  it('funciona con rangos con negativos (pan -1..1)', () => {
    expect(valueToAngle(-1, -1, 1)).toBe(-135);
    expect(valueToAngle(0, -1, 1)).toBe(0);
    expect(valueToAngle(1, -1, 1)).toBe(135);
  });
});
