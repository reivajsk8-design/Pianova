# LFOs asignables (modulación de knobs) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un banco de 4 LFOs asignables a cualquier knob del Estudio para modular parámetros en bucle (sincro al tempo o libre en Hz), sin sobrescribir el valor base.

**Architecture:** LFO puro (`mod/lfo.ts`) + motor singleton (`mod/modEngine.ts`) con registro de destinos runtime y un `tick(timeSec)` que aplica `base ± profundidad·rango·onda` **solo al audio**. La app llama a `tick` desde el bucle visual (rAF) ya existente mientras haya LFOs activos. Los knobs se registran vía un `onModulate?` opcional; se asignan desde el menú del knob; el banco se edita en un panel plegable; todo se guarda en el proyecto (campo `mod`, tolerante, sin migración).

**Tech Stack:** TypeScript (strict), Vite, Vitest, Web Audio. Sin dependencias nuevas.

## Global Constraints

- Todo en `studio/`; **no tocar `pianova.html`**. TypeScript strict; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón del tema.
- Versión objetivo (package.json): **0.43.0**. Versión de proyecto sigue en **3** (sin migración; `mod` opcional).
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con el trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Ejecutar git desde `/c/Pianova` con rutas explícitas (drift de directorio en el shell).

## Mapa de archivos

- `studio/src/mod/lfo.ts` — **Crea.** Ondas, `hash01`, `RATE_FIGURES`, `periodSeconds`. (Task 1)
- `studio/src/mod/lfo.test.ts` — **Crea.** (Task 1)
- `studio/src/mod/modEngine.ts` — **Crea.** Tipos, `defaultLfos`/`defaultModState`/`sanitizeModState`, singleton `modEngine`. (Task 2)
- `studio/src/mod/modEngine.test.ts` — **Crea.** (Task 2)
- `studio/src/app/store.ts` — **Modifica.** Campo `mod?` en `ProjectState` + lectura tolerante. (Task 3)
- `studio/src/app/store.test.ts` — **Modifica.** Ida y vuelta de `mod`. (Task 3)
- `studio/src/ui/knob.ts` — **Modifica.** `onModulate?`/`onModChanged?`, registro en el motor, punto "modulado". (Task 4)
- `studio/src/ui/knobMenu.ts` — **Modifica.** Entrada "Modular (LFO)" + asignador. (Task 4)
- `studio/src/ui/lfoPanel.ts` — **Crea.** Editor compacto del banco. (Task 5)
- `studio/src/ui/styles.css` — **Modifica.** Estilos del panel LFO + punto `.modulated`. (Task 5)
- `studio/src/app/studioView.ts` — **Modifica.** Cableado (panel, onModulate Vol/Pan, tick, bpm, load/save, unregister). (Task 6)
- `studio/src/ui/rack.ts` — **Modifica.** `onModulate` en los knobs de efectos. (Task 6)
- `CLAUDE.md`, `HANDOFF.md`, `studio/package.json` — **Modifica.** Docs + versión 0.43.0. (Task 7)

---

### Task 1: LFO puro (`mod/lfo.ts`)

**Files:**
- Create: `studio/src/mod/lfo.ts`
- Test: `studio/src/mod/lfo.test.ts`

**Interfaces:**
- Produces: `type LfoWave`, `hash01(n)`, `lfoValue(wave, t)`, `interface RateFigure`, `RATE_FIGURES`, `periodSeconds(mode, rateKey, hz, bpm)`.

- [ ] **Step 1: Escribe el test (falla)**

Crea `studio/src/mod/lfo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { lfoValue, hash01, periodSeconds, RATE_FIGURES } from './lfo';

describe('lfoValue', () => {
  it('seno empieza en 0 y sube', () => {
    expect(lfoValue('sine', 0)).toBeCloseTo(0);
    expect(lfoValue('sine', 0.25)).toBeCloseTo(1);
  });
  it('triángulo empieza en 0, pico +1 y valle -1', () => {
    expect(lfoValue('tri', 0)).toBeCloseTo(0);
    expect(lfoValue('tri', 0.25)).toBeCloseTo(1);
    expect(lfoValue('tri', 0.5)).toBeCloseTo(0);
    expect(lfoValue('tri', 0.75)).toBeCloseTo(-1);
  });
  it('sierras y cuadrada', () => {
    expect(lfoValue('sawUp', 0)).toBeCloseTo(-1);
    expect(lfoValue('sawUp', 0.5)).toBeCloseTo(0);
    expect(lfoValue('sawDown', 0.5)).toBeCloseTo(0);
    expect(lfoValue('square', 0.25)).toBe(1);
    expect(lfoValue('square', 0.75)).toBe(-1);
  });
  it('la fase se repite por ciclo (t entero = misma fase)', () => {
    expect(lfoValue('sawUp', 1.5)).toBeCloseTo(lfoValue('sawUp', 0.5));
  });
  it('random (S&H): estable dentro del ciclo, distinto entre ciclos', () => {
    expect(lfoValue('random', 3.1)).toBe(lfoValue('random', 3.9));   // mismo ciclo
    expect(lfoValue('random', 3.1)).not.toBe(lfoValue('random', 4.1)); // otro ciclo
    expect(lfoValue('random', 0)).toBeGreaterThanOrEqual(-1);
    expect(lfoValue('random', 0)).toBeLessThanOrEqual(1);
  });
});

describe('hash01', () => {
  it('determinista y en [0,1)', () => {
    expect(hash01(5)).toBe(hash01(5));
    expect(hash01(5)).toBeGreaterThanOrEqual(0);
    expect(hash01(5)).toBeLessThan(1);
  });
});

describe('periodSeconds', () => {
  it('sincro: figura·(60/bpm)', () => {
    expect(periodSeconds('sync', '1/4', 1, 120)).toBeCloseTo(0.5);   // 1 beat a 120 = 0.5 s
    expect(periodSeconds('sync', '1c', 1, 120)).toBeCloseTo(2);      // 4 beats
  });
  it('libre: 1/Hz', () => {
    expect(periodSeconds('free', '1/4', 2, 120)).toBeCloseTo(0.5);
  });
  it('guardas: bpm 0 y hz 0 no explotan', () => {
    expect(periodSeconds('sync', '1/4', 1, 0)).toBeGreaterThan(0);
    expect(periodSeconds('free', '1/4', 0, 120)).toBeGreaterThan(0);
  });
  it('RATE_FIGURES incluye 1/4 con 1 beat', () => {
    expect(RATE_FIGURES.find(f => f.key === '1/4')?.beats).toBe(1);
  });
});
```

