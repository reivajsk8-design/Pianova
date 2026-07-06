// studio/src/midi/learn.ts
// Aprendizaje/mapeo MIDI: asocia un CC físico (nº + puerto) a un knob del Estudio (por id). Helpers puros
// (emparejado/serialización) + un singleton de módulo con el estado (mapa persistido en localStorage, setters
// de los knobs, aprendizaje en curso y enrutado del CC entrante).

export interface MidiBinding { cc: number; port: string }
export type MidiMap = Record<string, MidiBinding>;

// Ids con ese cc+puerto (para enrutar un CC entrante a los knobs mapeados). Puro.
export function targetsForCC(map: MidiMap, cc: number, port: string): string[] {
  return Object.keys(map).filter(id => map[id].cc === cc && map[id].port === port);
}
export function serializeMap(map: MidiMap): string { return JSON.stringify(map); }
export function parseMap(json: string | null): MidiMap {
  if (!json) return {};
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    const out: MidiMap = {};
    for (const id of Object.keys(o)) {
      const b = o[id] as { cc?: unknown; port?: unknown };
      if (b && typeof b.cc === 'number' && typeof b.port === 'string') out[id] = { cc: b.cc, port: b.port };
    }
    return out;
  } catch { return {}; }
}

const KEY = 'estudio-midimap';
function safeGet(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } }

let map: MidiMap = parseMap(safeGet());
const setters = new Map<string, (v01: number) => void>();
let pending: { id: string; onAssigned?: () => void } | null = null;

function save(): void { try { localStorage.setItem(KEY, serializeMap(map)); } catch { /* ignora */ } }

export const midiLearn = {
  register(id: string, setFromMidi: (v01: number) => void): void { setters.set(id, setFromMidi); },
  arm(id: string, onAssigned?: () => void): void { pending = { id, onAssigned }; },
  cancel(): void { pending = null; },
  armedId(): string | null { return pending ? pending.id : null; },
  handleCC(cc: number, value01: number, port: string): void {
    if (pending) {
      map[pending.id] = { cc, port }; save();
      const cb = pending.onAssigned; pending = null; cb?.();
      return;
    }
    for (const id of targetsForCC(map, cc, port)) setters.get(id)?.(value01);
  },
  getBinding(id: string): MidiBinding | undefined { return map[id]; },
  hasBinding(id: string): boolean { return !!map[id]; },
  clear(id: string): void { delete map[id]; save(); }
};
