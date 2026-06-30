# Fase 3 · Sub-tanda 3D — Patrones + Song mode (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el groovebox tenga **varios patrones** (1, 2, 3…) que comparten los canales y guardan sus propios pasos, y un **modo canción** que encadena patrones para montar una estructura.

**Architecture:** Los canales (instrumento/mezcla/rack) son **compartidos**; cada **patrón** guarda solo los **pasos por canal** (`PatternState.steps: Record<idCanal, Step[]>`). `DawState` pasa a `{ channels, patterns, current, song, bpm, steps }`. Proyecto **v3** con migración v2→v3 (los pasos de cada canal van al patrón 0). La UI añade una barra de patrones + canción; el secuenciador (sin cambios) toca, en `onStep`, los pasos del patrón que suena (el actual, o el de la canción en curso).

**Tech Stack:** TypeScript strict, Vite, Vitest, Web Audio API. Proyecto en `studio/`.

## Global Constraints

- Todo el código nuevo va en **`studio/`**; **TypeScript strict**; **Vitest** para lo puro; **sin framework de UI**; textos/comentarios en **español**. **No tocar `pianova.html`**.
- Reusar: modelo/canal/UI de 3B/3C, `makeSequencer`/`dueSteps`, `mountStepGrid`, `mountTransport`, `createRack`/`mountRack`, store.
- **Patrones comparten canales**; cada patrón guarda `steps` por id de canal. Cambiar de patrón solo cambia los pasos visibles/sonando.
- Persistencia `localStorage` clave **`estudio-v1`** (contenido sube a **v3**); **migración v2→v3** y v1→v3 (cadena).
- `audibleIds` (solo/mute) y la cadena de audio por canal no cambian.
- Verificación por tarea desde `d:\PianoVa\studio`: `npm run typecheck` + `npm test` + `npm run build`. Prueba manual por oído.

---

### Task 1: Modelo con patrones (`daw/model.ts`)

**Files:**
- Modify: `studio/src/daw/model.ts` (reestructura: pasos fuera del canal, dentro del patrón; ops de patrón/canción).
- Modify: `studio/src/daw/model.test.ts` (actualizar/añadir tests).

**Interfaces:**
- Produces: `ChannelState` **sin** `steps`; `PatternState = { steps: Record<string, Step[]> }`; `DawState = { channels: ChannelState[]; patterns: PatternState[]; current: number; song: number[]; bpm: number; steps: number }`; `emptyPattern(channels, steps)`, `channelSteps(daw, chId)`, `addChannel`/`removeChannel` (sincronizan patrones), `updateChannel`, `toggleStep(daw, chId, i)` (en el patrón actual), `audibleIds`, `findChannel`, `addPattern`, `removePattern`, `setCurrentPattern`, `setSong`, `defaultChannel(preset?, id?)`, `defaultDaw`.

- [ ] **Step 1: Reescribe `daw/model.ts`**

