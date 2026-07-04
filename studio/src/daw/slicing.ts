// Troceado de audio (puro): marcas iguales / por transitorios, y utilidades de slices. Sin audio ni DOM.

export interface SliceDef {
  start: number; end: number;   // segundos dentro del buffer
  gain: number; reverse: boolean; fadeIn: number; fadeOut: number;
}

// n marcas de inicio equiespaciadas desde 0 (el slice i va de marks[i] a marks[i+1] o al final).
export function equalSlices(durationSec: number, n: number): number[] {
  const k = Math.max(1, Math.floor(n));
  return Array.from({ length: k }, (_, i) => (i * durationSec) / k);
}

// Marcas (seg) donde sube la energía (RMS por ventana). Siempre incluye 0. Umbral relativo + separación mínima.
export function detectOnsets(
  pcm: Float32Array, sampleRate: number,
  opts?: { win?: number; hop?: number; threshold?: number; minGapSec?: number }
): number[] {
  const win = opts?.win ?? 1024;
  const hop = opts?.hop ?? 512;
  const threshold = opts?.threshold ?? 1.6;
  const minGap = opts?.minGapSec ?? 0.05;
  const marks: number[] = [0];
  let prev = 0, lastMark = -Infinity;
  for (let i = 0; i + win <= pcm.length; i += hop) {
    let e = 0;
    for (let j = 0; j < win; j++) { const s = pcm[i + j]; e += s * s; }
    e = Math.sqrt(e / win);
    const t = i / sampleRate;
    if (e > Math.max(prev, 1e-4) * threshold && (t - lastMark) >= minGap && t > 0) {
      marks.push(t); lastMark = t;
    }
    prev = e;
  }
  return marks;
}

// Construye slices contiguos desde una lista de marcas (ordena, fuerza el 0, descarta fuera de [0,dur)).
export function marksToSlices(marks: number[], durationSec: number): SliceDef[] {
  const sorted = [...new Set(marks.filter(m => m >= 0 && m < durationSec))].sort((a, b) => a - b);
  if (sorted.length === 0 || sorted[0] !== 0) sorted.unshift(0);
  return sorted.map((start, i) => ({
    start, end: i + 1 < sorted.length ? sorted[i + 1] : durationSec,
    gain: 1, reverse: false, fadeIn: 0, fadeOut: 0
  }));
}

// Índice del slice que dispara una nota MIDI (slice 0 = nota base). -1 si está fuera de rango.
export function sliceIndexForNote(base: number, count: number, midi: number): number {
  const idx = midi - base;
  return (idx >= 0 && idx < count) ? idx : -1;
}
