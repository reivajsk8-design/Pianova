# Acordes en el piano-roll (varias notas por paso) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir varias notas en la misma columna del piano-roll (acordes), dibujando y grabando en vivo, en los canales melódicos del Estudio.

**Architecture:** Modelo **aditivo**: cada `Step` conserva su nota raíz y gana una lista opcional `extra: NoteEv[]` con las demás notas del acorde. Helpers puros en `daw/model.ts` (`stepNotes`, `paintNote` reescrito consciente de acordes, `removeNote`, `noteGate`) + tabla de acordes en `daw/chords.ts`. El piano-roll edita por nota (no por columna) y gana un selector de acorde; la reproducción dispara todas las notas del paso; la grabación apila el golpe y reemplaza la pasada. Sin migración: el campo `extra` viaja en el JSON del proyecto (versión 3 intacta).

**Tech Stack:** TypeScript (strict), Vite, Vitest. Web Audio. Sin dependencias nuevas.

## Global Constraints

- Todo en `studio/`; **no tocar `pianova.html`**. TypeScript strict; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón del tema.
- Versión objetivo del proyecto (package.json): **0.42.0**. La versión del formato de proyecto sigue en **3** (sin migración).
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con el trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Ejecutar git desde `/c/Pianova` con rutas explícitas (hay drift de directorio en el shell).

## Mapa de archivos

- `studio/src/daw/model.ts` — **Modifica.** Tipo `NoteEv`, campo `extra?` en `Step`, helpers `stepNotes`, `noteGate`, `paintNote` (reescrito), `removeNote`. (Task 1)
- `studio/src/daw/model.test.ts` — **Modifica.** Ajusta los tests de `paintNote` a la semántica polifónica y añade tests de acordes. (Task 1)
- `studio/src/daw/chords.ts` — **Crea.** Tabla `CHORDS` + `chordNotes`. (Task 2)
- `studio/src/daw/chords.test.ts` — **Crea.** Tests de `chordNotes`. (Task 2)
- `studio/src/ui/pianoRoll.ts` — **Modifica.** Render/edición por nota + selector de acorde; cambia la firma de `onClear`. (Task 3)
- `studio/src/app/studioView.ts` — **Modifica.** Reproducción por acorde, grabación apilar/reemplazar, cableado `onPaint`/`onClear`. (Task 4)
- `studio/src/app/store.test.ts` — **Modifica.** Test de ida y vuelta de un paso con `extra`. (Task 5)
- `CLAUDE.md`, `HANDOFF.md`, `studio/package.json` — **Modifica.** Docs + versión 0.42.0. (Task 5)

---

### Task 1: Modelo — acordes en `Step` (`stepNotes`, `paintNote` polifónico, `removeNote`, `noteGate`)

**Files:**
- Modify: `studio/src/daw/model.ts`
- Test: `studio/src/daw/model.test.ts`

**Interfaces:**
- Consumes: `DawState`, `emptySteps`, `snapLen`, `MIN_LEN`, `defaultDaw`, `channelSteps` (ya existen en el mismo archivo).
- Produces:
  - `interface NoteEv { note: number; vel?: number; len?: number }`
  - `interface Step { on: boolean; note?: number; vel?: number; len?: number; extra?: NoteEv[] }`
  - `function stepNotes(st: Step | undefined): NoteEv[]`
  - `function noteGate(len: number | undefined, i: number, total: number): number`
  - `function paintNote(daw: DawState, chId: string, start: number, len: number, note: number, vel?: number): DawState`
  - `function removeNote(daw: DawState, chId: string, i: number, note: number): DawState`

**Contexto de la semántica que cambia:** el `paintNote` actual es **monofónico**: al colocar una nota larga, limpia (`on:false`) **todos** los pasos cubiertos, borrando cualquier otra tecla de esas columnas. La versión nueva es **polifónica**: coloca/actualiza solo la tecla indicada, conserva las demás notas de la columna, y limpia únicamente las apariciones de **esa misma tecla** en los pasos cubiertos (para que una nota larga no se re-dispare consigo misma). Por eso hay que **reescribir** dos tests existentes de `paintNote`.

- [ ] **Step 1: Escribe/ajusta los tests (fallan)**

En `studio/src/daw/model.test.ts`, amplía el import añadiendo `stepNotes`, `noteGate`, `removeNote`:

```ts
import {
  emptySteps, defaultChannel, defaultDaw, addChannel, removeChannel, updateChannel,
  toggleStep, audibleIds, findChannel, channelSteps, addPattern, removePattern, setCurrentPattern, setSong, setStep,
  defaultSynthxInstrument, defaultSlicerInstrument, newChannelId, syncChannelIdSeed,
  channelLen, addStepsPage, removeStepsPage, effectiveLen, paintNote, duplicatePattern,
  snapLen, MIN_LEN, stepNotes, noteGate, removeNote
} from './model';
```