```ts
// studio/src/daw/model.ts
// Modelo del groovebox. Los canales (instrumento/mezcla/rack) son compartidos; cada PATRÓN guarda los
// pasos por id de canal. Operaciones inmutables (devuelven un DawState nuevo). El audio es espejo aparte.
import type { RackState } from '../fx/rack-core';

export interface Step { on: boolean; note?: number; vel?: number }
export type InstrumentSpec = { kind: 'synth'; preset: string } | { kind: 'drum'; voice: string };
export interface ChannelState {
  id: string; name: string; instrument: InstrumentSpec;
  volume: number; pan: number; muted: boolean; soloed: boolean; rack: RackState;
}
export interface PatternState { steps: Record<string, Step[]> }
export interface DawState {
  channels: ChannelState[]; patterns: PatternState[]; current: number; song: number[]; bpm: number; steps: number;
}

export const DEFAULT_STEPS = 16;

export function emptySteps(n: number): Step[] {
  return Array.from({ length: n }, () => ({ on: false }));
}

let _cid = 0;
export function newChannelId(): string { return 'ch-' + (++_cid); }

export function defaultChannel(preset = 'piano', id?: string): ChannelState {
  return {
    id: id ?? newChannelId(), name: 'Canal', instrument: { kind: 'synth', preset },
    volume: 0.8, pan: 0, muted: false, soloed: false, rack: { effects: [] }
  };
}

export function emptyPattern(channels: ChannelState[], steps: number): PatternState {
  const s: Record<string, Step[]> = {};
  for (const c of channels) s[c.id] = emptySteps(steps);
  return { steps: s };
}

export function defaultDaw(): DawState {
  const ch = defaultChannel('piano');
  return { channels: [ch], patterns: [emptyPattern([ch], DEFAULT_STEPS)], current: 0, song: [], bpm: 120, steps: DEFAULT_STEPS };
}

export function findChannel(daw: DawState, id: string): ChannelState | undefined {
  return daw.channels.find(c => c.id === id);
}

// Pasos del canal en el patrón actual (array seguro).
export function channelSteps(daw: DawState, chId: string): Step[] {
  return daw.patterns[daw.current]?.steps[chId] ?? emptySteps(daw.steps);
}

export function addChannel(daw: DawState, ch: ChannelState): DawState {
  return {
    ...daw,
    channels: [...daw.channels, ch],
    patterns: daw.patterns.map(p => ({ steps: { ...p.steps, [ch.id]: emptySteps(daw.steps) } }))
  };
}

export function removeChannel(daw: DawState, id: string): DawState {
  return {
    ...daw,
    channels: daw.channels.filter(c => c.id !== id),
    patterns: daw.patterns.map(p => { const s = { ...p.steps }; delete s[id]; return { steps: s }; })
  };
}

export function updateChannel(daw: DawState, id: string, patch: Partial<ChannelState>): DawState {
  return { ...daw, channels: daw.channels.map(c => (c.id === id ? { ...c, ...patch } : c)) };
}

export function toggleStep(daw: DawState, chId: string, i: number): DawState {
  return {
    ...daw,
    patterns: daw.patterns.map((p, idx) => {
      if (idx !== daw.current) return p;
      const cur = p.steps[chId] ?? emptySteps(daw.steps);
      const steps = cur.slice();
      steps[i] = { ...steps[i], on: !steps[i].on };
      return { steps: { ...p.steps, [chId]: steps } };
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

// --- patrones ---
export function addPattern(daw: DawState): DawState {
  return { ...daw, patterns: [...daw.patterns, emptyPattern(daw.channels, daw.steps)], current: daw.patterns.length };
}
export function removePattern(daw: DawState, idx: number): DawState {
  if (daw.patterns.length <= 1) return daw;
  const patterns = daw.patterns.filter((_, i) => i !== idx);
  const current = Math.min(daw.current, patterns.length - 1);
  const song = daw.song.filter(p => p !== idx).map(p => (p > idx ? p - 1 : p));
  return { ...daw, patterns, current, song };
}
export function setCurrentPattern(daw: DawState, idx: number): DawState {
  return { ...daw, current: Math.max(0, Math.min(idx, daw.patterns.length - 1)) };
}
export function setSong(daw: DawState, song: number[]): DawState {
  return { ...daw, song };
}
```

- [ ] **Step 2: Reescribe `daw/model.test.ts`** (a la estructura con patrones)

```ts
// studio/src/daw/model.test.ts
import { describe, it, expect } from 'vitest';
import {
  emptySteps, defaultChannel, defaultDaw, addChannel, removeChannel, updateChannel,
  toggleStep, audibleIds, findChannel, channelSteps, addPattern, removePattern, setCurrentPattern, setSong
} from './model';

describe('modelo daw con patrones', () => {
  it('defaultDaw: 1 canal, 1 patrón, 16 pasos, sin canción', () => {
    const d = defaultDaw();
    expect(d.channels.length).toBe(1);
    expect(d.patterns.length).toBe(1);
    expect(d.current).toBe(0);
    expect(d.song).toEqual([]);
    expect(channelSteps(d, d.channels[0].id).length).toBe(16);
  });
  it('toggleStep alterna en el patrón actual y es inmutable', () => {
    const d = defaultDaw(); const id = d.channels[0].id;
    const d2 = toggleStep(d, id, 3);
    expect(channelSteps(d2, id)[3].on).toBe(true);
    expect(channelSteps(d, id)[3].on).toBe(false);
  });
  it('addChannel añade el canal y pasos vacíos en todos los patrones', () => {
    const d = addPattern(defaultDaw());           // 2 patrones
    const d2 = addChannel(d, defaultChannel('organo', 'b'));
    expect(d2.channels.length).toBe(2);
    expect(d2.patterns.every(p => Array.isArray(p.steps['b']))).toBe(true);
    expect(d.channels.length).toBe(1);            // original intacto
  });
  it('removeChannel quita el canal de todos los patrones', () => {
    const d = addChannel(addPattern(defaultDaw()), defaultChannel('o', 'b'));
    const d2 = removeChannel(d, 'b');
    expect(d2.channels.find(c => c.id === 'b')).toBeUndefined();
    expect(d2.patterns.every(p => p.steps['b'] === undefined)).toBe(true);
  });
  it('addPattern añade y selecciona el nuevo; tiene pasos para los canales', () => {
    const d = defaultDaw(); const d2 = addPattern(d);
    expect(d2.patterns.length).toBe(2);
    expect(d2.current).toBe(1);
    expect(Array.isArray(d2.patterns[1].steps[d.channels[0].id])).toBe(true);
  });
  it('removePattern mantiene ≥1 y reajusta current/canción', () => {
    let d = addPattern(addPattern(defaultDaw()));   // 3 patrones (0,1,2), current 2
    d = setSong(d, [0, 2, 1]);
    const d2 = removePattern(d, 1);                  // quita el patrón 1
    expect(d2.patterns.length).toBe(2);
    expect(d2.song).toEqual([0, 1]);                // el 2 baja a 1, el 1 desaparece
  });
  it('setCurrentPattern acota el índice', () => {
    const d = defaultDaw();
    expect(setCurrentPattern(d, 9).current).toBe(0);
    expect(setCurrentPattern(d, -3).current).toBe(0);
  });
  it('audibleIds: solo/mute', () => {
    const d = updateChannel(addChannel(defaultDaw(), defaultChannel('o', 'b')), 'b', { soloed: true });
    const a = audibleIds(d.channels);
    expect(a.has('b')).toBe(true);
    expect(a.has(d.channels[0].id)).toBe(false);
  });
  it('updateChannel no toca el original', () => {
    const d = addChannel(defaultDaw(), defaultChannel('o', 'b'));
    const d2 = updateChannel(d, 'b', { volume: 0.3 });
    expect(findChannel(d2, 'b')?.volume).toBe(0.3);
    expect(findChannel(d, 'b')?.volume).toBe(0.8);
  });
  it('emptySteps crea n pasos apagados', () => {
    expect(emptySteps(8).every(s => s.on === false)).toBe(true);
  });
});
```

