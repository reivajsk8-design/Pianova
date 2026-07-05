# Estudio compacto estilo VST — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que PIANOVA STUDIO se vea más compacto y pro: la cadena de efectos siempre visible y en horizontal (dos filas: Canal y Máster), módulos de efecto compactos, y menos espacios entre secciones.

**Architecture:** Solo cambia la presentación. Se elimina el cajón inferior deslizante (`#fxDrawer` + botón `🎛 Efectos`) y se pone una sección fija `#fxSection` (antes del teclado) con los dos racks. El rack pasa a disponer sus efectos en horizontal (CSS) y sus botones de mover a ◀/▶. La lógica de efectos (añadir/bypass/mover/quitar/knobs/persistencia) no cambia.

**Tech Stack:** Vite + TypeScript (strict) + Vitest. CSS. Sin framework de UI.

## Global Constraints

- Todo el trabajo en `studio/` (NO tocar `pianova.html`). TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón `var(--pv-acc)`.
- No cambiar el motor de audio ni la lógica de efectos: solo disposición (HTML de la vista), plantilla del rack y CSS.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build` (comandos siempre desde `studio/`).

---

### Task 1: Efectos siempre visibles + cadena horizontal (`app/studioView.ts` + `ui/rack.ts` + CSS)

**Files:**
- Modify: `studio/src/app/studioView.ts`
- Modify: `studio/src/ui/rack.ts`
- Modify: `studio/src/ui/styles.css`

**Interfaces:**
- Consumes: `mountRack(root, rack, title, onChange)` (sin cambios); `#chRack`/`#masterRack` (mismos ids, nuevo contenedor).
- Produces: sección `#fxSection` fija (dos filas horizontales). El cajón `#fxDrawer`, el botón `#fxToggle` y su cableado desaparecen.

Integración (DOM/CSS); sin test unitario. Verificado por typecheck + build.

- [ ] **Step 1: Quitar el botón "🎛 Efectos" de la cabecera (`studioView.ts`)**

Borra esta línea del `root.innerHTML` (dentro de `.pvHdrBtns`):

```ts
          <button id="fxToggle">🎛 Efectos</button>
```

- [ ] **Step 2: Sustituir el cajón por la sección fija antes del teclado (`studioView.ts`)**

Reemplaza este bloque (teclado + ayuda + cajón):

```ts
      <div id="stKeyboard"></div>
      <p class="muted">Toca con el ratón, las teclas <b>A S D F G H J K</b> / <b>W E T Y U</b>, o tu teclado MIDI.</p>
      <div id="fxDrawer" class="fxDrawer">
        <div class="fxDrawerHead"><b id="fxTitle">Efectos</b><span class="grow"></span>
          <button id="fxClose" class="chBtn" title="Cerrar el panel">✕ Cerrar</button></div>
        <div class="racks"><div id="chRack"></div><div id="masterRack"></div></div>
      </div>
    </div>`;
```

por (la sección de efectos queda **antes** del teclado y siempre visible):

```ts
      <div id="fxSection" class="fxSection">
        <div id="chRack"></div>
        <div id="masterRack"></div>
      </div>
      <div id="stKeyboard"></div>
      <p class="muted">Toca con el ratón, las teclas <b>A S D F G H J K</b> / <b>W E T Y U</b>, o tu teclado MIDI.</p>
    </div>`;
```

- [ ] **Step 3: Quitar la referencia a `#fxTitle` en `renderSelectedRack` (`studioView.ts`)**

En `renderSelectedRack()`, borra esta línea (el `#fxTitle` ya no existe; el título de la fila lo pone `mountRack`):

```ts
    const titleEl = root.querySelector('#fxTitle'); if (titleEl) titleEl.textContent = 'Efectos · Canal ' + n;
```

- [ ] **Step 4: Quitar el cableado del cajón (`studioView.ts`)**

Borra este bloque completo (el comentario y las 4 líneas):

```ts
  // ---------- cajón de efectos ----------
  const fxDrawer = root.querySelector('#fxDrawer') as HTMLElement;
  function openDrawer(): void { fxDrawer.classList.add('open'); }
  (root.querySelector('#fxClose') as HTMLButtonElement).addEventListener('click', () => fxDrawer.classList.remove('open'));
  (root.querySelector('#fxToggle') as HTMLButtonElement).addEventListener('click', () => { audioOn(); fxDrawer.classList.toggle('open'); });
```

- [ ] **Step 5: Ajustar el handler `data-fx` (ya no abre cajón) (`studioView.ts`)**

Busca la línea que usa `openDrawer()` (en el listener de clics del mixer) y quítale la llamada:

```ts
    const fx = t.getAttribute('data-fx'); if (fx) { selectChannel(fx); openDrawer(); return; }
```

déjala así (seleccionar el canal ya muestra sus efectos en la sección fija):

