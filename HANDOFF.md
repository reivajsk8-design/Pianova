# HANDOFF — Pianova

Snapshot para retomar el proyecto en otra sesión (humana o con Claude Code).

**Proyecto pro `studio/` (Fase 0):** se inició una **reescritura modular pro** (DAW/groovebox + aprendizaje como módulo) en la carpeta `studio/`, con **Vite + TypeScript + Vitest**. El **Fase 0 (cimientos)** incluye: scaffold del proyecto, esqueletos de las vistas Estudio (DAW/looper visual) y Aprender (reproductor de prácticas), bus maestro mínimo (`masterIn`/`masterDest`), transporte portado (`makeTransport`, con test de matemática en Vitest) y tono de prueba. **Comandos:** `cd studio && npm install`, `npm run dev` / `npm test` / `npm run build`. Vite está configurado con `base:'./'`, así el `dist/` se abre directamente en Live Server. Despliegue futuro: crear un **2º sitio Netlify con `base directory = studio`** (no es automático; requiere configuración manual). `pianova.html` **(v1.36) sigue siendo la app publicada hasta la Fase 5** (conmutación completa). **Roadmap:** F1 ✅ instrumentos (motor synth + cadena maestra + MIDI + teclado), F2 = suite TAP completa, F3 = DAW/groovebox, F4 = Aprender, F5 = cambio (Aprender a módulo del studio).

**Proyecto pro `studio/` (Fase 1 ✅ — v0.2.0, "tocar y oír"):** ya se puede **tocar y oír en el Estudio**. Se portaron de `pianova.html` (valores exactos): la **cadena maestra** anti-clipping (`audio/masterBus.ts`: limitador + soft-clipper `tanh` + makeup, `SOFTCLIP_DRIVE`/`MASTER_MAKEUP=2.5`, con test Vitest de la curva); el **motor synth** de 5 presets (`audio/synth.ts`: piano/brillante/organo/campanas/cuerda, `noteOn`/`noteOff`/`setPreset`/`getPresetNames`/`allNotesOff`, envolvente con rampas nunca a 0, voces por midi, conecta vía `masterDest()`); la **entrada MIDI** (`midi/input.ts`: `parseMidiMessage` puro+testeado e ignora canal 10, `connectMidi` escucha todas las entradas + `onstatechange`); y el **teclado** (`ui/keyboard.ts`: `KEY_TO_SEMITONE` puro+testeado, `mountKeyboard` con ratón/táctil + teclas A-S-D-F… sin auto-repetición, maneja `pointercancel` en móvil). La **vista Estudio** (`app/studioView.ts`) cablea selector de instrumento + botón "Conectar teclado" (con manejo claro si el navegador no tiene Web MIDI) + teclado tocable; `ensureAudio()` arranca tras gesto. Tests Vitest: curva soft-clip, parseo MIDI, mapa de teclas (10/10 verdes). Próxima: **F2 suite TAP completa**.

**Proyecto pro `studio/` (Fase 2 · Tanda 1 ✅ — v0.3.0, marco de efectos + rack):** ya hay un **marco de efectos** reutilizable con **rack de inserción** montable en dos sitios. Piezas: `fx/effect.ts` (interfaz `Effect` + registro `EFFECTS` + `registerEffect` + `makeEffect` con **bypass por puerta seco/húmedo** —el efecto solo conecta `input → … → sink`); `fx/rack-core.ts` (lógica pura `reorder`/`serializeRack`, testeada); `fx/rack.ts` (`createRack(actx,input,output)`: add/remove/move/bypass/restore/serialize, `reconnect()` reencadena el grafo; **`input` debe ser un nodo de inserción dedicado**); `ui/rack.ts` (`mountRack`: tarjetas con bypass/↑↓/✕ + sliders desde `getParams()`/`getValues()` + menú "➕ Añadir efecto" por familia). **Routing:** `setSynthOut(node)` en `synth.ts` y `masterFxIn()`/`masterFxOut()` en `masterBus.ts` (rack maestro entre `masterIn` y el limitador). **Vista Estudio:** dos racks (Instrumento y Maestro) creados *lazy* en el primer gesto; cadena `instrumentBus → [rack instrumento] → masterIn → [rack maestro] → masterFx → limitador`. **Persistencia y proyecto:** `app/store.ts` (`localStorage estudio-v1` + **💾 Guardar / 📂 Abrir proyecto** a `.json`, formato `{version,instrument,instrumentRack,masterRack}`, parseo tolerante). Primer efecto del registro: utilidad **Ganancia** (−24..+24 dB). Tests: rack-core (reorder/serialize), `dbToLin`, proyecto round-trip (22 verdes). **Pendiente del marco:** `makeEffect.dispose()` no alcanza los nodos internos del efecto → antes de la **Tanda 3** (efectos con osciladores LFO) hacer que `build` devuelva un teardown opcional y `dispose` pare/desconecte osciladores. Próximo: **Tanda 2 (Delays/Espacio)**.

**Proyecto pro `studio/` (Fase 2 · Tanda 2 ✅ — v0.4.0, Delays/Espacio):** 4 efectos **nativos** `family:'delay'` en `fx/effects/`, registrados en `fx/effects/index.ts` (orden: gain, echo, stereo-echo, reflector, reverb): **Echo** (`echo.ts`: DelayNode + realimentación filtrada por paso-bajo + mezcla), **Stereo Echo** (`stereo-echo.ts`: ping-pong, dos delays L/R con paneo y realimentación cruzada), **Reflector** (`reflector.ts`: delay corto con realimentación que admite valores negativos → peines), **Reverberator** (`reverb.ts`: `ConvolverNode` con impulso generado; el generador `reverb-impulse.ts` —`mulberry32` + `impulseSamples`— es **puro y testeado**; el buffer se reconstruye con **debounce 120 ms** al cambiar tamaño/caída; estéreo con semilla distinta por canal). Patrón común: `build` crea `dryMix`/`wetMix` (regla `wet=mix; dry=1-mix`), tiempos en ms→s. Tests: reverb-impulse (29 verdes). **Decisión:** la reverb se hizo nativa (ConvolverNode), no AudioWorklet. Próximo: **Tanda 3 (Modulación)** — primero el ajuste pendiente de `dispose()`/osciladores en el marco.

**Proyecto pro `studio/` (Fase 2 · Tanda 3 ✅ — v0.5.0, Modulación):** primero se amplió el marco: `makeEffect`'s `build` puede devolver `{apply, teardown}` y `dispose()` llama a `teardown` (para parar los LFO `OscillatorNode`; retrocompatible — los efectos previos devuelven solo `apply`). 5 efectos nativos `family:'mod'` en `fx/effects/` (registrados en `index.ts`): **Tremolo** (`tremolo.ts`: LFO→ganancia, forma seno/triángulo/cuadrada), **AutoPanner** (`autopanner.ts`: LFO→paneo), **Chorus/Flanger** (`chorus.ts`: delay corto modulado + realimentación; base pequeño=flanger, grande=chorus), **Rotary Speaker** (`rotary.ts`: Leslie, un LFO modula amplitud+paneo), **Fractal Doubler** (`fractal-doubler.ts`: 3 copias con delays cortos modulados a velocidades no enteras). Cada efecto con LFO devuelve `teardown` que para/desconecta sus osciladores. Test: `effect.test.ts` (teardown). **Minor conocido (no fuga real):** los efectos con bucle de realimentación (echo/reflector/chorus) no desconectan su island `delay↔fb` en teardown; el GC lo recolecta. Próximo: **Tanda 4 (Dinámica)** — aquí entra el primer AudioWorklet (curva de Dynamics) o se hace nativo según convenga.

**Proyecto pro `studio/` (Fase 2 · Tanda 4 ✅ — v0.6.0, Dinámica):** 4 efectos **nativos** `family:'dyn'` en `fx/effects/` (registrados en `index.ts`): **Scaling Limiter** (`limiter.ts`: `DynamicsCompressor` knee0/ratio20/attack0.002 + makeup `GainNode`), **Dynamics (estéreo)** y **Dynamics (mono)** (`dynamics.ts`: helper `buildCompressor` con umbral/ratio/codo/ataque/release/makeup; el mono suma a un canal con `GainNode channelCount=1/channelCountMode='explicit'` antes de comprimir), **DeEsser** (`deesser.ts`: separa grave/agudo con `BiquadFilter` a la misma frecuencia y comprime solo la banda aguda). Reusan `dbToLin` de `gain.ts`; sin osciladores (sin teardown). **Decisión:** toda la dinámica nativa (DynamicsCompressorNode), no AudioWorklet. Minor aceptado: DeEsser sin makeup; leve cancelación de fase en el cruce LP+HP. Próximo: **Tanda 5 (Color/EQ)** — TubeWarmth (AudioWorklet), Sigmoid Booster (WaveShaper), Equalizer y Equalizer/BW (BiquadFilter).