- [ ] **Step 2: Corre el test (falla)**

Run: `cd studio && npx vitest run src/mod/lfo.test.ts`
Expected: FAIL — `./lfo` no existe.

- [ ] **Step 3: Implementa `studio/src/mod/lfo.ts`**

```ts
// studio/src/mod/lfo.ts
// LFO (oscilador de baja frecuencia) puro: formas de onda y cálculo de periodo. Sin estado ni DOM.
export type LfoWave = 'sine' | 'tri' | 'sawUp' | 'sawDown' | 'square' | 'random';

// Pseudoaleatorio determinista en [0,1) a partir de un entero (para el Sample & Hold; sin Math.random → puro).
export function hash01(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// Valor del LFO en [-1,1]. `t` = tiempo/periodo (parte entera = ciclo, fracción = fase).
export function lfoValue(wave: LfoWave, t: number): number {
  const p = t - Math.floor(t);                 // fase 0..1
  switch (wave) {
    case 'sine':    return Math.sin(2 * Math.PI * p);
    case 'tri':     return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;   // empieza en 0
    case 'sawUp':   return 2 * p - 1;
    case 'sawDown': return 1 - 2 * p;
    case 'square':  return p < 0.5 ? 1 : -1;
    case 'random':  return hash01(Math.floor(t)) * 2 - 1;   // estable dentro de cada ciclo (S&H)
    default:        return 0;
  }
}

// Figuras de sincronización (en negras/beats).
export interface RateFigure { key: string; label: string; beats: number }
export const RATE_FIGURES: RateFigure[] = [
  { key: '2c',   label: '2 comp', beats: 8 },
  { key: '1c',   label: '1 comp', beats: 4 },
  { key: '1/2',  label: '1/2',    beats: 2 },
  { key: '1/4',  label: '1/4',    beats: 1 },
  { key: '1/8',  label: '1/8',    beats: 0.5 },
  { key: '1/16', label: '1/16',   beats: 0.25 },
  { key: '1/4T', label: '1/4T',   beats: 2 / 3 },
  { key: '1/8T', label: '1/8T',   beats: 1 / 3 },
];

// Periodo en segundos. sync: figura·(60/bpm). free: 1/Hz. Con guardas (bpm/hz ≤ 0 → valor seguro).
export function periodSeconds(mode: 'sync' | 'free', rateKey: string, hz: number, bpm: number): number {
  if (mode === 'free') return hz > 0 ? 1 / hz : 1;
  const fig = RATE_FIGURES.find(f => f.key === rateKey);
  const beats = fig ? fig.beats : 1;
  return beats * (60 / Math.max(1, bpm));
}
```

- [ ] **Step 4: Corre el test (pasa)**

Run: `cd studio && npx vitest run src/mod/lfo.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + build + commit**

Run: `cd studio && npm run typecheck && npm run build`

```bash
cd /c/Pianova && git add studio/src/mod/lfo.ts studio/src/mod/lfo.test.ts && git commit -m "Estudio LFO: núcleo puro (ondas + hash S&H + periodo sincro/libre)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Motor de modulación (`mod/modEngine.ts`)

**Files:**
- Create: `studio/src/mod/modEngine.ts`
- Test: `studio/src/mod/modEngine.test.ts`

**Interfaces:**
- Consumes: `lfoValue`, `periodSeconds`, `LfoWave` de `./lfo`.
- Produces: `interface LfoConfig`, `interface Assignment`, `interface ModState`, `interface ModTarget`, `LFO_COUNT`, `defaultLfos`, `defaultModState`, `sanitizeModState`, y el singleton `modEngine` con: `register`, `unregister`, `getLfos`, `setLfo`, `getAssign`, `assign`, `unassign`, `setBpm`, `setWake`, `isActive`, `tick`, `getState`, `setState`.

- [ ] **Step 1: Escribe el test (falla)**

