// Marco común de efectos: interfaz, registro y helper para efectos nativos.

import type { EqApi } from './eq-core';

export type Family = 'delay' | 'mod' | 'dyn' | 'color' | 'tone' | 'util';

export interface ParamSpec {
  name: string; label: string; min: number; max: number; step: number; default: number; unit?: string;
}
export interface EffectState { type: string; params: Record<string, number>; bypassed: boolean; }

export interface Effect {
  id: string;
  type: string;
  input: AudioNode;
  output: AudioNode;
  setParam(name: string, value: number): void;
  getParams(): ParamSpec[];
  getValues(): Record<string, number>;
  isBypassed(): boolean;
  bypass(on: boolean): void;
  serialize(): EffectState;
  dispose(): void;
  eq?: EqApi;   // solo el EQ gráfico lo define; el rack lo usa para mostrar su editor a medida
}

export type EffectFactory = (actx: AudioContext, state?: EffectState) => Effect;
export interface EffectDef { label: string; family: Family; params: ParamSpec[]; create: EffectFactory; }

export const EFFECTS: Record<string, EffectDef> = {};
export function registerEffect(type: string, def: EffectDef): void { EFFECTS[type] = def; }

let _idc = 0;

// Crea un efecto nativo con puerta de bypass (seco/húmedo) sin tocar la ganancia interna del efecto.
// `build` conecta input -> (cadena interna del efecto) -> sink, y devuelve una función apply(nombre,valor)
// o un objeto {apply, teardown?}. El teardown se llama en dispose() para limpiar recursos (p.ej. LFOs).
export function makeEffect(
  actx: AudioContext,
  type: string,
  params: ParamSpec[],
  build: (actx: AudioContext, input: GainNode, sink: GainNode) =>
    | ((name: string, value: number) => void)
    | { apply: (name: string, value: number) => void; teardown?: () => void },
  state?: EffectState
): Effect {
  const input = actx.createGain();
  const output = actx.createGain();
  const wet = actx.createGain();   // salida de la cadena procesada
  const dry = actx.createGain();   // ruta seca para el bypass
  wet.connect(output);
  input.connect(dry); dry.connect(output);

  const built = build(actx, input, wet);
  const apply = typeof built === 'function' ? built : built.apply;
  const teardown = typeof built === 'function' ? undefined : built.teardown;

  const values: Record<string, number> = {};
  let bypassed = false;
  const setBypass = (on: boolean) => { bypassed = on; wet.gain.value = on ? 0 : 1; dry.gain.value = on ? 1 : 0; };
  const setParam = (name: string, value: number) => { values[name] = value; apply(name, value); };

  for (const p of params) setParam(p.name, p.default);
  if (state) {
    for (const p of params) if (state.params[p.name] !== undefined) setParam(p.name, state.params[p.name]);
    setBypass(!!state.bypassed);
  } else setBypass(false);

  const id = type + '-' + (++_idc);
  return {
    id, type, input, output,
    setParam,
    getParams: () => params,
    getValues: () => ({ ...values }),
    isBypassed: () => bypassed,
    bypass: setBypass,
    serialize: () => ({ type, params: { ...values }, bypassed }),
    dispose: () => {
      try { teardown?.(); } catch { /* ya */ }
      for (const n of [input, output, wet, dry]) { try { n.disconnect(); } catch { /* ya */ } }
    }
  };
}
