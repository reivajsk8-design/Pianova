// studio/src/mod/lfo.ts
// LFO (oscilador de baja frecuencia) puro: formas de onda y cálculo de periodo. Sin estado ni DOM.
export type LfoWave = 'sine' | 'tri' | 'sawUp' | 'sawDown' | 'square' | 'random';

// Pseudoaleatorio determinista en [0,1) a partir de un entero (para el Sample & Hold; sin Math.random → puro).
export function hash01(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// Valor del LFO en [-1,1]. `t` = tiempo/periodo (parte entera = ciclo, fracción = fase).
export function lfoValue(wave: LfoWave, t: number): number {
  const p = t - Math.floor(t);                 // fase 0..1
  switch (wave) {
    case 'sine':    return Math.sin(2 * Math.PI * p);
    case 'tri':     return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;   // empieza en 0
    case 'sawUp':   return 2 * p - 1;
    case 'sawDown': return 1 - 2 * p;
    case 'square':  return p < 0.5 ? 1 : -1;
    case 'random':  return hash01(Math.floor(t)) * 2 - 1;   // estable dentro de cada ciclo (S&H)
    default:        return 0;
  }
}

// Figuras de sincronización (en negras/beats).
export interface RateFigure { key: string; label: string; beats: number }
export const RATE_FIGURES: RateFigure[] = [
  { key: '2c',   label: '2 comp', beats: 8 },
  { key: '1c',   label: '1 comp', beats: 4 },
  { key: '1/2',  label: '1/2',    beats: 2 },
  { key: '1/4',  label: '1/4',    beats: 1 },
  { key: '1/8',  label: '1/8',    beats: 0.5 },
  { key: '1/16', label: '1/16',   beats: 0.25 },
  { key: '1/4T', label: '1/4T',   beats: 2 / 3 },
  { key: '1/8T', label: '1/8T',   beats: 1 / 3 },
];

// Periodo en segundos. sync: figura·(60/bpm). free: 1/Hz. Con guardas (bpm/hz ≤ 0 → valor seguro).
export function periodSeconds(mode: 'sync' | 'free', rateKey: string, hz: number, bpm: number): number {
  if (mode === 'free') return hz > 0 ? 1 / hz : 1;
  const fig = RATE_FIGURES.find(f => f.key === rateKey);
  const beats = fig ? fig.beats : 1;
  return beats * (60 / Math.max(1, bpm));
}