**Proyecto pro `studio/` (Fase 2 · Tanda 5 ✅ — v0.7.0, Color/EQ):** DSP puro `color-dsp.ts` (`makeCurve`, `tubeSample` válvula asimétrica, `sigmoidSample`, `bandwidthToQ`; 11 tests). 4 efectos **nativos** `family:'color'` en `fx/effects/` (registrados en `index.ts`, 17 efectos en total): **TubeWarmth** (`tubewarmth.ts`: `WaveShaper` con curva de válvula, `oversample='4x'`, regenerada con debounce 80ms, dry/wet), **Sigmoid Booster** (`sigmoid.ts`: `WaveShaper` sigmoide), **Equalizer** (`equalizer.ts`: 3 bandas low shelf 120 / peaking medios con frecuencia / high shelf 6k), **Equalizer/BW** (`equalizer-bw.ts`: banda peaking con ancho en octavas → Q vía `bandwidthToQ`). **Decisión:** TubeWarmth se hizo nativo (WaveShaper; la válvula es transferencia estática), no AudioWorklet. Sin osciladores (sin teardown). **Llevamos 17 de los 19 efectos TAP** (+ utilidad Ganancia). Próximo: **Tanda 6 (Tono)** — Pitch Shifter (1er AudioWorklet, inevitable) y Pink/Fractal Noise.

**Proyecto pro `studio/` (Fase 2 · Tanda 6 ✅ — v0.8.0, Tono) → SUITE TAP COMPLETA (19/19):** se introdujo la **infraestructura AudioWorklet**: `fx/worklets.ts` (`ensureWorklets(actx)`, promesa cacheada, carga con `addModule(new URL('./effects/worklets/pitch-processor.ts', import.meta.url).href)` → Vite la inyecta como **data URL autocontenida**, funciona en dev y build sin config especial); la vista Estudio inicializa los racks de forma **asíncrona** (`racksPromise`, espera a `ensureWorklets` antes de montar) y `rack.add` tolera que `create` lance. **Pitch Shifter** (`pitch.ts` + `worklets/pitch-processor.ts`: pitch shifter **granular** de dos lecturas con crossfade triangular; el procesador es **autocontenido**, sin imports, `triWindow` duplicado de `pitch-dsp.ts` —pura/testeada—; param semitonos −12..12 + mezcla; AudioWorkletNode). **Pink/Fractal Noise** (`pink-noise.ts` + `noise-dsp.ts` `pinkNoiseSamples` de Paul Kellet reusando `mulberry32`: fuente `BufferSource` en bucle, suma ruido a la señal, teardown la para). Ambos `family:'tone'`. Tests: `pitch-dsp`, `noise-dsp` (47 verdes). **LA SUITE TAP ESTÁ COMPLETA: los 19 efectos** (+ utilidad Ganancia) en 6 tandas, montables en los racks de instrumento y maestro, con guardar/abrir proyecto. **Fase 2 TERMINADA.** Próximo hito: **F3 DAW/groovebox** (canales, step-grid, patrones/song mode, solo/pan, swing, MIDI), que reutilizará el rack de efectos en cada canal.

**Proyecto pro `studio/` (Fase 3 · Sub-tanda 3A ✅ — v0.9.0, transporte + secuenciador):** el Estudio ya tiene **transporte** (play/stop/BPM) y un **secuenciador de pasos** de 1 fila que toca el preset de synth actual a tempo, en bucle, con cabezal. `daw/sequencer.ts` (`dueSteps` pura testeada —qué pasos caen en una ventana de beats— + `makeSequencer` con planificación de **adelanto** `LOOKAHEAD_SEC=0.1`/tick 25ms sobre `makeTransport`). `synth.triggerAt(midi,vel,when,dur,dest?)`: disparo **agendado** de usar y tirar (no toca el mapa `voices`, no interfiere con el teclado en vivo; ruta `synthOut ?? masterDest`). UI: `ui/transport.ts` (play/stop/BPM) y `ui/stepgrid.ts` (16 pasos clicables + cabezal). Cableado en `studioView` de forma **aditiva** (teclado/instrumento/racks/proyecto intactos); nota fija Do4 por paso (pitch por paso y el modelo de canales llegan en 3B). **3A no persiste** el patrón aún. 52 tests.

**Proyecto pro `studio/` (Fase 3 · Sub-tanda 3B ✅ — v0.10.0, varios canales + mezcla):** **el Estudio es ahora un groovebox**. `daw/model.ts` (datos puros + ops inmutables: `ChannelState`/`DawState`/`Step`, `addChannel`/`removeChannel`/`updateChannel`/`toggleStep`/`findChannel`/`audibleIds` solo-mute; testeado). Proyecto **v2** + **migración v1→v2** (`store.ts`: un proyecto F2 viejo se abre como canal 0 = instrumento + `instrumentRack`; `masterRack` se conserva; testeado). `synth.triggerPreset(preset,midi,vel,when,dur,dest)` (refactor: `triggerVoice` común; `triggerAt` delega idéntico). `daw/channel.ts` (`makeChannel`: `instrumentBus → [rack del canal] → gain(vol/mute) → pan → masterDest`; espejo vivo del modelo). UI `ui/channelstrip.ts`. `studioView` **reescrito**: lista de canales (tira + fila de pasos), **selección** (el teclado toca el canal seleccionado vía `setSynthOut`+`setPreset`), **mute/solo** (`audibleIds`+`setAudible`), añadir/quitar canal (siempre ≥1), **rack del canal seleccionado** + rack maestro, **secuenciador multi-canal** (dispara por canal audible a su bus/preset), guardar/abrir v2 (aplica el BPM al abrir). El modelo es la fuente de verdad; `persist()` vuelca los racks vivos al modelo. 61 tests. Próximo: **3C (batería sintetizada 808)** — nuevo tipo de instrumento de canal.

**Proyecto pro `studio/` (Fase 3 · Sub-tanda 3C ✅ — v0.11.0, batería sintetizada 808):** `audio/drums.ts` (batería 808 nativa: `DRUM_VOICES` = bombo/caja/charles cerrado/abierto/clap/tom + `DRUM_LABELS`; `triggerDrum(actx,dest,voice,when,vel)` = osciladores+ruido+envolventes agendadas, de usar y tirar; `whiteNoiseSamples` pura+testeada reusando `mulberry32`; buffer de ruido cacheado). `InstrumentSpec` ahora es `{kind:'synth';preset} | {kind:'drum';voice}`. `daw/channel.ts` guarda el spec y `trigger` **despacha** (synth→`triggerPreset`, drum→`triggerDrum`) + `setInstrument` (sustituye a `preset()`/`setPreset`). UI: el selector de canal tiene grupo **Sintetizados** y **Batería** (valores `synth:`/`drum:`); `studioView` despacha el teclado/MIDI por tipo (`playLive`/`stopLive`: batería = golpe one-shot en `currentTime`, synth = nota sostenida) y `routeKeyboardToSelected` solo enruta synth. 65 tests. Próximo: **3D (patrones + song mode)**.

**Proyecto pro `studio/` (Fase 3 · Sub-tanda 3D ✅ — v0.12.0, patrones + song mode):** los **canales son compartidos** (instrumento/mezcla/rack) y cada **patrón** guarda solo los **pasos por canal** (`PatternState.steps: Record<idCanal,Step[]>`). `daw/model.ts` reestructurado: `DawState={channels,patterns,current,song,bpm,steps}`; ops `channelSteps`/`toggleStep`(patrón actual)/`addPattern`/`removePattern`(≥1, reindexa current+song)/`setCurrentPattern`/`setSong`; `addChannel`/`removeChannel` sincronizan los pasos en **todos** los patrones (testeado, inmutable). Proyecto **v3** + **migración v2→v3** (`store.ts`: los `steps` de cada canal v2 van a `patterns[0].steps[id]`, el canal pierde `steps`; sin pérdida de datos; testeado). UI `ui/patternbar.ts` (botones de patrón 1/2/3… + **🔗 Canción** con chips de la secuencia). `studioView` reescrito: las cuadrículas leen el patrón **actual** (`channelSteps`); el secuenciador toca, en `onStep`, el patrón **que suena** (el actual, o el de la canción que **avanza al cruzar el paso 0**) para cada canal audible; barra de patrones por delegación; guardar/abrir v3. 67 tests. Próximo: **3E (swing + control MIDI)** — última de F3.

