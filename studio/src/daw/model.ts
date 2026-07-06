// Modelo del groovebox. Los canales (instrumento/mezcla/rack) son compartidos; cada PATRÓN guarda los
// pasos por id de canal. Operaciones inmutables (devuelven un DawState nuevo). El audio es espejo aparte.
import type { RackState } from '../fx/rack-core';
import type { SynthxParams } from '../audio/synthx-dsp';
import { SYNTHX_DEFAULT } from '../audio/synthx-dsp';
import type { SliceDef } from './slicing';

export interface Step { on: boolean; note?: number; vel?: number; len?: number }
export type InstrumentSpec =
  | { kind: 'synth'; preset: string }
  | { kind: 'drum'; voice: string }
  | { kind: 'synthx'; params: SynthxParams }
  | { kind: 'slicer'; sampleId: string; base: number; slices: SliceDef[] };
export interface ChannelState {
  id: string; name: string; instrument: InstrumentSpec;
  volume: number; pan: number; muted: boolean; soloed: boolean; rack: RackState; humanize?: number; subdiv?: number;
}
export interface PatternState { steps: Record<string, Step[]> }
export interface DawState {
  channels: ChannelState[]; patterns: PatternState[]; current: number; song: number[]; bpm: number; steps: number; swing: number;
  scaleRoot: number; scaleType: string;
}

export const DEFAULT_STEPS = 16;

export function emptySteps(n: number): Step[] {
  return Array.from({ length: n }, () => ({ on: false }));
}

let _cid = 0;
export function newChannelId(): string { return 'ch-' + (++_cid); }

// Sincroniza el contador de ids con los canales ya presentes (al cargar un proyecto de localStorage
// o de un archivo): sube _cid por encima del mayor 'ch-N' existente para que newChannelId() nunca
// repita un id ya en uso. Sin esto, tras recargar (el contador vuelve a 0) el primer canal añadido
// recibía 'ch-1', duplicando el id del canal existente → se seleccionaban/sonaban dos a la vez.
export function syncChannelIdSeed(channels: { id: string }[]): void {
  for (const c of channels) {
    const m = /^ch-(\d+)$/.exec(c.id);
    if (m) { const n = +m[1]; if (n > _cid) _cid = n; }
  }
}

export function defaultChannel(preset = 'piano', id?: string): ChannelState {
  return {
    id: id ?? newChannelId(), name: 'Canal', instrument: { kind: 'synth', preset },
    volume: 0.8, pan: 0, muted: false, soloed: false, rack: { effects: [] }, humanize: 0, subdiv: 4
  };
}

export function defaultSynthxInstrument(): InstrumentSpec {
  return { kind: 'synthx', params: { ...SYNTHX_DEFAULT } };
}

export function defaultSlicerInstrument(sampleId: string, base = 60): InstrumentSpec {
  return { kind: 'slicer', sampleId, base, slices: [] };
}

export function emptyPattern(channels: ChannelState[], steps: number): PatternState {
  const s: Record<string, Step[]> = {};
  for (const c of channels) s[c.id] = emptySteps(steps);
  return { steps: s };
}

export function defaultDaw(): DawState {
  const ch = defaultChannel('piano');
  return { channels: [ch], patterns: [emptyPattern([ch], DEFAULT_STEPS)], current: 0, song: [], bpm: 120, steps: DEFAULT_STEPS, swing: 0, scaleRoot: 0, scaleType: 'chromatic' };
}

export function findChannel(daw: DawState, id: string): ChannelState | undefined {
  return daw.channels.find(c => c.id === id);
}

// Pasos del canal en el patrón actual (array seguro).
export function channelSteps(daw: DawState, chId: string): Step[] {
  return daw.patterns[daw.current]?.steps[chId] ?? emptySteps(daw.steps);
}

// Longitud (nº de pasos) del canal en el patrón ACTUAL; por defecto daw.steps si no existe el array.
export function channelLen(daw: DawState, id: string): number {
  return daw.patterns[daw.current]?.steps[id]?.length ?? daw.steps;
}

// Añade una página (DEFAULT_STEPS pasos vacíos) al final del canal en el patrón actual (inmutable).
export function addStepsPage(daw: DawState, id: string): DawState {
  return {
    ...daw,
    patterns: daw.patterns.map((p, idx) => {
      if (idx !== daw.current) return p;
      const cur = p.steps[id] ?? emptySteps(daw.steps);
      return { steps: { ...p.steps, [id]: [...cur, ...emptySteps(DEFAULT_STEPS)] } };
    })
  };
}

// Quita una página (DEFAULT_STEPS pasos del final) del canal en el patrón actual; nunca por debajo de una página.
export function removeStepsPage(daw: DawState, id: string): DawState {
  return {
    ...daw,
    patterns: daw.patterns.map((p, idx) => {
      if (idx !== daw.current) return p;
      const cur = p.steps[id];
      if (!cur || cur.length <= DEFAULT_STEPS) return p;
      return { steps: { ...p.steps, [id]: cur.slice(0, cur.length - DEFAULT_STEPS) } };
    })
  };
}

