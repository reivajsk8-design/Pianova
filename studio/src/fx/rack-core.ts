// Lógica pura del rack (orden y serialización), sin tocar el grafo de audio: testeable.
import type { EffectState } from './effect';

export interface RackState { effects: EffectState[]; }

// Devuelve una copia con el elemento `id` movido una posición (dir -1 arriba, +1 abajo).
export function reorder<T extends { id: string }>(list: T[], id: string, dir: -1 | 1): T[] {
  const i = list.findIndex(x => x.id === id);
  if (i < 0) return list;
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const copy = list.slice();
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

// Serializa una lista de efectos a estado de rack (en orden).
export function serializeRack(list: { serialize(): EffectState }[]): RackState {
  return { effects: list.map(e => e.serialize()) };
}