Crea `studio/src/mod/modEngine.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { modEngine, defaultModState, defaultLfos, sanitizeModState, LFO_COUNT } from './modEngine';

beforeEach(() => { modEngine.setState(defaultModState()); });

describe('estado por defecto y saneo', () => {
  it('defaultLfos: N apagados, seno, sincro 1/4', () => {
    const l = defaultLfos();
    expect(l.length).toBe(LFO_COUNT);
    expect(l[0]).toEqual({ on: false, wave: 'sine', mode: 'sync', rateKey: '1/4', hz: 1 });
  });
  it('sanitizeModState acota índice, profundidad y enums', () => {
    const s = sanitizeModState({
      lfos: [{ on: true, wave: 'zzz', mode: 'x', rateKey: 5, hz: -2 }],
      assign: { a: { lfo: 99, depth: 5 }, b: { lfo: 1, depth: 0.3 } }
    });
    expect(s.lfos[0].wave).toBe('sine');
    expect(s.lfos[0].mode).toBe('sync');
    expect(s.lfos[0].hz).toBe(1);
    expect(s.assign.a).toBeUndefined();          // lfo 99 fuera de rango → descartado
    expect(s.assign.b).toEqual({ lfo: 1, depth: 0.3 });
  });
});

describe('asignación y tick', () => {
  it('tick aplica base + profundidad·rango·onda; restaura al apagar', () => {
    let applied = -1;
    modEngine.register('t', { min: 0, max: 1, getBase: () => 0.5, applyAudio: v => { applied = v; } });
    modEngine.setLfo(0, { on: true, wave: 'square', mode: 'free', hz: 1 });
    modEngine.assign('t', 0, 0.5);
    modEngine.setBpm(120);
    modEngine.tick(0.25);                          // square en fase 0.25 = +1
    expect(applied).toBeCloseTo(1);                // 0.5 + 0.5*1*1
    expect(modEngine.isActive()).toBe(true);
    modEngine.setLfo(0, { on: false });
    modEngine.tick(0.5);                            // dejó de estar activo → restaura base
    expect(applied).toBeCloseTo(0.5);
    expect(modEngine.isActive()).toBe(false);
  });
  it('unassign quita la modulación', () => {
    modEngine.register('t', { min: 0, max: 1, getBase: () => 0.2, applyAudio: () => {} });
    modEngine.setLfo(0, { on: true });
    modEngine.assign('t', 0, 0.5);
    expect(modEngine.getAssign('t')).toEqual({ lfo: 0, depth: 0.5 });
    modEngine.unassign('t');
    expect(modEngine.getAssign('t')).toBeUndefined();
    expect(modEngine.isActive()).toBe(false);
  });
  it('isActive es falso sin destino registrado aunque haya asignación', () => {
    modEngine.setLfo(0, { on: true });
    modEngine.assign('fantasma', 0, 0.5);
    expect(modEngine.isActive()).toBe(false);
  });
  it('getState/setState ida y vuelta', () => {
    modEngine.setLfo(2, { on: true, wave: 'tri', mode: 'free', hz: 3 });
    modEngine.assign('x', 2, 0.7);
    const s = modEngine.getState();
    modEngine.setState(defaultModState());
    expect(modEngine.getLfos()[2].on).toBe(false);
    modEngine.setState(s);
    expect(modEngine.getLfos()[2]).toEqual({ on: true, wave: 'tri', mode: 'free', rateKey: '1/4', hz: 3 });
    expect(modEngine.getAssign('x')).toEqual({ lfo: 2, depth: 0.7 });
  });
});
```

- [ ] **Step 2: Corre el test (falla)**

Run: `cd studio && npx vitest run src/mod/modEngine.test.ts`
Expected: FAIL — `./modEngine` no existe.

- [ ] **Step 3: Implementa `studio/src/mod/modEngine.ts`**

```ts
// studio/src/mod/modEngine.ts
// Motor de modulación: banco de LFOs + asignaciones (por id de knob) + registro de destinos runtime. El `tick`
// aplica base ± profundidad·rango·onda SOLO al audio (no toca el valor base ni persiste). La app posee el rAF.
import { lfoValue, periodSeconds, type LfoWave } from './lfo';

export interface LfoConfig { on: boolean; wave: LfoWave; mode: 'sync' | 'free'; rateKey: string; hz: number }
export interface Assignment { lfo: number; depth: number }              // depth 0..1 (fracción bipolar del rango)
export interface ModState { lfos: LfoConfig[]; assign: Record<string, Assignment> }

// Destino runtime que registra cada knob modulable (NO se persiste).
export interface ModTarget {
  min: number; max: number;
  getBase: () => number;
  applyAudio: (v: number) => void;
  setVisual?: (v: number) => void;
}

export const LFO_COUNT = 4;
const WAVES: LfoWave[] = ['sine', 'tri', 'sawUp', 'sawDown', 'square', 'random'];

export function defaultLfos(n = LFO_COUNT): LfoConfig[] {
  return Array.from({ length: n }, () => ({ on: false, wave: 'sine' as LfoWave, mode: 'sync' as const, rateKey: '1/4', hz: 1 }));
}
export function defaultModState(): ModState { return { lfos: defaultLfos(), assign: {} }; }

function sanitizeLfo(o: unknown): LfoConfig {
  const c = (o ?? {}) as Partial<LfoConfig>;
  return {
    on: c.on === true,
    wave: WAVES.includes(c.wave as LfoWave) ? (c.wave as LfoWave) : 'sine',
    mode: c.mode === 'free' ? 'free' : 'sync',
    rateKey: typeof c.rateKey === 'string' ? c.rateKey : '1/4',
    hz: typeof c.hz === 'number' && c.hz > 0 ? c.hz : 1,
  };
}
export function sanitizeModState(o: unknown): ModState {
  const s = (o ?? {}) as Partial<ModState>;
  const lfos = defaultLfos();
  if (Array.isArray(s.lfos)) for (let i = 0; i < LFO_COUNT; i++) if (s.lfos[i]) lfos[i] = sanitizeLfo(s.lfos[i]);
  const assign: Record<string, Assignment> = {};
  const src = (s.assign && typeof s.assign === 'object') ? s.assign as Record<string, unknown> : {};
  for (const id of Object.keys(src)) {
    const a = src[id] as Partial<Assignment>;
    if (a && typeof a.lfo === 'number' && a.lfo >= 0 && a.lfo < LFO_COUNT) {
      const depth = typeof a.depth === 'number' ? Math.max(0, Math.min(1, a.depth)) : 0.5;
      assign[id] = { lfo: a.lfo, depth };
    }
  }
  return { lfos, assign };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

let lfos = defaultLfos();
let assign: Record<string, Assignment> = {};
let bpm = 120;
let wake: (() => void) | null = null;
const targets = new Map<string, ModTarget>();
const activePrev = new Set<string>();

export const modEngine = {
  register(id: string, t: ModTarget): void { targets.set(id, t); },
  unregister(id: string): void { targets.delete(id); },
  getLfos(): LfoConfig[] { return lfos.map(l => ({ ...l })); },
  setLfo(i: number, patch: Partial<LfoConfig>): void { if (lfos[i]) { lfos[i] = { ...lfos[i], ...patch }; wake?.(); } },
  getAssign(id: string): Assignment | undefined { const a = assign[id]; return a ? { ...a } : undefined; },
  assign(id: string, lfo: number, depth: number): void { assign[id] = { lfo, depth: clamp(depth, 0, 1) }; wake?.(); },
  unassign(id: string): void { delete assign[id]; },
  setBpm(v: number): void { bpm = v; },
  setWake(fn: () => void): void { wake = fn; },
  isActive(): boolean {
    for (const id of Object.keys(assign)) { const a = assign[id]; if (lfos[a.lfo]?.on && targets.has(id)) return true; }
    return false;
  },
  tick(timeSec: number): void {
    const nowActive = new Set<string>();
    for (const id of Object.keys(assign)) {
      const a = assign[id]; const lfo = lfos[a.lfo]; const t = targets.get(id);
      if (!lfo || !lfo.on || !t) continue;
      const period = periodSeconds(lfo.mode, lfo.rateKey, lfo.hz, bpm);
      const w = lfoValue(lfo.wave, timeSec / period);
      const v = clamp(t.getBase() + a.depth * (t.max - t.min) * w, t.min, t.max);
      t.applyAudio(v); t.setVisual?.(v);
      nowActive.add(id);
    }
    for (const id of activePrev) {
      if (!nowActive.has(id)) { const t = targets.get(id); if (t) { const b = t.getBase(); t.applyAudio(b); t.setVisual?.(b); } }
    }
    activePrev.clear(); for (const id of nowActive) activePrev.add(id);
  },
  getState(): ModState { return { lfos: lfos.map(l => ({ ...l })), assign: { ...assign } }; },
  setState(s: ModState): void { const c = sanitizeModState(s); lfos = c.lfos; assign = c.assign; activePrev.clear(); },
};
```

