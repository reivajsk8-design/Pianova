# Piano-roll por canal + ayuda de escala — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poder editar la nota de cada paso con un mini piano-roll por canal (melódico), con una barra de escala que resalta las notas que encajan (informativa).

**Architecture:** Un helper puro de escalas (`daw/scales.ts`) + la escala activa en el estado (`scaleRoot`/`scaleType`, persistida) + un componente `ui/pianoRoll.ts` (rejilla notas×pasos) que `studioView` monta en la sección PASOS para canales melódicos (para batería se mantiene la fila on/off). Cada clic fija/mueve/borra la nota de un paso vía `setStep`. El motor de audio no cambia (ya dispara `st.note`).

**Tech Stack:** Vite + TypeScript (strict) + Vitest. DOM. Sin framework de UI.

## Global Constraints

- Todo el trabajo en `studio/` (NO tocar `pianova.html`). TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón `var(--pv-acc)`.
- No cambiar el motor de audio ni el disparo: esto es modelo (escala) + UI + cableado.
- Monofónico por paso (el modelo `Step` tiene una nota por paso). Escala **informativa** (no limita).
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build` (desde `studio/`).

---

### Task 1: Helper puro de escalas (`daw/scales.ts`)

**Files:**
- Create: `studio/src/daw/scales.ts`
- Create: `studio/src/daw/scales.test.ts`

**Interfaces:**
- Produces:
  - `SCALES: Record<string, number[]>` (clases de nota 0–11 por escala).
  - `SCALE_LABELS: Record<string, string>` (etiquetas en español).
  - `inScale(midi: number, root: number, type: string): boolean`.
  - `NOTE_NAMES: string[]` y `noteName(midi: number): string`.

- [ ] **Step 1: Write the failing test (`daw/scales.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { inScale, SCALES, SCALE_LABELS, noteName } from './scales';

describe('inScale', () => {
  it('Do mayor contiene Do, Re, Mi, Fa, Sol, La, Si y no los sostenidos', () => {
    // Do=60. Grados de Do mayor: 60,62,64,65,67,69,71
    for (const m of [60, 62, 64, 65, 67, 69, 71]) expect(inScale(m, 0, 'major')).toBe(true);
    for (const m of [61, 63, 66, 68, 70]) expect(inScale(m, 0, 'major')).toBe(false);
  });
  it('respeta la tónica (La menor = teclas blancas)', () => {
    // La=57 (root 9). La menor natural: 57,59,60,62,64,65,67 → todas blancas
    for (const m of [57, 59, 60, 62, 64, 65, 67]) expect(inScale(m, 9, 'minor')).toBe(true);
    expect(inScale(58, 9, 'minor')).toBe(false);   // La# fuera
  });
  it('maneja bien el módulo negativo (notas por debajo de la tónica)', () => {
    expect(inScale(48, 0, 'major')).toBe(true);    // Do3 en Do mayor
    expect(inScale(49, 0, 'major')).toBe(false);   // Do#3 fuera
  });
  it('tipo desconocido → cromática (todo dentro)', () => {
    for (let m = 60; m < 72; m++) expect(inScale(m, 0, 'desconocida')).toBe(true);
  });
});

