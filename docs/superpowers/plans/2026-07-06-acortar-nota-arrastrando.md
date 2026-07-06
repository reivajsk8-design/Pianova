# Acortar/alargar nota arrastrando (longitud fraccionaria) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poder acortar (y alargar) una nota del piano-roll arrastrando su borde, con saltos de 1/4 de paso, dibujándola como barra proporcional.

**Architecture:** `Step.len` admite fracciones (múltiplos de 0,25; mínimo 0,25). El piano-roll dibuja cada nota como una barra posicionada (ancho ∝ longitud) sobre las celdas de fondo, y el arrastre fija el borde derecho por la posición fraccionaria del puntero (snap a 1/4). El motor no cambia (ya usa `gate = effectiveLen × duración_de_paso`).

**Tech Stack:** Vite + TypeScript (strict) + Vitest. DOM pointer events.

## Global Constraints

- Todo el trabajo en `studio/` (NO tocar `pianova.html`). TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón `var(--pv-acc)`.
- Finura **1/4 de paso** (`LEN_STEP = 0.25`); mínimo de nota **0,25** (`MIN_LEN = 0.25`). El inicio de la nota
  sigue en una celda entera.
- Compat sin migración: `len` entero (v0.31) se ve/suena igual.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build` (desde `studio/`).
- Commits con trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Modelo — longitud fraccionaria (`snapLen`, `MIN_LEN`, `effectiveLen`, `paintNote`) + tests

**Files:**
- Modify: `studio/src/daw/model.ts`
- Modify: `studio/src/daw/model.test.ts`

**Interfaces:**
- Produces: `LEN_STEP = 0.25`, `MIN_LEN = 0.25`, `snapLen(len): number`; `effectiveLen` con mínimo `MIN_LEN`;
  `paintNote` con snap a 1/4 y mínimo `MIN_LEN`.

- [ ] **Step 1: Escribe los tests que fallan (añadir a `studio/src/daw/model.test.ts`)**

Añade (usa los imports ya presentes; añade `snapLen, MIN_LEN` al `import` de `../daw/model` de la cabecera si
faltan):

```ts
describe('longitud fraccionaria', () => {
  it('snapLen redondea a 1/4', () => {
    expect(snapLen(1.1)).toBe(1);
    expect(snapLen(0.3)).toBe(0.25);
    expect(snapLen(0.6)).toBe(0.5);
    expect(snapLen(2.4)).toBe(2.5);      // 2.4/0.25 = 9.6 → 10 → 2.5
    expect(MIN_LEN).toBe(0.25);
  });
  it('effectiveLen respeta la fracción, aplica el mínimo 0.25 y recorta al final', () => {
    const s = emptySteps(8);
    s[2] = { on: true, note: 60, len: 0.5 };
    expect(effectiveLen(s, 2)).toBe(0.5);
    s[3] = { on: true, note: 60, len: 0.1 };     // por debajo del mínimo
    expect(effectiveLen(s, 3)).toBe(0.25);
    s[7] = { on: true, note: 60, len: 5 };
    expect(effectiveLen(s, 7)).toBe(1);           // recorta a 8 - 7
    expect(effectiveLen(s, 0)).toBe(1);           // len ausente ⇒ 1
  });
  it('paintNote hace snap a 1/4, aplica el mínimo y NO limpia celdas si L < 1', () => {
    const d0 = defaultDaw(); const id = d0.channels[0].id;
    const d1 = paintNote(d0, id, 2, 0.3, 64);
    expect(d1.patterns[0].steps[id][2]).toEqual({ on: true, note: 64, len: 0.25 });
    expect(d1.patterns[0].steps[id][3].on).toBe(false);   // L < 1 → no limpia nada nuevo
  });
  it('paintNote fraccionario > 1 limpia solo los pasos enteros cubiertos', () => {
    const d0 = defaultDaw(); const id = d0.channels[0].id;
    let d = paintNote(d0, id, 3, 1, 60);
    d = paintNote(d, id, 4, 1, 62);
    d = paintNote(d, id, 5, 1, 64);
    d = paintNote(d, id, 2, 2.5, 65);      // cubre k=3,4 (3 ≤ k < 4.5); no toca el 5
    const steps = d.patterns[0].steps[id];
    expect(steps[2].len).toBe(2.5);
    expect(steps[3].on).toBe(false);
    expect(steps[4].on).toBe(false);
    expect(steps[5].on).toBe(true);        // 5 ≥ 4.5 → sobrevive
    expect(steps[5].note).toBe(64);
  });
});
```

- [ ] **Step 2: Ejecuta los tests para verlos fallar**

Run: `cd studio && npm test -- model`
Expected: FAIL (`snapLen`/`MIN_LEN` no existen).

- [ ] **Step 3: Edita `studio/src/daw/model.ts`**

(a) Añade las constantes y `snapLen` (junto a `effectiveLen`/`paintNote`):

```ts
export const LEN_STEP = 0.25;   // rejilla de longitud de nota (1/4 de paso)
export const MIN_LEN = 0.25;    // longitud mínima de una nota (1/4 de paso)

