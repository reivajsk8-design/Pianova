# Longitud de nota + duplicar patrón — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada nota del piano-roll pueda durar varios pasos (pintar arrastrando) y poder duplicar un patrón para variarlo.

**Architecture:** `Step` gana `len` (pasos; ausente ⇒ 1). El secuenciador calcula una puerta (gate) variable = `len × segundos_por_paso` en vez de la fija 0,12 s; `channel.trigger` y `playSlice` la aceptan. El piano-roll pasa a pointer events (pintar/arrastrar/borrar, notas como barra). Nuevas operaciones puras `paintNote`/`effectiveLen`/`duplicatePattern` en el modelo; botón ⧉ Duplicar en la barra de patrones.

**Tech Stack:** Vite + TypeScript (strict) + Vitest. Web Audio (BufferSource/gain, envolventes). DOM pointer events.

## Global Constraints

- Todo el trabajo en `studio/` (NO tocar `pianova.html`). TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón `var(--pv-acc)`.
- **Longitud por defecto = 1 paso** (compat exacta: proyecto v0.27 sin `len` suena igual). Sin migración.
- El **slicer respeta `len`** (corta el slice con fade); la **batería** ignora la longitud (one-shot).
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build` (ejecutar desde `studio/`).
- Commits con trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Modelo — `len`, `effectiveLen`, `paintNote`, `duplicatePattern` (+ tests)

**Files:**
- Modify: `studio/src/daw/model.ts`
- Modify: `studio/src/daw/model.test.ts`

**Interfaces:**
- Produces:
  - `interface Step { on: boolean; note?: number; vel?: number; len?: number }` (len ausente ⇒ 1).
  - `effectiveLen(steps: Step[], i: number): number` — `clamp(steps[i].len ?? 1, 1, steps.length - i)`.
  - `paintNote(daw: DawState, chId: string, start: number, len: number, note: number): DawState`.
  - `duplicatePattern(daw: DawState, idx: number): DawState`.

- [ ] **Step 1: Escribe los tests que fallan (añadir a `studio/src/daw/model.test.ts`)**

Añade al final del archivo (usa los imports ya presentes; añade `effectiveLen, paintNote, duplicatePattern,
emptySteps` al `import` de `../daw/model` de la cabecera del archivo si faltan):

```ts
describe('longitud de nota', () => {
  it('effectiveLen: len ausente = 1, respeta len válido y recorta al final', () => {
    const s = emptySteps(8);
    expect(effectiveLen(s, 3)).toBe(1);                 // sin len → 1
    s[2] = { on: true, note: 60, len: 3 };
    expect(effectiveLen(s, 2)).toBe(3);                 // len válido
    s[6] = { on: true, note: 60, len: 5 };
    expect(effectiveLen(s, 6)).toBe(2);                 // recorta a steps.length - i = 8 - 6
  });
  it('paintNote coloca con len, limpia lo cubierto, recorta al final y es inmutable', () => {
    const d0 = defaultDaw();                            // 1 canal, 16 pasos
    const id = d0.channels[0].id;
    const d1 = paintNote(d0, id, 2, 4, 64);
    const steps = d1.patterns[0].steps[id];
    expect(steps[2]).toEqual({ on: true, note: 64, len: 4 });
    expect(steps[3].on).toBe(false);                    // cubierto → limpio
    expect(steps[5].on).toBe(false);
    expect(steps[6].on).toBe(false);                    // fuera del span, seguía apagado
    expect(d0.patterns[0].steps[id][2].on).toBe(false); // original intacto (inmutable)
    const d2 = paintNote(d0, id, 14, 8, 60);            // len 8 desde el paso 14 → recorta a 2
    expect(d2.patterns[0].steps[id][14].len).toBe(2);
  });
});

