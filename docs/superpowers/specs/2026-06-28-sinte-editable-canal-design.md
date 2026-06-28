# Diseño — Sintetizador editable por canal (osc blend + ADSR + filtro) en el Looper

**Fecha:** 2026-06-28 · **Proyecto:** Pianova (`pianova.html`) · **Estado:** diseño aprobado por el
usuario ("perfecto adelante"). Inspirado en `RFullum/GrooveBox` (Pure Data). Implementación con
**subagentes**. Primera mejora del **roadmap del Looper** (ver [[pianova-audio-pendientes]]).

## Objetivo

Convertir un canal del Looper en un **sintetizador ajustable**: un nuevo sonido de canal **"🎛️ Sinte
editable"** con parámetros propios (mezcla de osciladores, envolvente ADSR, filtro) editables en un
panel, en vivo, y guardados por canal. Los 5 presets synth actuales se mantienen como sonidos rápidos.

## Alcance

**Dentro:**
1. **Spec del sinte por canal** (`channel.synth`): `{ sine, square, saw (0..1), attack, decay,
   sustain (0..1 nivel), release, filterType:'lowpass'|'bandpass', cutoff (Hz), resonance (Q) }` +
   `synthDefault()` (valores razonables: pluck suave).
2. **Nuevo sonido de canal `'synthx'`** ("🎛️ Sinte editable"): opción añadida al selector de sonido
   del canal (`rebuildChannelSoundOptions`); al elegirlo, `channel.sound='synthx'` y se garantiza
   `channel.synth = synthDefault()` si falta. Un botón **"✎"** (visible en canales `synthx`) abre el
   editor de ese canal.
3. **Motor de voz `synthVoiceAdj(midi, vel, p, gainMul, when)`:** 3 osciladores (seno/cuadrada/sierra
   a sus niveles `p.sine/p.square/p.saw`) → ganancia con **ADSR** (A→pico, D→nivel sustain, [sostén],
   R al soltar) → **filtro** biquad (`p.filterType`, `p.cutoff`, `p.resonance`) → `masterDest()`.
   Devuelve un voice `{o, g, release}` y **reutiliza** `voices`/`synthSilence`/`synthStopAt` y el
   agendado con instante `when`. Va por el bus maestro (limitador/EQ).
4. **Integración en `playChannelSound`:** si `sound==='synthx'` → `synthVoiceAdj(midi, vel,
   channel.synth, vol, when)`; parada como la rama synth actual (`synthStopAt` para secuencias con
   `when`, `setTimeout(silence)` para el respaldo en vivo).
5. **Editor (overlay `#synthEd`):** sliders de **osc blend** (seno/cuadrada/sierra), **ADSR** (4),
   **filtro** (toggle LP/BP + corte + resonancia) y **"▶ Probar"** (toca una nota con los parámetros
   actuales). Edita `channel.synth` en vivo y persiste (debounced). ✕/Esc cierra.
6. **Persistencia:** `saveLooper`/`restoreLooper` guardan/cargan `channel.synth`.

**Fuera (YAGNI):** LFO/vibrato, sub-osc, detune/unison, 2º filtro, modulación, aplicar el sinte
editable al **instrumento global** de Aprender (solo Looper por ahora). El resto del roadmap del
Looper (solo/pan, swing, step-grid, patrones) son ciclos aparte.

## Restricciones (heredadas)

- **Un solo archivo** `pianova.html`; sin librerías nuevas; sin build; textos/comentarios en **español**.
- **No romper** los presets synth fijos, el resto de sonidos de canal (sf/drum/sample), el agendado
  fluido (v1.30), la ganancia por canal (v1.32) ni el bus maestro/EQ.
- Reutilizar: `synthNoteOn`/`synthSilence`/`synthStopAt`/`voices`, `playChannelSound`,
  `rebuildChannelSoundOptions`/el selector de sonido del canal, `saveLooper`/`restoreLooper`,
  el patrón de overlay (`#pianoroll`/`#eqEditor`: `hidden`, Esc, abrir/cerrar), `makeFader` o sliders
  `<input type=range>`, `$`, `dpr` (no hace falta canvas), `masterDest`, `ensureAudio`.
- El sinte editable suena por `masterDest()` con la ganancia del canal (multiplicación, como el synth
  preset actual) — la voz **no** lleva su propio nodo de ganancia de canal.

## Arquitectura (unidades)

### 1. Modelo (`synthDefault`, `channel.synth`)
- `synthDefault()` → `{ sine:0.6, square:0.0, saw:0.4, attack:0.01, decay:0.3, sustain:0.0,
  release:0.2, filterType:'lowpass', cutoff:6000, resonance:1 }` (un pluck brillante por defecto).
