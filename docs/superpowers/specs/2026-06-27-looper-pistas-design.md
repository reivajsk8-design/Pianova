# Diseño — Looper estilo pistas (filas alineadas)

**Fecha:** 2026-06-27 · **Proyecto:** Pianova (`pianova.html`) · **Estado:** aprobado por el usuario
(diseño). Pendiente: revisión del spec → plan de implementación.

## Objetivo

Rediseñar la distribución visual del Looper para que **cada canal sea una fila de pista** con su
**cabecera (color + nombre + controles) pegada y alineada a su carril de notas**, como la vista de
arreglo de Ableton. Hoy el carril (lienzo) y los controles (tarjetas) están **separados y sin
alinear**, y hay que adivinar qué fila del lienzo corresponde a cada tarjeta. Objetivo: que se
maneje de forma cómoda e inmediata, **sin perder ninguna función** y **sin empeorar el escritorio**.

## Estado actual (lo que se reemplaza)

- `#looperView > main` contiene, en bloques separados y apilados verticalmente:
  - `.stage > canvas#lpCanvas`: un **único lienzo** que dibuja los 8 carriles como filas
    (`lpDraw`, `lpH/8` por fila; edición con `lpNoteAt`/`lpEdit*`).
  - `.lpChannels#lpChannels`: lista de 8 **tarjetas** `.lpCh` (construidas por `lpBuildChannelUI`):
    `Canal N` (color), selector `.lpSound`, volumen `.lpVol` + 🎛 `.lpVolLearn`, y botones
    `data-rec`/`data-mute`/`data-clear`/`data-quant` (+ ✏️ `.lpEdit` para samples).
- Problema: la fila *i* del lienzo y la tarjeta del canal *i* no están juntas ni alineadas.

## Diseño propuesto

### Distribución
- El cuerpo del Looper pasa a un contenedor de **filas de pista** alineadas. Estructura por fila:
  - **Cabecera a la izquierda** (ancho fijo) + **carril de notas a la derecha**, ambos a la misma
    altura de fila.
- **Un único `<canvas>`** sigue dibujando los 8 carriles (se mantiene `lpDraw` y la edición), pero
  ahora colocado **a la derecha de una columna de cabeceras**, fila a fila alineadas.
- Implementación de alineación: un contenedor flex con dos columnas:
  `.lpHeads` (columna izquierda, las 8 cabeceras, cada una `flex:1 1 0` = misma altura) y
  `.stage` (derecha, `flex:1`) con `#lpCanvas` ocupando todo. Ambas columnas con **la misma altura
  total**, así `lpH/8` (alto de carril en el lienzo) coincide con el alto de cada cabecera.
- **Se elimina** el bloque separado `.lpChannels` de tarjetas de abajo; sus controles se mudan a la
  cabecera de cada fila.

### Cabecera de cada pista (`.lpHead`, compacta)
- **Raya de color** del canal a la izquierda (`LP_COLORS[i]`), como identidad de pista.
- **Nombre** "Canal N" en su color.
- **Selector de sonido** (el actual `.lpSound`, con sus optgroups: sintetizados / reales / batería /
  importar). Sin cambios de lógica.
- **Volumen**: slider `.lpVol` + botón 🎛 `.lpVolLearn` (aprender knob). Sin cambios de lógica.
- **Botones compactos con icono** (mismos `data-*` que hoy, solo cambia su presentación):
  **● Grabar** (`data-rec`), **🔇 Silenciar** (`data-mute`), **🗑 Borrar** (`data-clear`),
  **⊞ Cuadrar** (`data-quant`), y **✏️** (`data-edit`) cuando el canal use un sample importado.
- Ninguna acción se pierde; los **manejadores de eventos existentes se reutilizan** (misma
  delegación sobre el contenedor de canales / mismos atributos `data-*`).

### Carriles (lienzo)
- Se mantiene el dibujo actual de `lpDraw` (rejilla de compás, notas, cabezal) y la edición
  (`lpNoteAt`, `lpEditDown/Move/Up/Dbl`), que ya trabajan por filas `lpH/8`.
- Ajuste: el **color de cada carril coincide con el color de su pista** (`LP_COLORS[i]`), para
  reforzar la identidad cabecera↔carril.
- La fila de la pista que se está grabando se resalta (ya existe resaltado por canal grabando).

### Responsive (no empeorar el escritorio)
- **Escritorio:** cabecera de ancho cómodo (~200 px), idéntico o mejor que hoy.
- **Móvil (≤860px / apaisado):** cabecera más estrecha y controles más pequeños (iconos), carril
  ocupa el resto. Mantener `touch-action` y la edición táctil del lienzo.
- El acabado fino se cuida con las skills `emil-design-eng` y `redesign-skill` al implementar.

## Fuera de alcance (siguiente ciclo)
- **Renombrar pistas** a mano (ACOUSTIC/BASS/DRUMS…) — añadido fácil después.
- **Scroll horizontal** de carriles largos (hoy el bucle entero cabe a lo ancho; loops cortos).
- Mejoras del dibujo de carriles (legibilidad de notas, cabezal) — no pedidas ahora.

## Riesgos / notas
- **Alineación píxel a píxel** cabecera↔carril: depende de que la columna de cabeceras y el lienzo
  tengan la misma altura total y 8 divisiones iguales. Verificar en escritorio y móvil.
- `#lpCanvas` usa `dpr` y `getBoundingClientRect`; al cambiar su contenedor hay que re-ejecutar
  `looperResize()` para recalcular `lpW/lpH` y el transform.
- Reutilizar IDs/manejadores actuales para minimizar cambios de JS; el grueso es HTML/CSS y
  reubicar el markup de `lpBuildChannelUI` (de tarjeta a cabecera de fila).

## Verificación
- `node --check` del `<script>` extraído de `pianova.html` (no hay build ni tests).
- Prueba manual en Chrome/Edge (Live Server): grabar en varios canales con sonidos distintos,
  comprobar que cada cabecera está alineada con su carril, que todos los botones funcionan
  (grabar/silenciar/borrar/cuadrar), que el volumen y el selector siguen operando, que la edición
  de notas (arrastrar/borrar) sigue cayendo en el carril correcto, y revisar móvil (apaisado).
- Actualizar `CLAUDE.md` y `HANDOFF.md` (subir versión) tras implementar.
