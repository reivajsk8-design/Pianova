# Knob mejorado (menú + rueda) + mapear synthx/EQ — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menú de knob (Resetear / Teclear valor / MIDI) por clic derecho en todos los knobs, rueda con pasos normal/Shift/Ctrl, y hacer mapeables por MIDI los knobs de synthx y del editor de EQ.

**Architecture:** `ui/knob.ts` monta el menú y la rueda siempre (helper puro `wheelStepFraction`), reutilizando `setValue`. `ui/midiMenu.ts` se renombra a `ui/knobMenu.ts` con `openKnobMenu(x,y,actions)` (reset/teclear/MIDI). `synthEditor.ts`/`eqEditor.ts` dan `midiId` a sus knobs; `studioView` pasa el prefijo de canal a synthx.

**Tech Stack:** Vite + TypeScript (strict) + Vitest. DOM (wheel/contextmenu/prompt).

## Global Constraints

- Todo el trabajo en `studio/` (NO tocar `pianova.html`). TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón (`#2dff6a` / `var(--pv-acc)`).
- Rueda: normal `0.02`, Shift `0.1`, Ctrl `0.005` (Shift gana). Mapa MIDI ya existe (`localStorage['estudio-midimap']`).
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build` (desde `studio/`).
- Commits con trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `ui/knob.ts` (rueda + menú general) + renombrar `midiMenu.ts` → `knobMenu.ts`

**Files:**
- Modify: `studio/src/ui/knob.ts`
- Create: `studio/src/ui/knobMenu.ts` (contenido generalizado)
- Delete: `studio/src/ui/midiMenu.ts`
- Modify: `studio/src/ui/knob.test.ts`

**Interfaces:**
- Consumes: `midiLearn` (`midi/learn`).
- Produces: `wheelStepFraction(shift, ctrl): number`; `KnobMenuActions`, `openKnobMenu(x, y, actions)`.

- [ ] **Step 1: Escribe el test que falla (añadir a `studio/src/ui/knob.test.ts`)**

Añade `wheelStepFraction` al `import` de `./knob` de la cabecera y, al final del archivo:

```ts
describe('wheelStepFraction', () => {
  it('normal 2%, Ctrl 0.5% fino, Shift 10% grueso (Shift gana)', () => {
    expect(wheelStepFraction(false, false)).toBe(0.02);
    expect(wheelStepFraction(false, true)).toBe(0.005);
    expect(wheelStepFraction(true, false)).toBe(0.1);
    expect(wheelStepFraction(true, true)).toBe(0.1);
  });
});
```

- [ ] **Step 2: Ejecuta el test para verlo fallar**

Run: `cd studio && npm test -- knob`
Expected: FAIL (`wheelStepFraction` no existe).

- [ ] **Step 3: Crea `studio/src/ui/knobMenu.ts` (menú general de knob) y borra `midiMenu.ts`**

Crea `studio/src/ui/knobMenu.ts` con:

```ts
// studio/src/ui/knobMenu.ts
// Menú flotante de un knob (clic derecho / long-press): Resetear, Teclear valor, y —en los mapeables— Asignar/
// Quitar MIDI. Más el aviso "Mueve un mando…" (Esc / clic fuera cancela el aprendizaje).
import { midiLearn } from '../midi/learn';

export interface KnobMenuActions {
  reset?: () => void;
  typeValue: () => void;
  midiId?: string;
  onChanged: () => void;
}

let menuEl: HTMLElement | null = null;
let toastEl: HTMLElement | null = null;

function closeMenu(): void { menuEl?.remove(); menuEl = null; }
function toast(msg: string, ms = 0): void {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'midiToast'; document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.classList.add('on');
  if (ms > 0) window.setTimeout(hideToast, ms);
}
function hideToast(): void { toastEl?.classList.remove('on'); }

