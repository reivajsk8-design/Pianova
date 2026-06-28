# Fase 2 · Tanda 1 — Marco de efectos + rack (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el marco reutilizable de efectos del Estudio (interfaz + registro + motor de rack + UI), enchufarlo en dos puntos de inserción (instrumento y maestro) y persistir el proyecto (localStorage + guardar/abrir archivo `.json`), dejando un rack vacío funcional al que en las siguientes tandas se añadirán los 19 efectos.

**Architecture:** Un `Effect` es una caja con `input`/`output` y parámetros descritos por `ParamSpec` (la UI se genera sola). Un `Rack` encadena efectos entre una entrada y una salida y se reconecta al añadir/quitar/reordenar. Lógica pura (orden, serialización, proyecto) separada del grafo de audio para poder testearla con Vitest. Dos racks (instrumento y maestro) usan el mismo motor; el primer efecto del registro es una utilidad "Ganancia" para poder probar todo de punta a punta.

**Tech Stack:** TypeScript strict, Vite, Vitest, Web Audio API (sin librerías). Proyecto en `studio/`.

## Global Constraints

- Todo el código nuevo va en **`studio/`**; **TypeScript strict**; **Vitest** para la lógica pura; **sin framework de UI** (DOM a mano); textos/comentarios en **español**. **No tocar `pianova.html`**.
- Reusar la Fase 1: `ensureAudio`/`getAudioContext` (`audio/context.ts`), `setupMasterBus`/`masterDest` (`audio/masterBus.ts`), el motor `synth` (`audio/synth.ts`).
- El audio arranca tras un **gesto** del usuario (`ensureAudio`). `exponentialRampToValueAtTime` nunca a 0 (no aplica aquí, pero se mantiene la norma).
- **Bypass por puerta seco/húmedo** (no tocar la ganancia interna del efecto). Inserción en **serie** (cada efecto tiene su propio wet/dry interno si lo necesita).
- La (de)serialización de rack y de proyecto es **pura y testeable** (sin DOM ni audio en esas funciones).
- Verificación por tarea desde `d:\PianoVa\studio`: `npm run typecheck` + `npm test` + `npm run build`.
- Persistencia: `localStorage` clave **`estudio-v1`**; archivo de proyecto `{ version: 1, instrument, instrumentRack, masterRack }`.

---

### Task 1: Lógica pura del rack (`fx/rack-core.ts`)

**Files:**
- Create: `studio/src/fx/rack-core.ts`
- Test: `studio/src/fx/rack-core.test.ts`

**Interfaces:**
- Consumes: nada (usa solo tipos locales mínimos).
- Produces: `RackState = { effects: EffectState[] }` (donde `EffectState` se define en la Task 2; aquí se importa como tipo); `reorder<T extends {id:string}>(list, id, dir): T[]`; `serializeRack(list: {serialize():EffectState}[]): RackState`.

> Nota de orden: la Task 2 crea `effect.ts` con `EffectState`. Para no acoplar el orden, **define `EffectState` mínimamente aquí como `import type`** desde `./effect`. Si ejecutas esta tarea antes que la 2, crea primero un stub de tipo (ver Step 3).

- [ ] **Step 1: Escribe el test que falla**

