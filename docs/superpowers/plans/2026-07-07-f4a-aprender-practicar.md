# F4a — Módulo Aprender: núcleo "Practicar" (+ Escuchar) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rellenar la pestaña Aprender del Estudio con notas que caen (Synthesia) + modo Practicar (espera a que toques) y Escuchar, con 2-3 canciones a mano.

**Architecture:** Tres módulos puros bajo `learn/` (canciones, lógica pedagógica "esperar a que toques", geometría de teclas) + una vista `app/learnView.ts` que dibuja las notas que caen en un `<canvas>`, reutiliza el teclado DOM, la entrada MIDI y el synth "piano", y corre un bucle rAF. El MIDI se refactoriza a multi-suscriptor para que Estudio y Aprender convivan.

**Tech Stack:** TypeScript (strict), Vite, Vitest, Web Audio, Canvas 2D. Sin dependencias nuevas.

## Global Constraints

- Todo en `studio/`; **no tocar `pianova.html`**. TypeScript strict; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón del tema (verde `#2dff6a`).
- Versión objetivo (package.json): **0.44.0**.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con el trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Ejecutar git desde `/c/Pianova` con rutas explícitas (drift de directorio en el shell).

## Mapa de archivos

- `studio/src/learn/song.ts` — **Crea.** Tipos + 3 canciones + `songRange`. (Task 1)
- `studio/src/learn/song.test.ts` — **Crea.** (Task 1)
- `studio/src/learn/practice.ts` — **Crea.** Máquina de estados "esperar a que toques". (Task 2)
- `studio/src/learn/practice.test.ts` — **Crea.** (Task 2)
- `studio/src/learn/geometry.ts` — **Crea.** Geometría de teclas (notas que caen ↔ teclado). (Task 3)
- `studio/src/learn/geometry.test.ts` — **Crea.** (Task 3)
- `studio/src/midi/input.ts` — **Modifica.** `connectMidi` multi-suscriptor (fan-out) + devuelve baja. (Task 4)
- `studio/src/app/studioView.ts` — **Modifica.** Filtra sus note-on/CC por pestaña activa (`root.hidden`). (Task 4)
- `studio/src/app/learnView.ts` — **Crea.** La vista Aprender. (Task 5)
- `studio/src/app/shell.ts` — **Modifica.** Monta `mountLearnView`. (Task 6)
- `studio/src/ui/styles.css` — **Modifica.** Estilos de la vista Aprender. (Task 6)
- `CLAUDE.md`, `HANDOFF.md`, `studio/package.json` — **Modifica.** Docs + versión 0.44.0. (Task 6)

---

### Task 1: Canciones a mano (`learn/song.ts`)

**Files:**
- Create: `studio/src/learn/song.ts`
- Test: `studio/src/learn/song.test.ts`

**Interfaces:**
- Produces: `interface LearnNote { midi: number; startBeat: number; dur: number; hand?: 'L' | 'R' }`; `interface LearnSong { id: string; name: string; bpm: number; notes: LearnNote[] }`; `const SONGS: LearnSong[]`; `function songRange(song: LearnSong): { low: number; high: number }`.

- [ ] **Step 1: Escribe el test (falla)**

Crea `studio/src/learn/song.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SONGS, songRange } from './song';

describe('canciones de Aprender', () => {
  it('hay al menos 3 canciones con id, nombre y notas', () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(3);
    for (const s of SONGS) {
      expect(typeof s.id).toBe('string');
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.bpm).toBeGreaterThan(0);
      expect(s.notes.length).toBeGreaterThan(0);
    }
  });
  it('las notas están ordenadas por startBeat, con dur>0 y midi de piano', () => {
    for (const s of SONGS) {
      let prev = -1;
      for (const n of s.notes) {
        expect(n.startBeat).toBeGreaterThanOrEqual(prev);
        expect(n.dur).toBeGreaterThan(0);
        expect(n.midi).toBeGreaterThanOrEqual(21);
        expect(n.midi).toBeLessThanOrEqual(108);
        prev = n.startBeat;
      }
    }
  });
  it('la primera canción es la escala de Do (60..72)', () => {
    const escala = SONGS[0];
    expect(escala.notes[0].midi).toBe(60);
    expect(escala.notes[escala.notes.length - 1].midi).toBe(72);
    expect(songRange(escala)).toEqual({ low: 60, high: 72 });
  });
});
```

