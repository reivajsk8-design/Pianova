// Motor de rack: cadena ordenada de efectos entre `input` y `output`, con reconexión del grafo.
import { EFFECTS, Effect, EffectState } from './effect';
import { reorder, serializeRack, RackState } from './rack-core';

export interface Rack {
  add(type: string, state?: EffectState): Effect | null;
  remove(id: string): void;
  move(id: string, dir: -1 | 1): void;
  bypass(id: string, on: boolean): void;
  list(): Effect[];
  serialize(): RackState;
  restore(state: RackState): void;
  onChange(cb: () => void): void;
  dispose(): void;
}

// `input` debe ser un nodo de inserción DEDICADO al rack (un GainNode propio, como instrumentBus o
// masterFxIn): reconnect() hace input.disconnect() de TODAS sus salidas. No pasar un nodo compartido.
export function createRack(actx: AudioContext, input: AudioNode, output: AudioNode): Rack {
  let effects: Effect[] = [];
  let changeCb: (() => void) | null = null;

  function reconnect(): void {
    try { input.disconnect(); } catch { /* nada */ }
    effects.forEach(e => { try { e.output.disconnect(); } catch { /* nada */ } });
    if (effects.length === 0) { input.connect(output); return; }
    input.connect(effects[0].input);
    for (let i = 0; i < effects.length - 1; i++) effects[i].output.connect(effects[i + 1].input);
    effects[effects.length - 1].output.connect(output);
  }
  function notify(): void { if (changeCb) changeCb(); }

  reconnect();

  return {
    add(type, state) {
      const def = EFFECTS[type]; if (!def) return null;
      const fx = def.create(actx, state);
      effects.push(fx); reconnect(); notify(); return fx;
    },
    remove(id) {
      const fx = effects.find(e => e.id === id); if (!fx) return;
      effects = effects.filter(e => e.id !== id);
      reconnect(); try { fx.dispose(); } catch { /* nada */ } notify();
    },
    move(id, dir) { effects = reorder(effects, id, dir); reconnect(); notify(); },
    bypass(id, on) { const fx = effects.find(e => e.id === id); if (fx) { fx.bypass(on); notify(); } },
    list: () => effects.slice(),
    serialize: () => serializeRack(effects),
    restore(state) {
      effects.forEach(e => { try { e.dispose(); } catch { /* nada */ } });
      effects = [];
      for (const es of state.effects) { const def = EFFECTS[es.type]; if (def) effects.push(def.create(actx, es)); }
      reconnect(); notify();
    },
    onChange(cb) { changeCb = cb; },
    dispose() {
      effects.forEach(e => { try { e.dispose(); } catch { /* nada */ } });
      effects = [];
      try { input.disconnect(); } catch { /* nada */ }
    }
  };
}