```ts
// studio/src/fx/rack-core.test.ts
import { describe, it, expect } from 'vitest';
import { reorder, serializeRack } from './rack-core';

const mk = (id: string) => ({ id, serialize: () => ({ type: id, params: {}, bypassed: false }) });

describe('reorder', () => {
  it('mueve un elemento hacia abajo', () => {
    const l = [mk('a'), mk('b'), mk('c')];
    expect(reorder(l, 'a', 1).map(x => x.id)).toEqual(['b', 'a', 'c']);
  });
  it('mueve un elemento hacia arriba', () => {
    const l = [mk('a'), mk('b'), mk('c')];
    expect(reorder(l, 'c', -1).map(x => x.id)).toEqual(['a', 'c', 'b']);
  });
  it('no hace nada en los bordes', () => {
    const l = [mk('a'), mk('b')];
    expect(reorder(l, 'a', -1).map(x => x.id)).toEqual(['a', 'b']);
    expect(reorder(l, 'b', 1).map(x => x.id)).toEqual(['a', 'b']);
  });
  it('ignora un id inexistente', () => {
    const l = [mk('a'), mk('b')];
    expect(reorder(l, 'z', 1).map(x => x.id)).toEqual(['a', 'b']);
  });
});

describe('serializeRack', () => {
  it('serializa la lista en orden', () => {
    const l = [mk('a'), mk('b')];
    expect(serializeRack(l)).toEqual({ effects: [
      { type: 'a', params: {}, bypassed: false },
      { type: 'b', params: {}, bypassed: false }
    ] });
  });
});
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `npm test`
Expected: FAIL — `Failed to load url ./rack-core` (el módulo aún no existe).

- [ ] **Step 3: Implementa el módulo**

```ts
// studio/src/fx/rack-core.ts
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
```

> Si `./effect` aún no existe al ejecutar esta tarea, créalo después (Task 2). `import type` no genera código en runtime, así que el test pasa igual; pero `tsc` necesitará que `EffectState` exista. Para no bloquear, **ejecuta la Task 2 inmediatamente después** o crea el archivo `effect.ts` con al menos el tipo `EffectState` antes de `npm run typecheck`. (En la práctica: implementa Task 1 y Task 2 en este orden y haz `typecheck` al cerrar la Task 2.)

- [ ] **Step 4: Ejecuta el test y comprueba que pasa**

Run: `npm test`
Expected: PASS (4 + 1 tests nuevos de rack-core; los existentes siguen verdes).

- [ ] **Step 5: Commit**

```bash
git add studio/src/fx/rack-core.ts studio/src/fx/rack-core.test.ts
git commit -m "Estudio F2: logica pura del rack (reorder + serializeRack) + test"
```

---

### Task 2: Interfaz de efecto, registro, helper y efecto "Ganancia" (`fx/effect.ts`, `fx/effects/gain.ts`, `fx/effects/index.ts`)

**Files:**
- Create: `studio/src/fx/effect.ts`, `studio/src/fx/effects/gain.ts`, `studio/src/fx/effects/index.ts`
- Test: `studio/src/fx/effects/gain.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type Family = 'delay'|'mod'|'dyn'|'color'|'tone'|'util'`
  - `interface ParamSpec { name; label; min; max; step; default; unit? }`
  - `interface EffectState { type: string; params: Record<string,number>; bypassed: boolean }`
  - `interface Effect { id; type; input: AudioNode; output: AudioNode; setParam(name,value); getParams(): ParamSpec[]; getValues(): Record<string,number>; isBypassed(): boolean; bypass(on); serialize(): EffectState; dispose() }`
  - `type EffectFactory = (actx: AudioContext, state?: EffectState) => Effect`
  - `interface EffectDef { label; family: Family; params: ParamSpec[]; create: EffectFactory }`
  - `const EFFECTS: Record<string, EffectDef>` y `registerEffect(type, def)`
  - `makeEffect(actx, type, params, build, state?)` donde `build = (actx, input: GainNode, sink: GainNode) => (name, value) => void`
  - `dbToLin(db): number` (en `gain.ts`)

- [ ] **Step 1: Escribe el test que falla**

```ts
// studio/src/fx/effects/gain.test.ts
import { describe, it, expect } from 'vitest';
import { dbToLin } from './gain';

describe('dbToLin', () => {
  it('0 dB = ganancia 1', () => { expect(dbToLin(0)).toBeCloseTo(1, 5); });
  it('+6 dB ≈ 1.995', () => { expect(dbToLin(6)).toBeCloseTo(1.99526, 4); });
  it('-6 dB ≈ 0.501', () => { expect(dbToLin(-6)).toBeCloseTo(0.50119, 4); });
});
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `npm test`
Expected: FAIL — `Failed to load url ./gain`.

- [ ] **Step 3: Crea `fx/effect.ts`**

```ts
// studio/src/fx/effect.ts
// Marco común de efectos: interfaz, registro y helper para efectos nativos.

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
}

export type EffectFactory = (actx: AudioContext, state?: EffectState) => Effect;
export interface EffectDef { label: string; family: Family; params: ParamSpec[]; create: EffectFactory; }

export const EFFECTS: Record<string, EffectDef> = {};
export function registerEffect(type: string, def: EffectDef): void { EFFECTS[type] = def; }

let _idc = 0;

// Crea un efecto nativo con puerta de bypass (seco/húmedo) sin tocar la ganancia interna del efecto.
// `build` conecta input -> (cadena interna del efecto) -> sink, y devuelve una función apply(nombre,valor).
export function makeEffect(
  actx: AudioContext,
  type: string,
  params: ParamSpec[],
  build: (actx: AudioContext, input: GainNode, sink: GainNode) => (name: string, value: number) => void,
  state?: EffectState
): Effect {
  const input = actx.createGain();
  const output = actx.createGain();
  const wet = actx.createGain();   // salida de la cadena procesada
  const dry = actx.createGain();   // ruta seca para el bypass
  wet.connect(output);
  input.connect(dry); dry.connect(output);

  const apply = build(actx, input, wet);

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
    dispose: () => { for (const n of [input, output, wet, dry]) { try { n.disconnect(); } catch { /* ya */ } } }
  };
}
```