- [ ] **Step 2: Corre el test (falla)**

Run: `cd studio && npx vitest run src/learn/song.test.ts`
Expected: FAIL — `./song` no existe.

- [ ] **Step 3: Implementa `studio/src/learn/song.ts`**

```ts
// studio/src/learn/song.ts
// Canciones sencillas escritas a mano para el módulo Aprender (F4a). Tiempo en beats; una nota por beat salvo
// indicación de dur. Todas a mano derecha.
export interface LearnNote { midi: number; startBeat: number; dur: number; hand?: 'L' | 'R' }
export interface LearnSong { id: string; name: string; bpm: number; notes: LearnNote[] }

// Construye notas consecutivas (cada una empieza donde acaba la anterior) a partir de {midi, dur}.
function seq(steps: { midi: number; dur: number }[]): LearnNote[] {
  const notes: LearnNote[] = [];
  let t = 0;
  for (const s of steps) { notes.push({ midi: s.midi, startBeat: t, dur: s.dur, hand: 'R' }); t += s.dur; }
  return notes;
}
const q = (midi: number, dur = 1) => ({ midi, dur });   // atajo

export const SONGS: LearnSong[] = [
  {
    id: 'escala-do', name: 'Escala de Do', bpm: 90,
    notes: seq([60, 62, 64, 65, 67, 69, 71, 72].map(m => q(m))),
  },
  {
    id: 'estrellita', name: 'Estrellita', bpm: 100,
    notes: seq([
      q(60), q(60), q(67), q(67), q(69), q(69), q(67, 2),
      q(65), q(65), q(64), q(64), q(62), q(62), q(60, 2),
    ]),
  },
  {
    id: 'oda-alegria', name: 'Oda a la alegría', bpm: 100,
    notes: seq([
      q(64), q(64), q(65), q(67), q(67), q(65), q(64), q(62),
      q(60), q(60), q(62), q(64), q(64, 1.5), q(62, 0.5), q(62, 2),
    ]),
  },
];

// Rango de teclas de la canción (grave/agudo). Si está vacía, un octava alrededor de Do central.
export function songRange(song: LearnSong): { low: number; high: number } {
  if (!song.notes.length) return { low: 60, high: 72 };
  let low = Infinity, high = -Infinity;
  for (const n of song.notes) { if (n.midi < low) low = n.midi; if (n.midi > high) high = n.midi; }
  return { low, high };
}
```

- [ ] **Step 4: Corre el test (pasa)** — `cd studio && npx vitest run src/learn/song.test.ts` → PASS.
- [ ] **Step 5: Typecheck + build + commit**

Run: `cd studio && npm run typecheck && npm run build`

```bash
cd /c/Pianova && git add studio/src/learn/song.ts studio/src/learn/song.test.ts && git commit -m "Aprender F4a: canciones a mano (escala/estrellita/oda) + songRange

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Lógica pedagógica "esperar a que toques" (`learn/practice.ts`)

**Files:**
- Create: `studio/src/learn/practice.ts`
- Test: `studio/src/learn/practice.test.ts`

**Interfaces:**
- Consumes: `LearnNote` (tipo) de `./song`.
- Produces: `interface PracticeState { notes: LearnNote[]; idx: number; done: boolean; hits: number }`; `interface JudgeResult { advanced: boolean; idx: number; done: boolean }`; `function makePractice(notes: LearnNote[]): PracticeState`; `function targetNote(s: PracticeState): LearnNote | undefined`; `function judge(s: PracticeState, midi: number): JudgeResult`.

- [ ] **Step 1: Escribe el test (falla)**

Crea `studio/src/learn/practice.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makePractice, targetNote, judge } from './practice';
import type { LearnNote } from './song';

const notes: LearnNote[] = [
  { midi: 60, startBeat: 0, dur: 1 },
  { midi: 62, startBeat: 1, dur: 1 },
  { midi: 64, startBeat: 2, dur: 1 },
];

