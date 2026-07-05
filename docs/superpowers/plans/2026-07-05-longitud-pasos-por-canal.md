# Longitud de pasos por canal (páginas de 16) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poder alargar la secuencia de un canal en páginas de 16 pasos (16→32→48…) solo en los canales elegidos, sonando cada canal a su propia longitud.

**Architecture:** La longitud de un canal = la longitud de su array de pasos en ese patrón (ya se guarda así); helpers puros `channelLen`/`addStepsPage`/`removeStepsPage`. El secuenciador avanza al máximo (canal más largo) y cada canal lee `arr[step % arr.length]`. La UI muestra 16 pasos por página con ＋16/−16 y pestañas de página. Sin tocar el motor de audio.

**Tech Stack:** Vite + TypeScript (strict) + Vitest. DOM.

## Global Constraints

- Todo el trabajo en `studio/` (NO tocar `pianova.html`). TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón `var(--pv-acc)`.
- No cambiar el motor de audio ni el disparo: esto es modelo (longitud) + reproducción + UI.
- Una página = 16 pasos (`DEFAULT_STEPS`); un canal nunca baja de una página.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build` (desde `studio/`).

---

### Task 1: Helpers de longitud por canal (`daw/model.ts`)

**Files:**
- Modify: `studio/src/daw/model.ts`
- Modify: `studio/src/daw/model.test.ts`

**Interfaces:**
- Produces:
  - `channelLen(daw: DawState, id: string): number` — longitud del canal en el patrón actual (o `daw.steps`).
  - `addStepsPage(daw: DawState, id: string): DawState` — añade 16 pasos vacíos al final (patrón actual, inmutable).
  - `removeStepsPage(daw: DawState, id: string): DawState` — quita 16 del final; mínimo 16 (inmutable).

- [ ] **Step 1: Write the failing test (añadir a `daw/model.test.ts`)**

Añade al final del archivo:

```ts
import {
  channelLen, addStepsPage, removeStepsPage
} from './model';