- [ ] **Step 3: Ejecuta los tests**

Run: `npm test`
Expected: tras implementar, PASS (los tests del modelo nuevos). **Nota:** este cambio rompe el typecheck global por `store.ts`/`channel.ts`/`studioView.ts`/`channelstrip.ts` (usan `ChannelState.steps` o el `DawState` viejo) hasta cerrar las Tasks 2-3. Verifica con `npm test`.

- [ ] **Step 4: Commit**

```bash
git add studio/src/daw/model.ts studio/src/daw/model.test.ts
git commit -m "Estudio F3: modelo con patrones (pasos por patron, canales compartidos, song) + tests"
```

---

### Task 2: Proyecto v3 + migración v2→v3 (`app/store.ts`)

**Files:**
- Modify: `studio/src/app/store.ts`; `studio/src/app/store.test.ts`.

**Interfaces:**
- Consumes: `DawState`, `defaultDaw`, `defaultChannel`, `emptyPattern`, `emptySteps`, `Step`, `ChannelState` (`../daw/model`).
- Produces: `PROJECT_VERSION = 3`; `ProjectState { version; daw: DawState; masterRack }`; `migrate` ahora produce v3 (v2: los pasos de cada canal → patrón 0; v1: canal 0 + patrón 0).

- [ ] **Step 1: Reescribe `store.test.ts`** (v3 + migración v2→v3)

```ts
// studio/src/app/store.test.ts
import { describe, it, expect } from 'vitest';
import { defaultProject, serializeProject, parseProject, PROJECT_VERSION } from './store';

describe('proyecto v3', () => {
  it('defaultProject es v3 con 1 canal y 1 patrón', () => {
    const p = defaultProject();
    expect(p.version).toBe(3);
    expect(PROJECT_VERSION).toBe(3);
    expect(p.daw.channels.length).toBe(1);
    expect(p.daw.patterns.length).toBe(1);
  });
  it('round-trip conserva el estado', () => {
    const p = defaultProject(); p.daw.bpm = 100;
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
  it('migra v2 (canales con steps) a v3 (steps en el patrón 0)', () => {
    const v2 = JSON.stringify({
      version: 2,
      daw: { channels: [{ id: 'c1', name: 'Canal', instrument: { kind: 'synth', preset: 'organo' },
        steps: [{ on: true }, { on: false }], volume: 0.8, pan: 0, muted: false, soloed: false, rack: { effects: [] } }],
        bpm: 90, steps: 16 },
      masterRack: { effects: [] }
    });
    const p = parseProject(v2);
    expect(p.version).toBe(3);
    expect(p.daw.channels[0].id).toBe('c1');
    expect((p.daw.channels[0] as Record<string, unknown>).steps).toBeUndefined();   // ya no en el canal
    expect(p.daw.patterns[0].steps['c1'][0].on).toBe(true);
    expect(p.daw.bpm).toBe(90);
  });
  it('migra v1 a v3 (canal 0 + patrón 0)', () => {
    const v1 = JSON.stringify({ version: 1, instrument: 'organo', instrumentRack: { effects: [] }, masterRack: { effects: [] } });
    const p = parseProject(v1);
    expect(p.version).toBe(3);
    expect(p.daw.channels[0].instrument).toEqual({ kind: 'synth', preset: 'organo' });
    expect(p.daw.patterns.length).toBe(1);
  });
  it('tolera basura → v3 por defecto; lanza con JSON inválido', () => {
    expect(parseProject('{"x":1}').version).toBe(3);
    expect(() => parseProject('no-json')).toThrow();
  });
});
```

