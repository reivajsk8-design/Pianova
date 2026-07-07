# Aprender: distorsión + instrumentos + teclado pantalla completa — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quitar la distorsión del sonido de Aprender (bus de ganancia propio), añadir un selector de instrumento (synth) con dos sonidos nuevos, y poner el teclado a lo ancho abajo con la vista a pantalla completa.

**Architecture:** `audio/synth.ts` gana 2 presets (guitarra, flauta); `app/learnView.ts` enruta su sonido por un `GainNode` propio (~0.3) hacia el maestro y expone un selector de instrumento; `ui/styles.css` hace la vista full-height con el teclado a lo ancho abajo.

**Tech Stack:** TypeScript (strict), Vite, Vitest, Web Audio, CSS. Sin dependencias nuevas.

## Global Constraints

- Todo en `studio/`; **no tocar `pianova.html`**. TypeScript strict; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón del tema.
- Versión objetivo (package.json): **0.47.0**.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con el trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Ejecutar git desde `/c/Pianova` con rutas explícitas (drift de directorio en el shell).

## Mapa de archivos

- `studio/src/audio/synth.ts` — **Modifica.** Presets `guitarra` y `flauta`. (Task 1)
- `studio/src/audio/synth.test.ts` — **Crea.** (Task 1)
- `studio/src/app/learnView.ts` — **Modifica.** Bus de ganancia + selector de instrumento + resize al mostrarse. (Task 2)
- `studio/src/ui/styles.css` — **Modifica.** Vista full-height + teclado a lo ancho abajo. (Task 3)
- `CLAUDE.md`, `HANDOFF.md`, `studio/package.json` — **Modifica.** Docs + versión 0.47.0. (Task 4)

---

### Task 1: Presets Guitarra + Flauta (`audio/synth.ts`)

**Files:**
- Modify: `studio/src/audio/synth.ts`
- Test: `studio/src/audio/synth.test.ts`

**Interfaces:**
- Produces: `SYNTH.guitarra`, `SYNTH.flauta`; siguen valiendo `getPresetNames()`, `triggerPreset`, etc.

- [ ] **Step 1: Escribe el test (falla)**

Crea `studio/src/audio/synth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SYNTH, getPresetNames } from './synth';

describe('presets del synth', () => {
  it('incluye guitarra y flauta', () => {
    expect(SYNTH.guitarra).toBeDefined();
    expect(SYNTH.flauta).toBeDefined();
  });
  it('getPresetNames devuelve las claves nuevas', () => {
    const keys = getPresetNames().map(([k]) => k);
    expect(keys).toContain('guitarra');
    expect(keys).toContain('flauta');
  });
  it('todos los presets tienen partials no vacíos y peak de 2 elementos', () => {
    for (const k of Object.keys(SYNTH)) {
      expect(SYNTH[k].partials.length).toBeGreaterThan(0);
      expect(SYNTH[k].peak.length).toBe(2);
    }
  });
});
```

- [ ] **Step 2: Corre el test (falla)** — `cd studio && npx vitest run src/audio/synth.test.ts` → FAIL (`SYNTH.guitarra` undefined).

- [ ] **Step 3: Implementa en `studio/src/audio/synth.ts`**

Dentro del objeto `SYNTH`, añade estos dos presets tras `cuerda` (respeta el formato de los existentes; añade una coma tras el `cuerda` si hiciera falta para que sea JS válido):

```ts
  guitarra: { label: '🎸 Guitarra',
    partials: [{ type: 'triangle', ratio: 1, gain: 0.6 }, { type: 'sawtooth', ratio: 2, gain: 0.14 },
               { type: 'sawtooth', ratio: 3, gain: 0.07, detune: 4 }],
    filter: { start: 8, startMax: 6000, end: 2, endMin: 500, time: 0.8 },
    sustain: false, peak: [0.13, 0.16], attack: 0.004, decay: 1.6 },
  flauta: { label: '🪈 Flauta',
    partials: [{ type: 'sine', ratio: 1, gain: 0.5 }, { type: 'sine', ratio: 2, gain: 0.1 },
               { type: 'triangle', ratio: 3, gain: 0.04 }],
    filter: null, sustain: true, peak: [0.12, 0.08], attack: 0.05, release: 0.15, vibrato: { rate: 5, depth: 3 } }
```

(El preset `cuerda` termina hoy en `... vibrato: { rate: 5, depth: 4 } }` sin coma final porque es el último; al
añadir estos dos, ponle una coma después de su `}` de cierre y deja `flauta` como último sin coma.)

- [ ] **Step 4: Corre el test (pasa)** — `cd studio && npx vitest run src/audio/synth.test.ts` → PASS.
- [ ] **Step 5: Typecheck + suite + build + commit**

