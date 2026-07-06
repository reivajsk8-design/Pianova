# Piano-roll: resaltar la nota que tocas en vivo — Diseño

**Fecha:** 2026-07-06 · **Versión objetivo:** 0.24.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

En el piano-roll del canal melódico seleccionado, **sombrear la fila de la nota que tocas en vivo** (teclado
MIDI, teclas del PC o ratón) mientras la mantienes pulsada, para saber en qué nota estás. Al soltar, se apaga.

**Decidido con el usuario:** si la nota tocada cae **fuera de las ~2 octavas visibles**, el piano-roll
**auto-desplaza** a la octava de esa nota para que siempre la veas.

## Componentes

### 1. `ui/pianoRoll.ts` — resalte de notas en vivo

- Estado interno `live: Set<number>` (notas pulsadas ahora).
- `draw()` añade la clase `.live` a las filas cuya nota esté en `live`; se añade `data-m="${midi}"` a cada
  `.prRow` para poder alternar la clase sin redibujar.
- La interfaz gana un método: `PianoRollUI.setLiveNotes(notes: number[], focus?: number): void`.
  - Actualiza `live = new Set(notes)`.
  - **Auto-desplazar:** si `focus` (la nota recién pulsada) queda fuera de `[low, low+ROWS-1]`, ajusta
    `low = clamp(12·floor(focus/12) − 12, 0, 127−ROWS)` (alinea a octava, con la octava de la nota en la
    mitad superior), llama `onRange(low)` y `draw()` (que ya aplica `.live`).
  - Si no hay que desplazar, alterna la clase `.live` en las filas visibles (barato, sin redibujar).
- Convive con el cabezal de reproducción (`setPlayhead`, columna): uno resalta **fila** (lo que tocas), otro
  **columna** (lo que suena); no se pisan.

### 2. `app/studioView.ts` — cableado

- `const liveNotes = new Set<number>()` y `let prLive: ((notes: number[], focus?: number) => void) | null`.
- `renderSelected`: al montar el piano-roll (canal melódico) → `prLive = pr.setLiveNotes` y se llama una vez
  con las notas ya pulsadas (`prLive([...liveNotes])`); en batería / sin piano-roll → `prLive = null`.
- `playLive(m, v)`: al final, `liveNotes.add(m); prLive?.([...liveNotes], m)` (foco = la nota pulsada).
- `stopLive(m)`: `liveNotes.delete(m); prLive?.([...liveNotes])` (sin foco, sin desplazar al soltar).

### 3. CSS

- `.prRow.live` con un resalte robusto por `box-shadow` (para que gane sobre cualquier fondo de fila —
  negra/escala— sin guerras de especificidad) + etiqueta de la fila en blanco.

## Qué NO cambia

- El motor de audio ni el disparo. La forma de `Step`. El resto del piano-roll (edición, escala, páginas,
  cabezal). Solo se añade el resalte de fila y su cableado.

## Bordes

- Solo canales **melódicos** (donde hay piano-roll); en batería no aplica (`prLive = null`).
- Si se mantiene una nota al cambiar de canal, el nuevo piano-roll muestra las notas pulsadas al montar.
- El resalte es **informativo** (no pone notas).

## Pruebas

- No unitarias (DOM/eventos): typecheck + build + prueba a oído/vista en la URL (tocar con MIDI/teclas/ratón
  resalta la fila; notas fuera de vista auto-desplazan a su octava; al soltar se apaga; en batería no aplica).

## Restricciones globales

- Todo en `studio/`; no tocar `pianova.html`. TypeScript **strict**; sin dependencias nuevas.
- Comentarios/UI en español. Acento verde neón `var(--pv-acc)`.
- Verificación: `cd studio && npm run typecheck && npm test && npm run build`.