- [ ] **Step 2: Reescribe `store.ts`**

```ts
// studio/src/app/store.ts
// Persistencia del Estudio (proyecto v3: groovebox con patrones). Migra v1/v2 a v3.
import type { RackState } from '../fx/rack-core';
import { DawState, ChannelState, Step, defaultDaw, defaultChannel, emptySteps } from '../daw/model';

export const PROJECT_VERSION = 3;
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

// Acepta un DawState v3 ya formado (con valores por defecto si faltan campos).
function dawV3(v: unknown): DawState {
  const o = v as Partial<DawState> | undefined;
  if (!o || !Array.isArray(o.channels) || o.channels.length === 0 || !Array.isArray(o.patterns) || o.patterns.length === 0) return defaultDaw();
  return {
    channels: o.channels,
    patterns: o.patterns,
    current: typeof o.current === 'number' ? o.current : 0,
    song: Array.isArray(o.song) ? o.song : [],
    bpm: typeof o.bpm === 'number' ? o.bpm : 120,
    steps: typeof o.steps === 'number' ? o.steps : 16
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
  return { channels, patterns: [{ steps: stepsByCh }], current: 0, song: [], bpm: typeof o.bpm === 'number' ? o.bpm : 120, steps: total };
}

function migrate(o: Record<string, unknown>): ProjectState {
  const masterRack = rackOf(o.masterRack);
  if (o.version === 3 && o.daw) return { version: 3, daw: dawV3(o.daw), masterRack };
  if (o.version === 2 && o.daw) return { version: 3, daw: dawV2toV3(o.daw), masterRack };
  // v1 o desconocido → canal 0 + patrón 0
  const preset = typeof o.instrument === 'string' ? o.instrument : 'piano';
  const ch = defaultChannel(preset);
  ch.rack = rackOf(o.instrumentRack);
  return { version: 3, daw: { channels: [ch], patterns: [{ steps: { [ch.id]: emptySteps(16) } }], current: 0, song: [], bpm: 120, steps: 16 }, masterRack };
}

export function parseProject(json: string): ProjectState {
  return migrate(JSON.parse(json) as Record<string, unknown>);
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
```

- [ ] **Step 3: Ejecuta los tests**

Run: `npm test`
Expected: PASS (v3 + migración). El typecheck global sigue rojo por `studioView`/`channel`/`channelstrip` hasta la Task 3.

- [ ] **Step 4: Commit**

```bash
git add studio/src/app/store.ts studio/src/app/store.test.ts
git commit -m "Estudio F3: proyecto v3 (patrones) + migracion v2->v3 (steps al patron 0) + tests"
```

---

### Task 3: Barra de patrones/canción + groovebox con patrones (`ui/patternbar.ts`, `app/studioView.ts`, `daw/channel.ts`)

**Files:**
- Create: `studio/src/ui/patternbar.ts`
- Modify: `studio/src/app/studioView.ts` (reescritura), `studio/src/daw/channel.ts` (quitar la dependencia de `state.instrument` con steps — en realidad `channel.ts` no usa steps; verificar que sigue compilando), `studio/src/ui/styles.css` (estilos de la barra).

**Interfaces:**
- Consumes: `DawState` y ops de patrón (`channelSteps`, `toggleStep`, `addPattern`, `removePattern`, `setCurrentPattern`, `setSong`), `mountStepGrid`, `channelStripHTML`, `makeChannel`, store v3.
- Produces: `patternBarHTML(daw: DawState, songMode: boolean, playingSong: number): string`.

> `daw/channel.ts` **no usa `steps`** (solo instrumento/vol/pan/rack), así que no necesita cambios de lógica; si el typecheck se queja por algo, es por `studioView`. Verifica que `channel.ts` compila sin tocarlo.