**Proyecto pro `studio/` (Fase 3 · Sub-tanda 3E ✅ — v0.13.0) → FASE 3 (DAW/groovebox) COMPLETA:** **swing** (`swingOffset(step,swing,secPerStep)` puro en `sequencer.ts`: los pasos impares se retrasan `swing·segundos-por-paso`; se aplica al **tiempo de audio** del paso en `onStep`, no a `dueSteps` ni al teclado en vivo; campo `swing` **aditivo** en `DawState`/proyecto v3 —sin bump—; deslizador en el transporte). **Grabación de pasos en vivo** (botón **●** en el transporte; con grabar armado **y** el secuenciador sonando, las notas del teclado/MIDI escriben un paso ON —con su nota— en el canal seleccionado vía `setStep`, cuantizado al paso más cercano con `Math.round`). El **MIDI-learn** de knobs/transporte queda como mejora opcional. **Resumen F3 — el Estudio es un groovebox completo:** transporte (play/stop/BPM/swing/grabar), canales con instrumento (synth/batería 808)/volumen/pan/mute/solo y **rack de efectos por canal**, secuenciador de pasos multi-canal, **patrones + song mode**, grabación en vivo; proyecto v3 con migración desde F1/F2. 72 tests. **Próximo hito del proyecto: F4 (módulo Aprender)** y luego F5 (conmutar el sitio).

**Proyecto pro `studio/` — Sinte editable por canal (v0.14.0):** tercer tipo de instrumento de canal `synthx` (además de los presets fijos y la batería): mezcla de ondas (seno/cuadrada/sierra) + sub-oscilador + unison/detune, ADSR, filtro LP/BP con resonancia y LFO (a tono o filtro). Motor `audio/synthx.ts` (`triggerSynthx` agendado + `noteOnSynthx`/`noteOffSynthx` en vivo) sobre DSP puro y testeado `audio/synthx-dsp.ts` (clamps, unison, sub, `SYNTHX_DEFAULT`, `SYNTHX_PRESETS` bajo/lead/pluck/pad, `normalizeParams`). Editor en cajón inferior (`ui/synthEditor.ts`) con knobs por secciones OSC/FILTRO/ADSR/LFO + presets + Probar. Persistencia tolerante (los params viajan en `instrument`; se normalizan al abrir), sin migración. Portado/ampliado del sinte editable de `pianova.html` v1.36.

**Estudio · Rediseño PIANOVA STUDIO (v0.15.0):** la vista del Estudio se reorganizó al estilo STORM/Tempest (negro + **verde neón `#2dff6a`**): cabecera con transporte (BPM grande) + info del canal + onda; **pestañas PADS / SAMPLES / MIXER**. **PADS** = rejilla de pads (= canales) + PASOS y PARÁMETROS del canal seleccionado (editor del sinte inline para `synthx`; aviso para batería/preset). **MIXER** reubica las tiras de canal (selector de sonido, mute/solo/efectos, knobs vol/pan). **SAMPLES** es un placeholder para el siguiente sub-proyecto (Simpler con slicing). El **motor no cambió** (audio/secuenciador/sinte/modelo/persistencia); es solo presentación. Tema en `ui/styles.css` (`.pv*`), componentes `ui/padGrid.ts` y `ui/studioTabs.ts`, vista reescrita en `app/studioView.ts`.

**Estudio · Sampler con slicing — S1 núcleo (v0.16.0):** cuarto tipo de instrumento de canal `slicer`:
importar un audio (`audio/sampleStore.ts`, base64 persistente), trocearlo en slices por **transitorios** o
**N iguales** (`daw/slicing.ts` puro: `equalSlices`/`detectOnsets`/`marksToSlices`/`sliceIndexForNote`),
cada slice mapeado a una nota (slice 0 = `base`), disparado por el secuenciador y el teclado
(`audio/slicer.ts`: recorte/ganancia/fades/reverse). Editor en la pestaña SAMPLES (`ui/sampleEditor.ts`:
onda + marcas + botones de troceado + ▶ probar). Persistencia de los samples pequeños en el proyecto
(`app/store.ts`). Modelo `InstrumentSpec` `slicer` + rama en `daw/channel.ts`. Pendiente (S2–S4): ajuste
manual de marcas, edición por slice (recorte/ganancia/reverse/fade en la UI) y navegador de carpetas.

**Estudio · Sampler con slicing — S2 marcas manuales (v0.17.0):** en el editor del canal `slicer` (pestaña
SAMPLES) las marcas de corte son editables sobre la forma de onda: **arrastrar** una marca la mueve (con
redibujo en vivo), **doble-clic** en un hueco añade una, **clic derecho** sobre una marca la borra; la
primera marca (inicio) queda fija. Todo pasa por `marksToSlices` (ordena/dedup/fuerza el 0) y se persiste.
Solo UI (`ui/sampleEditor.ts` + cableado `onSetMarks` en `app/studioView.ts`); motor/modelo/DSP intactos.
Pendiente S3 (edición por slice: recorte/ganancia/reverse/fade en la UI — el motor ya lo soporta) y S4
(navegador de carpetas del disco).

**Estudio · Sampler con slicing — S3 edición por slice (v0.18.0):** en el editor del canal `slicer` (pestaña
SAMPLES), al seleccionar un slice se abre un panel con **Ganancia**, **Reverse**, **Fade in** y **Fade out**
por slice (knobs + casilla), que suenan al instante y se persisten. El motor (`audio/slicer.ts`) y el modelo
(`SliceDef`) ya los soportaban desde S1; S3 añade la UI (`ui/sampleEditor.ts`) + helper puro `updateSlice`
(`daw/slicing.ts`, testeado) + cableado `onUpdateSlice` en `app/studioView.ts` (actualiza modelo/audio/persist
sin re-montar el editor). El **recorte inicio/fin** de cada slice se ajusta con las marcas (S2). Pendiente
S4: navegador de carpetas del disco.

**Estudio · Iluminación reactiva (v0.19.0):** realimentación visual de qué suena. Los **pads destellan**
(glow verde neón por variable CSS `--hit`) al sonar su paso en la reproducción y al tocar en vivo con el
teclado, **más brillo cuanto más fuerte** el golpe (velocity). En la pestaña SAMPLES, el **slice que suena
se resalta** en la lista y una **línea-cursor recorre su onda** (secuenciador + preview/teclado). Sin tocar
el motor de audio: `studioView` registra cada disparo en un bus de golpes (`padHits`/`sliceHits`) y un bucle
`requestAnimationFrame` (`visualTick`) pinta leyendo el reloj de audio; la matemática es pura y testeada en
`ui/hitViz.ts`. La onda del editor se cachea en un canvas offscreen para pintar el cursor sin recalcularla.

**Estudio · Compacto estilo VST (v0.20.0):** la cadena de efectos deja de estar en el cajón inferior
deslizante (eliminado, con su botón "🎛 Efectos") y pasa a una **sección fija `#fxSection`** siempre visible,
antes del teclado, con **dos filas horizontales** (Canal seleccionado + Máster). Dentro de cada rack los
efectos se disponen en **horizontal** (`.rackList` en fila con scroll-x) como **módulos compactos** de ancho
fijo (`.fxCard` ~156px, knobs en rejilla 2×N); mover efectos ahora es **◀/▶**. Además una pasada de densidad
(menos márgenes/padding; teclado 160→140px). Solo presentación (`app/studioView.ts` + `ui/rack.ts` +
`ui/styles.css`); el motor y la lógica de efectos (añadir/bypass/mover/quitar/persistencia) no cambian.

**Estudio · Piano-roll por canal + escala (v0.21.0):** en la sección PASOS, los canales **melódicos**
(synth/synthx/slicer) muestran un **mini piano-roll** (`ui/pianoRoll.ts`, filas=notas ~2 octavas con octava
▲/▼, columnas=pasos, monofónico por paso; clic pone/mueve/borra la nota vía `setStep`); la **batería** sigue
con la fila on/off. Una **barra de escala** (tónica + tipo) **resalta** las notas de la escala (informativo):
helper puro `daw/scales.ts` (`SCALES`+`inScale`, portado de `pianova.html`) + escala en el estado
(`scaleRoot`/`scaleType`, persistida con migración). Para el **slicer**, cada paso puede disparar un **slice
distinto** (la nota elige el slice). Sin cambios de motor (el disparo ya usa `st.note`).

**Estudio · Fix nota synth colgada (v0.19.1):** las notas de un preset synth con `sustain:true` (cuerda,
órgano) se quedaban sonando. Causa raíz: `stopLive` decidía a qué motor mandar el note-off según el canal
**seleccionado al soltar** (introducido en F3, `b702f65`), así que si la selección había cambiado a
batería/slicer no se llamaba `synth.noteOff` y la voz quedaba colgada; solo se oía en presets sustain (los
que decaen solos lo ocultaban). Fix: `stopLive` apaga **incondicionalmente por midi** (`synth.noteOff` +
`synthx.noteOffSynthx`, ambos no-op si no hay voz), como el `silence(midi)` de `pianova.html`.