- [ ] **Step 4: Corre el test (pasa)**

Run: `cd studio && npx vitest run src/mod/modEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + suite + build + commit**

Run: `cd studio && npm run typecheck && npm test && npm run build`

```bash
cd /c/Pianova && git add studio/src/mod/modEngine.ts studio/src/mod/modEngine.test.ts && git commit -m "Estudio LFO: motor (banco + asignaciones + registro de destinos + tick)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Persistencia del banco en el proyecto (`app/store.ts`)

**Files:**
- Modify: `studio/src/app/store.ts`
- Test: `studio/src/app/store.test.ts`

**Interfaces:**
- Consumes: `ModState` (tipo) de `../mod/modEngine`.
- Produces: `ProjectState.mod?: ModState` que sobrevive a `serializeProject`/`parseProject`.

- [ ] **Step 1: Escribe el test (falla)**

En `studio/src/app/store.test.ts`, añade tras el test de `extra` (o al final del `describe('proyecto v3')`):

```ts
  it('conserva el banco de LFOs (mod) al serializar y parsear', () => {
    const chId = 'ch-1';
    const project = {
      version: 3,
      daw: {
        channels: [{ id: chId, name: 'Canal', instrument: { kind: 'synth', preset: 'piano' }, volume: 0.8, pan: 0, muted: false, soloed: false, rack: { effects: [] } }],
        patterns: [{ steps: { [chId]: [] } }],
        current: 0, song: [], bpm: 120, steps: 16, swing: 0, scaleRoot: 0, scaleType: 'chromatic'
      },
      masterRack: { effects: [] },
      mod: { lfos: [{ on: true, wave: 'tri', mode: 'free', rateKey: '1/4', hz: 3 }], assign: { [`vol:${chId}`]: { lfo: 0, depth: 0.4 } } }
    };
    const back = parseProject(serializeProject(project as never));
    expect(back.mod?.lfos[0].wave).toBe('tri');
    expect(back.mod?.assign[`vol:${chId}`]).toEqual({ lfo: 0, depth: 0.4 });
  });
```

- [ ] **Step 2: Corre el test (falla)**

Run: `cd studio && npx vitest run src/app/store.test.ts`
Expected: FAIL — `back.mod` es `undefined` (aún no se lee).

- [ ] **Step 3: Implementa en `studio/src/app/store.ts`**

Añade el import de tipo (junto a los imports de arriba):

```ts
import type { ModState } from '../mod/modEngine';
```

Amplía la interfaz `ProjectState` (línea 12) con el campo opcional:

```ts
export interface ProjectState { version: number; daw: DawState; masterRack: RackState; samples?: Record<string, { name: string; b64: string }>; mod?: ModState }
```

En `parseProject` (donde hoy asigna `base.samples = ...`), añade justo después la lectura tolerante de `mod`:

```ts
  base.mod = (o.mod && typeof o.mod === 'object' && !Array.isArray(o.mod)) ? (o.mod as ModState) : undefined;
```

(`serializeProject` ya usa `{ ...p, ... }`, así que incluye `mod` sin más cambios.)

- [ ] **Step 4: Corre el test (pasa)**

Run: `cd studio && npx vitest run src/app/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + suite + build + commit**

Run: `cd studio && npm run typecheck && npm test && npm run build`

```bash
cd /c/Pianova && git add studio/src/app/store.ts studio/src/app/store.test.ts && git commit -m "Estudio LFO: persistencia del banco (mod) en el proyecto

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Seam del knob + asignador en el menú (`ui/knob.ts`, `ui/knobMenu.ts`)

**Files:**
- Modify: `studio/src/ui/knob.ts`
- Modify: `studio/src/ui/knobMenu.ts`

