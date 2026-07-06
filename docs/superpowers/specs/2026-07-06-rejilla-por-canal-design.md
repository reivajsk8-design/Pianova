# Resolución (rejilla) por canal — Diseño

**Fecha:** 2026-07-06 · **Versión objetivo:** 0.30.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Que cada canal pueda tener su propia **resolución de rejilla** (1/8, 1/16, 1/32) para hacer notas cortas/rápidas
en unos canales sin cambiar los demás (p. ej. hi-hats a 1/32 sobre un bajo a 1/16).

## Decisiones tomadas (con el usuario)

- **Por canal** (no global): cada canal su subdivisión.
- Resoluciones: **1/8, 1/16, 1/32** (potencias de 2). Reloj base a **1/32**. Tresillos/1-64 quedan fuera (posible
  ampliación futura).
- Por defecto **1/16** (compat con lo actual). Cambiar la rejilla de un canal **re-temporiza** sus notas (no se
  remapean): es el comportamiento esperado de "resolución por canal".
- El selector **Rejilla** vive junto a **Longitud** en la zona de PASOS del canal seleccionado.
- Es el segundo de dos sub-proyectos (el primero, humanizar, ya está).

## Arquitectura

Un **reloj base** fino común (1/32) y cada canal se dispara a su subdivisión. Cambio en el modelo, un helper
puro nuevo, el motor (`onStep` + `getTotalSteps`), el cabezal/grabación y las marcas de compás de las rejillas,
y un selector en la UI.

### Constantes y modelo

- `BASE_SUBDIV = 8` — pasos por negra del reloj base (1/32). El secuenciador corre a esta resolución.
- Subdivisiones permitidas por canal: **2** (1/8), **4** (1/16), **8** (1/32). Etiquetas `SUBDIV_LABELS`.
- `ChannelState` gana `subdiv?: number` (2|4|8; ausente ⇒ 4). `defaultChannel` lo pone a 4. Persistido con el
  canal (`normalizeChannel` lo conserva). Compat: ausente ⇒ 4.

### Helpers puros (`daw/grid.ts`, nuevo, testeable)

```ts
export const BASE_SUBDIV = 8;
export const SUBDIVS = [2, 4, 8] as const;                 // 1/8, 1/16, 1/32
export const SUBDIV_LABELS: Record<number, string>;         // { 2:'1/8', 4:'1/16', 8:'1/32' }

// Cuántos ticks base dura un paso de un canal a esa subdivisión (1/16→2, 1/32→1, 1/8→4).
export function baseFactor(subdiv: number): number;         // BASE_SUBDIV / subdiv

// Índice de paso del canal que cae en el tick base `t`, o null si ese tick no es de este canal.
export function channelStepAt(t: number, subdiv: number, len: number): number | null;
//  factor = baseFactor(subdiv); si (t % factor !== 0) → null; si no → ((t/factor) % len + len) % len

// Tramo (en ticks base) que ocupa un canal por vuelta = len × baseFactor(subdiv).
export function channelSpan(len: number, subdiv: number): number;
```

- `BASE_SUBDIV / subdiv` es entero para 2/4/8 (factores 4/2/1). Un `subdiv` no soportado se trata como 4.

### Motor (`app/studioView.ts`)

- **Constante:** `STEPS_PER_BEAT` pasa a valer `BASE_SUBDIV` (8) y se importa de `daw/grid`. El secuenciador se
  crea con `stepsPerBeat: BASE_SUBDIV`.
- **`getTotalSteps`** (en ticks base): LCM de `channelSpan(channelLen_c, subdiv_c)` sobre los canales (con el
  helper `lcm2` ya existente). Fallback si no hay canales: `BASE_SUBDIV * 4` (un compás).
- **`onStep(t, when)`**: por cada canal audible:
  - `const sub = c.subdiv ?? 4; const k = channelStepAt(t, sub, channelLen_c); if (k === null) continue;`
  - `st = arr[k]`; si `!st.on` sigue.
  - `secPerStep_c = (60 / bpm) / sub` (duración de un paso de ESTE canal).
  - `at = when + swingOffset(k, daw.swing, secPerStep_c)` (swing sobre el paso del canal).
  - humanizar (igual que ahora, sobre `at`/`vel`).
  - `gate = c.instrument.kind === 'drum' ? undefined : effectiveLen(arr, k) * secPerStep_c`.
  - `audio.trigger(...)`, `padHits.set(...)`, bloque del slicer (usa `st.note`/`k`) — igual que ahora pero con
    `k` en vez del índice global.