- [ ] **Step 1: Crea `ui/patternbar.ts`**

```ts
// studio/src/ui/patternbar.ts
// Barra de patrones (1,2,3…) + modo canción (secuencia de patrones). Eventos por delegación (data-*).
import type { DawState } from '../daw/model';

export function patternBarHTML(daw: DawState, songMode: boolean, playingSong: number): string {
  const pats = daw.patterns.map((_, i) =>
    `<button class="patBtn${i === daw.current ? ' on' : ''}" data-pat="${i}">${i + 1}</button>`).join('');
  const chips = daw.song.length
    ? daw.song.map((p, idx) => `<span class="songChip${idx === playingSong ? ' play' : ''}">${p + 1}</span>`).join('')
    : '<span class="muted">canción vacía</span>';
  return `<div class="patBar">
    <span class="patLab">Patrón</span>${pats}
    <button class="patIcon" data-patadd title="Añadir patrón">＋</button>
    <button class="patIcon" data-patdel title="Quitar patrón actual">✕</button>
    <span class="patSep"></span>
    <button class="songToggle${songMode ? ' on' : ''}" data-songtoggle title="Modo canción">🔗 Canción</button>
    <span class="songSeq">${chips}</span>
    <button class="patIcon" data-songadd title="Añadir el patrón actual a la canción">＋ patrón</button>
    <button class="patIcon" data-songclear title="Vaciar canción">limpiar</button>
  </div>`;
}
```

- [ ] **Step 2: Añade estilos al final de `studio/src/ui/styles.css`**

```css
.patBar { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin:10px 0; }
.patLab { color:var(--muted); font-size:12px; margin-right:4px; }
.patBtn { width:30px; height:30px; border-radius:7px; background:var(--panel); color:var(--ink); border:1px solid var(--line); }
.patBtn.on { background:var(--amber); color:#1a1306; border-color:var(--amber); }
.patIcon { height:30px; padding:0 8px; border-radius:7px; background:var(--panel); color:var(--muted); border:1px solid var(--line); }
.patSep { width:1px; height:22px; background:var(--line); margin:0 6px; }
.songToggle { height:30px; padding:0 10px; border-radius:7px; background:var(--panel); color:var(--ink); border:1px solid var(--line); }
.songToggle.on { background:var(--amber); color:#1a1306; border-color:var(--amber); }
.songSeq { display:inline-flex; gap:4px; align-items:center; flex-wrap:wrap; }
.songChip { min-width:22px; text-align:center; padding:2px 6px; border-radius:6px; background:var(--bg); border:1px solid var(--line); color:var(--muted); font-size:12px; }
.songChip.play { background:var(--amber); color:#1a1306; border-color:var(--amber); }
```

- [ ] **Step 3: Reescribe `studio/src/app/studioView.ts`**

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
import { patternBarHTML } from '../ui/patternbar';
import { makeChannel, Channel } from '../daw/channel';
import {
  DawState, ChannelState, InstrumentSpec, defaultChannel, addChannel, removeChannel,
  updateChannel, toggleStep, findChannel, audibleIds, channelSteps,
  addPattern, removePattern, setCurrentPattern, setSong
} from '../daw/model';
import { loadStore, saveStore, downloadProject, readProjectFile, ProjectState } from './store';

const STEPS_PER_BEAT = 4;
const SEQ_VEL = 0.95;