**Interfaces:**
- Consumes: `modEngine`, `LFO_COUNT` de `../mod/modEngine`.
- Produces: `KnobOpts` gana `onModulate?: (v:number)=>void` y `onModChanged?: ()=>void`; `KnobMenuActions` gana `modId?: string` y `onModChanged?: ()=>void`. El menú muestra "Modular (LFO)" y un asignador (Ninguno/LFO 1..N + profundidad).

Sin tests unitarios (DOM); se verifica con typecheck + build + manual.

- [ ] **Step 1: `knob.ts` — opts, registro en el motor, punto "modulado"**

En `studio/src/ui/knob.ts`, importa el motor (junto a los imports):

```ts
import { modEngine } from '../mod/modEngine';
```

Amplía `KnobOpts`:

```ts
export interface KnobOpts {
  min: number; max: number; value: number; default?: number; size?: number; midiId?: string;
  onChange: (v: number) => void;
  onModulate?: (v: number) => void;    // aplica SOLO al audio (para el LFO); sin guardar
  onModChanged?: () => void;           // se llama al cambiar la asignación de LFO (para persistir)
}
```

Tras el bloque de `midiId`/`refreshDot` (registro MIDI), añade el registro en el motor y el punto "modulado":

```ts
  const refreshModDot = (): void => { if (midiId) root.classList.toggle('modulated', !!modEngine.getAssign(midiId)); };
  if (midiId && opts.onModulate) {
    const om = opts.onModulate;
    modEngine.register(midiId, {
      min: opts.min, max: opts.max,
      getBase: () => value,
      applyAudio: (v) => om(v),
      setVisual: (v) => { ind.style.transform = `rotate(${valueToAngle(v, opts.min, opts.max)}deg)`; },
    });
    refreshModDot();
  }
```

En la llamada a `openKnobMenu` (dentro de `openMenu`), añade `modId` y `onModChanged`:

```ts
  const openMenu = (x: number, y: number): void => openKnobMenu(x, y, {
    reset: opts.default !== undefined ? () => { setValue(opts.default as number); opts.onChange(value); } : undefined,
    typeValue: () => {
      const s = prompt('Valor exacto:', String(Math.round(value * 1000) / 1000));
      if (s == null) return;
      const n = parseFloat(s.replace(',', '.'));
      if (!Number.isNaN(n)) { setValue(n); opts.onChange(value); }
    },
    midiId, onChanged: refreshDot,
    modId: (midiId && opts.onModulate) ? midiId : undefined,
    onModChanged: () => { refreshModDot(); opts.onModChanged?.(); },
  });
```

- [ ] **Step 2: `knobMenu.ts` — entrada y asignador**

En `studio/src/ui/knobMenu.ts`, importa el motor y `LFO_COUNT`:

```ts
import { modEngine, LFO_COUNT } from '../mod/modEngine';
```

Amplía `KnobMenuActions`:

```ts
export interface KnobMenuActions {
  reset?: () => void;
  typeValue: () => void;
  midiId?: string;
  onChanged: () => void;
  modId?: string;
  onModChanged?: () => void;
}
```

En `openKnobMenu`, tras insertar los ítems de MIDI, añade el botón "Modular (LFO)" cuando haya `modId`:

```ts
  if (a.modId) items.push(`<button data-a="mod">🌀 Modular (LFO)</button>`);
```

Y engancha su handler (tras el bloque `if (id) { ... }`), que reemplaza el contenido del menú por el asignador:

```ts
  if (a.modId) {
    const mid = a.modId;
    (el.querySelector('[data-a="mod"]') as HTMLButtonElement).addEventListener('click', () => renderModPanel(el, mid, a.onModChanged));
  }
```

Añade el helper `renderModPanel` (a nivel de módulo, antes o después de `openKnobMenu`):

```ts
// Panel de asignación de LFO dentro del menú del knob: elige LFO (Ninguno / 1..N) y la profundidad.
function renderModPanel(el: HTMLElement, modId: string, onModChanged?: () => void): void {
  const cur = modEngine.getAssign(modId);
  const depth = cur ? cur.depth : 0.5;
  const btn = (i: number, label: string): string =>
    `<button data-lfo="${i}" class="${(cur ? cur.lfo : -1) === i ? 'on' : ''}">${label}</button>`;
  let lfoBtns = btn(-1, '—');
  for (let i = 0; i < LFO_COUNT; i++) lfoBtns += btn(i, 'LFO ' + (i + 1));
  el.innerHTML = `<div class="modPanel">
    <div class="modRow">${lfoBtns}</div>
    <label class="modDepth">Profundidad <input type="range" min="0" max="1" step="0.01" value="${depth}"></label>
  </div>`;
  const rangeEl = el.querySelector('input[type="range"]') as HTMLInputElement;
  el.querySelectorAll<HTMLButtonElement>('[data-lfo]').forEach(b => b.addEventListener('click', () => {
    const i = +(b.dataset.lfo ?? '-1');
    if (i < 0) modEngine.unassign(modId);
    else modEngine.assign(modId, i, parseFloat(rangeEl.value));
    el.querySelectorAll<HTMLButtonElement>('[data-lfo]').forEach(x => x.classList.toggle('on', +(x.dataset.lfo ?? '-2') === i));
    onModChanged?.();
  }));
  rangeEl.addEventListener('input', () => {
    const a = modEngine.getAssign(modId);
    if (a) { modEngine.assign(modId, a.lfo, parseFloat(rangeEl.value)); onModChanged?.(); }
  });
}
```

- [ ] **Step 3: Typecheck + build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: sin errores; build OK. (La suite no cambia; opcional `npm test`.)

- [ ] **Step 4: Commit**

