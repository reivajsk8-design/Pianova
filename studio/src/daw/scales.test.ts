import { describe, it, expect } from 'vitest';
import { inScale, SCALES, SCALE_LABELS, noteName } from './scales';

describe('inScale', () => {
  it('Do mayor contiene Do, Re, Mi, Fa, Sol, La, Si y no los sostenidos', () => {
    // Do=60. Grados de Do mayor: 60,62,64,65,67,69,71
    for (const m of [60, 62, 64, 65, 67, 69, 71]) expect(inScale(m, 0, 'major')).toBe(true);
    for (const m of [61, 63, 66, 68, 70]) expect(inScale(m, 0, 'major')).toBe(false);
  });
  it('respeta la tónica (La menor = teclas blancas)', () => {
    // La=57 (root 9). La menor natural: 57,59,60,62,64,65,67 → todas blancas
    for (const m of [57, 59, 60, 62, 64, 65, 67]) expect(inScale(m, 9, 'minor')).toBe(true);
    expect(inScale(58, 9, 'minor')).toBe(false);   // La# fuera
  });
  it('maneja bien el módulo negativo (notas por debajo de la tónica)', () => {
    expect(inScale(48, 0, 'major')).toBe(true);    // Do3 en Do mayor
    expect(inScale(49, 0, 'major')).toBe(false);   // Do#3 fuera
  });
  it('tipo desconocido → cromática (todo dentro)', () => {
    for (let m = 60; m < 72; m++) expect(inScale(m, 0, 'desconocida')).toBe(true);
  });
});

describe('metadatos de escalas', () => {
  it('SCALES y SCALE_LABELS tienen las mismas claves', () => {
    expect(Object.keys(SCALES).sort()).toEqual(Object.keys(SCALE_LABELS).sort());
  });
  it('noteName da el nombre + octava correctos', () => {
    expect(noteName(60)).toBe('Do4');
    expect(noteName(48)).toBe('Do3');
    expect(noteName(61)).toBe('Do#4');
  });
});