**Proyecto pro `studio/` — repaso visual del groovebox + headroom (post-F3, sigue v0.13.0, 77 tests):**
- **Headroom del bus maestro:** `MASTER_MAKEUP` bajado de **2.5 → 1.8** en `audio/masterBus.ts` (el teclado físico saturaba el soft-clipper con acordes/graves; la saturación efectiva es ~`tanh(MAKEUP·x)`; 1.8 limpia sin perder volumen; ajustable por oído). **Ojo:** el texto de la F1 más arriba dice 2.5 (era el valor de entonces); el actual es **1.8**.
- **Knobs giratorios** (`ui/knob.ts`, componente nuevo): mando estilo DAW, se ajusta arrastrando ↕ + doble-clic resetea, táctil; `valueToAngle` puro+testeado (barrido 270°). Usado en **Vol/Pan por canal**, **Swing** y los **parámetros de los efectos** (con su valor + unidad, cuantizado al `step`). El BPM sigue siendo campo numérico.
- **Tira de canal compacta:** dos columnas — izquierda instrumento (legible, en su línea) + botones M/S/🎛/✕; derecha los knobs Vol/Pan centrados → canal en **2 líneas**, filas más pegadas (`channelstrip.ts` con `.chMain`/`.chMix`).
- **Panel de efectos desplegable:** los racks (canal seleccionado + maestro) viven en un **cajón fijo inferior** (`#fxDrawer`, deslizante) que abren el botón **🎛 Efectos** (cabecera) o el **🎛 de cada canal**; al cambiar de canal con el panel abierto se actualiza solo (sin scroll). Efectos **compactos** (parámetros como knobs en fila, bypass atenúa la tarjeta).
- **Estética general:** deslizadores nativos restantes (efectos no convertidos: ninguno ya; quedan inputs como BPM number) con estilo oscuro; celdas de paso con relieve tipo botón y agrupadas de 4; filas de canal con elevación sutil. Todo el tema mantiene el ámbar de marca.
- **PENDIENTE (el usuario quiere afinar "unas cositas" más de visual la próxima sesión):** posibles ajustes de tamaños/altura del cajón, mostrar relleno del recorrido en los knobs, numerar los pasos (1·5·9·13), etc. — a confirmar con él. **Sin verificar aún por oído en navegador:** voces 808 / swing / grabación.

**Versión:** v1.36 (Sinte editable por canal en el Looper)

**Sinte editable por canal (v1.36):** cada canal del Looper puede asignar sonido `'synthx'` (sinte
editable) en lugar de los 5 presets fijos. El objeto `channel.synth` almacena parámetros: **osc blend**
(mix seno/cuadrada/sierra %), **ADSR** (attack, decay, sustain nivel/duración, release), **filtro LP/BP**
(tipo, corte, resonancia Q). Motor `synthVoiceAdj` reutiliza el contrato de `synthNoteOn` (3 osciladores →
ADSR → biquad → `masterDest`), agendado con `synthStopAt`/`voices` sin cambios. Rama `synthx` en
`playChannelSound`. Editor overlay `#synthEd` (prefijo `sy*`, abierto con ✏️ en canales synthx, botón
"▶ Probar" para test) permite editar todos los parámetros en vivo. Persistencia en `store.looper`
(`saveLooper`/`restoreLooper`). Inspirado en `RFullum/GrooveBox`. Los 5 presets synth fijos siguen
disponibles.

**EQ gráfico editable (v1.35):** editor visual de 8 bandas sobre el motor v1.34. `store.eq.manual` guarda
los ajustes del preset `'manual'` (mapeo estable de 8 biquads; cuando una banda está apagada, ganancia = 0).
`eqUpdateSlot`/`eqUpdatePreamp` editan en vivo sin reconstruir la cadena. Overlay `#eqEditor` con
`<canvas>` mostrando rejilla, espectro en tiempo real (vía `eqAnalyser` sobre `masterFinal`) y curva de
respuesta (via `getFrequencyResponse` de los `eqNodes` vivos). Interacción por arrastrar/rueda/táctil:
funciones `freqToX`/`xToFreq`/`gainToY`/`yToGain` convierten píxeles ↔ unidades de audio. Render del
bucle rAF (`eqFrame`) solo mientras el overlay está abierto. Botón "✎ Editar EQ" en "Mezcla maestra".

**Ecualizador maestro (v1.34):** nueva etapa de ecualización en el bus maestro. `buildEq()` configura
una cadena `masterIn → eqInput (preamp) → bandas biquad → fxHP`, insertándose **antes** del limitador/
soft-clipper. Spec común `{preamp, bands}` (array de `{type, freq, gain, q}`). **5 presets** en `EQ_PRESETS`
(plano, cuerpo, cálido, brillante, loudness). Parser `parseApoEq()` lee perfiles Equalizer APO
(decimales con coma, ignora OFF y tipos no soportados). UI en "Mezcla maestra": desplegable `#eqPreset`
+ botón `#eqImport` + input `#eqFile` para cargar perfil. `refreshEqUI()` actualiza visualización.
Persistido en `store.eq`. El realce lo contiene el limitador/soft-clipper/makeup (v1.33) sin clipping duro.

**Versión:** v1.33 (makeup de salida: la app suena con potencia)

**Makeup de salida (v1.33):** la cadena del bus maestro (limitador a −6 dB + soft-clipper tanh con
`SOFTCLIP_DRIVE`) daba una transferencia neta `tanh(señal)` y, con el limitador reteniendo la señal
fuerte en ~0.5, el **techo de salida era ~0.46 (≈ −6.7 dB)** → todo sonaba flojo aunque subieras la
ganancia al 300%. Causa raíz confirmada con un modelo en Node. Arreglo: `MASTER_MAKEUP = 2.5` sube el
nivel antes del shaper (`masterClipPre.gain = MASTER_MAKEUP / SOFTCLIP_DRIVE`), de modo que la
transferencia neta pasa a `tanh(MASTER_MAKEUP·señal)` → una señal fuerte sube de 0.46 a ~0.85 y las
notas normales casi se duplican. El **tanh sigue garantizando** que la salida nunca pasa de ~0.99 →
**sin clipping duro** (ni en la salida ni en el export). Ajustable con la constante `MASTER_MAKEUP`.

**Versión:** v1.32 (ganancia ajustable de los sonidos por canal e instrumento)

**Ganancia de los sonidos (v1.32):** control de volumen avanzado con rango 0–300% (sin distorsión, limitador
en v1.26). **En el Looper (por canal):** cada canal tiene un fader de ganancia (`makeFader max:GAIN_MAX def:1`),
que multiplica la velocity de synth/sample completo (quitando recorte del sample si lo hay), eleva sf/batería al
máximo (no pueden exceder su reproductor compartido). El fader es **asignable a un knob CC** (`volMap`/`volLearn`)
para control en tiempo real, escala 0–127 CC → 0–300% ganancia. **En el instrumento global:** la ganancia
`instGain` se guarda **por instrumento** (`store.instGain[clave]`, `currentInstGain`/`applyInstGain`) y sube
**del todo** hasta 300% para TODOS los tipos: synth/sample por multiplicación y el sf global por su nodo de
ganancia propio (`globalSf`, reproductor independiente con destino `instGain`, separado del `sfCache` de los
canales). La limitación de "no pasar del máximo" aplica **solo a sf/batería en los canales del Looper**
(reproductor compartido) y se resolverá con "instrumento por canal". Control visual arrastrable en la cabecera (`#instGainWrap`
deslizador ↕ de % con doble-clic = prompt). El bus maestro v1.26 (limitador + soft-clipper) contiene
saturación sin distorsión audible.

**Cabecera superior pro (v1.31):** el header ahora usa **segmentado de pestañas** (clase `.tabs`/`.tab` en
Aprender/Looper, solo CSS, sin `<button class="seg">`), **grupo Instrumento** con etiqueta (`.hdrCol` +
`.hdrLab` = "Instrumento" en gris; `#instrument` limitado a `max-width:46vw` en móvil), **chip de
conexión** (`.connChip` + `.dot` rojo/verde) que es **un estado visual puro** — toma la clase `.on`
cuando hay teclado conectado, mediante un único toggle en `bindInputs` (al que `access.onstatechange`
llama también al desconectar, así cubre ambos sentidos). El
botón **Ayuda** pasa a icono cuadrado (`.hdrIcon`). En móvil <620px, el chip deja visible solo el punto
(`.device` dentro de `.connChip` oculto), y `#instInfo` (texto antiguo) también desaparece; el nombre
del instrumento se ve en el selector mismo.

**Reproducción fluida (v1.30):** el tiempo de reproducción de **Escuchar** y **Looper** ahora va por
**reloj de audio** (`makeTransport`, posición desde `actx.currentTime`) con **adelanto** (lookahead):
agendado con `LOOKAHEAD_SEC = 0.1` (`dueLinear` para Escuchar, `dueLoop` en beats absolutos para el
Looper). El motor dispone cada nota/sonido con instante futuro `when` (`synthNoteOn`/`synthStopAt`/
`playChannelSound`/`noteOnAt`), lo que evita glitches y jitter. El modo en vivo (Practicar/Acompañar)
sigue siendo **inmediato** (sin adelanto). Tests puros en `docs/superpowers/tests/`.

