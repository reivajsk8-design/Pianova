// studio/src/ui/hitViz.ts
// Matemática pura de la iluminación reactiva (destello de pads + progreso de slices).
// Sin estado ni DOM: fácil de testear. La consume studioView (pads/slices) y sampleEditor (cursor).

export interface PadHit { t: number; vel: number }          // t: tiempo de audio (s); vel: 0–1
export interface SliceHit { index: number; t: number; dur: number }   // dur: duración audible (s)
export interface ActiveSlice { index: number; progress: number }      // progress: 0–1

// Brillo 0–1 de un destello: decae linealmente sobre `fadeSec`; escala por velocity con suelo y techo.
export function flashLevel(ageSec: number, velNorm: number, fadeSec: number): number {
  if (fadeSec <= 0 || ageSec < 0 || ageSec >= fadeSec) return 0;
  const decay = 1 - ageSec / fadeSec;                 // 1 → 0
  const v = Math.max(0, Math.min(1, velNorm));
  const scale = 0.45 + 0.55 * v;                      // suelo 0.45 (golpe suave visible), techo 1
  return decay * scale;
}

// Progreso del recorrido de un slice: (now-start)/dur, SIN acotar. Activo si está en [0,1).
// dur <= 0 → 1 (inactivo).
export function sliceProgress(nowSec: number, startSec: number, durSec: number): number {
  if (durSec <= 0) return 1;
  return (nowSec - startSec) / durSec;
}

// Brillo 0–1 de un pad a partir de su último golpe (o 0 si no hay).
export function padLevel(hit: PadHit | undefined, nowSec: number, fadeSec: number): number {
  if (!hit) return 0;
  return flashLevel(nowSec - hit.t, hit.vel, fadeSec);
}

// Slices activos (progress en [0,1)) con su progreso, a partir de los golpes registrados.
export function activeSlices(hits: SliceHit[], nowSec: number): ActiveSlice[] {
  const out: ActiveSlice[] = [];
  for (const h of hits) {
    const p = sliceProgress(nowSec, h.t, h.dur);
    if (p >= 0 && p < 1) out.push({ index: h.index, progress: p });
  }
  return out;
}
