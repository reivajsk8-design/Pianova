// Modelo del groovebox (datos puros + operaciones inmutables). El audio es un espejo aparte (channel.ts).
import type { RackState } from '../fx/rack-core';

export interface Step { on: boolean; note?: number; vel?: number }
export type InstrumentSpec = { kind: 'synth'; preset: string } | { kind: 'drum'; voice: string };
export interface ChannelState {
  id: string; name: string; instrument: InstrumentSpec; steps: Step[];
  volume: number; pan: number; muted: boolean; soloed: boolean; rack: RackState;
}
export interface DawState { channels: ChannelState[]; bpm: number; steps: number }

export const DEFAULT_STEPS = 16;

export function emptySteps(n: number): Step[] {
  return Array.from({ length: n }, () => ({ on: false }));
}

let _cid = 0;
export function newChannelId(): string { return 'ch-' + (++_cid); }

export function defaultChannel(preset = 'piano', steps = DEFAULT_STEPS, id?: string): ChannelState {
  return {
    id: id ?? newChannelId(), name: 'Canal', instrument: { kind: 'synth', preset },
    steps: emptySteps(steps), volume: 0.8, pan: 0, muted: false, soloed: false, rack: { effects: [] }
  };
}

export function defaultDaw(): DawState {
  return { channels: [defaultChannel('piano')], bpm: 120, steps: DEFAULT_STEPS };
}

export function findChannel(daw: DawState, id: string): ChannelState | undefined {
  return daw.channels.find(c => c.id === id);
}

export function addChannel(daw: DawState, ch: ChannelState): DawState {
  return { ...daw, channels: [...daw.channels, ch] };
}

export function removeChannel(daw: DawState, id: string): DawState {
  return { ...daw, channels: daw.channels.filter(c => c.id !== id) };
}

export function updateChannel(daw: DawState, id: string, patch: Partial<ChannelState>): DawState {
  return { ...daw, channels: daw.channels.map(c => (c.id === id ? { ...c, ...patch } : c)) };
}

export function toggleStep(daw: DawState, id: string, i: number): DawState {
  return {
    ...daw,
    channels: daw.channels.map(c => {
      if (c.id !== id) return c;
      const steps = c.steps.slice();
      steps[i] = { ...steps[i], on: !steps[i].on };
      return { ...c, steps };
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
