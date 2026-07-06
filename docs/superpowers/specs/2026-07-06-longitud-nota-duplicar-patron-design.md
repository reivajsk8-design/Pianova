# Longitud de nota + duplicar patrón — Diseño

**Fecha:** 2026-07-06 · **Versión objetivo:** 0.28.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Agilizar la creación de melodías en el Estudio con dos mejoras:

1. **Longitud de nota:** cada nota del piano-roll puede durar varios pasos (más larga o más corta), no solo un
   1/16 fijo. Se ajusta **pintando y arrastrando** en el mini piano-roll.
2. **Duplicar patrón:** copiar un patrón entero a uno nuevo para variar unas pocas notas sin rehacerlo.

## Decisiones tomadas (con el usuario)

- Interacción de longitud: **pintar arrastrando** (clic simple = 1 paso; pinchar y arrastrar a la derecha =
  nota que ocupa hasta donde se suelte; clic sobre una nota = borrarla).
- **Longitud por defecto = 1 paso** (comportamiento actual; compat exacta con proyectos viejos).
- El **slicer también respeta `len`** (corta el slice a la duración de la nota con un pequeño fade). La
  **batería** queda siempre one-shot (la longitud no le afecta).
- Un solo spec: las dos mejoras son pequeñas y van juntas.

## Arquitectura

Cambio contenido en 4 capas, más audio del slicer:

- **Modelo (`daw/model.ts`):** `Step` gana `len?: number` (nº de pasos; ausente ⇒ 1). Se mantiene la
  monofonía por paso: una nota *empieza* en un paso y ocupa `len` pasos a la derecha. Nuevas operaciones puras
  `paintNote` (colocar/alargar) y `duplicatePattern` (copia profunda). Helper puro `effectiveLen` (recorta la
  longitud al final del canal y a lo guardado).
- **Motor (`app/studioView.ts` `onStep` + `daw/channel.ts` + `audio/slicer.ts`):** la "puerta" (gate) pasa de
  fija (0,12 s) a **variable**: `gate = effectiveLen × segundos_por_paso`. `channel.trigger` gana un parámetro
  `gate`. `synth`/`synthx` ya lo aceptan; `playSlice` gana un `maxDur` opcional que recorta el slice con
  fade-out. La batería ignora `gate`.
- **Piano-roll (`ui/pianoRoll.ts`):** pasa de listeners de clic por celda a **pointer events** (ratón +
  táctil): pintar arrastrando, tocar para poner/borrar, dibujar la nota como **barra** que une celdas.
- **Barra de patrones (`ui/patternbar.ts` + `app/studioView.ts`):** botón **⧉ Duplicar** que llama a
  `duplicatePattern`.

## Componentes y contratos

### `daw/model.ts`

```ts
export interface Step { on: boolean; note?: number; vel?: number; len?: number }   // len ausente ⇒ 1
```

- `effectiveLen(steps: Step[], i: number): number` — longitud real de la nota que empieza en `i`:
  `clamp(steps[i].len ?? 1, 1, steps.length - i)`. Pura, testeable. (Los pasos cubiertos ya se limpian al
  pintar, así que no hace falta recortar por "siguiente nota" en tiempo real.)
- `paintNote(daw, chId, start, len, note): DawState` — en el patrón actual, fija
  `steps[start] = { on:true, note, len: clamp(len, 1, channelLen - start) }` y pone `on:false` en los pasos
  **cubiertos** `start+1 … start+len-1` (monofónico: "pintar gana"). Inmutable.
- `duplicatePattern(daw, idx): DawState` — inserta tras `idx` un patrón nuevo con **copia profunda** de
  `patterns[idx].steps` (cada `Step` copiado, no referenciado), y deja `current` en el patrón nuevo. Si `idx`
  está fuera de rango, no hace nada.

`toggleStep`/`setStep` siguen igual (setStep se usa en grabación en vivo → graba `len` implícito 1).

### `daw/channel.ts`

```ts
trigger(note: number, vel: number, when: number, gate?: number): void;   // gate en segundos; por defecto 0.12
```

- synth: `synth.triggerPreset(preset, note, vel, when, gate ?? 0.12, bus)`.
- synthx: `triggerSynthx(actx, params, note, vel, when, gate ?? 0.12, bus)`.
- slicer: `playSlice(bus, buffer, slice, when, vel, gate)` — pasa `gate` como tope de duración.
- drum: `triggerDrum(...)` sin cambios (ignora `gate`).

### `audio/slicer.ts`

```ts
playSlice(dest, buffer, slice, when, vel, maxDur?: number): void
```

- Duración efectiva `d = maxDur ? Math.min(dur, maxDur) : dur`. Reproduce `src.start(t, offset, d)`,
  `src.stop(t + d + 0.02)`. Si `maxDur` recorta por debajo de `dur`, aplica un **fade-out corto** (≈ min(0.01,
  d/4)) al final para no chasquear, respetando también el `fadeOut` propio del slice cuando el slice no se
  recorta. Sin `maxDur`, comportamiento idéntico al actual.

