import { describe, it, expect } from 'vitest';
import { makeTransport } from './transport';

describe('makeTransport', () => {
  it('deriva la posición del reloj y es inversa de timeForBeat', () => {
    let clock = 10;
    const tr = makeTransport(() => clock);
    tr.anchor(0, 120);                 // 120 bpm = 2 beats/seg
    clock = 10; expect(tr.beatNow()).toBe(0);
    clock = 11; expect(tr.beatNow()).toBe(2);   // 1 seg = 2 beats
    expect(tr.timeForBeat(0)).toBe(10);
    expect(tr.timeForBeat(2)).toBe(11);
    clock = 13.7; const b = tr.beatNow();
    expect(Math.abs(tr.timeForBeat(b) - 13.7)).toBeLessThan(1e-9);
  });
  it('setBpm re-ancla sin salto y avanza al nuevo ritmo', () => {
    let clock = 10;
    const tr = makeTransport(() => clock);
    tr.anchor(0, 120);
    clock = 12; const before = tr.beatNow();    // 4
    tr.setBpm(60);                               // 60 bpm = 1 beat/seg
    expect(Math.abs(tr.beatNow() - before)).toBeLessThan(1e-9);
    clock = 13; expect(Math.abs(tr.beatNow() - (before + 1))).toBeLessThan(1e-9);
  });
});