- Helpers puros de acotado: `clamp01(v)`, `clampHz(v)` (20–20000), `clampQ(v)` (0.3–20),
  `clampTime(v)` (0–3 s) — para sliders y carga.

### 2. Motor de voz (`synthVoiceAdj`)
- Frecuencia `440*2^((midi-69)/12)`. `t = when ?? actx.currentTime`.
- Para cada onda con nivel > 0: `OscillatorNode(type) → GainNode(nivel) → g`.
- Envolvente: `g.gain` 0.0001 → `peak` en `t+attack`; → `max(0.0001, peak*sustain)` en
  `t+attack+decay`; el `release` se aplica al parar (`synthStopAt`/`synthSilence`). `peak` =
  `max(0.0002, (0.16+0.22*vel) * (gainMul??1))` (mismo nivel base que el synth actual).
- Filtro: `BiquadFilterNode(filterType)`, `frequency=cutoff`, `Q=resonance`; `g → filtro → masterDest`.
- Guarda `voices[midi] = { o:[osc…], g, release }` y lo devuelve (igual contrato que `synthNoteOn`).

### 3. UI (overlay `#synthEd`)
- `synthEdCh` (canal en edición). `openSynthEd(ch)`: fija `synthEdCh`, rellena los sliders desde
  `channel.synth`, muestra el overlay. `closeSynthEd()`: oculta, `saveLooper()`.
- Controles: seno/cuadrada/sierra (0–1), A/D/R (0–3 s), S (0–1), corte (20–20000, log o lineal),
  resonancia (0.3–20), toggle LP/BP, **"▶ Probar"** (toca midi 60 con `channel.synth`, para a ~0.6 s).
- Cada `input` actualiza el campo de `channel.synth`, `saveLooperDebounced()`. (No hay re-voz en
  vivo de notas sostenidas; los cambios afectan a la siguiente nota — la prueba lo refleja.)

### 4. Selector de sonido y botón ✎
- `rebuildChannelSoundOptions`: añadir un optgroup/opción "🎛️ Sinte editable" (`value='synthx'`).
- En la cabecera del canal, un botón **"✎"** visible solo si `channel.sound==='synthx'` → `openSynthEd(i)`.
- Al cambiar el sonido a `synthx`: si no hay `channel.synth`, `channel.synth = synthDefault()`.

## Flujo de datos (resumen)
```
elegir "Sinte editable" -> channel.sound='synthx' (+ channel.synth=synthDefault si falta) -> saveLooper
playback: playChannelSound(sound='synthx') -> synthVoiceAdj(midi,vel,channel.synth,vol,when)
  -> voices[midi] ; parada synthStopAt(when+durSec) / setTimeout(silence) (igual que synth)
editar (overlay): slider -> channel.synth.* -> saveLooperDebounced ; "Probar" -> synthVoiceAdj(60,...)
recargar -> restoreLooper -> channel.synth
```

## Riesgos / notas
- **ADSR vs motor actual:** el synth preset hace attack→pico y luego decae a 0 (percusivo) o sostiene
  el pico (sustain bool). El sinte editable usa **nivel de sustain** (D→sustain, sostén, R al soltar):
  por eso un motor de voz **propio** (`synthVoiceAdj`), no reusar `synthNoteOn`. La parada
  (`synthStopAt`/`synthSilence`) ya rampa a 0 en `release`, compatible.
- **Polifonía:** `voices[midi]` indexado por midi (global); dos canales `synthx` con la misma nota a la
  vez pueden pisarse (igual limitación que el synth actual; aceptable).
- **exponentialRamp a 0:** usar siempre mínimo 0.0001 (nunca 0) para no lanzar error (lección v1.4).
- **Filtro paso-banda con Q alto:** puede sonar fuerte/resonante; el limitador/soft-clipper lo contiene.
- **Compatibilidad:** canales viejos sin `channel.synth` siguen igual; `synthx` es un sonido nuevo y
  opcional. Móvil: el overlay con sliders debe envolver sin solapar.

## Verificación
- `node --check` + balance CSS + **test Node** de los helpers puros (`clamp01/clampHz/clampQ/clampTime`
  y `synthDefault` devuelve los campos esperados en rango).
- **Prueba manual (Chrome/Edge + móvil, Live Server):** poner un canal en "🎛️ Sinte editable",
  grabar/dibujar notas y oírlas; abrir "✎", mover osc blend / ADSR / filtro y oír el cambio en la
  siguiente nota y con "▶ Probar"; recargar mantiene el sonido; los presets y demás sonidos siguen
  igual; suena fluido (agendado) y sin clipping.
- Subir versión, actualizar `CLAUDE.md` y `HANDOFF.md`.
