import { describe, it, expect } from 'vitest';
import { impulseSamples, mulberry32 } from './reverb-impulse';

describe('mulberry32', () => {
  it('es determinista con la misma semilla', () => {
    const a = mulberry32(42), b = mulberry32(42);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });
  it('devuelve valores en [0,1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 100; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('impulseSamples', () => {
  it('tiene la longitud pedida', () => {
    expect(impulseSamples(1000, 2).length).toBe(1000);
  });
  it('todas las muestras están en [-1,1]', () => {
    const s = impulseSamples(2000, 3);
    for (let i = 0; i < s.length; i++) { expect(s[i]).toBeGreaterThanOrEqual(-1); expect(s[i]).toBeLessThanOrEqual(1); }
  });
  it('decae: el último cuarto tiene menos energía que el primero', () => {
    const s = impulseSamples(4000, 2);
    const q = s.length / 4;
    let first = 0, last = 0;
    for (let i = 0; i < q; i++) first += Math.abs(s[i]);
    for (let i = s.length - q; i < s.length; i++) last += Math.abs(s[i]);
    expect(last).toBeLessThan(first);
  });
  it('es determinista con la misma semilla', () => {
    const a = impulseSamples(50, 2, 5);
    const b = impulseSamples(50, 2, 5);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
  it('semillas distintas dan impulsos distintos', () => {
    const a = impulseSamples(50, 2, 1);
    const b = impulseSamples(50, 2, 2);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});
