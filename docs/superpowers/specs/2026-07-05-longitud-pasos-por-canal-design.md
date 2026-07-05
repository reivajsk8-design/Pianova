# Longitud de pasos por canal (páginas de 16) — Diseño

**Fecha:** 2026-07-05 · **Versión objetivo:** 0.23.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Poder **alargar la secuencia de un canal concreto** en **páginas de 16 pasos** (16→32→48→64…) para hacer
melodías más largas, **solo en los canales que el usuario elija**, mientras los demás siguen con su longitud.
Los distintos canales **suenan juntos** repitiendo cada uno a su propia longitud (todas múltiplos de 16, así
encajan sin descuadrarse). Esto evita tener que crear patrones solo para alargar una melodía.

**Decidido con el usuario:** páginas de 16 (＋16/−16), cada canal repite a su longitud, y **de momento solo
esto** (la limpieza de la barra de patrones/canción queda para después).

## Modelo

Hoy `daw.steps` es una longitud **global** (16) y todos los arrays de pasos miden eso. Cambio: la longitud de
un canal es **la longitud de su array de pasos** en ese patrón (ya se guarda así), y **puede variar por canal**
(múltiplos de 16). `daw.steps` pasa a ser solo el **valor por defecto** (16) para canales/patrones nuevos.

**Helpers nuevos (puros, testeables) en `daw/model.ts`:**
- `channelLen(daw, id): number` — longitud del canal en el patrón **actual** (`daw.patterns[daw.current].steps[id].length`, o `daw.steps` si no hay).
- `addStepsPage(daw, id): DawState` — añade `DEFAULT_STEPS` (16) pasos vacíos al final del array del canal en el patrón actual (inmutable).
- `removeStepsPage(daw, id): DawState` — quita 16 del final, **mínimo 16** (inmutable; nunca deja el canal por debajo de una página).

`emptyPattern`/`addChannel`/`toggleStep`/`setStep`/`channelSteps` siguen usando `daw.steps` como longitud por
defecto (16) para arrays nuevos; solo cambian los sitios que **asumían** que todo mide `daw.steps`.

## Reproducción (polimetría alineada)

El reloj del secuenciador avanza al **máximo** (el canal más largo del patrón que suena) y **cada canal lee su
propio paso** con envoltura:
- `getTotalSteps()` (en `app/studioView.ts`) devuelve el **máximo** de longitudes de los canales del patrón que
  se está reproduciendo (song mode → `playPattern`; si no → `daw.current`), o `daw.steps` si no hay ninguno.
- En `onStep(step, when)`, para cada canal se lee `const arr = pat.steps[c.id]; const st = arr[step % arr.length];`
  (antes `arr[step]`). Como el máster = el más largo y todo son múltiplos de 16, un canal de 16 se repite dentro
  del bucle de 32, y vuelven a coincidir. **Sin tocar el motor de audio.**
- **Grabación en vivo** (`recordStep`): el índice del paso se cuantiza y se envuelve con la longitud del **canal
  seleccionado** (`... % channelLen(daw, selectedId)`), no con `daw.steps`.

## UI: páginas de 16 + control ＋16/−16

La rejilla de pasos (batería, `ui/stepgrid.ts`) y el piano-roll (melódico, `ui/pianoRoll.ts`) siguen mostrando
**16 celdas** = **una página**; para canales más largos se navega por páginas (así las celdas no se amontonan).

- **Estado** en `mountStudioView`: `let stepPage = 0` (página visible del canal seleccionado). Se pone a 0 al
  cambiar de canal y se **acota** a `[0, páginas-1]` tras `−16`.
- **Barra de longitud** (nueva, en la zona de PASOS): muestra `LONGITUD: [−16] N pasos [＋16]` y, si N>16,
  pestañas **Pág: [1][2]…** (`Math.ceil(N/16)`). ＋16 → `addStepsPage`; −16 → `removeStepsPage`; clic en una
  pestaña cambia `stepPage`. Todo persiste (`persist()`) y re-renderiza.
- **Montaje:** el grid/piano-roll se montan con `total: 16` y los callbacks se **desplazan** por la página:
  - stepgrid: `isOn:(i)=>channelSteps(daw,id)[stepPage*16+i]?.on`, `onToggle:(i)=>toggleStep(daw,id,stepPage*16+i)`.
  - pianoRoll: `getStep:(i)=>channelSteps(daw,id)[stepPage*16+i]`, `onSetNote:(i,m)=>setStep(daw,id,stepPage*16+i,…)`.
- **Cabezal** (`visualTick`): calcula el paso del **canal seleccionado** = `tick % channelLen(sel)`; si su página
  (`Math.floor(paso/16)`) coincide con `stepPage`, marca la celda `paso%16`; si no, `-1` (esa página no suena
  ahora). `selGrid.setPlayhead` recibe el índice **local** (0–15 o −1).

## Qué NO cambia

- El motor de audio y el disparo. La forma de `Step`. La barra de patrones/canción (se simplificará aparte).
  El sampler, efectos, iluminación, escala.

## Bordes

- Un canal nunca baja de 16 (una página). Al cambiar a un canal con menos páginas, `stepPage` se acota. La
  migración no necesita cambios (los proyectos existentes ya tienen arrays de 16 = 1 página). Añadir/quitar
  página mientras suena cambia el bucle en el siguiente ciclo (aceptable).

## Pruebas

- **Unitarias (Vitest):** `channelLen`, `addStepsPage` (+16, inmutable), `removeStepsPage` (−16, mínimo 16,
  inmutable); y `dueSteps`/envoltura por canal si aplica.
- **No unitarias:** paginado, cabezal por página, ＋16/−16, y que un canal de 32 suene su melodía larga mientras
  otro de 16 se repite → typecheck + build + prueba a oído/vista en la URL.

## Restricciones globales

- Todo en `studio/`; no tocar `pianova.html`. TypeScript **strict**; sin dependencias nuevas.
- Comentarios/UI en español. Acento verde neón `var(--pv-acc)`.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
