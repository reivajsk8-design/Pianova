# Diseño — Transporte pro + faders verticales (Looper)

**Fecha:** 2026-06-27 · **Proyecto:** Pianova (`pianova.html`) · **Estado:** aprobado por el usuario
(diseño). Pendiente: revisión del spec → plan de implementación.

> Lavado de cara "pro" del Looper. (La otra mejora pendiente —selección con recuadro + copiar/
> pegar/duplicar/deshacer en el piano-roll— se diseñará e implementará aparte después.)

## Objetivo

Dar al Looper aspecto de DAW: (1) una **barra de transporte** más profesional con **BPM grande
editable** y el **metrónomo con su propio volumen**; (2) sustituir las **barras deslizantes**
horizontales (volumen por canal y efectos maestros) por **faders verticales** estilo mesa de mezclas.
Mantener todas las funciones actuales y la integración MIDI (mapear a knobs / Play-Stop).

## Alcance

**Dentro:**
- **Barra de transporte** (estilo "B"): una sola fila con etiquetas y separadores: **▶/⏹ Play/Stop**
  (mapeable a MIDI, reusa la acción `lp_play`), **Tempo = BPM grande editable** (clic para escribir,
  arrastrar ↕ para subir/bajar), **Compás**, **Metrónomo** (icono on/off + **mini-fader de volumen**),
  **Rejilla**, y a la derecha las herramientas (🥁 Batería, ⬇ WAV, 📁 Librería).
- **Volumen por canal** → **fader vertical** en la cabecera del canal (con valor numérico y el 🎛 de
  "aprender knob", como ahora).
- **Efectos maestros** (Filtro, Delay tiempo, Delay cantidad, Reverb) **+ volumen del Metrónomo** →
  **rack de faders verticales** con valor y 🎛.
- **Volumen del metrónomo** real: nuevo `lpClickVol` (0..1) que escala el clic en `lpClickSound`.
- Cada fader: **arrastrar** = subir/bajar, **doble-clic** = reset, **🎛** = mapear a knob MIDI.

**Fuera (otro ciclo):** selección/clipboard/undo del piano-roll; knobs giratorios (se eligieron
faders); rediseñar Aprender/Reto.

## Restricciones (heredadas)

- **Un solo archivo** `pianova.html`; sin librerías; sin build; `smplr` intacto.
- **Textos en español.** **No empeorar** la usabilidad táctil/móvil (los faders deben poder
  arrastrarse con el dedo). **No romper** la integración MIDI existente.
- Reutiliza los datos y sistemas actuales: `channel.vol`, `fxParams` (`filter`/`delayTime`/
  `delayAmount`/`reverb`), `applyFx()`, `setChannelVolFromCC`, `volMap`/`volLearn`, `fxMap`/`fxLearn`,
  `midiMap` (`lp_play`), `lpClickSound`, `lpTempoEl`/`lpBarsEl`/`lpClickEl`/`quantizeGrid`.

## Arquitectura (unidades)

### 1. Componente fader vertical reutilizable (`makeFader`)
- Un **fader DOM** reutilizable: contenedor con pista, relleno y "cap" arrastrable + lectura de valor
  + etiqueta. API: `makeFader(el, { value, min, max, step, fmt, color, onInput, onReset })`.
- Interacción: **pointer drag** vertical (arriba sube), **doble-clic** = valor por defecto,
  `touch-action:none` para táctil, pointer capture. Expone `setValue(v)` para que el MIDI-learn /
  knobs actualicen su posición sin disparar bucles.
- Es la pieza común para: volumen de canal, efectos, volumen de metrónomo. Mantiene **un único
  modelo de datos** (el valor vive en `channel.vol` / `fxParams[x]` / `lpClickVol`).
- **Por qué un fader propio y no `<input type=range>` vertical:** los range verticales nativos son
  inconsistentes entre navegadores; un fader propio da el look pro, el doble-clic-reset y el valor,
  y se integra limpio con el MIDI-learn (`setValue`).

### 2. Volumen por canal (cabecera)
- Sustituir el `.lpVol` (slider horizontal) por un **fader vertical** (`makeFader`) en la cabecera,
  ligado a `lp.channels[i].vol`. `onInput` → `channel.vol = v; saveLooper()` (sin romper
  `playChannelSound`). El botón 🎛 (`volLearn`) sigue igual; `setChannelVolFromCC` llama a
  `fader.setValue(v)` para reflejar el knob. La cabecera se reordena para alojar el fader sin
  amontonar (el resto de controles —sonido, Grabar/Silenciar/Borrar/Cuadrar, ✏️— se mantienen).

