# Iluminación reactiva del Estudio (destello de pads + slice activo con cursor) — Diseño

**Fecha:** 2026-07-05 · **Versión objetivo:** 0.19.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Dar realimentación visual "pro" de qué está sonando en el Estudio (PIANOVA STUDIO):

1. **Destello de pads:** durante la reproducción del secuenciador, cada canal audible destella
   en la rejilla de PADS al sonar su paso; **más brillante cuanto más fuerte** el golpe (velocity).
   Además, el pad del canal seleccionado destella también al **tocar en vivo con el teclado** (MIDI
   o teclas del ordenador).
2. **Slice activo + cursor (SAMPLES):** en el editor del canal `slicer`, cuando suena un slice se
   **resalta** en la lista y una **línea-cursor recorre la onda** entre el inicio y el fin de ese
   slice, tanto en reproducción del secuenciador como al previsualizar/tocar. Si suenan varios slices
   solapados, se resaltan/cursorean todos los activos.

## Principio de arquitectura

**No se toca el motor de audio.** El `studioView` ya sabe exactamente cuándo dispara cada sonido:
- `onStep(i, when)` del secuenciador (por canal audible, con `note`/`vel` y tiempo `when` agendado).
- `playLive(m, v)` (teclado en vivo, canal seleccionado, en `actx.currentTime`).
- `testSlice(index)` (botón ▶ de previsualización de un slice).

En esos puntos se **apunta el golpe** a un pequeño **bus de destellos** (estado en memoria del
`studioView`) con `{ objetivo, tiempo, velocity, [duración] }`. Un **bucle de animación** (el
`playhead()` con `requestAnimationFrame` que ya existe) lee el **reloj de audio** y pinta la
iluminación, quedando sincronizada con lo que se oye.

**Alternativa descartada:** derivar el destello de la posición del cabezal (paso actual). Sería menos
preciso (ignora el adelanto de agendado y el swing) y no daría la velocity. El bus de golpes es la
fuente única de verdad de "esto ha sonado ahora".

## Componentes

### 1. `studio/src/ui/hitViz.ts` — helpers puros (nuevo, testeable)

Sin estado ni DOM; solo matemática de la iluminación. Firmas:

- `flashLevel(ageSec: number, velNorm: number, fadeSec: number): number`
  Brillo 0–1 de un destello: decae linealmente con la edad (`ageSec`) sobre `fadeSec`; escala por
  velocity con **suelo** (los golpes suaves se ven) y **techo** (los fuertes brillan más). Fuera de
  `[0, fadeSec)` → 0. `velNorm` es 0–1 (velocity/127).
- `sliceProgress(nowSec: number, startSec: number, durSec: number): number`
  Progreso del recorrido de un slice: `(now − start) / dur`, **sin acotar**. El llamador considera el
  slice **activo** cuando el resultado está en `[0, 1)`; `<0` = aún no ha empezado, `≥1` = ya terminó.
  Si `dur ≤ 0`, devuelve `1` (inactivo). No hace falta centinela: el rango `[0,1)` define "activo".
- `activeSliceHits(hits, nowSec)` y `activePadLevel(hits, id, nowSec, fadeSec)`:
  helpers que, dado el array/mapa de golpes y el reloj, devuelven los slices activos con su progreso y
  el nivel de destello de un pad (tomando el golpe más reciente dentro de la ventana). Puros y testeados.

### 2. Destello de pads (rejilla PADS)

- **Estado:** `padHits: Map<string /*channelId*/, { t: number; vel: number }>` en `studioView`
  (último golpe por canal).
- **Registro:** en `onStep`, por cada canal audible cuyo paso `i` está activo, `padHits.set(c.id,
  { t: when + swingOffset(...), vel })`. En `playLive`, `padHits.set(selectedId, { t: actx.currentTime, vel: v })`.
- **Pintado (rAF):** el bucle `playhead()` (o un `visualTick()` contiguo) recorre los pads visibles
  (`[data-pad]`), calcula `activePadLevel(...)` y fija una **variable CSS** `--hit` (0–1) en cada pad;
  el CSS traduce `--hit` a un resplandor verde neón (box-shadow/opacidad de una capa de glow). Nivel 0
  = sin glow. Al **parar** (o sin golpes recientes), todos vuelven a 0.
