# Resolución (rejilla) por canal — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada canal tenga su propia resolución de rejilla (1/8, 1/16, 1/32), sonando cada uno a su subdivisión sobre un reloj base fino.

**Architecture:** Un reloj base a 1/32 (`BASE_SUBDIV=8`) común; cada canal tiene `subdiv` (2/4/8) y se dispara en los ticks base que le tocan (`channelStepAt`). El motor (`onStep`, `getTotalSteps`), el cabezal, la grabación y las marcas de compás de las rejillas pasan a la subdivisión del canal; un selector "Rejilla" por canal en la UI.

**Tech Stack:** Vite + TypeScript (strict) + Vitest. Web Audio (secuenciador por adelanto). DOM.

## Global Constraints

- Todo el trabajo en `studio/` (NO tocar `pianova.html`). TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón `var(--pv-acc)`.
- Resoluciones **1/8, 1/16, 1/32** (subdiv 2/4/8); reloj base `BASE_SUBDIV = 8`. Por defecto **4** (1/16).
- Compat sin migración: canal sin `subdiv` ⇒ 4; proyectos v0.29 suenan idénticos.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build` (desde `studio/`).
- Commits con trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Helpers puros `daw/grid.ts` + `ChannelState.subdiv` (+ tests)

**Files:**
- Create: `studio/src/daw/grid.ts`
- Create: `studio/src/daw/grid.test.ts`
- Modify: `studio/src/daw/model.ts` (`ChannelState.subdiv` + `defaultChannel`)

**Interfaces:**
- Produces:
  - `BASE_SUBDIV = 8`; `SUBDIVS = [2,4,8]`; `SUBDIV_LABELS: Record<number,string>`.
  - `baseFactor(subdiv: number): number` — `BASE_SUBDIV / subdivValido` (no soportado ⇒ trata como 4).
  - `channelStepAt(t: number, subdiv: number, len: number): number | null`.
  - `channelSpan(len: number, subdiv: number): number` — `len * baseFactor(subdiv)`.
  - `ChannelState.subdiv?: number` (2|4|8; ausente ⇒ 4); `defaultChannel` lo pone a 4.

- [ ] **Step 1: Escribe el test que falla (`studio/src/daw/grid.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { baseFactor, channelStepAt, channelSpan, BASE_SUBDIV } from './grid';

describe('baseFactor', () => {
  it('BASE_SUBDIV / subdiv para 2/4/8', () => {
    expect(BASE_SUBDIV).toBe(8);
    expect(baseFactor(2)).toBe(4);   // 1/8
    expect(baseFactor(4)).toBe(2);   // 1/16
    expect(baseFactor(8)).toBe(1);   // 1/32
  });
  it('subdiv no soportado se trata como 4', () => {
    expect(baseFactor(5)).toBe(2);
    expect(baseFactor(0)).toBe(2);
  });
});

describe('channelStepAt', () => {
  it('subdiv 4 (factor 2): ticks pares mapean a t/2, impares null; envuelve por len', () => {
    expect(channelStepAt(0, 4, 16)).toBe(0);
    expect(channelStepAt(2, 4, 16)).toBe(1);
    expect(channelStepAt(1, 4, 16)).toBe(null);
    expect(channelStepAt(3, 4, 16)).toBe(null);
    expect(channelStepAt(32, 4, 16)).toBe(0);     // 32/2=16, 16%16=0 (envuelve)
  });
  it('subdiv 8 (factor 1): cada tick mapea a t%len', () => {
    expect(channelStepAt(0, 8, 16)).toBe(0);
    expect(channelStepAt(1, 8, 16)).toBe(1);
    expect(channelStepAt(17, 8, 16)).toBe(1);
  });
  it('subdiv 2 (factor 4): solo múltiplos de 4', () => {
    expect(channelStepAt(4, 2, 8)).toBe(1);
    expect(channelStepAt(2, 2, 8)).toBe(null);
  });
});