**Cabeceras pro en móvil (v1.29):** en `@media (max-width:860px)`, las barras `.lnBar` (Aprender) y
`.lpTransport` (Looper) ocultan los **separadores verticales** (`.tpSep`, que sueltos entre filas
envueltas quedaban feos) y pasan a `gap:10px 14px`. El BPM grande baja a 22px, los `.lnIcon` se
hacen cuadrados 42×42 (objetivo táctil cómodo) y `#song` se limita a `max-width:46vw` para no
desbordar con nombres largos. Desktop intacto. Al ocultar `.lnLoopSep` (un `.tpSep`), el grupo del
bucle A–B fluye en línea en vez de irse al extremo derecho.

**Versión:** v1.28 (tempo máximo 240 BPM, para drum and bass)

**Tempo hasta 240 (v1.28):** el tope subió de 160 a **240 BPM** en los cuatro sitios: slider
`#tempo` (Aprender) y clamp de `setLnBpm` (40–240) + su prompt; slider `#lpTempo` (Looper) y clamp
de `setBpm` (50–240) + su prompt; y el clamp del BPM al **importar .mid** (`parsedBpm`, 40–240).
El arrastre ↕ mantiene 0.5 BPM/píxel (para saltos grandes, doble-clic y escribir el número).

**Versión:** v1.27 (fix BPM "bloqueado": colisión de clase .tpBpm entre Aprender y Looper)

**Fix BPM bloqueado (v1.27):** desde v1.23 la cabecera de Aprender (`#lnBpmWrap`) usa la clase
`.tpBpm`, igual que el BPM del Looper. El transporte del Looper lo localizaba con
`document.querySelector('.tpBpm')`, que devuelve el **primero** del DOM (el de Aprender, que va
antes) → el BPM de Aprender quedaba con handlers DOBLES (pointerdown/dblclick suyos + los del
Looper) que se pisaban, y el del Looper sin handler. Arreglo: el span del BPM del Looper recibe
`id="lpBpmWrap"` y el JS usa `$('lpBpmWrap')` en vez de `querySelector('.tpBpm')`. Ahora cada BPM
tiene su único juego de handlers (Aprender 40–160, Looper 50–160).

**Versión:** v1.26 (soft-clipper con drive: acordes ya no hacen clipping)

**Fix clipping en acordes (v1.26):** el `WaveShaper` final solo mapea entradas en [-1,1] y CLAMPA lo
de fuera (techo plano = distorsión). En modo Escuchar la suma de varias notas supera 1.0 y el
ataque del limitador (3 ms) deja pasar el transitorio del acorde → chocaba contra ese techo plano.
Arreglo: `makeSoftClipCurve(n, drive)` usa `tanh(drive*x)` y se añade una **pre-ganancia `1/drive`**
(`masterClipPre`) antes del shaper, con `SOFTCLIP_DRIVE=2.5`. Transferencia neta = `tanh(señal)` para
señales hasta ±2.5 → satura suave (sin techo plano) y deja las notas limpias a nivel unidad. Validado
con test de la curva en Node (la actual daba 0.762 plano para 1.0/1.5/2.0/2.5; la nueva es monótona).
**Pendiente (no es regresión):** el "parpadeo / no fluido" es otra causa — las notas se disparan en el
bucle `frame`→`playFullAt`→`noteOn` en `currentTime` (sin adelanto de reloj de audio) y cada nota crea
varios nodos en el hilo principal; en canciones densas eso da tirones. Mejoraría con un pequeño
planificador con *lookahead*.

**Bucle A–B compacto (v1.25):** los botones del bucle de la cabecera de Aprender pasan de texto
("Inicio aquí/Fin aquí/Quitar bucle") a iconos **A / B / ✕** (`.lnIcon`, con `title=` descriptivo),
dentro de un grupo `.tpCol .lnLoop` con etiqueta "Bucle A–B". El separador previo lleva
`margin-left:auto` (`.lnLoopSep`) para empujar separador + grupo al **extremo derecho** de la barra.
`#loopInfo` se mantiene (más pequeño, `max-width:150px`). IDs intactos (`loopStart`/`loopEnd`/
`loopClear`/`loopInfo`); el JS solo togglea `.disabled` y el texto de info, no el de los botones.

**Cabecera compacta (v1.24):** pulido de la v1.23. **Empezar** pasa a icono redondo **▶**
(`.lnStart`, 46×42, amber, `border-radius:50%`) y **Reiniciar** a icono cuadrado **↻**
(`.lnIcon`, 40×40); **📂 .mid** también queda como icono **📂** (`.lnIcon`). Los nombres de los
modos en `#mode` se acortan (Practicar/Acompañar/Escuchar/Reto/Tocar libre, sin coletillas). Se
ajustan márgenes para que no se solape: separadores `.lnBar .tpSep{margin:0 9px}`, `row-gap:8px`
al envolver y `.lnStart + .lnIcon{margin-left:7px}` entre ▶ y ↻. Solo HTML/CSS; `title=` conserva
el texto largo como tooltip. Sin cambios de lógica.

**Cabecera pro de Aprender (v1.23):** la fila de controles de la pantalla Aprender se rediseñó al
estilo del transporte del Looper (`.lnBar`, reutilizando `.tpCol/.tpLab/.tpSep/.tpBpm`). Los **modos**
de aprendizaje pasan de botones segmentados a un **desplegable** `#mode` (su `change` llama a
`setMode(m)`, lógica extraída del antiguo manejador de los botones `[data-mode]`). **Tempo** es ahora
un **BPM grande editable** (`#lnBpmNum`/`setLnBpm`: doble-clic = `prompt`, arrastrar ↕; el `#tempo`
range queda oculto como fuente de verdad). **▶ Empezar** / **↻ Reiniciar**, **Canción** + **📂 .mid**,
**Manos**, **Acordes** y la barra de **bucle A–B** se agrupan con etiquetas y separadores. El tutorial
(`TOUR`) ahora resalta `#mode`. Solo HTML/CSS + el refactor de `setMode`/BPM; el resto de la lógica
(modos, tempo, canción, manos, acordes, bucle) intacta. Pendiente de revisión del usuario por la mañana.

**Piano-roll edición avanzada (v1.22):** selección múltiple de notas en el overlay `#pianoroll`:
marquesina de recuadro (`prMarquee` + `prNotesInRect`), Shift-clic para añadir/quitar una nota y
Ctrl+A para seleccionar todo (`prSel`). Las notas seleccionadas se mueven en **grupo** con un solo
arrastre. Portapapeles relativo `prClip`: Ctrl+C copia con offsets relativos a la nota más temprana;
Ctrl+V pega en el cabezal de reproducción (`lp.beat`); Ctrl+D duplica el fragmento justo detrás.
El portapapeles es global al overlay (permite copiar de un canal y pegar en otro).
Deshacer/rehacer multinivel: `prPushUndo` guarda snapshot antes de cada mutación; `prDoUndo`/`prDoRedo`
navegan las pilas `prUndo`/`prRedo`. Atajos activos **solo con el overlay del piano-roll abierto**
(Ctrl+A/C/V/D/Z/Y, Delete) con `preventDefault`. Sin cambios en la lógica del Looper ni del motor
de audio.

**Transporte y faders pro (v1.21):** lavado de cara de la interfaz del Looper sin cambios de
lógica. `makeFader(opts)` es un helper reutilizable que crea un fader vertical draggable (ratón
y táctil) con reset por doble-clic y `setValue()` sin disparar `onInput` (evita bucles al
actualizar desde MIDI). `lpFaders` agrupa los faders de efectos (filtro, delay, reverb),
formando un **rack de faders** vertical estilo mezcladora profesional. El volumen de cada canal
pasa a ser también un fader vertical en su cabecera, con asignación CC via `volMap`/`volLearn`
igual que antes. El **volumen del metrónomo** (`lpClickVol`) tiene su propio mini-fader en la
barra de transporte. La **barra de transporte** muestra el BPM en tipografía grande, editable
por doble-clic (prompt) o arrastre vertical (drag ↕), ligado a `lpTempoEl`; el Play ▶/⏹ es
mapeable por MIDI-learn (`lp_play`). Toda la persistencia y `volMap`/`fxMap` se mantienen.

**Piano-roll por canal (v1.20):** editor de notas superpuesto (`#pianoroll`, overlay pantalla
completa) que se abre con **doble-clic en el carril** de cualquier canal del Looper y se cierra
con ✕ o Esc. Estado en `prState` (canal, scroll, modo). Geometría vertical `prRows` (semitono →
fila de píxeles). Render: `prDraw` (rejilla 1/16, notas, cabezal sincronizado con `lp.beat`, Fold
para ocultar octavas vacías) + `prDrawVel` (carril de velocity con barras arrastrables). Edición:
crear / mover / alargar / borrar notas por ratón y toque táctil; snap `prSnap` (libre / 1/8 /
1/16). Resalte de escala: `PR_SCALES` define los intervalos, `prInScale(midi, tonica, tipo)` marca
las filas de la escala elegida. Actúa sobre `lp.channels[i].notes` directamente y llama a
`saveLooper` → los cambios son inmediatos y persisten en `localStorage`.

