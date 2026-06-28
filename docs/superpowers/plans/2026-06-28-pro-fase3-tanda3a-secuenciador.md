# Fase 3 · Sub-tanda 3A — Transporte + secuenciador de pasos (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el Estudio tenga un **transporte** (play/stop/BPM) y un **secuenciador de pasos** de una fila que toca el preset de synth actual a tempo, en bucle, con cabezal visible.

**Architecture:** Un módulo `daw/sequencer.ts` con `dueSteps` (pura, testeable: qué pasos caen en una ventana de beats) y `makeSequencer` (bucle de adelanto sobre `makeTransport`, que agenda los pasos en el reloj de audio). El synth gana `triggerAt(midi, vel, when, dur)` (disparo agendado, sin tocar el modo en vivo). UI: barra de transporte y cuadrícula de pasos (módulos `ui/transport.ts`, `ui/stepgrid.ts`), cableadas en `studioView` junto a lo existente (teclado/instrumento/racks intactos).

**Tech Stack:** TypeScript strict, Vite, Vitest, Web Audio API. Proyecto en `studio/`.

## Global Constraints

- Todo el código nuevo va en **`studio/`**; **TypeScript strict**; **Vitest** para lo puro; **sin framework de UI**; textos/comentarios en **español**. **No tocar `pianova.html`**.
- Reusar: `makeTransport`/`Transport` (`audio/transport.ts`), `synth` (`audio/synth.ts`), `ensureAudio`/`getAudioContext` (`audio/context.ts`), `masterDest` (`audio/masterBus.ts`).
- El audio arranca tras gesto (`ensureAudio`). `exponentialRampToValueAtTime` nunca a 0 (mín. 0.0001).
- Planificación de **adelanto** ("tale of two clocks"): el secuenciador agenda en el reloj de audio (`transport.timeForBeat`), no en el de fotogramas. `LOOKAHEAD_SEC = 0.1`, tick ~25 ms.
- 3A **no persiste** el patrón ni el BPM (la persistencia llega en 3B/3D con el modelo de canales). El guardar/abrir proyecto existente (instrumento + racks) sigue igual.
- `triggerAt` es **de usar y tirar** (no toca el mapa `voices`), así no interfiere con el teclado en vivo.
- Verificación por tarea desde `d:\PianoVa\studio`: `npm run typecheck` + `npm test` + `npm run build`. Prueba manual por oído.

---

### Task 1: Secuenciador (`daw/sequencer.ts`)

**Files:**
- Create: `studio/src/daw/sequencer.ts`
- Test: `studio/src/daw/sequencer.test.ts`

**Interfaces:**
- Consumes: `Transport` de `../audio/transport`.
- Produces:
  - `dueSteps(fromBeat: number, toBeat: number, totalSteps: number, stepsPerBeat: number): { step: number; beat: number }[]` (pura).
  - `interface Sequencer { play(): void; stop(): void; isPlaying(): boolean; setBpm(bpm: number): void }`.
  - `makeSequencer(transport: Transport, opts: { stepsPerBeat: number; getTotalSteps: () => number; onStep: (step: number, when: number) => void }): Sequencer`.

- [ ] **Step 1: Escribe el test que falla**

```ts
// studio/src/daw/sequencer.test.ts
import { describe, it, expect } from 'vitest';
import { dueSteps } from './sequencer';

describe('dueSteps', () => {
  it('un compás de 16 a semicorcheas en [0,1) da los pasos 0..3', () => {
    expect(dueSteps(0, 1, 16, 4)).toEqual([
      { step: 0, beat: 0 }, { step: 1, beat: 0.25 }, { step: 2, beat: 0.5 }, { step: 3, beat: 0.75 }
    ]);
  });
  it('ventana medio-abierta: [0,0.25) solo incluye el paso 0', () => {
    expect(dueSteps(0, 0.25, 16, 4)).toEqual([{ step: 0, beat: 0 }]);
  });
  it('no incluye el límite superior: [0.25,0.5) solo el paso 1', () => {
    expect(dueSteps(0.25, 0.5, 16, 4)).toEqual([{ step: 1, beat: 0.25 }]);
  });
  it('envuelve el patrón: el beat 4.0 es el paso 0 (16 pasos)', () => {
    expect(dueSteps(3.9, 4.1, 16, 4)).toEqual([{ step: 0, beat: 4 }]);
  });
  it('ventana sin cruces devuelve vacío', () => {
    expect(dueSteps(0.1, 0.2, 16, 4)).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `npm test`
Expected: FAIL — `Failed to load url ./sequencer`.

- [ ] **Step 3: Implementa `sequencer.ts`**

```ts
// studio/src/daw/sequencer.ts
// Transporte + secuenciador de pasos: planificación de adelanto sobre el reloj de audio.
import { Transport } from '../audio/transport';