describe('duplicatePattern', () => {
  it('inserta tras el índice, copia profunda independiente y deja current en el nuevo', () => {
    const d0 = defaultDaw();
    const id = d0.channels[0].id;
    const dP = paintNote(d0, id, 0, 2, 60);             // patrón 0 con una nota
    const dup = duplicatePattern(dP, 0);
    expect(dup.patterns.length).toBe(2);
    expect(dup.current).toBe(1);                        // encima del nuevo
    expect(dup.patterns[1].steps[id][0]).toEqual({ on: true, note: 60, len: 2 });
    dup.patterns[1].steps[id][0].note = 72;            // mutar la copia…
    expect(dup.patterns[0].steps[id][0].note).toBe(60); // …no afecta al original (copia profunda)
  });
  it('reindexa la canción y no hace nada si el índice está fuera de rango', () => {
    let d = addPattern(defaultDaw());                   // 2 patrones (0,1)
    d = setSong(d, [0, 1]);
    const dup = duplicatePattern(d, 0);                 // inserta en pos 1 → el antiguo 1 pasa a 2
    expect(dup.song).toEqual([0, 2]);
    expect(duplicatePattern(d, 9)).toBe(d);             // fuera de rango → mismo objeto
  });
});
```

- [ ] **Step 2: Ejecuta los tests para verlos fallar**

Run: `cd studio && npm test -- model`
Expected: FAIL (`effectiveLen`/`paintNote`/`duplicatePattern` no existen).

- [ ] **Step 3: Implementa en `studio/src/daw/model.ts`**

(a) Añade `len` a `Step`:

```ts
export interface Step { on: boolean; note?: number; vel?: number; len?: number }   // len ausente ⇒ 1 paso
```

(b) Añade estas funciones (junto a `setStep`/`toggleStep`):

```ts
// Longitud real de la nota que empieza en `i`: su `len` (o 1) recortado al final del canal.
export function effectiveLen(steps: Step[], i: number): number {
  const raw = steps[i]?.len ?? 1;
  return Math.max(1, Math.min(raw, steps.length - i));
}

// Coloca/alarga una nota en el patrón actual: fija el paso `start` (on+note+len recortado) y LIMPIA los pasos
// cubiertos start+1 … start+len-1 (monofónico: "pintar gana"). Conserva `vel` si lo había. Inmutable.
export function paintNote(daw: DawState, chId: string, start: number, len: number, note: number): DawState {
  return {
    ...daw,
    patterns: daw.patterns.map((p, idx) => {
      if (idx !== daw.current) return p;
      const cur = p.steps[chId] ?? emptySteps(daw.steps);
      const L = Math.max(1, Math.min(len, cur.length - start));
      const steps = cur.slice();
      steps[start] = { ...steps[start], on: true, note, len: L };
      for (let k = start + 1; k < start + L; k++) steps[k] = { ...steps[k], on: false };
      return { steps: { ...p.steps, [chId]: steps } };
    })
  };
}

// Duplica el patrón `idx`: inserta una COPIA PROFUNDA justo detrás y deja `current` en el nuevo. Los patrones
// tras `idx` se desplazan +1, así que la canción reindexa (p > idx → p+1). Fuera de rango: devuelve `daw`.
export function duplicatePattern(daw: DawState, idx: number): DawState {
  if (idx < 0 || idx >= daw.patterns.length) return daw;
  const copy: Record<string, Step[]> = {};
  const src = daw.patterns[idx].steps;
  for (const id of Object.keys(src)) copy[id] = src[id].map(s => ({ ...s }));
  const patterns = [...daw.patterns.slice(0, idx + 1), { steps: copy }, ...daw.patterns.slice(idx + 1)];
  const song = daw.song.map(p => (p > idx ? p + 1 : p));
  return { ...daw, patterns, current: idx + 1, song };
}
```

- [ ] **Step 4: Ejecuta los tests para verlos pasar**

Run: `cd studio && npm test -- model`
Expected: PASS (los nuevos + los previos).

- [ ] **Step 5: typecheck + build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add studio/src/daw/model.ts studio/src/daw/model.test.ts
git commit -m "Estudio notas: Step.len + effectiveLen/paintNote/duplicatePattern (puros) + tests"
```

---

### Task 2: Motor — puerta variable en `trigger`, `playSlice` y `onStep`

**Files:**
- Modify: `studio/src/daw/channel.ts`
- Modify: `studio/src/audio/slicer.ts`
- Modify: `studio/src/app/studioView.ts`

