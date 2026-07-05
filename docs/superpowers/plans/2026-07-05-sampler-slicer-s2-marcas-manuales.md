# Sampler/Simpler con slicing · Sub-tanda S2 (ajuste manual de marcas) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar a mano las marcas de corte del canal `slicer` sobre la forma de onda: arrastrar una marca para moverla, doble-clic en un hueco para añadir una, clic derecho sobre una marca para borrarla — con redibujo en vivo.

**Architecture:** Extiende el editor `ui/sampleEditor.ts` (de S1) con interacción de ratón sobre el `<canvas>`: refactoriza el dibujo a una función reutilizable, detecta la marca bajo el puntero, y produce un nuevo array de marcas que entrega por un callback `onSetMarks`. `studioView` conecta ese callback a `marksToSlices` (ya existente y puro) + `updateChannel` + persistencia. El motor, el modelo y el DSP no cambian.

**Tech Stack:** Vite + TypeScript (strict). Web Audio (solo el AudioBuffer para dibujar). Sin framework de UI. Textos/comentarios en español.

## Global Constraints

- Todo el trabajo va en `studio/` (NO tocar `pianova.html`).
- TypeScript **strict**; sin dependencias nuevas de instalación.
- Comentarios y textos de interfaz **en español**.
- No cambiar el motor/modelo/persistencia/DSP: S2 es solo UI del editor + su cableado.
- La marca inicial (t≈0, primer slice) **no se mueve ni se borra** (es el inicio del audio).
- Las marcas finales pasan siempre por `marksToSlices` (ordena, dedup, fuerza el 0, descarta fuera de rango) — ya existe en `daw/slicing.ts`.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Comandos siempre desde `studio/`.

---

### Task 1: Interacción de marcas en el editor (`ui/sampleEditor.ts` + CSS)

**Files:**
- Modify: `studio/src/ui/sampleEditor.ts` (reescritura del cuerpo del editor)
- Modify: `studio/src/ui/styles.css` (cursor del canvas)

**Interfaces:**
- Consumes: `SliceDef` (`daw/slicing`).
- Produces: `mountSampleEditor(root, opts)` gana en `opts` un callback **opcional** `onSetMarks?: (marks: number[]) => void`. Sobre el canvas: arrastrar una marca (salvo la de t≈0) la mueve con redibujo en vivo y al soltar llama `onSetMarks(nuevasMarcas)`; **doble-clic** en un hueco añade una marca (`onSetMarks([...marcas, t])`); **clic derecho** sobre una marca (salvo t≈0) la borra (`onSetMarks(marcasSinEsa)`). El resto de la firma (buffer/slices/base/onImport/onSliceEqual/onSliceOnsets/onTest) no cambia.

DOM; sin test unitario. Verificado por typecheck + build.

- [ ] **Step 1: Replace the file contents**

Reemplaza **todo** el contenido de `studio/src/ui/sampleEditor.ts` por:

```ts
// studio/src/ui/sampleEditor.ts
// Editor del canal slicer (pestaña SAMPLES): forma de onda + marcas editables + troceado + probar slice.
import type { SliceDef } from '../daw/slicing';

const NOTE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const noteName = (m: number): string => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

export function mountSampleEditor(
  root: HTMLElement,
  opts: {
    buffer: AudioBuffer | null; slices: SliceDef[]; base: number;
    onImport: (file: File) => void; onSliceEqual: (n: number) => void;
    onSliceOnsets: () => void; onTest: (index: number) => void;
    onSetMarks?: (marks: number[]) => void;
  }
): void {
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
  </div>`;

  (root.querySelector('#smpFile') as HTMLInputElement | null)?.addEventListener('change', ev => {
    const f = (ev.target as HTMLInputElement).files?.[0]; if (f) opts.onImport(f);
  });
  (root.querySelector('#smpOnsets') as HTMLButtonElement | null)?.addEventListener('click', () => opts.onSliceOnsets());
  (root.querySelector('#smpEqual') as HTMLButtonElement | null)?.addEventListener('click', () => {
    const n = +(root.querySelector('#smpN') as HTMLSelectElement).value || 16;
    opts.onSliceEqual(n);
  });

  const buffer = opts.buffer;
  const canvas = root.querySelector('#smpWave') as HTMLCanvasElement | null;
  if (buffer && canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const W = canvas.width, H = canvas.height, mid = H / 2;
      const data = buffer.getChannelData(0), N = data.length, dur = buffer.duration;
      const HIT = 6;   // px de tolerancia para "sobre una marca"
      const timeToX = (t: number): number => t / dur * W;
      const xToTime = (x: number): number => Math.max(0, Math.min(dur, x / W * dur));
      const relX = (e: PointerEvent | MouseEvent): number => {
        const r = canvas.getBoundingClientRect(); return (e.clientX - r.left) / r.width * W;
      };
      const marks = (): number[] => opts.slices.map(s => s.start);
      const markNear = (x: number): number => {
        const ms = marks();
        for (let i = 0; i < ms.length; i++) if (Math.abs(timeToX(ms[i]) - x) < HIT) return i;
        return -1;
      };

      // Dibuja la onda + una lista de marcas (para el redibujo en vivo durante el arrastre).
      const draw = (markList: number[]): void => {
        ctx.fillStyle = '#0c110b'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#2dff6a'; ctx.globalAlpha = 0.85; ctx.beginPath();
        for (let x = 0; x < W; x++) {
          let min = 1, max = -1; const i0 = Math.floor(x / W * N), i1 = Math.floor((x + 1) / W * N);
          for (let i = i0; i < i1; i++) { const v = data[i]; if (v < min) min = v; if (v > max) max = v; }
          ctx.moveTo(x, mid + min * mid); ctx.lineTo(x, mid + max * mid);
        }
        ctx.stroke(); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff';
        for (const t of markList) {
          const x = Math.round(timeToX(t)) + 0.5;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
      };
      draw(marks());

      let drag = -1;                 // índice de la marca que se arrastra (-1 = ninguna)
      let live: number[] | null = null;
      canvas.addEventListener('pointerdown', e => {
        const i = markNear(relX(e));
        if (i > 0) { drag = i; live = marks(); canvas.setPointerCapture(e.pointerId); }   // la marca 0 no se mueve
      });
      canvas.addEventListener('pointermove', e => {
        if (drag < 0 || !live) { canvas.style.cursor = markNear(relX(e)) > 0 ? 'ew-resize' : 'default'; return; }
        live[drag] = xToTime(relX(e));
        draw(live);
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
    }
  }

  const list = root.querySelector('#smpList') as HTMLElement;
  list.innerHTML = opts.slices.map((s, i) =>
    `<button class="smpSlice" data-i="${i}" title="Probar">▶ ${i + 1} · ${noteName(opts.base + i)}</button>`).join('')
    || (buffer ? '<p class="muted">Pulsa "Trocear" para crear los slices.</p>' : '');
  list.querySelectorAll<HTMLButtonElement>('.smpSlice').forEach(b =>
    b.addEventListener('click', () => opts.onTest(+(b.dataset.i ?? '0'))));
}
```

- [ ] **Step 2: Add CSS**

Añade al final de `studio/src/ui/styles.css`:

```css
/* Editor del sampler: pista de ayuda + cursor sobre la onda */
.smpHint{font-size:11px;margin:2px 0 8px}
.smpWave{touch-action:none}
```

- [ ] **Step 3: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS. (`onSetMarks` es opcional, así que el `studioView` actual sigue compilando aunque no lo pase todavía.)

- [ ] **Step 4: Commit**

```bash
git add studio/src/ui/sampleEditor.ts studio/src/ui/styles.css
git commit -m "Estudio sampler S2: marcas editables en la onda (arrastrar/añadir/borrar) con redibujo en vivo"
```

---

### Task 2: Cablear el editor de marcas (`app/studioView.ts`)

**Files:**
- Modify: `studio/src/app/studioView.ts`

**Interfaces:**
- Consumes: `marksToSlices` (`daw/slicing`, ya importado en studioView para `applySlices`); `mountSampleEditor` con el nuevo `onSetMarks`.
- Produces: al editar marcas en el canvas, el instrumento `slicer` del canal se actualiza con las nuevas slices y se persiste.

Integración (DOM); sin test unitario. Verificado por typecheck + tests verdes + build + prueba por vista/oído.

- [ ] **Step 1: Pass `onSetMarks` when mounting the editor**

En `studio/src/app/studioView.ts`, localiza `renderSamples()` y la llamada a `mountSampleEditor(host, { ... })`. Añade a ese objeto de opciones el callback `onSetMarks`, reutilizando el helper `applySlices` que ya construye las slices desde marcas y persiste:

```ts
      onSetMarks: (marks) => applySlices(selectedId, marks),
```

`applySlices(id, marks)` ya existe (lo usan "Trocear en N" y "Por transitorios"): hace `marksToSlices(marks, buf.duration)` → `updateChannel` → `setInstrument` → `persist` → `renderSamples`. Así que editar una marca a mano reutiliza exactamente el mismo camino. (Verifica que `applySlices` esté accesible en el ámbito de `renderSamples`; en S1 ambos viven en `mountStudioView`. Si su firma difiere, adáptate a la real: el objetivo es `onSetMarks: (marks) => <aplica marksToSlices y persiste para selectedId>`.)

- [ ] **Step 2: Verify typecheck, tests and build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS.

- [ ] **Step 3: Manual smoke test (prueba por vista/oído)**

Run: `cd studio && npm run dev` y abre la URL.
Verifica en un canal **Slicer** con un audio troceado:
1. **Arrastrar** una marca (que no sea la primera) la mueve; la onda se redibuja en vivo; al soltar, el slice cambia de tamaño y suena distinto (▶).
2. **Doble-clic** en un hueco de la onda añade una marca nueva → aparece un slice más en la lista.
3. **Clic derecho** sobre una marca la borra → desaparece su slice.
4. La **primera** marca (inicio) no se mueve ni se borra.
5. Guardar/abrir el proyecto conserva las marcas ajustadas.

- [ ] **Step 4: Commit**

```bash
git add studio/src/app/studioView.ts
git commit -m "Estudio sampler S2: cablea la edición manual de marcas (onSetMarks → marksToSlices + persist)"
```

---

### Task 3: Docs y versión

**Files:**
- Modify: `studio/package.json` (subir `version` a `0.17.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.17.0"`.

- [ ] **Step 2: Update HANDOFF.md**

Añade en la zona de estado del Estudio:

```markdown
**Estudio · Sampler con slicing — S2 marcas manuales (v0.17.0):** en el editor del canal `slicer` (pestaña
SAMPLES) las marcas de corte son editables sobre la forma de onda: **arrastrar** una marca la mueve (con
redibujo en vivo), **doble-clic** en un hueco añade una, **clic derecho** sobre una marca la borra; la
primera marca (inicio) queda fija. Todo pasa por `marksToSlices` (ordena/dedup/fuerza el 0) y se persiste.
Solo UI (`ui/sampleEditor.ts` + cableado `onSetMarks` en `app/studioView.ts`); motor/modelo/DSP intactos.
Pendiente S3 (edición por slice: recorte/ganancia/reverse/fade en la UI — el motor ya lo soporta) y S4
(navegador de carpetas del disco).
```

- [ ] **Step 3: Update CLAUDE.md**

En la sección del Estudio (decisión 5), actualiza el estado del sampler para indicar que S2 (marcas manuales:
arrastrar/añadir/borrar sobre la onda) está hecha; pendientes S3 (edición por slice) y S4 (navegador de
carpetas).

- [ ] **Step 4: Verify and commit**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio sampler S2: docs (HANDOFF/CLAUDE) y versión 0.17.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec (S2):**
- Ajuste manual de marcas: mover (arrastrar), añadir (doble-clic), borrar (clic derecho) → Task 1 ✅
- Redibujo en vivo durante el arrastre → Task 1 (`draw(live)`) ✅
- La primera marca queda fija → Task 1 (guardas `i > 0`) ✅
- Cableado a `marksToSlices` + persistencia → Task 2 ✅
- Docs/versión → Task 3 ✅
- (S3 edición por slice y S4 navegador → sub-tandas posteriores, fuera de S2.)

**Build verde en cada tarea:** Task 1 hace `onSetMarks` opcional, así el `studioView` actual compila sin cambios; Task 2 lo cablea. Aditivo, sin estados rotos.

**Placeholders:** ninguno; el código de Task 1 va completo. Los textos de UI (pista de ayuda) son contenido. El "TODO PASS" de la Task 2 significa "todo pasa".

**Consistencia de tipos:** `onSetMarks?: (marks: number[]) => void` (Task 1) coincide con la llamada `onSetMarks: (marks) => applySlices(selectedId, marks)` (Task 2). `applySlices(id, marks)` y `marksToSlices(marks, dur)` ya existen de S1 con esas firmas. `mountSampleEditor(root, opts)` mantiene el resto de su firma intacta.

**Limitación consciente (S2):** la interacción está pensada para **ratón** (arrastrar/doble-clic/clic derecho); en táctil puro el doble-clic y el menú contextual son incómodos (aceptable: el Estudio es de escritorio). La edición fina por slice (recorte/ganancia/reverse/fade en la UI) es S3.
```