// Pasos cuyo beat cae en [fromBeat, toBeat). `stepsPerBeat` p. ej. 4 (semicorcheas); `totalSteps` = compás.
// El patrón se repite cada totalSteps pasos; `step` es el índice dentro del patrón (con envoltura).
export function dueSteps(fromBeat: number, toBeat: number, totalSteps: number, stepsPerBeat: number): { step: number; beat: number }[] {
  const out: { step: number; beat: number }[] = [];
  const stepBeat = 1 / stepsPerBeat;
  const firstG = Math.ceil(fromBeat / stepBeat - 1e-9);
  for (let g = firstG; g * stepBeat < toBeat - 1e-9; g++) {
    out.push({ step: ((g % totalSteps) + totalSteps) % totalSteps, beat: g * stepBeat });
  }
  return out;
}

export interface Sequencer {
  play(): void;
  stop(): void;
  isPlaying(): boolean;
  setBpm(bpm: number): void;
}

const LOOKAHEAD_SEC = 0.1;   // cuánto se agenda por delante (segundos)
const TICK_MS = 25;          // cada cuánto corre el planificador

export function makeSequencer(
  transport: Transport,
  opts: { stepsPerBeat: number; getTotalSteps: () => number; onStep: (step: number, when: number) => void }
): Sequencer {
  let timer: number | null = null;
  let lastBeat = 0;

  function tick(): void {
    const ahead = transport.beatNow() + LOOKAHEAD_SEC * (transport.bpm / 60);
    if (ahead <= lastBeat) return;
    for (const { step, beat } of dueSteps(lastBeat, ahead, opts.getTotalSteps(), opts.stepsPerBeat)) {
      opts.onStep(step, transport.timeForBeat(beat));
    }
    lastBeat = ahead;
  }

  return {
    play() {
      if (timer != null) return;
      transport.anchor(0, transport.bpm);
      lastBeat = 0;
      timer = globalThis.setInterval(tick, TICK_MS) as unknown as number;
      tick();
    },
    stop() { if (timer != null) { globalThis.clearInterval(timer); timer = null; } },
    isPlaying() { return timer != null; },
    setBpm(bpm) { transport.setBpm(bpm); }
  };
}
```

- [ ] **Step 4: Ejecuta el test y comprueba que pasa**

Run: `npm test`
Expected: PASS (5 tests nuevos + previos).

- [ ] **Step 5: Commit**

```bash
git add studio/src/daw/sequencer.ts studio/src/daw/sequencer.test.ts
git commit -m "Estudio F3: secuenciador (dueSteps pura + makeSequencer con adelanto) + test"
```

---

### Task 2: Disparo agendado del synth (`audio/synth.ts`)

**Files:**
- Modify: `studio/src/audio/synth.ts` (añadir `triggerAt`, sin tocar `noteOn`/`noteOff`).

**Interfaces:**
- Consumes: `ensureAudio`, `masterDest`, `SYNTH`, `currentPreset`, `synthOut` (ya en el módulo).
- Produces: `triggerAt(midi: number, vel: number, when: number, dur: number, dest?: AudioNode): void` — dispara una nota del preset actual agendada en el tiempo de audio `when`, con gate `dur`; fire-and-forget (no usa el mapa `voices`). Por defecto suena por `synthOut ?? masterDest()` (igual ruta que el teclado).

- [ ] **Step 1: Añade `triggerAt` al final de `synth.ts`** (después de `allNotesOff`)

```ts
// Dispara una nota agendada en el tiempo de audio `when` con gate `dur` (para el secuenciador).
// De usar y tirar: no toca el mapa `voices`, así no interfiere con el teclado en vivo.
export function triggerAt(midi: number, vel: number, when: number, dur: number, dest?: AudioNode): void {
  const actx = ensureAudio();
  const out = dest ?? synthOut ?? masterDest();
  const preset = SYNTH[currentPreset] ?? SYNTH.piano;
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
```

- [ ] **Step 2: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde (los tests existentes del synth/efectos siguen pasando). Run: `npm run build` → OK.

- [ ] **Step 3: Commit**

```bash
git add studio/src/audio/synth.ts
git commit -m "Estudio F3: synth.triggerAt (disparo agendado para el secuenciador)"
```

---

### Task 3: UI de transporte y cuadrícula de pasos (`ui/transport.ts`, `ui/stepgrid.ts` + CSS)

**Files:**
- Create: `studio/src/ui/transport.ts`, `studio/src/ui/stepgrid.ts`
- Modify: `studio/src/ui/styles.css` (añadir estilos al final).

**Interfaces:**
- Produces:
  - `interface TransportUI { setPlaying(on: boolean): void }`; `mountTransport(root: HTMLElement, opts: { getBpm: () => number; onPlay: () => void; onStop: () => void; onBpm: (bpm: number) => void }): TransportUI`.
  - `interface StepGridUI { render(): void; setPlayhead(step: number): void }`; `mountStepGrid(root: HTMLElement, opts: { total: number; isOn: (i: number) => boolean; onToggle: (i: number) => void }): StepGridUI`.

- [ ] **Step 1: Implementa `ui/transport.ts`**

```ts
// studio/src/ui/transport.ts
// Barra de transporte: botón Play/Stop y BPM editable.
export interface TransportUI { setPlaying(on: boolean): void }

export function mountTransport(
  root: HTMLElement,
  opts: { getBpm: () => number; onPlay: () => void; onStop: () => void; onBpm: (bpm: number) => void }
): TransportUI {
  root.innerHTML = `<div class="tbar">
    <button id="tbPlay" class="tbPlay" title="Reproducir / Parar">▶</button>
    <label class="fld">BPM <input id="tbBpm" type="number" min="40" max="240" step="1" value="${opts.getBpm()}"></label>
  </div>`;
  const btn = root.querySelector('#tbPlay') as HTMLButtonElement;
  let playing = false;
  const setPlaying = (on: boolean) => { playing = on; btn.textContent = on ? '⏹' : '▶'; btn.classList.toggle('on', on); };
  btn.addEventListener('click', () => { if (playing) opts.onStop(); else opts.onPlay(); });
  (root.querySelector('#tbBpm') as HTMLInputElement).addEventListener('change', e => {
    const v = Math.max(40, Math.min(240, +(e.target as HTMLInputElement).value || 120));
    opts.onBpm(v);
  });
  return { setPlaying };
}
```

- [ ] **Step 2: Implementa `ui/stepgrid.ts`**

```ts
// studio/src/ui/stepgrid.ts
// Cuadrícula de pasos de una fila: celdas clicables (on/off) + resalte del paso en curso.
export interface StepGridUI { render(): void; setPlayhead(step: number): void }

export function mountStepGrid(
  root: HTMLElement,
  opts: { total: number; isOn: (i: number) => boolean; onToggle: (i: number) => void }
): StepGridUI {
  let cells: HTMLButtonElement[] = [];
  function render(): void {
    root.innerHTML = '<div class="stepRow"></div>';
    const row = root.querySelector('.stepRow') as HTMLElement;
    cells = [];
    for (let i = 0; i < opts.total; i++) {
      const c = document.createElement('button');
      c.className = 'stepCell' + (i % 4 === 0 ? ' beat' : '') + (opts.isOn(i) ? ' on' : '');
      c.addEventListener('click', () => { opts.onToggle(i); c.classList.toggle('on', opts.isOn(i)); });
      row.appendChild(c); cells.push(c);
    }
  }
  function setPlayhead(step: number): void {
    cells.forEach((c, i) => c.classList.toggle('play', i === step));
  }
  render();
  return { render, setPlayhead };
}
```

- [ ] **Step 3: Añade los estilos al final de `studio/src/ui/styles.css`**

```css
.tbar { display:flex; align-items:center; gap:14px; margin:18px 0 10px; }
.tbPlay { width:44px; height:44px; border-radius:50%; font-size:16px; background:var(--amber); color:#1a1306; border:0; }
.tbPlay.on { background:#e0533a; color:#fff; }
.tbar input[type="number"] { width:66px; font:inherit; background:var(--panel); color:var(--ink); border:1px solid var(--line); border-radius:8px; padding:6px 8px; }
.seqWrap { margin:8px 0 4px; }
.seqWrap h3 { font-size:13px; color:var(--muted); font-weight:600; margin:0 0 8px; }
.stepRow { display:flex; gap:6px; flex-wrap:wrap; }
.stepCell { width:30px; height:38px; border-radius:7px; background:var(--panel); border:1px solid var(--line); cursor:pointer; padding:0; }
.stepCell.beat { border-color:#3a4153; }
.stepCell.on { background:var(--amber); border-color:var(--amber); }
.stepCell.play { outline:2px solid #fff; outline-offset:1px; }
```

- [ ] **Step 4: Verifica typecheck + build**

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 5: Commit**

```bash
git add studio/src/ui/transport.ts studio/src/ui/stepgrid.ts studio/src/ui/styles.css
git commit -m "Estudio F3: UI de transporte (play/stop/BPM) y cuadricula de pasos"
```

---

### Task 4: Integrar transporte + secuenciador en el Estudio (`app/studioView.ts`)

**Files:**
- Modify: `studio/src/app/studioView.ts` (añadir el bloque del secuenciador; **no** quitar teclado/instrumento/racks).

**Interfaces:**
- Consumes: `makeTransport` (`../audio/transport`), `getAudioContext` (`../audio/context`), `makeSequencer` + `Sequencer` (`../daw/sequencer`), `mountTransport` (`../ui/transport`), `mountStepGrid` (`../ui/stepgrid`), `synth.triggerAt`.
- Produces: nada nuevo (sigue exportando `mountStudioView`).

- [ ] **Step 1: Añade los imports** al principio de `studio/src/app/studioView.ts` (junto a los existentes)

```ts
import { getAudioContext } from '../audio/context';
import { makeTransport } from '../audio/transport';
import { makeSequencer } from '../daw/sequencer';
import { mountTransport } from '../ui/transport';
import { mountStepGrid } from '../ui/stepgrid';
```

- [ ] **Step 2: Añade el bloque HTML del secuenciador** dentro del `root.innerHTML`, **entre** el `<p class="muted">…</p>` (el de las instrucciones del teclado) y `<div class="racks">`:

```html
    <div id="transport"></div>
    <section class="seqWrap">
      <h3>Secuenciador (toca el instrumento seleccionado)</h3>
      <div id="stepGrid"></div>
    </section>
```

- [ ] **Step 3: Añade la lógica del secuenciador** al final del cuerpo de `mountStudioView` (después del `mountKeyboard(...)`)

```ts
  // --- Secuenciador de pasos (3A) ---
  const STEPS = 16;
  const STEPS_PER_BEAT = 4;          // semicorcheas
  const SEQ_NOTE = 60;               // Do central (nota fija por ahora; pitch por paso llega después)
  const seqSteps: boolean[] = new Array(STEPS).fill(false);

  const transport = makeTransport(() => getAudioContext()?.currentTime ?? 0);
  const seq = makeSequencer(transport, {
    stepsPerBeat: STEPS_PER_BEAT,
    getTotalSteps: () => STEPS,
    onStep: (i, when) => { if (seqSteps[i]) synth.triggerAt(SEQ_NOTE, 0.95, when, 0.12); }
  });

  const grid = mountStepGrid(root.querySelector('#stepGrid') as HTMLElement, {
    total: STEPS,
    isOn: (i) => seqSteps[i],
    onToggle: (i) => { seqSteps[i] = !seqSteps[i]; }
  });

  let phRaf = 0;
  function playhead(): void {
    const s = Math.floor(transport.beatNow() * STEPS_PER_BEAT);
    grid.setPlayhead(((s % STEPS) + STEPS) % STEPS);
    phRaf = requestAnimationFrame(playhead);
  }

  const tUI = mountTransport(root.querySelector('#transport') as HTMLElement, {
    getBpm: () => transport.bpm,
    onPlay: () => { audioOn(); seq.play(); tUI.setPlaying(true); phRaf = requestAnimationFrame(playhead); },
    onStop: () => { seq.stop(); tUI.setPlaying(false); cancelAnimationFrame(phRaf); grid.setPlayhead(-1); },
    onBpm: (bpm) => seq.setBpm(bpm)
  });
```

- [ ] **Step 4: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK (el bundle crece).

- [ ] **Step 5: Prueba manual (navegador)**

Run: `npm run dev` y abre `http://localhost:5173`. En el Estudio: activa varias celdas de la cuadrícula, pulsa **▶** → debe oírse el preset actual repitiendo a tempo según los pasos encendidos, con el **cabezal** recorriendo las celdas; **⏹** para; cambiar **BPM** cambia la velocidad; cambiar el **instrumento** cambia el sonido del secuenciador. El teclado y los racks siguen funcionando.

- [ ] **Step 6: Commit**

```bash
git add studio/src/app/studioView.ts
git commit -m "Estudio F3: transporte + secuenciador de pasos cableados en el Estudio (3A)"
```

---

### Task 5: Versión y documentación

**Files:**
- Modify: `studio/package.json` (version), `HANDOFF.md`, `CLAUDE.md`.

- [ ] **Step 1: Sube la versión.** En `studio/package.json` cambia `"version": "0.8.0"` a `"version": "0.9.0"`.

- [ ] **Step 2: `HANDOFF.md`.** En el bloque del proyecto pro, añade la **Fase 3 · Sub-tanda 3A**: transporte + secuenciador. `daw/sequencer.ts` (`dueSteps` pura testeada + `makeSequencer` con adelanto `LOOKAHEAD_SEC=0.1`/tick 25ms sobre `makeTransport`); `synth.triggerAt(midi,vel,when,dur,dest?)` (disparo agendado de usar y tirar, no toca `voices`, ruta `synthOut ?? masterDest`); UI `ui/transport.ts` (play/stop/BPM) y `ui/stepgrid.ts` (16 pasos + cabezal); cableado en `studioView` (1 fila, nota fija Do4, toca el preset seleccionado) manteniendo teclado/instrumento/racks. **No persiste** el patrón aún (llega con el modelo de canales en 3B/3D). Próximo: **3B (varios canales + mezcla + rack por canal)**.

- [ ] **Step 3: `CLAUDE.md`.** En la decisión 5 / hoja de ruta, marca que **F3 está en curso**: sub-tanda 3A hecha (transporte + secuenciador de pasos); pendientes 3B canales+mezcla, 3C batería, 3D patrones+song, 3E swing+MIDI.

- [ ] **Step 4: Verifica** — Run: `npm run build` (OK). Confirma `version` 0.9.0 y las docs.

- [ ] **Step 5: Commit**

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio F3 sub-tanda 3A (transporte + secuenciador) v0.9.0: version y docs"
```

---

## Notas de ejecución
- Verificación = `npm run typecheck` / `npm test` / `npm run build` desde `d:\PianoVa\studio`. No commitear `node_modules`/`dist`.
- `dueSteps` es la parte testeable; `makeSequencer` (bucle con `setInterval`) y la UI se validan a mano por oído/vista.
- `triggerAt` NO debe tocar el mapa `voices` (para no interferir con el teclado en vivo); es fire-and-forget con auto-stop de osciladores.
- El transporte usa `getAudioContext()?.currentTime ?? 0` como reloj (antes del primer gesto vale 0; tras `audioOn` es el reloj de audio real).
- 3A es additivo: NO quitar el teclado, el selector de instrumento ni los racks; solo se añade el bloque del secuenciador.
- No tocar `pianova.html`. Textos/comentarios en español.
```