describe('channelSpan', () => {
  it('len × baseFactor(subdiv)', () => {
    expect(channelSpan(16, 4)).toBe(32);
    expect(channelSpan(16, 8)).toBe(16);
    expect(channelSpan(16, 2)).toBe(64);
  });
});
```

- [ ] **Step 2: Ejecuta el test para verlo fallar**

Run: `cd studio && npm test -- grid`
Expected: FAIL (`grid` no existe).

- [ ] **Step 3: Crea `studio/src/daw/grid.ts`**

```ts
// studio/src/daw/grid.ts
// Rejilla por canal. Un reloj base fino (BASE_SUBDIV = 1/32) y cada canal a su subdivisión (2=1/8, 4=1/16,
// 8=1/32). baseFactor = cuántos ticks base dura un paso del canal; channelStepAt = qué paso del canal cae en
// un tick base (o null); channelSpan = ticks base que ocupa el canal por vuelta. Puro y testeable.
export const BASE_SUBDIV = 8;                 // pasos por negra del reloj base (1/32)
export const SUBDIVS = [2, 4, 8] as const;    // 1/8, 1/16, 1/32
export const SUBDIV_LABELS: Record<number, string> = { 2: '1/8', 4: '1/16', 8: '1/32' };

// Subdivisión válida (2/4/8); cualquier otra cosa se trata como 4 (1/16).
function safeSub(subdiv: number): number {
  return subdiv === 2 || subdiv === 4 || subdiv === 8 ? subdiv : 4;
}

export function baseFactor(subdiv: number): number {
  return BASE_SUBDIV / safeSub(subdiv);
}

export function channelStepAt(t: number, subdiv: number, len: number): number | null {
  const factor = baseFactor(subdiv);
  if (t % factor !== 0) return null;
  const step = t / factor;
  return ((step % len) + len) % len;
}

export function channelSpan(len: number, subdiv: number): number {
  return len * baseFactor(subdiv);
}
```

- [ ] **Step 4: Ejecuta el test para verlo pasar**

Run: `cd studio && npm test -- grid`
Expected: PASS.

- [ ] **Step 5: Añade `subdiv` al modelo (`studio/src/daw/model.ts`)**

(a) En `ChannelState`, añade el campo (junto a `humanize`):

```ts
export interface ChannelState {
  id: string; name: string; instrument: InstrumentSpec;
  volume: number; pan: number; muted: boolean; soloed: boolean; rack: RackState; humanize?: number; subdiv?: number;
}
```

(b) En `defaultChannel`, inicialízalo a 4:

```ts
export function defaultChannel(preset = 'piano', id?: string): ChannelState {
  return {
    id: id ?? newChannelId(), name: 'Canal', instrument: { kind: 'synth', preset },
    volume: 0.8, pan: 0, muted: false, soloed: false, rack: { effects: [] }, humanize: 0, subdiv: 4
  };
}
```

- [ ] **Step 6: typecheck + test + build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add studio/src/daw/grid.ts studio/src/daw/grid.test.ts studio/src/daw/model.ts
git commit -m "Estudio rejilla: helpers puros daw/grid.ts + ChannelState.subdiv + tests"
```

---

### Task 2: Motor — reloj base + `onStep`/`getTotalSteps`/cabezal/grabación por canal

**Files:**
- Modify: `studio/src/app/studioView.ts`

**Interfaces:**
- Consumes: `BASE_SUBDIV`, `channelStepAt`, `channelSpan` (`daw/grid`); `ChannelState.subdiv`; `lcm2`,
  `swingOffset`, `effectiveLen`, `humanizeHit`, `findChannel`, `channelLen` (ya presentes).

Sin test unitario nuevo (Web Audio) — verificado por typecheck + build.

- [ ] **Step 1: Importa los helpers de `daw/grid`**

En `studio/src/app/studioView.ts`, añade el import (junto a los otros de `../daw/…`):

```ts
import { BASE_SUBDIV, channelStepAt, channelSpan } from '../daw/grid';
```

