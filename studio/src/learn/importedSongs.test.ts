import { describe, it, expect } from 'vitest';
import { serializeSongs, parseSongs } from './importedSongs';
import type { LearnSong } from './song';

const song: LearnSong = { id: 'mid-x', name: 'X', bpm: 100, notes: [{ midi: 60, startBeat: 0, dur: 1 }] };

describe('importedSongs (serializar/parsear)', () => {
  it('ida y vuelta conserva las canciones', () => {
    expect(parseSongs(serializeSongs([song]))).toEqual([song]);
  });
  it('null o JSON inválido → []', () => {
    expect(parseSongs(null)).toEqual([]);
    expect(parseSongs('no-json')).toEqual([]);
  });
  it('descarta entradas mal formadas', () => {
    const json = JSON.stringify([song, { id: 'malo' }, { id: 'y', name: 'Y', bpm: 90, notes: 'x' }]);
    expect(parseSongs(json)).toEqual([song]);
  });
});