describe('practice', () => {
  it('makePractice arranca en idx 0, sin terminar', () => {
    const s = makePractice(notes);
    expect(s.idx).toBe(0); expect(s.done).toBe(false); expect(s.hits).toBe(0);
    expect(targetNote(s)?.midi).toBe(60);
  });
  it('makePractice con lista vacía está terminado', () => {
    const s = makePractice([]);
    expect(s.done).toBe(true); expect(targetNote(s)).toBeUndefined();
  });
  it('la nota equivocada no avanza; la correcta avanza y suma hit', () => {
    const s = makePractice(notes);
    expect(judge(s, 61)).toEqual({ advanced: false, idx: 0, done: false });
    expect(s.hits).toBe(0);
    expect(judge(s, 60)).toEqual({ advanced: true, idx: 1, done: false });
    expect(s.hits).toBe(1);
    expect(targetNote(s)?.midi).toBe(62);
  });
  it('al tocar la última nota queda done, y luego es no-op', () => {
    const s = makePractice(notes);
    judge(s, 60); judge(s, 62);
    const last = judge(s, 64);
    expect(last).toEqual({ advanced: true, idx: 3, done: true });
    expect(s.done).toBe(true);
    expect(judge(s, 60)).toEqual({ advanced: false, idx: 3, done: true });
  });
});
```

- [ ] **Step 2: Corre el test (falla)** — `cd studio && npx vitest run src/learn/practice.test.ts` → FAIL (no existe).
- [ ] **Step 3: Implementa `studio/src/learn/practice.ts`**

```ts
// studio/src/learn/practice.ts
// Lógica pedagógica del modo Practicar (portada de pianova.html): la melodía espera en la nota actual hasta que
// tocas su tono; al acertar, avanza. Estado transitorio de UI (se muta), no persistido.
import type { LearnNote } from './song';

export interface PracticeState { notes: LearnNote[]; idx: number; done: boolean; hits: number }
export interface JudgeResult { advanced: boolean; idx: number; done: boolean }

export function makePractice(notes: LearnNote[]): PracticeState {
  return { notes, idx: 0, done: notes.length === 0, hits: 0 };
}

// Nota que hay que tocar ahora (o undefined si la canción terminó).
export function targetNote(s: PracticeState): LearnNote | undefined {
  return s.done ? undefined : s.notes[s.idx];
}

// Juzga una nota tocada. Si el tono coincide con la nota objetivo, avanza (y marca done al llegar al final).
// Las notas equivocadas se ignoran. Muta `s` y devuelve el resultado.
export function judge(s: PracticeState, midi: number): JudgeResult {
  if (s.done) return { advanced: false, idx: s.idx, done: true };
  if (s.notes[s.idx].midi !== midi) return { advanced: false, idx: s.idx, done: false };
  s.idx++; s.hits++;
  if (s.idx >= s.notes.length) s.done = true;
  return { advanced: true, idx: s.idx, done: s.done };
}
```

- [ ] **Step 4: Corre el test (pasa)** — `cd studio && npx vitest run src/learn/practice.test.ts` → PASS.
- [ ] **Step 5: Typecheck + build + commit**

Run: `cd studio && npm run typecheck && npm run build`

```bash
cd /c/Pianova && git add studio/src/learn/practice.ts studio/src/learn/practice.test.ts && git commit -m "Aprender F4a: logica Practicar (esperar a que toques, judge/targetNote)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Geometría de teclas (`learn/geometry.ts`)

**Files:**
- Create: `studio/src/learn/geometry.ts`
- Test: `studio/src/learn/geometry.test.ts`

**Interfaces:**
- Produces: `interface KeyGeom { midi: number; x: number; w: number; black: boolean }`; `function keyLayout(low: number, high: number, width: number): KeyGeom[]`; `function keyGeomFor(layout: KeyGeom[], midi: number): KeyGeom | undefined`.

**Contexto:** debe coincidir con el teclado DOM de `ui/keyboard.ts` + su CSS (`ui/styles.css`): blancas con `flex:1` (repartidas por igual), negras con `left = índiceBlancasIzq·(100%/blancas) - (100%/blancas)·0.3` y `width = (100%/blancas)·0.6`. Las blancas de una octava son los semitonos {0,2,4,5,7,9,11}.

- [ ] **Step 1: Escribe el test (falla)**

