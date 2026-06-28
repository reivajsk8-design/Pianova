import { describe, it, expect } from 'vitest';
import { dueSteps } from './sequencer';

describe('dueSteps', () => {
  it('un compás de 16 a semicorcheas en [0,1) da los pasos 0..3', () => {
    expect(dueSteps(0, 1, 16, 4)).toEqual([
      { step: 0, beat: 0 }, { step: 1, beat: 0.25 }, { step: 2, beat: 0.5 }, { step: 3, beat: 0.75 }
    ]);
  });
  it('ventana medio-abierta: [0,0.25) solo incluye el paso 0', () => {
    expect(dueSteps(0, 0.25, 16, 4)).toEqual([{ step: 0, beat: 0 }]);
  });
  it('no incluye el límite superior: [0.25,0.5) solo el paso 1', () => {
    expect(dueSteps(0.25, 0.5, 16, 4)).toEqual([{ step: 1, beat: 0.25 }]);
  });
  it('envuelve el patrón: el beat 4.0 es el paso 0 (16 pasos)', () => {
    expect(dueSteps(3.9, 4.1, 16, 4)).toEqual([{ step: 0, beat: 4 }]);
  });
  it('ventana sin cruces devuelve vacío', () => {
    expect(dueSteps(0.1, 0.2, 16, 4)).toEqual([]);
  });
});