**Reemplaza** el bloque `describe('longitud fraccionaria', ...)` — concretamente los dos últimos `it` (los de `paintNote` que asumían borrado de columna) — por su versión polifónica. Es decir, borra estos dos `it`:

```ts
  it('paintNote hace snap a 1/4, aplica el mínimo y NO limpia celdas si L < 1', () => { ... });
  it('paintNote fraccionario > 1 limpia solo los pasos enteros cubiertos', () => { ... });
```

y déjalos así (el primero se conserva casi igual porque la columna está vacía; los otros pasan a polifónicos):

```ts
  it('paintNote hace snap a 1/4, aplica el mínimo y NO limpia nada si L < 1', () => {
    const d0 = defaultDaw(); const id = d0.channels[0].id;
    const d1 = paintNote(d0, id, 2, 0.3, 64);
    expect(d1.patterns[0].steps[id][2]).toEqual({ on: true, note: 64, len: 0.25 });
    expect(d1.patterns[0].steps[id][3].on).toBe(false);   // L < 1 → no cubre nada
  });
  it('paintNote es polifónico: no borra OTRAS teclas de las columnas cubiertas', () => {
    const d0 = defaultDaw(); const id = d0.channels[0].id;
    let d = paintNote(d0, id, 3, 1, 60);
    d = paintNote(d, id, 4, 1, 62);
    d = paintNote(d, id, 5, 1, 64);
    d = paintNote(d, id, 2, 2.5, 65);      // cubre k=3,4; NO debe tocar otras teclas
    const steps = d.patterns[0].steps[id];
    expect(steps[2].note).toBe(65); expect(steps[2].len).toBe(2.5);
    expect(steps[3].on).toBe(true); expect(steps[3].note).toBe(60);  // sobrevive
    expect(steps[4].on).toBe(true); expect(steps[4].note).toBe(62);  // sobrevive
    expect(steps[5].on).toBe(true); expect(steps[5].note).toBe(64);
  });
  it('paintNote limpia solo la MISMA tecla en el rango cubierto', () => {
    const d0 = defaultDaw(); const id = d0.channels[0].id;
    let d = paintNote(d0, id, 3, 1, 60);   // misma tecla 60 en el paso 3
    d = paintNote(d, id, 2, 3, 60);        // 60 largo desde el 2 cubre el 3 → limpia el 60 del 3
    const steps = d.patterns[0].steps[id];
    expect(steps[2].note).toBe(60); expect(steps[2].len).toBe(3);
    expect(steps[3].on).toBe(false);       // el 60 del 3 se limpió (misma tecla)
  });
```

Añade al final del archivo un `describe` nuevo:

```ts
describe('acordes (varias notas por paso)', () => {
  it('stepNotes: apagado → [], mono → 1 nota, con extra → raíz + extras en orden', () => {
    expect(stepNotes({ on: false })).toEqual([]);
    const one = stepNotes({ on: true, note: 60, len: 1 });
    expect(one.length).toBe(1); expect(one[0].note).toBe(60);
    const st = { on: true, note: 60, len: 1, extra: [{ note: 64 }, { note: 67 }] };
    expect(stepNotes(st).map(n => n.note)).toEqual([60, 64, 67]);
  });
  it('noteGate: ausente = 1, respeta el valor y recorta al final', () => {
    expect(noteGate(undefined, 3, 8)).toBe(1);
    expect(noteGate(3, 2, 8)).toBe(3);
    expect(noteGate(5, 6, 8)).toBe(2);      // recorta a total - i
    expect(noteGate(0.1, 0, 8)).toBe(MIN_LEN);
  });
  it('paintNote apila una segunda tecla sin borrar la primera (acorde)', () => {
    const d0 = defaultDaw(); const id = d0.channels[0].id;
    let d = paintNote(d0, id, 2, 1, 60);
    d = paintNote(d, id, 2, 1, 64);
    const st = d.patterns[0].steps[id][2];
    expect(st.note).toBe(60);
    expect(stepNotes(st).map(n => n.note)).toEqual([60, 64]);
  });
  it('paintNote sobre una tecla ya presente actualiza su longitud', () => {
    const d0 = defaultDaw(); const id = d0.channels[0].id;
    let d = paintNote(d0, id, 2, 1, 60);
    d = paintNote(d, id, 2, 1, 64);        // acorde 60+64
    d = paintNote(d, id, 2, 3, 64);        // re-pinta 64 con len 3
    const st = d.patterns[0].steps[id][2];
    expect(stepNotes(st).find(n => n.note === 64)?.len).toBe(3);
    expect(stepNotes(st).map(n => n.note)).toEqual([60, 64]);
  });
  it('removeNote quita una extra y deja el resto (sin extra si queda vacía)', () => {
    const d0 = defaultDaw(); const id = d0.channels[0].id;
    let d = paintNote(d0, id, 2, 1, 60);
    d = paintNote(d, id, 2, 1, 64);
    d = removeNote(d, id, 2, 64);
    const st = d.patterns[0].steps[id][2];
    expect(stepNotes(st).map(n => n.note)).toEqual([60]);
    expect(st.extra).toBeUndefined();
  });
  it('removeNote sobre la raíz asciende una extra a raíz', () => {
    const d0 = defaultDaw(); const id = d0.channels[0].id;
    let d = paintNote(d0, id, 2, 1, 60);
    d = paintNote(d, id, 2, 1, 64);
    d = removeNote(d, id, 2, 60);          // quita la raíz
    const st = d.patterns[0].steps[id][2];
    expect(st.on).toBe(true); expect(st.note).toBe(64);
    expect(stepNotes(st).map(n => n.note)).toEqual([64]);
  });
  it('removeNote sobre la única nota apaga el paso', () => {
    const d0 = defaultDaw(); const id = d0.channels[0].id;
    let d = paintNote(d0, id, 2, 1, 60);
    d = removeNote(d, id, 2, 60);
    expect(d.patterns[0].steps[id][2]).toEqual({ on: false });
  });
});
```