- [ ] **Step 4: Crea el efecto "Ganancia" (`fx/effects/gain.ts`)**

```ts
// studio/src/fx/effects/gain.ts
// Efecto utilidad: trim de ganancia (-24..+24 dB). Sirve para probar el rack de punta a punta.
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const GAIN_PARAMS: ParamSpec[] = [
  { name: 'gain', label: 'Ganancia', min: -24, max: 24, step: 0.5, default: 0, unit: 'dB' }
];

export function dbToLin(db: number): number { return Math.pow(10, db / 20); }

registerEffect('gain', {
  label: 'Ganancia', family: 'util', params: GAIN_PARAMS,
  create: (actx, state) => makeEffect(actx, 'gain', GAIN_PARAMS, (actx, input, sink) => {
    const g = actx.createGain();
    input.connect(g); g.connect(sink);
    return (name, value) => { if (name === 'gain') g.gain.value = dbToLin(value); };
  }, state)
});
```

- [ ] **Step 5: Crea el índice de efectos (`fx/effects/index.ts`)**

```ts
// studio/src/fx/effects/index.ts
// Importar este módulo registra todos los efectos disponibles. En tandas futuras se añaden más imports.
import './gain';
```

- [ ] **Step 6: Ejecuta tests + typecheck + build**

Run: `npm test`
Expected: PASS (los 3 tests de `dbToLin` + rack-core + previos).
Run: `npm run typecheck`
Expected: sin errores (ya existe `EffectState`, así que `rack-core.ts` compila).
Run: `npm run build`
Expected: build OK.

- [ ] **Step 7: Commit**

```bash
git add studio/src/fx/effect.ts studio/src/fx/effects/gain.ts studio/src/fx/effects/index.ts studio/src/fx/effects/gain.test.ts
git commit -m "Estudio F2: interfaz de efecto + registro + makeEffect + efecto Ganancia (test dbToLin)"
```

---

### Task 3: Persistencia y proyecto (`app/store.ts`)

**Files:**
- Create: `studio/src/app/store.ts`
- Test: `studio/src/app/store.test.ts`

**Interfaces:**
- Consumes: `RackState` (de `fx/rack-core`).
- Produces: `interface ProjectState { version: number; instrument: string; instrumentRack: RackState; masterRack: RackState }`; `PROJECT_VERSION`; `defaultProject()`; `serializeProject(p): string`; `parseProject(json): ProjectState`; `loadStore(): ProjectState`; `saveStore(p): void`; `downloadProject(p, filename?): void`; `readProjectFile(file): Promise<ProjectState>`.

- [ ] **Step 1: Escribe el test que falla** (solo funciones puras)