describe('metadatos de escalas', () => {
  it('SCALES y SCALE_LABELS tienen las mismas claves', () => {
    expect(Object.keys(SCALES).sort()).toEqual(Object.keys(SCALE_LABELS).sort());
  });
  it('noteName da el nombre + octava correctos', () => {
    expect(noteName(60)).toBe('Do4');
    expect(noteName(48)).toBe('Do3');
    expect(noteName(61)).toBe('Do#4');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd studio && npm test -- scales`
Expected: FAIL (no existe `./scales`).

- [ ] **Step 3: Create the implementation (`daw/scales.ts`)**

```ts
// studio/src/daw/scales.ts
// Escalas musicales (puro, testeable): mapa tipo → clases de nota (0–11) + pertenencia a la escala.
// Portado de pianova.html (PR_SCALES / prInScale).

export const SCALES: Record<string, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentaMajor: [0, 2, 4, 7, 9],
  pentaMinor: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10]
};

export const SCALE_LABELS: Record<string, string> = {
  chromatic: 'Cromática',
  major: 'Mayor',
  minor: 'Menor',
  pentaMajor: 'Pentatónica mayor',
  pentaMinor: 'Pentatónica menor',
  dorian: 'Dórica'
};

// ¿Pertenece la nota MIDI a la escala (root+type)? Módulo negativo tratado con (((x%12)+12)%12).
export function inScale(midi: number, root: number, type: string): boolean {
  const s = SCALES[type] ?? SCALES.chromatic;
  return s.includes((((midi - root) % 12) + 12) % 12);
}

export const NOTE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
export function noteName(midi: number): string {
  return NOTE_NAMES[(((midi % 12) + 12) % 12)] + (Math.floor(midi / 12) - 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd studio && npm test -- scales`
Expected: PASS.

- [ ] **Step 5: Full check + commit**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS.

```bash
git add studio/src/daw/scales.ts studio/src/daw/scales.test.ts
git commit -m "Estudio piano-roll: helper puro de escalas (SCALES + inScale + noteName) + tests"
```

---

### Task 2: Escala activa en el estado + migración (`daw/model.ts` + `app/store.ts`)

**Files:**
- Modify: `studio/src/daw/model.ts`
- Modify: `studio/src/app/store.ts`
- Modify: `studio/src/daw/model.test.ts`

**Interfaces:**
- Produces: `DawState` gana `scaleRoot: number` y `scaleType: string`; `defaultDaw()` los inicializa a `0`/`'chromatic'`. Al cargar un proyecto v3/v2/v1 se rellenan con esos valores por defecto si faltan.

- [ ] **Step 1: Write the failing test (añadir a `daw/model.test.ts`)**

Añade dentro del `describe('modelo daw con patrones', …)` (o al final del archivo, en su propio `describe`):

```ts
  it('defaultDaw trae escala por defecto (Do cromática)', () => {
    const d = defaultDaw();
    expect(d.scaleRoot).toBe(0);
    expect(d.scaleType).toBe('chromatic');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd studio && npm test -- model`
Expected: FAIL (typecheck/aserción: `scaleRoot`/`scaleType` no existen).

- [ ] **Step 3: Añade los campos al modelo (`daw/model.ts`)**

(a) En la interfaz `DawState` (la línea `channels: …; swing: number;`), añade los dos campos:

```ts
export interface DawState {
  channels: ChannelState[]; patterns: PatternState[]; current: number; song: number[]; bpm: number; steps: number; swing: number;
  scaleRoot: number; scaleType: string;
}
```

(b) En `defaultDaw()`, añade los valores por defecto al objeto devuelto:

```ts
  return { channels: [ch], patterns: [emptyPattern([ch], DEFAULT_STEPS)], current: 0, song: [], bpm: 120, steps: DEFAULT_STEPS, swing: 0, scaleRoot: 0, scaleType: 'chromatic' };
```

- [ ] **Step 4: Rellena la escala al cargar proyecto (`app/store.ts`)**

Hay tres sitios que construyen un `DawState`. Añade `scaleRoot`/`scaleType` con defaults:

(a) En `dawV3(v)`, en el objeto devuelto (junto a `swing: …`):

```ts
    swing: typeof o.swing === 'number' ? o.swing : 0,
    scaleRoot: typeof o.scaleRoot === 'number' ? o.scaleRoot : 0,
    scaleType: typeof o.scaleType === 'string' ? o.scaleType : 'chromatic'
```

(b) En `dawV2toV3(v)`, en el `return { channels, patterns: …, swing: 0 }` añade al final:

```ts
  return { channels, patterns: [{ steps: stepsByCh }], current: 0, song: [], bpm: typeof o.bpm === 'number' ? o.bpm : 120, steps: total, swing: 0, scaleRoot: 0, scaleType: 'chromatic' };
```

(c) En `migrate(o)`, en la rama v1/desconocido (`return { version: 3, daw: { …, swing: 0 }, masterRack }`), añade a ese `daw`:

```ts
  return { version: 3, daw: { channels: [ch], patterns: [{ steps: { [ch.id]: emptySteps(16) } }], current: 0, song: [], bpm: 120, steps: 16, swing: 0, scaleRoot: 0, scaleType: 'chromatic' }, masterRack };
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd studio && npm run typecheck && npm test`
Expected: PASS (el typecheck obliga a que los tres literales tengan los campos; si alguno falta, lo señala).

- [ ] **Step 6: Commit**

```bash
git add studio/src/daw/model.ts studio/src/app/store.ts studio/src/daw/model.test.ts
git commit -m "Estudio piano-roll: escala activa (scaleRoot/scaleType) en el estado + migración"
```

---

### Task 3: Componente mini piano-roll (`ui/pianoRoll.ts` + CSS)

**Files:**
- Create: `studio/src/ui/pianoRoll.ts`
- Modify: `studio/src/ui/styles.css`

**Interfaces:**
- Consumes: `inScale`, `noteName` (`daw/scales`); `Step` (`daw/model`).
- Produces: `mountPianoRoll(root, opts): PianoRollUI` con
  `PianoRollUI = { setPlayhead(step: number): void }` y
  `opts = { total: number; lowMidi: number; scaleRoot: number; scaleType: string; getStep: (i: number) => Step | undefined; onSetNote: (i: number, midi: number | null) => void; onRange: (lowMidi: number) => void }`.

DOM; sin test unitario. Verificado por typecheck + build.

- [ ] **Step 1: Create `ui/pianoRoll.ts`**

```ts
// studio/src/ui/pianoRoll.ts
// Mini piano-roll por canal: filas = notas (~2 octavas), columnas = pasos. Monofónico por paso.
// Clic pone/mueve/borra la nota del paso; resalta las filas de la escala (informativo). Cabezal por columna.
import type { Step } from '../daw/model';
import { inScale, noteName } from '../daw/scales';

const ROWS = 24;                    // ~2 octavas visibles
const BLACK = new Set([1, 3, 6, 8, 10]);   // clases de nota negras

export interface PianoRollUI { setPlayhead(step: number): void }

export function mountPianoRoll(
  root: HTMLElement,
  opts: {
    total: number; lowMidi: number; scaleRoot: number; scaleType: string;
    getStep: (i: number) => Step | undefined;
    onSetNote: (i: number, midi: number | null) => void;
    onRange: (lowMidi: number) => void;
  }
): PianoRollUI {
  let low = Math.max(0, Math.min(127 - ROWS, opts.lowMidi));

  function draw(): void {
    let rows = '';
    for (let r = 0; r < ROWS; r++) {
      const midi = low + (ROWS - 1 - r);                 // agudo arriba, grave abajo
      const cls = (BLACK.has(((midi % 12) + 12) % 12) ? ' black' : '') +
                  (inScale(midi, opts.scaleRoot, opts.scaleType) ? ' inscale' : '');
      let cells = '';
      for (let i = 0; i < opts.total; i++) {
        const st = opts.getStep(i);
        const on = !!(st && st.on && (st.note ?? 60) === midi);
        cells += `<div class="prCell${i % 4 === 0 ? ' beat' : ''}${on ? ' on' : ''}" data-i="${i}" data-m="${midi}"></div>`;
      }
      rows += `<div class="prRow${cls}"><span class="prLabel">${noteName(midi)}</span><div class="prCells">${cells}</div></div>`;
    }
    root.innerHTML = `<div class="pr">
      <div class="prTools">
        <button class="chBtn" id="prUp" title="Subir una octava">▲</button>
        <button class="chBtn" id="prDown" title="Bajar una octava">▼</button>
        <span class="prHint muted">clic pone/mueve la nota del paso · clic en la nota puesta la borra</span>
      </div>
      <div class="prGrid">${rows}</div>
    </div>`;

    (root.querySelector('#prUp') as HTMLButtonElement).addEventListener('click', () => {
      low = Math.min(127 - ROWS, low + 12); opts.onRange(low); draw();
    });
    (root.querySelector('#prDown') as HTMLButtonElement).addEventListener('click', () => {
      low = Math.max(0, low - 12); opts.onRange(low); draw();
    });
    root.querySelectorAll<HTMLElement>('.prCell').forEach(c => {
      c.addEventListener('click', () => {
        const i = +(c.dataset.i ?? '0'), m = +(c.dataset.m ?? '60');
        opts.onSetNote(i, c.classList.contains('on') ? null : m);   // ya puesta → borrar; si no → poner
        draw();
      });
    });
  }
  draw();

  return {
    setPlayhead(step: number): void {
      root.querySelectorAll<HTMLElement>('.prCell.play').forEach(c => c.classList.remove('play'));
      if (step >= 0) root.querySelectorAll<HTMLElement>(`.prCell[data-i="${step}"]`).forEach(c => c.classList.add('play'));
    }
  };
}
```

- [ ] **Step 2: Add CSS (`ui/styles.css`)**

Añade al final de `studio/src/ui/styles.css`:

```css
/* ---------- Mini piano-roll por canal ---------- */
.pr{border:1px solid var(--pv-line);border-radius:8px;overflow:hidden;background:#0c110b}
.prTools{display:flex;align-items:center;gap:8px;padding:4px 6px;border-bottom:1px solid var(--pv-line)}
.prTools .chBtn{width:26px;height:22px;padding:0}
.prHint{font-size:10px}
.prGrid{display:flex;flex-direction:column}
.prRow{display:flex;align-items:stretch;height:16px}
.prRow.black{background:#0a0f09}
.prRow.inscale{background:rgba(45,255,106,.06)}
.prRow.black.inscale{background:rgba(45,255,106,.05)}
.prLabel{flex:0 0 44px;font-size:9px;color:var(--pv-muted);display:flex;align-items:center;padding-left:6px;border-right:1px solid var(--pv-line)}
.prCells{display:grid;flex:1;grid-auto-flow:column;grid-auto-columns:1fr}
.prCell{border-right:1px solid #141a12;border-bottom:1px solid #141a12;cursor:pointer}
.prCell.beat{border-left:1px solid #2b3324}
.prCell.on{background:var(--pv-acc);box-shadow:0 0 6px var(--pv-acc-dim) inset}
.prCell.play{background:rgba(255,255,255,.10)}
.prCell.on.play{background:var(--pv-acc);outline:1px solid #fff;outline-offset:-1px}
/* Barra de escala encima del piano-roll */
.pvScale{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:11px;color:var(--pv-muted)}
.pvScale select{background:#141a13;border:1px solid #2b3324;color:var(--pv-ink);border-radius:6px;padding:4px 8px;cursor:pointer}
.pvScale select:hover{border-color:var(--pv-acc)}
```

- [ ] **Step 3: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS. (El componente aún no se usa; compila igual.)

- [ ] **Step 4: Commit**

```bash
git add studio/src/ui/pianoRoll.ts studio/src/ui/styles.css
git commit -m "Estudio piano-roll: componente mini piano-roll (notas×pasos, escala, octava, cabezal) + CSS"
```

---

### Task 4: Integrar en la vista + barra de escala (`app/studioView.ts`)

**Files:**
- Modify: `studio/src/app/studioView.ts`

**Interfaces:**
- Consumes: `mountPianoRoll` (Task 3); `SCALE_LABELS`, `NOTE_NAMES` (Task 1); `setStep`, `channelSteps` (ya usados).
- Produces: en PASOS, canal melódico → piano-roll + barra de escala; batería → fila on/off (como ahora). Editar una celda escribe con `setStep`. La octava visible se recuerda entre re-montajes.

Integración (DOM); sin test unitario. Verificado por typecheck + tests verdes + build + prueba a ojo/oído.

- [ ] **Step 1: Imports (`studioView.ts`)**

Añade bajo el import de `mountStepGrid` (`import { mountStepGrid } from '../ui/stepgrid';`):

```ts
import { mountPianoRoll } from '../ui/pianoRoll';
import { SCALE_LABELS, NOTE_NAMES } from '../daw/scales';
```

- [ ] **Step 2: Estado de la octava visible del piano-roll**

Junto a los otros `let` del principio de `mountStudioView` (p. ej. tras `let recording = false;`), añade:

```ts
  let prLow = 48;   // octava base visible del piano-roll (Do3), recordada entre re-montajes
```

- [ ] **Step 3: Contenedor de la barra de escala en el HTML**

En el `root.innerHTML`, en el panel de PADS, entre la etiqueta de pasos y el grid de pasos:

```ts
      <div class="pvLbl" id="stepsLbl">PASOS</div>
      <div id="pvScale" class="pvScale"></div>
      <div id="pvSteps" class="pvSteps"></div>
```

- [ ] **Step 4: Montar piano-roll o fila on/off según el tipo (`renderSelected`)**

En `renderSelected()`, sustituye el bloque que monta el step grid (desde `// pasos del canal seleccionado (un solo grid)` hasta `selGrid = { setPlayhead: g.setPlayhead };`) por esta versión:

```ts
    // PASOS: piano-roll para canales melódicos; fila on/off para batería.
    const stepsHost = root.querySelector('#pvSteps') as HTMLElement;
    const scaleHost = root.querySelector('#pvScale') as HTMLElement;
    const melodic = !!ch && ch.instrument.kind !== 'drum';
    if (melodic) {
      // barra de escala
      const tonicOpts = NOTE_NAMES.map((nm, i) => `<option value="${i}"${i === daw.scaleRoot ? ' selected' : ''}>${nm}</option>`).join('');
      const typeOpts = Object.keys(SCALE_LABELS).map(k => `<option value="${k}"${k === daw.scaleType ? ' selected' : ''}>${SCALE_LABELS[k]}</option>`).join('');
      scaleHost.innerHTML = `<span>Escala</span><select id="scTonic">${tonicOpts}</select><select id="scType">${typeOpts}</select>`;
      (scaleHost.querySelector('#scTonic') as HTMLSelectElement).addEventListener('change', e => {
        daw = { ...daw, scaleRoot: +(e.target as HTMLSelectElement).value }; persist(); renderSelected();
      });
      (scaleHost.querySelector('#scType') as HTMLSelectElement).addEventListener('change', e => {
        daw = { ...daw, scaleType: (e.target as HTMLSelectElement).value }; persist(); renderSelected();
      });
      const pr = mountPianoRoll(stepsHost, {
        total: daw.steps, lowMidi: prLow, scaleRoot: daw.scaleRoot, scaleType: daw.scaleType,
        getStep: (i) => channelSteps(daw, selectedId)[i],
        onSetNote: (i, midi) => {
          const cur = channelSteps(daw, selectedId)[i];
          daw = setStep(daw, selectedId, i, midi == null ? { on: false } : { on: true, note: midi, vel: cur?.vel });
          persist();
        },
        onRange: (lo) => { prLow = lo; }
      });
      selGrid = { setPlayhead: pr.setPlayhead };
    } else {
      scaleHost.innerHTML = '';
      const g = mountStepGrid(stepsHost, {
        total: daw.steps,
        isOn: (i) => channelSteps(daw, selectedId)[i]?.on ?? false,
        onToggle: (i) => { daw = toggleStep(daw, selectedId, i); persist(); }
      });
      selGrid = { setPlayhead: g.setPlayhead };
    }
```

(El resto de `renderSelected` —nombre, sonido, parámetros— no cambia.)

- [ ] **Step 5: Verify typecheck, tests and build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS.

- [ ] **Step 6: Manual smoke test (prueba por vista/oído)**

Run: `cd studio && npm run dev` y abre la URL. En un canal **Piano** (o sinte):
1. En PASOS aparece el **piano-roll** con nombres de nota y la barra **Escala [Tónica][Tipo]**.
2. **Clic** en una celda pone la nota de ese paso; clic en la nota puesta la **borra**; clic en otra fila de la misma columna la **mueve**.
3. **▲/▼** cambian de octava (y se recuerda al cambiar de canal y volver).
4. Cambiar **Tónica/Tipo** ilumina las filas de la escala (informativo; puedes poner cualquier nota).
5. Al **reproducir**, el **cabezal** recorre las columnas y suenan las notas puestas.
6. En un canal de **batería** sigue saliendo la **fila on/off** de siempre.
7. En un canal **Slicer**, cada paso puede disparar un **slice distinto** (la nota elige el slice).

- [ ] **Step 7: Commit**

```bash
git add studio/src/app/studioView.ts
git commit -m "Estudio piano-roll: PASOS con piano-roll + barra de escala para canales melódicos"
```

---

### Task 5: Docs y versión

**Files:**
- Modify: `studio/package.json` (subir `version` a `0.21.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.21.0"`.

- [ ] **Step 2: Update HANDOFF.md**

Añade en la zona de estado del Estudio:

```markdown
**Estudio · Piano-roll por canal + escala (v0.21.0):** en la sección PASOS, los canales **melódicos**
(synth/synthx/slicer) muestran un **mini piano-roll** (`ui/pianoRoll.ts`, filas=notas ~2 octavas con octava
▲/▼, columnas=pasos, monofónico por paso; clic pone/mueve/borra la nota vía `setStep`); la **batería** sigue
con la fila on/off. Una **barra de escala** (tónica + tipo) **resalta** las notas de la escala (informativo):
helper puro `daw/scales.ts` (`SCALES`+`inScale`, portado de `pianova.html`) + escala en el estado
(`scaleRoot`/`scaleType`, persistida con migración). Para el **slicer**, cada paso puede disparar un **slice
distinto** (la nota elige el slice). Sin cambios de motor (el disparo ya usa `st.note`).
```

- [ ] **Step 3: Update CLAUDE.md**

En la sección del Estudio (decisión 5), tras la mención de "UI más compacta estilo VST", añade que la vista tiene **piano-roll por canal melódico + ayuda de escala (v0.21.0): editar la nota de cada paso (rejilla notas×pasos, ~2 octavas) y resalte de escala informativo** (`daw/scales.ts` + `ui/pianoRoll.ts`, escala persistida en el estado; sin cambios de motor).

- [ ] **Step 4: Verify and commit**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio piano-roll: docs (HANDOFF/CLAUDE) y versión 0.21.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- Helper de escalas puro + tests → Task 1 ✅
- Escala en el estado + migración → Task 2 ✅
- Componente piano-roll (notas×pasos, ~2 octavas, octava ▲/▼, resalte de escala, cabezal) → Task 3 ✅
- Barra de escala (tónica+tipo, informativa) + integración (melódico=piano-roll, batería=on/off) + `setStep` +
  octava recordada + slicer por-slice → Task 4 ✅
- Docs/versión → Task 5 ✅

**Placeholders:** ninguno; el código va completo.

**Consistencia de tipos:** `inScale(midi, root, type)`/`noteName(midi)`/`SCALES`/`SCALE_LABELS`/`NOTE_NAMES`
(Task 1) coinciden con su uso en Tasks 3–4. `DawState.scaleRoot/scaleType` (Task 2) se leen en Task 4
(`daw.scaleRoot`/`daw.scaleType`) y se escriben con spread + `persist()`. `mountPianoRoll(root, {total, lowMidi,
scaleRoot, scaleType, getStep, onSetNote, onRange}) → { setPlayhead }` (Task 3) coincide con la llamada de Task
4. `setStep(daw, id, i, Step)` y `channelSteps(daw, id)` ya existen. `selGrid = { setPlayhead }` sirve tanto para
el piano-roll como para el step grid (el `visualTick` lo llama igual).

**Estado intermedio válido:** Task 1–3 no alteran la vista (compilan y pasan tests); Task 4 cablea. Aditivo.

**Decisión consciente (re-montaje en cambio de escala):** al cambiar tónica/tipo se llama `renderSelected()`
(re-monta piano-roll) para refrescar el resalte; la octava visible se conserva en `prLow` (estado del view),
así que no se pierde. Editar una nota redibuja solo el piano-roll (no re-monta la vista).