export function mountStudioView(root: HTMLElement): void {
  const project: ProjectState = loadStore();
  let daw: DawState = project.daw;
  let selectedId = daw.channels[0]?.id ?? '';

  // estado de reproducción de patrón/canción
  let songMode = false;
  let playPattern = daw.current;
  let songPos = -1;
  let barStarted = false;

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
    <div id="patternBar"></div>
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

  let channels: Channel[] = [];
  let masterRack: Rack | null = null;
  let audioReady: Promise<void> | null = null;

  function persist(): void {
    daw = { ...daw, channels: daw.channels.map(c => {
      const audio = channels.find(a => a.id === c.id);
      return audio ? { ...c, rack: audio.serializeRack() } : c;
    }) };
    saveStore({ version: 3, daw, masterRack: masterRack ? masterRack.serialize() : project.masterRack });
  }

  function routeKeyboardToSelected(): void {
    const audio = channels.find(a => a.id === selectedId);
    const ch = findChannel(daw, selectedId);
    if (audio && ch && ch.instrument.kind === 'synth') { synth.setSynthOut(audio.instrumentBus); synth.setPreset(ch.instrument.preset); }
  }
  function playLive(m: number, v: number): void {
    const ch = findChannel(daw, selectedId);
    if (ch?.instrument.kind === 'drum') {
      const audio = channels.find(a => a.id === selectedId);
      const actx = getAudioContext();
      if (audio && actx) audio.trigger(m, v, actx.currentTime);
    } else { routeKeyboardToSelected(); synth.noteOn(m, v); }
  }
  function stopLive(m: number): void {
    const ch = findChannel(daw, selectedId);
    if (ch && ch.instrument.kind !== 'drum') synth.noteOff(m);
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
      renderChannels();
    })();
    return audioReady;
  }
  function audioOn(): void { ensureAudio(); void initAudio(); }

  // --- secuenciador (multi-canal + patrones/canción) ---
  const transport = makeTransport(() => getAudioContext()?.currentTime ?? 0);
  const seq = makeSequencer(transport, {
    stepsPerBeat: STEPS_PER_BEAT,
    getTotalSteps: () => daw.steps,
    onStep: (i, when) => {
      if (i === 0) {
        if (!barStarted) barStarted = true;
        else if (songMode && daw.song.length) { songPos = (songPos + 1) % daw.song.length; playPattern = daw.song[songPos]; renderPatternBar(); }
      }
      const pat = daw.patterns[playPattern]; if (!pat) return;
      const audibles = audibleIds(daw.channels);
      for (const c of daw.channels) {
        if (!audibles.has(c.id)) continue;
        const st = pat.steps[c.id]?.[i];
        if (st && st.on) { const audio = channels.find(a => a.id === c.id); if (audio) audio.trigger(st.note ?? 60, st.vel ?? SEQ_VEL, when); }
      }
    }
  });

  // --- render ---
  let grids: { id: string; setPlayhead: (s: number) => void }[] = [];
  function renderPatternBar(): void {
    (root.querySelector('#patternBar') as HTMLElement).innerHTML =
      patternBarHTML(daw, songMode, songMode && seq.isPlaying() ? songPos : -1);
  }
  function renderChannels(): void {
    const host = root.querySelector('#channels') as HTMLElement;
    host.innerHTML = daw.channels.map((c, idx) =>
      `<div class="chRow">${channelStripHTML(c, idx, c.id === selectedId)}<div class="chSteps" id="steps-${c.id}"></div></div>`
    ).join('');
    grids = daw.channels.map(c => {
      const g = mountStepGrid(root.querySelector(`#steps-${c.id}`) as HTMLElement, {
        total: daw.steps,
        isOn: (i) => channelSteps(daw, c.id)[i]?.on ?? false,
        onToggle: (i) => { daw = toggleStep(daw, c.id, i); persist(); }
      });
      return { id: c.id, setPlayhead: g.setPlayhead };
    });
    renderPatternBar();
    renderSelectedRack();
  }
  function renderSelectedRack(): void {
    const host = root.querySelector('#chRack') as HTMLElement;
    const audio = channels.find(a => a.id === selectedId);
    const ch = findChannel(daw, selectedId);
    if (audio && ch) mountRack(host, audio.rack, 'Canal ' + (daw.channels.findIndex(c => c.id === selectedId) + 1), persist);
    else host.innerHTML = '<div class="rack"><div class="rackHead"><b>Canal</b></div><p class="muted">Inicia el audio (pulsa una tecla o ▶) para sus efectos.</p></div>';
  }
  function selectChannel(id: string): void { selectedId = id; routeKeyboardToSelected(); renderChannels(); }
  function applyAudible(): void { const aud = audibleIds(daw.channels); for (const a of channels) a.setAudible(aud.has(a.id)); }

  // --- delegación: canales ---
  const channelsEl = root.querySelector('#channels') as HTMLElement;
  channelsEl.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const sel = t.getAttribute('data-sel'); if (sel) { selectChannel(sel); return; }
    const fx = t.getAttribute('data-fx'); if (fx) { selectChannel(fx); return; }
    const mute = t.getAttribute('data-mute');
    if (mute) { const c = findChannel(daw, mute); daw = updateChannel(daw, mute, { muted: !c?.muted }); applyAudible(); persist(); renderChannels(); return; }
    const solo = t.getAttribute('data-solo');
    if (solo) { const c = findChannel(daw, solo); daw = updateChannel(daw, solo, { soloed: !c?.soloed }); applyAudible(); persist(); renderChannels(); return; }
    const del = t.getAttribute('data-del');
    if (del) {
      if (daw.channels.length <= 1) return;
      const audio = channels.find(a => a.id === del); if (audio) { audio.dispose(); channels = channels.filter(a => a.id !== del); }
      daw = removeChannel(daw, del);
      if (selectedId === del) selectedId = daw.channels[0].id;
      routeKeyboardToSelected(); applyAudible(); persist(); renderChannels(); return;
    }
  });
  channelsEl.addEventListener('input', e => {
    const t = e.target as HTMLInputElement;
    const vol = t.getAttribute('data-vol');
    if (vol) { const v = +t.value; daw = updateChannel(daw, vol, { volume: v }); channels.find(a => a.id === vol)?.setVolume(v); persist(); return; }
    const pan = t.getAttribute('data-pan');
    if (pan) { const v = +t.value; daw = updateChannel(daw, pan, { pan: v }); channels.find(a => a.id === pan)?.setPan(v); persist(); return; }
  });
  channelsEl.addEventListener('change', e => {
    const t = e.target as HTMLSelectElement;
    const inst = t.getAttribute('data-inst');
    if (inst) {
      const [kind, name] = t.value.split(':');
      const spec: InstrumentSpec = kind === 'drum' ? { kind: 'drum', voice: name } : { kind: 'synth', preset: name };
      daw = updateChannel(daw, inst, { instrument: spec });
      channels.find(a => a.id === inst)?.setInstrument(spec);
      if (inst === selectedId) routeKeyboardToSelected();
      persist();
    }
  });

  // --- delegación: barra de patrones/canción ---
  (root.querySelector('#patternBar') as HTMLElement).addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const pat = t.getAttribute('data-pat');
    if (pat) { daw = setCurrentPattern(daw, +pat); persist(); renderChannels(); return; }
    if (t.hasAttribute('data-patadd')) { daw = addPattern(daw); persist(); renderChannels(); return; }
    if (t.hasAttribute('data-patdel')) { daw = removePattern(daw, daw.current); persist(); renderChannels(); return; }
    if (t.hasAttribute('data-songtoggle')) { songMode = !songMode; renderPatternBar(); return; }
    if (t.hasAttribute('data-songadd')) { daw = setSong(daw, [...daw.song, daw.current]); persist(); renderPatternBar(); return; }
    if (t.hasAttribute('data-songclear')) { daw = setSong(daw, []); persist(); renderPatternBar(); return; }
  });

  (root.querySelector('#addCh') as HTMLButtonElement).addEventListener('click', () => {
    const ch: ChannelState = defaultChannel('piano');
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
  seq.setBpm(daw.bpm);
  const tUI = mountTransport(root.querySelector('#transport') as HTMLElement, {
    getBpm: () => transport.bpm,
    onPlay: () => {
      audioOn();
      barStarted = false;
      if (songMode && daw.song.length) { songPos = 0; playPattern = daw.song[0]; } else { songPos = -1; playPattern = daw.current; }
      seq.play(); tUI.setPlaying(true); renderPatternBar(); phRaf = requestAnimationFrame(playhead);
    },
    onStop: () => { seq.stop(); tUI.setPlaying(false); cancelAnimationFrame(phRaf); grids.forEach(g => g.setPlayhead(-1)); songPos = -1; playPattern = daw.current; renderPatternBar(); },
    onBpm: (bpm) => { daw = { ...daw, bpm }; seq.setBpm(bpm); persist(); }
  });

  // --- teclado ---
  mountKeyboard(root.querySelector('#stKeyboard') as HTMLElement, {
    onNoteOn: (m, v) => { audioOn(); playLive(m, v); },
    onNoteOff: (m) => stopLive(m),
    lowMidi: 60, highMidi: 84, baseMidi: 60
  });

  // --- conectar MIDI ---
  (root.querySelector('#stConnect') as HTMLButtonElement).addEventListener('click', () => {
    audioOn();
    const st = root.querySelector('#stMidi') as HTMLElement;
    connectMidi({
      onNoteOn: (m, v) => playLive(m, v),
      onNoteOff: (m) => stopLive(m),
      onState: (names) => { st.textContent = names.length ? '🟢 ' + names.join(' · ') : 'Ningún teclado'; }
    }).catch(err => {
      st.textContent = '🔴 ' + ((err instanceof Error && err.message) ? err.message
        : 'Este navegador no soporta Web MIDI; usa el ratón o el teclado del ordenador.');
    });
  });

  // --- guardar / abrir proyecto ---
  (root.querySelector('#stSave') as HTMLButtonElement).addEventListener('click', () => { persist(); downloadProject({ version: 3, daw, masterRack: masterRack ? masterRack.serialize() : project.masterRack }); });
  (root.querySelector('#stOpen') as HTMLButtonElement).addEventListener('click', () => (root.querySelector('#stFile') as HTMLInputElement).click());
  (root.querySelector('#stFile') as HTMLInputElement).addEventListener('change', async ev => {
    const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return;
    try {
      const p = await readProjectFile(file);
      await initAudio();
      channels.forEach(a => a.dispose()); channels = [];
      daw = p.daw; project.masterRack = p.masterRack;
      const actx = ensureAudio();
      channels = daw.channels.map(c => makeChannel(actx, c, masterDest()));
      if (masterRack) masterRack.restore(p.masterRack);
      selectedId = daw.channels[0]?.id ?? '';
      songMode = false; playPattern = daw.current; songPos = -1;
      applyAudible(); routeKeyboardToSelected();
      seq.setBpm(daw.bpm);
      const bpmEl = root.querySelector('#tbBpm') as HTMLInputElement | null;
      if (bpmEl) bpmEl.value = String(daw.bpm);
      renderChannels(); saveStore({ version: 3, daw, masterRack: p.masterRack });
    } catch {
      (root.querySelector('#stMidi') as HTMLElement).textContent = '🔴 No se pudo abrir el proyecto.';
    }
  });

  renderChannels();
}
```

- [ ] **Step 4: Verifica typecheck + tests + build** (typecheck global vuelve a verde)

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 5: Prueba manual (navegador)**

Run: `npm run dev`. En el Estudio:
- La **barra de patrones** muestra "1"; **＋** añade el patrón 2 (vacío, mismos canales). Programa ritmos distintos en el 1 y el 2 y cambia entre ellos: solo cambian los pasos, la mezcla/instrumentos se mantienen.
- **🔗 Canción** activa el modo canción; **＋ patrón** añade el patrón actual a la secuencia (chips). Pulsa **▶**: en modo canción recorre los patrones de la secuencia (el chip activo se resalta); sin modo canción, repite el patrón actual.
- **✕** quita el patrón actual (mín. 1). Guardar/abrir conserva patrones y canción. Un proyecto **v2** (3B/3C) se abre con sus pasos en el patrón 1.

- [ ] **Step 6: Commit**

```bash
git add studio/src/ui/patternbar.ts studio/src/ui/styles.css studio/src/app/studioView.ts
git commit -m "Estudio F3: barra de patrones + modo cancion (secuenciador por patron audible)"
```

---

### Task 4: Versión y documentación

**Files:**
- Modify: `studio/package.json` (version), `HANDOFF.md`, `CLAUDE.md`.

- [ ] **Step 1: Sube la versión.** En `studio/package.json` cambia `"version": "0.11.0"` a `"version": "0.12.0"`.

- [ ] **Step 2: `HANDOFF.md`.** Añade la **Sub-tanda 3D**: modelo con **patrones** (los canales son compartidos; cada `PatternState.steps: Record<idCanal,Step[]>`; `DawState={channels,patterns,current,song,bpm,steps}`; ops `channelSteps`/`toggleStep`(patrón actual)/`addPattern`/`removePattern`/`setCurrentPattern`/`setSong`; `addChannel`/`removeChannel` sincronizan todos los patrones); proyecto **v3** + **migración v2→v3** (los pasos de cada canal van al patrón 0); UI `ui/patternbar.ts` (barra de patrones + modo canción); `studioView` toca en `onStep` los pasos del **patrón que suena** (el actual, o el de la canción que avanza al cruzar el paso 0). Próximo: **3E (swing + control MIDI)** — última de F3.

- [ ] **Step 3: `CLAUDE.md`.** En la decisión 5, marca **3D hecha** (patrones + song mode); pendiente solo 3E swing+MIDI.

- [ ] **Step 4: Verifica** — `npm run build` (OK). Confirma `version` 0.12.0 y las docs.

- [ ] **Step 5: Commit**

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio F3 sub-tanda 3D (patrones + song) v0.12.0: version y docs"
```

---

## Notas de ejecución
- Verificación = `npm run typecheck` / `npm test` / `npm run build` desde `d:\PianoVa\studio`. No commitear `node_modules`/`dist`.
- **Orden:** la Task 1 (modelo) rompe el typecheck global hasta la Task 3 (que reescribe `studioView` con `channelSteps`/patrones); verifica con `npm test` entre medias. `daw/channel.ts` no usa `steps`, no debería necesitar cambios.
- Patrones comparten canales; cada patrón guarda pasos por id. El secuenciador detecta el cruce del paso 0 para avanzar la canción.
- Migración: v2 (canales con `steps`) → v3 (pasos en el patrón 0, canales sin `steps`); v1 → canal 0 + patrón 0.
- No tocar `pianova.html`. Textos/comentarios en español.
```