- **CSS:** regla nueva usando `--hit` sobre `.pvPad` (sin romper `.pvPad.sel`, que sigue marcando el
  seleccionado con borde neón).

### 3. Slice activo + cursor (editor SAMPLES)

- **`mountSampleEditor` pasa a devolver un control** en vez de `void`:
  `interface SampleEditorHandle { setActiveSlices(active: { index: number; progress: number }[]): void; }`
  (`progress` 0–1). Guardar/actualizar marcas y trocear siguen igual; el resto de la firma no cambia.
- **Onda cacheada:** al montar, la forma de onda se dibuja **una vez** en un canvas offscreen. Cada
  frame de reproducción, `setActiveSlices` solo **vuelca la onda cacheada** y pinta encima: marcas +
  resalte de la región de cada slice activo + **línea-cursor** en
  `x = timeToX(slice.start + progress·(slice.end − slice.start))`. Sin slices activos, se pinta el
  estado estático (onda + marcas), como ahora.
- **Resalte en la lista:** los botones de slice activos reciben una clase (p. ej. `.playing`) con glow
  neón, además del `.sel` de selección de edición (S3), que es independiente.
- **Estado y registro:** `sliceHits: { index: number; t: number; dur: number }[]` en `studioView`
  (para el canal `slicer` seleccionado). `dur = slice.end − slice.start` (los slices no cambian de
  tono con la nota, así que la duración audible = duración del slice; el reverse no la altera). Se
  registra en `onStep` (si el canal es el `slicer` seleccionado: `index =
  sliceIndexForNote(base, count, note)`), en `playLive` (rama slicer, con su `idx`) y en `testSlice`.
  Cada frame se filtran los caducados (`activeSliceHits`) y se llama `handle.setActiveSlices(...)`.

## Flujo de datos

```
disparo real (onStep / playLive / testSlice)
      │  registra {t, vel, [index, dur]}
      ▼
bus de golpes (padHits / sliceHits)  ── estado en studioView
      ▲
      │  cada frame (rAF), leyendo reloj de audio
playhead()/visualTick()
      ├─ pads:   activePadLevel → var CSS --hit por pad
      └─ slices: activeSliceHits → handle.setActiveSlices → cursor + resalte en el editor
```

## Bordes y errores

- **Parar reproducción:** limpiar `padHits`/`sliceHits` y poner todos los pads a `--hit:0`; el editor
  vuelve al estado estático.
- **Reposo (sin reproducir y sin tocar):** el rAF de pintado solo trabaja si hay golpes recientes o
  reproducción activa; coste ~cero cuando no pasa nada.
- **Cambio de pestaña:** el destello de pads solo se ve en PADS y el cursor de slice solo en SAMPLES;
  cada pintado actúa sobre su panel y no falla si el otro no está montado.
- **Re-montaje del editor** (`renderSamples`) a mitad de reproducción: se pierde el estado visual del
  cursor un instante; el siguiente golpe lo repuebla. Aceptable.
- **Golpes solapados** (un slice aún sonando cuando entra el siguiente): `sliceHits` es un array; se
  muestran todos los cursores/resaltes activos.
- **Rendimiento:** la onda se cachea (no se recalcula por frame); actualizar ≤~16 pads + un overlay de
  canvas por frame es barato. El rAF ya existe durante la reproducción.

## Pruebas

- **Unitarias (Vitest):** `hitViz.ts` — `flashLevel` (decaimiento, suelo/techo por velocity, fuera de
  ventana = 0), `sliceProgress` (antes/durante/después, centinela de inactivo), `activeSliceHits`/
  `activePadLevel` (filtrado de caducados, golpe más reciente).
- **No unitarias:** pintado de canvas/DOM y variables CSS → typecheck + build + prueba a ojo/oído en
  la URL desplegada (destello por velocity en pads durante la secuencia y al tocar en vivo; slice
  resaltado + cursor recorriendo la onda en SAMPLES; todo se apaga al parar).

## Fuera de alcance (YAGNI)

- Cambiar el motor de audio o el enrutado.
- Medidores de nivel/VU, espectros o animaciones más allá de destello + cursor.
- Iluminar hardware/LEDs de controladores MIDI.
- Cursor global de posición sobre toda la canción (esto es por-pad y por-slice).

## Restricciones globales

- Todo en `studio/`; **no** tocar `pianova.html`. TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Verde neón `#2dff6a` (variable de acento existente).
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