Crea `studio/src/learn/geometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { keyLayout, keyGeomFor } from './geometry';

describe('geometría de teclas', () => {
  it('reparte las blancas por igual y marca negras', () => {
    const lay = keyLayout(60, 72, 800);   // Do4..Do5: 8 blancas (60,62,64,65,67,69,71,72), whiteW=100
    const c4 = keyGeomFor(lay, 60)!;
    const d4 = keyGeomFor(lay, 62)!;
    expect(c4.black).toBe(false);
    expect(c4.x).toBeCloseTo(0);
    expect(c4.w).toBeCloseTo(100);
    expect(d4.x).toBeCloseTo(100);        // segunda blanca
    const cs4 = keyGeomFor(lay, 61)!;     // Do#4 (negra)
    expect(cs4.black).toBe(true);
    expect(cs4.w).toBeCloseTo(60);        // 100*0.6
    expect(cs4.x).toBeCloseTo(70);        // 1*100 - 100*0.3
  });
  it('cuenta todas las teclas del rango', () => {
    const lay = keyLayout(60, 72, 800);   // 13 semitonos
    expect(lay.length).toBe(13);
  });
  it('keyGeomFor devuelve undefined fuera de rango', () => {
    const lay = keyLayout(60, 72, 800);
    expect(keyGeomFor(lay, 40)).toBeUndefined();
    expect(keyGeomFor(lay, 90)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Corre el test (falla)** — `cd studio && npx vitest run src/learn/geometry.test.ts` → FAIL (no existe).
- [ ] **Step 3: Implementa `studio/src/learn/geometry.ts`**

```ts
// studio/src/learn/geometry.ts
// Geometría horizontal de las teclas, compartida por las notas que caen y el teclado DOM (ui/keyboard.ts + CSS).
// Blancas repartidas por igual; negras encima con el mismo desfase que su CSS.
export interface KeyGeom { midi: number; x: number; w: number; black: boolean }

const WHITE = [0, 2, 4, 5, 7, 9, 11];   // semitonos de teclas blancas dentro de la octava
function isBlack(midi: number): boolean { return !WHITE.includes(((midi % 12) + 12) % 12); }

// Disposición de teclas para [low,high] en `width` px. whiteW = width / nBlancas.
export function keyLayout(low: number, high: number, width: number): KeyGeom[] {
  const whites: number[] = [];
  for (let m = low; m <= high; m++) if (!isBlack(m)) whites.push(m);
  const whiteW = whites.length ? width / whites.length : width;
  const out: KeyGeom[] = [];
  for (let m = low; m <= high; m++) {
    if (isBlack(m)) {
      const leftWhites = whites.filter(w => w < m).length;
      out.push({ midi: m, x: leftWhites * whiteW - whiteW * 0.3, w: whiteW * 0.6, black: true });
    } else {
      const i = whites.indexOf(m);
      out.push({ midi: m, x: i * whiteW, w: whiteW, black: false });
    }
  }
  return out;
}

export function keyGeomFor(layout: KeyGeom[], midi: number): KeyGeom | undefined {
  return layout.find(k => k.midi === midi);
}
```

- [ ] **Step 4: Corre el test (pasa)** — `cd studio && npx vitest run src/learn/geometry.test.ts` → PASS.
- [ ] **Step 5: Typecheck + build + commit**

Run: `cd studio && npm run typecheck && npm run build`

```bash
cd /c/Pianova && git add studio/src/learn/geometry.ts studio/src/learn/geometry.test.ts && git commit -m "Aprender F4a: geometria de teclas (notas que caen sobre su tecla)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: MIDI multi-suscriptor (`midi/input.ts`) + filtro por pestaña (`studioView.ts`)

**Files:**
- Modify: `studio/src/midi/input.ts`
- Modify: `studio/src/app/studioView.ts`

**Interfaces:**
- `connectMidi(h: MidiHandlers): Promise<() => void>` — ahora **multi-suscriptor**: la primera llamada abre Web MIDI y las siguientes se suman; devuelve una función de baja. El parseo (`parseMidiMessage`) no cambia.

**Contexto:** hoy `connectMidi` hace `inp.onmidimessage = ...`, así que dos vistas (Estudio y Aprender) se pisan (gana la última). Se refactoriza a un único enlace global que reparte (`fan-out`) a todos los suscriptores. Cada vista filtra sus note-on por pestaña activa (`root.hidden`) para no sonar cuando no está a la vista; los note-off se procesan siempre (soltar es seguro).

- [ ] **Step 1: Refactoriza `studio/src/midi/input.ts`**

Sustituye la función `connectMidi` (deja `parseMidiMessage` y las interfaces igual) por la versión multi-suscriptor:

