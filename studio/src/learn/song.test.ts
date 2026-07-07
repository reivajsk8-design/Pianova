import { describe, it, expect } from 'vitest';
import { SONGS, songRange, songsByLevel } from './song';

describe('canciones de Aprender', () => {
  it('hay al menos 3 canciones con id, nombre y notas', () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(3);
    for (const s of SONGS) {
      expect(typeof s.id).toBe('string');
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.bpm).toBeGreaterThan(0);
      expect(s.notes.length).toBeGreaterThan(0);
    }
  });
  it('las notas están ordenadas por startBeat, con dur>0 y midi de piano', () => {
    for (const s of SONGS) {
      let prev = -1;
      for (const n of s.notes) {
        expect(n.startBeat).toBeGreaterThanOrEqual(prev);
        expect(n.dur).toBeGreaterThan(0);
        expect(n.midi).toBeGreaterThanOrEqual(21);
        expect(n.midi).toBeLessThanOrEqual(108);
        prev = n.startBeat;
      }
    }
  });
  it('la primera canción es la escala de Do (60..72)', () => {
    const escala = SONGS[0];
    expect(escala.notes[0].midi).toBe(60);
    expect(escala.notes[escala.notes.length - 1].midi).toBe(72);
    expect(songRange(escala)).toEqual({ low: 60, high: 72 });
  });
  it('todas las canciones a mano tienen nivel 1, 2 o 3', () => {
    for (const s of SONGS) expect([1, 2, 3]).toContain(s.level);
  });
  it('songsByLevel filtra por nivel y hay al menos una por nivel', () => {
    for (const lvl of [1, 2, 3] as const) {
      const list = songsByLevel(lvl);
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.every(s => s.level === lvl)).toBe(true);
    }
  });
});
