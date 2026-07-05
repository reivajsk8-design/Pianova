# Iluminación reactiva del Estudio — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar realimentación visual "pro" de qué suena: los pads destellan (más brillo cuanto más fuerte el golpe) durante la reproducción y al tocar en vivo, y en la pestaña SAMPLES el slice que suena se resalta con una línea-cursor recorriendo su onda.

**Architecture:** No se toca el motor de audio. El `studioView` registra cada disparo real (`onStep`, `playLive`, `testSlice`) en un bus de golpes en memoria; un bucle `requestAnimationFrame` lee el reloj de audio y pinta la iluminación (variable CSS `--hit` en los pads; overlay de cursor en el canvas del editor). La matemática vive en un módulo puro y testeado `ui/hitViz.ts`.

**Tech Stack:** Vite + TypeScript (strict) + Vitest. Web Audio. Canvas 2D. Sin framework de UI.

## Global Constraints

- Todo el trabajo en `studio/` (NO tocar `pianova.html`). TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón vía variable existente `var(--pv-acc)` (`#2dff6a`).
- No cambiar el motor de audio ni el enrutado: esto es estado en memoria + pintado + cableado.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build` (comandos siempre desde `studio/`).

---

### Task 1: Helpers puros de iluminación (`ui/hitViz.ts`)

**Files:**
- Create: `studio/src/ui/hitViz.ts`
- Create: `studio/src/ui/hitViz.test.ts`

**Interfaces:**
- Produces:
  - `interface PadHit { t: number; vel: number }` (t = tiempo de audio en s; vel = 0–127).
  - `interface SliceHit { index: number; t: number; dur: number }` (dur en s).
  - `interface ActiveSlice { index: number; progress: number }` (progress 0–1).
  - `flashLevel(ageSec: number, velNorm: number, fadeSec: number): number` — brillo 0–1.
  - `sliceProgress(nowSec: number, startSec: number, durSec: number): number` — `(now-start)/dur` sin acotar; `dur<=0` → 1.
  - `padLevel(hit: PadHit | undefined, nowSec: number, fadeSec: number): number` — brillo 0–1 del último golpe.
  - `activeSlices(hits: SliceHit[], nowSec: number): ActiveSlice[]` — los que tienen progress en `[0,1)`.

- [ ] **Step 1: Write the failing test**

Crea `studio/src/ui/hitViz.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { flashLevel, sliceProgress, padLevel, activeSlices } from './hitViz';

describe('flashLevel', () => {
  it('golpe recién dado a velocity máxima ≈ 1', () => {
    expect(flashLevel(0, 1, 0.15)).toBeCloseTo(1, 5);
  });
  it('a mitad de la ventana decae a la mitad', () => {
    expect(flashLevel(0.075, 1, 0.15)).toBeCloseTo(0.5, 5);
  });
  it('velocity baja mantiene un suelo visible (0.45 a edad 0)', () => {
    expect(flashLevel(0, 0, 0.15)).toBeCloseTo(0.45, 5);
  });
  it('fuera de la ventana o edad negativa = 0', () => {
    expect(flashLevel(0.15, 1, 0.15)).toBe(0);
    expect(flashLevel(0.2, 1, 0.15)).toBe(0);
    expect(flashLevel(-0.01, 1, 0.15)).toBe(0);
    expect(flashLevel(0, 1, 0)).toBe(0);
  });
  it('acota velNorm fuera de 0..1', () => {
    expect(flashLevel(0, 5, 0.15)).toBeCloseTo(1, 5);
    expect(flashLevel(0, -5, 0.15)).toBeCloseTo(0.45, 5);
  });
});

describe('sliceProgress', () => {
  it('devuelve la fracción recorrida', () => {
    expect(sliceProgress(10, 10, 2)).toBe(0);
    expect(sliceProgress(11, 10, 2)).toBe(0.5);
    expect(sliceProgress(12, 10, 2)).toBe(1);
  });
  it('antes de empezar es negativo', () => {
    expect(sliceProgress(9, 10, 2)).toBeLessThan(0);
  });
  it('dur <= 0 → 1 (inactivo)', () => {
    expect(sliceProgress(10, 10, 0)).toBe(1);
    expect(sliceProgress(10, 10, -1)).toBe(1);
  });
});