```bash
cd /c/Pianova && git add studio/src/ui/knob.ts studio/src/ui/knobMenu.ts && git commit -m "Estudio LFO: seam del knob (onModulate + registro) + asignador en el menú

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Panel del banco (`ui/lfoPanel.ts` + CSS)

**Files:**
- Create: `studio/src/ui/lfoPanel.ts`
- Modify: `studio/src/ui/styles.css`

**Interfaces:**
- Consumes: `modEngine`, `LFO_COUNT` de `../mod/modEngine`; `RATE_FIGURES`, `LfoWave` de `../mod/lfo`.
- Produces: `mountLfoPanel(root: HTMLElement, opts: { onChange: () => void }): void`.

Sin tests unitarios (DOM); se verifica con typecheck + build + manual.

- [ ] **Step 1: Implementa `studio/src/ui/lfoPanel.ts`**

```ts
// studio/src/ui/lfoPanel.ts
// Panel compacto del banco de LFOs: por LFO on/off + forma de onda + Sincro/Hz + velocidad. Lee/escribe modEngine.
import { modEngine, LFO_COUNT } from '../mod/modEngine';
import { RATE_FIGURES, type LfoWave } from '../mod/lfo';

const WAVE_LABELS: Record<LfoWave, string> = {
  sine: 'Seno', tri: 'Triáng.', sawUp: 'Sierra ↑', sawDown: 'Sierra ↓', square: 'Cuadr.', random: 'Azar',
};

export function mountLfoPanel(root: HTMLElement, opts: { onChange: () => void }): void {
  function render(): void {
    const lfos = modEngine.getLfos();
    let cells = '';
    for (let i = 0; i < LFO_COUNT; i++) {
      const l = lfos[i];
      const waves = (Object.keys(WAVE_LABELS) as LfoWave[])
        .map(w => `<option value="${w}"${w === l.wave ? ' selected' : ''}>${WAVE_LABELS[w]}</option>`).join('');
      const figs = RATE_FIGURES.map(f => `<option value="${f.key}"${f.key === l.rateKey ? ' selected' : ''}>${f.label}</option>`).join('');
      const rate = l.mode === 'sync'
        ? `<select data-a="rate" data-i="${i}">${figs}</select>`
        : `<input data-a="hz" data-i="${i}" type="number" min="0.05" max="40" step="0.05" value="${l.hz}"> Hz`;
      cells += `<div class="lfoCell${l.on ? ' on' : ''}">
        <div class="lfoTop"><button class="lfoLed" data-a="on" data-i="${i}" title="On/Off"></button><b>LFO ${i + 1}</b></div>
        <select data-a="wave" data-i="${i}">${waves}</select>
        <button class="lfoMode" data-a="mode" data-i="${i}">${l.mode === 'sync' ? 'Sincro' : 'Hz'}</button>
        <div class="lfoRate">${rate}</div>
      </div>`;
    }
    root.innerHTML = `<div class="lfoBank"><div class="lfoBankHead">🌀 LFO</div><div class="lfoCells">${cells}</div></div>`;

    root.querySelectorAll<HTMLElement>('[data-a]').forEach(el => {
      const i = +(el.dataset.i ?? '0'); const a = el.dataset.a;
      if (a === 'on') el.addEventListener('click', () => { modEngine.setLfo(i, { on: !modEngine.getLfos()[i].on }); opts.onChange(); render(); });
      else if (a === 'mode') el.addEventListener('click', () => { modEngine.setLfo(i, { mode: modEngine.getLfos()[i].mode === 'sync' ? 'free' : 'sync' }); opts.onChange(); render(); });
      else if (a === 'wave') el.addEventListener('change', () => { modEngine.setLfo(i, { wave: (el as HTMLSelectElement).value as LfoWave }); opts.onChange(); });
      else if (a === 'rate') el.addEventListener('change', () => { modEngine.setLfo(i, { rateKey: (el as HTMLSelectElement).value }); opts.onChange(); });
      else if (a === 'hz') el.addEventListener('change', () => { const v = parseFloat((el as HTMLInputElement).value); if (v > 0) { modEngine.setLfo(i, { hz: v }); opts.onChange(); } });
    });
  }
  render();
}
```

- [ ] **Step 2: CSS en `studio/src/ui/styles.css`**

Añade al final del archivo (estilo denso, verde neón del tema):

**Importante sobre variables CSS:** el panel `#lfoPanel` vive **dentro** de `.pvView`, así que puede usar las variables del tema `--pv-line` / `--pv-acc` / `--pv-ink` (la de texto es `--pv-ink`, **no** `--pv-fg`). En cambio el **menú del knob** (`.midiMenu` y su `.modPanel`) y el **punto del knob** se montan en `document.body` (fuera de `.pvView`), donde esas variables **no** resuelven: ahí van colores literales del tema (línea `#23291f`, acento `#2dff6a`, texto `#c9d2c9`, fondo `#11151c`), igual que hace `.knob.mapped::after`. Añade al final del archivo:

```css
/* --- Banco de LFOs (dentro de .pvView: usa variables del tema) --- */
.lfoBank{border:1px solid var(--pv-line);border-radius:4px;background:#0d1016;padding:6px;margin-top:6px}
.lfoBankHead{font-size:11px;letter-spacing:.5px;color:var(--pv-acc);margin-bottom:6px}
.lfoCells{display:flex;flex-wrap:wrap;gap:6px}
.lfoCell{display:flex;flex-direction:column;gap:4px;width:118px;padding:6px;border:1px solid var(--pv-line);border-radius:4px;background:#0a0d12}
.lfoCell.on{border-color:var(--pv-acc)}
.lfoTop{display:flex;align-items:center;gap:6px}
.lfoLed{width:12px;height:12px;border-radius:50%;border:1px solid var(--pv-line);background:#222;cursor:pointer;padding:0}
.lfoCell.on .lfoLed{background:var(--pv-acc);box-shadow:0 0 6px var(--pv-acc)}
.lfoCell select,.lfoCell input{font:inherit;font-size:11px;background:#11151c;color:var(--pv-ink);border:1px solid var(--pv-line);border-radius:3px;padding:2px}
.lfoMode{font-size:11px;background:#11151c;color:var(--pv-ink);border:1px solid var(--pv-line);border-radius:3px;padding:2px 4px;cursor:pointer}
.lfoRate input[type=number]{width:56px}
/* punto "modulado" del knob (en body: color literal, ámbar para distinguir del punto MIDI verde) */
.knob.modulated::after{content:'';position:absolute;bottom:1px;right:1px;width:6px;height:6px;border-radius:50%;background:#f2a33c;box-shadow:0 0 5px rgba(242,163,60,.6)}
/* asignador de LFO dentro del menú del knob (.midiMenu, en body: colores literales) */
.modPanel{display:flex;flex-direction:column;gap:6px;padding:6px;min-width:150px}
.modRow{display:flex;flex-wrap:wrap;gap:4px}
.modRow button{font-size:11px;background:#11151c;color:#c9d2c9;border:1px solid #23291f;border-radius:3px;padding:2px 6px;cursor:pointer}
.modRow button.on{background:#2dff6a;color:#04120a;border-color:#2dff6a}
.modDepth{display:flex;flex-direction:column;gap:2px;font-size:11px;color:#c9d2c9}
```

- [ ] **Step 3: Typecheck + build + commit**

Run: `cd studio && npm run typecheck && npm run build`

```bash
cd /c/Pianova && git add studio/src/ui/lfoPanel.ts studio/src/ui/styles.css && git commit -m "Estudio LFO: panel del banco (on/off + onda + Sincro/Hz + velocidad) + CSS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Cableado en la vista (`app/studioView.ts`, `ui/rack.ts`)

**Files:**
- Modify: `studio/src/app/studioView.ts`
- Modify: `studio/src/ui/rack.ts`

**Interfaces:**
- Consumes: `modEngine`, `defaultModState` de `../mod/modEngine`; `mountLfoPanel` de `../ui/lfoPanel`. En `rack.ts`: los knobs de efectos aplican por `e.setParam(...)` sin persistir.

Integración; se verifica con typecheck + build + suite verde + manual.

- [ ] **Step 1: `rack.ts` — `onModulate` en los knobs de efectos**

En `studio/src/ui/rack.ts`, en la llamada a `mountKnob` de los knobs de efecto (donde hoy está `onChange`), añade `onModulate` y `onModChanged` reutilizando `setParam`/`onChange`:

```ts
      mountKnob(el, { min: p.min, max: p.max, value: e.getValues()[p.name], default: p.default, size: 32,
        midiId: midiPrefix ? `fx:${midiPrefix}:${rack.list().findIndex(x => x.id === id)}:${p.name}` : undefined,
        onChange: (v) => {
          const q = Math.round(v / p.step) * p.step;
          e.setParam(p.name, q);
          valSpan.textContent = fmtVal(q, p.unit, p.step);
          onChange();
        },
        onModulate: (v) => { e.setParam(p.name, Math.round(v / p.step) * p.step); },   // solo audio, sin persistir
        onModChanged: onChange,                                                         // persistir asignación
      });
```

- [ ] **Step 2: `studioView.ts` — imports + host del panel**

En `studio/src/app/studioView.ts`, añade a los imports:

```ts
import { modEngine, defaultModState } from '../mod/modEngine';
import { mountLfoPanel } from '../ui/lfoPanel';
```

En la plantilla, añade el host del panel justo tras `<div id="masterRack"></div>` (línea ~120):

```ts
        <div id="masterRack"></div>
        <div id="lfoPanel"></div>
```

- [ ] **Step 3: `studioView.ts` — onModulate en Vol/Pan + onModChanged**

En `renderMixer` (líneas ~515-520), añade `onModulate`/`onModChanged` a los knobs de Vol y Pan:

```ts
      if (volEl) mountKnob(volEl, { min: 0, max: 1.2, value: c.volume, default: 0.8, size: 34, midiId: `vol:${c.id}`, onChange: v => {
        daw = updateChannel(daw, c.id, { volume: v }); channels.find(a => a.id === c.id)?.setVolume(v); persist();
      }, onModulate: v => channels.find(a => a.id === c.id)?.setVolume(v), onModChanged: persist });
      if (panEl) mountKnob(panEl, { min: -1, max: 1, value: c.pan, default: 0, size: 34, midiId: `pan:${c.id}`, onChange: v => {
        daw = updateChannel(daw, c.id, { pan: v }); channels.find(a => a.id === c.id)?.setPan(v); persist();
      }, onModulate: v => channels.find(a => a.id === c.id)?.setPan(v), onModChanged: persist });
```

- [ ] **Step 4: `studioView.ts` — cargar estado, BPM, panel y wake en `initAudio`**

Dentro de `initAudio`, tras `mountRack(... 'Maestro' ...)` (línea ~225), añade:

```ts
      modEngine.setState(project.mod ?? defaultModState());
      modEngine.setBpm(daw.bpm);
      modEngine.setWake(ensureVisualLoop);
      mountLfoPanel(root.querySelector('#lfoPanel') as HTMLElement, { onChange: persist });
```

- [ ] **Step 5: `studioView.ts` — tick del motor en el bucle visual**

En `visualTick` (líneas ~655-669), reutiliza el `const now` que ya existe en la primera línea de la función para llamar al tick del motor, y añade `modEngine.isActive()` a la condición de continuar el rAF. El cuerpo actual es:

```ts
  function visualTick(): void {
    const now = getAudioContext()?.currentTime ?? 0;
    const playing = seq.isPlaying();
    // ...
    if (playing || padHits.size || sliceHits.length) visRaf = requestAnimationFrame(visualTick);
    else { visRaf = 0; clearPads(); sampleHandle?.setActiveSlices([]); }
  }
