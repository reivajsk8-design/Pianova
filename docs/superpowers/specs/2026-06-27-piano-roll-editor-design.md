# Diseño — Piano-roll por canal (overlay estilo Ableton)

**Fecha:** 2026-06-27 · **Proyecto:** Pianova (`pianova.html`) · **Estado:** aprobado por el usuario
(diseño). Pendiente: revisión del spec → plan de implementación.

> Sub-proyecto 2 de 2. (El 1 fue el Navegador de samples, ya publicado.)

## Objetivo

Un **editor de piano-roll por canal**, estilo el editor de clip de Ableton (referencia que aportó el
usuario), que se abre como **ventana superpuesta (overlay)** para editar a fondo las notas de **un
canal** del Looper: **dibujar/crear**, **mover**, **alargar/acortar**, **borrar**, con **rejilla**
(snap 1/16 por defecto), **carril de velocity**, **resaltar escala** (pedagógico) y **Fold**. La
vista de 8 carriles del Looper se mantiene como resumen; se "entra" a un canal para editarlo.

## Alcance

**Dentro:** dibujar, mover, alargar/acortar, borrar notas; rejilla seleccionable con snap; carril de
velocity editable; resaltar escala (tónica + tipo); Fold (ocultar filas vacías); cabezal de
reproducción; persistencia.

**Fuera (otro ciclo, YAGNI):** utilidades avanzadas de Ableton (Humanize, Invert, Add Interval,
Legato, Reverse, Stretch), selección múltiple/marquesina, zoom y scroll horizontal (el loop cabe a lo
ancho), copiar/pegar.

## Restricciones (heredadas del proyecto)

- **Un solo archivo** `pianova.html`; sin librerías de instalación; sin build; `smplr` intacto.
- **Textos e interfaz en español.** **No empeorar el escritorio**; usable también en táctil/móvil.
- Edita el **mismo modelo de datos** existente: `lp.channels[i].notes` = `{midi,startBeat,dur,vel}`.
  Reutiliza `quantizeGrid`/`quantizeNotes`, `playChannelSound`, `saveLooper`, `lpLoopBeats`,
  `solfege`, geometría de notas.

## Arquitectura (unidades y responsabilidad)

### 1. Apertura/cierre (`prOpen`/`prClose`)
- **Doble-clic en el carril de un canal** en `#lpCanvas` (la vista de 8 carriles) abre el editor para
  ese canal. El doble-clic actual borra notas (`lpEditDbl`): se **reemplaza** por abrir el editor
  (el borrado de nota fino pasa al propio piano-roll). Arrastrar/mover en los 8 carriles se mantiene.
- El ✏️ del canal **no cambia** (sigue abriendo el editor de samples).
- Overlay `#pianoroll` (oculto por defecto, `[hidden]`), tapa la app; ✕ y tecla `Esc` cierran.
- Estado: `prCh` (índice de canal en edición), `prGrid`, `prFold`, `prScaleRoot`, `prScaleType`,
  `prScaleOn`, rango de filas visible.

### 2. Estructura del overlay (HTML/CSS)
- **Cabecera** `.prHead`: nombre del canal + sonido · **Fold** (toggle) · **Rejilla**
  (`<select>`: 1/4=1, 1/8=0.5, **1/16=0.25**, 1/32=0.125) · **Escala** (tónica `<select>` Do…Si +
  tipo `<select>`: Cromática/Mayor/Menor/Penta mayor/Penta menor/Dórica) + **Resaltar escala**
  (checkbox) · ✕.
- **Cuerpo** `.prBody`: rejilla flex con **piano vertical** a la izquierda (`.prKeys`, anchura fija,
  teclas con nombre `solfege`, scroll vertical sincronizado) y **lienzo de rejilla** a la derecha
  (`<canvas id="prCanvas">`).
- **Carril de velocity** abajo (`<canvas id="prVel">`), alineado en X con la rejilla.

### 3. Geometría y filas
- **Filas = alturas MIDI** en un rango. Rango por defecto: de `min(notas)-2` a `max(notas)+2`
  acotado a `[24,108]`; si el canal está vacío, `C2..C6` (36..84). Alto de fila fijo (p. ej. 16 px),
  scroll vertical si no caben.
- **Columnas = beats**: `x = (beat / lpLoopBeats()) * prW`. Snap a `prGrid`.
- `prRowAt(py)` → midi; `prBeatAt(px)` → beat (con snap); `prNoteAt(px,py)` → nota bajo el cursor o
  null; `prNoteEdgeAt` → true si el cursor está en el borde derecho (zona de redimensionar).