describe('padLevel', () => {
  it('sin golpe = 0', () => {
    expect(padLevel(undefined, 5, 0.15)).toBe(0);
  });
  it('usa la edad y la velocity del golpe', () => {
    expect(padLevel({ t: 5, vel: 127 }, 5, 0.15)).toBeCloseTo(1, 5);
    expect(padLevel({ t: 5, vel: 127 }, 5.2, 0.15)).toBe(0);   // ya caducó
  });
});

describe('activeSlices', () => {
  it('devuelve solo los slices con progress en [0,1) y su progreso', () => {
    const hits = [
      { index: 0, t: 10, dur: 2 },   // now=11 → 0.5 activo
      { index: 3, t: 8, dur: 1 },    // now=11 → 3 (caducado)
      { index: 5, t: 12, dur: 2 }    // now=11 → -0.5 (aún no)
    ];
    expect(activeSlices(hits, 11)).toEqual([{ index: 0, progress: 0.5 }]);
  });
  it('sin golpes activos → array vacío', () => {
    expect(activeSlices([], 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd studio && npm test -- hitViz`
Expected: FAIL (no existe `./hitViz`).

- [ ] **Step 3: Create the implementation**

Crea `studio/src/ui/hitViz.ts`:

```ts
// studio/src/ui/hitViz.ts
// Matemática pura de la iluminación reactiva (destello de pads + progreso de slices).
// Sin estado ni DOM: fácil de testear. La consume studioView (pads/slices) y sampleEditor (cursor).

export interface PadHit { t: number; vel: number }          // t: tiempo de audio (s); vel: 0–127
export interface SliceHit { index: number; t: number; dur: number }   // dur: duración audible (s)
export interface ActiveSlice { index: number; progress: number }      // progress: 0–1

// Brillo 0–1 de un destello: decae linealmente sobre `fadeSec`; escala por velocity con suelo y techo.
export function flashLevel(ageSec: number, velNorm: number, fadeSec: number): number {
  if (fadeSec <= 0 || ageSec < 0 || ageSec >= fadeSec) return 0;
  const decay = 1 - ageSec / fadeSec;                 // 1 → 0
  const v = Math.max(0, Math.min(1, velNorm));
  const scale = 0.45 + 0.55 * v;                      // suelo 0.45 (golpe suave visible), techo 1
  return decay * scale;
}

// Progreso del recorrido de un slice: (now-start)/dur, SIN acotar. Activo si está en [0,1).
// dur <= 0 → 1 (inactivo).
export function sliceProgress(nowSec: number, startSec: number, durSec: number): number {
  if (durSec <= 0) return 1;
  return (nowSec - startSec) / durSec;
}

// Brillo 0–1 de un pad a partir de su último golpe (o 0 si no hay).
export function padLevel(hit: PadHit | undefined, nowSec: number, fadeSec: number): number {
  if (!hit) return 0;
  return flashLevel(nowSec - hit.t, hit.vel / 127, fadeSec);
}

// Slices activos (progress en [0,1)) con su progreso, a partir de los golpes registrados.
export function activeSlices(hits: SliceHit[], nowSec: number): ActiveSlice[] {
  const out: ActiveSlice[] = [];
  for (const h of hits) {
    const p = sliceProgress(nowSec, h.t, h.dur);
    if (p >= 0 && p < 1) out.push({ index: h.index, progress: p });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd studio && npm test -- hitViz`
Expected: PASS (los 4 describe).

- [ ] **Step 5: Full check + commit**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS.

```bash
git add studio/src/ui/hitViz.ts studio/src/ui/hitViz.test.ts
git commit -m "Estudio iluminación: helpers puros hitViz (destello + progreso de slice) + tests"
```

---

### Task 2: Destello de pads (bucle visual + CSS) (`app/studioView.ts` + `ui/styles.css`)

**Files:**
- Modify: `studio/src/app/studioView.ts`
- Modify: `studio/src/ui/styles.css`

**Interfaces:**
- Consumes: `padLevel`, `PadHit` (Task 1).
- Produces: bus `padHits` + bucle `visualTick`/`ensureVisualLoop` que pinta la variable CSS `--hit` (0–1) en cada `[data-pad]` de `#padGrid`; se alimenta en `onStep` (reproducción) y `playLive` (teclado en vivo); se limpia al parar.

Integración (DOM); sin test unitario. Verificado por typecheck + build + prueba a ojo.

- [ ] **Step 1: Import de los helpers**

En `studio/src/app/studioView.ts`, añade bajo el import de `makeChannel`:

```ts
import { padLevel, type PadHit } from '../ui/hitViz';
```

- [ ] **Step 2: Estado del bus de golpes**

Justo después de la línea `let selGrid: { setPlayhead: (s: number) => void } | null = null;` (≈línea 100), añade:

```ts
  const padHits = new Map<string, PadHit>();   // último golpe por canal (para el destello)
  const PAD_FADE = 0.15;                        // s que dura el destello
  let visRaf = 0;                               // rAF del bucle visual (0 = parado)
```

- [ ] **Step 3: Registrar el golpe en `onStep`**

En el `onStep` del secuenciador, sustituye el bucle `for (const c of daw.channels) { ... }` (el que dispara el audio) por esta versión (añade `padHits.set`):

```ts
      for (const c of daw.channels) {
        if (!audibles.has(c.id)) continue;
        const st = pat.steps[c.id]?.[i];
        if (!st || !st.on) continue;
        const audio = channels.find(a => a.id === c.id);
        const secPerStep = (60 / transport.bpm) / STEPS_PER_BEAT;
        const vel = st.vel ?? SEQ_VEL;
        const at = when + swingOffset(i, daw.swing, secPerStep);
        if (audio) audio.trigger(st.note ?? 60, vel, at);
        padHits.set(c.id, { t: at, vel });                  // destello del pad, sincronizado al sonido
      }
```

- [ ] **Step 4: Registrar el golpe en vivo en `playLive`**

En `playLive(m, v)`, justo antes de la línea `if (recording && seq.isPlaying()) recordStep(m, v);`, añade:

```ts
    const nowT = getAudioContext()?.currentTime;
    if (nowT !== undefined) { padHits.set(selectedId, { t: nowT, vel: v }); ensureVisualLoop(); }
```

- [ ] **Step 5: Reemplazar `playhead()` por el bucle visual**

Sustituye el bloque actual:

```ts
  let phRaf = 0;
  function playhead(): void {
    const s = ((Math.floor(transport.beatNow() * STEPS_PER_BEAT) % daw.steps) + daw.steps) % daw.steps;
    selGrid?.setPlayhead(s);
    phRaf = requestAnimationFrame(playhead);
  }
```

por:

```ts
  function paintPads(now: number): void {
    const grid = root.querySelector('#padGrid'); if (!grid) return;
    grid.querySelectorAll<HTMLElement>('[data-pad]').forEach(el => {
      const lvl = padLevel(padHits.get(el.dataset.pad ?? ''), now, PAD_FADE);
      el.style.setProperty('--hit', lvl.toFixed(3));
    });
  }
  function clearPads(): void {
    root.querySelectorAll<HTMLElement>('#padGrid [data-pad]').forEach(el => el.style.setProperty('--hit', '0'));
  }
  function visualTick(): void {
    const now = getAudioContext()?.currentTime ?? 0;
    const playing = seq.isPlaying();
    if (playing) {
      const s = ((Math.floor(transport.beatNow() * STEPS_PER_BEAT) % daw.steps) + daw.steps) % daw.steps;
      selGrid?.setPlayhead(s);
    }
    for (const [id, h] of padHits) if (now - h.t >= PAD_FADE) padHits.delete(id);   // poda caducados
    paintPads(now);
    if (playing || padHits.size) visRaf = requestAnimationFrame(visualTick);
    else { visRaf = 0; clearPads(); }
  }
  function ensureVisualLoop(): void { if (!visRaf) visRaf = requestAnimationFrame(visualTick); }
```

- [ ] **Step 6: Arrancar/parar el bucle en el transporte**

En `onPlay`, sustituye `seq.play(); tUI.setPlaying(true); renderPatternBar(); phRaf = requestAnimationFrame(playhead);` por:

```ts
      seq.play(); tUI.setPlaying(true); renderPatternBar(); ensureVisualLoop();
```

En `onStop`, sustituye `seq.stop(); tUI.setPlaying(false); cancelAnimationFrame(phRaf); selGrid?.setPlayhead(-1); songPos = -1; playPattern = daw.current; renderPatternBar();` por:

```ts
    onStop: () => { seq.stop(); tUI.setPlaying(false); selGrid?.setPlayhead(-1); padHits.clear(); clearPads(); songPos = -1; playPattern = daw.current; renderPatternBar(); },
```

(El bucle se detiene solo en el siguiente frame al ver `!playing` y `padHits` vacío.)

- [ ] **Step 7: CSS del destello**

En `studio/src/ui/styles.css`, sustituye la regla `.pvPad{...}` (la que empieza con `background:#141a13;border:1px solid #2b3324;`) por la misma **añadiendo `position:relative`** al final:

```css
.pvPad{background:#141a13;border:1px solid #2b3324;border-radius:8px;min-height:56px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#b7c1b7;letter-spacing:.04em;text-align:center;padding:6px;cursor:pointer;position:relative}
```

Y añade justo debajo (antes de `.pvPad:hover`):

```css
/* Destello reactivo del pad: capa de glow cuya opacidad la fija el bucle visual (--hit 0..1) */
.pvPad::after{content:'';position:absolute;inset:-1px;border-radius:8px;pointer-events:none;box-shadow:0 0 16px 2px var(--pv-acc);opacity:var(--hit,0)}
```

- [ ] **Step 8: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add studio/src/app/studioView.ts studio/src/ui/styles.css
git commit -m "Estudio iluminación: destello de pads por velocity (reproducción + teclado en vivo)"
```

---

### Task 3: Slice activo + cursor sobre la onda (`ui/sampleEditor.ts` + `app/studioView.ts` + CSS)

**Files:**
- Modify: `studio/src/ui/sampleEditor.ts`
- Modify: `studio/src/app/studioView.ts`
- Modify: `studio/src/ui/styles.css`

**Interfaces:**
- Consumes: `activeSlices`, `SliceHit`, `ActiveSlice` (Task 1); `sliceIndexForNote` (ya importado en studioView); `getSample` (ya importado).
- Produces: `mountSampleEditor(...)` devuelve `SampleEditorHandle { setActiveSlices(active: ActiveSlice[]): void }` (antes `void`); `studioView` guarda el handle, registra `sliceHits` en `onStep`/`playLive`/`testSlice`, y en `visualTick` pinta los slices activos (cursor + resalte).

Integración (DOM/canvas); sin test unitario. Verificado por typecheck + tests verdes + build + prueba por vista/oído.

- [ ] **Step 1: Reescribe `ui/sampleEditor.ts` (devuelve handle + onda cacheada + cursor)**

Reemplaza **todo** el contenido de `studio/src/ui/sampleEditor.ts` por:

```ts
// studio/src/ui/sampleEditor.ts
// Editor del canal slicer (pestaña SAMPLES): forma de onda + marcas editables + troceado + probar slice
// + resalte del slice que suena con una línea-cursor recorriendo la onda (iluminación reactiva).
import type { SliceDef } from '../daw/slicing';
import { mountKnob } from './knob';
import type { ActiveSlice } from './hitViz';

export interface SampleEditorHandle {
  setActiveSlices(active: ActiveSlice[]): void;
}

const NOTE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const noteName = (m: number): string => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

export function mountSampleEditor(
  root: HTMLElement,
  opts: {
    buffer: AudioBuffer | null; slices: SliceDef[]; base: number;
    onImport: (file: File) => void; onSliceEqual: (n: number) => void;
    onSliceOnsets: () => void; onTest: (index: number) => void;
    onSetMarks?: (marks: number[]) => void;
    onUpdateSlice?: (index: number, patch: Partial<SliceDef>) => void;
  }
): SampleEditorHandle {
  root.innerHTML = `<div class="smpEd">
    <div class="smpBar">
      <label class="smpBtn">Importar audio…<input id="smpFile" type="file" accept="audio/*" hidden></label>
      <button id="smpOnsets" class="smpBtn" ${opts.buffer ? '' : 'disabled'}>Por transitorios</button>
      <label class="smpBtn">En <select id="smpN"><option>8</option><option selected>16</option><option>32</option></select> iguales
        <button id="smpEqual" ${opts.buffer ? '' : 'disabled'}>Trocear</button></label>
    </div>
    ${opts.buffer ? '<canvas id="smpWave" class="smpWave" width="900" height="120"></canvas>' : '<p class="muted">Importa un audio para trocearlo en slices.</p>'}
    ${opts.buffer ? '<p class="smpHint muted">Arrastra una marca para moverla · doble-clic en un hueco para añadir · clic derecho en una marca para borrar</p>' : ''}
    <div id="smpList" class="smpList"></div>
    <div id="smpSlicePanel" class="smpSlicePanel"></div>
  </div>`;

  (root.querySelector('#smpFile') as HTMLInputElement | null)?.addEventListener('change', ev => {
    const f = (ev.target as HTMLInputElement).files?.[0]; if (f) opts.onImport(f);
  });
  (root.querySelector('#smpOnsets') as HTMLButtonElement | null)?.addEventListener('click', () => opts.onSliceOnsets());
  (root.querySelector('#smpEqual') as HTMLButtonElement | null)?.addEventListener('click', () => {
    const n = +(root.querySelector('#smpN') as HTMLSelectElement).value || 16;
    opts.onSliceEqual(n);
  });

  // Por defecto no-op; si hay onda, se sustituye por el pintado real del cursor/resalte.
  let setActive: (a: ActiveSlice[]) => void = () => {};

  const buffer = opts.buffer;
  const canvas = root.querySelector('#smpWave') as HTMLCanvasElement | null;
  if (buffer && canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const W = canvas.width, H = canvas.height, mid = H / 2;
      const data = buffer.getChannelData(0), N = data.length, dur = buffer.duration;
      const HIT = 6;   // px de tolerancia para "sobre una marca"
      const timeToX = (t: number): number => t / dur * W;
      const xToTime = (x: number): number => Math.max(0, Math.min(dur - 1 / buffer.sampleRate, x / W * dur));
      const relX = (e: PointerEvent | MouseEvent): number => {
        const r = canvas.getBoundingClientRect(); return (e.clientX - r.left) / r.width * W;
      };
      const marks = (): number[] => opts.slices.map(s => s.start);
      const markNear = (x: number): number => {
        const ms = marks();
        for (let i = 0; i < ms.length; i++) if (Math.abs(timeToX(ms[i]) - x) < HIT) return i;
        return -1;
      };

      // La onda se calcula UNA vez en un canvas offscreen; cada frame solo se vuelca + overlays (perf).
      const wave = document.createElement('canvas'); wave.width = W; wave.height = H;
      const wctx = wave.getContext('2d');
      if (wctx) {
        wctx.fillStyle = '#0c110b'; wctx.fillRect(0, 0, W, H);
        wctx.strokeStyle = '#2dff6a'; wctx.globalAlpha = 0.85; wctx.beginPath();
        for (let x = 0; x < W; x++) {
          let min = 1, max = -1; const i0 = Math.floor(x / W * N), i1 = Math.floor((x + 1) / W * N);
          for (let i = i0; i < i1; i++) { const v = data[i]; if (v < min) min = v; if (v > max) max = v; }
          wctx.moveTo(x, mid + min * mid); wctx.lineTo(x, mid + max * mid);
        }
        wctx.stroke(); wctx.globalAlpha = 1;
      }

      // Vuelca la onda cacheada + regiones/cursores de slices activos + marcas.
      const draw = (markList: number[], active: ActiveSlice[]): void => {
        ctx.drawImage(wave, 0, 0);
        for (const a of active) {
          const sl = opts.slices[a.index]; if (!sl) continue;
          const x0 = timeToX(sl.start), x1 = timeToX(sl.end);
          ctx.fillStyle = 'rgba(45,255,106,0.14)'; ctx.fillRect(x0, 0, Math.max(1, x1 - x0), H);
          const cx = Math.round(timeToX(sl.start + a.progress * (sl.end - sl.start))) + 0.5;
          ctx.strokeStyle = '#eaffe9'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke(); ctx.lineWidth = 1;
        }
        ctx.strokeStyle = '#fff';
        for (const t of markList) {
          const x = Math.round(timeToX(t)) + 0.5;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
      };

      let lastActive: ActiveSlice[] = [];
      draw(marks(), lastActive);

      let drag = -1;                 // índice de la marca que se arrastra (-1 = ninguna)
      let live: number[] | null = null;
      canvas.addEventListener('pointerdown', e => {
        const i = markNear(relX(e));
        if (i > 0) { drag = i; live = marks(); canvas.setPointerCapture(e.pointerId); }   // la marca 0 no se mueve
      });
      canvas.addEventListener('pointermove', e => {
        if (drag < 0 || !live) { canvas.style.cursor = markNear(relX(e)) > 0 ? 'ew-resize' : 'default'; return; }
        live[drag] = xToTime(relX(e));
        draw(live, lastActive);
      });
      const endDrag = (): void => {
        if (drag >= 0 && live) opts.onSetMarks?.(live);
        drag = -1; live = null;
      };
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);
      canvas.addEventListener('dblclick', e => {
        const x = relX(e); if (markNear(x) >= 0) return;   // sobre una marca: no añadir
        opts.onSetMarks?.([...marks(), xToTime(x)]);
      });
      canvas.addEventListener('contextmenu', e => {
        e.preventDefault();
        const i = markNear(relX(e));
        if (i > 0) { const ms = marks(); ms.splice(i, 1); opts.onSetMarks?.(ms); }   // borrar (no la marca 0)
      });

      setActive = (active: ActiveSlice[]): void => {
        if (active.length === 0 && lastActive.length === 0) return;   // nada que pintar ni limpiar
        lastActive = active;
        draw(marks(), active);
        const l = root.querySelector('#smpList');
        l?.querySelectorAll<HTMLButtonElement>('.smpSlice').forEach(b => {
          const on = active.some(a => a.index === +(b.dataset.i ?? '-1'));
          b.classList.toggle('playing', on);
        });
      };
    }
  }

  const list = root.querySelector('#smpList') as HTMLElement;
  const panel = root.querySelector('#smpSlicePanel') as HTMLElement;
  let selected = -1;

  function renderList(): void {
    list.innerHTML = opts.slices.map((s, i) =>
      `<button class="smpSlice${i === selected ? ' sel' : ''}" data-i="${i}" title="Seleccionar y probar">▶ ${i + 1} · ${noteName(opts.base + i)}</button>`).join('')
      || (opts.buffer ? '<p class="muted">Pulsa "Trocear" para crear los slices.</p>' : '');
    list.querySelectorAll<HTMLButtonElement>('.smpSlice').forEach(b =>
      b.addEventListener('click', () => { selected = +(b.dataset.i ?? '0'); opts.onTest(selected); renderList(); renderPanel(); }));
  }

  function renderPanel(): void {
    const s = opts.slices[selected];
    if (!s) { panel.innerHTML = ''; return; }
    panel.innerHTML = `<div class="smpSliceHead">SLICE ${selected + 1} · ${noteName(opts.base + selected)}</div>
      <div class="smpKnobs">
        <div class="knobCell"><div class="knob" id="skGain"></div><span>Ganancia</span></div>
        <div class="knobCell"><div class="knob" id="skFin"></div><span>Fade in</span></div>
        <div class="knobCell"><div class="knob" id="skFout"></div><span>Fade out</span></div>
        <label class="smpRev"><input type="checkbox" id="skRev" ${s.reverse ? 'checked' : ''}> Reverse</label>
        <button class="smpBtn" id="skTest">▶ Probar</button>
      </div>`;
    // opts.slices no se refresca al editar (para no re-montar el editor a mitad de un arrastre),
    // así que `s` mantiene datos obsoletos tras la primera edición. Mutamos `s` en el propio
    // handler para que la vista local del editor quede en sync con el modelo (que sí se actualiza
    // de forma inmutable en otro sitio); así una futura renderPanel() no muestra ni reescribe valores viejos.
    mountKnob(panel.querySelector('#skGain') as HTMLElement, { min: 0, max: 2, value: s.gain, default: 1, size: 34,
      onChange: v => { s.gain = v; opts.onUpdateSlice?.(selected, { gain: v }); } });
    mountKnob(panel.querySelector('#skFin') as HTMLElement, { min: 0, max: 0.3, value: s.fadeIn, default: 0, size: 34,
      onChange: v => { s.fadeIn = v; opts.onUpdateSlice?.(selected, { fadeIn: v }); } });
    mountKnob(panel.querySelector('#skFout') as HTMLElement, { min: 0, max: 0.3, value: s.fadeOut, default: 0, size: 34,
      onChange: v => { s.fadeOut = v; opts.onUpdateSlice?.(selected, { fadeOut: v }); } });
    (panel.querySelector('#skRev') as HTMLInputElement).addEventListener('change', e => {
      const checked = (e.target as HTMLInputElement).checked;
      s.reverse = checked;
      opts.onUpdateSlice?.(selected, { reverse: checked });
    });
    (panel.querySelector('#skTest') as HTMLButtonElement).addEventListener('click', () => opts.onTest(selected));
  }

  renderList();
  renderPanel();
  return { setActiveSlices: (a) => setActive(a) };
}
```

- [ ] **Step 2: `studioView.ts` — import y estado de slices**

Amplía el import de `hitViz` (de Task 2) para traer también lo de slices, y añade el import del handle:

```ts
import { padLevel, activeSlices, type PadHit, type SliceHit } from '../ui/hitViz';
import type { SampleEditorHandle } from '../ui/sampleEditor';
```

Junto al estado de Task 2 (tras `let visRaf = 0;`), añade:

```ts
  const sliceHits: SliceHit[] = [];               // slices sonando (canal slicer seleccionado)
  let sampleHandle: SampleEditorHandle | null = null;
```

- [ ] **Step 3: `renderSamples()` — guardar el handle**

En `renderSamples()`, en el retorno temprano de no-slicer, pon `sampleHandle = null;` antes del `return`, y captura el handle al montar. Es decir, sustituye:

```ts
    if (!ch || ch.instrument.kind !== 'slicer') {
      host.innerHTML = '<div class="pvSoon">Elige <b>🔪 Slicer</b> en el SONIDO de un canal para cargar y trocear un audio.</div>';
      return;
    }
    const inst = ch.instrument;
    const s = getSample(inst.sampleId);
    mountSampleEditor(host, {
```

por:

```ts
    if (!ch || ch.instrument.kind !== 'slicer') {
      host.innerHTML = '<div class="pvSoon">Elige <b>🔪 Slicer</b> en el SONIDO de un canal para cargar y trocear un audio.</div>';
      sampleHandle = null;
      return;
    }
    const inst = ch.instrument;
    const s = getSample(inst.sampleId);
    sampleHandle = mountSampleEditor(host, {
```

- [ ] **Step 4: Registrar el slice en `onStep`**

Dentro del bucle `for (const c of daw.channels)` de `onStep` (el de Task 2), justo después de `padHits.set(c.id, { t: at, vel });`, añade:

```ts
        if (c.id === selectedId && c.instrument.kind === 'slicer') {
          const idx = sliceIndexForNote(c.instrument.base, c.instrument.slices.length, st.note ?? 60);
          const sl = c.instrument.slices[idx];
          if (sl) sliceHits.push({ index: idx, t: at, dur: sl.end - sl.start });
        }
```

- [ ] **Step 5: Registrar el slice en `playLive` y en `testSlice`**

En `playLive`, en la rama `else if (ch?.instrument.kind === 'slicer')`, tras la línea que llama a `playSlice(...)`, añade (dentro de ese bloque, donde `s`, `idx` y `actx` ya existen):

```ts
      if (s?.buffer && idx >= 0 && actx) { const sl = ch.instrument.slices[idx]; if (sl) sliceHits.push({ index: idx, t: actx.currentTime, dur: sl.end - sl.start }); }
```

En `testSlice(id, index)`, dentro del `if (buf && audio && ch?.instrument.kind === 'slicer' && ch.instrument.slices[index])`, tras la llamada a `playSlice(...)`, añade:

```ts
      if (id === selectedId) { const sl = ch.instrument.slices[index]; sliceHits.push({ index, t: (getAudioContext()?.currentTime ?? 0), dur: sl.end - sl.start }); ensureVisualLoop(); }
```

- [ ] **Step 6: Pintar los slices en `visualTick` + limpiar al parar**

Sustituye el cuerpo de `visualTick` (de Task 2) por esta versión que también poda y pinta slices:

```ts
  function visualTick(): void {
    const now = getAudioContext()?.currentTime ?? 0;
    const playing = seq.isPlaying();
    if (playing) {
      const s = ((Math.floor(transport.beatNow() * STEPS_PER_BEAT) % daw.steps) + daw.steps) % daw.steps;
      selGrid?.setPlayhead(s);
    }
    for (const [id, h] of padHits) if (now - h.t >= PAD_FADE) padHits.delete(id);            // poda pads
    for (let k = sliceHits.length - 1; k >= 0; k--) if (now - sliceHits[k].t >= sliceHits[k].dur) sliceHits.splice(k, 1);   // poda slices
    paintPads(now);
    sampleHandle?.setActiveSlices(activeSlices(sliceHits, now));
    if (playing || padHits.size || sliceHits.length) visRaf = requestAnimationFrame(visualTick);
    else { visRaf = 0; clearPads(); sampleHandle?.setActiveSlices([]); }
  }
```

En `onStop`, añade el vaciado de slices: cambia `padHits.clear(); clearPads();` por:

```ts
padHits.clear(); clearPads(); sliceHits.length = 0; sampleHandle?.setActiveSlices([]);
```

- [ ] **Step 7: CSS del slice que suena**

En `studio/src/ui/styles.css`, añade al final:

```css
/* Slice sonando (iluminación reactiva): resalte independiente del .sel de edición */
.smpSlice.playing{border-color:#eaffe9;color:#fff;box-shadow:0 0 10px rgba(45,255,106,.55)}
```

- [ ] **Step 8: Verify typecheck, tests and build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS.

- [ ] **Step 9: Manual smoke test (prueba por vista/oído)**

Run: `cd studio && npm run dev` y abre la URL. Verifica:
1. Con una secuencia grabada y al pulsar Play, los pads de los canales que suenan **destellan** al ritmo; más fuerte el golpe → más brillo.
2. Tocando en vivo con el teclado (sin reproducir), el pad del canal seleccionado **destella**.
3. En un canal Slicer con audio troceado y reproduciendo, el slice que suena se **resalta** y una **línea-cursor recorre su onda**; también al pulsar ▶ Probar.
4. Al **parar**, se apaga todo (pads y cursor).

- [ ] **Step 10: Commit**

```bash
git add studio/src/ui/sampleEditor.ts studio/src/app/studioView.ts studio/src/ui/styles.css
git commit -m "Estudio iluminación: slice activo con línea-cursor sobre la onda (secuenciador + preview/teclado)"
```

---

### Task 4: Docs y versión

**Files:**
- Modify: `studio/package.json` (subir `version` a `0.19.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.19.0"`.

- [ ] **Step 2: Update HANDOFF.md**

Añade en la zona de estado del Estudio:

```markdown
**Estudio · Iluminación reactiva (v0.19.0):** realimentación visual de qué suena. Los **pads destellan**
(glow verde neón por variable CSS `--hit`) al sonar su paso en la reproducción y al tocar en vivo con el
teclado, **más brillo cuanto más fuerte** el golpe (velocity). En la pestaña SAMPLES, el **slice que suena
se resalta** en la lista y una **línea-cursor recorre su onda** (secuenciador + preview/teclado). Sin tocar
el motor de audio: `studioView` registra cada disparo en un bus de golpes (`padHits`/`sliceHits`) y un bucle
`requestAnimationFrame` (`visualTick`) pinta leyendo el reloj de audio; la matemática es pura y testeada en
`ui/hitViz.ts`. La onda del editor se cachea en un canvas offscreen para pintar el cursor sin recalcularla.
```

- [ ] **Step 3: Update CLAUDE.md**

En la sección del Estudio (decisión 5), tras la mención del sampler S3, añade que la vista tiene **iluminación reactiva (v0.19.0): destello de pads por velocity + slice activo con cursor sobre la onda** (`ui/hitViz.ts` + `visualTick` en `app/studioView.ts`, sin cambios de motor).

- [ ] **Step 4: Verify and commit**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio iluminación: docs (HANDOFF/CLAUDE) y versión 0.19.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- Destello de pads por velocity (reproducción) → Task 2 (`onStep` + `padHits` + `visualTick` + CSS) ✅
- Destello de pads al tocar en vivo → Task 2 (`playLive` + `ensureVisualLoop`) ✅
- Slice activo resaltado + cursor sobre la onda (secuenciador + preview/teclado) → Task 3 ✅
- Onda cacheada (perf) → Task 3 (canvas offscreen) ✅
- Helpers puros testeados → Task 1 (`hitViz.ts` + tests) ✅
- Limpiar al parar / coste cero en reposo → Task 2/3 (`onStop` limpia, el bucle se detiene sin golpes) ✅
- Docs/versión → Task 4 ✅

**Build verde en cada tarea:** Task 1 (módulo nuevo puro), Task 2 (pads; `hitViz` ya existe), Task 3 (slices; `mountSampleEditor` cambia de `void` a handle y el único consumidor, `renderSamples`, se adapta en la misma tarea). Aditivo salvo el retorno del editor, que se actualiza a la vez que su consumidor.

**Placeholders:** ninguno; el código va completo. "TODO PASS"/"TODO PASS" = "todo pasa".

**Consistencia de tipos:** `PadHit`/`SliceHit`/`ActiveSlice`/`padLevel`/`activeSlices`/`sliceProgress`/`flashLevel` (Task 1) coinciden con su uso en Tasks 2–3. `SampleEditorHandle { setActiveSlices(active: ActiveSlice[]): void }` (Task 3) coincide entre `sampleEditor.ts` y `studioView.ts`. `sliceIndexForNote`, `getSample`, `swingOffset`, `SEQ_VEL`, `STEPS_PER_BEAT`, `getAudioContext`, `seq`, `transport`, `selGrid` ya existen en `studioView.ts`.

**Decisión consciente (un solo bucle):** `visualTick` sustituye a `playhead()` y unifica cabezal + destellos + cursor; se auto-detiene cuando no hay reproducción ni golpes recientes (coste cero en reposo) y se re-arranca con `ensureVisualLoop()` en cada golpe en vivo.