- [ ] **Step 2: Elimina la constante local `STEPS_PER_BEAT`**

Borra la línea `const STEPS_PER_BEAT = 4;` (queda `const SEQ_VEL = 0.95;`). Todos sus usos se reescriben abajo.

- [ ] **Step 3: El secuenciador corre al reloj base + `getTotalSteps` en ticks base**

Sustituye el bloque `stepsPerBeat` + `getTotalSteps` (hoy usa `STEPS_PER_BEAT`, `daw.steps` y LCM de longitudes)
por:

```ts
  const seq = makeSequencer(transport, {
    stepsPerBeat: BASE_SUBDIV,
    getTotalSteps: () => {
      const pIdx = (songMode && daw.song.length) ? playPattern : daw.current;
      const pat = daw.patterns[pIdx];
      if (!pat) return BASE_SUBDIV * 4;
      let m = 1;
      for (const c of daw.channels) {
        const L = pat.steps[c.id]?.length ?? 0;
        if (L > 0) m = lcm2(m, channelSpan(L, c.subdiv ?? 4));   // tramo del canal en ticks base
      }
      return m > 1 ? m : BASE_SUBDIV * 4;                         // fallback: un compás
    },
```

- [ ] **Step 4: `onStep` dispara cada canal a su subdivisión**

Sustituye el cuerpo del `for (const c of daw.channels)` de `onStep` (hoy usa `j = i % arr.length` y
`secPerStep` con `STEPS_PER_BEAT`) por:

```ts
      for (const c of daw.channels) {
        if (!audibles.has(c.id)) continue;
        const arr = pat.steps[c.id];
        if (!arr || !arr.length) continue;
        const sub = c.subdiv ?? 4;
        const k = channelStepAt(i, sub, arr.length);         // paso del canal en este tick base (o null)
        if (k === null) continue;
        const st = arr[k];
        if (!st || !st.on) continue;
        const audio = channels.find(a => a.id === c.id);
        const secPerStep = (60 / transport.bpm) / sub;        // duración de un paso de ESTE canal
        let vel = st.vel ?? SEQ_VEL;
        let at = when + swingOffset(k, daw.swing, secPerStep);
        const hz = c.humanize ?? 0;
        if (hz > 0) { const h = humanizeHit(hz, Math.random); at += h.dt; vel = Math.max(0.05, Math.min(1, vel + h.dvel)); }
        const gate = c.instrument.kind === 'drum' ? undefined : effectiveLen(arr, k) * secPerStep;
        if (audio) audio.trigger(st.note ?? 60, vel, at, gate);
        padHits.set(c.id, { t: at, vel });                    // destello del pad, sincronizado al sonido
        if (c.id === selectedId && c.instrument.kind === 'slicer') {
          const idx = sliceIndexForNote(c.instrument.base, c.instrument.slices.length, st.note ?? 60);
          const sl = c.instrument.slices[idx];
          if (sl) sliceHits.push({ index: idx, t: at, dur: sl.end - sl.start });
        }
      }
```

(El `if (i === 0)` de arranque/canción de arriba y el `renderPatternBar()` no cambian: `i === 0` sigue siendo el
inicio del bucle.)

- [ ] **Step 5: Grabación en vivo (`recordStep`) a la subdivisión del canal seleccionado**

Sustituye `recordStep`:

```ts
  function recordStep(m: number, v: number): void {
    const len = channelLen(daw, selectedId);
    const sub = findChannel(daw, selectedId)?.subdiv ?? 4;
    const step = ((Math.round(transport.beatNow() * sub) % len) + len) % len;
    daw = setStep(daw, selectedId, step, { on: true, note: m, vel: v });
    persist(); renderSelected();
  }
```

- [ ] **Step 6: Cabezal (`visualTick`) a la subdivisión del canal seleccionado**

En `visualTick`, sustituye el cálculo del paso del cabezal (hoy con `STEPS_PER_BEAT`) por:

```ts
      const len = channelLen(daw, selectedId);
      const sub = findChannel(daw, selectedId)?.subdiv ?? 4;
      const s = ((Math.floor(transport.beatNow() * sub) % len) + len) % len;
      selGrid?.setPlayhead(Math.floor(s / PAGE) === stepPage ? (s % PAGE) : -1);   // solo si suena esta página
```

- [ ] **Step 7: typecheck + test + build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: PASS (146 tests + los de grid siguen verdes; ya no queda ninguna referencia a `STEPS_PER_BEAT`).

- [ ] **Step 8: Commit**

```bash
git add studio/src/app/studioView.ts
git commit -m "Estudio rejilla: reloj base 1/32 + onStep/getTotalSteps/cabezal/grabación por subdivisión de canal"
```

---

### Task 3: Vista del canal — marcas de compás por subdivisión + selector Rejilla

**Files:**
- Modify: `studio/src/ui/pianoRoll.ts` (parámetro `beatEvery`)
- Modify: `studio/src/ui/stepgrid.ts` (parámetro `beatEvery`)
- Modify: `studio/src/app/studioView.ts` (pasa `beatEvery` a las rejillas + selector Rejilla en `pvLenBar`)

**Interfaces:**
- Consumes: `SUBDIVS`, `SUBDIV_LABELS` (`daw/grid`); `updateChannel`, `findChannel` (modelo).

Sin test unitario nuevo (DOM) — verificado por typecheck + build + prueba manual.

- [ ] **Step 1: `beatEvery` en el piano-roll (`studio/src/ui/pianoRoll.ts`)**

(a) En las opciones de `mountPianoRoll`, añade `beatEvery?: number`:

```ts
    total: number; lowMidi: number; scaleRoot: number; scaleType: string; beatEvery?: number;
```

(b) En `rowCells`, sustituye la marca de negra `i % 4 === 0` por la subdivisión (por defecto 4):

```ts
      cells += `<div class="prCell${i % (opts.beatEvery ?? 4) === 0 ? ' beat' : ''}${cls}" data-i="${i}" data-m="${midi}"${hAttr}></div>`;
```

- [ ] **Step 2: `beatEvery` en la rejilla de batería (`studio/src/ui/stepgrid.ts`)**

(a) En las opciones de `mountStepGrid`, añade `beatEvery?: number`:

```ts
  opts: { total: number; beatEvery?: number; isOn: (i: number) => boolean; onToggle: (i: number) => void }
```

(b) En el render, sustituye `i % 4 === 0` por:

```ts
    c.className = 'stepCell' + (i % (opts.beatEvery ?? 4) === 0 ? ' beat' : '') + (opts.isOn(i) ? ' on' : '');
```

- [ ] **Step 3: `studioView.ts` — importa `SUBDIVS`/`SUBDIV_LABELS` y pasa `beatEvery`**

(a) Amplía el import de `../daw/grid`:

```ts
import { BASE_SUBDIV, channelStepAt, channelSpan, SUBDIVS, SUBDIV_LABELS } from '../daw/grid';
```

(b) En `renderSelected`, en la llamada a `mountPianoRoll` añade `beatEvery` (la subdivisión del canal). Donde
hoy monta el piano-roll con `total: PAGE, lowMidi: prLow, ...`, deja:

```ts
      const pr = mountPianoRoll(stepsHost, {
        total: PAGE, lowMidi: prLow, scaleRoot: daw.scaleRoot, scaleType: daw.scaleType, beatEvery: ch?.subdiv ?? 4,
        getStep: (i) => channelSteps(daw, selectedId)[off + i],
        onPaint: (start, len, midi) => { daw = paintNote(daw, selectedId, off + start, len, midi); persist(); },
        onClear: (headIndex) => { daw = setStep(daw, selectedId, off + headIndex, { on: false }); persist(); },
        onRange: (lo) => { prLow = lo; }
      });
```

(c) En la rama de batería (`mountStepGrid`), añade `beatEvery`:

```ts
      const g = mountStepGrid(stepsHost, {
        total: PAGE, beatEvery: ch?.subdiv ?? 4,
        isOn: (i) => channelSteps(daw, selectedId)[off + i]?.on ?? false,
        onToggle: (i) => { daw = toggleStep(daw, selectedId, off + i); persist(); }
      });
```

- [ ] **Step 4: Selector Rejilla en la barra de longitud (`studioView.ts`, `renderSelected`)**

Donde se compone `lenHost.innerHTML` (hoy Longitud + páginas), añade el selector Rejilla al final del HTML y su
manejador. Sustituye el bloque de `lenHost.innerHTML = …` y sus listeners por:

```ts
    const sub = ch?.subdiv ?? 4;
    const subOpts = SUBDIVS.map(s => `<option value="${s}"${s === sub ? ' selected' : ''}>${SUBDIV_LABELS[s]}</option>`).join('');
    lenHost.innerHTML = `<span>Longitud</span>`
      + `<button class="pvLenBtn" data-lenminus title="Quitar 16 pasos">−16</button>`
      + `<span class="pvLenN">${len} pasos</span>`
      + `<button class="pvLenBtn" data-lenplus title="Añadir 16 pasos">＋16</button>${pageTabs}`
      + `<span class="pvLenSep"></span><span>Rejilla</span><select id="pvSubdiv" title="Resolución de este canal">${subOpts}</select>`;
    (lenHost.querySelector('[data-lenplus]') as HTMLButtonElement).addEventListener('click', () => {
      daw = addStepsPage(daw, selectedId); persist(); renderSelected();
    });
    (lenHost.querySelector('[data-lenminus]') as HTMLButtonElement).addEventListener('click', () => {
      daw = removeStepsPage(daw, selectedId); persist(); renderSelected();
    });
    (lenHost.querySelector('#pvSubdiv') as HTMLSelectElement).addEventListener('change', e => {
      daw = updateChannel(daw, selectedId, { subdiv: +(e.target as HTMLSelectElement).value }); persist(); renderSelected();
    });
    lenHost.querySelectorAll<HTMLButtonElement>('.pvPage').forEach(b =>
      b.addEventListener('click', () => { stepPage = +(b.dataset.page ?? '0'); renderSelected(); }));
```

(Es el mismo bloque de antes con el `<span class="pvLenSep">` + `Rejilla` + `<select>` añadidos y su listener
`change`. Los listeners de `−16`/`＋16`/páginas se mantienen tal cual.)

- [ ] **Step 5: CSS mínimo del separador (opcional pero recomendado, `studio/src/ui/styles.css`)**

Si no existe ya, añade junto a los estilos de `.pvLenBar`/`.pvLen*` una regla para el separador:

```css
.pvLenSep{width:1px;height:16px;background:var(--pv-line);margin:0 4px}
```

(Si `.pvLenSep` ya existe, no lo dupliques.)

- [ ] **Step 6: typecheck + build + prueba manual**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS. En la URL (`npm run dev`): selecciona un canal, en PASOS aparece **Rejilla** (1/8·1/16·1/32);
ponlo a **1/32** y verás las marcas de compás cada 8 pasos; reproduce con otro canal a 1/16 → el de 1/32 corre
más fino. El cabezal va al ritmo del canal. Persiste al recargar.

- [ ] **Step 7: Commit**

```bash
git add studio/src/ui/pianoRoll.ts studio/src/ui/stepgrid.ts studio/src/app/studioView.ts studio/src/ui/styles.css
git commit -m "Estudio rejilla: marcas de compás por subdivisión + selector Rejilla por canal"
```

---

### Task 4: Docs y versión