Run: `cd studio && npm run typecheck && npm test && npm run build`

```bash
cd /c/Pianova && git add studio/src/audio/synth.ts studio/src/audio/synth.test.ts && git commit -m "Synth: presets Guitarra y Flauta

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Bus de ganancia + selector de instrumento (`app/learnView.ts`)

**Files:**
- Modify: `studio/src/app/learnView.ts`

**Interfaces:**
- Consumes: `getPresetNames`, `setPreset`, `setSynthOut`, `noteOn`, `triggerPreset` de `../audio/synth`; `masterDest` de `../audio/masterBus`; `ensureAudio` de `../audio/context`.

UI/DOM sin tests unitarios; se verifica con typecheck + build + prueba manual.

- [ ] **Step 1: Import de `getPresetNames`**

En el import de `../audio/synth`, añade `getPresetNames`:

```ts
import { noteOn, noteOff, allNotesOff, setPreset, setSynthOut, triggerPreset, getPresetNames } from '../audio/synth';
```

- [ ] **Step 2: Estado (instrumento, bus, flag de visibilidad)**

Junto al resto de `let` de estado (tras `let midiReady = false;`), añade:

```ts
  let instrument = 'piano';
  let wasHidden = true;                 // para re-medir el lienzo al mostrarse la pestaña
  const LEARN_GAIN = 0.3;               // atenuación de Aprender antes del maestro (evita la distorsión)
  let learnBus: GainNode | null = null;
```

- [ ] **Step 3: Helpers del bus y del enrutado**

Junto a los helpers internos (por ejemplo, antes de `handlePlay`), añade:

```ts
  function ensureLearnBus(): GainNode {
    if (!learnBus) {
      const actx = ensureAudio();
      learnBus = actx.createGain();
      learnBus.gain.value = LEARN_GAIN;
      learnBus.connect(masterDest());
    }
    return learnBus;
  }
  // Enruta el synth por el bus de Aprender con el instrumento elegido (para tocar en vivo).
  function learnRoute(): void { setSynthOut(ensureLearnBus()); setPreset(instrument); }
```

- [ ] **Step 4: `handlePlay` enruta antes de sonar**

En `handlePlay`, añade `learnRoute();` como primera línea:

```ts
  function handlePlay(m: number, v: number): void {
    learnRoute();
    noteOn(m, v); litKey(m, true);
    if (mode === 'practice' && running) {
      const r = judge(practice, m);
      if (r.advanced) { targetKey(targetNote(practice)?.midi); if (r.done) running = false; }
    }
  }
