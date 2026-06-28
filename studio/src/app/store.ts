// Persistencia del Estudio: autoguardado en localStorage + guardar/abrir proyecto a archivo .json.
import type { RackState } from '../fx/rack-core';

export const PROJECT_VERSION = 1;
const KEY = 'estudio-v1';

export interface ProjectState {
  version: number;
  instrument: string;
  instrumentRack: RackState;
  masterRack: RackState;
}

const emptyRack = (): RackState => ({ effects: [] });

export function defaultProject(): ProjectState {
  return { version: PROJECT_VERSION, instrument: 'piano', instrumentRack: emptyRack(), masterRack: emptyRack() };
}

export function serializeProject(p: ProjectState): string { return JSON.stringify(p); }

// Parseo tolerante: si faltan campos o vienen mal, usa valores por defecto. Lanza solo con JSON inválido.
export function parseProject(json: string): ProjectState {
  const o = JSON.parse(json) as Record<string, unknown>;
  const rack = (v: unknown): RackState =>
    (v && typeof v === 'object' && Array.isArray((v as RackState).effects)) ? (v as RackState) : emptyRack();
  return {
    version: typeof o.version === 'number' ? o.version : PROJECT_VERSION,
    instrument: typeof o.instrument === 'string' ? o.instrument : 'piano',
    instrumentRack: rack(o.instrumentRack),
    masterRack: rack(o.masterRack)
  };
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
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readProjectFile(file: File): Promise<ProjectState> {
  return file.text().then(parseProject);
}