- [ ] **Step 2: Corre los tests (fallan)**

Run: `cd studio && npx vitest run src/daw/model.test.ts`
Expected: FAIL — `stepNotes`, `noteGate`, `removeNote` no existen; los tests poli de `paintNote` fallan con la implementación monofónica actual.

- [ ] **Step 3: Implementa en `studio/src/daw/model.ts`**

Cambia la interfaz `Step` y añade `NoteEv` (sustituye la línea 8 actual `export interface Step { ... }`):

```ts
export interface NoteEv { note: number; vel?: number; len?: number }
export interface Step { on: boolean; note?: number; vel?: number; len?: number; extra?: NoteEv[] }
```

Añade los helpers `stepNotes` y `noteGate` (por ejemplo, justo tras `snapLen`):

```ts
// Todas las notas del paso (raíz primero si está activo), como NoteEv[]. [] si el paso está apagado.
export function stepNotes(st: Step | undefined): NoteEv[] {
  if (!st || !st.on || st.note == null) return [];
  const root: NoteEv = { note: st.note, vel: st.vel, len: st.len };
  return st.extra && st.extra.length ? [root, ...st.extra] : [root];
}

// Longitud efectiva (gate) de una nota que empieza en el paso `i`: su `len` (o 1), mínimo MIN_LEN, recortada
// al final del canal (`total - i`).
export function noteGate(len: number | undefined, i: number, total: number): number {
  return Math.max(MIN_LEN, Math.min(len ?? 1, total - i));
}
```

Reescribe `effectiveLen` para reutilizar `noteGate` (mismo comportamiento que hoy):

```ts
// Longitud real de la nota RAÍZ que empieza en `i` (compat).
export function effectiveLen(steps: Step[], i: number): number {
  return noteGate(steps[i]?.len, i, steps.length);
}
```

Añade dos helpers **internos** (no exportados) que operan sobre un solo `Step`, y reescribe `paintNote`; añade `removeNote`. Sustituye por completo la función `paintNote` existente por esto:

```ts
// Coloca/actualiza la tecla `note` en el paso, conservando las demás notas de la columna. Inmutable a nivel Step.
function putNote(st: Step, note: number, len: number, vel?: number): Step {
  if (!st.on || st.note == null) return { on: true, note, len, ...(vel != null ? { vel } : {}) };
  if (st.note === note) return { ...st, len, ...(vel != null ? { vel } : {}) };
  const extra = st.extra ? st.extra.slice() : [];
  const j = extra.findIndex(e => e.note === note);
  if (j >= 0) extra[j] = { ...extra[j], len, ...(vel != null ? { vel } : {}) };
  else extra.push({ note, len, ...(vel != null ? { vel } : {}) });
  return { ...st, extra };
}

// Quita la tecla `note` del paso. Si era la raíz y hay extras, asciende la primera a raíz; si no queda ninguna
// nota, el paso queda apagado. Inmutable a nivel Step.
function dropNote(st: Step, note: number): Step {
  if (!st.on || st.note == null) return st;
  if (st.note === note) {
    if (st.extra && st.extra.length) {
      const [first, ...rest] = st.extra;
      return { on: true, note: first.note, vel: first.vel, len: first.len, ...(rest.length ? { extra: rest } : {}) };
    }
    return { on: false };
  }
  if (!st.extra) return st;
  const extra = st.extra.filter(e => e.note !== note);
  return extra.length ? { ...st, extra } : { on: st.on, note: st.note, vel: st.vel, len: st.len };
}

// Coloca/alarga la tecla `note` en el patrón actual: fija el paso `start` (añade al acorde, conserva las demás
// notas) y LIMPIA solo esta misma tecla en los pasos cubiertos start+1 … start+L-1. Conserva/actualiza `vel`.
// Inmutable.
export function paintNote(daw: DawState, chId: string, start: number, len: number, note: number, vel?: number): DawState {
  return {
    ...daw,
    patterns: daw.patterns.map((p, idx) => {
      if (idx !== daw.current) return p;
      const cur = p.steps[chId] ?? emptySteps(daw.steps);
      const L = Math.max(MIN_LEN, Math.min(snapLen(len), cur.length - start));
      const steps = cur.slice();
      steps[start] = putNote(steps[start], note, L, vel);
      for (let k = start + 1; k < start + L; k++) if (k < steps.length) steps[k] = dropNote(steps[k], note);
      return { steps: { ...p.steps, [chId]: steps } };
    })
  };
}

// Quita la tecla `note` del paso `i` del canal en el patrón actual. Inmutable.
export function removeNote(daw: DawState, chId: string, i: number, note: number): DawState {
  return {
    ...daw,
    patterns: daw.patterns.map((p, idx) => {
      if (idx !== daw.current) return p;
      const cur = p.steps[chId] ?? emptySteps(daw.steps);
      const steps = cur.slice();
      steps[i] = dropNote(steps[i], note);
      return { steps: { ...p.steps, [chId]: steps } };
    })
  };
}
```

- [ ] **Step 4: Corre los tests (pasan)**

Run: `cd studio && npx vitest run src/daw/model.test.ts`
Expected: PASS (incluye los tests poli nuevos y los ajustados).

- [ ] **Step 5: Typecheck + suite completa + build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: typecheck sin errores; toda la suite verde; build OK. (Nota: `paintNote` ahora acepta un 6º parámetro opcional `vel`; los llamadores existentes sin `vel` siguen compilando.)

- [ ] **Step 6: Commit**

```bash
cd /c/Pianova && git add studio/src/daw/model.ts studio/src/daw/model.test.ts && git commit -m "Estudio acordes: modelo (extra en Step, stepNotes/paintNote poli/removeNote/noteGate)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Tabla de acordes (`daw/chords.ts`)

**Files:**
- Create: `studio/src/daw/chords.ts`
- Test: `studio/src/daw/chords.test.ts`

**Interfaces:**
- Produces:
  - `interface ChordDef { label: string; intervals: number[] }`
  - `const CHORDS: Record<string, ChordDef>` con claves `none, maj, min, dom7, maj7, min7, sus2, sus4, dim, aug, power`.
  - `function chordNotes(root: number, type: string): number[]` — notas MIDI del acorde desde `root`, recortadas a 0..127, sin duplicados; tipo desconocido o `none` → `[root]`.

- [ ] **Step 1: Escribe el test (falla)**

Crea `studio/src/daw/chords.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CHORDS, chordNotes } from './chords';

describe('acordes comunes', () => {
  it('CHORDS incluye los tipos esperados con "—" para none', () => {
    expect(CHORDS.none.label).toBe('—');
    expect(CHORDS.maj.intervals).toEqual([0, 4, 7]);
    expect(CHORDS.min.intervals).toEqual([0, 3, 7]);
    expect(CHORDS.dom7.intervals).toEqual([0, 4, 7, 10]);
  });
  it('chordNotes suma los intervalos a la raíz', () => {
    expect(chordNotes(60, 'maj')).toEqual([60, 64, 67]);
    expect(chordNotes(60, 'min')).toEqual([60, 63, 67]);
    expect(chordNotes(60, 'power')).toEqual([60, 67]);
  });
  it('chordNotes con none o tipo desconocido → una sola nota', () => {
    expect(chordNotes(60, 'none')).toEqual([60]);
    expect(chordNotes(60, 'zzz')).toEqual([60]);
  });
  it('chordNotes recorta a 0..127 y quita duplicados', () => {
    expect(chordNotes(125, 'maj')).toEqual([125]);   // 129 y 132 se salen
    expect(chordNotes(-2, 'power')).toEqual([5]);     // -2 se sale; -2+7=5 entra
  });
});
```

- [ ] **Step 2: Corre el test (falla)**

Run: `cd studio && npx vitest run src/daw/chords.test.ts`
Expected: FAIL — `./chords` no existe.

- [ ] **Step 3: Implementa `studio/src/daw/chords.ts`**

```ts
// studio/src/daw/chords.ts
// Acordes comunes para la herramienta de acorde del piano-roll. Intervalos en semitonos desde la raíz.
export interface ChordDef { label: string; intervals: number[] }