### 4. Dibujo (`prDraw`, `prDrawVel`)
- Rejilla: líneas verticales (fuerte en compás cada 4 beats, media en pulso, fina en `prGrid`),
  líneas horizontales por fila; filas de la escala sombreadas si `prScaleOn`.
- Notas: bloques `{x,y,w,h}` del color del canal; nombre si caben; nota seleccionada resaltada.
- Cabezal de reproducción: línea vertical en `lp.beat` mientras `lp.playing`.
- `prVel`: por cada nota, un "tallo" en su X con altura ∝ `vel`; arrastrable.
- Bucle de pintado: `requestAnimationFrame` **solo mientras el overlay está abierto** (para el
  cabezal); además redibuja tras cada edición.

### 5. Interacciones (pointer events sobre `#prCanvas` y `#prVel`)
- **Clic en celda vacía:** crea `{midi,startBeat:snap(beat),dur:prGrid,vel:0.8}`; `saveLooper`.
- **Arrastrar cuerpo:** mover en tiempo (snap a `prGrid`) y en altura (semitonos), acotado al loop.
- **Arrastrar borde derecho:** cambiar `dur` (mín. un paso de rejilla, snap).
- **Doble-clic / clic derecho en nota:** borrar.
- **Arrastrar en `#prVel`:** fija `vel` de la nota correspondiente (0..1).
- Cada edición: `saveLooper()` + redibujo. Pointer capture para arrastres; soporte táctil
  (`touch-action:none` en los canvas del editor).

### 6. Rejilla / cuantizar
- `prGrid` (beats) controla el snap de creación/movimiento/redimensión. Botón **Cuadrar** aplica
  `quantizeNotes(ch.notes, prGrid)` (reutilizado). Por defecto 1/16 (0.25).

### 7. Escala (`PR_SCALES`)
- Mapa tipo→conjunto de clases de altura (0..11). `prInScale(midi)` = `(midi - root) mod 12 ∈ set`.
- Si `prScaleOn`, las filas en escala se sombrean suave; no impide tocar fuera de escala.

### 8. Fold
- Si `prFold`, solo se muestran filas (midis) que tengan al menos una nota (útil en batería).
  Si no hay notas, muestra el rango por defecto.

### 9. Datos, reproducción y persistencia
- Edita directamente `lp.channels[prCh].notes`; visible también en los 8 carriles. `saveLooper()`
  tras cada cambio (ya persiste en `localStorage`).
- La reproducción del loop sigue igual (`lpTick`/`lpPlayback` disparan `playChannelSound`); el editor
  solo añade el cabezal. Las notas creadas/movidas suenan en la siguiente vuelta.

## Flujo de datos (resumen)
```
doble-clic carril → prOpen(canal) → overlay #pianoroll
  prCanvas: filas=midi, columnas=beats(snap prGrid)
    clic vacío → push nota ; arrastrar → mover/alargar ; doble/derecho → borrar
  prVel: arrastrar → vel
  todo → lp.channels[prCh].notes (mismo array) → saveLooper() → se ve en los 8 carriles
  lp.playing → cabezal en lp.beat ; sonido por lpPlayback existente
Esc/✕ → prClose() (para el rAF del editor)
```

## Riesgos / notas
- **Reemplazar `lpEditDbl`** (borrar nota) por abrir el editor: verificar que no rompe el flujo de los
  8 carriles; el borrado fino se hace dentro del piano-roll.
- **Alineación X** entre `#prCanvas` y `#prVel` (mismo origen y ancho) para que los tallos coincidan.
- **Rendimiento:** rAF solo con el overlay abierto; pararlo en `prClose` para no gastar batería.
- **Táctil:** los canvas del editor usan `touch-action:none`; cuidar que el scroll vertical del piano
  siga funcionando (rueda/arrastre en la zona de teclas).
- Rango grande de filas → muchas filas; el scroll vertical y Fold lo gestionan.

## Verificación
- `node --check` del `<script>` tras cada fase + tests Node de funciones puras (`prInScale`,
  snap de beat, `prNoteAt` hit-test con datos sintéticos).
- Prueba manual (Chrome/Edge): doble-clic en un carril abre el editor; dibujar notas en 1/16;
  moverlas y alargarlas con snap; borrar; cambiar velocity; activar Resaltar escala y Fold;
  reproducir y ver el cabezal; cerrar con Esc; comprobar que los 8 carriles reflejan los cambios y
  que **al recargar** persisten. Revisar táctil (móvil) y que el escritorio del resto no cambió.
- Actualizar `CLAUDE.md` y `HANDOFF.md` (subir versión) tras implementar.