```ts
    const fx = t.getAttribute('data-fx'); if (fx) { selectChannel(fx); return; }
```

- [ ] **Step 6: Botones de mover ◀ ▶ en el rack (`ui/rack.ts`)**

En `ui/rack.ts`, dentro de la plantilla de `.fxHead`, sustituye los botones ↑/↓ por ◀/▶ (misma lógica `rack.move`, solo cambian glifo y `title`):

```ts
          <button class="chBtn" data-up="${e.id}" title="Subir">↑</button>
          <button class="chBtn" data-down="${e.id}" title="Bajar">↓</button>
```

por:

```ts
          <button class="chBtn" data-up="${e.id}" title="Mover a la izquierda">◀</button>
          <button class="chBtn" data-down="${e.id}" title="Mover a la derecha">▶</button>
```

- [ ] **Step 7: CSS — cadena horizontal + módulo compacto (`ui/styles.css`)**

(a) Cambia `.rackList` (de columna a fila con scroll horizontal). Sustituye:

```css
.rackList { display:flex; flex-direction:column; gap:10px; }
```

por:

```css
.rackList { display:flex; flex-flow:row nowrap; gap:10px; overflow-x:auto; padding-bottom:6px; }
```

(b) Da ancho fijo al módulo de efecto. Sustituye:

```css
.fxCard { border:1px solid var(--line); border-radius:10px; padding:10px; background:var(--bg); }
```

por:

```css
.fxCard { flex:0 0 156px; width:156px; border:1px solid var(--line); border-radius:10px; padding:10px; background:var(--bg); }
```

(c) Pon los knobs en fila que envuelve (2 por fila dentro del módulo). Sustituye:

```css
.fxParams { display:flex; flex-wrap:wrap; gap:8px 14px; }
```

por:

```css
.fxParams { display:flex; flex-flow:row wrap; justify-content:center; gap:8px; }
```

- [ ] **Step 8: CSS — quitar el cajón y añadir la sección fija (`ui/styles.css`)**

(a) Sustituye el bloque del cajón deslizante:

```css
/* ---------- Panel inferior de efectos (cajón deslizante) ---------- */
.fxDrawer { position:fixed; left:0; right:0; bottom:0; z-index:50; background:linear-gradient(#0b0f0a,#070a06); border-top:1px solid #2b3324; box-shadow:0 -10px 28px rgba(0,0,0,.55); transform:translateY(101%); transition:transform .22s cubic-bezier(.32,.72,0,1); max-height:34vh; overflow:auto; padding:8px 16px 12px; }
.fxDrawer.open { transform:translateY(0); }
.fxDrawerHead { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.fxDrawerHead b { font-size:14px; }
#fxClose { width:auto; padding:0 10px; height:28px; }
.fxDrawer .racks { margin-top:0; }
```

por (sección fija de dos filas, compacta):

```css
/* ---------- Sección de efectos (cadena horizontal, siempre visible) ---------- */
.fxSection { display:flex; flex-direction:column; gap:8px; margin:10px 0; }
.fxSection .rack { min-width:0; padding:8px 10px; }
.fxSection .rackHead { margin-bottom:6px; }
.fxSection .fxCard { padding:7px 8px; }
.fxSection .fxHead b { font-size:12px; }
.fxSection .fxKnobLab, .fxSection .fxKnobVal { font-size:9px; }
```

(b) Borra el bloque de overrides del cajón (ya no hay `.fxDrawer`):

```css
.fxDrawer .rack{padding:8px 10px;min-width:220px;border-radius:8px}
.fxDrawer .rackHead{margin-bottom:6px}
.fxDrawer .fxCard{padding:6px 8px}
.fxDrawer .fxHead b{font-size:12px}
.fxDrawer .fxParams{gap:8px}
.fxDrawer .fxKnobLab{font-size:9px}
.fxDrawer .fxKnobVal{font-size:9px}
```

- [ ] **Step 9: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS. (No debe quedar ninguna referencia a `fxDrawer`, `fxToggle`, `fxClose`, `fxTitle`, `openDrawer` — si el typecheck se queja de alguna, quítala.)

- [ ] **Step 10: Commit**

```bash
git add studio/src/app/studioView.ts studio/src/ui/rack.ts studio/src/ui/styles.css
git commit -m "Estudio compacto: efectos siempre visibles en cadena horizontal (dos filas Canal/Máster)"
```

---

### Task 2: Pasada de densidad (menos espacios) (`ui/styles.css`)

**Files:**
- Modify: `studio/src/ui/styles.css`

**Interfaces:**
- Consumes/Produce: solo valores de spacing; sin cambios de estructura ni de clases.

Solo CSS; sin test unitario. Verificado por typecheck + build + prueba a ojo.

- [ ] **Step 1: Teclado más bajo y con menos margen**

Sustituye:

```css
.kb { position:relative; display:flex; height:160px; max-width:720px; margin:18px 0; user-select:none; touch-action:none; }
```

por:

```css
.kb { position:relative; display:flex; height:140px; max-width:720px; margin:8px 0; user-select:none; touch-action:none; }
```

- [ ] **Step 2: Cabecera y secciones más juntas**

Sustituye estas reglas una a una:

```css
.pvBar{display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--pv-line);padding-bottom:10px;margin-bottom:12px}
```
→
```css
.pvBar{display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--pv-line);padding-bottom:8px;margin-bottom:8px}
```

```css
.pvTop{display:flex;gap:16px;margin-bottom:14px;flex-wrap:wrap}
```
→
```css
.pvTop{display:flex;gap:16px;margin-bottom:8px;flex-wrap:wrap}
```

```css
.pvGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
```
→
```css
.pvGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px}
```

```css
.pvSteps{margin-bottom:16px}
```
→
```css
.pvSteps{margin-bottom:10px}
```

```css
.pvParams{background:var(--pv-panel);border:1px solid var(--pv-line);border-radius:8px;padding:12px 16px}
```
→
```css
.pvParams{background:var(--pv-panel);border:1px solid var(--pv-line);border-radius:8px;padding:8px 10px}
```

```css
.pvSoundRow{display:flex;align-items:center;gap:12px;margin-bottom:14px}
```
→
```css
.pvSoundRow{display:flex;align-items:center;gap:12px;margin-bottom:8px}
```

- [ ] **Step 3: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add studio/src/ui/styles.css
git commit -m "Estudio compacto: pasada de densidad (menos márgenes/padding, teclado más bajo)"
```

---

### Task 3: Docs y versión

**Files:**
- Modify: `studio/package.json` (subir `version` a `0.20.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.20.0"`.

- [ ] **Step 2: Update HANDOFF.md**

Añade en la zona de estado del Estudio:

```markdown
**Estudio · Compacto estilo VST (v0.20.0):** la cadena de efectos deja de estar en el cajón inferior
deslizante (eliminado, con su botón "🎛 Efectos") y pasa a una **sección fija `#fxSection`** siempre visible,
antes del teclado, con **dos filas horizontales** (Canal seleccionado + Máster). Dentro de cada rack los
efectos se disponen en **horizontal** (`.rackList` en fila con scroll-x) como **módulos compactos** de ancho
fijo (`.fxCard` ~156px, knobs en rejilla 2×N); mover efectos ahora es **◀/▶**. Además una pasada de densidad
(menos márgenes/padding; teclado 160→140px). Solo presentación (`app/studioView.ts` + `ui/rack.ts` +
`ui/styles.css`); el motor y la lógica de efectos (añadir/bypass/mover/quitar/persistencia) no cambian.
```

- [ ] **Step 3: Update CLAUDE.md**

En la sección del Estudio (decisión 5), tras la mención de la iluminación reactiva, añade que la vista es ahora **más compacta estilo VST (v0.20.0): efectos siempre visibles en cadena horizontal (dos filas Canal/Máster) + pasada de densidad** (`app/studioView.ts` + `ui/rack.ts` + `ui/styles.css`, sin cambios de motor).

- [ ] **Step 4: Verify and commit**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio compacto: docs (HANDOFF/CLAUDE) y versión 0.20.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- Efectos siempre visibles (fuera del cajón) → Task 1 (Steps 2, 8) ✅
- Cadena horizontal → Task 1 (Step 7a `.rackList` row + overflow-x) ✅
- Dos filas Canal/Máster → Task 1 (Step 2 `#fxSection` con `#chRack` + `#masterRack`; CSS `.fxSection`) ✅
- Módulo compacto + ◀▶ → Task 1 (Steps 6, 7b, 7c, 8a) ✅
- Efectos antes del teclado → Task 1 (Step 2) ✅
- Pasada de densidad → Task 2 ✅
- Docs/versión → Task 3 ✅

**Placeholders:** ninguno; cada edición trae el CSS/HTML exacto (old→new). Los valores de densidad son concretos.

**Consistencia:** los ids `#fxSection`/`#chRack`/`#masterRack` del Step 2 coinciden con el CSS `.fxSection` del Step 8 y con los `mountRack(#chRack…)`/`mountRack(#masterRack…)` existentes (no se tocan). Se eliminan de forma coherente `#fxDrawer`/`#fxToggle`/`#fxClose`/`#fxTitle`/`openDrawer` (HTML en Steps 1-2, cableado en Steps 3-5), y el Step 9 verifica que no quede ninguna referencia colgando. Los botones `data-up`/`data-down` (Step 6) conservan su significado (mover -1/+1); solo cambia el glifo.

**Estado intermedio válido:** tras Task 1 el layout ya es horizontal y compacto; Task 2 solo aprieta espacios; ambos compilan de forma independiente.