**Navegador de samples (v1.19):** panel lateral `#libPanel` (botón **📁 Librería**) en el Looper.
Importa carpetas del disco vía File System Access API (`showDirectoryPicker`) con respaldo
`webkitdirectory` para móvil. Escaneo perezoso del árbol (`scanDirHandle`/`libFileMap`); audio
decodificado bajo demanda (`libNodeBuffer`/`libBufCache`). Pestañas **Carpetas/Favoritos/Recientes**,
buscador, filas con ▶ escuchar / ✚ a canal / 🎹 a instrumento / ⭐ favorito / 🕘 recientes.
Arrastrar fila a la cabecera de un canal para asignarlo. Instrumento global `type:'sample'` melódico
(`pitchRate`). Persistencia: handle en **IndexedDB** `pianova`; `store.lib` para favoritos/recientes.
En móvil el panel es overlay (CSS `position:absolute; z-index:5`) sobre el Looper; el fallback abre
archivos sueltos. Responsive añadido en `@media (max-width:860px)`.

**Modo Reto (v1.18):** 5º modo "Reto · supérate". La melodía cae **a tempo del nivel** (en tiempo
real, no espera); aciertas si tocas la nota a tiempo (ventana ±0.34 pulso). Puntuación + combo +
estrellas; con ≥85% de precisión **subes de nivel** (el tempo sube: Nv1≈60%…Nv8≈130% del tempo
natural). HUD `#retoBar` (Nivel/BPM/Puntos/Combo/Récord) y pantalla de resultados `#retoEnd`
(estrellas, Reintentar / Siguiente nivel). Guarda **mejor nivel y mejor puntuación** por canción.
Empieza en tu mejor nivel guardado. Spec en `docs/superpowers/specs/2026-06-21-modo-reto-design.md`.
*(Pendiente de ajustar mañana: umbral, % inicial/step, reparto de estrellas — fáciles de tocar.)*

**Pulido UI (v1.17):** revisión con skills de diseño (redesign/soft/emil). Solo CSS, escritorio y
móvil intactos: `button:active` con `scale(.96)` (feedback táctil); transiciones con cubic-bezier
suave; sombra del escenario **tintada** al fondo; tarjetas del looper con leve profundidad y
"lift" en hover; hover sutil en pestañas/modos; `select` con **chevron propio** (`appearance:none`)
y foco accesible en select/inputs; `scroll-behavior:smooth`. (Se descartó el maximalismo de
landing —bento, héroes, scroll-anim— por ser una herramienta densa.)

**Fixes (v1.16):**
- **Export sin silencios:** antes la exportación sonaba vía `requestAnimationFrame` y al atenuarse
  la pantalla del móvil el bucle se ralentizaba (la música se paraba pero la grabación seguía →
  silencio). Ahora `exportLooperAudio` **programa las notas en el reloj de audio** (`synthAt`/
  `scheduleChannelNote` con `time`/`when`), independiente de los fotogramas; suenan las 4 vueltas
  completas. Mantiene Wake Lock durante el export.
- **Scroll táctil:** `canvas` pasa de `touch-action:none` a **`pan-y`** → arrastrar en vertical
  hace scroll de la página (antes solo se podía por una franja fina al lado) y desactiva el zoom
  accidental; taps (tocar teclas) y arrastre horizontal del editor siguen funcionando. (En táctil
  se pierde mover notas en vertical/altura; el movimiento en tiempo sí va.)

**Fix (v1.15):** un canal con **volumen 0** hacía que `synthNoteOn` llamara a
`exponentialRampToValueAtTime(0)` → **excepción** que mataba el bucle `requestAnimationFrame`
(se paraba TODO y no volvía). Arreglado: el pico se acota a un mínimo (`Math.max(0.0002, …)`), y
`frame()` ahora va en `try/catch` y **siempre re-agenda** el rAF (un fallo puntual no congela la app).

**Publicada:** GitHub `reivajsk8-design/Pianova` → Netlify **https://pianova.netlify.app**
(auto-deploy en cada `git push` a `main`). `_redirects` (`/  /pianova.html  200`) sirve la app en
la raíz. `midis/` está en `.gitignore` (MIDIs de terceros, no se publican).
**Archivo principal:** `pianova.html` (autónomo, sin dependencias)

---

## Qué funciona ahora ✅

### App de aprender
- Conexión al teclado MIDI por USB (Web MIDI) y mensaje de estado con el nombre del dispositivo.
  Funciona con varios teclados a la vez (S49 MK1, **Akai MPK61** — ambos class-compliant, sin
  drivers). Se ignora el **canal 10** para que los pads del MPK61 no cuenten como notas.
- Modos: **Practicar** (melodía, una nota, espera a que toques), **Acompañar** (v0.6: la
  **canción completa por acordes** — caen todas las notas y espera a que toques **todo el
  acorde** para avanzar; color por mano), **Escuchar** (v0.5) y **Tocar libre**.
- **Manos (v0.7):** la mano de cada nota se detecta por **pista del MIDI** (`assignHands`: 2
  pistas → la aguda es derecha; 3+ pistas → derecha las que superan el tono medio promedio; 1
  pista → respaldo por altura). Selector **Manos: Las dos / Solo derecha / Solo izquierda**: al
  practicar una mano, la otra **suena sola** (`autoNotes`/`playAutoAt`).
- **Dificultad de acordes (v0.8):** selector **Acordes: Simple (1 nota) / Medio (2) / Completo**
  (`chordLevel`, `rebuildSteps`). En Simple tocas solo la melodía de cada acorde; las notas
  omitidas (y la otra mano) **suenan solas**, así la canción se oye llena en cualquier nivel.
  Permite subir la dificultad poco a poco. Se combina con el selector de manos.
- **Practicar por secciones (v0.9):** **barra de progreso** bajo el escenario; **clic = saltar**
  a ese punto (empezar desde donde quieras). Bucle **A–B** con `Inicio aquí`/`Fin aquí`/`Quitar
  bucle`, ahora también en **Acompañar** (sobre acordes): repite el trozo hasta que salga. La
  sección se ve sombreada en la barra. (`seekToBeat`/`seekToIndex`, `updateSeek`.)
- **Persistencia (v1.0):** `localStorage` (clave `pianova-v1`) guarda: las **canciones `.mid`
  importadas** (no hay que reabrirlas), las **preferencias** (instrumento, canción, modo, manos,
  dificultad) y la **mejor precisión por canción** (stat **Mejor**). Se restaura al abrir. Borrar
  datos = limpiar el almacenamiento del navegador. (`loadStore`/`saveStore`/`restoreSongs`/
  `savePrefs`/`recordProgress`.)
- Tres canciones de ejemplo escritas a mano: Escala de Do, Estrellita, Himno de la Alegría.
- Notas que caen sincronizadas con el teclado dibujado; la tecla objetivo se ilumina.
- Tempo ajustable (40–160 BPM). Estadísticas de aciertos y precisión.
- Sonido de piano **sintetizado** con Web Audio (sin librerías).
- Entrada alternativa para probar sin teclado: ratón sobre las teclas o filas
  `A S D F G H J K` / `W E T Y U` del ordenador.

### Modo Escuchar · sonido completo (NUEVO en v0.5)
- Cuarto modo **Escuchar** (junto a Practicar / Acompañar / Tocar libre).
- Al importar un `.mid` se guardan **dos conjuntos**: `notes` (melodía monofónica, para
  practicar/juzgar, como antes) y `full` (TODAS las notas: acordes + dos manos, con velocity).
  Las canciones a mano tienen `full` = su melodía.
- En Escuchar, la app **reproduce sola el arreglo completo** (`playFullAt` dispara `fullNotes`
  por beat con su velocity), se ven caer **todas** las notas y se **iluminan las teclas**.
- `fitRange` ahora ajusta el teclado a `fullNotes` (cabe todo el arreglo).
- **Paso 1 de "acordes + dos manos".** El Paso 2 (practicar a dos manos: modos mano
  derecha/izquierda/ambas, esperar acordes completos) está pendiente.

### Motor de instrumentos (NUEVO en v0.4)
- Selector **"Instrumento"** en la cabecera; afecta a todo (Aprender + Looper).
- **Presets sintetizados (offline, sin dependencias):** 🎹 Piano, ✨ Piano brillante,
  🎛️ Órgano, 🔔 Campanas, 🎻 Cuerda sintética. Definidos en `SYNTH` (osciladores + envolvente;
  órgano y cuerda son sostenidos). `synthNoteOn`/`synthSilence`, polifonía en `voices`.
- **Instrumentos reales (necesitan internet):** piano de cola, piano eléctrico, **violín**,
  chelo, flauta, trompeta, guitarra. Vía librería **`smplr`** + soundfonts libres, importada
  **bajo demanda** desde CDN (`import('https://esm.sh/smplr@0.26.0')`) en `loadSoundfont()`.
  `sfPlayer` reproduce; `sfStops[midi]` para parar. Si falla la carga (sin internet), avisa y
  vuelve al sintetizado.