// Redondea una longitud a la rejilla de 1/4 de paso.
export function snapLen(len: number): number {
  return Math.round(len / LEN_STEP) * LEN_STEP;
}
```

(b) Sustituye `effectiveLen` para bajar el mínimo a `MIN_LEN`:

```ts
export function effectiveLen(steps: Step[], i: number): number {
  const raw = steps[i]?.len ?? 1;
  return Math.max(MIN_LEN, Math.min(raw, steps.length - i));
}
```

(c) Sustituye el cálculo de `L` en `paintNote` (snap + mínimo `MIN_LEN`); el resto de la función NO cambia:

```ts
      const L = Math.max(MIN_LEN, Math.min(snapLen(len), cur.length - start));
```

(La función queda: `steps[start] = { ...steps[start], on: true, note, len: L }` y el bucle de limpieza
`for (let k = start + 1; k < start + L; k++) steps[k] = { ...steps[k], on: false }` — sin tocar.)

- [ ] **Step 4: Ejecuta los tests para verlos pasar**

Run: `cd studio && npm test -- model`
Expected: PASS (los nuevos + los previos de `paintNote`/`effectiveLen`, que siguen válidos con enteros).

- [ ] **Step 5: typecheck + build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add studio/src/daw/model.ts studio/src/daw/model.test.ts
git commit -m "Estudio notas: longitud fraccionaria (snapLen 1/4 + MIN_LEN + effectiveLen/paintNote) + tests"
```

---

### Task 2: Piano-roll — dibujo por barra + arrastre fraccionario (+ CSS)

**Files:**
- Modify: `studio/src/ui/pianoRoll.ts` (reescritura del dibujo + interacción)
- Modify: `studio/src/ui/styles.css` (barra `.prNote` + `.prCells` relativo)

**Interfaces:**
- Consumes: `Step`, `MIN_LEN`, `snapLen` (`daw/model`); `inScale`, `noteName` (`daw/scales`).
- Produce: `mountPianoRoll(root, opts)` con el MISMO contrato de opts
  (`total, lowMidi, scaleRoot, scaleType, beatEvery?, getStep, onPaint, onClear, onRange`) y retorno
  (`{ setPlayhead, setLiveNotes }`). `studioView` NO se toca.

Sin test unitario nuevo (DOM/pointer) — verificado por typecheck + build + prueba manual.

- [ ] **Step 1: Reemplaza `studio/src/ui/pianoRoll.ts` por esta versión**