```ts
const subs = new Set<MidiHandlers>();
let bound = false;
let lastNames: string[] = [];

function fanOut(p: MidiParsed, port: string): void {
  for (const h of subs) {
    if (p.type === 'on') h.onNoteOn(p.midi, p.vel);
    else if (p.type === 'off') h.onNoteOff(p.midi);
    else if (p.type === 'cc') h.onControl?.(p.midi, p.vel, p.channel, port);
  }
}

// Suscribe un juego de manejadores a TODAS las entradas MIDI. La primera llamada abre Web MIDI; las siguientes
// se suman al reparto. Devuelve una función para darse de baja. (Varias vistas pueden escuchar a la vez.)
export async function connectMidi(h: MidiHandlers): Promise<() => void> {
  subs.add(h);
  const unsub = (): void => { subs.delete(h); };
  if (bound) { h.onState(lastNames); return unsub; }
  const req = (navigator as unknown as { requestMIDIAccess?: (o?: { sysex?: boolean }) => Promise<any> }).requestMIDIAccess;
  if (!req) { h.onState([]); throw new Error('Este navegador no soporta Web MIDI (usa Chrome/Edge y HTTPS).'); }
  const access: any = await req.call(navigator, { sysex: false });
  const bind = (): void => {
    lastNames = [];
    access.inputs.forEach((inp: any) => {
      inp.onmidimessage = (ev: any): void => fanOut(parseMidiMessage(ev.data as Uint8Array), inp.name ?? 'MIDI');
      lastNames.push(inp.name ?? 'MIDI');
    });
    for (const s of subs) s.onState(lastNames);
  };
  access.onstatechange = bind;
  bind();
  bound = true;
  return unsub;
}
```

- [ ] **Step 2: Filtra por pestaña activa en `studio/src/app/studioView.ts`**

En la llamada a `connectMidi` (líneas ~723-726), envuelve los note-on y el CC con `if (root.hidden) return;` (no suenen ni muevan knobs cuando el Estudio no está a la vista); deja el note-off sin filtrar (soltar notas colgadas es seguro):

```ts
    connectMidi({
      onNoteOn: (m, v) => { if (root.hidden) return; playLive(m, v); },
      onNoteOff: (m) => stopLive(m),
      onControl: (cc, v01, _ch, port) => { if (root.hidden) return; midiLearn.handleCC(cc, v01, port); },
      onState: (names) => {
        st.classList.toggle('on', names.length > 0);
        st.textContent = names.length ? names.join(' · ') : 'Ningún teclado';
      }
    }).catch(err => {
```

(`connectMidi` ahora devuelve `Promise<() => void>`; el Estudio ignora la baja, y `.catch(...)` sigue igual.)

- [ ] **Step 3: Typecheck + suite + build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: typecheck sin errores; suite verde (los tests de `midi/input.test.ts` prueban `parseMidiMessage`, que no cambió); build OK. Si algún test comprobara el tipo de retorno de `connectMidi`, actualízalo al nuevo `Promise<() => void>`.

- [ ] **Step 4: Commit**

```bash
cd /c/Pianova && git add studio/src/midi/input.ts studio/src/app/studioView.ts && git commit -m "MIDI multi-suscriptor (fan-out) para que Estudio y Aprender convivan

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Vista Aprender (`app/learnView.ts`)

**Files:**
- Create: `studio/src/app/learnView.ts`

**Interfaces:**
- Consumes: `mountKeyboard` de `../ui/keyboard`; `connectMidi` de `../midi/input`; `ensureAudio`, `getAudioContext` de `../audio/context`; `masterDest` de `../audio/masterBus`; `noteOn`, `noteOff`, `allNotesOff`, `setPreset`, `setSynthOut`, `triggerPreset` de `../audio/synth`; `noteName` de `../daw/scales`; `SONGS`, `songRange`, `LearnSong` de `../learn/song`; `makePractice`, `targetNote`, `judge`, `PracticeState` de `../learn/practice`; `keyLayout`, `keyGeomFor`, `KeyGeom` de `../learn/geometry`.
- Produces: `function mountLearnView(root: HTMLElement): void`.

Vista/DOM sin tests unitarios; se verifica con typecheck + build + prueba manual (Task 6).

- [ ] **Step 1: Implementa `studio/src/app/learnView.ts`**

```ts
// studio/src/app/learnView.ts
// Vista Aprender (F4a): notas que caen (Synthesia) + teclado, modos Practicar (espera a que toques) y Escuchar.
import { mountKeyboard } from '../ui/keyboard';
import { connectMidi } from '../midi/input';
import { ensureAudio, getAudioContext } from '../audio/context';
import { masterDest } from '../audio/masterBus';
import { noteOn, noteOff, allNotesOff, setPreset, setSynthOut, triggerPreset } from '../audio/synth';
import { noteName } from '../daw/scales';
import { SONGS, songRange, type LearnSong } from '../learn/song';
import { makePractice, targetNote, judge, type PracticeState } from '../learn/practice';
import { keyLayout, keyGeomFor, type KeyGeom } from '../learn/geometry';