```

- [ ] **Step 5: `frame` re-mide al hacerse visible**

En `frame`, marca `wasHidden` mientras está oculta y, al volver a verse, llama a `resize()` (el lienzo estaba
medido a 0 mientras la pestaña estaba oculta). Sustituye el arranque de `frame` por:

```ts
  function frame(ts: number): void {
    if (root.hidden) { lastTs = 0; wasHidden = true; requestAnimationFrame(frame); return; }
    if (wasHidden) { wasHidden = false; resize(); }
    const dt = lastTs ? (ts - lastTs) / 1000 : 0; lastTs = ts;
```

(El resto de `frame` no cambia.)

- [ ] **Step 6: Escuchar usa el instrumento y el bus**

En la rama Escuchar de `frame`, cambia el `triggerPreset` para usar `instrument` y `ensureLearnBus()`:

```ts
            triggerPreset(instrument, n.midi, 0.85, actx ? actx.currentTime : 0, n.dur / bps, ensureLearnBus());
```

- [ ] **Step 7: `start` enruta por el bus**

En `start`, sustituye `ensureAudio(); setPreset('piano'); setSynthOut(masterDest());` por:

```ts
  function start(): void {
    ensureAudio(); learnRoute();
```

(El resto de `start` no cambia.)

- [ ] **Step 8: Selector "Instrumento" en la barra**

En el `root.innerHTML`, dentro de `<div class="lnBar">`, añade el selector de Instrumento **tras** el de Canción:

```ts
        <label class="fld">Canción <select id="lnSong"></select></label>
        <label class="fld">Instrumento <select id="lnInst"></select></label>
```

- [ ] **Step 9: Referencia + poblado + handler del instrumento**

Junto a las demás referencias (tras `const levelSel = ...`), añade la referencia, el poblado y el handler:

```ts
  const instSel = root.querySelector('#lnInst') as HTMLSelectElement;
  instSel.innerHTML = getPresetNames().map(([k, label]) => `<option value="${k}">${label}</option>`).join('');
  instSel.value = instrument;
  instSel.addEventListener('change', () => { instrument = instSel.value; });
```

- [ ] **Step 10: Typecheck + build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: sin errores; build OK. (`npm test` sigue verde.)

- [ ] **Step 11: Prueba manual (dev)**

Run: `cd studio && npm run dev`
En Aprender: el piano ya no distorsiona al tocar/reproducir melodías; el selector **Instrumento** cambia el sonido
(Piano/Órgano/Guitarra/Flauta…); al entrar en la pestaña el lienzo ocupa el ancho completo (gracias al re-resize).

- [ ] **Step 12: Commit**

```bash
cd /c/Pianova && git add studio/src/app/learnView.ts && git commit -m "Aprender: bus de ganancia (arregla distorsion) + selector de instrumento

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Teclado a lo ancho abajo + vista full-height (`ui/styles.css`)

**Files:**
- Modify: `studio/src/ui/styles.css`

- [ ] **Step 1: Reemplaza el bloque de la vista Aprender**

Sustituye estas líneas del bloque `/* --- Vista Aprender (F4a) --- */` (`.lnWrap`, `.lnBar`, `.lnStage`,
`.lnLane`, `.lnKb .kb`) por la versión a pantalla completa, dejando `.lnMsg`, `.lnConn`, `.kb-key.target` y
`.kb-black.target` como están:

```css
.lnWrap{display:flex;flex-direction:column;gap:8px;padding:10px 14px;color:var(--ink);min-height:calc(100vh - 64px);box-sizing:border-box}
.lnBar{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.lnStage{flex:1;display:flex;flex-direction:column;min-height:0;width:100%}
.lnLane{flex:1;display:block;width:100%;min-height:140px;background:#0b0d12;border:1px solid var(--line);border-radius:8px 8px 0 0}
.lnKb{width:100%}
.lnKb .kb{max-width:none;margin:0;height:170px}
```

(Es decir: `.lnWrap` pasa a flex columna a altura de pantalla; `.lnBar` pierde el `margin-bottom` —el `gap` de
`.lnWrap` lo cubre—; `.lnStage` pierde `max-width:720px` y crece; `.lnLane` pierde el `height:260px` fijo y crece
con `flex:1`; el teclado a todo el ancho y 170px de alto.)

- [ ] **Step 2: Typecheck + build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: sin errores; build OK.

- [ ] **Step 3: Prueba manual (dev)**

Run: `cd studio && npm run dev`
En Aprender: la vista ocupa toda la altura; el teclado queda abajo a lo ancho de la pantalla y el carril de notas
llena el centro; las notas caen alineadas sobre su tecla.

- [ ] **Step 4: Commit**

```bash
cd /c/Pianova && git add studio/src/ui/styles.css && git commit -m "Aprender: teclado a lo ancho abajo + vista a pantalla completa

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Docs + versión 0.47.0

**Files:**
- Modify: `studio/package.json`, `CLAUDE.md`, `HANDOFF.md`

- [ ] **Step 1: Versión** — en `studio/package.json`, `"version": "0.46.0"` → `"version": "0.47.0"`.

- [ ] **Step 2: `CLAUDE.md`** — al final de la cadena de hitos "Rediseño PIANOVA STUDIO", añade con ` · `:

```
· **Aprender: sonido + instrumentos + teclado a pantalla completa (v0.47.0): el synth de Aprender pasa por un bus de ganancia propio (arregla la distorsión al tocar melodías); selector de Instrumento (Piano/Órgano/Cuerda/Campanas + Guitarra y Flauta nuevos); la vista ocupa toda la altura con el teclado a lo ancho abajo** (`audio/synth.ts` +2 presets + `app/learnView.ts` bus/selector + `ui/styles.css` layout)
```

- [ ] **Step 3: `HANDOFF.md`** — entrada v0.47.0 al inicio del changelog del Estudio (qué hace + archivos).

- [ ] **Step 4: Verificación final + commit**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: todo verde.

```bash
cd /c/Pianova && git add studio/package.json CLAUDE.md HANDOFF.md && git commit -m "Aprender: docs + version 0.47.0

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notas de integración

- **Distorsión:** el `learnBus` (`GainNode` a `LEARN_GAIN = 0.3`) atenúa antes del maestro, dando headroom; si aún
  suena fuerte, se baja esa constante.
- **Instrumento:** `learnRoute()` fija `synthOut = learnBus` y `preset = instrument` en cada nota en vivo; Escuchar
  pasa `instrument` y el bus a `triggerPreset`. El synth es compartido, pero el Estudio re-fija su ruta/preset en
  cada nota, así que no hay conflicto al volver.
- **Layout:** `wasHidden` fuerza un `resize()` la primera vez que la pestaña se muestra (estaba medida a 0 oculta),
  para que el lienzo ocupe el ancho completo. Notas y teclado comparten `range`/geometría → siguen alineados.
- **Presets nuevos:** aparecen también en el selector de sonido del Estudio (extra inofensivo).