export const CHORDS: Record<string, ChordDef> = {
  none:  { label: '—',     intervals: [0] },
  maj:   { label: 'Mayor', intervals: [0, 4, 7] },
  min:   { label: 'Menor', intervals: [0, 3, 7] },
  dom7:  { label: '7ª',    intervals: [0, 4, 7, 10] },
  maj7:  { label: 'Maj7',  intervals: [0, 4, 7, 11] },
  min7:  { label: 'm7',    intervals: [0, 3, 7, 10] },
  sus2:  { label: 'Sus2',  intervals: [0, 2, 7] },
  sus4:  { label: 'Sus4',  intervals: [0, 5, 7] },
  dim:   { label: 'Dim',   intervals: [0, 3, 6] },
  aug:   { label: 'Aum',   intervals: [0, 4, 8] },
  power: { label: '5ª',    intervals: [0, 7] },
};

// Notas MIDI del acorde desde `root`, recortadas a 0..127 y sin duplicados. Tipo desconocido o 'none' → [root].
export function chordNotes(root: number, type: string): number[] {
  const def = CHORDS[type];
  const ivs = def ? def.intervals : [0];
  const out: number[] = [];
  for (const iv of ivs) {
    const n = root + iv;
    if (n >= 0 && n <= 127 && !out.includes(n)) out.push(n);
  }
  return out.length ? out : (root >= 0 && root <= 127 ? [root] : []);
}
```

- [ ] **Step 4: Corre el test (pasa)**

Run: `cd studio && npx vitest run src/daw/chords.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: sin errores; build OK.

- [ ] **Step 6: Commit**

```bash
cd /c/Pianova && git add studio/src/daw/chords.ts studio/src/daw/chords.test.ts && git commit -m "Estudio acordes: tabla de acordes comunes (daw/chords.ts)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Piano-roll polifónico + selector de acorde (`ui/pianoRoll.ts`)

**Files:**
- Modify: `studio/src/ui/pianoRoll.ts`

**Interfaces:**
- Consumes: `stepNotes` (Task 1), `NoteEv`, `MIN_LEN`, `snapLen` de `../daw/model`; `CHORDS`, `chordNotes` de `../daw/chords`; `inScale`, `noteName` de `../daw/scales`.
- Produces (cambio de contrato del componente, lo consume Task 4):
  - `onPaint: (start: number, len: number, midi: number) => void` — **igual que hoy** (una nota). Los acordes se expanden **dentro** del piano-roll en varias llamadas a `onPaint`.
  - `onClear: (headIndex: number, midi: number) => void` — **AÑADE `midi`**: borra esa nota concreta del acorde.

Este archivo no tiene tests unitarios (manipula el DOM); se verifica con typecheck + build + prueba manual.

- [ ] **Step 1: Actualiza imports y firma de `onClear`**

Cambia el import de la cabecera:

```ts
import type { Step, NoteEv } from '../daw/model';
import { MIN_LEN, snapLen, stepNotes } from '../daw/model';
import { CHORDS, chordNotes } from '../daw/chords';
import { inScale, noteName } from '../daw/scales';
```

En el objeto `opts`, cambia la firma de `onClear`:

```ts
    onClear: (headIndex: number, midi: number) => void;             // borrar esa nota del acorde
```

- [ ] **Step 2: Estado del selector de acorde**

Junto a `let low = ...;` y `let live = ...;`, añade:

```ts
  let chordType = 'none';   // tipo de acorde de la herramienta (— por defecto): estado local del piano-roll