```ts
// studio/src/ui/pianoRoll.ts
// Mini piano-roll por canal: filas = notas (~2 octavas), columnas = pasos. Monofónico por paso, con LONGITUD
// FRACCIONARIA: una nota empieza en un paso y dura `len` pasos (múltiplos de 1/4), y se dibuja como BARRA
// proporcional sobre las celdas. Clic = nota de 1 paso; arrastrar el borde alarga o ACORTA (mín. 1/4); clic
// sobre una nota la borra. Resalta la escala (informativo).
import type { Step } from '../daw/model';
import { MIN_LEN, snapLen } from '../daw/model';
import { inScale, noteName } from '../daw/scales';

const ROWS = 24;                            // ~2 octavas visibles
const BLACK = new Set([1, 3, 6, 8, 10]);    // clases de nota negras

export interface PianoRollUI {
  setPlayhead(step: number): void;
  setLiveNotes(notes: number[], focus?: number): void;
}

export function mountPianoRoll(
  root: HTMLElement,
  opts: {
    total: number; lowMidi: number; scaleRoot: number; scaleType: string; beatEvery?: number;
    getStep: (i: number) => Step | undefined;
    onPaint: (start: number, len: number, midi: number) => void;   // colocar/alargar/acortar
    onClear: (headIndex: number) => void;                          // borrar la nota cuyo head está aquí
    onRange: (lowMidi: number) => void;
  }
): PianoRollUI {
  let low = Math.max(0, Math.min(127 - ROWS, opts.lowMidi));
  let live = new Set<number>();
  // Arrastre en curso: cabeza ancla, fila, si empezó sobre una nota, x inicial, largo actual, si hubo arrastre.
  let ds: { anchor: number; startM: number; onNote: boolean; downX: number; len: number; moved: boolean; cellsEl: HTMLElement } | null = null;

  // Largo efectivo (clamp mín/fin) de la nota que empieza en la celda `i`.
  const barLen = (st: Step, i: number): number => Math.max(MIN_LEN, Math.min(st.len ?? 1, opts.total - i));

  function rowCells(midi: number): string {
    let cells = '';
    for (let i = 0; i < opts.total; i++) {
      cells += `<div class="prCell${i % (opts.beatEvery ?? 4) === 0 ? ' beat' : ''}" data-i="${i}" data-m="${midi}"></div>`;
    }
    return cells;
  }
  // Barras de nota de la fila (capa superpuesta, no interactiva): left/width en % del ancho de la fila.
  function noteBars(midi: number): string {
    let bars = '';
    for (let i = 0; i < opts.total; i++) {
      const st = opts.getStep(i);
      if (st && st.on && (st.note ?? 60) === midi) {
        const len = barLen(st, i);
        bars += `<div class="prNote" style="left:${i / opts.total * 100}%;width:${len / opts.total * 100}%"></div>`;
      }
    }
    return bars;
  }

  // Posición fraccionaria (en pasos) del puntero dentro de una fila de celdas.
  function posAt(cellsEl: HTMLElement, clientX: number): number {
    const r = cellsEl.getBoundingClientRect();
    const p = (clientX - r.left) / (r.width / opts.total);
    return Math.max(0, Math.min(opts.total, p));
  }
  // Cabeza (celda con nota de la fila `midi`) que cubre la posición fraccionaria `posX`, o null.
  function headAt(midi: number, posX: number): number | null {
    for (let i = 0; i < opts.total; i++) {
      const st = opts.getStep(i);
      if (st && st.on && (st.note ?? 60) === midi && posX >= i && posX < i + barLen(st, i)) return i;
    }
    return null;
  }

  function draw(): void {
    let rows = '';
    for (let r = 0; r < ROWS; r++) {
      const midi = low + (ROWS - 1 - r);                 // agudo arriba, grave abajo
      const cls = (BLACK.has(((midi % 12) + 12) % 12) ? ' black' : '') +
                  ((opts.scaleType !== 'chromatic' && inScale(midi, opts.scaleRoot, opts.scaleType)) ? ' inscale' : '');
      const liveCls = live.has(midi) ? ' live' : '';
      rows += `<div class="prRow${cls}${liveCls}" data-m="${midi}"><span class="prLabel">${noteName(midi)}</span><div class="prCells">${rowCells(midi)}${noteBars(midi)}</div></div>`;
    }
    root.innerHTML = `<div class="pr">
      <div class="prTools">
        <button class="chBtn" id="prUp" title="Subir una octava">▲</button>
        <button class="chBtn" id="prDown" title="Bajar una octava">▼</button>
        <span class="prHint muted">clic = nota de 1 paso · arrastra el borde para alargar o acortar · clic en la nota para borrar</span>
      </div>
      <div class="prGrid">${rows}</div>
    </div>`;

    (root.querySelector('#prUp') as HTMLButtonElement).addEventListener('click', () => {
      low = Math.min(127 - ROWS, low + 12); opts.onRange(low); draw();
    });
    (root.querySelector('#prDown') as HTMLButtonElement).addEventListener('click', () => {
      low = Math.max(0, low - 12); opts.onRange(low); draw();
    });

    const grid = root.querySelector('.prGrid') as HTMLElement;
    const clearPreview = (): void => grid.querySelectorAll('.prNote.preview').forEach(el => el.remove());
    const showPreview = (m: number, anchor: number, len: number): void => {
      clearPreview();
      const cells = grid.querySelector(`.prRow[data-m="${m}"] .prCells`) as HTMLElement | null;
      if (!cells) return;
      const bar = document.createElement('div');
      bar.className = 'prNote preview';
      bar.style.left = anchor / opts.total * 100 + '%';
      bar.style.width = len / opts.total * 100 + '%';
      cells.appendChild(bar);
    };

    grid.addEventListener('pointerdown', e => {
      const cellEl = (e.target as HTMLElement).closest('.prCell') as HTMLElement | null; if (!cellEl) return;
      const m = +(cellEl.dataset.m ?? '60');
      const cellsEl = cellEl.parentElement as HTMLElement;
      const c = +(cellEl.dataset.i ?? '0');
      const head = headAt(m, posAt(cellsEl, e.clientX));
      const hs = head != null ? opts.getStep(head) : undefined;
      ds = {
        anchor: head ?? c, startM: m, onNote: head != null, downX: e.clientX,
        len: hs ? barLen(hs, head as number) : 1, moved: false, cellsEl
      };
      try { grid.setPointerCapture(e.pointerId); } catch { /* ya */ }
    });
    grid.addEventListener('pointermove', e => {
      if (!ds) return;
      if (!ds.moved && Math.abs(e.clientX - ds.downX) < 4) return;   // umbral: distingue clic de arrastre
      ds.moved = true;
      ds.len = Math.max(MIN_LEN, Math.min(snapLen(posAt(ds.cellsEl, e.clientX) - ds.anchor), opts.total - ds.anchor));
      showPreview(ds.startM, ds.anchor, ds.len);
    });
    const finish = (e: PointerEvent): void => {
      if (!ds) return; const d = ds; ds = null; clearPreview();
      try { grid.releasePointerCapture(e.pointerId); } catch { /* ya */ }
      if (!d.moved) {
        if (d.onNote) opts.onClear(d.anchor);              // clic en nota → borrar
        else opts.onPaint(d.anchor, 1, d.startM);           // clic en hueco → nota de 1 paso
      } else opts.onPaint(d.anchor, d.len, d.startM);        // arrastre → alarga/acorta desde la cabeza
      draw();
    };
    grid.addEventListener('pointerup', finish);
    grid.addEventListener('pointercancel', finish);
  }
  draw();

  return {
    setPlayhead(step: number): void {
      root.querySelectorAll<HTMLElement>('.prCell.play').forEach(c => c.classList.remove('play'));
      if (step >= 0) root.querySelectorAll<HTMLElement>(`.prCell[data-i="${step}"]`).forEach(c => c.classList.add('play'));
    },
    setLiveNotes(notes: number[], focus?: number): void {
      live = new Set(notes);
      if (focus != null && (focus < low || focus > low + ROWS - 1)) {
        low = Math.max(0, Math.min(127 - ROWS, 12 * Math.floor(focus / 12) - 12));
        opts.onRange(low); draw(); return;
      }
      root.querySelectorAll<HTMLElement>('.prRow').forEach(rowEl =>
        rowEl.classList.toggle('live', live.has(+(rowEl.dataset.m ?? '-1'))));
    }
  };
}
```

