# Fase 3 · Sub-tanda 3B — Varios canales + mezcla (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el Estudio en un mini-mezclador/groovebox: **varios canales** (instrumento, volumen, pan, mute, solo, **rack de efectos por canal**), una **cuadrícula de pasos multi-fila**, el **teclado toca el canal seleccionado**, y persistencia con **migración del proyecto v1→v2**.

**Architecture:** El estado del groovebox vive en `daw/model.ts` (datos puros: canales, pasos, ops inmutables incl. solo/mute). `daw/channel.ts` crea el grafo de audio por canal (`instrumentBus → rack → gain → pan → masterDest`). El synth gana `triggerPreset` (disparar un preset concreto a un destino). `studioView` se reestructura: lista de canales (tira + fila de pasos) + rack del canal seleccionado + rack maestro; el secuenciador (de 3A) dispara por canal audible. `store.ts` sube a v2 con migración.

**Tech Stack:** TypeScript strict, Vite, Vitest, Web Audio API. Proyecto en `studio/`.

## Global Constraints

- Todo el código nuevo va en **`studio/`**; **TypeScript strict**; **Vitest** para lo puro; **sin framework de UI**; textos/comentarios en **español**. **No tocar `pianova.html`**.
- Reusar: `createRack`/`Rack` (`fx/rack.ts`), `mountRack` (`ui/rack.ts`), `makeSequencer`/`dueSteps` (`daw/sequencer.ts`), `synth` (`audio/synth.ts`), `makeTransport` (`audio/transport.ts`), `mountTransport` (`ui/transport.ts`), `mountStepGrid` (`ui/stepgrid.ts`), `ensureAudio`/`getAudioContext` (`audio/context.ts`), `ensureWorklets` (`fx/worklets.ts`), `masterDest`/`masterFxIn`/`masterFxOut` (`audio/masterBus.ts`).
- **Solo/mute efectivo:** si hay algún canal en solo, suenan solo los soloed; si no, suenan los no muteados.
- **Modelo inmutable y puro** (las ops devuelven un `DawState` nuevo); el audio (canales) es el espejo vivo. Al persistir se vuelca el estado de cada rack al modelo.
- Persistencia `localStorage` clave **`estudio-v1`** (la misma; el contenido sube a v2); **migración v1→v2** (un instrumento + `instrumentRack` → canal 0).
- El audio arranca tras gesto (`ensureAudio`). `exponentialRampToValueAtTime` nunca a 0.
- Verificación por tarea desde `d:\PianoVa\studio`: `npm run typecheck` + `npm test` + `npm run build`. Prueba manual por oído.

---

### Task 1: Modelo del groovebox (`daw/model.ts`)

**Files:**
- Create: `studio/src/daw/model.ts`
- Test: `studio/src/daw/model.test.ts`

**Interfaces:**
- Consumes: `RackState` (tipo) de `../fx/rack-core`.
- Produces: tipos `Step`, `InstrumentSpec`, `ChannelState`, `DawState`; constantes `DEFAULT_STEPS`; `emptySteps`, `newChannelId`, `defaultChannel`, `defaultDaw`, `addChannel`, `removeChannel`, `updateChannel`, `toggleStep`, `findChannel`, `audibleIds`.

- [ ] **Step 1: Escribe el test que falla**

```ts
// studio/src/daw/model.test.ts
import { describe, it, expect } from 'vitest';
import {
  emptySteps, defaultChannel, defaultDaw, addChannel, removeChannel,
  updateChannel, toggleStep, audibleIds, findChannel
} from './model';

describe('modelo daw', () => {
  it('emptySteps crea n pasos apagados', () => {
    const s = emptySteps(4);
    expect(s.length).toBe(4);
    expect(s.every(x => x.on === false)).toBe(true);
  });
  it('defaultDaw tiene un canal y 16 pasos', () => {
    const d = defaultDaw();
    expect(d.channels.length).toBe(1);
    expect(d.steps).toBe(16);
    expect(d.channels[0].instrument).toEqual({ kind: 'synth', preset: 'piano' });
  });
  it('addChannel es inmutable y añade', () => {
    const d = defaultDaw();
    const d2 = addChannel(d, defaultChannel('organo', 16, 'ch-x'));
    expect(d.channels.length).toBe(1);     // original intacto
    expect(d2.channels.length).toBe(2);
    expect(d2.channels[1].id).toBe('ch-x');
  });
  it('removeChannel quita por id sin tocar el original', () => {
    const d = addChannel(defaultDaw(), defaultChannel('organo', 16, 'ch-x'));
    const d2 = removeChannel(d, 'ch-x');
    expect(d.channels.length).toBe(2);
    expect(d2.channels.length).toBe(1);
  });
  it('updateChannel aplica un patch a un canal', () => {
    const d = addChannel(defaultDaw(), defaultChannel('organo', 16, 'ch-x'));
    const d2 = updateChannel(d, 'ch-x', { volume: 0.5, muted: true });
    expect(findChannel(d2, 'ch-x')?.volume).toBe(0.5);
    expect(findChannel(d2, 'ch-x')?.muted).toBe(true);
    expect(findChannel(d, 'ch-x')?.volume).toBe(0.8);   // original intacto
  });
  it('toggleStep alterna un paso de un canal', () => {
    const d = defaultDaw();
    const id = d.channels[0].id;
    const d2 = toggleStep(d, id, 3);
    expect(findChannel(d2, id)?.steps[3].on).toBe(true);
    expect(findChannel(d, id)?.steps[3].on).toBe(false);
  });
  it('audibleIds: sin solo suenan los no muteados', () => {
    const d = updateChannel(addChannel(defaultDaw(), defaultChannel('o', 16, 'b')), 'b', { muted: true });
    const a = audibleIds(d.channels);
    expect(a.has(d.channels[0].id)).toBe(true);
    expect(a.has('b')).toBe(false);
  });
  it('audibleIds: con algún solo suenan solo los soloed', () => {
    const d = updateChannel(addChannel(defaultDaw(), defaultChannel('o', 16, 'b')), 'b', { soloed: true });
    const a = audibleIds(d.channels);
    expect(a.has('b')).toBe(true);
    expect(a.has(d.channels[0].id)).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `npm test`
Expected: FAIL — `Failed to load url ./model`.

- [ ] **Step 3: Implementa `daw/model.ts`**

```ts
// studio/src/daw/model.ts
// Modelo del groovebox (datos puros + operaciones inmutables). El audio es un espejo aparte (channel.ts).
import type { RackState } from '../fx/rack-core';