```

- [ ] **Step 3: Render por nota (barras, cabezas) mirando el acorde**

Sustituye el helper `barLen` y las funciones `noteBars` y `headAt` para que operen sobre **todas** las notas del paso:

```ts
  // NoteEv de la tecla `midi` que empieza en el paso `i` (o undefined).
  const noteAt = (i: number, midi: number): NoteEv | undefined =>
    stepNotes(opts.getStep(i)).find(e => e.note === midi);

  // Largo efectivo (clamp mín/fin) de una nota que empieza en la celda `i`.
  const barLen = (ev: NoteEv, i: number): number => Math.max(MIN_LEN, Math.min(ev.len ?? 1, opts.total - i));

  // Barras de nota de la fila (capa superpuesta, no interactiva): una barra por cada aparición de `midi`.
  function noteBars(midi: number): string {
    let bars = '';
    for (let i = 0; i < opts.total; i++) {
      const ev = noteAt(i, midi);
      if (ev) {
        const len = barLen(ev, i);
        bars += `<div class="prNote" style="left:${i / opts.total * 100}%;width:${len / opts.total * 100}%"></div>`;
      }
    }
    return bars;
  }
```

Y `headAt`:

```ts
  // Cabeza (paso con nota de la fila `midi`) que cubre la posición fraccionaria `posX`, o null.
  function headAt(midi: number, posX: number): number | null {
    for (let i = 0; i < opts.total; i++) {
      const ev = noteAt(i, midi);
      if (ev && posX >= i && posX < i + barLen(ev, i)) return i;
    }
    return null;
  }
```

En `pointerdown`, donde se calcula `len0`, cambia el cálculo para usar `noteAt` (la firma de `barLen` cambió a `(NoteEv, i)`):

```ts
      const head = headAt(m, downPos);
      const hev = head != null ? noteAt(head, m) : undefined;
      const len0 = hev ? barLen(hev, head as number) : 1;
```

- [ ] **Step 4: Selector de acorde en la barra de herramientas**

En el `root.innerHTML` de `draw()`, dentro de `<div class="prTools">`, añade el selector antes del `prHint` y ajusta el texto de ayuda:

```ts
      <div class="prTools">
        <button class="chBtn" id="prUp" title="Subir una octava">▲</button>
        <button class="chBtn" id="prDown" title="Bajar una octava">▼</button>
        <label class="prChord">Acorde
          <select id="prChordSel">${Object.keys(CHORDS).map(k => `<option value="${k}"${k === chordType ? ' selected' : ''}>${CHORDS[k].label}</option>`).join('')}</select>
        </label>
        <span class="prHint muted">clic = nota (o acorde) · arrastra el borde para alargar/acortar · clic en la nota para borrar</span>
      </div>
```

Tras enganchar `#prUp`/`#prDown`, añade el handler del selector:

```ts
    (root.querySelector('#prChordSel') as HTMLSelectElement).addEventListener('change', e => {
      chordType = (e.target as HTMLSelectElement).value;
    });
```

- [ ] **Step 5: Colocar acorde / borrar nota concreta en `finish`**

Sustituye el cuerpo de `finish` (la parte que decide qué hacer al soltar) por:

```ts
    const finish = (e: PointerEvent): void => {
      if (!ds) return; const d = ds; ds = null; clearPreview();
      try { grid.releasePointerCapture(e.pointerId); } catch { /* ya */ }
      if (!d.moved) {
        if (d.onNote) opts.onClear(d.anchor, d.startM);         // clic en nota → borrar esa nota
        else for (const n of chordNotes(d.startM, chordType))   // clic en hueco → nota o acorde entero
          opts.onPaint(d.anchor, 1, n);
      } else opts.onPaint(d.anchor, d.len, d.startM);            // arrastre → alarga/acorta una sola nota
      draw();
    };
```

- [ ] **Step 6: Typecheck + build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: sin errores; build OK. (La suite no cambia; opcionalmente `npm test` sigue verde.)

- [ ] **Step 7: Commit**

```bash
cd /c/Pianova && git add studio/src/ui/pianoRoll.ts && git commit -m "Estudio acordes: piano-roll polifónico (varias notas por columna) + selector de acorde

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Reproducción + grabación de acordes (`app/studioView.ts`)

**Files:**
- Modify: `studio/src/app/studioView.ts`

**Interfaces:**
- Consumes: `stepNotes`, `noteGate`, `paintNote`, `removeNote`, `setStep` de `../daw/model` (Tasks 1); el nuevo contrato `onClear(headIndex, midi)` del piano-roll (Task 3).

Integración; se verifica con typecheck + build + la suite existente verde + prueba manual.

- [ ] **Step 1: Amplía el import del modelo**

En el `import { ... } from '../daw/model';` (líneas ~28-30), añade `stepNotes`, `noteGate`, `removeNote`:

```ts
  updateChannel, toggleStep, setStep, findChannel, audibleIds, channelSteps, effectiveLen,
  ...
  syncChannelIdSeed, defaultDaw, channelLen, addStepsPage, removeStepsPage, paintNote, stepNotes, noteGate, removeNote
