# Piano-roll por canal + ayuda de escala — Diseño

**Fecha:** 2026-07-05 · **Versión objetivo:** 0.21.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Poder **hacer melodías** en el secuenciador: para el canal melódico seleccionado, editar la **nota de cada
paso** con un **mini piano-roll** (notas×pasos), y una **ayuda de escala** que indique en qué escala estás y
**resalte** las notas que encajan (informativo; no impide poner otras).

## Decisiones tomadas (con el usuario)

1. **Mini piano-roll por canal** (rejilla notas×pasos), no edición en la propia fila.
2. Escala **informativa**: resalta las notas de la escala, pero se puede poner cualquier nota.
3. **Monofónico** (una nota por paso — lo que soporta el modelo `Step` actual).
4. Rango inicial **~2 octavas** (Do3–Si4) con octava **▲/▼** para desplazar.

## Modelo (sin cambios de forma salvo la escala)

- `Step { on, note?, vel? }` **no cambia**: cada paso sigue teniendo **una** nota. El piano-roll es la UI
  para fijar `note` (y `on`) por paso.
- Se añade al estado del proyecto la **escala activa**: `scaleRoot: number` (0–11, 0 = Do) y
  `scaleType: string` (clave de `SCALES`). Persistida en el proyecto (v3) con **migración**: si no existe,
  `scaleRoot = 0`, `scaleType = 'chromatic'`. Es un ajuste global de la sesión musical (no por canal).

## Componentes

### 1. `studio/src/daw/scales.ts` (nuevo, puro y testeable)

- `export const SCALES: Record<string, number[]>` con las clases de nota (0–11) de cada escala:
  `chromatic, major, minor, pentaMajor, pentaMinor, dorian` (portado de `pianova.html`).
- `export const SCALE_LABELS: Record<string,string>` (etiquetas en español para la UI).
- `export function inScale(midi: number, root: number, type: string): boolean` — maneja módulo negativo:
  `(SCALES[type] ?? SCALES.chromatic).includes((((midi - root) % 12) + 12) % 12)`.
- `export const NOTE_NAMES` / `noteName(midi)` reutilizable (o se reutiliza el de `sampleEditor`).

### 2. `studio/src/ui/pianoRoll.ts` (nuevo)

Monta la rejilla del canal seleccionado. Firma aproximada:
`mountPianoRoll(root, { total, steps, lowMidi, scaleRoot, scaleType, onSetNote }) → { setPlayhead(step), setRange(lowMidi) }`.
- **Filas:** ~2 octavas (24–25 semitonos) desde `lowMidi` (por defecto Do3 = 48), de agudo arriba a grave
  abajo. Cada fila muestra el **nombre de nota** a la izquierda y distingue **tecla blanca/negra**; las
  filas **en escala** se iluminan (`inScale`).
- **Columnas:** `total` pasos (marca el pulso cada 4). En cada columna, la celda de la nota del paso activo
  aparece encendida (`step.on && step.note === midiDeLaFila`).
- **Interacción (clic):** clic en una celda → fija ese paso a esa nota (`onSetNote(i, midi)`); clic en la
  celda ya encendida → borra el paso (`onSetNote(i, null)`); clic en otra fila de la misma columna → mueve
  la nota (fija la nueva). Táctil = clic.
- **Octava ▲/▼:** desplaza `lowMidi` ±12 (con topes) y redibuja.
- **Cabezal:** `setPlayhead(step)` resalta la columna del paso en curso.

### 3. Barra de escala (en `app/studioView.ts` + CSS)

- Encima del piano-roll: **[Tónica ▾]** (Do…Si) + **[Tipo ▾]** (`SCALE_LABELS`). Al cambiar, actualizan
  `scaleRoot`/`scaleType` en el estado, persisten y redibujan el piano-roll (para el resalte).

### 4. Integración (`app/studioView.ts`)

- En la sección **PASOS**: si el canal seleccionado es **melódico** (`synth` | `synthx` | `slicer`),
  monta el **piano-roll** (+ barra de escala); si es **batería** (`drum`), mantiene la **fila on/off**
  actual (no necesita tono). El cabezal se alimenta igual que hoy (desde `visualTick`/`selGrid`).
- `onSetNote(i, midi)` → `setStep(daw, selectedId, i, { on: midi != null, note: midi ?? undefined, vel: <vel por defecto> })` (mantiene la velocity actual del paso si la hay). Persiste.
- **Slicer:** como el disparo usa `st.note` (→ `sliceIndexForNote`), el piano-roll permite **secuenciar
  slices distintos por paso** (arregla la limitación de que los pasos por clic disparaban el slice 0).

## Qué NO cambia

- El **motor de audio** y el disparo (ya usan `st.note ?? 60`). La forma de `Step`. El resto de la vista
  (pads, mixer, efectos, iluminación, sampler). Los patrones/song mode.

## Bordes

- Antes de iniciar el audio, el piano-roll se puede dibujar igual (es edición de datos); el sonido llega al
  reproducir/tocar. Cambiar de canal a uno de batería vuelve a la fila on/off. El rango se acota a MIDI
  válido (0–127) al usar ▲/▼.

## Pruebas

- **Unitarias (Vitest):** `scales.ts` — `inScale` (dentro/fuera, módulo negativo, tónica ≠ Do, tipo
  desconocido → cromática).
- **No unitarias:** piano-roll (DOM) y barra de escala → typecheck + build + prueba a ojo/oído en la URL
  (poner notas por paso, mover/borrar, octava ▲/▼, resalte de escala al cambiar tónica/tipo, cabezal al
  reproducir, y que el slicer dispare slices distintos por paso).

## Fuera de alcance (YAGNI)

- Acordes por paso (polifonía) — el secuenciador es monofónico por paso; se puede abordar después.
- Escala que **limite/snap** (se eligió informativa).
- Arrastrar para pintar varias notas, selección múltiple, copiar/pegar (el piano-roll grande de
  `pianova.html` lo tiene; aquí empezamos simple con clic).
- Velocity por nota en el piano-roll (se mantiene la velocity actual del paso).

## Restricciones globales

- Todo en `studio/`; **no** tocar `pianova.html`. TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón `var(--pv-acc)`.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