export interface Step { on: boolean; note?: number; vel?: number }
export type InstrumentSpec = { kind: 'synth'; preset: string };
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
```

- [ ] **Step 4: Ejecuta el test y comprueba que pasa**

Run: `npm test`
Expected: PASS (los tests nuevos + previos).

- [ ] **Step 5: Commit**

```bash
git add studio/src/daw/model.ts studio/src/daw/model.test.ts
git commit -m "Estudio F3: modelo del groovebox (canales/pasos + ops puras solo-mute) + test"
```

---

### Task 2: Proyecto v2 + migración (`app/store.ts`)

**Files:**
- Modify: `studio/src/app/store.ts` (reescritura del formato a v2 + migración).
- Modify: `studio/src/app/store.test.ts` (actualizar a las expectativas v2).

**Interfaces:**
- Consumes: `DawState`, `defaultDaw`, `defaultChannel` de `../daw/model`; `RackState` de `../fx/rack-core`.
- Produces: `interface ProjectState { version: number; daw: DawState; masterRack: RackState }`; `PROJECT_VERSION = 2`; `defaultProject`, `serializeProject`, `parseProject` (migra v1/desconocido→v2), `loadStore`, `saveStore`, `downloadProject`, `readProjectFile`.

- [ ] **Step 1: Reescribe `store.test.ts`** (expectativas v2 + migración)

```ts
// studio/src/app/store.test.ts
import { describe, it, expect } from 'vitest';
import { defaultProject, serializeProject, parseProject, PROJECT_VERSION } from './store';