export function openKnobMenu(x: number, y: number, a: KnobMenuActions): void {
  closeMenu();
  const b = a.midiId ? midiLearn.getBinding(a.midiId) : undefined;
  const items: string[] = [];
  if (a.reset) items.push(`<button data-a="reset">Resetear</button>`);
  items.push(`<button data-a="type">Teclear valor…</button>`);
  if (a.midiId) {
    items.push(`<button data-a="learn">🎹 Asignar MIDI</button>`);
    if (b) items.push(`<button data-a="clear">Quitar (CC ${b.cc})</button>`);
  }
  const el = document.createElement('div'); el.className = 'midiMenu';
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.innerHTML = items.join('');
  document.body.appendChild(el); menuEl = el;

  (el.querySelector('[data-a="reset"]') as HTMLButtonElement | null)?.addEventListener('click', () => { closeMenu(); a.reset?.(); });
  (el.querySelector('[data-a="type"]') as HTMLButtonElement).addEventListener('click', () => { closeMenu(); a.typeValue(); });
  const id = a.midiId;
  if (id) {
    (el.querySelector('[data-a="learn"]') as HTMLButtonElement).addEventListener('click', () => {
      closeMenu();
      midiLearn.arm(id, () => { const nb = midiLearn.getBinding(id); toast('✓ Asignado a CC ' + (nb ? nb.cc : '?'), 1600); a.onChanged(); });
      toast('Mueve un mando MIDI…  ·  Esc cancela');
    });
    (el.querySelector('[data-a="clear"]') as HTMLButtonElement | null)?.addEventListener('click', () => {
      midiLearn.clear(id); closeMenu(); a.onChanged();
    });
  }
}

// Cierra el menú al pulsar fuera; Esc / clic fuera cancela el aprendizaje armado. (Guardado con `typeof
// document` porque los tests de knob.ts corren sin DOM; en el navegador `document` siempre existe.)
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', e => {
    if (menuEl && !menuEl.contains(e.target as Node)) closeMenu();
    else if (!menuEl && midiLearn.armedId()) { midiLearn.cancel(); hideToast(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (midiLearn.armedId()) { midiLearn.cancel(); hideToast(); }
    closeMenu();
  });
}
```

Luego borra el archivo viejo:

```bash
git rm studio/src/ui/midiMenu.ts
```

- [ ] **Step 4: Edita `studio/src/ui/knob.ts`**

(a) Cambia el import de `./midiMenu` por `./knobMenu` y ajusta el símbolo:

```ts
import { midiLearn } from '../midi/learn';
import { openKnobMenu } from './knobMenu';
```

(b) Añade el helper puro (tras `valueToAngle`):

```ts
// Fracción del rango que mueve un paso de rueda: normal 2%, Ctrl fino 0.5%, Shift grueso 10% (Shift gana).
export function wheelStepFraction(shift: boolean, ctrl: boolean): number {
  return shift ? 0.1 : ctrl ? 0.005 : 0.02;
}
```

(c) Sustituye el bloque final `if (opts.midiId) { … }` (y el `return`) por esta versión (rueda + menú SIEMPRE;
el registro/puntito MIDI sigue condicionado a `midiId`):

```ts
  // Rueda del ratón: cambia el valor (normal / Shift grueso / Ctrl fino). preventDefault evita el scroll.
  root.addEventListener('wheel', e => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    setValue(value + dir * range * wheelStepFraction(e.shiftKey, e.ctrlKey));
    opts.onChange(value);
  }, { passive: false });

  const midiId = opts.midiId;
  const refreshDot = (): void => { if (midiId) root.classList.toggle('mapped', midiLearn.hasBinding(midiId)); };
  if (midiId) {
    // El mando físico mueve el knob y aplica (absoluto 0–127 → rango del parámetro).
    midiLearn.register(midiId, (v01) => { setValue(opts.min + v01 * range); opts.onChange(value); });
    refreshDot();
  }
  const openMenu = (x: number, y: number): void => openKnobMenu(x, y, {
    reset: opts.default !== undefined ? () => { setValue(opts.default as number); opts.onChange(value); } : undefined,
    typeValue: () => {
      const s = prompt('Valor exacto:', String(Math.round(value * 1000) / 1000));
      if (s == null) return;
      const n = parseFloat(s.replace(',', '.'));
      if (!Number.isNaN(n)) { setValue(n); opts.onChange(value); }
    },
    midiId, onChanged: refreshDot
  });
  root.addEventListener('contextmenu', e => { e.preventDefault(); openMenu(e.clientX, e.clientY); });
  // Long-press en táctil: abre el menú si mantienes sin arrastrar ~500 ms.
  let lpTimer: number | null = null;
  const cancelLp = (): void => { if (lpTimer != null) { clearTimeout(lpTimer); lpTimer = null; } };
  root.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    lpTimer = window.setTimeout(() => { dragging = false; openMenu(e.clientX, e.clientY); }, 500);
  });
  root.addEventListener('pointermove', cancelLp);
  root.addEventListener('pointerup', cancelLp);
  root.addEventListener('pointercancel', cancelLp);

  return { setValue };
}
```

(El `setValue` de knob NO llama a `onChange`; por eso el código lo llama aparte tras cada `setValue`. `dragging`,
`clamp`, `range`, `value`, `apply` ya están declarados arriba en `mountKnob`.)

- [ ] **Step 5: Ejecuta los tests para verlos pasar**

Run: `cd studio && npm test -- knob`
Expected: PASS (los de `valueToAngle` + el nuevo de `wheelStepFraction`).

- [ ] **Step 6: typecheck + test + build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: PASS (167 tests + el nuevo; ya no queda referencia a `midiMenu`).

- [ ] **Step 7: Commit**

```bash
git add studio/src/ui/knob.ts studio/src/ui/knobMenu.ts studio/src/ui/knob.test.ts
git commit -m "Estudio knob: menú (reset/teclear/MIDI) + rueda con pasos Shift/Ctrl; midiMenu→knobMenu"
```

---

### Task 2: `midiId` en synthx y EQ (+ prefijo del canal)

**Files:**
- Modify: `studio/src/ui/synthEditor.ts`
- Modify: `studio/src/ui/eqEditor.ts`
- Modify: `studio/src/app/studioView.ts`

**Interfaces:**
- Consumes: `KnobOpts.midiId` (Task 1 previa: ya existe).

Sin test unitario nuevo (DOM) — verificado por typecheck + build + prueba manual.

- [ ] **Step 1: `studio/src/ui/synthEditor.ts` — `midiPrefix` + `midiId` por knob**

(a) Añade `midiPrefix?: string` a las opciones de `mountSynthEditor` (en la firma/`opts`). En el objeto de opts,
junto a `params`/`onChange`/`onTest`, añade `midiPrefix?: string;`.

(b) En el `mountKnob` de cada knob (el del `knobs.forEach`), añade `midiId`:

```ts
    mountKnob(el, { min: spec.min, max: spec.max, value: p[key] as number, default: spec.def,
      midiId: opts.midiPrefix ? `synthx:${opts.midiPrefix}:${key}` : undefined,
      onChange: v => { (p[key] as number) = v; emit(); } });
