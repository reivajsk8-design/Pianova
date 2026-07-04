import { describe, it, expect } from 'vitest';
import { equalSlices, detectOnsets, marksToSlices, sliceIndexForNote } from './slicing';

describe('slicing', () => {
  it('equalSlices da n marcas de inicio equiespaciadas', () => {
    expect(equalSlices(4, 4)).toEqual([0, 1, 2, 3]);
    expect(equalSlices(1, 1)).toEqual([0]);
  });

  it('marksToSlices crea slices contiguos con defaults', () => {
    const s = marksToSlices([0, 1, 2], 3);
    expect(s.length).toBe(3);
    expect(s[0]).toEqual({ start: 0, end: 1, gain: 1, reverse: false, fadeIn: 0, fadeOut: 0 });
    expect(s[2].end).toBe(3);           // el último llega hasta la duración
  });

  it('marksToSlices ordena, fuerza el 0 y descarta fuera de rango', () => {
    const s = marksToSlices([2, 0.5, -1, 5], 3);   // dur 3: descarta -1 y 5
    expect(s.map(x => x.start)).toEqual([0, 0.5, 2]);
  });

  it('detectOnsets encuentra los golpes (además del 0)', () => {
    const sr = 8000; const pcm = new Float32Array(sr * 2);   // 2 s de silencio
    for (let k = 0; k < 500; k++) { pcm[Math.floor(0.5 * sr) + k] = 0.8; pcm[Math.floor(1.2 * sr) + k] = 0.8; }
    const m = detectOnsets(pcm, sr);
    expect(m[0]).toBe(0);
    expect(m.some(x => Math.abs(x - 0.5) < 0.06)).toBe(true);
    expect(m.some(x => Math.abs(x - 1.2) < 0.06)).toBe(true);
  });

  it('sliceIndexForNote mapea nota→índice y acota', () => {
    expect(sliceIndexForNote(60, 4, 60)).toBe(0);
    expect(sliceIndexForNote(60, 4, 63)).toBe(3);
    expect(sliceIndexForNote(60, 4, 64)).toBe(-1);
    expect(sliceIndexForNote(60, 4, 59)).toBe(-1);
  });
});
