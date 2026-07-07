// studio/src/mod/modEngine.ts
// Motor de modulación: banco de LFOs + asignaciones (por id de knob) + registro de destinos runtime. El `tick`
// aplica base ± profundidad·rango·onda SOLO al audio (no toca el valor base ni persiste). La app posee el rAF.
import { lfoValue, periodSeconds, type LfoWave } from './lfo';

export interface LfoConfig { on: boolean; wave: LfoWave; mode: 'sync' | 'free'; rateKey: string; hz: number }
export interface Assignment { lfo: number; depth: number }              // depth 0..1 (fracción bipolar del rango)
export interface ModState { lfos: LfoConfig[]; assign: Record<string, Assignment> }

// Destino runtime que registra cada knob modulable (NO se persiste).
export interface ModTarget {
  min: number; max: number;
  getBase: () => number;
  applyAudio: (v: number) => void;
  setVisual?: (v: number) => void;
}

export const LFO_COUNT = 4;
const WAVES: LfoWave[] = ['sine', 'tri', 'sawUp', 'sawDown', 'square', 'random'];

export function defaultLfos(n = LFO_COUNT): LfoConfig[] {
  return Array.from({ length: n }, () => ({ on: false, wave: 'sine' as LfoWave, mode: 'sync' as const, rateKey: '1/4', hz: 1 }));
}
export function defaultModState(): ModState { return { lfos: defaultLfos(), assign: {} }; }

function sanitizeLfo(o: unknown): LfoConfig {
  const c = (o ?? {}) as Partial<LfoConfig>;
  return {
    on: c.on === true,
    wave: WAVES.includes(c.wave as LfoWave) ? (c.wave as LfoWave) : 'sine',
    mode: c.mode === 'free' ? 'free' : 'sync',
    rateKey: typeof c.rateKey === 'string' ? c.rateKey : '1/4',
    hz: typeof c.hz === 'number' && c.hz > 0 ? c.hz : 1,
  };
}
export function sanitizeModState(o: unknown): ModState {
  const s = (o ?? {}) as Partial<ModState>;
  const lfos = defaultLfos();
  if (Array.isArray(s.lfos)) for (let i = 0; i < LFO_COUNT; i++) if (s.lfos[i]) lfos[i] = sanitizeLfo(s.lfos[i]);
  const assign: Record<string, Assignment> = {};
  const src = (s.assign && typeof s.assign === 'object') ? s.assign as Record<string, unknown> : {};
  for (const id of Object.keys(src)) {
    const a = src[id] as Partial<Assignment>;
    if (a && typeof a.lfo === 'number' && a.lfo >= 0 && a.lfo < LFO_COUNT) {
      const depth = typeof a.depth === 'number' ? Math.max(0, Math.min(1, a.depth)) : 0.5;
      assign[id] = { lfo: a.lfo, depth };
    }
  }
  return { lfos, assign };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

let lfos = defaultLfos();
let assign: Record<string, Assignment> = {};
let bpm = 120;
let wake: (() => void) | null = null;
const targets = new Map<string, ModTarget>();
const activePrev = new Set<string>();

export const modEngine = {
  register(id: string, t: ModTarget): void { targets.set(id, t); },
  unregister(id: string): void { targets.delete(id); },
  getLfos(): LfoConfig[] { return lfos.map(l => ({ ...l })); },
  setLfo(i: number, patch: Partial<LfoConfig>): void { if (lfos[i]) { lfos[i] = { ...lfos[i], ...patch }; wake?.(); } },
  getAssign(id: string): Assignment | undefined { const a = assign[id]; return a ? { ...a } : undefined; },
  assign(id: string, lfo: number, depth: number): void { assign[id] = { lfo, depth: clamp(depth, 0, 1) }; wake?.(); },
  unassign(id: string): void { delete assign[id]; },
  setBpm(v: number): void { bpm = v; },
  setWake(fn: () => void): void { wake = fn; },
  isActive(): boolean {
    for (const id of Object.keys(assign)) { const a = assign[id]; if (lfos[a.lfo]?.on && targets.has(id)) return true; }
    return false;
  },
  tick(timeSec: number): void {
    const nowActive = new Set<string>();
    for (const id of Object.keys(assign)) {
      const a = assign[id]; const lfo = lfos[a.lfo]; const t = targets.get(id);
      if (!lfo || !lfo.on || !t) continue;
      const period = periodSeconds(lfo.mode, lfo.rateKey, lfo.hz, bpm);
      const w = lfoValue(lfo.wave, timeSec / period);
      const v = clamp(t.getBase() + a.depth * (t.max - t.min) * w, t.min, t.max);
      t.applyAudio(v); t.setVisual?.(v);
      nowActive.add(id);
    }
    for (const id of activePrev) {
      if (!nowActive.has(id)) { const t = targets.get(id); if (t) { const b = t.getBase(); t.applyAudio(b); t.setVisual?.(b); } }
    }
    activePrev.clear(); for (const id of nowActive) activePrev.add(id);
  },
  getState(): ModState { return { lfos: lfos.map(l => ({ ...l })), assign: { ...assign } }; },
  setState(s: ModState): void { const c = sanitizeModState(s); lfos = c.lfos; assign = c.assign; activePrev.clear(); },
};
