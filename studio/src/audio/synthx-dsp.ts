// Parámetros y matemática (pura) del sinte editable por canal. Sin audio ni DOM.

export interface SynthxParams {
  sine: number; square: number; saw: number;   // 0..1 mezcla de las 3 ondas base
  sub: number;                                  // 0..1 nivel del sub-oscilador (seno, una octava abajo)
  detune: number;                               // 0..50 cents de unison (0 = sin unison)
  filterType: 'lowpass' | 'bandpass';
  cutoff: number;                               // 20..20000 Hz
  resonance: number;                            // 0.3..20 Q
  attack: number; decay: number; sustain: number; release: number;  // ADSR (sustain 0..1)
  lfoDest: 'off' | 'pitch' | 'filter';
  lfoRate: number;                              // 0.1..20 Hz
  lfoDepth: number;                             // 0..1
}

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
export const clampHz = (v: number): number => Math.max(20, Math.min(20000, v));
export const clampQ = (v: number): number => Math.max(0.3, Math.min(20, v));
export const clampTime = (v: number): number => Math.max(0, Math.min(3, v));
export const clampDetune = (v: number): number => Math.max(0, Math.min(50, v));
export const clampRate = (v: number): number => Math.max(0.1, Math.min(20, v));

// Desafinados (cents) de las voces de unison: 0 -> una voz; >0 -> par simétrico.
export function unisonDetunes(cents: number): number[] {
  return cents > 0 ? [cents, -cents] : [0];
}

// El sub-oscilador suena una octava por debajo (relación de frecuencia).
export function subFreqRatio(): number { return 0.5; }

export const SYNTHX_DEFAULT: SynthxParams = {
  sine: 0.6, square: 0, saw: 0.4, sub: 0, detune: 0,
  filterType: 'lowpass', cutoff: 6000, resonance: 1,
  attack: 0.01, decay: 0.3, sustain: 0, release: 0.2,
  lfoDest: 'off', lfoRate: 5, lfoDepth: 0.3
};

export const SYNTHX_PRESETS: Record<string, SynthxParams> = {
  bajo:  { sine: 0.5, square: 0.2, saw: 0.3, sub: 0.6, detune: 0, filterType: 'lowpass', cutoff: 800, resonance: 6, attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.15, lfoDest: 'off', lfoRate: 5, lfoDepth: 0.3 },
  lead:  { sine: 0, square: 0.3, saw: 0.7, sub: 0, detune: 12, filterType: 'lowpass', cutoff: 4000, resonance: 3, attack: 0.01, decay: 0.4, sustain: 0.6, release: 0.2, lfoDest: 'pitch', lfoRate: 5, lfoDepth: 0.1 },
  pluck: { sine: 0.6, square: 0, saw: 0.4, sub: 0, detune: 0, filterType: 'lowpass', cutoff: 6000, resonance: 2, attack: 0.005, decay: 0.25, sustain: 0, release: 0.15, lfoDest: 'off', lfoRate: 5, lfoDepth: 0.3 },
  pad:   { sine: 0.4, square: 0, saw: 0.5, sub: 0.2, detune: 18, filterType: 'lowpass', cutoff: 3000, resonance: 1, attack: 0.4, decay: 0.5, sustain: 0.7, release: 0.6, lfoDest: 'filter', lfoRate: 0.5, lfoDepth: 0.4 }
};

const PRESET_LABELS: Record<string, string> = { bajo: '🔊 Bajo', lead: '🎯 Lead', pluck: '🪕 Pluck', pad: '🌫️ Pad' };
export function synthxPresetNames(): [string, string][] {
  return Object.keys(SYNTHX_PRESETS).map(k => [k, PRESET_LABELS[k] ?? k]);
}

// Rellena defaults y aplica clamps a un objeto posiblemente incompleto (al abrir proyectos).
export function normalizeParams(p: Partial<SynthxParams> | undefined): SynthxParams {
  const d = SYNTHX_DEFAULT;
  const o = p ?? {};
  return {
    sine: clamp01(o.sine ?? d.sine), square: clamp01(o.square ?? d.square), saw: clamp01(o.saw ?? d.saw),
    sub: clamp01(o.sub ?? d.sub), detune: clampDetune(o.detune ?? d.detune),
    filterType: o.filterType === 'bandpass' ? 'bandpass' : 'lowpass',
    cutoff: clampHz(o.cutoff ?? d.cutoff), resonance: clampQ(o.resonance ?? d.resonance),
    attack: clampTime(o.attack ?? d.attack), decay: clampTime(o.decay ?? d.decay),
    sustain: clamp01(o.sustain ?? d.sustain), release: clampTime(o.release ?? d.release),
    lfoDest: (o.lfoDest === 'pitch' || o.lfoDest === 'filter') ? o.lfoDest : 'off',
    lfoRate: clampRate(o.lfoRate ?? d.lfoRate), lfoDepth: clamp01(o.lfoDepth ?? d.lfoDepth)
  };
}
