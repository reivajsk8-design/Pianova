# Diseño — Piano-roll: edición avanzada (selección + portapapeles + deshacer)

**Fecha:** 2026-06-27 · **Proyecto:** Pianova (`pianova.html`) · **Estado:** aprobado por el usuario
(diseño). Pendiente: revisión del spec → plan de implementación.

> Amplía el editor de piano-roll por canal (overlay) ya existente con selección múltiple, mover en
> grupo, portapapeles (copiar/pegar/duplicar) y deshacer/rehacer multinivel.

## Objetivo

Editar como en un DAW dentro del piano-roll: **seleccionar varias notas con recuadro**, **moverlas en
grupo**, **borrar selección**, y los **atajos universales** **Ctrl+C / Ctrl+V / Ctrl+D / Ctrl+Z /
Ctrl+Y (Ctrl+Shift+Z)**, todo operando sobre `lp.channels[prState.ch].notes`.

## Alcance

**Dentro:** selección por recuadro (marquee) + clic/Shift-clic + Ctrl+A; mover la selección en grupo;
borrar selección (Supr/Backspace); copiar/pegar (pega en el cabezal) / duplicar (Ctrl+D, justo
después); deshacer/rehacer **multinivel** que cubre TODA edición del piano-roll (dibujar, mover,
alargar, borrar, pegar, duplicar, cuadrar). Resaltado visual de la selección y del recuadro.

**Fuera (otro ciclo, YAGNI):** redimensionar varias notas a la vez; arrastrar selección entre
canales. (Pegar en otro canal sí funciona: el portapapeles es global en memoria; abres otro canal y
Ctrl+V pega ahí.)

## Restricciones (heredadas)

- **Un solo archivo** `pianova.html`; sin librerías; sin build; `smplr` intacto. Textos en español.
- Solo activo **con el overlay del piano-roll abierto** (`!$('pianoroll').hidden`); no afecta a la
  edición de los 8 carriles (`lpCanvas`/`lpEdit*`) ni al resto de la app.
- Reutiliza: `prState` (`.ch`, `.grid`), `lp.channels[i].notes` (`{midi,startBeat,dur,vel}`),
  `prNoteAt`, `prXToBeat`/`prYToMidi`/`prBeatToX`/`prMidiToY`, `prSnap`, `prPos`, `prDraw`,
  `lpLoopBeats`, `lp.beat`/`lp.playing`, `saveLooper`. La captura de teclas se añade en el listener
  `keydown` existente (que ya intercepta `Escape` cuando el overlay está abierto).
- **Evitar** que el navegador haga su copiar/pegar/deshacer: `preventDefault()` en los atajos cuando
  el overlay está abierto.

## Arquitectura (unidades)

### 1. Estado de selección y portapapeles (`prSel`, `prClip`, marquee)
- `let prSel = new Set()` — conjunto de **referencias a objetos nota** del canal actual (no índices,
  que se invalidan al borrar). Se limpia al cerrar el editor o cambiar de canal (`prOpen`/`prClose`).
- `let prClip = []` — portapapeles: copias `{midi,startBeat,dur,vel}` **relativas** (offset desde el
  `startBeat` mínimo), global en memoria (permite pegar en otro canal).
- `let prMarquee = null` — `{x0,y0,x1,y1}` mientras se arrastra el recuadro (en px del lienzo).

### 2. Pila de deshacer/rehacer (`prUndo`, `prRedo`, `prSnapshot`/`prPushUndo`/`prDoUndo`/`prDoRedo`)
- `prUndo = []`, `prRedo = []` (cada entrada = copia profunda del array de notas del canal).
- `prPushUndo()`: empuja `snapshot(notes)` a `prUndo` (tope 60), vacía `prRedo`. Se llama **antes** de
  cada mutación (crear/mover/alargar/borrar/pegar/duplicar/cuadrar).
- `prDoUndo()`: si hay `prUndo`, empuja el estado actual a `prRedo`, restaura el último de `prUndo` en
  `lp.channels[prState.ch].notes`, limpia `prSel`, `saveLooper()`, `prDraw()`.
- `prDoRedo()`: simétrico.
- `snapshot(notes)` = `notes.map(n => ({...n}))`; restaurar = reemplazar el contenido del array in
  situ (`notes.length = 0; push(...copia)`) para no romper referencias externas al array.

### 3. Interacción de ratón (extensión de los manejadores de `#prCanvas`)
- **pointerdown** sobre zona de rejilla (`px ≥ PR_KEYS_W`):
  - Si hay **nota** bajo el cursor (`prNoteAt`):
    - Si NO está en `prSel` y no se pulsa Shift → `prSel = {esa nota}`.
    - Si Shift → alterna esa nota en `prSel`.
    - Inicia arrastre de **grupo** (mover) o **resize** (si `edge`, solo esa nota). `prPushUndo()` al
      empezar a mover/redimensionar.
  - Si NO hay nota:
    - Con **Shift** o clic-arrastre → inicia **marquee** (`prMarquee`).
    - Clic simple en vacío → crea nota (comportamiento actual) **o** deselecciona si había selección
      (decisión: si hay selección, el clic en vacío **deselecciona**; si no, **crea** nota). 
