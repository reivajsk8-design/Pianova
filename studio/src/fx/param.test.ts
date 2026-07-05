import { describe, it, expect } from 'vitest';
import { ramp } from './param';

describe('ramp', () => {
  it('llama a setTargetAtTime con el valor, el reloj de audio y el time constant por defecto', () => {
    const calls: [number, number, number][] = [];
    const param = { setTargetAtTime: (v: number, t: number, tc: number) => { calls.push([v, t, tc]); } } as unknown as AudioParam;
    const actx = { currentTime: 5 } as AudioContext;
    ramp(param, 0.7, actx);
    expect(calls).toEqual([[0.7, 5, 0.01]]);
  });
  it('acepta un time constant personalizado', () => {
    const calls: [number, number, number][] = [];
    const param = { setTargetAtTime: (v: number, t: number, tc: number) => { calls.push([v, t, tc]); } } as unknown as AudioParam;
    const actx = { currentTime: 2 } as AudioContext;
    ramp(param, 1, actx, 0.05);
    expect(calls).toEqual([[1, 2, 0.05]]);
  });
});
