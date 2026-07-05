# Sampler/Simpler con slicing · Sub-tanda S3 (edición por slice) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poder editar, por slice, la **ganancia**, el **reverse** y los **fundidos (fade in/out)** desde la pestaña SAMPLES: seleccionas un slice y ajustas sus parámetros con knobs; el cambio suena al instante y se persiste.

**Architecture:** El motor (`audio/slicer.ts`) y el modelo (`SliceDef` con `gain/reverse/fadeIn/fadeOut`) ya soportan estos parámetros desde S1. S3 solo añade la **UI**: en `ui/sampleEditor.ts`, seleccionar un slice muestra un panel con knobs (reutilizando `ui/knob.ts`) que emiten un callback `onUpdateSlice(index, patch)`; `app/studioView.ts` aplica el patch al slice con un helper puro `updateSlice` (nuevo en `daw/slicing.ts`, testeado), actualiza el audio del canal y persiste — **sin re-montar el editor** (para no cortar el arrastre del knob). El "recorte inicio/fin" de cada slice ya se ajusta con las marcas (S2).

**Tech Stack:** Vite + TypeScript (strict) + Vitest. Web Audio. Sin framework de UI. Textos/comentarios en español.

## Global Constraints

- Todo el trabajo va en `studio/` (NO tocar `pianova.html`).
- TypeScript **strict**; sin dependencias nuevas de instalación.
- Comentarios y textos de interfaz **en español**.
- No cambiar el motor de audio ni el disparo: S3 es modelo (un helper puro) + UI + cableado.
- Editar un parámetro de slice **no debe re-montar el editor** (el knob que arrastras seguiría vivo); solo actualiza modelo + audio + persistencia.
- El "recorte inicio/fin" de cada slice se hace con las **marcas** (S2); S3 añade ganancia, reverse y fades.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Comandos siempre desde `studio/`.

---

### Task 1: Helper puro `updateSlice` (`daw/slicing.ts`)

**Files:**
- Modify: `studio/src/daw/slicing.ts` (añadir la función)
- Modify: `studio/src/daw/slicing.test.ts` (añadir casos)

**Interfaces:**
- Consumes: `SliceDef` (ya en `slicing.ts`).
- Produces: `updateSlice(slices: SliceDef[], index: number, patch: Partial<SliceDef>): SliceDef[]` — devuelve un array **nuevo** con el slice `index` combinado con `patch` (los demás intactos); si `index` está fuera de rango, devuelve el array original sin cambios.

- [ ] **Step 1: Write the failing test (añadir a slicing.test.ts)**

```ts
import { updateSlice } from './slicing';

describe('updateSlice', () => {
  const base = () => [
    { start: 0, end: 1, gain: 1, reverse: false, fadeIn: 0, fadeOut: 0 },
    { start: 1, end: 2, gain: 1, reverse: false, fadeIn: 0, fadeOut: 0 }
  ];
  it('combina el patch en el slice indicado y deja los demás', () => {
    const out = updateSlice(base(), 1, { gain: 0.5, reverse: true });
    expect(out[1]).toEqual({ start: 1, end: 2, gain: 0.5, reverse: true, fadeIn: 0, fadeOut: 0 });
    expect(out[0]).toEqual(base()[0]);
  });
  it('devuelve un array nuevo (no muta el original)', () => {
    const src = base();
    const out = updateSlice(src, 0, { gain: 2 });
    expect(out).not.toBe(src);
    expect(src[0].gain).toBe(1);   // el original no cambia
  });
  it('índice fuera de rango: devuelve el original sin cambios', () => {
    const src = base();
    expect(updateSlice(src, 5, { gain: 0 })).toBe(src);
    expect(updateSlice(src, -1, { gain: 0 })).toBe(src);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd studio && npm test -- slicing`
Expected: FAIL (no existe `updateSlice`).

- [ ] **Step 3: Add the implementation to `daw/slicing.ts`**