### `app/studioView.ts` (`onStep`)

Donde hoy hace `audio.trigger(st.note ?? 60, vel, at)`:

```ts
const arr = pat.steps[c.id];
const gate = melodicKind(c) ? effectiveLen(arr, i) * secPerStep : undefined;   // undefined ⇒ 0.12 en drum
if (audio) audio.trigger(st.note ?? 60, vel, at, gate);
```

(`melodicKind` = synth/synthx/slicer. Para batería, `gate` queda `undefined` ⇒ puerta por defecto, sin cambio.)

### `ui/pianoRoll.ts`

- Nuevas opciones de montaje:
  - `getStep(i)` (ya existe) — para leer `note`/`len` y pintar barras.
  - `onPaint(start: number, len: number, midi: number)` — colocar/alargar (reemplaza el uso de `onSetNote` para
    poner).
  - `onClear(headIndex: number)` — borrar la nota cuyo head está en `headIndex`.
- **Render:** por cada fila (una nota `midi`), calcula el mapa de cobertura: para cada paso `i` con
  `on && note===midi`, la nota cubre `i … i+effectiveLen-1`. La celda `head` lleva `.on .head`; las celdas
  cubiertas llevan `.on .cont` (CSS: sin borde/redondeo izquierdo para que se vean unidas como barra).
- **Interacción (pointer events sobre la rejilla):**
  - `pointerdown` en una celda: registra inicio `(startStep, midi)`.
  - `pointermove` (con botón/toque activo, misma fila): actualiza una **vista previa** de la barra de
    `startStep` a la celda actual (solo hacia la derecha; hacia la izquierda mantiene 1).
  - `pointerup`:
    - Si **no hubo arrastre** (misma celda) y esa celda **pertenece a una nota** (head o cont): `onClear(head)`.
    - Si **no hubo arrastre** y la celda está **vacía**: `onPaint(startStep, 1, midi)`.
    - Si **hubo arrastre**: `onPaint(startStep, span, midi)` con `span = celdaFinal - startStep + 1`.
  - Táctil cubierto por pointer events; `touch-action:none` en la rejilla (ya aplicado a `.prGrid`/canvas).
- `setPlayhead`/`setLiveNotes` sin cambios de contrato.

### `ui/patternbar.ts`

Añadir, entre `data-patadd` y `data-patdel`:

```html
<button class="patIcon" data-patdup title="Duplicar patrón actual">⧉</button>
```

En `app/studioView.ts` (delegación de eventos, junto a `data-patadd`):

```ts
if (t.hasAttribute('data-patdup')) { daw = duplicatePattern(daw, daw.current); persist(); renderSelected(); renderPatternBar(); return; }
```

## Persistencia y compatibilidad

- `len` viaja dentro de cada `Step` en el JSON del proyecto (los patrones se serializan tal cual). **Sin
  migración:** un `Step` sin `len` se interpreta como 1 (mismo sonido que antes). Los proyectos v0.27 abren
  idénticos.

## Qué NO cambia

- El motor de la batería (one-shot), el resto de la vista, la escala, la longitud por canal (páginas de 16),
  el modo canción, la grabación en vivo (graba `len` 1; ajustar duración tocada en vivo sería otro
  sub-proyecto). El modo estéreo del EQ, etc.

## Bordes

- **Tope de longitud:** `paintNote` y `effectiveLen` recortan a `channelLen - start` (la nota nunca pasa del
  final del canal). El límite se calcula sobre la longitud del canal en el patrón actual.
- **Pintar sobre notas existentes:** los pasos cubiertos se limpian (monofónico, "pintar gana").
- **Arrastre hacia la izquierda:** se ignora (longitud mínima 1); para acortar, se repinta más corta.
- **Canales no melódicos:** en batería el piano-roll no aplica (usa la fila on/off actual); `len` solo se pinta
  en synth/synthx/slicer.
- **Slicer:** si `len × segPaso` supera la duración del slice, suena el slice entero (no se estira); si es
  menor, se recorta con fade. La nota corta, no bucle.

## Pruebas

- **Unitarias (Vitest, `daw/model.test.ts`):**
  - `effectiveLen`: recorta al final del canal, trata `len` ausente como 1, respeta `len` válido.
  - `paintNote`: coloca con `len`, limpia los pasos cubiertos, recorta al final del canal, es inmutable.
  - `duplicatePattern`: inserta tras el índice, copia profunda (mutar el original no afecta la copia), deja
    `current` en el nuevo, no hace nada si el índice está fuera de rango.
- **No unitarias (typecheck + build + prueba a oído/vista en la URL):** piano-roll (pintar/tocar/borrar,
  barra), gate variable en synth/synthx, corte del slicer con fade, botón Duplicar, persistencia.

## Restricciones globales

- Todo en `studio/`; no tocar `pianova.html`. TypeScript **strict**; sin dependencias nuevas.
- Comentarios/UI en español. Acento verde neón `var(--pv-acc)`.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