```ts
// studio/src/app/store.test.ts
import { describe, it, expect } from 'vitest';
import { defaultProject, serializeProject, parseProject, PROJECT_VERSION } from './store';

describe('proyecto (de)serializa', () => {
  it('defaultProject tiene la forma esperada', () => {
    const p = defaultProject();
    expect(p).toEqual({ version: PROJECT_VERSION, instrument: 'piano',
      instrumentRack: { effects: [] }, masterRack: { effects: [] } });
  });
  it('round-trip conserva el estado', () => {
    const p = defaultProject();
    p.instrument = 'organo';
    p.masterRack = { effects: [{ type: 'gain', params: { gain: 6 }, bypassed: false }] };
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
  it('tolera campos ausentes o basura', () => {
    const p = parseProject('{"instrument":123}');
    expect(p.instrument).toBe('piano');
    expect(p.instrumentRack).toEqual({ effects: [] });
    expect(p.masterRack).toEqual({ effects: [] });
  });
  it('lanza con JSON inválido', () => {
    expect(() => parseProject('no-json')).toThrow();
  });
});
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `npm test`
Expected: FAIL — `Failed to load url ./store`.

- [ ] **Step 3: Implementa `store.ts`**

```ts
// studio/src/app/store.ts
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
```

- [ ] **Step 4: Ejecuta tests + typecheck + build**

Run: `npm test`
Expected: PASS (4 tests de proyecto + previos).
Run: `npm run typecheck` → sin errores. Run: `npm run build` → OK.

- [ ] **Step 5: Commit**

```bash
git add studio/src/app/store.ts studio/src/app/store.test.ts
git commit -m "Estudio F2: persistencia + proyecto (localStorage estudio-v1 + guardar/abrir .json) + test round-trip"
```

---

### Task 4: Routing — salida del synth y punto de inserción del maestro (`audio/synth.ts`, `audio/masterBus.ts`)

**Files:**
- Modify: `studio/src/audio/synth.ts` (añadir `setSynthOut`), `studio/src/audio/masterBus.ts` (añadir `masterFxIn`/`masterFxOut` y nodo de retorno).

**Interfaces:**
- Produces: `setSynthOut(node: AudioNode | null): void` (synth); `masterFxIn(): AudioNode` y `masterFxOut(): AudioNode` (masterBus). `masterDest()` sigue devolviendo `masterIn`.
- Consumes: nada nuevo.

- [ ] **Step 1: Modifica `masterBus.ts`** (inserta un nodo de retorno del rack maestro antes del limitador)

Reemplaza `setupMasterBus` y añade los dos getters. El resultado completo del archivo:

```ts
// Bus maestro: masterIn -> [rack maestro] -> limitador -> makeup/pre -> soft-clipper (tanh) -> final -> destino.
// Portado de pianova.html (misma pared anti-clipping). El rack maestro se inserta entre masterIn y masterFx.
let masterIn: GainNode | null = null;
let masterFx: GainNode | null = null;   // retorno del rack maestro -> limitador

const SOFTCLIP_DRIVE = 2.5;
const MASTER_MAKEUP = 2.5;

// Curva tanh(drive·x) sobre [-1,1]: satura suave y la salida nunca pasa de ~tanh(drive) (<1).
export function makeSoftClipCurve(n: number, drive: number): Float32Array {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(drive * x); }
  return c;
}

export function setupMasterBus(actx: AudioContext): void {
  masterIn = actx.createGain();
  masterFx = actx.createGain();
  const limiter = actx.createDynamicsCompressor();
  limiter.threshold.value = -6; limiter.knee.value = 0; limiter.ratio.value = 20;
  limiter.attack.value = 0.003; limiter.release.value = 0.25;
  const clipPre = actx.createGain();
  clipPre.gain.value = MASTER_MAKEUP / SOFTCLIP_DRIVE;
  const clip = actx.createWaveShaper();
  clip.curve = makeSoftClipCurve(2048, SOFTCLIP_DRIVE) as Float32Array<ArrayBuffer>;
  clip.oversample = '4x';
  const final = actx.createGain();
  masterIn.connect(masterFx);     // por defecto seco; el rack maestro re-enruta masterIn pero siempre acaba en masterFx
  masterFx.connect(limiter);
  limiter.connect(clipPre);
  clipPre.connect(clip);
  clip.connect(final);
  final.connect(actx.destination);
}

export function masterDest(): AudioNode {
  if (!masterIn) throw new Error('Bus maestro no inicializado (llama a ensureAudio primero).');
  return masterIn;
}

// Anclas del rack maestro: el rack va de masterFxIn() a masterFxOut().
export function masterFxIn(): AudioNode {
  if (!masterIn) throw new Error('Bus maestro no inicializado (llama a ensureAudio primero).');
  return masterIn;
}
export function masterFxOut(): AudioNode {
  if (!masterFx) throw new Error('Bus maestro no inicializado (llama a ensureAudio primero).');
  return masterFx;
}

// Tono de prueba (440 Hz, 0.4 s) para verificar que el audio suena por el bus.
export function testTone(): void {
  const dest = masterDest();
  const actx = dest.context as AudioContext;
  const osc = actx.createOscillator();
  const g = actx.createGain();
  osc.type = 'sine'; osc.frequency.value = 440; g.gain.value = 0.2;
  osc.connect(g); g.connect(dest);
  const t = actx.currentTime;
  osc.start(t); osc.stop(t + 0.4);
}
```

- [ ] **Step 2: Modifica `synth.ts`** (destino configurable de las voces)

En `studio/src/audio/synth.ts`, tras la línea `let currentPreset = 'piano';` añade:

```ts
let synthOut: AudioNode | null = null;
// Redirige la salida de las voces (p. ej. al rack del instrumento). null = directo al bus maestro.
export function setSynthOut(node: AudioNode | null): void { synthOut = node; }
```

Y cambia, dentro de `noteOn`, la línea:

```ts
  out.connect(masterDest());