### 3. Rack de efectos (`.lpfx`) + volumen de metrónomo
- Sustituir los sliders `.lpfx` (`data-fx`) por **faders verticales** (`makeFader`) ligados a
  `fxParams.filter/delayTime/delayAmount/reverb`; `onInput` → `applyFx()`. 🎛 (`fxLearn`) igual; los
  knobs llaman `fader.setValue`.
- Añadir un fader **Metrónomo** ligado a `lpClickVol`.

### 4. Volumen del metrónomo (`lpClickVol`)
- Nueva variable `lpClickVol` (0..1, por defecto p. ej. 0.8) persistida en `store`. En `lpClickSound`,
  escalar el pico del clic por `lpClickVol` (mín. > 0 para no romper el ramp exponencial). Fader en
  el rack y/o mini-fader en el transporte (mismo dato).

### 5. Barra de transporte (estilo B)
- Reestructurar el HTML de `.controls` del Looper en una barra con grupos + separadores y etiquetas:
  - **▶/⏹** Play/Stop (reusa `lpTogglePlay`; sigue mapeable por `lp_play` en "Aprender MIDI").
  - **BPM editable**: número grande. Clic → editable (input numérico, Enter/blur confirma); arrastrar
    ↕ → ajusta BPM. Escribe en el mismo `lpTempoEl` (o su variable) para no romper `lpTick`/tempo.
    Rango 50–160 (como hoy). Muestra "BPM".
  - **Compás** (`lpBarsEl`), **Metrónomo** (icono on/off = `lpClickEl` + mini-fader de `lpClickVol`),
    **Rejilla** (`#lpQuant`).
  - Herramientas a la derecha: Batería / Exportar / Librería (sin cambios funcionales).
- El escritorio se ve pro; en **móvil** la barra envuelve (wrap) y los faders se pueden tocar.

## Flujo de datos (resumen)
```
makeFader(el, {value, onInput, onReset})  → arrastrar/doble-clic
  volumen canal  → channel.vol → playChannelSound usa vol ; saveLooper
  efectos        → fxParams[x] → applyFx()
  metrónomo      → lpClickVol  → lpClickSound escala el clic ; store
  MIDI knob (volMap/fxMap) → setChannelVolFromCC / fx → fader.setValue(v)  (refleja sin bucle)
BPM grande editable → lpTempoEl/tempo (igual que el slider de hoy) → lpTick
Play/Stop → lpTogglePlay ; mapeable por midiMap.lp_play (Aprender MIDI)
```

## Riesgos / notas
- **MIDI-learn ↔ fader:** evitar bucles (knob → setValue no debe re-disparar onInput que reenvíe).
  `setValue` solo actualiza visual + dato, sin callback.
- **Táctil:** faders con `touch-action:none`; cuidar que el arrastre vertical del fader no choque con
  el scroll de la página (el fader captura el puntero al arrastrar).
- **BPM editable:** validar número (clamp 50–160) y no romper `parseFloat(lpTempoEl.value)` que usan
  `lpTick`, export, etc. Mantener `lpTempoEl` como fuente de verdad (aunque el slider se oculte/quite).
- **Cabecera de canal:** ya es compacta; meter un fader vertical sin amontonar (revisar alto de fila
  `--lprow` y responsive).
- No romper `volMap`/`fxMap` persistidos ni los 🎛.

## Verificación
- `node --check` del `<script>` + tests Node de funciones puras (mapeo valor↔posición del fader,
  clamp de BPM, escala del clic por `lpClickVol`).
- Manual (Chrome/Edge): arrastrar faders de volumen y efectos (valor + sonido cambian); doble-clic
  resetea; 🎛 + girar knob mueve el fader; BPM: clic para escribir y arrastrar para cambiar (el tempo
  real cambia); metrónomo on/off + su volumen; Play/Stop por botón y por control MIDI mapeado;
  recargar y que persista (vol, fx, lpClickVol, tempo). Revisar móvil (táctil) y que el resto de la
  app no cambió.
- Actualizar `CLAUDE.md` y `HANDOFF.md` (subir versión) tras implementar.
