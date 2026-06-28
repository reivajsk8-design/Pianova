# Diseño — Proyecto pro · Fase 1: Motor de instrumentos (tocar y sonar)

**Fecha:** 2026-06-28 · **Proyecto:** Estudio (`studio/`, rebuild pro) · **Estado:** diseño aprobado
("perfecto"). Fase 1 de la hoja de ruta (ver CLAUDE.md decisión 5 / [[pianova-audio-pendientes]]).
Construye sobre la Fase 0 (scaffold + bus mínimo + transporte).

## Objetivo

Que el **Estudio** ya se pueda **tocar y oír**: portar de `pianova.html` la **cadena maestra**
(limitador + soft-clipper + makeup), el **motor synth** (5 presets), y la **entrada** (MIDI + teclado
en pantalla + teclas del ordenador), con una UI de teclado en la vista **Estudio**. Entregable:
conectas tu teclado (o ratón/teclas), eliges un instrumento y **suena**, con la potencia y sin clipping
de la app actual.

## Alcance

**Dentro:**
1. **Cadena maestra** (`audio/masterBus.ts`, extender `setupMasterBus`): `masterIn → limitador
   (DynamicsCompressor) → makeup/pre → soft-clipper (WaveShaper tanh con drive) → masterFinal →
   destination`. Constantes portadas: `SOFTCLIP_DRIVE=2.5`, `MASTER_MAKEUP=2.5` (pre = makeup/drive).
   `masterDest()` sigue devolviendo `masterIn`. (EQ, delay/reverb y la suite de efectos = fases
   posteriores; aquí solo la pared anti-clipping con potencia.)
2. **Motor synth** (`audio/synth.ts`): los **5 presets** (`piano`, `brillante`, `organo`, `campanas`,
   `cuerda`) con su `partials`/`filter`/`peak`/`attack`/`decay`/`sustain`/`release`/`vibrato`, y el
   disparo de voz (`synthNoteOn` → osciladores + envolvente → `masterDest`), `synthSilence` (release) y
   el mapa `voices` por nota. API: `noteOn(midi, vel?)`, `noteOff(midi)`, `setPreset(name)`.
3. **Entrada MIDI** (`midi/input.ts`): `connectMidi(onNote)` con `navigator.requestMIDIAccess`; parseo
   de mensajes (status `0x90` vel>0 = note on; `0x80` o `0x90` vel0 = note off; **ignora canal 10**);
   escucha todas las entradas; devuelve nombres de dispositivos / estado (con `onstatechange`).
4. **Teclado en pantalla + teclas del ordenador** (`ui/keyboard.ts`): teclado clicable (ratón/táctil)
   y las teclas `A S D F G H J K` (blancas) / `W E T Y U` (negras) del ordenador → `noteOn/noteOff`.
5. **UI en la vista Estudio** (`app/`): el teclado + un **selector de instrumento** (los 5 presets) +
   un **botón Conectar teclado** con indicador de estado. (Reemplaza el "próximamente" de Estudio.)
6. **Tests puros (Vitest):** el parseo de mensajes MIDI (note on/off, canal 10 ignorado) y el mapa
   tecla-de-ordenador → nota MIDI.

**Fuera (fases posteriores, YAGNI ahora):** EQ + editor, efectos (suite TAP = Fase 2), sampler,
instrumentos reales (smplr), sinte editable, looper/secuenciador, módulo Aprender, persistencia,
agendado/looper (el transporte ya está portado pero no se usa aún). No tocar `pianova.html`.

## Restricciones (heredadas)

- Todo en **`studio/`**; **Vite + TypeScript strict**; **Vitest**; **sin framework de UI** (DOM a mano);
  textos/comentarios en **español**. No tocar `pianova.html`.
- Reusar la Fase 0: `ensureAudio`/`getAudioContext` (`audio/context.ts`), `masterDest()` y la forma del
  bus (`audio/masterBus.ts`). El synth conecta por `masterDest()`.
- **Portar la lógica probada** de `pianova.html` (mismos valores del limitador/soft-clipper/makeup y de
  los presets `SYNTH`; misma envolvente; mismo parseo MIDI e ignorar canal 10) — sin reinventar.
- `exponentialRampToValueAtTime` nunca a 0 (mínimo 0.0001). El audio arranca tras gesto (`ensureAudio`).
- Verificación: `npm run typecheck` + `npm test` (parsers puros) + `npm run build`, y prueba manual por
  oído (MIDI/ratón/teclas).

## Arquitectura (unidades)