- `noteOn`/`silence` despachan según `currentInstrument` (`synth` vs `sf`); el resto de la app
  no cambió. Al cambiar de instrumento se cortan las notas (`silenceAll`).

### Importar .mid (NUEVO en v0.3)
- Botón **"Abrir .mid"** en los controles de Aprender (input de archivo oculto).
- **Parser propio** (`parseMidi`, sin dependencias) lee el Standard MIDI File: resolución,
  pistas, eventos note on/off con delta-times de longitud variable y running status, y el
  primer tempo. Ignora sysex/meta no usados.
- `extractMelody` elige la pista con más notas, la hace **monofónica** (nota más aguda en
  simultáneos, recorta solapes) y la convierte a `{ midi, startBeat, dur }` normalizada.
- **Teclado adaptativo:** `LOW`/`HIGH` son variables; `fitRange()` los calcula desde las notas
  (octavas completas, mín. 2 octavas). Las canciones a mano siguen en Do4–Do6.
- Tempo del archivo aplicado al deslizador (limitado a 40–160). Errores con mensaje claro.
- Probado el parser en Node con un MIDI fabricado (notas + acorde→aguda + tempo). Falta
  probarlo en navegador con archivos reales variados.

### Bucle de fragmento (NUEVO en v0.2, modo Practicar)
- Botones `Inicio aquí` · `Fin aquí` · `Quitar bucle`. Marcas el principio y el final de la
  parte difícil **tocando** (usan la nota objetivo actual).
- Al acertar la nota *fin*, vuelve solo a la nota *inicio* y repite. Contador de **vueltas**.
- Si marcas el fin antes que el inicio, se intercambian solos. Se borra al reiniciar o cambiar
  de canción.
- **Banda translúcida** sobre el carril marca el fragmento (azul = solo inicio, verde = activo).

### Looper (NUEVO en v0.2, pestaña aparte)
- Pestañas **Aprender / Looper** en la cabecera; comparten teclado, audio y entrada MIDI.
- Estilo "loop station": grabas frases cortas y se repiten solas; apilas canales.
- Transporte: **Reproducir/Parar**, **Tempo** propio, **Compases (1/2/4)** y **Metrónomo**
  (con acento en el tiempo 1).
