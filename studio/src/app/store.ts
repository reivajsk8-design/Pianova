// Persistencia del Estudio (proyecto v3: groovebox con patrones). Migra v1/v2 a v3.
import type { RackState } from '../fx/rack-core';
import { DawState, ChannelState, Step, defaultDaw, defaultChannel, emptySteps } from '../daw/model';
import { normalizeParams } from '../audio/synthx-dsp';
import { serializeSamples, restoreSamples } from '../audio/sampleStore';

export const PROJECT_VERSION = 3;
const KEY = 'estudio-v1';
const emptyRack = (): RackState => ({ effects: [] });

export interface ProjectState { version: number; daw: DawState; masterRack: RackState; samples?: Record<string, { name: string; b64: string }> }

export function defaultProject(): ProjectState {
  return { version: PROJECT_VERSION, daw: defaultDaw(), masterRack: emptyRack(), samples: {} };
}

export function serializeProject(p: ProjectState): string { return JSON.stringify({ ...p, samples: p.samples || serializeSamples() }); }

function rackOf(v: unknown): RackState {
  return (v && typeof v === 'object' && Array.isArray((v as RackState).effects)) ? (v as RackState) : emptyRack();
}

// Normaliza el instrumento de un canal (rellena/acota los params de synthx; deja synth/drum igual).
function normalizeChannel(c: ChannelState): ChannelState {
  if (c.instrument && c.instrument.kind === 'synthx') {
    return { ...c, instrument: { kind: 'synthx', params: normalizeParams(c.instrument.params) } };
  }
  return c;
}

// Acepta un DawState v3 ya formado (con valores por defecto si faltan campos).
function dawV3(v: unknown): DawState {
  const o = v as Partial<DawState> | undefined;
  if (!o || !Array.isArray(o.channels) || o.channels.length === 0 || !Array.isArray(o.patterns) || o.patterns.length === 0) return defaultDaw();
  return {
    channels: o.channels.map(normalizeChannel),
    patterns: o.patterns,
    current: typeof o.current === 'number' ? o.current : 0,
    song: Array.isArray(o.song) ? o.song : [],
    bpm: typeof o.bpm === 'number' ? o.bpm : 120,
    steps: typeof o.steps === 'number' ? o.steps : 16,
    swing: typeof o.swing === 'number' ? o.swing : 0
  };
}

// Convierte un DawState v2 (canales con `steps`) a v3 (pasos en el patrón 0; canales sin pasos).
function dawV2toV3(v: unknown): DawState {
  const o = v as { channels?: (ChannelState & { steps?: Step[] })[]; bpm?: number; steps?: number } | undefined;
  if (!o || !Array.isArray(o.channels) || o.channels.length === 0) return defaultDaw();
  const total = typeof o.steps === 'number' ? o.steps : 16;
  const stepsByCh: Record<string, Step[]> = {};
  const channels: ChannelState[] = o.channels.map(c => {
    stepsByCh[c.id] = Array.isArray(c.steps) ? c.steps : emptySteps(total);
    const { steps: _omit, ...rest } = c;   // quita `steps` del canal
    void _omit;
    return rest as ChannelState;
  });
  return { channels, patterns: [{ steps: stepsByCh }], current: 0, song: [], bpm: typeof o.bpm === 'number' ? o.bpm : 120, steps: total, swing: 0 };
}

function migrate(o: Record<string, unknown>): ProjectState {
  const masterRack = rackOf(o.masterRack);
  if (o.version === 3 && o.daw) return { version: 3, daw: dawV3(o.daw), masterRack };
  if (o.version === 2 && o.daw) return { version: 3, daw: dawV2toV3(o.daw), masterRack };
  // v1 o desconocido → canal 0 + patrón 0
  const preset = typeof o.instrument === 'string' ? o.instrument : 'piano';
  const ch = defaultChannel(preset);
  ch.rack = rackOf(o.instrumentRack);
  return { version: 3, daw: { channels: [ch], patterns: [{ steps: { [ch.id]: emptySteps(16) } }], current: 0, song: [], bpm: 120, steps: 16, swing: 0 }, masterRack };
}

export function parseProject(json: string): ProjectState {
  const o = JSON.parse(json) as Record<string, unknown>;
  const base = migrate(o);
  base.samples = (o.samples && typeof o.samples === 'object') ? o.samples as Record<string, { name: string; b64: string }> : {};
  return base;
}

export function loadStore(): ProjectState {
  try { const s = localStorage.getItem(KEY); return s ? parseProject(s) : defaultProject(); }
  catch { return defaultProject(); }
}
export function saveStore(p: ProjectState): void {
  try { localStorage.setItem(KEY, serializeProject(p)); } catch { /* no disponible */ }
}
export function downloadProject(p: ProjectState, filename = 'proyecto.estudio.json'): void {
  const blob = new Blob([serializeProject(p)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function readProjectFile(file: File): Promise<ProjectState> {
  return file.text().then(parseProject);
}

// Registra en el almacén los samples de un proyecto abierto (sin decodificar aún).
export function hydrateSamples(p: ProjectState): void {
  if (p.samples) restoreSamples(p.samples);
}
