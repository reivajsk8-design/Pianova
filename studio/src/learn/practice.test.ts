import { describe, it, expect } from 'vitest';
import { makePractice, targetNote, judge } from './practice';
import type { LearnNote } from './song';

const notes: LearnNote[] = [
  { midi: 60, startBeat: 0, dur: 1 },
  { midi: 62, startBeat: 1, dur: 1 },
  { midi: 64, startBeat: 2, dur: 1 },
];

describe('practice', () => {
  it('makePractice arranca en idx 0, sin terminar', () => {
    const s = makePractice(notes);
    expect(s.idx).toBe(0); expect(s.done).toBe(false); expect(s.hits).toBe(0);
    expect(targetNote(s)?.midi).toBe(60);
  });
  it('makePractice con lista vacía está terminado', () => {
    const s = makePractice([]);
    expect(s.done).toBe(true); expect(targetNote(s)).toBeUndefined();
  });
  it('la nota equivocada no avanza; la correcta avanza y suma hit', () => {
    const s = makePractice(notes);
    expect(judge(s, 61)).toEqual({ advanced: false, idx: 0, done: false });
    expect(s.hits).toBe(0);
    expect(judge(s, 60)).toEqual({ advanced: true, idx: 1, done: false });
    expect(s.hits).toBe(1);
    expect(targetNote(s)?.midi).toBe(62);
  });
  it('al tocar la última nota queda done, y luego es no-op', () => {
    const s = makePractice(notes);
    judge(s, 60); judge(s, 62);
    const last = judge(s, 64);
    expect(last).toEqual({ advanced: true, idx: 3, done: true });
    expect(s.done).toBe(true);
    expect(judge(s, 60)).toEqual({ advanced: false, idx: 3, done: true });
  });
});