const LOOKAHEAD = 4;   // beats visibles por encima de la línea de impacto

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function mountLearnView(root: HTMLElement): void {
  let song: LearnSong = SONGS[0];
  let mode: 'practice' | 'listen' = 'practice';
  let running = false;
  let songBeat = 0;
  let practice: PracticeState = makePractice(song.notes);
  let lastTs = 0;
  let layout: KeyGeom[] = [];
  let range = songRange(song);
  let midiReady = false;

  root.innerHTML = `
    <div class="lnWrap">
      <div class="lnBar">
        <label class="fld">Modo <select id="lnMode"><option value="practice">Practicar</option><option value="listen">Escuchar</option></select></label>
        <label class="fld">Canción <select id="lnSong">${SONGS.map((s, i) => `<option value="${i}">${s.name}</option>`).join('')}</select></label>
        <button id="lnStart">▶ Empezar</button>
        <button id="lnReset">↻ Reiniciar</button>
        <span class="lnConn" id="lnConn">MIDI: —</span>
      </div>
      <div class="lnStage">
        <canvas id="lnLane" class="lnLane"></canvas>
        <div id="lnKb" class="lnKb"></div>
      </div>
    </div>`;

  const canvas = root.querySelector('#lnLane') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const kbHost = root.querySelector('#lnKb') as HTMLElement;
  const connEl = root.querySelector('#lnConn') as HTMLElement;

  let kbCleanup: (() => void) | null = null;
  function buildKeyboard(): void {
    kbCleanup?.();
    kbCleanup = mountKeyboard(kbHost, {
      lowMidi: range.low, highMidi: range.high, baseMidi: range.low,
      onNoteOn: (m, v) => handlePlay(m, v),
      onNoteOff: (m) => handleRelease(m),
    });
  }
  function litKey(m: number, on: boolean): void {
    (kbHost.querySelector(`[data-midi="${m}"]`) as HTMLElement | null)?.classList.toggle('on', on);
  }
  function targetKey(m: number | undefined): void {
    kbHost.querySelectorAll('.kb-key.target').forEach(el => el.classList.remove('target'));
    if (m != null) (kbHost.querySelector(`[data-midi="${m}"]`) as HTMLElement | null)?.classList.add('target');
  }

  function handlePlay(m: number, v: number): void {
    noteOn(m, v); litKey(m, true);
    if (mode === 'practice' && running) {
      const r = judge(practice, m);
      if (r.advanced) { targetKey(targetNote(practice)?.midi); if (r.done) running = false; }
    }
  }
  function handleRelease(m: number): void { noteOff(m); litKey(m, false); }

  function resize(): void {
    const w = kbHost.clientWidth || canvas.clientWidth || 720;
    canvas.width = w;
    canvas.height = canvas.clientHeight || 240;
    layout = keyLayout(range.low, range.high, w);
  }

  function draw(): void {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, W, H);
    const impactY = H - 3;
    const pxPerBeat = H / LOOKAHEAD;
    ctx.strokeStyle = '#2dff6a'; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(0, impactY); ctx.lineTo(W, impactY); ctx.stroke();
    ctx.globalAlpha = 1;
    const tgt = mode === 'practice' ? targetNote(practice) : undefined;
    for (const n of song.notes) {
      const g = keyGeomFor(layout, n.midi); if (!g) continue;
      const bottom = impactY - (n.startBeat - songBeat) * pxPerBeat;
      const h = Math.max(8, n.dur * pxPerBeat);
      const top = bottom - h;
      if (bottom < 0 || top > H) continue;
      const isTarget = tgt === n;
      ctx.fillStyle = isTarget ? '#2dff6a' : (g.black ? '#3a6ea5' : '#4f86c6');
      roundRect(ctx, g.x + 1, top, Math.max(2, g.w - 2), h, 4); ctx.fill();
      ctx.fillStyle = isTarget ? '#04120a' : '#e7ecff';
      ctx.font = '11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(noteName(n.midi).replace(/-?\d+$/, ''), g.x + g.w / 2, bottom - 5);
    }
  }

  function frame(ts: number): void {
    const dt = lastTs ? (ts - lastTs) / 1000 : 0; lastTs = ts;
    if (running) {
      const bps = song.bpm / 60;
      if (mode === 'practice') {
        const t = targetNote(practice);
        if (!t) running = false;
        else if (songBeat < t.startBeat) {
          songBeat = Math.min(t.startBeat, songBeat + dt * bps);
          if (songBeat >= t.startBeat) targetKey(t.midi);
        }
      } else {
        const prev = songBeat;
        songBeat += dt * bps;
        const actx = getAudioContext();
        for (const n of song.notes) {
          if (n.startBeat > prev && n.startBeat <= songBeat) {
            triggerPreset('piano', n.midi, 0.85, actx ? actx.currentTime : 0, n.dur / bps, masterDest());
            litKey(n.midi, true);
            window.setTimeout(() => litKey(n.midi, false), (n.dur / bps) * 1000);
          }
        }
        const end = song.notes.reduce((mx, n) => Math.max(mx, n.startBeat + n.dur), 0);
        if (songBeat > end + 0.5) running = false;
      }
    }
    draw();
    requestAnimationFrame(frame);
  }

  function reset(): void {
    allNotesOff();
    kbHost.querySelectorAll('.kb-key.on').forEach(el => el.classList.remove('on'));
    songBeat = 0; practice = makePractice(song.notes); running = false;
    targetKey(undefined); draw();
  }
  function start(): void {
    ensureAudio(); setPreset('piano'); setSynthOut(masterDest());
    if (!midiReady) {
      midiReady = true;
      connectMidi({
        onNoteOn: (m, v) => { if (root.hidden) return; handlePlay(m, v); },
        onNoteOff: (m) => handleRelease(m),
        onState: (names) => { connEl.textContent = 'MIDI: ' + (names.length ? names.join(', ') : '—'); },
      }).catch(() => { connEl.textContent = 'MIDI: no disponible'; });
    }
    reset(); running = true; lastTs = 0;
    if (mode === 'practice') targetKey(targetNote(practice)?.midi);
  }

  (root.querySelector('#lnMode') as HTMLSelectElement).addEventListener('change', e => {
    mode = (e.target as HTMLSelectElement).value === 'listen' ? 'listen' : 'practice'; reset();
  });
  (root.querySelector('#lnSong') as HTMLSelectElement).addEventListener('change', e => {
    song = SONGS[+(e.target as HTMLSelectElement).value] ?? SONGS[0];
    range = songRange(song); buildKeyboard(); resize(); reset();
  });
  (root.querySelector('#lnStart') as HTMLButtonElement).addEventListener('click', start);
  (root.querySelector('#lnReset') as HTMLButtonElement).addEventListener('click', reset);
  window.addEventListener('resize', () => { resize(); draw(); });

  buildKeyboard(); resize(); draw();
  requestAnimationFrame(frame);
}
```

- [ ] **Step 2: Typecheck + build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: sin errores; build OK. (Aún no se ve hasta cablearlo en el shell, Task 6.)

- [ ] **Step 3: Commit**

```bash
cd /c/Pianova && git add studio/src/app/learnView.ts && git commit -m "Aprender F4a: vista (notas que caen + teclado + Practicar/Escuchar + MIDI)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Cablear en el shell + CSS + docs + versión 0.44.0

