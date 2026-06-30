// Persistencia del Estudio (proyecto v2: groovebox). Autoguardado en localStorage + guardar/abrir .json.
// Migra proyectos v1 (un instrumento + instrumentRack) a v2 (canal 0).
import type { RackState } from '../fx/rack-core';
import { DawState, defaultDaw, defaultChannel } from '../daw/model';

export const PROJECT_VERSION = 2;
const KEY = 'estudio-v1';
const emptyRack = (): RackState => ({ effects: [] });

export interface ProjectState { version: number; daw: DawState; masterRack: RackState }

export function defaultProject(): ProjectState {
  return { version: PROJECT_VERSION, daw: defaultDaw(), masterRack: emptyRack() };
}

export function serializeProject(p: ProjectState): string { return JSON.stringify(p); }

function rackOf(v: unknown): RackState {
  return (v && typeof v === 'object' && Array.isArray((v as RackState).effects)) ? (v as RackState) : emptyRack();
}

function dawOf(v: unknown): DawState {
  const o = v as Partial<DawState> | undefined;
  if (!o || !Array.isArray(o.channels) || o.channels.length === 0) return defaultDaw();
  return {
    channels: o.channels,
    bpm: typeof o.bpm === 'number' ? o.bpm : 120,
    steps: typeof o.steps === 'number' ? o.steps : 16
  };
}

// Devuelve siempre un ProjectState v2. v1 (instrument/instrumentRack) → canal 0; desconocido → por defecto.
function migrate(o: Record<string, unknown>): ProjectState {
  const masterRack = rackOf(o.masterRack);
  if (o.version === 2 && o.daw && typeof o.daw === 'object') {
    return { version: 2, daw: dawOf(o.daw), masterRack };
  }
  const preset = typeof o.instrument === 'string' ? o.instrument : 'piano';
  const ch = defaultChannel(preset);
  ch.rack = rackOf(o.instrumentRack);
  return { version: 2, daw: { channels: [ch], bpm: 120, steps: ch.steps.length }, masterRack };
}

export function parseProject(json: string): ProjectState {
  return migrate(JSON.parse(json) as Record<string, unknown>);
}

export function loadStore(): ProjectState {
  try { const s = localStorage.getItem(KEY); return s ? parseProject(s) : defaultProject(); }
  catch { return defaultProject(); }
}

export function saveStore(p: ProjectState): void {
  try { localStorage.setItem(KEY, serializeProject(p)); } catch { /* almacenamiento lleno/no disponible */ }
}

export function downloadProject(p: ProjectState, filename = 'proyecto.estudio.json'): void {
  const blob = new Blob([serializeProject(p)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();   // appendChild: Firefox ignora el clic si el <a> no está en el DOM
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readProjectFile(file: File): Promise<ProjectState> {
  return file.text().then(parseProject);
}