```

Queda así (añade la línea del tick tras `const now = ...` y `|| modEngine.isActive()` en la condición; **no toques** las líneas intermedias):

```ts
  function visualTick(): void {
    const now = getAudioContext()?.currentTime ?? 0;
    if (modEngine.isActive()) modEngine.tick(now);
    const playing = seq.isPlaying();
    // ... (líneas intermedias existentes, sin cambios) ...
    if (playing || padHits.size || sliceHits.length || modEngine.isActive()) visRaf = requestAnimationFrame(visualTick);
    else { visRaf = 0; clearPads(); sampleHandle?.setActiveSlices([]); }
  }
```

- [ ] **Step 6: `studioView.ts` — BPM al motor, guardar `mod`, borrar canal**

En `onBpm` (línea ~697), añade el BPM al motor:

```ts
    onBpm: (bpm) => { daw = { ...daw, bpm }; seq.setBpm(bpm); modEngine.setBpm(bpm); persist(); },
```

Incluye `mod: modEngine.getState()` en los **cuatro** puntos que serializan el proyecto — `scheduleSave` (~152), `flushSave` (~159), el botón Guardar `downloadProject` (~729), y los `saveStore` de "Nuevo" (~748) y "Abrir" (~768). Ejemplo para `scheduleSave`:

```ts
      saveStore({ version: 3, daw, masterRack: masterRack ? masterRack.serialize() : project.masterRack, mod: modEngine.getState() });
```

Aplica el mismo añadido `, mod: modEngine.getState()` a `flushSave`, al `downloadProject({...})` del botón Guardar, y a los dos `saveStore({...})` de Nuevo y Abrir. En **Nuevo** (reset), tras construir el `daw` por defecto, resetea el banco: `modEngine.setState(defaultModState());` antes de ese `saveStore`. En **Abrir**, tras `daw = p.daw`, aplica el banco del proyecto abierto: `modEngine.setState(p.mod ?? defaultModState());`.

En el borrado de canal (busca `removeChannel(daw, ...)` en el archivo, ~línea 583), desregistra sus destinos para no modular ids muertos:

```ts
      for (const pre of ['vol', 'pan', 'human']) modEngine.unregister(`${pre}:${id}`);
```

(usa la variable de id del canal que se está borrando en ese punto).

- [ ] **Step 7: Typecheck + suite + build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: typecheck sin errores; suite verde (sin cambiar de número respecto a las tareas 1-3, que añadieron sus tests); build OK.

- [ ] **Step 8: Prueba manual (dev)**

Run: `cd studio && npm run dev`
Comprueba: en el panel LFO enciende LFO 1 (Sincro 1/4); clic derecho en el knob de Volumen de un canal → "Modular (LFO)" → LFO 1, sube Profundidad; con audio sonando, el volumen late; conmuta el LFO a Hz y cambia la velocidad; apaga el LFO y el knob vuelve a su sitio; asigna otro LFO a un knob de efecto; Guardar y recargar conserva el banco y las asignaciones.

- [ ] **Step 9: Commit**

```bash
cd /c/Pianova && git add studio/src/app/studioView.ts studio/src/ui/rack.ts && git commit -m "Estudio LFO: cableado (panel + onModulate Vol/Pan/efectos + tick + bpm + persistencia)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Docs + versión 0.43.0

**Files:**
- Modify: `CLAUDE.md`, `HANDOFF.md`, `studio/package.json`

- [ ] **Step 1: Versión**

En `studio/package.json`, cambia `"version": "0.42.0"` a `"version": "0.43.0"`.

- [ ] **Step 2: `CLAUDE.md`**

Al final de la cadena de hitos "Rediseño PIANOVA STUDIO" (tras la entrada de acordes v0.42.0), añade con el mismo estilo y separador ` · `:

```
· **LFOs asignables (v0.43.0): banco de 4 LFOs (seno/triáng./sierra↑↓/cuadr./azar) sincro al tempo o libre en Hz, asignables a cualquier knob (Vol/Pan/efectos) desde su menú con profundidad; modulan solo el audio alrededor del valor base, se guardan en el proyecto** (`mod/lfo.ts` + `mod/modEngine.ts` + seam `ui/knob.ts` `onModulate` + `ui/knobMenu.ts` + `ui/lfoPanel.ts`; sin migración)
```

- [ ] **Step 3: `HANDOFF.md`**

Añade una entrada v0.43.0 al inicio del changelog del Estudio, estilo consistente con las previas (qué hace + archivos + "banco en el proyecto, sin migración; motor puro testeado").

- [ ] **Step 4: Verificación final + commit**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: todo verde.

```bash
cd /c/Pianova && git add studio/package.json CLAUDE.md HANDOFF.md && git commit -m "Estudio LFO: docs + versión 0.43.0

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notas de integración

- **Modular ≠ guardar:** `onModulate` aplica solo al audio; el valor base del knob y el estado guardado no cambian. Al apagar/desasignar, el motor restaura el base una vez.
- **rAF compartido:** el motor no tiene su propio bucle; `visualTick` lo llama mientras `isActive()`. `setWake(ensureVisualLoop)` arranca el bucle al encender un LFO o crear una asignación.
- **Ids de destino:** el LFO usa el mismo `midiId` del knob como id de destino (Vol/Pan/efectos ya lo tienen). El synth editable y el EQ pueden sumarse luego dándoles `onModulate`.
- **Persistencia:** el banco vive en `ProjectState.mod` (tolerante, sin subir la versión 3). Proyectos viejos cargan con el banco por defecto (todo apagado).