### 1. `audio/masterBus.ts` (extender)
- `setupMasterBus(actx)` monta: `masterIn` → `limiter` (DynamicsCompressor: threshold −6, knee 0,
  ratio 20, attack 0.003, release 0.25) → `clipPre` (gain = `MASTER_MAKEUP/SOFTCLIP_DRIVE`) → `clip`
  (WaveShaper, curva `tanh(SOFTCLIP_DRIVE·x)`, oversample '4x') → `masterFinal` (gain 1) → destination.
- `makeSoftClipCurve(n, drive)` (pura, portada). `masterDest()` = `masterIn`. `testTone()` sigue.

### 2. `audio/synth.ts`
- `SYNTH` (objeto de 5 presets, portado). `voices: Record<number, Voice>`. `let currentPreset='piano'`.
- `noteOn(midi, vel=0.8)`: crea la voz del preset actual (osciladores con `partials`, filtro opcional,
  envolvente A→pico→(decay|sustain), vibrato opcional) por `masterDest()`; guarda en `voices`.
- `noteOff(midi)` → release (rampa a 0.0001 en `release`, stop diferido). `setPreset(name)`.
- `allNotesOff()` para limpiar. (Mismo contrato que `pianova.html`.)

### 3. `midi/input.ts`
- `parseMidiMessage(data: Uint8Array): {type:'on'|'off'|'other', midi, vel, channel}` — **pura**
  (status/canal; `0x90` vel>0 = on; `0x80`/`0x90` vel0 = off; canal 10 → 'other').
- `connectMidi(handlers:{ onNoteOn(midi,vel), onNoteOff(midi), onState(names:string[]) })`:
  `requestMIDIAccess`, engancha `onmidimessage` de todas las entradas (usando `parseMidiMessage`,
  ignorando canal 10), y `onstatechange` para reaccionar a conectar/desconectar. Maneja "sin Web MIDI".

### 4. `ui/keyboard.ts`
- `KEY_TO_SEMITONE` (mapa de teclas de ordenador → semitono; **puro/testeable**) sobre una octava base.
- `mountKeyboard(root, { onNoteOn, onNoteOff, lowMidi, highMidi })`: dibuja teclas (blancas/negras),
  ratón/táctil (pointerdown=noteOn, up/leave=noteOff) y `keydown`/`keyup` del ordenador (sin repetición).

### 5. Vista Estudio (`app/shell.ts` o `app/studioView.ts`)
- En `#viewStudio`: selector de instrumento (5 presets → `synth.setPreset`), botón **Conectar teclado**
  (→ `connectMidi`, muestra nombres/estado) y el teclado (`mountKeyboard`) cableado a `synth.noteOn/Off`.
  Las teclas se iluminan al sonar (resaltado simple).

## Flujo de datos (resumen)
```
gesto -> ensureAudio() -> setupMasterBus (limiter+clip+makeup)
tocar: MIDI / ratón / tecla -> noteOn(midi,vel) -> synth (osc+env) -> masterDest -> cadena -> destination
soltar -> noteOff(midi) -> release
selector -> synth.setPreset(name) ; Conectar -> connectMidi(...) -> estado
tests: parseMidiMessage (on/off/canal10) ; KEY_TO_SEMITONE
```

## Riesgos / notas
- **Portabilidad fiel:** copiar los valores exactos del limitador/soft-clipper/makeup y los presets de
  `pianova.html` (la fuente de verdad), para que suene igual de bien y sin clipping.
- **MIDI sin soporte:** si `navigator.requestMIDIAccess` no existe (p. ej. Safari), `connectMidi` da un
  mensaje claro y la app sigue usable con ratón/teclas.
- **Polifonía:** `voices` indexado por midi (global), como en `pianova.html` (aceptable).
- **No agendar todavía:** la entrada es en vivo (sin `when`); el agendado/looper llega en su fase.
- **Móvil:** `touch-action:none` en el teclado; objetivos táctiles cómodos.

## Verificación
- `npm run typecheck` (sin errores) + `npm test` (parsers puros pasan) + `npm run build` (sin errores).
- **Manual (Chrome/Edge + móvil):** abrir el Estudio; **Conectar teclado** detecta el controlador (o
  mensaje claro si no hay); tocar por **MIDI / ratón / teclas A-S-D-F…** suena con el preset elegido;
  cambiar de preset cambia el sonido; subir fuerte no produce clipping (limitador/makeup). `pianova.html`
  sigue igual.
- Actualizar `HANDOFF.md`/`CLAUDE.md` (Fase 1 hecha).