```

(c) En el re-montaje interno (al aplicar un preset), **propaga** `midiPrefix`:

```ts
    if (pr) { p = { ...pr }; emit(); mountSynthEditor(root, { params: p, onChange: opts.onChange, onTest: opts.onTest, midiPrefix: opts.midiPrefix }); }
```

- [ ] **Step 2: `studio/src/ui/eqEditor.ts` — `midiId` en los 4 knobs de dinámica**

Añade `midiId` (ids genéricos de la banda visible) a cada `mountKnob`:

```ts
    mountKnob(host.querySelector('#kThr') as HTMLElement, { min: -60, max: 0, value: b.dyn.threshold, default: -24, size: 32, midiId: 'eq:thr', onChange: v => { eq.setDyn(sel, { threshold: v }); onChange(); } });
    mountKnob(host.querySelector('#kRange') as HTMLElement, { min: -18, max: 18, value: b.dyn.range, default: -6, size: 32, midiId: 'eq:range', onChange: v => { eq.setDyn(sel, { range: v }); onChange(); } });
    mountKnob(host.querySelector('#kAtk') as HTMLElement, { min: 1, max: 200, value: b.dyn.attack, default: 20, size: 32, midiId: 'eq:atk', onChange: v => { eq.setDyn(sel, { attack: v }); onChange(); } });
    mountKnob(host.querySelector('#kRel') as HTMLElement, { min: 20, max: 800, value: b.dyn.release, default: 150, size: 32, midiId: 'eq:rel', onChange: v => { eq.setDyn(sel, { release: v }); onChange(); } });
```

- [ ] **Step 3: `studio/src/app/studioView.ts` — pasa el prefijo del canal a synthx**

En la llamada a `mountSynthEditor(host, { … })` (en `renderSelected`, rama `synthx`), añade `midiPrefix: selectedId`:

```ts
      mountSynthEditor(host, {
        params: ch.instrument.params,
        midiPrefix: selectedId,
        onChange: (params) => { /* … el cuerpo existente, sin cambios … */ },
        onTest: () => { /* … existente … */ }
      });