```

por:

```ts
  out.connect(synthOut ?? masterDest());
```

- [ ] **Step 3: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores.
Run: `npm test` → los tests existentes (incluido `masterBus.test.ts` de la curva) siguen verdes.
Run: `npm run build` → OK.

- [ ] **Step 4: Commit**

```bash
git add studio/src/audio/synth.ts studio/src/audio/masterBus.ts
git commit -m "Estudio F2: routing para racks (setSynthOut + masterFxIn/Out antes del limitador)"
```

---

### Task 5: Motor de rack en audio (`fx/rack.ts`)

**Files:**
- Create: `studio/src/fx/rack.ts`

**Interfaces:**
- Consumes: `EFFECTS`, `Effect`, `EffectState` (de `fx/effect`); `reorder`, `serializeRack`, `RackState` (de `fx/rack-core`).
- Produces: `interface Rack { add(type, state?): Effect|null; remove(id); move(id, dir); bypass(id, on); list(): Effect[]; serialize(): RackState; restore(state): void; onChange(cb): void; dispose() }`; `createRack(actx, input: AudioNode, output: AudioNode): Rack`.

- [ ] **Step 1: Implementa `rack.ts`**

```ts
// studio/src/fx/rack.ts
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
```

- [ ] **Step 2: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores.
Run: `npm test` → todo verde (no hay test nuevo: el orden/serialización ya se prueban en `rack-core.test.ts`; el grafo de audio se valida a mano).
Run: `npm run build` → OK.

- [ ] **Step 3: Commit**

```bash
git add studio/src/fx/rack.ts
git commit -m "Estudio F2: motor de rack en audio (createRack: add/remove/move/bypass/restore)"
```

---

### Task 6: UI del rack (`ui/rack.ts` + CSS)

**Files:**
- Create: `studio/src/ui/rack.ts`
- Modify: `studio/src/ui/styles.css` (añadir estilos del rack al final)

**Interfaces:**
- Consumes: `Rack` (de `fx/rack`); `EFFECTS`, `Family` (de `fx/effect`).
- Produces: `mountRack(root: HTMLElement, rack: Rack, title: string, onChange: () => void): void`.

- [ ] **Step 1: Implementa `ui/rack.ts`**

```ts
// studio/src/ui/rack.ts
// UI del rack: tarjetas de efecto (bypass/reordenar/quitar + parámetros) y menú "Añadir efecto" por familia.
import { Rack } from '../fx/rack';
import { EFFECTS, Family } from '../fx/effect';

const FAMILY_LABEL: Record<Family, string> = {
  delay: 'Delays', mod: 'Modulación', dyn: 'Dinámica', color: 'Color/EQ', tone: 'Tono', util: 'Utilidad'
};