Añade al final de `studio/src/daw/slicing.ts`:

```ts
// Devuelve un array nuevo con el slice `index` combinado con `patch` (los demás intactos).
// Índice fuera de rango: devuelve el mismo array sin cambios.
export function updateSlice(slices: SliceDef[], index: number, patch: Partial<SliceDef>): SliceDef[] {
  if (index < 0 || index >= slices.length) return slices;
  return slices.map((s, i) => i === index ? { ...s, ...patch } : s);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd studio && npm test -- slicing`
Expected: PASS (los 3 nuevos + los de S1).

- [ ] **Step 5: Commit**

```bash
git add studio/src/daw/slicing.ts studio/src/daw/slicing.test.ts
git commit -m "Estudio sampler S3: helper puro updateSlice (patch por slice, inmutable) + tests"
```

---

### Task 2: Panel de edición del slice en el editor (`ui/sampleEditor.ts` + CSS)

**Files:**
- Modify: `studio/src/ui/sampleEditor.ts`
- Modify: `studio/src/ui/styles.css`

**Interfaces:**
- Consumes: `SliceDef` (`daw/slicing`); `mountKnob` (`ui/knob.ts`, firma `mountKnob(root, { min, max, value, default?, size?, onChange })`).
- Produces: `mountSampleEditor(root, opts)` gana en `opts` un callback **opcional** `onUpdateSlice?: (index: number, patch: Partial<SliceDef>) => void`. En la lista de slices, hacer clic en uno lo **selecciona** (resalta + suena vía `onTest`) y muestra debajo un **panel** con knobs **Ganancia** (0–2), **Fade in** (0–0.3 s), **Fade out** (0–0.3 s), una casilla **Reverse** y un botón **▶ Probar**; cada control llama `onUpdateSlice(sel, patch)`. El resto de la firma (buffer/slices/base/onImport/onSliceEqual/onSliceOnsets/onTest/onSetMarks) no cambia.

DOM; sin test unitario. Verificado por typecheck + build.

- [ ] **Step 1: Edit `ui/sampleEditor.ts`**

Cambia el import y añade el panel. Concretamente:

(a) Añade el import de `mountKnob` bajo el import de tipos:

```ts
import type { SliceDef } from '../daw/slicing';
import { mountKnob } from './knob';
```

(b) Añade `onUpdateSlice` al tipo de `opts` (junto a `onSetMarks`):

```ts
    onSetMarks?: (marks: number[]) => void;
    onUpdateSlice?: (index: number, patch: Partial<SliceDef>) => void;
```

(c) Añade un contenedor para el panel en el HTML, entre `#smpList` y el cierre del `.smpEd` (deja `#smpList` como está):

```ts
    <div id="smpList" class="smpList"></div>
    <div id="smpSlicePanel" class="smpSlicePanel"></div>
  </div>`;