```

(No cambies el cuerpo de `onChange`/`onTest`: solo añade la línea `midiPrefix: selectedId`.)

- [ ] **Step 4: typecheck + test + build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Prueba manual (a mano en la URL)**

Run: `cd studio && npm run dev`, con MIDI conectado:
1. Canal **synthx** seleccionado (PADS): clic derecho en un knob del sinte → **Asignar MIDI** → mueve un mando →
   se mapea; girando el mando cambia (con ese canal a la vista).
2. Abre el **editor de EQ** (✎) de un efecto EQ: clic derecho en un knob de dinámica → Asignar MIDI → funciona
   con el overlay abierto.
3. En cualquier knob: clic derecho → **Resetear** / **Teclear valor**; **rueda** normal/Shift/Ctrl.

- [ ] **Step 6: Commit**

```bash
git add studio/src/ui/synthEditor.ts studio/src/ui/eqEditor.ts studio/src/app/studioView.ts
git commit -m "Estudio MIDI: knobs de synthx (synthx:<canal>:<param>) y EQ (eq:*) mapeables"
```

---

### Task 3: Docs y versión

**Files:**
- Modify: `studio/package.json` (version → `0.40.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version** — en `studio/package.json`, `"version"` → `"0.40.0"`.

- [ ] **Step 2: HANDOFF.md** — añade en la zona de estado del Estudio (junto a las últimas entradas):

```markdown
**Estudio · knob mejorado + mapear synthx/EQ (v0.40.0):** menú de knob por clic derecho / long-press en TODOS
los knobs (**Resetear** al valor por defecto + **Teclear valor** con `prompt`; en los mapeables además Asignar/
Quitar MIDI). **Rueda** del ratón sobre el knob cambia el valor: normal 2%, **Shift** 10% (grueso), **Ctrl** 0,5%
(fino) — `wheelStepFraction` (puro, testeado). Los knobs del **sinte editable** (`synthx:<canal>:<param>`) y del
**editor de EQ** (`eq:thr/range/atk/rel`, banda visible) pasan a ser mapeables por MIDI (responden con su editor
abierto). `ui/midiMenu.ts` → **`ui/knobMenu.ts`** (`openKnobMenu`). Solo UI, sin motor.
```

- [ ] **Step 3: CLAUDE.md** — en la sección del Estudio (decisión 5), tras la entrada del mapeo MIDI (v0.39.0),
añade: **knob mejorado + mapear synthx/EQ (v0.40.0): menú de knob (Resetear/Teclear valor/MIDI) + rueda con
pasos Shift/Ctrl; synthx y EQ mapeables por MIDI** (`ui/knob.ts` + `ui/knobMenu.ts` + `ui/synthEditor.ts` +
`ui/eqEditor.ts`; sin cambios de motor).

- [ ] **Step 4: Verifica y commitea**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio knob/MIDI: docs (HANDOFF/CLAUDE) y versión 0.40.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- Rueda con `wheelStepFraction` (puro + test) + listener → Task 1 ✅
- Menú de knob general (reset/teclear/MIDI) + rename `midiMenu`→`knobMenu` → Task 1 ✅
- `midiId` en synthx (`synthx:<prefix>:<key>` + prefijo propagado) y EQ (`eq:*`) + wiring del prefijo → Task 2 ✅
- Persistencia (mapa MIDI existente, nuevos ids) → sin cambios de esquema ✅
- Docs/versión → Task 3 ✅

**Placeholders:** ninguno; el código va completo (knob, knobMenu, synthEditor, eqEditor, wiring).

**Consistencia de tipos:** `wheelStepFraction(shift,ctrl)` (Task 1) lo usa el listener del knob (Task 1) y el test.
`openKnobMenu(x,y,{reset?,typeValue,midiId?,onChanged})` (Task 1) lo llama el knob (Task 1). `KnobOpts.midiId` (ya
existía) lo pasan synthEditor/eqEditor (Task 2). `mountSynthEditor` gana `midiPrefix?` (Task 2) y studioView lo
pasa (`selectedId`, Task 2). Nombres coherentes.

**Estado intermedio válido:** Task 1 (knob+knobMenu; el menú/rueda son aditivos, knobs sin midiId igual) compila
y testea; Task 2 añade `midiId` (opcional) a synthx/EQ; Task 3 docs. Cada tarea deja el build verde.

**Decisión consciente:** el menú y la rueda se montan en TODOS los knobs (antes el menú solo con `midiId`); los
knobs sin `midiId` no muestran opciones MIDI ni puntito, pero sí Reset/Teclear/rueda. synthx/EQ responden al CC
solo mientras su editor está montado (registro por id ligado al DOM), documentado. La rueda hace `preventDefault`
para no scrollear la página al girar sobre el knob.
