# Acortar/alargar nota arrastrando (longitud fraccionaria) — Diseño

**Fecha:** 2026-07-06 · **Versión objetivo:** 0.32.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Poder **acortar** una nota del piano-roll arrastrando (además de alargarla), incluso **por debajo de un paso**,
para hacer notas cortas/staccato sin cambiar la rejilla del canal. La nota se dibuja proporcional a su duración
(media nota = media celda) y suena esa fracción.

## Decisiones tomadas (con el usuario)

- Interacción: **arrastrar el borde derecho** de una nota → derecha alarga, izquierda acorta.
- **Finura: 1/4 de paso** (snap a 0,25). Mínimo de nota: **0,25 paso**.
- El inicio de la nota sigue cayendo en una celda (paso entero); solo el **largo** es fraccionario.
- Es una mejora del piano-roll (motivada por el usuario: "no puedo hacer notas más cortas").

## Arquitectura

Cambio contenido en el modelo (longitud fraccionaria) y en el piano-roll (dibujo por barra + arrastre con
posición fraccionaria). El motor **no cambia** (ya usa `gate = effectiveLen × duración_de_paso`).

### Modelo (`daw/model.ts`)

- `Step.len` ya es `number`; pasa a admitir **fracciones** (múltiplos de 0,25). Sin cambio de tipo ni migración.
- Constantes nuevas: `LEN_STEP = 0.25` (rejilla de longitud), `MIN_LEN = 0.25` (mínimo).
- `snapLen(len)` = `Math.round(len / LEN_STEP) * LEN_STEP` (redondea a 1/4). Pura.
- `effectiveLen(steps, i)`: baja el mínimo de 1 a `MIN_LEN`:
  `Math.max(MIN_LEN, Math.min(steps[i]?.len ?? 1, steps.length - i))`.
- `paintNote(daw, chId, start, len, note)`: `L = Math.max(MIN_LEN, Math.min(snapLen(len), cur.length - start))`;
  fija `steps[start] = { ...steps[start], on: true, note, len: L }`; limpia los pasos **enteros** cubiertos
  `for (let k = start + 1; k < start + L; k++) steps[k] = { ...steps[k], on: false }` (para `L < 1` no limpia
  nada; para `L` fraccionario > 1, limpia solo los enteros estrictamente dentro). Inmutable.

### Motor

Sin cambios. `onStep` ya calcula `gate = effectiveLen(arr, k) × secPerStep`; con `len` fraccionario la nota
suena esa fracción. `padHits`/slicer igual.

### Piano-roll (`ui/pianoRoll.ts`, reescritura del dibujo + arrastre)

- **Dibujo:** las celdas de fondo siguen (rejilla, líneas de compás con `beatEvery`, cabezal, zona de clic),
  pero **sin** clases `.on/.head/.cont`. Encima, una **capa de barras**: por cada nota (celda `i` con
  `on && note === midi`) una `<div class="prNote">` posicionada `left = i/total × 100%`,
  `width = clamp(len, MIN_LEN, total − i)/total × 100%`, con `pointer-events: none` (los clics pasan a las
  celdas). `.prCells` gana `position: relative`.
- **Posición fraccionaria del puntero:** `posX = clamp((clientX − rectCells.left) / (rectCells.width / total), 0, total)`
  (en unidades de paso), usando el rect de `.prCells` de la fila de inicio.
- **Localizar la nota bajo el puntero** (para acortar/borrar): helper que recorre las celdas de la fila y
  devuelve la cabeza `h` (celda con `on && note === m`) tal que `h ≤ posCell < h + effectiveLen(h)`, o `null`.
- **Interacción (pointer events sobre `.prGrid`):**
  - `pointerdown`: celda pulsada `c` + fila `m`; `anchor = headBajoPuntero ?? c`; `onNote = headBajoPuntero != null`.
  - `pointermove`: `len = snapLen(posX − anchor)` clamp `[MIN_LEN, total − anchor]`; pinta una **barra de vista
    previa**; `moved = true` si cambia respecto al inicio.
  - `pointerup`/`pointercancel`:
    - sin arrastre + sobre nota → `onClear(anchor)` (borrar);
    - sin arrastre + hueco → `onPaint(c, 1, m)` (nota de 1 paso);
    - con arrastre → `onPaint(anchor, len, m)` (alarga/acorta desde la cabeza).
  - Contrato `onPaint(start, len, midi)`/`onClear(headIndex)`/`onRange` y el retorno `{ setPlayhead, setLiveNotes }`
    **no cambian** (studioView no se toca salvo, si acaso, el texto de ayuda).
- **Ayuda:** el texto pasa a "clic = 1 paso · arrastra el borde para alargar o acortar · clic en la nota para borrar".

### CSS (`ui/styles.css`)

- `.prCells{position:relative}` (para posicionar las barras).
- `.prNote{position:absolute;top:1px;bottom:1px;background:var(--pv-acc);box-shadow:0 0 6px var(--pv-acc-dim) inset;border-radius:3px;pointer-events:none}`
- `.prNote.preview{opacity:.55}` (vista previa durante el arrastre).

## Persistencia y compatibilidad

- `len` fraccionario viaja en el `Step` (JSON). **Sin migración:** notas v0.31 con `len` entero se ven y suenan
  igual (los enteros son válidos en la nueva rejilla de 1/4).

## Qué NO cambia

- El motor, la rejilla por canal (`subdiv`), la longitud por canal (páginas), el swing, el humanizar, el resto de
  la vista. El inicio de la nota sigue en una celda (monofónico por paso).

## Bordes

- **Mínimo:** `MIN_LEN = 0,25` paso; arrastrar más a la izquierda deja 1/4 (no desaparece).
- **Tope:** `paintNote`/`effectiveLen` clampan a `cur.length − start` (la nota no pasa del final del canal).
- **Cabezal sobre barra:** el cabezal (`.play` en la celda) puede quedar tapado por la barra verde en la parte
  de la nota; es cosmético y no bloquea (se ve en las celdas vacías). Decisión consciente.
- **Combina con la rejilla:** a 1/16 una nota de 1/4 de paso = 1/64; para notas cortas normales basta 1/2–1/4 de
  paso.

## Pruebas

- **Unitarias (Vitest, `daw/model.test.ts`):**
  - `effectiveLen`: `len` fraccionario respetado; mínimo `MIN_LEN` (0,25); recorte al final del canal; `len`
    ausente ⇒ 1.
  - `paintNote`: snap a 1/4 (p. ej. 1,1 → 1,0; 0,3 → 0,25); mínimo 0,25; para `L < 1` no limpia celdas;
    para `L` fraccionario > 1 limpia solo los pasos enteros cubiertos; clamp al final; inmutable.
- **No unitarias (typecheck + build + a oído/vista):** acortar una nota a 1/2 y a 1/4 arrastrando el borde,
  verla como barra corta, oírla más corta; alargar sigue igual; borrar con clic; persistencia.

## Restricciones globales

- Todo en `studio/`; no tocar `pianova.html`. TypeScript **strict**; sin dependencias nuevas.
- Comentarios/UI en español. Acento verde neón `var(--pv-acc)`.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