```

(`effectiveLen` puede quedar importado aunque deje de usarse en `onStep`; si el linter marca "no usado", quítalo.)

- [ ] **Step 2: Estado de grabación (apilar/reemplazar)**

Junto a `let recording = false;` (línea ~64), añade:

```ts
  let recLastStep: number | null = null;   // último paso grabado (para agrupar el golpe del acorde)
  let recLastAt = 0;                        // tiempo de audio del último note-on grabado
  const CHORD_WINDOW = 0.06;                // s: note-ons dentro de esta ventana en el mismo paso = un acorde
```

- [ ] **Step 3: Reescribe `recordStep` (apila golpe, reemplaza pasada)**

Sustituye la función `recordStep` (líneas ~191-197) por:

```ts
  function recordStep(m: number, v: number): void {
    const len = channelLen(daw, selectedId);
    const sub = findChannel(daw, selectedId)?.subdiv ?? 4;
    const step = ((Math.round(transport.beatNow() * sub) % len) + len) % len;
    const now = getAudioContext()?.currentTime ?? 0;
    const sameStrike = recLastStep === step && (now - recLastAt) < CHORD_WINDOW;
    if (sameStrike) daw = paintNote(daw, selectedId, step, 1, m, v);          // apila en el acorde
    else daw = setStep(daw, selectedId, step, { on: true, note: m, vel: v }); // reemplaza el acorde de la pasada
    recLastStep = step; recLastAt = now;
    persist(); renderSelected();
  }
```

- [ ] **Step 4: Reescribe la reproducción por acorde en `onStep`**

Sustituye el cuerpo del bucle `for (const c of daw.channels) { ... }` dentro de `onStep` (líneas ~250-272) por:

```ts
      for (const c of daw.channels) {
        if (!audibles.has(c.id)) continue;
        const arr = pat.steps[c.id];
        if (!arr || !arr.length) continue;
        const sub = c.subdiv ?? 4;
        const k = channelStepAt(i, sub, arr.length);          // paso del canal en este tick base (o null)
        if (k === null) continue;
        const notes = stepNotes(arr[k]);
        if (!notes.length) continue;
        const audio = channels.find(a => a.id === c.id);
        const secPerStep = (60 / transport.bpm) / sub;        // duración de un paso de ESTE canal
        const hz = c.humanize ?? 0;
        const h = hz > 0 ? humanizeHit(hz, Math.random) : { dt: 0, dvel: 0 };
        const at = when + swingOffset(k, daw.swing, secPerStep) + h.dt;   // mismo desvío para todo el acorde
        for (const ev of notes) {
          let vel = ev.vel ?? SEQ_VEL;
          if (hz > 0) vel = Math.max(0.05, Math.min(1, vel + h.dvel));
          const gate = c.instrument.kind === 'drum' ? undefined : noteGate(ev.len, k, arr.length) * secPerStep;
          if (audio) audio.trigger(ev.note, vel, at, gate);
        }
        padHits.set(c.id, { t: at, vel: notes[0].vel ?? SEQ_VEL });   // destello del pad (sincronizado al sonido)
        if (c.id === selectedId && c.instrument.kind === 'slicer') {
          const si = sliceIndexForNote(c.instrument.base, c.instrument.slices.length, notes[0].note);
          const sl = c.instrument.slices[si];
          if (sl) sliceHits.push({ index: si, t: at, dur: sl.end - sl.start });
        }
      }
```

- [ ] **Step 5: Cablea `onClear` con la tecla; reset de grabación**

En el montaje del piano-roll (líneas ~355-356), pasa `midi` a `removeNote`:

```ts
        onPaint: (start, len, midi) => { daw = paintNote(daw, selectedId, off + start, len, midi); persist(); },
        onClear: (headIndex, midi) => { daw = removeNote(daw, selectedId, off + headIndex, midi); persist(); },
```

En el handler `onRecord` del transporte (línea ~689), resetea el agrupador al cambiar de estado:

```ts
    onRecord: () => { recording = !recording; recLastStep = null; tUI.setRecording(recording); }
```

En la función de reset ("Nuevo", línea ~733 donde pone `... recording = false;`), añade el reset del agrupador en la misma zona:

```ts
    songMode = false; playPattern = daw.current; songPos = -1; prLow = 48; recording = false; recLastStep = null;