export function addChannel(daw: DawState, ch: ChannelState): DawState {
  return {
    ...daw,
    channels: [...daw.channels, ch],
    patterns: daw.patterns.map(p => ({ steps: { ...p.steps, [ch.id]: emptySteps(daw.steps) } }))
  };
}

export function removeChannel(daw: DawState, id: string): DawState {
  return {
    ...daw,
    channels: daw.channels.filter(c => c.id !== id),
    patterns: daw.patterns.map(p => { const s = { ...p.steps }; delete s[id]; return { steps: s }; })
  };
}

export function updateChannel(daw: DawState, id: string, patch: Partial<ChannelState>): DawState {
  return { ...daw, channels: daw.channels.map(c => (c.id === id ? { ...c, ...patch } : c)) };
}

export function toggleStep(daw: DawState, chId: string, i: number): DawState {
  return {
    ...daw,
    patterns: daw.patterns.map((p, idx) => {
      if (idx !== daw.current) return p;
      const cur = p.steps[chId] ?? emptySteps(daw.steps);
      const steps = cur.slice();
      steps[i] = { ...steps[i], on: !steps[i].on };
      return { steps: { ...p.steps, [chId]: steps } };
    })
  };
}

// Fija el paso `i` (objeto Step completo) del canal en el patrón actual (para grabar en vivo). Inmutable.
export function setStep(daw: DawState, chId: string, i: number, step: Step): DawState {
  return {
    ...daw,
    patterns: daw.patterns.map((p, idx) => {
      if (idx !== daw.current) return p;
      const cur = p.steps[chId] ?? emptySteps(daw.steps);
      const steps = cur.slice();
      steps[i] = step;
      return { steps: { ...p.steps, [chId]: steps } };
    })
  };
}

// Longitud real de la nota que empieza en `i`: su `len` (o 1) recortado al final del canal.
export function effectiveLen(steps: Step[], i: number): number {
  const raw = steps[i]?.len ?? 1;
  return Math.max(1, Math.min(raw, steps.length - i));
}

// Coloca/alarga una nota en el patrón actual: fija el paso `start` (on+note+len recortado) y LIMPIA los pasos
// cubiertos start+1 … start+len-1 (monofónico: "pintar gana"). Conserva `vel` si lo había. Inmutable.
export function paintNote(daw: DawState, chId: string, start: number, len: number, note: number): DawState {
  return {
    ...daw,
    patterns: daw.patterns.map((p, idx) => {
      if (idx !== daw.current) return p;
      const cur = p.steps[chId] ?? emptySteps(daw.steps);
      const L = Math.max(1, Math.min(len, cur.length - start));
      const steps = cur.slice();
      steps[start] = { ...steps[start], on: true, note, len: L };
      for (let k = start + 1; k < start + L; k++) steps[k] = { ...steps[k], on: false };
      return { steps: { ...p.steps, [chId]: steps } };
    })
  };
}

// Duplica el patrón `idx`: inserta una COPIA PROFUNDA justo detrás y deja `current` en el nuevo. Los patrones
// tras `idx` se desplazan +1, así que la canción reindexa (p > idx → p+1). Fuera de rango: devuelve `daw`.
export function duplicatePattern(daw: DawState, idx: number): DawState {
  if (idx < 0 || idx >= daw.patterns.length) return daw;
  const copy: Record<string, Step[]> = {};
  const src = daw.patterns[idx].steps;
  for (const id of Object.keys(src)) copy[id] = src[id].map(s => ({ ...s }));
  const patterns = [...daw.patterns.slice(0, idx + 1), { steps: copy }, ...daw.patterns.slice(idx + 1)];
  const song = daw.song.map(p => (p > idx ? p + 1 : p));
  return { ...daw, patterns, current: idx + 1, song };
}

// Solo/mute efectivo: si hay algún solo, suenan solo los soloed; si no, los no muteados.
export function audibleIds(channels: ChannelState[]): Set<string> {
  const anySolo = channels.some(c => c.soloed);
  const ids = new Set<string>();
  for (const c of channels) if (anySolo ? c.soloed : !c.muted) ids.add(c.id);
  return ids;
}

// --- patrones ---
export function addPattern(daw: DawState): DawState {
  return { ...daw, patterns: [...daw.patterns, emptyPattern(daw.channels, daw.steps)], current: daw.patterns.length };
}
export function removePattern(daw: DawState, idx: number): DawState {
  if (daw.patterns.length <= 1) return daw;
  const patterns = daw.patterns.filter((_, i) => i !== idx);
  const current = Math.min(daw.current, patterns.length - 1);
  const song = daw.song.filter(p => p !== idx).map(p => (p > idx ? p - 1 : p));
  return { ...daw, patterns, current, song };
}
export function setCurrentPattern(daw: DawState, idx: number): DawState {
  return { ...daw, current: Math.max(0, Math.min(idx, daw.patterns.length - 1)) };
}
export function setSong(daw: DawState, song: number[]): DawState {
  return { ...daw, song };
}
