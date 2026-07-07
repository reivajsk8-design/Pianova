// studio/src/learn/song.ts
// Canciones sencillas escritas a mano para el módulo Aprender (F4a). Tiempo en beats; una nota por beat salvo
// indicación de dur. Todas a mano derecha.
export interface LearnNote { midi: number; startBeat: number; dur: number; hand?: 'L' | 'R' }
export interface LearnSong { id: string; name: string; bpm: number; level?: 1 | 2 | 3; notes: LearnNote[] }

// Construye notas consecutivas (cada una empieza donde acaba la anterior) a partir de {midi, dur}.
function seq(steps: { midi: number; dur: number }[]): LearnNote[] {
  const notes: LearnNote[] = [];
  let t = 0;
  for (const s of steps) { notes.push({ midi: s.midi, startBeat: t, dur: s.dur, hand: 'R' }); t += s.dur; }
  return notes;
}
const q = (midi: number, dur = 1) => ({ midi, dur });   // atajo

export const SONGS: LearnSong[] = [
  // --- Fácil (nivel 1) ---
  { id: 'escala-do', name: 'Escala de Do', bpm: 90, level: 1,
    notes: seq([60, 62, 64, 65, 67, 69, 71, 72].map(m => q(m))) },
  { id: 'estrellita', name: 'Estrellita', bpm: 100, level: 1,
    notes: seq([q(60), q(60), q(67), q(67), q(69), q(69), q(67, 2), q(65), q(65), q(64), q(64), q(62), q(62), q(60, 2)]) },
  { id: 'martinillo', name: 'Martinillo', bpm: 100, level: 1,
    notes: seq([
      q(60), q(62), q(64), q(60), q(60), q(62), q(64), q(60),
      q(64), q(65), q(67, 2), q(64), q(65), q(67, 2),
      q(67), q(69), q(67), q(65), q(64), q(60), q(67), q(69), q(67), q(65), q(64), q(60),
      q(60), q(55), q(60, 2), q(60), q(55), q(60, 2),
    ]) },
  { id: 'oda-alegria', name: 'Oda a la alegría', bpm: 100, level: 1,
    notes: seq([q(64), q(64), q(65), q(67), q(67), q(65), q(64), q(62), q(60), q(60), q(62), q(64), q(64, 1.5), q(62, 0.5), q(62, 2)]) },
  // --- Medio (nivel 2) ---
  { id: 'cumpleanos', name: 'Cumpleaños feliz', bpm: 100, level: 2,
    notes: seq([
      q(67, 0.5), q(67, 0.5), q(69), q(67), q(72), q(71, 2),
      q(67, 0.5), q(67, 0.5), q(69), q(67), q(74), q(72, 2),
      q(67, 0.5), q(67, 0.5), q(79), q(76), q(72), q(71), q(69),
      q(77, 0.5), q(77, 0.5), q(76), q(72), q(74), q(72, 2),
    ]) },
  { id: 'jingle-bells', name: 'Jingle Bells', bpm: 120, level: 2,
    notes: seq([
      q(64), q(64), q(64, 2), q(64), q(64), q(64, 2),
      q(64), q(67), q(60), q(62), q(64, 2),
      q(65), q(65), q(65), q(65), q(65), q(64), q(64), q(64),
      q(64), q(62), q(62), q(64), q(62, 2), q(67, 2),
    ]) },
  { id: 'noche-paz', name: 'Noche de paz', bpm: 90, level: 2,
    notes: seq([
      q(67, 1.5), q(69, 0.5), q(67), q(64, 3),
      q(67, 1.5), q(69, 0.5), q(67), q(64, 3),
      q(74, 2), q(74), q(71, 3), q(72, 2), q(72), q(67, 3),
    ]) },
  // --- Difícil (nivel 3) ---
  { id: 'fur-elise', name: 'Für Elise', bpm: 80, level: 3,
    notes: seq([
      q(76, 0.5), q(75, 0.5), q(76, 0.5), q(75, 0.5), q(76, 0.5), q(71, 0.5), q(74, 0.5), q(72, 0.5), q(69, 1),
      q(60, 0.5), q(64, 0.5), q(69, 0.5), q(71, 1),
      q(64, 0.5), q(68, 0.5), q(71, 0.5), q(72, 1),
    ]) },
  { id: 'minueto-sol', name: 'Minueto en Sol', bpm: 110, level: 3,
    notes: seq([
      q(74, 2), q(67), q(69), q(71), q(72), q(74),
      q(67, 2), q(67, 2),
      q(76, 2), q(72), q(74), q(76), q(78), q(79),
      q(67, 2), q(67, 2),
    ]) },
];

// Rango de teclas de la canción (grave/agudo). Si está vacía, un octava alrededor de Do central.
export function songRange(song: LearnSong): { low: number; high: number } {
  if (!song.notes.length) return { low: 60, high: 72 };
  let low = Infinity, high = -Infinity;
  for (const n of song.notes) { if (n.midi < low) low = n.midi; if (n.midi > high) high = n.midi; }
  return { low, high };
}

// Canciones a mano de un nivel de dificultad (1 Fácil, 2 Medio, 3 Difícil).
export function songsByLevel(level: 1 | 2 | 3): LearnSong[] {
  return SONGS.filter(s => s.level === level);
}
