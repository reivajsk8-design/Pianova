# Knob mejorado (menú + rueda) + mapear synthx/EQ por MIDI — Diseño

**Fecha:** 2026-07-07 · **Versión objetivo:** 0.40.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Mejorar los knobs y ampliar el mapeo MIDI: (1) menú de knob por clic derecho / long-press con **Resetear** y
**Teclear valor** en TODOS los knobs (además de Asignar/Quitar MIDI en los mapeables); (2) **rueda del ratón**
para cambiar el valor con pasos normal/grueso(Shift)/fino(Ctrl); (3) hacer **mapeables por MIDI** los knobs del
**sinte editable (synthx)** y del **editor de EQ**.

## Decisiones tomadas (con el usuario)

- **Rueda:** sin modificador ~**2%** del rango; **Shift** ~**10%** (grueso); **Ctrl** ~**0,5%** (fino).
- **Menú de knob** (clic derecho / long-press) en todos: Resetear (al valor por defecto), Teclear valor (prompt);
  en los mapeables además Asignar/Quitar MIDI.
- **synthx/EQ mapeables** — con la salvedad de que **responden al mando mientras su editor/panel está abierto**
  (sus knobs se montan bajo demanda; Vol/Pan/efectos están siempre montados).
- Solo UI. Se ejecuta con el flujo completo (spec → plan → subagentes) por tocar `ui/knob.ts` (compartido).

## Arquitectura

- **`ui/knob.ts`:** rueda con `wheelStepFraction` (helper puro testeable); el menú de knob (contextmenu +
  long-press) se monta **siempre** (no solo con `midiId`); reutiliza `setValue` para el aplicado (MIDI/rueda/menú).
- **`ui/knobMenu.ts`** (renombra `ui/midiMenu.ts`): `openKnobMenu(x, y, actions)` con Resetear / Teclear valor /
  Asignar-Quitar MIDI, según lo que pase el knob. Mantiene el aviso + Esc/clic-fuera cancela.
- **`ui/synthEditor.ts` / `ui/eqEditor.ts`:** sus knobs reciben `midiId`.
- **`app/studioView.ts`:** pasa el prefijo del canal al editor synthx.

### `ui/knob.ts`

- Helper puro: `wheelStepFraction(shift: boolean, ctrl: boolean): number` → `shift ? 0.1 : ctrl ? 0.005 : 0.02`.
- Rueda (siempre): listener `wheel` con `{ passive: false }`:
  `e.preventDefault(); const dir = e.deltaY < 0 ? 1 : -1; setValue(value + dir * range * wheelStepFraction(e.shiftKey, e.ctrlKey)); opts.onChange(value);`.
- Menú (siempre): `contextmenu` (con `preventDefault`) y **long-press táctil** (~500 ms sin arrastrar, `dragging=false`
  al abrir) → `openKnobMenu(x, y, actions)` con:
  - `reset: opts.default !== undefined ? () => { setValue(opts.default!); opts.onChange(value); } : undefined`.
  - `typeValue: () => { const s = prompt('Valor exacto:', String(Math.round(value * 1000) / 1000)); if (s == null) return; const n = parseFloat(s.replace(',', '.')); if (!Number.isNaN(n)) { setValue(n); opts.onChange(value); } }`.
  - `midiId: opts.midiId` (o `undefined`).
  - `onChanged: refreshDot` (repinta el `.mapped`).
- El bloque MIDI (`midiLearn.register`, puntito `.mapped`) sigue **condicionado** a `opts.midiId`, pero ahora el
  setter usa `setValue`: `midiLearn.register(id, v01 => { setValue(opts.min + v01 * range); opts.onChange(value); })`.

### `ui/knobMenu.ts` (renombrado desde `midiMenu.ts`)

```ts
export interface KnobMenuActions {
  reset?: () => void;
  typeValue: () => void;
  midiId?: string;
  onChanged: () => void;
}
export function openKnobMenu(x: number, y: number, a: KnobMenuActions): void;
```

- Construye los ítems: **Resetear** (si `a.reset`), **Teclear valor…** (siempre), y si `a.midiId`: **🎹 Asignar
  MIDI** + **Quitar (CC X)** (si hay binding). Cada ítem cierra el menú y ejecuta su acción (Teclear cierra el
  menú **antes** del `prompt`). MIDI: usa `midiLearn.arm/clear` + aviso, igual que ahora.
- Mantiene los handlers de módulo (clic-fuera/Esc → cancela aprendizaje armado + cierra), con el guard
  `typeof document !== 'undefined'`. Reutiliza las clases CSS `.midiMenu`/`.midiToast` (sin CSS nuevo).

### `ui/synthEditor.ts`

- `opts` gana `midiPrefix?: string`. Cada knob: `midiId: opts.midiPrefix ? \`synthx:${opts.midiPrefix}:${key}\` : undefined`.
  El re-montaje interno (al aplicar un preset) **propaga** `midiPrefix` en su llamada recursiva a
  `mountSynthEditor`.

### `ui/eqEditor.ts`

- Los 4 knobs de dinámica reciben ids genéricos (banda visible): `eq:thr`, `eq:range`, `eq:atk`, `eq:rel`
  (`midiId: 'eq:thr'` … en cada `mountKnob`).

### `app/studioView.ts`

- En la llamada a `mountSynthEditor(host, {...})`, añade `midiPrefix: selectedId`.

## Persistencia y compatibilidad

- El mapa MIDI (`localStorage['estudio-midimap']`) ya existe; los nuevos ids (`synthx:*`, `eq:*`) se guardan
  igual. Sin cambios de esquema. Knobs sin `midiId` (ninguno los pierde) igual que antes.

## Qué NO cambia

- El motor, el modelo, el resto de la vista. El doble-clic de reset del knob se mantiene (además del menú).

## Bordes

- **synthx/EQ solo mientras visibles:** sus knobs registran su setter al montarse; el CC solo los mueve mientras
  su editor/panel está abierto (synthx: canal seleccionado en PADS; EQ: overlay abierto). Documentado.
- **EQ genérico por banda:** `eq:thr` etc. controlan la banda **visible** del editor abierto (los knobs se
  re-montan al cambiar de banda). Dos EQ distintos comparten esos ids.
- **Rueda:** `preventDefault` evita el scroll de página al girar sobre el knob.
- **Teclear valor:** `prompt` acepta coma o punto decimal; valor fuera de rango se recorta (via `setValue`).

## Pruebas

- **Unitarias (Vitest, `ui/knob.test.ts`):** `wheelStepFraction`: `(false,false)→0.02`, `(true,false)→0.1`,
  `(false,true)→0.005`, `(true,true)→0.1` (Shift gana).
- **No unitarias (typecheck + build + a mano en la URL):** clic derecho en un knob → Resetear / Teclear valor;
  rueda normal/Shift/Ctrl; asignar MIDI a un knob de synthx (canal seleccionado) y del editor de EQ y comprobar
  que el mando físico los mueve con el editor abierto.

## Restricciones globales

- Todo en `studio/`; no tocar `pianova.html`. TypeScript strict; sin dependencias nuevas.
- Comentarios/UI en español. Acento verde neón (`#2dff6a` / `var(--pv-acc)`).
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
