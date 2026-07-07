import { describe, it, expect } from 'vitest';
import { CHORDS, chordNotes } from './chords';

describe('acordes comunes', () => {
  it('CHORDS incluye los tipos esperados con "—" para none', () => {
    expect(CHORDS.none.label).toBe('—');
    expect(CHORDS.maj.intervals).toEqual([0, 4, 7]);
    expect(CHORDS.min.intervals).toEqual([0, 3, 7]);
    expect(CHORDS.dom7.intervals).toEqual([0, 4, 7, 10]);
  });
  it('chordNotes suma los intervalos a la raíz', () => {
    expect(chordNotes(60, 'maj')).toEqual([60, 64, 67]);
    expect(chordNotes(60, 'min')).toEqual([60, 63, 67]);
    expect(chordNotes(60, 'power')).toEqual([60, 67]);
  });
  it('chordNotes con none o tipo desconocido → una sola nota', () => {
    expect(chordNotes(60, 'none')).toEqual([60]);
    expect(chordNotes(60, 'zzz')).toEqual([60]);
  });
  it('chordNotes recorta a 0..127 y quita duplicados', () => {
    expect(chordNotes(125, 'maj')).toEqual([125]);   // 129 y 132 se salen
    expect(chordNotes(-2, 'power')).toEqual([5]);     // -2 se sale; -2+7=5 entra
  });
});