describe('longitud de pasos por canal', () => {
  it('channelLen devuelve la longitud del canal en el patrón actual (16 por defecto)', () => {
    const d = defaultDaw();
    expect(channelLen(d, d.channels[0].id)).toBe(16);
  });
  it('addStepsPage añade 16 pasos (apagados) al canal, inmutable', () => {
    const d = defaultDaw(); const id = d.channels[0].id;
    const d2 = addStepsPage(d, id);
    expect(channelLen(d2, id)).toBe(32);
    expect(channelLen(d, id)).toBe(16);                    // original intacto
    expect(channelSteps(d2, id).slice(16).every(s => s.on === false)).toBe(true);
  });
  it('removeStepsPage quita 16, con mínimo de una página', () => {
    const id = defaultDaw().channels[0].id;
    let e = addStepsPage(defaultDaw(), id);                // 32
    e = removeStepsPage(e, id);                            // 16
    expect(channelLen(e, id)).toBe(16);
    const e2 = removeStepsPage(e, id);                     // ya en 16 → se queda en 16
    expect(channelLen(e2, id)).toBe(16);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd studio && npm test -- model`
Expected: FAIL (no existen `channelLen`/`addStepsPage`/`removeStepsPage`).

- [ ] **Step 3: Add the helpers to `daw/model.ts`**

Añade (p. ej. tras `channelSteps`, que ya usa `daw.current`):

```ts
// Longitud (nº de pasos) del canal en el patrón ACTUAL; por defecto daw.steps si no existe el array.
export function channelLen(daw: DawState, id: string): number {
  return daw.patterns[daw.current]?.steps[id]?.length ?? daw.steps;
}

// Añade una página (DEFAULT_STEPS pasos vacíos) al final del canal en el patrón actual (inmutable).
export function addStepsPage(daw: DawState, id: string): DawState {
  return {
    ...daw,
    patterns: daw.patterns.map((p, idx) => {
      if (idx !== daw.current) return p;
      const cur = p.steps[id] ?? emptySteps(daw.steps);
      return { steps: { ...p.steps, [id]: [...cur, ...emptySteps(DEFAULT_STEPS)] } };
    })
  };
}

// Quita una página (DEFAULT_STEPS pasos del final) del canal en el patrón actual; nunca por debajo de una página.
export function removeStepsPage(daw: DawState, id: string): DawState {
  return {
    ...daw,
    patterns: daw.patterns.map((p, idx) => {
      if (idx !== daw.current) return p;
      const cur = p.steps[id];
      if (!cur || cur.length <= DEFAULT_STEPS) return p;
      return { steps: { ...p.steps, [id]: cur.slice(0, cur.length - DEFAULT_STEPS) } };
    })
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd studio && npm test -- model`
Expected: PASS.

- [ ] **Step 5: Full check + commit**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS.

```bash
git add studio/src/daw/model.ts studio/src/daw/model.test.ts
git commit -m "Estudio pasos: helpers channelLen/addStepsPage/removeStepsPage + tests"
```

---

### Task 2: Reproducción por longitud de canal (`app/studioView.ts`)

**Files:**
- Modify: `studio/src/app/studioView.ts`

**Interfaces:**
- Consumes: `channelLen` (Task 1).
- Produce: `getTotalSteps` = máximo de longitudes del patrón que suena; `onStep` lee `arr[step % arr.length]`
  por canal; `recordStep` cuantiza con la longitud del canal seleccionado.

Sin test unitario (integración de reproducción); verificado por typecheck + tests verdes + build. Con todos los
canales a 16, el comportamiento es idéntico al actual (máx=16, `i % 16 = i`).

- [ ] **Step 1: Importa `channelLen`**

Añade `channelLen` a la lista de imports de `'../daw/model'`:

```ts
  addPattern, removePattern, setCurrentPattern, setSong, defaultSynthxInstrument, defaultSlicerInstrument,
  syncChannelIdSeed, defaultDaw, channelLen
} from '../daw/model';
```

- [ ] **Step 2: `getTotalSteps` = máximo del patrón que suena**

Sustituye:

```ts
    getTotalSteps: () => daw.steps,
```

por:

```ts
    getTotalSteps: () => {
      const pIdx = (songMode && daw.song.length) ? playPattern : daw.current;
      const pat = daw.patterns[pIdx];
      if (!pat) return daw.steps;
      let m = daw.steps;
      for (const c of daw.channels) { const L = pat.steps[c.id]?.length ?? 0; if (L > m) m = L; }
      return m;
    },
```

- [ ] **Step 3: `onStep` lee el paso del canal con envoltura**

En `onStep`, sustituye:

```ts
        const st = pat.steps[c.id]?.[i];
        if (!st || !st.on) continue;
```

por:

```ts
        const arr = pat.steps[c.id];
        const st = (arr && arr.length) ? arr[i % arr.length] : undefined;   // cada canal repite a su longitud
        if (!st || !st.on) continue;
```

- [ ] **Step 4: `recordStep` cuantiza con la longitud del canal**

Sustituye el cuerpo de `recordStep`:

```ts
  function recordStep(m: number, v: number): void {
    const step = ((Math.round(transport.beatNow() * STEPS_PER_BEAT) % daw.steps) + daw.steps) % daw.steps;
    daw = setStep(daw, selectedId, step, { on: true, note: m, vel: v });
    persist(); renderSelected();
  }
```

por:

```ts
  function recordStep(m: number, v: number): void {
    const len = channelLen(daw, selectedId);
    const step = ((Math.round(transport.beatNow() * STEPS_PER_BEAT) % len) + len) % len;
    daw = setStep(daw, selectedId, step, { on: true, note: m, vel: v });
    persist(); renderSelected();
  }
```

- [ ] **Step 5: Verify typecheck, tests and build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS.

- [ ] **Step 6: Commit**

```bash
git add studio/src/app/studioView.ts
git commit -m "Estudio pasos: reproducción por longitud de canal (getTotalSteps máx + arr[i%len] + recordStep)"
```

---

### Task 3: UI de páginas + control ＋16/−16 (`app/studioView.ts` + CSS)

**Files:**
- Modify: `studio/src/app/studioView.ts`
- Modify: `studio/src/ui/styles.css`

**Interfaces:**
- Consumes: `channelLen` (ya importado en Task 2), `addStepsPage`, `removeStepsPage` (Task 1);
  `mountStepGrid`/`mountPianoRoll` con `total: 16` (una página) y callbacks desplazados por `stepPage`.

Integración (DOM); sin test unitario. Verificado por typecheck + build + prueba a vista/oído.

- [ ] **Step 1: Importa las funciones de página + estado**

(a) Añade `addStepsPage, removeStepsPage` al import de `'../daw/model'` (junto a `channelLen`):

```ts
  syncChannelIdSeed, defaultDaw, channelLen, addStepsPage, removeStepsPage
} from '../daw/model';
```

(b) Junto a los `let` del principio de `mountStudioView` (p. ej. tras `let prLow = 48;`), añade:

```ts
  const PAGE = 16;    // una página = 16 pasos
  let stepPage = 0;   // página visible del canal seleccionado
```

- [ ] **Step 2: Contenedor de la barra de longitud en el HTML**

En el panel de PADS, entre la etiqueta de pasos y la barra de escala:

```ts
      <div class="pvLbl" id="stepsLbl">PASOS</div>
      <div id="pvLenBar" class="pvLenBar"></div>
      <div id="pvScale" class="pvScale"></div>
      <div id="pvSteps" class="pvSteps"></div>
```

- [ ] **Step 3: Pintar la barra de longitud + páginas y montar la página visible (`renderSelected`)**

Sustituye **todo** el bloque de PASOS de `renderSelected` (desde el comentario
`// PASOS: piano-roll para canales melódicos; fila on/off para batería.` hasta
`selGrid = { setPlayhead: g.setPlayhead };` inclusive) por esta versión (añade barra de longitud + paginado):

```ts
    // PASOS: piano-roll para canales melódicos; fila on/off para batería. Longitud por canal, en páginas de 16.
    const stepsHost = root.querySelector('#pvSteps') as HTMLElement;
    const scaleHost = root.querySelector('#pvScale') as HTMLElement;
    const lenHost = root.querySelector('#pvLenBar') as HTMLElement;
    const melodic = !!ch && ch.instrument.kind !== 'drum';

    // Barra de longitud + páginas (para cualquier canal).
    const len = channelLen(daw, selectedId);
    const pages = Math.max(1, Math.ceil(len / PAGE));
    if (stepPage >= pages) stepPage = pages - 1;
    const pageTabs = pages > 1
      ? '<span class="pvPages">Pág:' + Array.from({ length: pages }, (_, p) =>
          `<button class="pvPage${p === stepPage ? ' on' : ''}" data-page="${p}">${p + 1}</button>`).join('') + '</span>'
      : '';
    lenHost.innerHTML = `<span>Longitud</span>`
      + `<button class="pvLenBtn" data-lenminus title="Quitar 16 pasos">−16</button>`
      + `<span class="pvLenN">${len} pasos</span>`
      + `<button class="pvLenBtn" data-lenplus title="Añadir 16 pasos">＋16</button>${pageTabs}`;
    (lenHost.querySelector('[data-lenplus]') as HTMLButtonElement).addEventListener('click', () => {
      daw = addStepsPage(daw, selectedId); persist(); renderSelected();
    });
    (lenHost.querySelector('[data-lenminus]') as HTMLButtonElement).addEventListener('click', () => {
      daw = removeStepsPage(daw, selectedId); persist(); renderSelected();
    });
    lenHost.querySelectorAll<HTMLButtonElement>('.pvPage').forEach(b =>
      b.addEventListener('click', () => { stepPage = +(b.dataset.page ?? '0'); renderSelected(); }));

    const off = stepPage * PAGE;   // desplazamiento de la página visible
    if (melodic) {
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
        total: PAGE, lowMidi: prLow, scaleRoot: daw.scaleRoot, scaleType: daw.scaleType,
        getStep: (i) => channelSteps(daw, selectedId)[off + i],
        onSetNote: (i, midi) => {
          const cur = channelSteps(daw, selectedId)[off + i];
          daw = setStep(daw, selectedId, off + i, midi == null ? { on: false } : { on: true, note: midi, vel: cur?.vel });
          persist();
        },
        onRange: (lo) => { prLow = lo; }
      });
      selGrid = { setPlayhead: pr.setPlayhead };
    } else {
      scaleHost.innerHTML = '';
      const g = mountStepGrid(stepsHost, {
        total: PAGE,
        isOn: (i) => channelSteps(daw, selectedId)[off + i]?.on ?? false,
        onToggle: (i) => { daw = toggleStep(daw, selectedId, off + i); persist(); }
      });
      selGrid = { setPlayhead: g.setPlayhead };
    }
```

- [ ] **Step 4: Cabezal por canal + página (`visualTick`)**

En `visualTick`, sustituye:

```ts
    if (playing) {
      const s = ((Math.floor(transport.beatNow() * STEPS_PER_BEAT) % daw.steps) + daw.steps) % daw.steps;
      selGrid?.setPlayhead(s);
    }
```

por:

```ts
    if (playing) {
      const len = channelLen(daw, selectedId);
      const s = ((Math.floor(transport.beatNow() * STEPS_PER_BEAT) % len) + len) % len;
      selGrid?.setPlayhead(Math.floor(s / PAGE) === stepPage ? (s % PAGE) : -1);   // solo si suena esta página
    }
```

- [ ] **Step 5: Reinicia la página al cambiar de canal (`selectChannel`)**

En `selectChannel`, añade `stepPage = 0;` junto a `selectedId = id;`:

```ts
  function selectChannel(id: string): void { selectedId = id; stepPage = 0; sliceHits.length = 0; routeKeyboardToSelected(); renderPads(); renderSelected(); renderSamples(); renderMixer(); renderSelectedRack(); }
```

- [ ] **Step 6: CSS (`ui/styles.css`)**

Añade al final:

```css
/* Barra de longitud de pasos + páginas */
.pvLenBar{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:11px;color:var(--pv-muted);flex-wrap:wrap}
.pvLenBtn{background:#141a13;border:1px solid #2b3324;color:var(--pv-ink);border-radius:6px;padding:2px 8px;cursor:pointer;font-size:12px}
.pvLenBtn:hover{border-color:var(--pv-acc)}
.pvLenN{color:var(--pv-ink)}
.pvPages{display:flex;align-items:center;gap:4px;margin-left:8px}
.pvPage{background:#141a13;border:1px solid #2b3324;color:var(--pv-muted);border-radius:5px;padding:2px 8px;cursor:pointer;font-size:11px}
.pvPage.on{border-color:var(--pv-acc);color:#fff;box-shadow:0 0 6px var(--pv-acc-dim)}
```

- [ ] **Step 7: Verify typecheck, tests and build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS.

- [ ] **Step 8: Manual smoke test (prueba por vista/oído)**

Run: `cd studio && npm run dev` y abre la URL:
1. En un canal, **＋16** lo alarga a 32 pasos y aparecen pestañas **Pág: 1 2**; **−16** lo acorta (mínimo 16).
2. En **Pág. 2** pones más notas (piano-roll) o pasos (batería); el **cabezal** solo recorre la página que suena.
3. Un canal de **32** hace su melodía larga mientras otro de **16** se repite, sin descuadrarse.
4. Cambiar de canal vuelve a la **Pág. 1**; la longitud de cada canal **persiste** al guardar/abrir.

- [ ] **Step 9: Commit**

```bash
git add studio/src/app/studioView.ts studio/src/ui/styles.css
git commit -m "Estudio pasos: UI de páginas de 16 + control ＋16/−16 por canal"
```

---

### Task 4: Docs y versión

**Files:**
- Modify: `studio/package.json` (subir `version` a `0.23.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.23.0"`.

- [ ] **Step 2: Update HANDOFF.md**

Añade en la zona de estado del Estudio:

```markdown
**Estudio · Longitud de pasos por canal (v0.23.0):** cada canal puede tener **16/32/48…** pasos en **páginas
de 16** (＋16/−16 en la zona de PASOS, con pestañas de página), **solo en los canales elegidos**. La longitud
es la del array de pasos del canal en ese patrón; helpers `channelLen`/`addStepsPage`/`removeStepsPage`
(`daw/model.ts`, testeados). El secuenciador avanza al **máximo** (canal más largo) y cada canal lee
`arr[step % arr.length]` → un canal de 16 se repite mientras uno de 32 hace su melodía, sin descuadrarse
(todo múltiplos de 16). La UI muestra 16 pasos por página; el cabezal solo recorre la página que suena. Sin
cambios de motor. (La barra de patrones/canción se simplificará aparte.)
```

- [ ] **Step 3: Update CLAUDE.md**

En la sección del Estudio (decisión 5), tras los arreglos v0.22.x, añade: **longitud de pasos por canal
(v0.23.0): cada canal puede alargarse en páginas de 16 (＋16/−16), sonando cada uno a su longitud**
(`daw/model.ts` `channelLen`/`addStepsPage`/`removeStepsPage`; sin cambios de motor).

- [ ] **Step 4: Verify and commit**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio pasos: docs (HANDOFF/CLAUDE) y versión 0.23.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- Helpers channelLen/addStepsPage/removeStepsPage + tests → Task 1 ✅
- Reproducción por longitud (getTotalSteps máx, arr[i%len], recordStep) → Task 2 ✅
- UI páginas + ＋16/−16 + cabezal por página + reset al cambiar canal → Task 3 ✅
- Docs/versión → Task 4 ✅

**Placeholders:** ninguno; código completo. (En el test de Task 1, el canal 'x' inexistente no crea array; se
prueba con el canal real de `defaultDaw()`.)

**Consistencia de tipos:** `channelLen(daw,id)`/`addStepsPage(daw,id)`/`removeStepsPage(daw,id)` (Task 1)
coinciden con su uso en Tasks 2–3. `PAGE=16=DEFAULT_STEPS` (páginas). `channelSteps`, `setStep`, `toggleStep`,
`mountStepGrid`, `mountPianoRoll` (total/getStep/onSetNote/onToggle/onRange/setPlayhead), `selGrid`, `prLow`,
`stepPage`, `NOTE_NAMES`, `SCALE_LABELS` ya existen/definidos. `getTotalSteps`/`onStep`/`visualTick` usan
`daw.current`/`playPattern`/`songMode`, todos en ámbito.

**Estado intermedio válido:** Task 1 (helpers) no altera la vista. Task 2 (reproducción) es no-op con todo a 16.
Task 3 añade la UI que crea longitudes >16. Cada tarea compila.