**Files:**
- Modify: `studio/src/app/shell.ts`
- Modify: `studio/src/ui/styles.css`
- Modify: `CLAUDE.md`, `HANDOFF.md`, `studio/package.json`

- [ ] **Step 1: Monta la vista en `studio/src/app/shell.ts`**

Añade el import y sustituye el placeholder de `#viewLearn` por la vista real. Import (junto a `mountStudioView`):

```ts
import { mountLearnView } from './learnView';
```

Cambia el contenido de la sección Learn a un contenedor vacío y móntala tras `mountStudioView(studio)`:

```ts
      <section id="viewLearn" class="view" hidden></section>`;
  const studio = root.querySelector('#viewStudio') as HTMLElement;
  const learn = root.querySelector('#viewLearn') as HTMLElement;
  mountStudioView(studio);
  mountLearnView(learn);
```

- [ ] **Step 2: CSS de la vista Aprender en `studio/src/ui/styles.css`**

La vista Aprender NO está dentro de `.pvView`, así que usa las variables globales del `:root` (`--bg`, `--panel`, `--line`, `--ink`, `--muted`, `--amber`). Añade al final del archivo:

```css
/* --- Vista Aprender (F4a) --- */
.lnWrap{padding:12px 18px;color:var(--ink)}
.lnBar{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:10px}
.lnConn{margin-left:auto;font-size:12px;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:4px 8px}
.lnStage{max-width:720px}
.lnLane{display:block;width:100%;height:260px;background:#0b0d12;border:1px solid var(--line);border-radius:8px 8px 0 0}
.lnKb{width:100%}
.lnKb .kb{max-width:none;margin:0}
.kb-key.target{background:#2dff6a !important;box-shadow:0 0 12px rgba(45,255,106,.7)}
.kb-black.target{background:#2dff6a !important}
```

(`.lnKb .kb{max-width:none}` hace que el teclado ocupe todo el ancho del escenario para que coincida con el lienzo; `.target` resalta en verde la tecla a tocar, por encima del `.on` ámbar.)

- [ ] **Step 3: Verifica en el navegador**

Run: `cd studio && npm run dev`
Comprueba en la pestaña **Aprender**: elige "Escala de Do" + Practicar + ▶ Empezar; las notas caen y se congelan en la línea; al tocar la tecla correcta (ratón/teclas A-S-D-F… / MIDI) suena a piano y avanza; una nota equivocada suena pero no avanza. Cambia a **Escuchar**: la canción suena sola encendiendo las teclas. Prueba las 3 canciones y Reiniciar. Vuelve al **Estudio** y confirma que su teclado/pads/MIDI siguen funcionando (convivencia MIDI).

- [ ] **Step 4: Versión + docs**

En `studio/package.json`, cambia `"version": "0.43.0"` a `"version": "0.44.0"`.

En `CLAUDE.md`, al final de la cadena de hitos "Rediseño PIANOVA STUDIO", añade con el separador ` · `:

```
· **F4a — módulo Aprender, núcleo Practicar (v0.44.0): la pestaña Aprender ya funciona — notas que caen (Synthesia) con nombres de nota (Do/Re/Mi), modo Practicar (se congela hasta que tocas la nota correcta por MIDI/teclas/ratón) y Escuchar (la reproduce sola), 3 canciones a mano** (`learn/song.ts` + `learn/practice.ts` + `learn/geometry.ts` + `app/learnView.ts`; MIDI multi-suscriptor para convivir con el Estudio). Primer sub-proyecto de F4; pendiente F4b (importar .mid), F4c (Acompañar/manos), F4d (secciones/progreso), F4e (Reto)
```

En `HANDOFF.md`, añade una entrada v0.44.0 al inicio del changelog del Estudio, estilo consistente (qué hace + archivos + "primer sub-proyecto de F4").

- [ ] **Step 5: Verificación final + commit**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: todo verde.

```bash
cd /c/Pianova && git add studio/src/app/shell.ts studio/src/ui/styles.css studio/package.json CLAUDE.md HANDOFF.md && git commit -m "Aprender F4a: cablear en el shell + CSS + docs + version 0.44.0

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notas de integración

- **Convivencia MIDI:** `connectMidi` pasa a multi-suscriptor; Estudio y Aprender se suscriben y cada uno filtra sus note-on por pestaña activa (`root.hidden`). Los note-off se procesan siempre (evita notas colgadas al cambiar de pestaña).
- **Sonido:** la vista Aprender usa el synth compartido con el preset "piano" hacia el maestro; lo fija al Empezar (`setPreset('piano')` + `setSynthOut(masterDest())`).
- **Alineación notas ↔ teclas:** `learn/geometry.ts` replica el reparto del teclado DOM (blancas iguales, negras con desfase 0.3 y ancho 0.6), y el CSS pone el teclado a todo el ancho del escenario (mismo ancho que el lienzo).
- **Sin persistencia:** F4a no guarda nada; el progreso por canción llega en F4d.