describe('proyecto v2', () => {
  it('defaultProject es v2 con un canal y rack maestro vacío', () => {
    const p = defaultProject();
    expect(p.version).toBe(PROJECT_VERSION);
    expect(p.version).toBe(2);
    expect(p.daw.channels.length).toBe(1);
    expect(p.masterRack).toEqual({ effects: [] });
  });
  it('round-trip conserva el estado', () => {
    const p = defaultProject();
    p.daw.bpm = 90;
    p.masterRack = { effects: [{ type: 'gain', params: { gain: 6 }, bypassed: false }] };
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
  it('migra un proyecto v1 a un canal 0 con su instrumento y rack', () => {
    const v1 = JSON.stringify({
      version: 1, instrument: 'organo',
      instrumentRack: { effects: [{ type: 'echo', params: {}, bypassed: false }] },
      masterRack: { effects: [] }
    });
    const p = parseProject(v1);
    expect(p.version).toBe(2);
    expect(p.daw.channels.length).toBe(1);
    expect(p.daw.channels[0].instrument).toEqual({ kind: 'synth', preset: 'organo' });
    expect(p.daw.channels[0].rack.effects[0].type).toBe('echo');
    expect(p.masterRack).toEqual({ effects: [] });
  });
  it('tolera basura → proyecto por defecto v2', () => {
    const p = parseProject('{"loquesea":1}');
    expect(p.version).toBe(2);
    expect(p.daw.channels.length).toBe(1);
  });
  it('lanza con JSON inválido', () => {
    expect(() => parseProject('no-json')).toThrow();
  });
});
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `npm test`
Expected: FAIL — los tests v2 fallan (el `store.ts` actual es v1).

- [ ] **Step 3: Reescribe `store.ts`**

```ts
// studio/src/app/store.ts
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
```

- [ ] **Step 4: Ejecuta el test y comprueba que pasa**

Run: `npm test`
Expected: PASS (los tests v2 + previos). **Nota:** este cambio rompe el `studioView.ts` actual (usa `store.instrument`/`store.instrumentRack`); se arregla en la Task 6. Por eso `npm run typecheck` fallará hasta entonces — es esperado.

- [ ] **Step 5: Commit**

```bash
git add studio/src/app/store.ts studio/src/app/store.test.ts
git commit -m "Estudio F3: proyecto v2 (groovebox) + migracion v1->v2 + tests"
```

> Nota de orden: tras esta tarea `npm run typecheck` falla por `studioView` (aún en v1). Las Tasks 3-5 no tocan `studioView`; el typecheck global vuelve a verde al cerrar la **Task 6**. Verifica cada tarea con `npm test` y `npm run build` (Vite construye por módulo) hasta la Task 6.

---

### Task 3: Disparo por preset en el synth (`audio/synth.ts`)

**Files:**
- Modify: `studio/src/audio/synth.ts` (refactor: extraer `triggerVoice`; añadir `triggerPreset`; `triggerAt` delega).

**Interfaces:**
- Produces: `triggerPreset(presetName: string, midi: number, vel: number, when: number, dur: number, dest: AudioNode): void` — dispara un preset concreto a un destino concreto (para los canales). `triggerAt` mantiene su firma y comportamiento (delega en la lógica común).

- [ ] **Step 1: Refactoriza `triggerAt` y añade `triggerPreset`** en `synth.ts`

Sustituye la función `triggerAt` (la añadida en 3A) por esta versión que extrae el cuerpo a `triggerVoice` y añade `triggerPreset`:

```ts
// Construye y agenda una voz de `preset` en `when` con gate `dur`, hacia `out`. De usar y tirar.
function triggerVoice(actx: AudioContext, preset: Preset, midi: number, vel: number, when: number, dur: number, out: AudioNode): void {
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const g = actx.createGain();
  let node: AudioNode = g;
  if (preset.filter) {
    const f = actx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(Math.min(freq * preset.filter.start, preset.filter.startMax), when);
    f.frequency.exponentialRampToValueAtTime(Math.max(freq * preset.filter.end, preset.filter.endMin), when + preset.filter.time);
    g.connect(f); node = f;
  }
  node.connect(out);
  const oscs: OscillatorNode[] = [];
  for (const part of preset.partials) {
    const o = actx.createOscillator(); o.type = part.type; o.frequency.value = freq * part.ratio;
    if (part.detune) o.detune.value = part.detune;
    const pg = actx.createGain(); pg.gain.value = part.gain;
    o.connect(pg); pg.connect(g); oscs.push(o);
  }
  if (preset.vibrato) {
    const lfo = actx.createOscillator(); lfo.frequency.value = preset.vibrato.rate;
    const lg = actx.createGain(); lg.gain.value = preset.vibrato.depth;
    lfo.connect(lg); oscs.forEach(o => lg.connect(o.detune)); oscs.push(lfo);
  }
  const peak = Math.max(0.0002, preset.peak[0] + preset.peak[1] * vel);
  const rel = preset.release ?? 0.18;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + preset.attack);
  let stopAt: number;
  if (preset.sustain) {
    const gateEnd = when + Math.max(dur, preset.attack);
    g.gain.setValueAtTime(peak, gateEnd);
    g.gain.exponentialRampToValueAtTime(0.0001, gateEnd + rel);
    stopAt = gateEnd + rel + 0.03;
  } else {
    const decay = preset.decay ?? 1;
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    stopAt = when + decay + 0.03;
  }
  oscs.forEach(o => o.start(when));
  oscs.forEach(o => o.stop(stopAt));
}

// Dispara el preset ACTUAL (modo en vivo / secuenciador de 1 canal). Ruta por defecto: synthOut ?? masterDest.
export function triggerAt(midi: number, vel: number, when: number, dur: number, dest?: AudioNode): void {
  const actx = ensureAudio();
  triggerVoice(actx, SYNTH[currentPreset] ?? SYNTH.piano, midi, vel, when, dur, dest ?? synthOut ?? masterDest());
}

// Dispara un preset CONCRETO a un destino CONCRETO (para los canales del groovebox).
export function triggerPreset(presetName: string, midi: number, vel: number, when: number, dur: number, dest: AudioNode): void {
  const actx = ensureAudio();
  triggerVoice(actx, SYNTH[presetName] ?? SYNTH.piano, midi, vel, when, dur, dest);
}
```

- [ ] **Step 2: Verifica tests + build**

Run: `npm test` → verde (los tests del synth/efectos siguen). Run: `npm run build` → OK. (`npm run typecheck` global aún falla por `studioView`; es esperado hasta la Task 6.)

- [ ] **Step 3: Commit**

```bash
git add studio/src/audio/synth.ts
git commit -m "Estudio F3: synth.triggerPreset (disparar un preset a un destino, para canales)"
```

---

### Task 4: Canal de audio (`daw/channel.ts`)

**Files:**
- Create: `studio/src/daw/channel.ts`

**Interfaces:**
- Consumes: `createRack`/`Rack` (`../fx/rack`), `synth.triggerPreset` (`../audio/synth`), `ChannelState` (`./model`), `RackState` (`../fx/rack-core`).
- Produces: `interface Channel { id; instrumentBus: GainNode; rack: Rack; preset(): string; setPreset(p): void; setVolume(v): void; setPan(p): void; setAudible(a): void; trigger(note, vel, when): void; serializeRack(): RackState; dispose(): void }`; `makeChannel(actx, state: ChannelState, masterIn: AudioNode): Channel`.

- [ ] **Step 1: Implementa `daw/channel.ts`**

```ts
// studio/src/daw/channel.ts
// Canal de audio del groovebox: instrumentBus -> [rack del canal] -> gain (vol/mute) -> pan -> masterIn.
// Es el espejo vivo del ChannelState; el modelo (daw/model) sigue siendo la fuente de verdad de los datos.
import { createRack, Rack } from '../fx/rack';
import * as synth from '../audio/synth';
import type { ChannelState } from './model';
import type { RackState } from '../fx/rack-core';

export interface Channel {
  id: string;
  instrumentBus: GainNode;
  rack: Rack;
  preset(): string;
  setPreset(p: string): void;
  setVolume(v: number): void;
  setPan(p: number): void;
  setAudible(a: boolean): void;
  trigger(note: number, vel: number, when: number): void;
  serializeRack(): RackState;
  dispose(): void;
}

export function makeChannel(actx: AudioContext, state: ChannelState, masterIn: AudioNode): Channel {
  const instrumentBus = actx.createGain();
  const gain = actx.createGain();
  const panner = actx.createStereoPanner(); panner.pan.value = state.pan;
  const rack = createRack(actx, instrumentBus, gain);   // instrumentBus -> [rack] -> gain
  gain.connect(panner); panner.connect(masterIn);
  rack.restore(state.rack);

  let volume = state.volume;
  let audible = true;
  let preset = state.instrument.preset;
  const applyGain = (): void => { gain.gain.value = audible ? volume : 0; };
  applyGain();

  return {
    id: state.id, instrumentBus, rack,
    preset: () => preset,
    setPreset(p) { preset = p; },
    setVolume(v) { volume = v; applyGain(); },
    setPan(p) { panner.pan.value = p; },
    setAudible(a) { audible = a; applyGain(); },
    trigger(note, vel, when) { synth.triggerPreset(preset, note, vel, when, 0.12, instrumentBus); },
    serializeRack: () => rack.serialize(),
    dispose() {
      rack.dispose();
      for (const n of [instrumentBus, gain, panner]) { try { n.disconnect(); } catch { /* ya */ } }
    }
  };
}
```

- [ ] **Step 2: Verifica tests + build**

Run: `npm test` → verde. Run: `npm run build` → OK. (typecheck global aún falla por `studioView`.)

- [ ] **Step 3: Commit**

```bash
git add studio/src/daw/channel.ts
git commit -m "Estudio F3: canal de audio (instrumentBus -> rack -> vol/mute -> pan -> maestro)"
```

---

### Task 5: Tira de canal (`ui/channelstrip.ts` + CSS)

**Files:**
- Create: `studio/src/ui/channelstrip.ts`
- Modify: `studio/src/ui/styles.css` (estilos al final).

**Interfaces:**
- Consumes: `ChannelState` (`../daw/model`), `getPresetNames` (`../audio/synth`).
- Produces: `channelStripHTML(ch: ChannelState, index: number, selected: boolean): string` — devuelve el HTML de los controles de un canal (selección, instrumento, M/S, efectos, quitar, volumen, pan). Los `data-*` los engancha `studioView` por delegación.

- [ ] **Step 1: Implementa `ui/channelstrip.ts`**

```ts
// studio/src/ui/channelstrip.ts
// HTML de la tira de un canal (controles). Los eventos los engancha studioView por delegación (data-*).
import type { ChannelState } from '../daw/model';
import { getPresetNames } from '../audio/synth';

export function channelStripHTML(ch: ChannelState, index: number, selected: boolean): string {
  const opts = getPresetNames()
    .map(([k, label]) => `<option value="${k}"${k === ch.instrument.preset ? ' selected' : ''}>${label}</option>`).join('');
  return `<div class="chStrip${selected ? ' sel' : ''}">
    <div class="chHead">
      <button class="chSel" data-sel="${ch.id}" title="Seleccionar (lo toca el teclado)">${index + 1}</button>
      <select class="chInst" data-inst="${ch.id}">${opts}</select>
      <button class="chBtn${ch.muted ? ' on' : ''}" data-mute="${ch.id}" title="Silenciar">M</button>
      <button class="chBtn${ch.soloed ? ' onS' : ''}" data-solo="${ch.id}" title="Solo">S</button>
      <button class="chBtn" data-fx="${ch.id}" title="Efectos del canal">🎛</button>
      <button class="chBtn" data-del="${ch.id}" title="Quitar canal">✕</button>
    </div>
    <div class="chMix">
      <label title="Volumen">Vol <input type="range" data-vol="${ch.id}" min="0" max="1.2" step="0.01" value="${ch.volume}"></label>
      <label title="Paneo">Pan <input type="range" data-pan="${ch.id}" min="-1" max="1" step="0.05" value="${ch.pan}"></label>
    </div>
  </div>`;
}
```

- [ ] **Step 2: Añade los estilos al final de `studio/src/ui/styles.css`**

```css
.channels { display:flex; flex-direction:column; gap:8px; margin:6px 0; }
.chRow { display:flex; gap:10px; align-items:flex-start; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:8px; }
.chStrip { width:230px; flex:0 0 auto; }
.chStrip.sel { outline:2px solid var(--amber); outline-offset:2px; border-radius:8px; }
.chHead { display:flex; align-items:center; gap:6px; margin-bottom:6px; }
.chSel { width:28px; height:28px; border-radius:7px; background:var(--bg); color:var(--ink); border:1px solid var(--line); }
.chStrip.sel .chSel { background:var(--amber); color:#1a1306; border-color:var(--amber); }
.chInst { flex:1; min-width:0; font:inherit; background:var(--bg); color:var(--ink); border:1px solid var(--line); border-radius:7px; padding:4px 6px; }
.chBtn { width:28px; height:28px; padding:0; border-radius:7px; background:var(--bg); color:var(--muted); border:1px solid var(--line); }
.chBtn.on { background:#e0533a; color:#fff; border-color:#e0533a; }
.chBtn.onS { background:var(--amber); color:#1a1306; border-color:var(--amber); }
.chMix { display:flex; gap:10px; }
.chMix label { display:flex; align-items:center; gap:6px; color:var(--muted); font-size:11px; flex:1; }
.chMix input[type="range"] { flex:1; min-width:0; }
.chSteps { flex:1; align-self:center; }
.addCh { margin:8px 0; }
.racks .rack { min-width:260px; }
```

- [ ] **Step 3: Verifica build**

Run: `npm run build` → OK. Run: `npm test` → verde. (typecheck global aún falla por `studioView`.)

- [ ] **Step 4: Commit**

```bash
git add studio/src/ui/channelstrip.ts studio/src/ui/styles.css
git commit -m "Estudio F3: tira de canal (instrumento/vol/pan/mute/solo/fx) + estilos"
```

---

### Task 6: Reestructurar el Estudio como groovebox (`app/studioView.ts`)

**Files:**
- Modify: `studio/src/app/studioView.ts` (reescritura completa).

**Interfaces:**
- Consumes: todo lo anterior + lo existente: `ensureAudio`/`getAudioContext`, `ensureWorklets`, `masterDest`/`masterFxIn`/`masterFxOut`, `createRack`/`Rack`, `mountRack`, `'../fx/effects'`, `connectMidi`, `mountKeyboard`, `makeTransport`, `makeSequencer`, `mountTransport`, `mountStepGrid`, `*synth*`, `daw/model` ops, `makeChannel`/`Channel`, `channelStripHTML`, `store` (v2).
- Produces: `mountStudioView(root)` (misma firma).

- [ ] **Step 1: Reescribe `studio/src/app/studioView.ts`**

```ts
import { ensureAudio, getAudioContext } from '../audio/context';
import * as synth from '../audio/synth';
import { masterDest, masterFxIn, masterFxOut } from '../audio/masterBus';
import { connectMidi } from '../midi/input';
import { mountKeyboard } from '../ui/keyboard';
import { createRack, Rack } from '../fx/rack';
import { mountRack } from '../ui/rack';
import '../fx/effects';
import { ensureWorklets } from '../fx/worklets';
import { makeTransport } from '../audio/transport';
import { makeSequencer } from '../daw/sequencer';
import { mountTransport } from '../ui/transport';
import { mountStepGrid } from '../ui/stepgrid';
import { channelStripHTML } from '../ui/channelstrip';
import { makeChannel, Channel } from '../daw/channel';
import {
  DawState, ChannelState, defaultChannel, addChannel, removeChannel,
  updateChannel, toggleStep, findChannel, audibleIds
} from '../daw/model';
import { loadStore, saveStore, downloadProject, readProjectFile, ProjectState } from './store';

const STEPS_PER_BEAT = 4;
const SEQ_VEL = 0.95;

export function mountStudioView(root: HTMLElement): void {
  const project: ProjectState = loadStore();
  let daw: DawState = project.daw;
  let selectedId = daw.channels[0]?.id ?? '';

  root.innerHTML = `
    <div class="studioBar">
      <button id="stConnect">Conectar teclado</button>
      <span id="stMidi" class="muted">Sin conectar</span>
      <span class="grow"></span>
      <span class="projBtns">
        <button id="stSave">💾 Guardar proyecto</button>
        <button id="stOpen">📂 Abrir proyecto</button>
        <input id="stFile" type="file" accept="application/json,.json" hidden>
      </span>
    </div>
    <div id="transport"></div>
    <section class="seqWrap">
      <h3>Canales · secuenciador (el canal seleccionado lo toca el teclado)</h3>
      <div id="channels" class="channels"></div>
      <button id="addCh" class="addCh">＋ Añadir canal</button>
    </section>
    <div id="stKeyboard"></div>
    <p class="muted">Toca con el ratón, las teclas <b>A S D F G H J K</b> / <b>W E T Y U</b>, o tu teclado MIDI.</p>
    <div class="racks">
      <div id="chRack"></div>
      <div id="masterRack"></div>
    </div>`;

  // --- audio (lazy, tras gesto) ---
  let channels: Channel[] = [];
  let masterRack: Rack | null = null;
  let audioReady: Promise<void> | null = null;

  function persist(): void {
    // vuelca el estado de los racks vivos al modelo y guarda
    daw = { ...daw, channels: daw.channels.map(c => {
      const audio = channels.find(a => a.id === c.id);
      return audio ? { ...c, rack: audio.serializeRack() } : c;
    }) };
    saveStore({ version: 2, daw, masterRack: masterRack ? masterRack.serialize() : project.masterRack });
  }

  function routeKeyboardToSelected(): void {
    const audio = channels.find(a => a.id === selectedId);
    const ch = findChannel(daw, selectedId);
    if (audio && ch) { synth.setSynthOut(audio.instrumentBus); synth.setPreset(ch.instrument.preset); }
  }

  function initAudio(): Promise<void> {
    if (!audioReady) audioReady = (async () => {
      const actx = ensureAudio();
      try { await ensureWorklets(actx); } catch { /* sin worklets, esos efectos no se podrán añadir */ }
      masterRack = createRack(actx, masterFxIn(), masterFxOut());
      masterRack.restore(project.masterRack);
      channels = daw.channels.map(c => makeChannel(actx, c, masterDest()));
      routeKeyboardToSelected();
      mountRack(root.querySelector('#masterRack') as HTMLElement, masterRack, 'Maestro', persist);
      renderChannels();   // re-monta racks/grids con audio vivo
    })();
    return audioReady;
  }
  function audioOn(): void { ensureAudio(); void initAudio(); }

  // --- secuenciador (multi-canal) ---
  const transport = makeTransport(() => getAudioContext()?.currentTime ?? 0);
  const seq = makeSequencer(transport, {
    stepsPerBeat: STEPS_PER_BEAT,
    getTotalSteps: () => daw.steps,
    onStep: (i, when) => {
      const audibles = audibleIds(daw.channels);
      for (const c of daw.channels) {
        if (!audibles.has(c.id)) continue;
        const st = c.steps[i];
        if (st && st.on) {
          const audio = channels.find(a => a.id === c.id);
          if (audio) audio.trigger(st.note ?? 60, st.vel ?? SEQ_VEL, when);
        }
      }
    }
  });

  // --- render de canales ---
  let grids: { id: string; setPlayhead: (s: number) => void }[] = [];
  function renderChannels(): void {
    const host = root.querySelector('#channels') as HTMLElement;
    host.innerHTML = daw.channels.map((c, idx) =>
      `<div class="chRow">${channelStripHTML(c, idx, c.id === selectedId)}<div class="chSteps" id="steps-${c.id}"></div></div>`
    ).join('');
    grids = daw.channels.map(c => {
      const g = mountStepGrid(root.querySelector(`#steps-${c.id}`) as HTMLElement, {
        total: daw.steps,
        isOn: (i) => findChannel(daw, c.id)?.steps[i].on ?? false,
        onToggle: (i) => { daw = toggleStep(daw, c.id, i); persist(); }
      });
      return { id: c.id, setPlayhead: g.setPlayhead };
    });
    renderSelectedRack();
  }

  function renderSelectedRack(): void {
    const host = root.querySelector('#chRack') as HTMLElement;
    const audio = channels.find(a => a.id === selectedId);
    const ch = findChannel(daw, selectedId);
    if (audio && ch) mountRack(host, audio.rack, 'Canal ' + (daw.channels.findIndex(c => c.id === selectedId) + 1), persist);
    else host.innerHTML = '<div class="rack"><div class="rackHead"><b>Canal</b></div><p class="muted">Inicia el audio (pulsa una tecla o ▶) para sus efectos.</p></div>';
  }

  function selectChannel(id: string): void {
    selectedId = id; routeKeyboardToSelected(); renderChannels();
  }

  // --- delegación de eventos de canales ---
  (root.querySelector('#channels') as HTMLElement).addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const sel = t.getAttribute('data-sel'); if (sel) { selectChannel(sel); return; }
    const fx = t.getAttribute('data-fx'); if (fx) { selectChannel(fx); return; }
    const mute = t.getAttribute('data-mute');
    if (mute) { const c = findChannel(daw, mute); daw = updateChannel(daw, mute, { muted: !c?.muted }); applyAudible(); persist(); renderChannels(); return; }
    const solo = t.getAttribute('data-solo');
    if (solo) { const c = findChannel(daw, solo); daw = updateChannel(daw, solo, { soloed: !c?.soloed }); applyAudible(); persist(); renderChannels(); return; }
    const del = t.getAttribute('data-del');
    if (del) {
      if (daw.channels.length <= 1) return;     // siempre al menos un canal
      const audio = channels.find(a => a.id === del); if (audio) { audio.dispose(); channels = channels.filter(a => a.id !== del); }
      daw = removeChannel(daw, del);
      if (selectedId === del) selectedId = daw.channels[0].id;
      routeKeyboardToSelected(); applyAudible(); persist(); renderChannels(); return;
    }
  });
  (root.querySelector('#channels') as HTMLElement).addEventListener('input', e => {
    const t = e.target as HTMLInputElement;
    const vol = t.getAttribute('data-vol');
    if (vol) { const v = +t.value; daw = updateChannel(daw, vol, { volume: v }); channels.find(a => a.id === vol)?.setVolume(v); persist(); return; }
    const pan = t.getAttribute('data-pan');
    if (pan) { const v = +t.value; daw = updateChannel(daw, pan, { pan: v }); channels.find(a => a.id === pan)?.setPan(v); persist(); return; }
  });
  (root.querySelector('#channels') as HTMLElement).addEventListener('change', e => {
    const t = e.target as HTMLSelectElement;
    const inst = t.getAttribute('data-inst');
    if (inst) { daw = updateChannel(daw, inst, { instrument: { kind: 'synth', preset: t.value } }); channels.find(a => a.id === inst)?.setPreset(t.value); if (inst === selectedId) routeKeyboardToSelected(); persist(); }
  });

  function applyAudible(): void {
    const aud = audibleIds(daw.channels);
    for (const a of channels) a.setAudible(aud.has(a.id));
  }

  (root.querySelector('#addCh') as HTMLButtonElement).addEventListener('click', () => {
    const ch: ChannelState = defaultChannel('piano', daw.steps);
    daw = addChannel(daw, ch);
    const actx = getAudioContext();
    if (actx) channels.push(makeChannel(actx, ch, masterDest()));
    selectedId = ch.id; applyAudible(); persist(); renderChannels(); routeKeyboardToSelected();
  });

  // --- transporte + cabezal ---
  let phRaf = 0;
  function playhead(): void {
    const s = ((Math.floor(transport.beatNow() * STEPS_PER_BEAT) % daw.steps) + daw.steps) % daw.steps;
    grids.forEach(g => g.setPlayhead(s));
    phRaf = requestAnimationFrame(playhead);
  }
  const tUI = mountTransport(root.querySelector('#transport') as HTMLElement, {
    getBpm: () => transport.bpm,
    onPlay: () => { audioOn(); seq.play(); tUI.setPlaying(true); phRaf = requestAnimationFrame(playhead); },
    onStop: () => { seq.stop(); tUI.setPlaying(false); cancelAnimationFrame(phRaf); grids.forEach(g => g.setPlayhead(-1)); },
    onBpm: (bpm) => { daw = { ...daw, bpm }; seq.setBpm(bpm); persist(); }
  });

  // --- teclado (toca el canal seleccionado) ---
  mountKeyboard(root.querySelector('#stKeyboard') as HTMLElement, {
    onNoteOn: (m, v) => { audioOn(); routeKeyboardToSelected(); synth.noteOn(m, v); },
    onNoteOff: (m) => synth.noteOff(m),
    lowMidi: 60, highMidi: 84, baseMidi: 60
  });

  // --- conectar MIDI ---
  (root.querySelector('#stConnect') as HTMLButtonElement).addEventListener('click', () => {
    audioOn();
    const st = root.querySelector('#stMidi') as HTMLElement;
    connectMidi({
      onNoteOn: (m, v) => { routeKeyboardToSelected(); synth.noteOn(m, v); },
      onNoteOff: (m) => synth.noteOff(m),
      onState: (names) => { st.textContent = names.length ? '🟢 ' + names.join(' · ') : 'Ningún teclado'; }
    }).catch(err => {
      st.textContent = '🔴 ' + ((err instanceof Error && err.message) ? err.message
        : 'Este navegador no soporta Web MIDI; usa el ratón o el teclado del ordenador.');
    });
  });

  // --- guardar / abrir proyecto ---
  (root.querySelector('#stSave') as HTMLButtonElement).addEventListener('click', () => { persist(); downloadProject({ version: 2, daw, masterRack: masterRack ? masterRack.serialize() : project.masterRack }); });
  (root.querySelector('#stOpen') as HTMLButtonElement).addEventListener('click', () => (root.querySelector('#stFile') as HTMLInputElement).click());
  (root.querySelector('#stFile') as HTMLInputElement).addEventListener('change', async ev => {
    const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return;
    try {
      const p = await readProjectFile(file);
      await initAudio();
      // rehacer canales de audio
      channels.forEach(a => a.dispose()); channels = [];
      daw = p.daw; project.masterRack = p.masterRack;
      const actx = ensureAudio();
      channels = daw.channels.map(c => makeChannel(actx, c, masterDest()));
      if (masterRack) masterRack.restore(p.masterRack);
      selectedId = daw.channels[0]?.id ?? '';
      applyAudible(); routeKeyboardToSelected();
      (root.querySelector('#tbBpm') as HTMLInputElement | null)?.setAttribute('value', String(daw.bpm));
      renderChannels(); saveStore({ version: 2, daw, masterRack: p.masterRack });
    } catch {
      (root.querySelector('#stMidi') as HTMLElement).textContent = '🔴 No se pudo abrir el proyecto.';
    }
  });

  renderChannels();
}
```

- [ ] **Step 2: Verifica typecheck + tests + build** (ahora el typecheck global vuelve a verde)

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 3: Prueba manual (navegador)**

Run: `npm run dev`. En el Estudio:
- **＋ Añadir canal** crea canales; el número de la izquierda **selecciona** (el teclado toca ese canal con su instrumento).
- Cambia el **instrumento**, el **Vol** y el **Pan** de cada canal; **M** silencia, **S** deja en solo.
- Programa pasos en la fila de cada canal y pulsa **▶**: suenan los canales **audibles** (solo/mute) a tempo.
- **🎛** muestra el **rack del canal seleccionado** (añade efectos); el **rack maestro** sigue debajo.
- **💾 Guardar** y recargar (autoguardado) mantienen los canales; **📂 Abrir** restaura. Un proyecto **antiguo** (.json de F2) se abre como **un canal** con su instrumento y su rack.

- [ ] **Step 4: Commit**

```bash
git add studio/src/app/studioView.ts
git commit -m "Estudio F3: el Estudio es un groovebox (canales + mezcla + rack por canal + migracion)"
```

---

### Task 7: Versión y documentación

**Files:**
- Modify: `studio/package.json` (version), `HANDOFF.md`, `CLAUDE.md`.

- [ ] **Step 1: Sube la versión.** En `studio/package.json` cambia `"version": "0.9.0"` a `"version": "0.10.0"`.

- [ ] **Step 2: `HANDOFF.md`.** Añade la **Sub-tanda 3B**: modelo `daw/model.ts` (canales/pasos + ops puras inmutables incl. `audibleIds` solo/mute, testeado); proyecto **v2** + **migración v1→v2** (`store.ts`, canal 0 = instrumento + `instrumentRack`); `synth.triggerPreset` (dispara un preset a un destino); `daw/channel.ts` (`makeChannel`: instrumentBus→rack→gain(vol/mute)→pan→masterDest); UI `ui/channelstrip.ts`; **el Estudio es ahora un groovebox** (`studioView` reescrito): lista de canales (tira + fila de pasos), selección (el teclado toca el canal seleccionado), rack por canal (del seleccionado) + rack maestro, secuenciador multi-canal por canal audible, guardar/abrir con v2. Próximo: **3C (batería sintetizada 808)**.

- [ ] **Step 3: `CLAUDE.md`.** En la decisión 5, marca **3B hecha** (varios canales + mezcla + rack por canal + migración v1→v2); pendientes 3C batería, 3D patrones+song, 3E swing+MIDI.

- [ ] **Step 4: Verifica** — `npm run build` (OK). Confirma `version` 0.10.0 y las docs.

- [ ] **Step 5: Commit**

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio F3 sub-tanda 3B (canales + mezcla) v0.10.0: version y docs"
```

---

## Notas de ejecución
- Verificación = `npm run typecheck` / `npm test` / `npm run build` desde `d:\PianoVa\studio`. No commitear `node_modules`/`dist`.
- **Orden importante:** la Task 2 cambia el formato del proyecto y **rompe el typecheck global** (studioView v1) hasta la **Task 6**. Entre medias, verifica con `npm test` + `npm run build` (Vite transpila por módulo). El typecheck global vuelve a verde al cerrar la Task 6.
- El **modelo (`daw/model`) es la fuente de verdad**; los canales de audio (`channel.ts`) son el espejo vivo. `persist()` vuelca el estado de los racks vivos al modelo antes de guardar.
- Mute/solo: el modelo decide (`audibleIds`); el audio lo aplica con `setAudible` (gain 0). El secuenciador solo dispara canales audibles.
- El teclado toca el **canal seleccionado** apuntando el synth global (`setPreset` + `setSynthOut`) a su bus.
- No tocar `pianova.html`. Textos/comentarios en español.
```
