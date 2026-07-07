import { describe, it, expect } from 'vitest';
import { valueToAngle, wheelStepFraction } from './knob';

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

describe('wheelStepFraction', () => {
  it('normal 2%, Ctrl 0.5% fino, Shift 10% grueso (Shift gana)', () => {
    expect(wheelStepFraction(false, false)).toBe(0.02);
    expect(wheelStepFraction(false, true)).toBe(0.005);
    expect(wheelStepFraction(true, false)).toBe(0.1);
    expect(wheelStepFraction(true, true)).toBe(0.1);
  });
});
