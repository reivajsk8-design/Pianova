import { describe, it, expect } from 'vitest';
import { keyLayout, keyGeomFor } from './geometry';

describe('geometría de teclas', () => {
  it('reparte las blancas por igual y marca negras', () => {
    const lay = keyLayout(60, 72, 800);   // Do4..Do5: 8 blancas (60,62,64,65,67,69,71,72), whiteW=100
    const c4 = keyGeomFor(lay, 60)!;
    const d4 = keyGeomFor(lay, 62)!;
    expect(c4.black).toBe(false);
    expect(c4.x).toBeCloseTo(0);
    expect(c4.w).toBeCloseTo(100);
    expect(d4.x).toBeCloseTo(100);        // segunda blanca
    const cs4 = keyGeomFor(lay, 61)!;     // Do#4 (negra)
    expect(cs4.black).toBe(true);
    expect(cs4.w).toBeCloseTo(60);        // 100*0.6
    expect(cs4.x).toBeCloseTo(70);        // 1*100 - 100*0.3
  });
  it('cuenta todas las teclas del rango', () => {
    const lay = keyLayout(60, 72, 800);   // 13 semitonos
    expect(lay.length).toBe(13);
  });
  it('keyGeomFor devuelve undefined fuera de rango', () => {
    const lay = keyLayout(60, 72, 800);
    expect(keyGeomFor(lay, 40)).toBeUndefined();
    expect(keyGeomFor(lay, 90)).toBeUndefined();
  });
});
