import { describe, it, expect } from 'vitest';
import { KEY_TO_SEMITONE } from './keyboard';

describe('KEY_TO_SEMITONE', () => {
  it('mapea blancas A S D F G H J K a C D E F G A B C', () => {
    expect(KEY_TO_SEMITONE.a).toBe(0);  expect(KEY_TO_SEMITONE.s).toBe(2);
    expect(KEY_TO_SEMITONE.d).toBe(4);  expect(KEY_TO_SEMITONE.f).toBe(5);
    expect(KEY_TO_SEMITONE.g).toBe(7);  expect(KEY_TO_SEMITONE.h).toBe(9);
    expect(KEY_TO_SEMITONE.j).toBe(11); expect(KEY_TO_SEMITONE.k).toBe(12);
  });
  it('mapea negras W E T Y U a C# D# F# G# A#', () => {
    expect(KEY_TO_SEMITONE.w).toBe(1);  expect(KEY_TO_SEMITONE.e).toBe(3);
    expect(KEY_TO_SEMITONE.t).toBe(6);  expect(KEY_TO_SEMITONE.y).toBe(8);
    expect(KEY_TO_SEMITONE.u).toBe(10);
  });
});