**Interfaces:**
- Consumes: `effectiveLen` (Task 1).
- Produces:
  - `Channel.trigger(note: number, vel: number, when: number, gate?: number): void` (gate en segundos; sin él ⇒ 0.12).
  - `playSlice(dest, buffer, slice, when, vel, maxDur?: number): void` (recorta la duración con fade si `maxDur < dur`).

Sin test unitario nuevo (Web Audio) — verificado por typecheck + build.

- [ ] **Step 1: `studio/src/daw/channel.ts` — gate en `trigger`**

En la interfaz `Channel` cambia la firma de `trigger`:

```ts
  trigger(note: number, vel: number, when: number, gate?: number): void;
```

En el objeto devuelto, reemplaza el método `trigger` por:

```ts
    trigger(note, vel, when, gate) {
      if (instrument.kind === 'drum') triggerDrum(actx, instrumentBus, instrument.voice as DrumVoice, when, vel);
      else if (instrument.kind === 'synthx') triggerSynthx(actx, instrument.params, note, vel, when, gate ?? 0.12, instrumentBus);
      else if (instrument.kind === 'slicer') {
        const s = getSample(instrument.sampleId);
        const idx = sliceIndexForNote(instrument.base, instrument.slices.length, note);
        if (s && s.buffer && idx >= 0) playSlice(instrumentBus, s.buffer, instrument.slices[idx], when, vel, gate);
      }
      else synth.triggerPreset(instrument.preset, note, vel, when, gate ?? 0.12, instrumentBus);
    },
```

- [ ] **Step 2: `studio/src/audio/slicer.ts` — `maxDur` con fade anti-clic**

Reemplaza la firma y el cuerpo de `playSlice` por:

```ts
export function playSlice(dest: AudioNode | null, buffer: AudioBuffer, slice: SliceDef, when: number, vel: number, maxDur?: number): void {
  const actx = ensureAudio();
  const out = dest ?? masterDest();
  const full = Math.max(0.005, slice.end - slice.start);
  const cut = maxDur != null && maxDur < full;                 // ¿recortado por la longitud de la nota?
  const dur = cut ? Math.max(0.005, maxDur as number) : full;
  const useBuf = slice.reverse ? reversed(actx, buffer) : buffer;
  const offset = slice.reverse ? Math.max(0, buffer.duration - slice.end) : slice.start;
  const src = actx.createBufferSource(); src.buffer = useBuf;
  const g = actx.createGain();
  const peak = Math.max(0.0002, slice.gain * Math.max(0.05, vel));
  const fi = Math.min(slice.fadeIn, dur / 2);
  const fo = cut ? Math.min(0.01, dur / 4) : Math.min(slice.fadeOut, dur / 2);   // recorte → fade corto anti-clic
  const t = when;
  g.gain.setValueAtTime(fi > 0 ? 0.0001 : peak, t);
  if (fi > 0) g.gain.linearRampToValueAtTime(peak, t + fi);
  if (fo > 0) { g.gain.setValueAtTime(peak, t + dur - fo); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
  src.connect(g); g.connect(out);
  src.start(t, offset, dur);
  src.stop(t + dur + 0.02);
}
```

- [ ] **Step 3: `studio/src/app/studioView.ts` — gate variable en `onStep`**

(a) Añade `effectiveLen` al import de `../daw/model` (línea ~23-28), junto a `channelSteps`:

```ts
  updateChannel, toggleStep, setStep, findChannel, audibleIds, channelSteps, effectiveLen,
```

(b) En `onStep`, sustituye el bloque del disparo. Hoy es:

```ts
        const arr = pat.steps[c.id];
        const st = (arr && arr.length) ? arr[i % arr.length] : undefined;   // cada canal repite a su longitud
        if (!st || !st.on) continue;
        const audio = channels.find(a => a.id === c.id);
        const secPerStep = (60 / transport.bpm) / STEPS_PER_BEAT;
        const vel = st.vel ?? SEQ_VEL;
        const at = when + swingOffset(i, daw.swing, secPerStep);
        if (audio) audio.trigger(st.note ?? 60, vel, at);
```

