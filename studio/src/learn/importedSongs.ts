// studio/src/learn/importedSongs.ts
// Persistencia de las canciones .mid importadas en localStorage (clave propia, aparte del proyecto del Estudio).
import type { LearnSong, LearnNote } from './song';

const KEY = 'estudio-learn-songs';

function isNote(n: unknown): n is LearnNote {
  const o = n as Partial<LearnNote> | null;
  return !!o && typeof o.midi === 'number' && typeof o.startBeat === 'number' && typeof o.dur === 'number';
}
function isSong(s: unknown): s is LearnSong {
  const o = s as Partial<LearnSong> | null;
  return !!o && typeof o.id === 'string' && typeof o.name === 'string' && typeof o.bpm === 'number'
    && Array.isArray(o.notes) && o.notes.every(isNote);
}

export function serializeSongs(songs: LearnSong[]): string { return JSON.stringify(songs); }

export function parseSongs(json: string | null): LearnSong[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter(isSong) : [];
  } catch { return []; }
}

export function loadImported(): LearnSong[] {
  try { return parseSongs(localStorage.getItem(KEY)); } catch { return []; }
}

// Añade (o reemplaza por id) una canción importada y persiste. Si localStorage no está, no rompe.
export function addImported(song: LearnSong): void {
  const cur = loadImported().filter(s => s.id !== song.id);
  cur.push(song);
  try { localStorage.setItem(KEY, serializeSongs(cur)); } catch { /* no disponible */ }
}
