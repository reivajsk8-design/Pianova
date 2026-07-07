// studio/src/learn/song.ts
// Canciones sencillas escritas a mano para el módulo Aprender (F4a). Tiempo en beats; una nota por beat salvo
// indicación de dur. Todas a mano derecha.
export interface LearnNote { midi: number; startBeat: number; dur: number; hand?: 'L' | 'R' }
export interface LearnSong { id: string; name: string; bpm: number; notes: LearnNote[] }

// Construye notas consecutivas (cada una empieza donde acaba la anterior) a partir de {midi, dur}.
function seq(steps: { midi: number; dur: number }[]): LearnNote[] {
  const notes: LearnNote[] = [];
  let t = 0;
  for (const s of steps) { notes.push({ midi: s.midi, startBeat: t, dur: s.dur, hand: 'R' }); t += s.dur; }
  return notes;
}
const q = (midi: number, dur = 1) => ({ midi, dur });   // atajo

export const SONGS: LearnSong[] = [
  {
    id: 'escala-do', name: 'Escala de Do', bpm: 90,
    notes: seq([60, 62, 64, 65, 67, 69, 71, 72].map(m => q(m))),
  },
  {
    id: 'estrellita', name: 'Estrellita', bpm: 100,
    notes: seq([
      q(60), q(60), q(67), q(67), q(69), q(69), q(67, 2),
      q(65), q(65), q(64), q(64), q(62), q(62), q(60, 2),
    ]),
  },
  {
    id: 'oda-alegria', name: 'Oda a la alegría', bpm: 100,
    notes: seq([
      q(64), q(64), q(65), q(67), q(67), q(65), q(64), q(62),
      q(60), q(60), q(62), q(64), q(64, 1.5), q(62, 0.5), q(62, 2),
    ]),
  },
];

// Rango de teclas de la canción (grave/agudo). Si está vacía, un octava alrededor de Do central.
export function songRange(song: LearnSong): { low: number; high: number } {
  if (!song.notes.length) return { low: 60, high: 72 };
  let low = Infinity, high = -Infinity;
  for (const n of song.notes) { if (n.midi < low) low = n.midi; if (n.midi > high) high = n.midi; }
  return { low, high };
}