Déjalo así (calcula `gate` salvo en batería):

```ts
        const arr = pat.steps[c.id];
        if (!arr || !arr.length) continue;
        const j = i % arr.length;                          // cada canal repite a su longitud
        const st = arr[j];
        if (!st || !st.on) continue;
        const audio = channels.find(a => a.id === c.id);
        const secPerStep = (60 / transport.bpm) / STEPS_PER_BEAT;
        const vel = st.vel ?? SEQ_VEL;
        const at = when + swingOffset(i, daw.swing, secPerStep);
        const gate = c.instrument.kind === 'drum' ? undefined : effectiveLen(arr, j) * secPerStep;
        if (audio) audio.trigger(st.note ?? 60, vel, at, gate);
```

(El resto del cuerpo del `for` — `padHits.set(...)`, el bloque del slicer con `st.note` — sigue igual; ahora
usa `st` y `j` ya definidos arriba.)

- [ ] **Step 4: typecheck + test + build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: PASS (138 tests + los nuevos de Task 1 siguen verdes).

- [ ] **Step 5: Commit**

```bash
git add studio/src/daw/channel.ts studio/src/audio/slicer.ts studio/src/app/studioView.ts
git commit -m "Estudio notas: puerta variable (gate=len·paso) en trigger/playSlice/onStep; batería one-shot"
```

---

### Task 3: Piano-roll — pintar/arrastrar/borrar + notas como barra (+ CSS + cableado)

**Files:**
- Modify: `studio/src/ui/pianoRoll.ts` (reescritura del render + interacción)
- Modify: `studio/src/app/studioView.ts` (nuevos callbacks `onPaint`/`onClear`)
- Modify: `studio/src/ui/styles.css` (barra `.cont`/`.head`/`.pvsel`)

**Interfaces:**
- Consumes: `paintNote` y `setStep` (modelo); `Step` (para `getStep`).
- Produce: `mountPianoRoll(root, opts)` con opts
  `{ total, lowMidi, scaleRoot, scaleType, getStep, onPaint(start,len,midi), onClear(headIndex), onRange }`.
  Devuelve `{ setPlayhead, setLiveNotes }` (contrato sin cambios).

Sin test unitario (DOM/pointer) — verificado por typecheck + build + prueba manual.

- [ ] **Step 1: Reescribe `studio/src/ui/pianoRoll.ts`**

