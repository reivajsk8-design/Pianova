# Diseño — Proyecto pro · Fase 3: DAW / Groovebox

**Fecha:** 2026-06-28 · **Proyecto:** Estudio (`studio/`, rebuild pro) · **Estado:** diseño aprobado.
Fase 3 de la hoja de ruta (ver CLAUDE.md decisión 5 / [[pianova-audio-pendientes]]). Construye sobre la
Fase 1 (synth + cadena maestra + teclado + MIDI) y la Fase 2 (suite de efectos + racks + proyecto).

## Objetivo

Convertir el **Estudio** en un **DAW/groovebox**: varios **canales** (cada uno con instrumento, su rack de
efectos y controles de mezcla), un **secuenciador por pasos** con transporte (play/stop/tempo), **batería
sintetizada**, **patrones + song mode**, **swing** y **control MIDI**. Entrega por sub-tandas; el
aprendizaje de instrumentos será un módulo aparte (F4).

## Decisiones (tomadas en el brainstorming)

- **El Estudio se convierte en el groovebox** (no una pestaña aparte): barra de transporte + lista de
  canales + cuadrícula de pasos + rack maestro; el teclado toca/graba en el canal seleccionado. El "rack
  de instrumento" actual pasa a ser el rack del canal 0.
- **Batería sintetizada** (808, nativa) ahora; **samples por canal** como mejora posterior.
- **Entrega por 5 sub-tandas**: 3A transporte+secuenciador (1 canal) · 3B varios canales+mezcla · 3C
  batería · 3D patrones+song · 3E swing+MIDI. (Piano-roll melódico y samples por canal: mejoras tras 3E.)

## Alcance

**Dentro (toda la F3, repartida en sub-tandas):**
1. **Modelo** (`daw/model.ts`): `Channel`, `Pattern`, `Project`/estado del groovebox; operaciones puras
   (crear/borrar canal, alternar paso, solo/mute efectivo, reordenar).
2. **Transporte + secuenciador** (`daw/sequencer.ts`): bucle de adelanto sobre `makeTransport`; planifica
   los pasos próximos en el reloj de audio; play/stop/tempo; swing (3E). La parte de "qué pasos caen en
   una ventana" es pura y testeable.
3. **Disparo agendado**: el synth (`audio/synth.ts`) y la batería ganan un disparo con `when` (tiempo de
   audio) para que el secuenciador agende con precisión.
4. **Canales + mezcla** (`daw/channel.ts`): instrumento (preset synth | voz de batería | sample futuro),
   volumen, pan, mute, solo, y **rack de efectos por canal** (reusa `createRack`). Ruta:
   `instrumento → [rack canal] → volumen → pan → masterDest`.
5. **Batería sintetizada** (`audio/drums.ts`): voces 808 (bombo, caja, charles cerrado/abierto, clap,
   tom) con osciladores + ruido + envolventes; las envolventes/curvas son puras y testeables.
6. **Patrones + Song mode** (3D): varios patrones (pasos de todos los canales) + secuencia de patrones.
7. **Swing + control MIDI** (3E): swing (retraso de pasos pares), mapeo MIDI (transporte, selección de
   canal, **grabación de pasos** desde el teclado, knob→volumen).
8. **UI del groovebox** (`app/studioView.ts` reestructurado + `ui/` nuevos): barra de transporte, tira de
   canal, cuadrícula de pasos, selector de patrón/song.
9. **Persistencia**: `ProjectState` crece (canales, patrones, transporte) con **migración** del formato
   F2 (un instrumento + 2 racks) → groovebox (canal 0 + rack maestro).

**Fuera (fases/mejoras posteriores, YAGNI ahora):** módulo Aprender (F4), conmutar el sitio (F5),
piano-roll melódico por canal, samples por canal, automatización, exportar audio. No tocar `pianova.html`.

## Restricciones (heredadas)

- Todo en **`studio/`**; **Vite + TypeScript strict**; **Vitest**; **sin framework de UI**; textos/
  comentarios en **español**. No tocar `pianova.html`.
- Reusar: `makeTransport` (`audio/transport.ts`), `synth` (`audio/synth.ts`), `createRack` (`fx/rack.ts`),
  `ensureWorklets` (`fx/worklets.ts`), `store`/proyecto (`app/store.ts`), teclado (`ui/keyboard.ts`),
  entrada MIDI (`midi/input.ts`), bus maestro (`audio/masterBus.ts`).
- El audio arranca tras gesto (`ensureAudio`). `exponentialRampToValueAtTime` nunca a 0.
- **Lógica pura separada del audio/DOM** para poder testearla (planificación del secuenciador, modelo,
  envolventes de batería, serialización/migración).
- Verificación por sub-tanda: `npm run typecheck` + `npm test` + `npm run build`, y prueba por oído.

## Arquitectura (unidades)

### 1. `daw/model.ts` — modelo y operaciones puras
- `Step = { on: boolean; note?: number; vel?: number }`.
- `ChannelState = { id: string; name: string; instrument: InstrumentSpec; steps: Step[]; volume: number;
  pan: number; muted: boolean; soloed: boolean; rack: RackState }`.
- `InstrumentSpec = { kind: 'synth'; preset: string } | { kind: 'drum'; voice: string }` (sample futuro).
- `PatternState = { channels: ChannelState[] }` (3D: varios patrones); `DawState = { patterns: PatternState[];
  current: number; song: number[]; bpm: number; swing: number; steps: number }`.
- Operaciones **puras**: `addChannel`, `removeChannel`, `toggleStep`, `setStepNote`, `audibleChannels`
  (resuelve solo/mute: si hay algún `soloed`, solo suenan los soloed; si no, los no-muteados),
  `reorderChannels`. Sin tocar audio.