**Files:**
- Modify: `studio/package.json` (version → `0.30.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.30.0"`.

- [ ] **Step 2: HANDOFF.md**

Añade en la zona de estado del Estudio (junto a las últimas entradas):

```markdown
**Estudio · resolución (rejilla) por canal (v0.30.0):** cada canal tiene su propia resolución (1/8, 1/16, 1/32)
sobre un reloj base a 1/32 (`BASE_SUBDIV=8`). `ChannelState.subdiv` (2/4/8; ausente ⇒ 4); helpers puros
`daw/grid.ts` (`baseFactor`/`channelStepAt`/`channelSpan`). El secuenciador corre al reloj base y cada canal se
dispara en los ticks que le tocan, con su swing/longitud de nota/cabezal; `getTotalSteps` = LCM de `channelSpan`.
Selector **Rejilla** junto a Longitud (zona PASOS); marcas de compás por subdivisión (`beatEvery` en `pianoRoll`
y `stepgrid`). Cambiar la rejilla re-temporiza las notas del canal (no se remapean). Compat v0.29 → `subdiv` 4
(idéntico).
```

- [ ] **Step 3: CLAUDE.md**

En la sección del Estudio (decisión 5), tras la entrada de humanizar, añade: **resolución (rejilla) por canal
(v0.30.0): cada canal a su subdivisión (1/8, 1/16, 1/32) sobre reloj base 1/32; selector Rejilla por canal**
(`daw/grid.ts` `baseFactor`/`channelStepAt`/`channelSpan` + `ChannelState.subdiv` + motor por canal en `onStep`
+ `beatEvery` en las rejillas; compat v0.29).

- [ ] **Step 4: Verifica y commitea**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio rejilla: docs (HANDOFF/CLAUDE) y versión 0.30.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- `BASE_SUBDIV`/`SUBDIVS`/`SUBDIV_LABELS`/`baseFactor`/`channelStepAt`/`channelSpan` + tests → Task 1 ✅
- `ChannelState.subdiv` + `defaultChannel` → Task 1 ✅
- Reloj base + `getTotalSteps` (LCM de `channelSpan`) + `onStep` por subdivisión (secPerStep/swing/gate del
  canal) → Task 2 ✅
- Cabezal + grabación en vivo a la subdivisión del canal seleccionado → Task 2 ✅
- Marcas de compás por subdivisión (`beatEvery` en `pianoRoll` y `stepgrid`) → Task 3 ✅
- Selector Rejilla en la zona de PASOS + persistencia (`updateChannel`) → Task 3 ✅
- Compat sin migración (canal sin `subdiv` ⇒ 4; reloj base no altera los tiempos de los canales por defecto) →
  cubierto por Task 1 (modelo) + Task 2 (fallbacks `?? 4`) ✅
- Docs/versión → Task 4 ✅

**Placeholders:** ninguno; el código va completo (helpers, motor, rejillas, selector).

**Consistencia de tipos:** `channelStepAt(t, subdiv, len) → number|null` (Task 1) se usa en `onStep` con
`if (k === null) continue` (Task 2). `channelSpan(len, subdiv)` (Task 1) en `getTotalSteps` (Task 2).
`BASE_SUBDIV` en el secuenciador (Task 2). `ChannelState.subdiv?` (Task 1) lo leen `onStep`/`recordStep`/cabezal
(`?? 4`, Task 2), las rejillas (`beatEvery: ch?.subdiv ?? 4`, Task 3) y el selector (`updateChannel({subdiv})`,
Task 3). `SUBDIVS`/`SUBDIV_LABELS` (Task 1) en el selector (Task 3). Nombres coherentes.

**Estado intermedio válido:** Task 1 (helpers + modelo) compila y testea solo; Task 2 usa los helpers (ya
existen) y elimina `STEPS_PER_BEAT` reescribiendo TODOS sus usos en el mismo archivo → compila; Task 3 añade
`beatEvery` (opcional, por defecto 4, no rompe a nadie) y el selector; Task 4 docs. Cada tarea deja el build
verde.

**Decisión consciente:** el reloj base pasa de 4 a 8, pero los canales por defecto (subdiv 4, factor 2) disparan
en los mismos tiempos → sin regresión audible. `beatEvery` por defecto 4 mantiene el comportamiento visual
previo hasta que se cambia la rejilla del canal.