export function mountRack(root: HTMLElement, rack: Rack, title: string, onChange: () => void): void {
  function render(): void {
    const cards = rack.list().map(e => {
      const def = EFFECTS[e.type];
      const vals = e.getValues();
      const params = e.getParams().map(p => {
        const v = vals[p.name];
        return `<label class="fxParam">${p.label}
          <input type="range" data-id="${e.id}" data-p="${p.name}" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}">
          <span class="fxVal">${v}${p.unit ? ' ' + p.unit : ''}</span></label>`;
      }).join('');
      return `<div class="fxCard">
        <div class="fxHead">
          <b>${def ? def.label : e.type}</b>
          <label class="fxByp"><input type="checkbox" data-byp="${e.id}" ${e.isBypassed() ? 'checked' : ''}> Bypass</label>
          <button data-up="${e.id}" title="Subir">↑</button>
          <button data-down="${e.id}" title="Bajar">↓</button>
          <button data-del="${e.id}" title="Quitar">✕</button>
        </div>
        <div class="fxParams">${params}</div>
      </div>`;
    }).join('');

    const groups: Partial<Record<Family, string[]>> = {};
    for (const [type, def] of Object.entries(EFFECTS)) {
      (groups[def.family] ??= []).push(`<option value="${type}">${def.label}</option>`);
    }
    const optgroups = (Object.keys(groups) as Family[])
      .map(f => `<optgroup label="${FAMILY_LABEL[f]}">${groups[f]!.join('')}</optgroup>`).join('');

    root.innerHTML = `<div class="rack">
      <div class="rackHead"><b>${title}</b>
        <select class="fxAdd"><option value="">➕ Añadir efecto…</option>${optgroups}</select>
      </div>
      <div class="rackList">${cards || '<p class="muted">Sin efectos.</p>'}</div>
    </div>`;

    (root.querySelector('.fxAdd') as HTMLSelectElement).addEventListener('change', ev => {
      const sel = ev.target as HTMLSelectElement; const type = sel.value; sel.value = '';
      if (type) { rack.add(type); onChange(); render(); }
    });
    root.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(inp => {
      inp.addEventListener('input', () => {
        const e = rack.list().find(x => x.id === inp.dataset.id); if (!e) return;
        const val = +inp.value; e.setParam(inp.dataset.p!, val);
        const p = e.getParams().find(pp => pp.name === inp.dataset.p);
        const span = inp.parentElement!.querySelector('.fxVal');
        if (span) span.textContent = val + (p?.unit ? ' ' + p.unit : '');
        onChange();
      });
    });
    root.querySelectorAll<HTMLInputElement>('input[data-byp]').forEach(cb => {
      cb.addEventListener('change', () => { rack.bypass(cb.dataset.byp!, cb.checked); onChange(); });
    });
    root.querySelectorAll<HTMLButtonElement>('button[data-up]').forEach(b =>
      b.addEventListener('click', () => { rack.move(b.dataset.up!, -1); onChange(); render(); }));
    root.querySelectorAll<HTMLButtonElement>('button[data-down]').forEach(b =>
      b.addEventListener('click', () => { rack.move(b.dataset.down!, 1); onChange(); render(); }));
    root.querySelectorAll<HTMLButtonElement>('button[data-del]').forEach(b =>
      b.addEventListener('click', () => { rack.remove(b.dataset.del!); onChange(); render(); }));
  }

  rack.onChange(render);
  render();
}
```

- [ ] **Step 2: Añade los estilos al final de `studio/src/ui/styles.css`**

```css
.projBtns { display:flex; gap:8px; }
.racks { display:flex; gap:18px; flex-wrap:wrap; margin-top:18px; }
.rack { flex:1; min-width:280px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px; }
.rackHead { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
.fxAdd { font:inherit; background:var(--bg); color:var(--ink); border:1px solid var(--line); border-radius:8px; padding:6px 9px; }
.rackList { display:flex; flex-direction:column; gap:10px; }
.fxCard { border:1px solid var(--line); border-radius:10px; padding:10px; background:var(--bg); }
.fxHead { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.fxHead b { flex:1; }
.fxHead button { padding:4px 9px; }
.fxByp { display:flex; align-items:center; gap:4px; color:var(--muted); font-size:12px; }
.fxParams { display:flex; flex-direction:column; gap:6px; }
.fxParam { display:grid; grid-template-columns:110px 1fr 64px; align-items:center; gap:8px; color:var(--muted); font-size:12px; }
.fxParam input[type="range"] { width:100%; }
.fxVal { text-align:right; }
```

- [ ] **Step 3: Verifica typecheck + build**

Run: `npm run typecheck` → sin errores.
Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 4: Commit**

```bash
git add studio/src/ui/rack.ts studio/src/ui/styles.css
git commit -m "Estudio F2: UI del rack (tarjetas + parametros + menu por familia) + estilos"
```

---

### Task 7: Integrar los dos racks y el proyecto en la vista Estudio (`app/studioView.ts`)

**Files:**
- Modify: `studio/src/app/studioView.ts` (reescritura completa).

**Interfaces:**
- Consumes: `ensureAudio` (context); `synth.*` incl. `setSynthOut`; `masterDest`, `masterFxIn`, `masterFxOut` (masterBus); `connectMidi`; `mountKeyboard`; `createRack`, `Rack` (fx/rack); `mountRack` (ui/rack); `import '../fx/effects'`; `loadStore`, `saveStore`, `downloadProject`, `readProjectFile`, `ProjectState` (store).
- Produces: `mountStudioView(root)` (igual firma que ahora).

- [ ] **Step 1: Reescribe `studioView.ts`**

```ts
import { ensureAudio } from '../audio/context';
import * as synth from '../audio/synth';
import { masterDest, masterFxIn, masterFxOut } from '../audio/masterBus';
import { connectMidi } from '../midi/input';
import { mountKeyboard } from '../ui/keyboard';
import { createRack, Rack } from '../fx/rack';
import { mountRack } from '../ui/rack';
import '../fx/effects';   // registra los efectos disponibles
import { loadStore, saveStore, downloadProject, readProjectFile, ProjectState } from './store';

// Vista Estudio: instrumento + MIDI + teclado + racks de efectos (instrumento y maestro) + guardar/abrir proyecto.
export function mountStudioView(root: HTMLElement): void {
  const store: ProjectState = loadStore();
  const opts = synth.getPresetNames()
    .map(([k, label]) => `<option value="${k}"${k === store.instrument ? ' selected' : ''}>${label}</option>`).join('');

  root.innerHTML = `
    <div class="studioBar">
      <label class="fld">Instrumento <select id="stInstrument">${opts}</select></label>
      <button id="stConnect">Conectar teclado</button>
      <span id="stMidi" class="muted">Sin conectar</span>
      <span class="grow"></span>
      <span class="projBtns">
        <button id="stSave">💾 Guardar proyecto</button>
        <button id="stOpen">📂 Abrir proyecto</button>
        <input id="stFile" type="file" accept="application/json,.json" hidden>
      </span>
    </div>
    <div id="stKeyboard"></div>
    <p class="muted">Toca con el ratón, las teclas <b>A S D F G H J K</b> / <b>W E T Y U</b>, o tu teclado MIDI. Pulsa una tecla para activar los efectos.</p>
    <div class="racks">
      <div id="instRack"></div>
      <div id="masterRack"></div>
    </div>`;

  synth.setPreset(store.instrument);

  let instRack: Rack | null = null;
  let masterRack: Rack | null = null;

  function persist(): void {
    store.instrument = (root.querySelector('#stInstrument') as HTMLSelectElement).value;
    if (instRack) store.instrumentRack = instRack.serialize();
    if (masterRack) store.masterRack = masterRack.serialize();
    saveStore(store);
  }

  function initRacks(): void {
    if (instRack) return;
    const actx = ensureAudio();
    const instrumentBus = actx.createGain();
    synth.setSynthOut(instrumentBus);
    instRack = createRack(actx, instrumentBus, masterDest());
    masterRack = createRack(actx, masterFxIn(), masterFxOut());
    instRack.restore(store.instrumentRack);
    masterRack.restore(store.masterRack);
    mountRack(root.querySelector('#instRack') as HTMLElement, instRack, 'Instrumento', persist);
    mountRack(root.querySelector('#masterRack') as HTMLElement, masterRack, 'Maestro', persist);
  }

  function audioOn(): void { ensureAudio(); initRacks(); }

  (root.querySelector('#stInstrument') as HTMLSelectElement).addEventListener('change', e => {
    synth.setPreset((e.target as HTMLSelectElement).value); persist();
  });

  (root.querySelector('#stConnect') as HTMLButtonElement).addEventListener('click', () => {
    audioOn();
    const st = root.querySelector('#stMidi') as HTMLElement;
    connectMidi({
      onNoteOn: (m, v) => synth.noteOn(m, v),
      onNoteOff: (m) => synth.noteOff(m),
      onState: (names) => { st.textContent = names.length ? '🟢 ' + names.join(' · ') : 'Ningún teclado'; }
    }).catch(err => {
      st.textContent = '🔴 ' + ((err instanceof Error && err.message) ? err.message
        : 'Este navegador no soporta Web MIDI; usa el ratón o el teclado del ordenador.');
    });
  });

  (root.querySelector('#stSave') as HTMLButtonElement).addEventListener('click', () => { persist(); downloadProject(store); });
  (root.querySelector('#stOpen') as HTMLButtonElement).addEventListener('click', () => (root.querySelector('#stFile') as HTMLInputElement).click());
  (root.querySelector('#stFile') as HTMLInputElement).addEventListener('change', async ev => {
    const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return;
    try {
      const p = await readProjectFile(file);
      store.instrument = p.instrument; store.instrumentRack = p.instrumentRack; store.masterRack = p.masterRack;
      (root.querySelector('#stInstrument') as HTMLSelectElement).value = p.instrument;
      synth.setPreset(p.instrument);
      audioOn();
      instRack!.restore(store.instrumentRack);
      masterRack!.restore(store.masterRack);
      saveStore(store);
    } catch {
      (root.querySelector('#stMidi') as HTMLElement).textContent = '🔴 No se pudo abrir el proyecto.';
    }
  });

  mountKeyboard(root.querySelector('#stKeyboard') as HTMLElement, {
    onNoteOn: (m, v) => { audioOn(); synth.noteOn(m, v); },
    onNoteOff: (m) => synth.noteOff(m),
    lowMidi: 60, highMidi: 84, baseMidi: 60
  });
}
```

- [ ] **Step 2: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores.
Run: `npm test` → verde. Run: `npm run build` → OK (el bundle crece; los racks/efectos entran).

- [ ] **Step 3: Prueba manual (navegador)**

Run: `npm run dev` y abre `http://localhost:5173`.
Verifica: pulsar una tecla activa los racks (aparecen "Instrumento" y "Maestro"); en cualquier rack, "➕ Añadir efecto" → **Ganancia** añade una tarjeta; el deslizador cambia el volumen al tocar; Bypass/↑/↓/✕ funcionan; **💾 Guardar proyecto** descarga un `.json`; recargar la página mantiene los efectos (autoguardado); **📂 Abrir proyecto** con el archivo guardado los restaura. (El maestro afecta a toda la mezcla; el del instrumento, solo a lo que tocas.)

- [ ] **Step 4: Commit**

```bash
git add studio/src/app/studioView.ts
git commit -m "Estudio F2: vista Estudio con racks (instrumento + maestro) y guardar/abrir proyecto"
```

---

### Task 8: Versión y documentación

**Files:**
- Modify: `studio/package.json` (version), `HANDOFF.md`, `CLAUDE.md`.

- [ ] **Step 1: Sube la versión del proyecto pro.** En `studio/package.json` cambia `"version": "0.2.0"` a `"version": "0.3.0"`.

- [ ] **Step 2: `HANDOFF.md`.** En el bloque del proyecto pro, añade una nota de la **Fase 2 (Tanda 1)**: marco de efectos (`fx/effect.ts`: interfaz `Effect` + registro `EFFECTS` + `makeEffect` con bypass seco/húmedo), motor de rack (`fx/rack.ts` + lógica pura `fx/rack-core.ts` testeada), UI de rack (`ui/rack.ts`), dos puntos de inserción (rack del instrumento vía `setSynthOut`/`instrumentBus`; rack maestro vía `masterFxIn`/`masterFxOut` antes del limitador), persistencia y **guardar/abrir proyecto a archivo** (`app/store.ts`, `localStorage estudio-v1`, formato `{version,instrument,instrumentRack,masterRack}`). Primer efecto: utilidad **Ganancia**. Próximo: Tanda 2 (Delays/Espacio).

- [ ] **Step 3: `CLAUDE.md`.** En la decisión 5 / hoja de ruta, anota que **F2 está en curso**: marco de efectos + rack reutilizable (instrumento y maestro) + guardar proyecto a archivo hechos (Tanda 1); pendientes las tandas de efectos (Delays, Modulación, Dinámica, Color/EQ, Tono).

- [ ] **Step 4: Verifica** — Run: `npm run build` (OK). Confirma `version` 0.3.0 y las docs.

- [ ] **Step 5: Commit**

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio F2 Tanda 1 (marco + rack + proyecto) v0.3.0: version y docs"
```

---

## Notas de ejecución
- Verificación = `npm run typecheck` / `npm test` / `npm run build` desde `d:\PianoVa\studio`. No commitear `node_modules`/`dist`.
- **Orden recomendado:** Task 1 y Task 2 van juntas (rack-core importa `EffectState` de `effect.ts`); haz `typecheck` al cerrar la Task 2.
- Bypass = puerta seco/húmedo en `makeEffect`; el efecto nunca toca esas ganancias, solo conecta `input → … → sink`.
- Inserción en serie; los efectos con wet/dry propio (delay/reverb, en tandas futuras) lo gestionan dentro de su cadena.
- Los racks se crean en el **primer gesto** dentro del Estudio (`audioOn`), porque el `AudioContext` necesita un gesto.
- No tocar `pianova.html`. Textos/comentarios en español.
```