- [ ] **Step 2: CSS de la barra (`studio/src/ui/styles.css`)**

Busca la regla `.prCells{...}` y añádele `position:relative`. Hoy es:

```css
.prCells{display:grid;flex:1;grid-auto-flow:column;grid-auto-columns:1fr}
```

Déjala:

```css
.prCells{display:grid;flex:1;grid-auto-flow:column;grid-auto-columns:1fr;position:relative}
```

Y añade tras la línea de `.prCell.on.play{...}` (las reglas viejas de `.prCell.on`/`.cont`/`.pvsel` quedan sin
uso pero son inofensivas):

```css
.prNote{position:absolute;top:1px;bottom:1px;background:var(--pv-acc);box-shadow:0 0 6px var(--pv-acc-dim) inset;border-radius:3px;pointer-events:none}
.prNote.preview{opacity:.55}
```

- [ ] **Step 3: typecheck + build + prueba manual**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS. En la URL (`npm run dev`), canal melódico en PASOS:
1. **Clic** en una celda → nota de 1 paso.
2. **Arrastra el borde a la izquierda** → la nota se **acorta** (a 1/2, 1/4 de paso) y se ve como barra corta;
   al reproducir **suena más corta**.
3. **Arrastra a la derecha** → alarga (como antes, ahora con snap a 1/4).
4. **Clic** sobre una nota → se borra.
5. Recarga → las longitudes (incluidas las fraccionarias) persisten.

