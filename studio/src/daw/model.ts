// Modelo del groovebox. Los canales (instrumento/mezcla/rack) son compartidos; cada PATRÓN guarda los
// pasos por id de canal. Operaciones inmutables (devuelven un DawState nuevo). El audio es espejo aparte.
import type { RackState } from '../fx/rack-core';

export interface Step { on: boolean; note?: number; vel?: number }
export type InstrumentSpec = { kind: 'synth'; preset: string } | { kind: 'drum'; voice: string };
export interface ChannelState {
  id: string; name: string; instrument: InstrumentSpec;
  volume: number; pan: number; muted: boolean; soloed: boolean; rack: RackState;
}
export interface PatternState { steps: Record<string, Step[]> }
export interface DawState {
  channels: ChannelState[]; patterns: PatternState[]; current: number; song: number[]; bpm: number; steps: number;
}

export const DEFAULT_STEPS = 16;

export function emptySteps(n: number): Step[] {
  return Array.from({ length: n }, () => ({ on: false }));
}

let _cid = 0;
export function newChannelId(): string { return 'ch-' + (++_cid); }

export function defaultChannel(preset = 'piano', id?: string): ChannelState {
  return {
    id: id ?? newChannelId(), name: 'Canal', instrument: { kind: 'synth', preset },
    volume: 0.8, pan: 0, muted: false, soloed: false, rack: { effects: [] }
  };
}

export function emptyPattern(channels: ChannelState[], steps: number): PatternState {
  const s: Record<string, Step[]> = {};
  for (const c of channels) s[c.id] = emptySteps(steps);
  return { steps: s };
}

export function defaultDaw(): DawState {
  const ch = defaultChannel('piano');
  return { channels: [ch], patterns: [emptyPattern([ch], DEFAULT_STEPS)], current: 0, song: [], bpm: 120, steps: DEFAULT_STEPS };
}

export function findChannel(daw: DawState, id: string): ChannelState | undefined {
  return daw.channels.find(c => c.id === id);
}

// Pasos del canal en el patrón actual (array seguro).
export function channelSteps(daw: DawState, chId: string): Step[] {
  return daw.patterns[daw.current]?.steps[chId] ?? emptySteps(daw.steps);
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