- **8 canales** (v1.2), cada uno con **Grabar / Silenciar / Borrar / Cuadrar**, color propio,
  **selector de sonido** y **volumen** (v1.3). El sonido puede ser **sintetizado** (piano,
  órgano, campanas…), **real** (piano de cola, **violín**, chelo, flauta, trompeta, guitarra —
  cada canal carga su propio instrumento, varios a la vez) o **batería TR-808** (botón "Cargar
  batería"). Los drums ignoran la altura: cualquier tecla o **pad del MPK61** los dispara.
- **Sampler / importar sonidos (v1.10):** en el selector de sonido de cada canal, opción
  **"📥 Importar sonido…"** carga un audio tuyo (WAV/MP3/OGG) y el canal lo dispara **one-shot**
  (pasa por los efectos, respeta el volumen). Los samples **pequeños (≤1,5 MB) se guardan** en el
  navegador (base64); los grandes solo en la sesión (con aviso). Código: `samples`, `'sample:<id>'`,
  `#lpSampleFile`, `saveSamples`/`decodePendingSamples`.
  - **Editor (v1.11):** botón **✏️** en el canal abre un editor con **forma de onda**, **recorte**
    (Inicio/Fin → solo suena ese trozo) y **Melódico** (la tecla cambia el tono; Do central =
    original). Botón **Probar**. Se guarda por sample. Código: `#sampleEd`, `openSampleEditor`,
    `drawSeWave`, parámetros `trimStart/trimEnd/melodic/base`.
- **Kit completo / drum rack (v1.4):** opción de sonido **"🥁 Kit completo (pads)"** por canal
  (`sound:'drumkit'`): cada **pad** toca un tambor distinto vía mapa **General MIDI** (`GM_DRUM` +
  `drumForNote`; 36→bombo, 38→caja, 42→charles cerrado, 46→abierto…). Permite grabar un ritmo
  entero en un canal con los pads del MPK61. Si los pads usan otras notas, verlo con el Monitor.
- **Mezclador / knobs (v1.5):** botón **🎛** en cada canal: lo pulsas y giras un **knob** del
  controlador → ese knob controla el **volumen** de ese canal (`volMap`, valor absoluto 0–127,
  recuerda puerto). Pensado para los **8 knobs del Arturia MiniLab MkII** (poner encoders en modo
  *Absolute* en el Arturia MIDI Control Center). Se guarda. El MiniLab además funciona directo:
  teclas (tocar/grabar) y **pads** (canal 10, notas 36–43) para el **Kit completo**.
- **Efectos maestros (v1.6):** sección "Efectos" en el Looper sobre toda la mezcla (bus maestro
  `masterIn → filtro → delay → salida`). **Filtro** (1 slider: oscuro↔normal↔brillante),
  **Delay** (tiempo + cantidad) y **Reverb** (v1.7: `ConvolverNode` con impulso generado por código,
  envío en paralelo). Por defecto **sin efecto** (no afecta a la práctica). Cada slider es
  **asignable a un knob** (🎛, `fxMap`, recuerda puerto) — para Komplete/MiniLab. Se guarda
  (`store.fx`). El metrónomo va aparte (sin efectos).
- **Exportar audio (v1.8):** botón **"⬇ Exportar audio (WAV)"**: graba en tiempo real la mezcla
  (con efectos) durante 4 vueltas del loop vía `MediaRecorder` y la descarga como **.wav**
  (`exportLooperAudio`, `audioBufferToWav`). El metrónomo no entra en la grabación. Es real-time
  (suena mientras exporta). Solo Chrome/Edge.
- **Cuantizar (v1.3):** selector **Cuadrícula** (Libre / corchea / semicorchea) en el transporte:
  cuadra al pulso al grabar; botón **"Cuadrar"** por canal para lo ya grabado.
- **Editor (v1.3):** en el carril del looper, **arrastra** una nota para moverla (tiempo/altura)
  y **doble clic** para borrarla.
- El **patrón completo se guarda** solo (notas, sonido y volumen por canal, mute, tempo, compases,
  cuadrícula) y se restaura al volver.
- Grabar = cuenta de entrada de 1 compás → grabas con **timing real** → el canal se repite
  solo. Cartel de estado en pantalla (`Prepárate… 3·2·1` / `● GRABANDO` con compás y
  **contador de notas capturadas** / `▶ En bucle`). Las notas se ven dibujarse en vivo.
- Canvas con rejilla de compases, las notas como bloques por canal y un **cabezal** de
  reproducción.
- **Importante:** en la pestaña Looper **no hay piano de ratón**; se toca con el MIDI o con
  las teclas `A S D F G H J K`.
- **Atajos MIDI (v1.1):** panel "Atajos del teclado MIDI" para asignar **Grabar canal / Canal ◀ /
  Canal ▶ / Play-Stop** a botones físicos. Pulsas la acción y luego el botón del teclado
  ("aprender"); se guarda. `selectedChannel` = canal activo (resaltado). Pensado para los botones
  de transporte/flechas del **S49 MK1** (debe estar en **modo MIDI**: INSTANCE → MIDI) y del MPK61.
  Botón **"⚡ Preajuste S49"**: asigna de un clic los botones MCU del Komplete Kontrol (REC 95 →
  Grabar, Play 94 → Play/Stop, ◀◀ 91 → Canal◀, ▶▶ 92 → Canal▶).
  - **Por puerto (v1.3):** cada atajo recuerda el **puerto** del que vino (`b.port`) y solo
    responde a ese puerto. Así una **tecla musical** del teclado (puerto "Komplete Kontrol") no
    dispara un atajo del **transporte** (puerto "DAW"). El preajuste fija `port:'DAW'`; "aprender"
    guarda el puerto real. *(Tras actualizar a v1.3 hay que volver a pulsar "Preajuste S49" para
    que las asignaciones viejas adopten el puerto.)*
- **Monitor MIDI (v1.1):** botón 🔎 que muestra **todo** lo que llega (puerto, canal, tipo, datos).
  Diagnóstico para ver qué envía cada botón. **Aviso S49 MK1:** los botones de **transporte usan
  MCU por un puerto "DAW" aparte** y las **flechas/4‑D son navegación NIHIA que no emite MIDI
  normal**; puede que no se puedan asignar aunque las teclas/knobs sí. El monitor lo confirma.

### Tutorial guiado (NUEVO en v1.9)
- **Tour de bienvenida** que **señala los botones reales** (resalta con un "agujero" y una burbuja
  con texto + Atrás/Siguiente/Saltar). Pensado para principiantes/niños, en lenguaje simple.
- Pasos: bienvenida → Conectar teclado → modo Practicar → elegir canción → Abrir .mid → Empezar →
  las notas que caen. Centrado en **aprender**.
- Sale **solo la primera vez** (`store.seenIntro` en localStorage) y se reabre con el botón
  **❔ Ayuda** de la cabecera. Código: `#tour`, `TOUR[]`, `startTour`/`showTourStep`/`positionTour`.

### Móvil / responsive (NUEVO en v1.12)

- **Diseño adaptable** para Chrome en Android (pensado para **horizontal/apaisado**), sin tocar la
  versión de escritorio. Todo con CSS dentro de *media queries* (`max-width:860px` y
  `max-height:560px + landscape`); el escritorio (ratón, ancho > 860px) **queda igual**.
- **Controles táctiles:** botones/select con altura mínima ~42px y texto legible; barras de modo
  y controles se reorganizan (wrap) sin amontonarse; barra de progreso más alta (más fácil de
  pulsar). En apaisado corto se prioriza el escenario (paddings mínimos; se oculta la ayuda de
  texto de Aprender).
- **Teclado en pantalla:** en pantallas táctiles (`pointer: coarse`) es **más alto** (`kbH(H)`:
  `min(190, H*0.42)` vs `min(150, H*0.32)` en escritorio) → teclas más cómodas para el dedo.
  Sigue **ajustándose al ancho** (cabe entero); con rangos muy amplios las teclas se hacen más
  pequeñas (lo normal es usar el teclado MIDI físico).
- **Canvas:** se redimensiona con `resize()` (DPR correcto) y `touch-action:none` en los `<canvas>`
  para que los toques en las teclas (y arrastrar notas en el editor del looper) sean fiables, sin
  zoom/scroll accidental.
- **PWA instalable (v1.13):** `manifest.webmanifest` + `icon.svg` + `sw.js` (service worker) y
  enlaces/registro en el `<head>` de `pianova.html`. En Chrome Android sale "Instalar app";
  arranca en `standalone` (apaisado) y funciona offline lo sintetizado (la red solo hace falta
  para batería/instrumentos reales por CDN). El SW usa **red primero** para la página (así se ve
  siempre la última versión) y caché de respaldo.
- **Detección MIDI (v1.13):** `connectMidi`/`bindInputs` ahora reaccionan a conectar/desconectar
  en caliente (`onstatechange`) y dan **aviso claro**: si no hay teclado → "No veo ningún teclado…
  (USB-OTG, luz encendida, vuelve a pulsar Conectar)"; si lo hay → muestra su nombre.
- **Fix solapamiento (v1.13):** faltaba `#learnView[hidden]{display:none}` (la regla de ID dejaba
  la vista Aprender visible al pasar a Looper → controles superpuestos en móvil). Ahora
  `#learnView[hidden],#looperView[hidden]{display:none}` oculta de verdad la vista inactiva;
  `.loopbar` con `flex-wrap` para no desbordar.
- **Pantalla siempre encendida (v1.14):** al detectar un teclado MIDI, la app pide un **Wake Lock**
  (`navigator.wakeLock`) para que la **pantalla no se apague** mientras tocas; se libera si no hay
  teclado y se re-pide al volver a la app (`visibilitychange`). No hay que tocar ajustes del móvil.
  Requiere Chrome + HTTPS.
- **MIDI por USB-OTG (MiniLab MkII):** funciona en Chrome Android, pero Web MIDI exige **contexto
  seguro (HTTPS)**. En **Netlify** (HTTPS) funciona; en `http://` plano no. Para publicar: subir
  `pianova.html` (o renombrarlo a `index.html` para que sea la raíz del sitio). Es un único
  archivo estático, sin build.

## Limitaciones conocidas ⚠️

- **Instrumentos reales y batería necesitan internet** (descargan samples vía `smplr`/CDN).
  Offline solo funcionan los presets sintetizados. En el Looper el instrumento es **por canal**
  (v1.3); en Aprender hay un instrumento **global** (selector de la cabecera).
- Los presets sintetizados **no** suenan como Native Instruments; son aproximaciones propias.
- **Practicar** es melodía a una mano; **Acompañar** incluye acordes y dos manos, y ya permite
  practicar **una sola mano** (la otra suena sola). La mano se detecta por **pista** del MIDI;
  en archivos de **una sola pista** (p. ej. Mario) cae al respaldo por altura (Do central), que
  es aproximado.
- El import de `.mid` usa la **pista con más notas**; si la melodía está repartida en varias
  pistas, puede equivocarse (visto con un arreglo de piano a dos manos).
- Samples importados: los **> 1,5 MB no se guardan** entre sesiones (límite de `localStorage`);
  el canal queda en silencio al recargar si su sample no se guardó. El editor (recorte/melódico)
  no destruye el audio original (solo guarda los parámetros).
- Solo **Chrome/Edge de escritorio**. Nada de móvil ni Safari (es por Web MIDI).
- **Looper solo en memoria:** si recargas la página, se pierden las pistas grabadas.
- Looper: longitud (compases) se fija para todos los canales; cambiarla con contenido los
  vacía (pide confirmación). Sin cuantización, sin volumen por pista, sin exportar.
- El bucle A–B funciona en **Practicar y Acompañar**; los marcadores son índices de la secuencia
  activa (notas o acordes). Se borra al cambiar de canción/modo/mano/dificultad (`reset`).

## Cómo está montado el código (resumen)

Todo en `pianova.html`, dentro de un único `<script>`:
`SONGS` (canciones) → **motor de instrumentos** (`SYNTH` presets, `synthNoteOn`/`synthSilence`,
`loadSoundfont` para reales; `noteOn`/`silence` despachan por `currentInstrument`; `lpClickSound`
metrónomo) → estado del looper (`lp`, canales) → entrada (MIDI/ratón/teclado, enrutada por la
pestaña activa `tab`) → import `.mid` (`parseMidi`, `extractMelody`) → lógica de juego (`judge`,
practice/playalong, **bucle de fragmento**) → `geometry()` (`LOW`/`HIGH` variables, `fitRange`)
→ render del aprender en `<canvas>` → **motor del looper** (`lpTick`, `lpCapture`, `lpPlayback`,
`lpDraw`) → bucle `requestAnimationFrame`. Tiempo medido en **beats**.

La maqueta tiene dos vistas: `#learnView` y `#looperView` (se muestran/ocultan según `tab`).
Documentos de diseño/plan en `docs/superpowers/specs/` y `docs/superpowers/plans/`.

## Próximos pasos inmediatos (elige uno)

1. **Subir el tempo poco a poco / graduarse a tiempo real:** modo que toca a % del tempo y acelera
   según aciertas (puente entre "esperar a que toques" y tocar de verdad).
2. **Pantalla de resultados + repaso de lo más fallado** (lleva al repaso espaciado).
3. **Pedal de sustain (CC64) + dinámica por velocity** (el S49 lo soporta).
4. **Samples en local** (batería e instrumentos reales offline; hoy se descargan por CDN).
5. **Varios patrones del looper con nombre** (guardar/cargar "beat 1", "beat 2"…).
6. **Subir el tempo poco a poco** en Practicar/Acompañar (graduarse a tiempo real).
7. **Exportar a MIDI** el patrón del looper (además del WAV ya hecho).
8. **Búsqueda de MIDIs en la app:** choca con **CORS** desde el navegador; necesitaría mini-proxy
   (rompe "sin backend"). De momento se descargan a mano; Claude puede bajarlos a petición.

## Ideas / pendientes anotados

- Looper: durante la cuenta de entrada, los canales ya grabados se quedan en silencio (1 compás
  de "preparados"). Si molesta para tocar encima, hacer que la base siga sonando durante la
  cuenta.
- Looper: cuantización opcional, volumen por pista, sonidos distintos por canal.
- Bucle de fragmento también en modo Acompañar.
- **Audio (MP3/WAV) → MIDI (aparcado):** factible solo para melodías monofónicas limpias
  (detector de tono propio). Para canciones completas requiere modelos de IA (p.ej. Spotify
  Basic Pitch), que rompen "sin dependencias/offline" y dan resultados sucios. Experimento
  opcional futuro, fuera del alcance actual.
- Pedal de sustain (CC64) y dinámica por velocity.
- Light Guide del S49 MK1 (LEDs): muy deseable pero complicado (protocolo cerrado).

## Preguntas abiertas para la persona

- Para el import de `.mid`: ¿qué canciones quieres practicar primero?
- ¿Te vale el sonido sintetizado de momento, o prefieres dar el salto a samples pronto?
- ¿Quieres poder guardar los loops del Looper entre sesiones?

## Notas

- Mantener un solo archivo mientras sea cómodo. Si crece mucho, separar en
  `index.html` + `style.css` + `app.js`.
- Para desarrollar: VS Code + extensión **Live Server** (clic derecho → *Open with Live Server*).
- El `AudioContext` debe crearse/reanudarse tras un gesto del usuario (botón). Ya en `ensureAudio()`.