```

- [ ] **Step 6: Typecheck + suite completa + build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: typecheck sin errores; toda la suite existente verde (no cambia de número); build OK.

- [ ] **Step 7: Prueba manual (dev)**

Run: `cd studio && npm run dev`
Comprueba en un canal melódico (PADS → piano-roll): (a) dibujar un acorde nota a nota apila varias notas en la columna; (b) el selector "Acorde: Mayor" coloca 3 notas de un clic; (c) grabar con el teclado un acorde deja todas las notas; (d) una nota larga en una tecla no borra las demás notas de esas columnas; (e) clic sobre una nota borra solo esa.

- [ ] **Step 8: Commit**

```bash
cd /c/Pianova && git add studio/src/app/studioView.ts && git commit -m "Estudio acordes: reproducción por acorde + grabación apilar/reemplazar + cableado piano-roll

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Persistencia (test de ida y vuelta) + docs + versión 0.42.0

**Files:**
- Modify: `studio/src/app/store.test.ts`
- Modify: `CLAUDE.md`, `HANDOFF.md`, `studio/package.json`

**Interfaces:**
- Consumes: `serializeProject`, `parseProject` de `./store`; el campo `extra` del `Step` (Task 1).

- [ ] **Step 1: Test de ida y vuelta de `extra` (falla si algo lo tira)**

En `studio/src/app/store.test.ts`, añade un test que confirme que un paso con acorde sobrevive a serializar/parsear. Usa la forma de proyecto v3 que ya emplean los tests del archivo (mira los casos `version: 3` existentes para el molde exacto de `daw`). Añade:

```ts
  it('conserva un paso con acorde (extra) al serializar y parsear', () => {
    const chId = 'ch-1';
    const step = { on: true, note: 60, len: 1, extra: [{ note: 64 }, { note: 67 }] };
    const project = {
      version: 3,
      daw: {
        channels: [{ id: chId, name: 'Canal', instrument: { kind: 'synth', preset: 'piano' }, volume: 0.8, pan: 0, muted: false, soloed: false, rack: { effects: [] } }],
        patterns: [{ steps: { [chId]: [step] } }],
        current: 0, song: [], bpm: 120, steps: 16, swing: 0, scaleRoot: 0, scaleType: 'chromatic'
      },
      masterRack: { effects: [] }
    };
    const back = parseProject(serializeProject(project as never));
    expect(back.daw.patterns[0].steps[chId][0].extra).toEqual([{ note: 64 }, { note: 67 }]);
  });
```

- [ ] **Step 2: Corre el test (pasa)**

Run: `cd studio && npx vitest run src/app/store.test.ts`
Expected: PASS (el `extra` viaja sin tocar; `dawV3` reenvía `patterns` tal cual). Si fallara, revisa que `serializeProject` no filtre campos de `Step`.

- [ ] **Step 3: Sube la versión a 0.42.0**

En `studio/package.json`, cambia `"version": "0.41.0"` a `"version": "0.42.0"`.

- [ ] **Step 4: Documenta la feature**

En `CLAUDE.md`, al final de la cadena de hitos "Rediseño PIANOVA STUDIO" (tras la entrada de los medidores v0.41.0), añade con el mismo estilo y separador ` · `:

```
· **acordes en el piano-roll (v0.42.0): varias notas por columna** (dibujar nota a nota o con selector de acorde —Mayor/Menor/7ª/Maj7/m7/Sus2/Sus4/Dim/Aum/5ª— y grabar acordes con el teclado: apila el golpe, reemplaza la pasada). Modelo aditivo `extra?: NoteEv[]` en `Step`, sin migración (`daw/model.ts` `stepNotes`/`paintNote` poli/`removeNote` + `daw/chords.ts` + `ui/pianoRoll.ts` + `app/studioView.ts`)
```

En `HANDOFF.md`, añade una entrada de la versión 0.42.0 al inicio del changelog del Estudio, con el mismo estilo que las entradas previas (qué hace + archivos tocados + "sin migración, versión de proyecto 3 intacta").

- [ ] **Step 5: Verificación final + commit**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: todo verde.

```bash
cd /c/Pianova && git add studio/src/app/store.test.ts studio/package.json CLAUDE.md HANDOFF.md && git commit -m "Estudio acordes: test de persistencia (extra) + docs + versión 0.42.0

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notas de integración

- **Compatibilidad de `paintNote`:** ahora acepta un 6º parámetro opcional `vel`. Todos los llamadores actuales lo omiten y siguen funcionando; solo la grabación lo usa.
- **`effectiveLen`** se mantiene (reimplementado sobre `noteGate`) por compatibilidad de tests; `onStep` pasa a usar `noteGate` por nota.
- **Sin cambio de versión de proyecto:** el `extra` es un campo más del `Step`; los proyectos v3 previos se cargan como monofónicos.
- **La batería** (canales `drum`, rejilla `mountStepGrid`/`toggleStep`) no se toca: sigue con un paso on/off.