- **pointermove**: si marquee, actualizar `prMarquee` y redibujar; si arrastre de grupo, mover todas
  las notas de `prSel` por el mismo delta de beats (snap) y semitonos, acotado al loop; si resize,
  como ahora (una nota).
- **pointerup**: si marquee, seleccionar las notas que intersecan el rectángulo (Shift = añadir),
  limpiar `prMarquee`; fin de arrastre → `saveLooper()`.
- El **borrado** por doble-clic/clic-derecho sobre una nota se mantiene (con `prPushUndo`).

### 4. Atajos de teclado (en el listener `keydown`, solo si overlay abierto)
- `Ctrl/Cmd+A` → `prSel = todas`; `preventDefault`.
- `Delete`/`Backspace` → `prPushUndo()`; borra de `notes` las de `prSel`; `prSel.clear()`.
- `Ctrl/Cmd+C` → `prClip = copiaRelativa(prSel)` (si hay selección).
- `Ctrl/Cmd+V` → `prPushUndo()`; pega `prClip` con `startBeat = base + (lp.playing ? lp.beat%total : 0)`
  conservando alturas; las nuevas pasan a ser `prSel`.
- `Ctrl/Cmd+D` → `prPushUndo()`; duplica `prSel` desplazada por su **span** (`max(start+dur)-min(start)`);
  las nuevas pasan a ser `prSel`.
- `Ctrl/Cmd+Z` → `prDoUndo()`; `Ctrl/Cmd+Y` o `Ctrl/Cmd+Shift+Z` → `prDoRedo()`.
- Todos con `ev.preventDefault()` para no disparar el copiar/deshacer del navegador.

### 5. Dibujo (extensión de `prDraw`)
- Notas en `prSel`: borde/relleno resaltado (p. ej. borde blanco + más opacas).
- Si `prMarquee`: rectángulo semitransparente con borde sobre la rejilla.

## Flujo de datos (resumen)
```
overlay abierto:
  ratón: marquee/clic/Shift → prSel (refs a notas) ; arrastre → mueve prSel en grupo (prPushUndo)
  teclado (keydown, overlay abierto):
    Ctrl+A todas · Supr borra (prPushUndo) · Ctrl+C→prClip · Ctrl+V pega en cabezal (prPushUndo)
    Ctrl+D duplica (prPushUndo) · Ctrl+Z prDoUndo · Ctrl+Y/Ctrl+Shift+Z prDoRedo
  toda mutación → lp.channels[prState.ch].notes → saveLooper() → prDraw()
prOpen/prClose/cambio de canal → prSel.clear(); prUndo/prRedo se reinician
```

## Riesgos / notas
- **Referencias vs índices:** `prSel` guarda objetos nota; al borrar se filtran del array. Al
  deshacer/rehacer se reemplaza el contenido del array, así que `prSel` (refs viejas) debe limpiarse.
- **Snapshots:** copias superficiales de cada nota (`{...n}`) bastan (las notas son planas). Cuidar
  restaurar **in situ** (`notes.length=0; notes.push(...)`) para no cambiar la referencia del array
  que usa `lpPlayback`/`prDraw`.
- **preventDefault de atajos:** solo cuando el overlay está abierto, para no capturar Ctrl+C/Z del
  resto de la app.
- **Marquee vs crear nota:** definir bien el gesto (clic simple en vacío = crear; arrastre en vacío o
  Shift = recuadro) para que no choquen.
- **Pegar en el cabezal parado:** `lp.beat` solo es válido en reproducción; parado se usa beat 0.

## Verificación
- `node --check` del `<script>` + tests Node de funciones puras: copia relativa (offset desde el
  mínimo), cálculo del span para duplicar, intersección nota↔recuadro, y la lógica de
  snapshot/undo/redo (con arrays simulados).
- Manual (Chrome/Edge): recuadro selecciona; Shift añade; mover en grupo con snap; Supr borra;
  Ctrl+C/V pega en el cabezal; Ctrl+D duplica detrás; Ctrl+Z/Ctrl+Y deshacen/rehacen varias acciones;
  pegar en otro canal; comprobar que NO interfiere con el resto de la app ni con los 8 carriles; que
  persiste al recargar. Revisar que el navegador no roba los atajos.
- Actualizar `CLAUDE.md` y `HANDOFF.md` (subir versión) tras implementar.