```

(d) Reemplaza el bloque final que monta la lista de slices (desde `const list = ...` hasta el final de la función) por esta versión, que añade selección + panel:

```ts
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
    mountKnob(panel.querySelector('#skGain') as HTMLElement, { min: 0, max: 2, value: s.gain, default: 1, size: 34,
      onChange: v => opts.onUpdateSlice?.(selected, { gain: v }) });
    mountKnob(panel.querySelector('#skFin') as HTMLElement, { min: 0, max: 0.3, value: s.fadeIn, default: 0, size: 34,
      onChange: v => opts.onUpdateSlice?.(selected, { fadeIn: v }) });
    mountKnob(panel.querySelector('#skFout') as HTMLElement, { min: 0, max: 0.3, value: s.fadeOut, default: 0, size: 34,
      onChange: v => opts.onUpdateSlice?.(selected, { fadeOut: v }) });
    (panel.querySelector('#skRev') as HTMLInputElement).addEventListener('change', e =>
      opts.onUpdateSlice?.(selected, { reverse: (e.target as HTMLInputElement).checked }));
    (panel.querySelector('#skTest') as HTMLButtonElement).addEventListener('click', () => opts.onTest(selected));
  }

  renderList();
  renderPanel();
}
```

(Elimina el antiguo bloque `list.innerHTML = ...` + su `forEach`, que queda sustituido por `renderList()`.)

- [ ] **Step 2: Add CSS**

Añade al final de `studio/src/ui/styles.css`:

```css
/* Panel de edición del slice seleccionado (S3) */
.smpSlice.sel{border-color:#2dff6a;color:#fff;box-shadow:0 0 8px rgba(45,255,106,.35)}
.smpSlicePanel:empty{display:none}
.smpSlicePanel{margin-top:10px;background:#10130f;border:1px solid #23291f;border-radius:8px;padding:10px 12px}
.smpSliceHead{font-size:10px;letter-spacing:.12em;color:#2dff6a;margin-bottom:8px}
.smpKnobs{display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap}
.smpKnobs .knobCell{display:flex;flex-direction:column;align-items:center;gap:5px;font-size:10px;color:#c9d2c9}
.smpRev{display:flex;align-items:center;gap:6px;font-size:12px;color:#c9d2c9}
```

- [ ] **Step 3: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS. (`onUpdateSlice` es opcional, así que el `studioView` actual compila aunque no lo pase todavía.)

- [ ] **Step 4: Commit**

```bash
git add studio/src/ui/sampleEditor.ts studio/src/ui/styles.css
git commit -m "Estudio sampler S3: panel de edición por slice (ganancia/reverse/fades) con knobs"
```

---

### Task 3: Cablear la edición por slice (`app/studioView.ts`)

**Files:**
- Modify: `studio/src/app/studioView.ts`

**Interfaces:**
- Consumes: `updateSlice` (Task 1); `mountSampleEditor` con el nuevo `onUpdateSlice`.
- Produces: al mover un knob/casilla de un slice, el instrumento `slicer` del canal actualiza ese slice y **suena** el cambio, persistiendo, **sin re-montar el editor** (no llama a `renderSamples`).

Integración (DOM); sin test unitario. Verificado por typecheck + tests verdes + build + prueba por vista/oído.

- [ ] **Step 1: Import `updateSlice`**

En `studio/src/app/studioView.ts`, añade `updateSlice` al import existente de `../daw/slicing` (que ya trae `equalSlices`, `detectOnsets`, `marksToSlices`, `sliceIndexForNote`):

```ts
import { equalSlices, detectOnsets, marksToSlices, sliceIndexForNote, updateSlice } from '../daw/slicing';
```

- [ ] **Step 2: Add the `onUpdateSlice` callback in `renderSamples()`**

En `renderSamples()`, en el objeto de opciones de `mountSampleEditor(host, { ... })`, añade el callback `onUpdateSlice`. Reutiliza el patrón de `applySlices` pero **sin** re-montar el editor:

```ts
      onUpdateSlice: (index, patch) => {
        const ch = findChannel(daw, selectedId);
        if (ch?.instrument.kind !== 'slicer') return;
        const slices = updateSlice(ch.instrument.slices, index, patch);
        const spec = { ...ch.instrument, slices };
        daw = updateChannel(daw, selectedId, { instrument: spec });
        channels.find(a => a.id === selectedId)?.setInstrument(spec);
        persist();   // NO renderSamples(): el editor no se re-monta mientras arrastras un knob
      },
```

(Adapta los nombres a los reales del fichero: `findChannel`, `updateChannel`, `persist`, `channels`, `selectedId` ya existen en `mountStudioView`. Si el acceso al canal o a `setInstrument` difiere, ajústate al patrón que usa `applySlices`.)

- [ ] **Step 3: Verify typecheck, tests and build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS.

- [ ] **Step 4: Manual smoke test (prueba por vista/oído)**

Run: `cd studio && npm run dev` y abre la URL.
Verifica en un canal **Slicer** con un audio troceado:
1. **Clic** en un slice de la lista lo **resalta**, lo hace sonar y abre el panel debajo.
2. Sube la **Ganancia** → ese slice suena más fuerte (▶).
3. Marca **Reverse** → suena al revés.
4. Sube **Fade in / Fade out** → el slice entra/sale con fundido.
5. Los cambios **persisten** al guardar/abrir el proyecto, y afectan al secuenciador.
6. Mover un knob de forma continua **no corta el arrastre** (el panel no parpadea).

- [ ] **Step 5: Commit**

```bash
git add studio/src/app/studioView.ts
git commit -m "Estudio sampler S3: cablea la edición por slice (onUpdateSlice → updateSlice + audio + persist, sin re-montar)"
```

---

### Task 4: Docs y versión

**Files:**
- Modify: `studio/package.json` (subir `version` a `0.18.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.18.0"`.

- [ ] **Step 2: Update HANDOFF.md**

Añade en la zona de estado del Estudio:

```markdown
**Estudio · Sampler con slicing — S3 edición por slice (v0.18.0):** en el editor del canal `slicer` (pestaña
SAMPLES), al seleccionar un slice se abre un panel con **Ganancia**, **Reverse**, **Fade in** y **Fade out**
por slice (knobs + casilla), que suenan al instante y se persisten. El motor (`audio/slicer.ts`) y el modelo
(`SliceDef`) ya los soportaban desde S1; S3 añade la UI (`ui/sampleEditor.ts`) + helper puro `updateSlice`
(`daw/slicing.ts`, testeado) + cableado `onUpdateSlice` en `app/studioView.ts` (actualiza modelo/audio/persist
sin re-montar el editor). El **recorte inicio/fin** de cada slice se ajusta con las marcas (S2). Pendiente
S4: navegador de carpetas del disco.
```

- [ ] **Step 3: Update CLAUDE.md**

En la sección del Estudio (decisión 5), actualiza el estado del sampler: S3 (edición por slice:
ganancia/reverse/fades) hecha; pendiente S4 (navegador de carpetas del disco).

- [ ] **Step 4: Verify and commit**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio sampler S3: docs (HANDOFF/CLAUDE) y versión 0.18.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec (S3):**
- Ganancia por slice → Task 2 (knob) + Task 3 (cableado) ✅
- Reverse por slice → Task 2 (casilla) + Task 3 ✅
- Fade in/out por slice → Task 2 (knobs) + Task 3 ✅
- Helper inmutable para actualizar un slice → Task 1 (`updateSlice` + tests) ✅
- Recorte inicio/fin: cubierto por las **marcas** (S2); documentado en Task 4 ✅
- Docs/versión → Task 4 ✅
- (S4 navegador de carpetas → sub-tanda posterior, fuera de S3.)

**Build verde en cada tarea:** Task 1 (pura) y Task 2 (`onUpdateSlice` opcional) no rompen `studioView`; Task 3 lo cablea. Aditivo.

**Placeholders:** ninguno; el código va completo. El "TODO PASS" de la Task 3 significa "todo pasa".

**Consistencia de tipos:** `updateSlice(slices, index, patch): SliceDef[]` (Task 1) coincide con su uso en Task 3. `onUpdateSlice?: (index, patch: Partial<SliceDef>) => void` (Task 2) coincide con la llamada en Task 3. `mountKnob(root, { min, max, value, default?, size?, onChange })` es la firma real de `ui/knob.ts`. El resto de la firma de `mountSampleEditor` se conserva.

**Decisión consciente (no re-montar):** el cableado de `onUpdateSlice` **no** llama a `renderSamples()` a propósito, para que arrastrar un knob no destruya el knob a media interacción; gain/reverse/fade no cambian la onda dibujada, así que no hace falta redibujar. La selección de slice (`selected`) vive en el editor y se pierde al re-trocear (aceptable).