```ts
// studio/src/ui/pianoRoll.ts
// Mini piano-roll por canal: filas = notas (~2 octavas), columnas = pasos. Monofónico por paso, con LONGITUD:
// una nota empieza en un paso y ocupa `len` pasos (se dibuja como barra). Clic simple = nota de 1 paso;
// pinchar y arrastrar a la derecha = alargar; clic sobre una nota = borrarla. Resalta la escala (informativo).
import type { Step } from '../daw/model';
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
    total: number; lowMidi: number; scaleRoot: number; scaleType: string;
    getStep: (i: number) => Step | undefined;
    onPaint: (start: number, len: number, midi: number) => void;   // colocar/alargar
    onClear: (headIndex: number) => void;                          // borrar la nota cuyo head está aquí
    onRange: (lowMidi: number) => void;
  }
): PianoRollUI {
  let low = Math.max(0, Math.min(127 - ROWS, opts.lowMidi));
  let live = new Set<number>();
  // Arrastre en curso: paso de inicio, nota de la fila, head bajo el inicio (o null), paso final, si hubo arrastre.
  let ds: { startI: number; startM: number; head: number | null; end: number; moved: boolean } | null = null;

  // Celdas de la fila `midi`: cabeza (.on.head) + cuerpo cubierto (.cont). data-head apunta al paso de la cabeza.
  function rowCells(midi: number): string {
    let cells = '', coverUntil = -1, coverHead = -1;
    for (let i = 0; i < opts.total; i++) {
      const st = opts.getStep(i);
      const isHead = !!(st && st.on && (st.note ?? 60) === midi);
      let cls = '';
      let head = -1;
      if (isHead) {
        const len = Math.max(1, Math.min(st!.len ?? 1, opts.total - i));
        coverUntil = i + len - 1; coverHead = i; cls = ' on head'; head = i;
      } else if (i <= coverUntil) { cls = ' cont'; head = coverHead; }
      const hAttr = head >= 0 ? ` data-head="${head}"` : '';
      cells += `<div class="prCell${i % 4 === 0 ? ' beat' : ''}${cls}" data-i="${i}" data-m="${midi}"${hAttr}></div>`;
    }
    return cells;
  }

  function draw(): void {
    let rows = '';
    for (let r = 0; r < ROWS; r++) {
      const midi = low + (ROWS - 1 - r);                 // agudo arriba, grave abajo
      const cls = (BLACK.has(((midi % 12) + 12) % 12) ? ' black' : '') +
                  ((opts.scaleType !== 'chromatic' && inScale(midi, opts.scaleRoot, opts.scaleType)) ? ' inscale' : '');
      const liveCls = live.has(midi) ? ' live' : '';
      rows += `<div class="prRow${cls}${liveCls}" data-m="${midi}"><span class="prLabel">${noteName(midi)}</span><div class="prCells">${rowCells(midi)}</div></div>`;
    }
    root.innerHTML = `<div class="pr">
      <div class="prTools">
        <button class="chBtn" id="prUp" title="Subir una octava">▲</button>
        <button class="chBtn" id="prDown" title="Bajar una octava">▼</button>
        <span class="prHint muted">clic = nota de 1 paso · arrastra ▸ para alargar · clic en la nota para borrar</span>
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
    const clearPreview = (): void => grid.querySelectorAll('.prCell.pvsel').forEach(c => c.classList.remove('pvsel'));
    const showPreview = (m: number, from: number, to: number): void => {
      clearPreview();
      grid.querySelectorAll<HTMLElement>(`.prCell[data-m="${m}"]`).forEach(c => {
        const i = +(c.dataset.i ?? '-1'); if (i >= from && i <= to) c.classList.add('pvsel');
      });
    };
    const cellAt = (x: number, y: number): HTMLElement | null => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      return (el && el.closest('.prCell')) as HTMLElement | null;
    };

    grid.addEventListener('pointerdown', e => {
      const cell = (e.target as HTMLElement).closest('.prCell') as HTMLElement | null; if (!cell) return;
      const i = +(cell.dataset.i ?? '0'), m = +(cell.dataset.m ?? '60');
      ds = { startI: i, startM: m, head: cell.dataset.head != null ? +cell.dataset.head : null, end: i, moved: false };
      try { grid.setPointerCapture(e.pointerId); } catch { /* ya */ }
      showPreview(m, i, i);
    });
    grid.addEventListener('pointermove', e => {
      if (!ds) return;
      const cell = cellAt(e.clientX, e.clientY);
      if (!cell || +(cell.dataset.m ?? '-1') !== ds.startM) return;
      const i = +(cell.dataset.i ?? '0');
      if (i > ds.startI) { ds.end = i; ds.moved = true; }
      showPreview(ds.startM, ds.startI, Math.max(ds.startI, ds.end));
    });
    const finish = (e: PointerEvent): void => {
      if (!ds) return; const d = ds; ds = null; clearPreview();
      try { grid.releasePointerCapture(e.pointerId); } catch { /* ya */ }
      if (!d.moved) {
        if (d.head != null) opts.onClear(d.head);         // tocar una nota (cabeza o cuerpo) → borrar
        else opts.onPaint(d.startI, 1, d.startM);          // tocar hueco → nota de 1 paso
      } else opts.onPaint(d.startI, d.end - d.startI + 1, d.startM);   // arrastre → nota de ese largo
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

- [ ] **Step 2: Cablea los nuevos callbacks en `studio/src/app/studioView.ts`**

(a) Añade `paintNote` al import de `../daw/model` (junto a `setStep`):

```ts
  syncChannelIdSeed, defaultDaw, channelLen, addStepsPage, removeStepsPage, paintNote
```

(b) Sustituye el objeto de opciones de `mountPianoRoll` (hoy con `onSetNote`) por:

```ts
      const pr = mountPianoRoll(stepsHost, {
        total: PAGE, lowMidi: prLow, scaleRoot: daw.scaleRoot, scaleType: daw.scaleType,
        getStep: (i) => channelSteps(daw, selectedId)[off + i],
        onPaint: (start, len, midi) => { daw = paintNote(daw, selectedId, off + start, len, midi); persist(); },
        onClear: (headIndex) => { daw = setStep(daw, selectedId, off + headIndex, { on: false }); persist(); },
        onRange: (lo) => { prLow = lo; }
      });
```

- [ ] **Step 3: CSS de la barra en `studio/src/ui/styles.css`**

Tras la línea `.prCell.on.play{...}` (≈ línea 221), añade:

```css
.prCell.cont{background:var(--pv-acc);box-shadow:0 0 6px var(--pv-acc-dim) inset;opacity:.85}
.prCell.on.head,.prCell.cont{border-right-color:transparent}   /* unir la barra (sin línea interior) */
.prCell.pvsel{background:rgba(45,255,106,.4)}                   /* vista previa al arrastrar */
```

- [ ] **Step 4: typecheck + test + build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Prueba manual (a vista/oído)**

Run: `cd studio && npm run dev` y abre la URL:
1. Canal synth: **clic** en una celda → nota de 1 paso (como antes).
2. **Pincha y arrastra a la derecha** → la nota se dibuja como **barra** y, al reproducir, **suena más larga**.
3. **Clic** sobre una nota (cabeza o cuerpo) → se borra.
4. Pintar sobre notas existentes las **limpia** (monofónico). Táctil: igual con el dedo.
5. Canal **slicer**: una nota larga alarga el slice; una corta lo **recorta con fade** (sin chasquido).

- [ ] **Step 6: Commit**

```bash
git add studio/src/ui/pianoRoll.ts studio/src/app/studioView.ts studio/src/ui/styles.css
git commit -m "Estudio notas: piano-roll pintar/arrastrar/borrar con notas como barra (pointer events) + CSS"
```

---

### Task 4: Botón ⧉ Duplicar patrón

**Files:**
- Modify: `studio/src/ui/patternbar.ts`
- Modify: `studio/src/app/studioView.ts`

**Interfaces:**
- Consumes: `duplicatePattern` (Task 1).

Sin test unitario (UI) — verificado por typecheck + build + prueba manual.

- [ ] **Step 1: Botón en `studio/src/ui/patternbar.ts`**

Entre el botón `data-patadd` (＋) y `data-patdel` (✕), añade:

```html
    <button class="patIcon" data-patdup title="Duplicar patrón actual">⧉</button>
```

Es decir, el bloque queda:

```ts
    <button class="patIcon" data-patadd title="Añadir patrón">＋</button>
    <button class="patIcon" data-patdup title="Duplicar patrón actual">⧉</button>
    <button class="patIcon" data-patdel title="Quitar patrón actual">✕</button>
```

- [ ] **Step 2: Manejador en `studio/src/app/studioView.ts`**

(a) Añade `duplicatePattern` al import de `../daw/model` (junto a `addPattern`):

```ts
  addPattern, duplicatePattern, removePattern, setCurrentPattern, setSong, defaultSynthxInstrument, defaultSlicerInstrument,
```

(b) En la delegación de eventos, junto a la línea de `data-patadd`, añade:

```ts
    if (t.hasAttribute('data-patdup')) { daw = duplicatePattern(daw, daw.current); persist(); renderSelected(); renderPatternBar(); return; }
```

- [ ] **Step 3: typecheck + build + prueba**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS. En la URL: crea una melodía en el patrón 1, pulsa **⧉** → aparece el patrón 2 idéntico y quedas
encima; cambia unas notas y ambos patrones coexisten (útil para variaciones + modo canción).

- [ ] **Step 4: Commit**

```bash
git add studio/src/ui/patternbar.ts studio/src/app/studioView.ts
git commit -m "Estudio patrones: botón ⧉ Duplicar patrón (copia para variar)"
```

---

### Task 5: Docs y versión

**Files:**
- Modify: `studio/package.json` (version → `0.28.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.28.0"`.

- [ ] **Step 2: HANDOFF.md**

Añade en la zona de estado del Estudio (cerca de las entradas del EQ / piano-roll):

```markdown
**Estudio · longitud de nota + duplicar patrón (v0.28.0):** cada nota del piano-roll puede durar varios pasos.
`Step` gana `len` (pasos; ausente ⇒ 1); el secuenciador usa una puerta variable **gate = len × segundos_por_paso**
en vez de la fija 0,12 s (`channel.trigger`/`playSlice` la aceptan; batería one-shot, slicer recorta con fade).
En el piano-roll se **pinta arrastrando** (clic = 1 paso, arrastrar ▸ = barra, clic en la nota = borrar; pointer
events, monofónico) — `daw/model.ts` `effectiveLen`/`paintNote`, `ui/pianoRoll.ts`. Nuevo botón **⧉ Duplicar
patrón** (`duplicatePattern`, copia profunda + reindexa la canción). Compat v0.27 → `len` 1 (mismo sonido).
```

- [ ] **Step 3: CLAUDE.md**

En la sección del Estudio (decisión 5), tras la entrada del EQ mid/side, añade: **longitud de nota + duplicar
patrón (v0.28.0): notas de varios pasos en el piano-roll (pintar arrastrando; `Step.len`, puerta variable
`gate=len·paso`; slicer recorta con fade, batería one-shot) y botón ⧉ Duplicar patrón** (`daw/model.ts`
`effectiveLen`/`paintNote`/`duplicatePattern` + `ui/pianoRoll.ts` + `ui/patternbar.ts`; compat v0.27).

- [ ] **Step 4: Verifica y commitea**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio notas: docs (HANDOFF/CLAUDE) y versión 0.28.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- `Step.len` + `effectiveLen` + `paintNote` + `duplicatePattern` + tests → Task 1 ✅
- Motor: gate variable en `trigger`/`playSlice`/`onStep`, slicer recorta con fade, batería one-shot → Task 2 ✅
- Piano-roll pintar/arrastrar/borrar + barra + pointer events + cableado `onPaint`/`onClear` + CSS → Task 3 ✅
- Botón ⧉ Duplicar patrón → Task 4 ✅
- Persistencia sin migración (`len` viaja en el Step; ausente ⇒ 1) → cubierto por Task 1 (modelo) + serialización
  existente; sin cambios de esquema necesarios ✅
- Docs/versión → Task 5 ✅

**Placeholders:** ninguno; el código va completo (modelo, motor, piano-roll, botón).

**Consistencia de tipos:** `Step.len?` (Task 1) lo leen `effectiveLen`/render (Tasks 1,3). `trigger(note,vel,when,gate?)`
(Task 2) lo llama `onStep` con `gate` de `effectiveLen·secPerStep` (Task 2). `playSlice(...,maxDur?)` (Task 2) se
llama desde `trigger` con `gate` (Task 2). `mountPianoRoll` pasa de `onSetNote` a `onPaint(start,len,midi)` +
`onClear(headIndex)` (Task 3), consumidos en studioView con `paintNote`/`setStep` (Tasks 1,3). `duplicatePattern`
(Task 1) lo usa el botón (Task 4). Nombres coherentes en todas las tareas.

**Estado intermedio válido:** Task 1 (modelo puro) compila/testea solo; Task 2 usa `effectiveLen` ya existente;
Task 3 cambia el contrato del piano-roll y su único consumidor (studioView) a la vez → compila; Task 4 añade UI
sobre `duplicatePattern` ya existente; Task 5 docs. Cada tarea deja el build verde.

**Decisión consciente:** el render del piano-roll recorta la barra a la página visible (`opts.total`), no al
canal completo; como `paintNote` ya limpia los pasos cubiertos y recorta `len` al final del canal, no hace falta
recalcular por "siguiente nota" en tiempo real. La grabación en vivo sigue con `len` 1 (fuera de alcance).