- [ ] **Step 4: Commit**

```bash
git add studio/src/ui/pianoRoll.ts studio/src/ui/styles.css
git commit -m "Estudio notas: piano-roll con barra proporcional y arrastre para acortar/alargar (snap 1/4)"
```

---

### Task 3: Docs y versión

**Files:**
- Modify: `studio/package.json` (version → `0.32.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.32.0"`.

- [ ] **Step 2: HANDOFF.md**

Añade en la zona de estado del Estudio (junto a las últimas entradas):

```markdown
**Estudio · acortar/alargar nota arrastrando (v0.32.0):** las notas del piano-roll tienen **longitud
fraccionaria** (múltiplos de 1/4 de paso; mínimo 1/4). Se dibujan como **barra proporcional** (media nota = media
celda) y se **acortan/alargan arrastrando el borde** (snap a 1/4). `Step.len` admite fracciones; `snapLen`/
`MIN_LEN` + `effectiveLen`/`paintNote` (mínimo 0,25) en `daw/model.ts`; `ui/pianoRoll.ts` reescribe el dibujo
(capa de barras) y el arrastre (posición fraccionaria del puntero). El motor no cambia (`gate = len × paso`).
Compat v0.31 → `len` entero igual.
```

- [ ] **Step 3: CLAUDE.md**

En la sección del Estudio (decisión 5), tras la entrada del navegador de carpetas, añade: **acortar/alargar nota
arrastrando (v0.32.0): longitud fraccionaria (1/4 de paso, mín. 1/4), nota como barra proporcional, se
acorta/alarga arrastrando el borde** (`daw/model.ts` `snapLen`/`MIN_LEN`/`effectiveLen`/`paintNote` +
`ui/pianoRoll.ts`; sin cambios de motor).

- [ ] **Step 4: Verifica y commitea**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio notas: docs (HANDOFF/CLAUDE) y versión 0.32.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- `LEN_STEP`/`MIN_LEN`/`snapLen` + `effectiveLen` (mín. `MIN_LEN`) + `paintNote` (snap + mín + limpieza de
  enteros cubiertos) + tests → Task 1 ✅
- Piano-roll: dibujo por barra proporcional + arrastre con posición fraccionaria (snap 1/4, mín 0,25, clic
  crear/borrar) + `position:relative` + `.prNote` CSS + texto de ayuda → Task 2 ✅
- Motor sin cambios (usa `effectiveLen`) → cubierto (no hay tarea, es intencional) ✅
- Persistencia sin migración (`len` fraccionario en el Step) → cubierto por Task 1 + serialización existente ✅
- Docs/versión → Task 3 ✅

**Placeholders:** ninguno; el código va completo (modelo, piano-roll, CSS).

**Consistencia de tipos:** `snapLen`/`MIN_LEN` (Task 1) se importan y usan en `pianoRoll.ts` (Task 2).
`onPaint(start, len, midi)` acepta `len` fraccionario y lo procesa `paintNote` (snap+clamp). El contrato de
`mountPianoRoll` (opts + retorno) no cambia → `studioView` no se toca. `effectiveLen` (mín. `MIN_LEN`) la usa el
motor y el propio piano-roll (`barLen` replica el clamp para el dibujo). Nombres coherentes.

**Estado intermedio válido:** Task 1 (modelo) compila y testea solo; Task 2 usa `snapLen`/`MIN_LEN` (ya existen)
y reescribe el piano-roll manteniendo el contrato → compila; Task 3 docs. Cada tarea deja el build verde.

**Decisión consciente:** el inicio de la nota sigue en una celda entera (monofónico por paso); solo el largo es
fraccionario. Las barras van en una capa `pointer-events:none` para que los clics sigan yendo a las celdas; la
posición del puntero se mide sobre `.prCells` de la fila de inicio. Las reglas CSS viejas de `.prCell.on/.cont/
.pvsel` quedan sin uso (inofensivas); no se eliminan para acotar el diff.