### Cabezal y grabación en vivo (canal seleccionado)

Operan sobre el canal seleccionado a **su** subdivisión (`sub_sel = ch.subdiv ?? 4`):

- **`recordStep`**: `step = ((round(beatNow * sub_sel)) % len + len) % len`.
- **Cabezal** (bucle visual): `s = ((floor(beatNow * sub_sel)) % len + len) % len`; el resto (mapeo a página
  visible con `PAGE`) igual.

### Marcas de compás de las rejillas

`ui/pianoRoll.ts` y `ui/stepgrid.ts` marcan hoy la negra con `i % 4 === 0`. Ganan un parámetro `beatEvery`
(= subdivisión del canal; por defecto 4) y marcan con `i % beatEvery === 0`. `studioView` se lo pasa
(`sub_sel`).

### UI — selector Rejilla

En `pvLenBar` (zona de PASOS), junto a "Longitud":

```html
<span>Rejilla</span><select id="pvSubdiv">
  <option value="2">1/8</option><option value="4">1/16</option><option value="8">1/32</option></select>
```

- Valor = `ch.subdiv ?? 4`. `change` → `daw = updateChannel(daw, selectedId, { subdiv: +value })`; `persist()`;
  `renderSelected()` (redibuja la rejilla con el nuevo `beatEvery` y recoloca el cabezal). No hay nodo de audio
  que actualizar (el motor lee `c.subdiv` en vivo).

## Persistencia y compatibilidad

- `subdiv` viaja dentro del canal (JSON; `normalizeChannel` lo conserva). **Sin migración:** canal sin `subdiv`
  ⇒ 4. Como el reloj base pasa de 4 a 8 pero los canales por defecto (subdiv 4, factor 2) disparan en los mismos
  tiempos, los proyectos v0.29 suenan **idénticos**.

## Qué NO cambia

- El swing (misma función `swingOffset`, ahora por canal), la longitud de nota (`effectiveLen`, ahora con la
  duración de paso del canal), humanizar, el resto de la vista. `dueSteps`/`makeSequencer`/`swingOffset` no
  cambian de firma.

## Bordes

- **Re-temporización:** cambiar la rejilla de un canal re-temporiza sus notas guardadas (un patrón a 1/16 puesto
  a 1/32 corre el doble de rápido). Es el comportamiento esperado; recomendado elegir la rejilla antes de
  programar. No se remapean notas.
- **Reloj base más frecuente:** a 1/32 el secuenciador dispara el doble de ticks; los ticks sin paso de ningún
  canal no hacen nada (coste despreciable).
- **`subdiv` no soportado** (dato corrupto): `baseFactor`/`channelStepAt` lo tratan como 4.
- **Longitud por canal:** las páginas de 16 siguen igual (16 pasos del canal a su rejilla; a 1/32, 16 pasos =
  medio compás).

## Pruebas

- **Unitarias (Vitest, `daw/grid.test.ts`):**
  - `baseFactor`: `4→2`, `8→1`, `2→4`; valor no soportado ⇒ trata como 4 (factor 2).
  - `channelStepAt`: a subdiv 4 (factor 2), ticks pares → `t/2 % len`, impares → `null`; a subdiv 8 (factor 1),
    cada tick → `t % len`; envuelve por `len`.
  - `channelSpan`: `len 16 @ sub 4 → 32`; `len 16 @ sub 8 → 16`; `len 16 @ sub 2 → 64`.
- **No unitarias (typecheck + build + a oído/vista):** un canal a 1/32 corriendo más fino que otro a 1/16;
  cabezal y marcas de compás correctas por canal; grabación en vivo al ritmo del canal; persistencia; un
  proyecto v0.29 abre idéntico.

## Restricciones globales

- Todo en `studio/`; no tocar `pianova.html`. TypeScript **strict**; sin dependencias nuevas.
- Comentarios/UI en español. Acento verde neón `var(--pv-acc)`.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