### 2. `daw/sequencer.ts` — transporte + planificación
- `dueSteps(fromBeat, toBeat, totalSteps, stepsPerBeat, swing): {step:number, beat:number}[]` — **pura**:
  qué pasos (con su beat, ya ajustado por swing) caen en `[fromBeat, toBeat)`. Testeable sin audio.
- `makeSequencer(actx, transport, getState, trigger)`: bucle de adelanto (`setInterval` ~25 ms): calcula
  la ventana `[beatNow, beatNow+lookahead]`, llama a `dueSteps`, y por cada paso activo de cada canal
  audible invoca `trigger(channel, note, vel, when)` con el tiempo de audio (`transport.timeForBeat`).
  `play()`/`stop()`; el bucle envuelve el patrón (loop). `LOOKAHEAD_SEC` como en pianova.

### 3. Disparo agendado (audio)
- `synth.noteOn(midi, vel?, when?)` y un apagado agendado (gate fijo por paso, p. ej. `synthTriggerAt`):
  reproduce una nota a tiempo de audio `when` con duración de gate. (Extiende lo de F1 sin romperlo:
  `when` por defecto = `currentTime`.)
- `drums.triggerDrum(voice, when, vel)`: dispara una voz 808 a tiempo `when`.

### 4. `daw/channel.ts` — canal de audio
- `makeChannel(actx, state, masterIn)`: crea `instrumentBus` (GainNode) → `rack = createRack(actx,
  instrumentBus, channelGain)` → `channelGain` → `panner(StereoPanner)` → `masterIn`. El instrumento
  (synth/batería) dispara hacia `instrumentBus`. Métodos: `setVolume`, `setPan`, `setMuted`, `trigger
  (note, vel, when)` (según instrumento), `serialize`, `dispose`. (Synth global → por canal: el secuenciador
  pasa el destino del disparo al `instrumentBus` del canal; se añade un parámetro de destino al disparo.)

### 5. `audio/drums.ts` — batería sintetizada
- `DRUM_VOICES` (bombo, caja, charles cerrado, charles abierto, clap, tom): cada una con osciladores
  (seno/triangular para tonales) + ruido (para caja/charles) + envolvente de amplitud y de tono.
- `triggerDrum(actx, dest, voice, when, vel)`. Las **envolventes/parámetros** se calculan con funciones
  **puras** (testeables): p. ej. la curva de tono del bombo, la duración del charles.

### 6. UI (`app/studioView.ts` reestructurado + `ui/transport.ts`, `ui/channelStrip.ts`, `ui/stepGrid.ts`)
- **Barra de transporte**: ▶/⏹, BPM editable, (swing en 3E), selector de patrón/song (3D).
- **Tira de canal**: nombre, selector de instrumento, fader de volumen, pan, mute/solo, botón para abrir
  su rack (reusa `mountRack`). El canal seleccionado recibe el teclado.
- **Cuadrícula de pasos**: filas = canales, columnas = pasos; clic alterna; resalta el paso en curso
  (cabezal sincronizado con `transport.beatNow`).

### 7. Persistencia y migración (`app/store.ts`)
- `ProjectState` (v2): `{ version: 2; daw: DawState; masterRack: RackState }`. **Migración** desde v1
  (`{version:1, instrument, instrumentRack, masterRack}`): crea un patrón con un canal `{kind:'synth',
  preset:instrument, rack:instrumentRack}` y conserva `masterRack`. Autoguardado + guardar/abrir archivo
  (igual que F2). La (de)serialización y la migración son **puras y testeables**.

## Flujo de datos (resumen)
```
play -> transport.anchor -> sequencer loop (lookahead) -> dueSteps(ventana, swing)
  -> por cada canal audible (solo/mute) con paso activo: channel.trigger(note, vel, when)
     -> instrumento (synth/drum) agendado en `when` -> instrumentBus -> [rack canal] -> vol -> pan -> masterIn
masterIn -> [rack maestro] -> limitador -> salida
teclado -> toca/graba en el canal seleccionado
guardar/abrir: DawState (canales, pasos, patrones, bpm, swing) + masterRack <-> localStorage / .json
tests: dueSteps, modelo (solo/mute, toggle, migración), envolventes de batería
```

## Riesgos / notas
- **Timing del secuenciador:** el patrón de adelanto (planificar en el reloj de audio, no en el de
  fotogramas) es lo que da ritmo estable; ya probado en `pianova.html`. La ventana/lookahead se ajusta
  como allí.
- **Disparo agendado del synth:** hay que extender F1 con `when` sin romper el modo en vivo (teclado).
- **Reestructuración del Estudio:** es un cambio grande de UI; se hace en 3A (transporte + 1 canal) y se
  amplía en 3B. El rack del canal 0 hereda lo que era el rack de instrumento (vía migración).
- **Migración de proyecto:** un proyecto F2 guardado debe abrirse en F3 sin romperse (v1→v2).
- **CPU:** varios canales con racks suman; aceptable para uso normal; el limitador maestro contiene picos.

## Verificación
- `npm run typecheck` + `npm test` (secuenciador/modelo/batería/migración puros) + `npm run build`.
- **Manual (Chrome/Edge + móvil):** por sub-tanda — 3A: una secuencia suena a tempo, play/stop/tempo;
  3B: varios canales con volumen/pan/mute/solo y efectos por canal; 3C: ritmo de batería; 3D: patrones y
  song; 3E: swing y manejo por MIDI. `pianova.html` sigue igual.
- Actualizar `HANDOFF.md`/`CLAUDE.md` por sub-tanda (y subir `studio/package.json`).
