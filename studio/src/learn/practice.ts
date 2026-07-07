// studio/src/learn/practice.ts
// Lógica pedagógica del modo Practicar (portada de pianova.html): la melodía espera en la nota actual hasta que
// tocas su tono; al acertar, avanza. Estado transitorio de UI (se muta), no persistido.
import type { LearnNote } from './song';

export interface PracticeState { notes: LearnNote[]; idx: number; done: boolean; hits: number }
export interface JudgeResult { advanced: boolean; idx: number; done: boolean }

export function makePractice(notes: LearnNote[]): PracticeState {
  return { notes, idx: 0, done: notes.length === 0, hits: 0 };
}

// Nota que hay que tocar ahora (o undefined si la canción terminó).
export function targetNote(s: PracticeState): LearnNote | undefined {
  return s.done ? undefined : s.notes[s.idx];
}

// Juzga una nota tocada. Si el tono coincide con la nota objetivo, avanza (y marca done al llegar al final).
// Las notas equivocadas se ignoran. Muta `s` y devuelve el resultado.
export function judge(s: PracticeState, midi: number): JudgeResult {
  if (s.done) return { advanced: false, idx: s.idx, done: true };
  if (s.notes[s.idx].midi !== midi) return { advanced: false, idx: s.idx, done: false };
  s.idx++; s.hits++;
  if (s.idx >= s.notes.length) s.done = true;
  return { advanced: true, idx: s.idx, done: s.done };
}
