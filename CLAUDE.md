# CLAUDE.md

Guía para trabajar en **Pianova** desde Claude Code. Léela entera antes de hacer cambios.

## El proyecto en una frase

App web (un solo archivo HTML) para aprender piano con notas que caen estilo Synthesia,
**priorizando la pedagogía** por encima del aspecto o de la cantidad de funciones.

## Contexto de la persona

- Habla español. Responde siempre en español.
- Tiene varios controladores MIDI por USB: **Native Instruments Komplete Kontrol S49 MK1**,
  **Akai MPK61** y **Arturia MiniLab MkII**. Usa la app también en **móvil (Chrome Android) por
  USB-OTG**.
- Programa poco o nada: explica los cambios con claridad y evita pasos manuales complejos.
  Cuando propongas algo, prefiere lo más simple que funcione.

## Decisiones ya tomadas (no rehacerlas sin avisar)

1. **Web, no escritorio.** El teclado funciona perfectamente por Web MIDI en el navegador.
   La única razón para ir a escritorio sería alojar los plugins de NI, lo cual es muy complejo
   y **no aporta nada al objetivo de aprender**. Se descartó.
2. **El sonido bueno (Komplete) va aparte, vía Ableton, más adelante.** No intentar integrar
   VST/Kontakt aquí. **Matizado (v0.4):** la app tiene un **motor de instrumentos**: presets
   **sintetizados** propios (Web Audio, offline, por defecto) y, opcionalmente, **instrumentos
   reales** (piano, violín, flauta…) vía la librería `smplr` + soundfonts libres, que se
   **descargan de internet** al elegirlos. El modo offline por defecto sigue siendo el synth.
3. **Un solo archivo `pianova.html`** (HTML + CSS + JS inline), sin build. **Matizado (v0.4):**
   sigue sin dependencias *de instalación/empaquetado*, pero el motor de instrumentos puede
   cargar `smplr` **bajo demanda desde un CDN** (`import('https://esm.sh/smplr@...')`) solo si el
   usuario elige un instrumento real. **Matizado (v1.0):** ahora SÍ usa `localStorage` (clave
   `pianova-v1`) para guardar canciones `.mid` importadas, preferencias y precisión por canción.
   Mantener todo en un archivo mientras sea razonable.
4. **El modo "Practicar / espera a que toques" es la función estrella.** Cualquier mejora de
   aprendizaje gira en torno a él.
5. **Giro a "pro" (decidido 2026-06-28):** la app evoluciona hacia un **DAW/groovebox** completo, con
   el **aprendizaje de instrumentos como un módulo más**. Como `pianova.html` (un archivo, ya >4.000
   líneas) se queda corto, se **reconstruye en un proyecto modular pro** en la carpeta **`studio/`**
   (**Vite + TypeScript + Vitest**), **portando** los motores ya probados (audio/transporte, synth,
   EQ, looper, MIDI) **por fases, sin reescribir a ciegas**. Esto **matiza la decisión 3**: el "un solo
   archivo" aplica a `pianova.html` (que sigue vivo y publicado hasta la conmutación). **Hoja de ruta:**
   **F0** cimientos *(hecha)* · **F1** motor de instrumentos *(hecha, v0.2.0: synth de 5 presets +
   cadena maestra anti-clipping + entrada MIDI + teclado, todo cableado en la vista Estudio; ya se
   toca y se oye)* · **F2** suite de efectos
   **TAP completa** *(HECHA, v0.8.0: los **19 efectos** en 6 tandas —Delays/Espacio, Modulación, Dinámica,
   Color/EQ, Tono— montables en racks de inserción reutilizables (instrumento y maestro) + guardar/abrir
   proyecto; 18 nativos + 1 AudioWorklet (Pitch Shifter granular). Ver el detalle por tanda en `HANDOFF.md`
   y los specs/plans)* · **F3** DAW/groovebox
   *(HECHA, v0.13.0: el Estudio es un groovebox — transporte (play/stop/BPM/swing/grabar), canales con
   instrumento synth o **batería 808** + volumen/pan/mute/solo + **rack de efectos por canal**, secuenciador
   de pasos multi-canal, **patrones + song mode**, **grabación de pasos en vivo**; proyecto v3 con migración
   desde F1/F2. Sub-tandas 3A–3E. El MIDI-learn de knobs/transporte quedó como mejora opcional. **Acabado
   pro de la UI** (post-F3): knobs giratorios (`ui/knob.ts`) en Vol/Pan/Swing y parámetros de efectos,
   tira de canal compacta y **panel de efectos desplegable** abajo; `MASTER_MAKEUP` bajado a 1.8 (headroom);
   **sinte editable por canal** (`synthx`: osc blend + sub + unison + ADSR + filtro + LFO, con editor en cajón).
   Detalle por sub-tanda en `HANDOFF.md`)* · **Rediseño PIANOVA STUDIO (v0.15.0):** la vista del Estudio se reorganizó al estilo STORM/Tempest (negro + verde neón, **pestañas PADS / SAMPLES / MIXER**, rejilla de pads con pasos y parámetros inline), sin cambios de motor; **Sampler con slicing — S1 núcleo (v0.16.0):** el Estudio tiene ya un **sampler con slicing** (canal `slicer`: importar audio, trocear por transitorios/iguales, slices→notas, secuenciable; editor en la pestaña SAMPLES) como S1 del sub-proyecto del Simpler; pendientes S2 (marcas a mano), S3 (edición por slice) y S4 (navegador de carpetas). · **F4** módulo Aprender · **F5** conmutar el sitio a la
   app nueva. Ver `studio/` y los specs/plans en `docs/superpowers/`.

## Cómo ejecutar y probar

- Abrir `pianova.html` en **Chrome/Edge** de escritorio. Para desarrollo, usar **Live Server**
  (corre en `localhost`, mejor para Web MIDI y recarga en vivo).
- Web MIDI **sí** funciona en **Chrome Android** (móvil) **por USB-OTG**, pero requiere **HTTPS**
  (contexto seguro). En **Safari** no funciona. En escritorio, Chrome/Edge.
- Para probar sin el teclado físico: clic con el ratón sobre las teclas, o teclas
  `A S D F G H J K` (blancas) y `W E T Y U` (negras) del ordenador.

## Publicación y móvil (v1.12–v1.13)

- **Publicada:** GitHub `reivajsk8-design/Pianova` → **Netlify** https://pianova.netlify.app
  (auto-deploy en cada `git push` a `main`). Para subir cambios: commit + `git push origin main`
  (credenciales cacheadas). `_redirects` (`/  /pianova.html  200`) sirve la app en la raíz;
  `midis/` en `.gitignore`. Detalle operativo en la memoria del proyecto.
- **PWA instalable:** `manifest.webmanifest` + `sw.js` (service worker, red-primero para la página)
  + `icon.svg`, enlazados/registrados en el `<head>`. Instalable en Android; arranca standalone.
- **Responsive:** media queries (`max-width:860px` y apaisado) + teclado más alto en táctil
  (`COARSE`/`kbH`) + `touch-action:none` en los `<canvas>`. El escritorio queda **igual**.
  Las dos vistas se alternan con `[hidden]` (regla `#learnView[hidden],#looperView[hidden]`).
  **Cabecera superior pro (v1.31):** el header usa **segmentado de pestañas** (`.tabs`/`.tab`, solo
  CSS), **grupo Instrumento** con etiqueta (`.hdrCol`/`.hdrLab`), **chip de conexión** (`.connChip` +
  `.dot` rojo/verde, toggle de clase `.on` en `bindInputs`), y **Ayuda** como icono (`.hdrIcon`). En
  móvil <620px el chip muestra solo el punto; todo HTML/CSS + el toggle de clase.
  **Cabeceras pro en móvil (v1.29):** en `<860px`, las barras `.lnBar` (Aprender) y `.lpTransport`
  (Looper) **ocultan los separadores verticales** (`.tpSep`) y usan `gap:10px 14px` para envolver
  limpio; el BPM grande baja a 22px, los `.lnIcon` son cuadrados 42×42 (táctil cómodo) y el
  desplegable de canción se limita (`#song{max-width:46vw}`) para no desbordar.
- **Wake Lock (v1.14):** al detectar teclado MIDI (`bindInputs`) se pide `navigator.wakeLock`
  ('screen') para que la pantalla no se apague; se libera sin teclado y se re-pide en
  `visibilitychange`. Sin tocar ajustes del móvil.

## Arquitectura

**Nota:** existe un **proyecto pro en `studio/`** (Vite + TypeScript, reescritura **modular** DAW/groovebox + aprendizaje como módulo reutilizable) que portará los motores de `pianova.html` por fases (F0–F5). `pianova.html` sigue completamente funcional y publicado hasta la conmutación final (Fase 5). El contenido siguiente describe la arquitectura actual de `pianova.html`.

### Pianova.html (todo en un archivo)

- **Entrada MIDI:** `navigator.requestMIDIAccess` → `onmidimessage`. Status `0x90` con
  velocity>0 = note on; `0x80` o `0x90` con velocity 0 = note off. Se escuchan **todas** las
  entradas a la vez (varios teclados). Se **ignora el canal 10** (percusión) para que los pads
  de controladores como el **Akai MPK61** no cuenten como notas (salvo en la pestaña Looper,
  donde los pads sí pasan para tocar batería). Controladores class-compliant (S49 MK1, MPK61)
  funcionan sin drivers.
- **Atajos MIDI del Looper ("Aprender MIDI"):** `handleMidiControl` intercepta CC/notas antes de
  tocarlas. El usuario asigna acciones (`LP_ACTIONS`: grabar canal, canal ◀/▶, play/stop) pulsando
  un control físico; se guarda en `midiMap` (localStorage). `doMidiAction` ejecuta; `selectedChannel`
  es el canal activo. **El S49 MK1 debe estar en modo MIDI** (INSTANCE → MIDI) para que sus botones
  envíen CC; los CC exactos dependen del Controller Editor, por eso se usa "aprender" en vez de
  números fijos. Funciona igual con el MPK61 o cualquier controlador. Botón **"⚡ Preajuste S49"**
  fija los atajos a las notas MCU estándar del Komplete Kontrol (REC=95→Grabar, Play=94→Play/Stop,
  ◀◀=91→Canal◀, ▶▶=92→Canal▶). **Cada atajo recuerda su PUERTO** (`b.port`): así una tecla musical
  del teclado (puerto "Komplete Kontrol") no dispara un atajo del transporte (puerto "DAW"). El
  preajuste fija `port:'DAW'`; "aprender" guarda el puerto real del control pulsado.
- **Mezclador (knobs → volúmenes):** `volMap` (canal → `{num,port}`) asigna un **knob (CC)** al
  volumen de un canal. Botón **🎛** en cada canal arma el aprendizaje (`volLearn`); al girar un
  knob queda asignado. `setChannelVolFromCC` aplica valor **absoluto** (0–127). Pensado para los
  8 knobs del **Arturia MiniLab MkII** (poner los encoders en modo *Absolute* en MIDI Control
  Center). Persistido en `localStorage` (`volmap`).
- **Faders verticales y transporte pro (v1.21):** `makeFader(opts)` es un helper reutilizable
  que crea un fader vertical draggable (ratón y táctil) con reset por doble-clic y `setValue()`
  sin disparar `onInput` (para actualizar desde MIDI sin bucle). `lpFaders` agrupa los faders de
  efectos (filtro, delay, reverb) que reemplazaron los sliders planos del bus maestro, formando
  un **rack de faders** vertical estilo mezcladora. El volumen de cada canal también usa este
  fader (en la cabecera del canal) y sigue asignable a un knob CC via `volMap`/`volLearn`. El
  volumen del **metrónomo** (`lpClickVol`, rango 0–1) tiene su propio mini-fader en la barra de
  transporte. La **barra de transporte pro** muestra el BPM con tipografía grande, editable por
  doble-clic (prompt) o arrastre vertical (drag ↕), ligado al elemento `lpTempoEl`; el botón
  Play ▶/⏹ es mapeable por MIDI-learn (`lp_play`). Reutiliza `volMap`/`fxMap` y toda la
  persistencia anterior.
- **Audio (motor de instrumentos):** `noteOn(midi, vel)` / `silence(midi)` despachan según
  `currentInstrument`. Si es **sintetizado** (`{type:'synth',preset}`), usa `synthNoteOn` con
  el preset de `SYNTH` (osciladores + envolvente; `sustain:true` para órgano/cuerda, percusivo
  el resto; `voices` guarda la polifonía). Si es **real** (`{type:'sf',name}`), usa el
  reproductor `smplr` (`sfPlayer`), con `sfStops[midi]` para parar cada nota. `loadSoundfont()`
  importa `smplr` desde CDN y carga el soundfont; si falla (sin internet) vuelve al synth.
  `lpClickSound()` es el clic del metrónomo (va directo a `destination`, sin efectos). El selector
  `#instrument` (cabecera) cambia el instrumento global (Aprender + Looper). **Ganancia de los sonidos
  (v1.32):** ajustable 0–300% — por canal en el Looper (synth/sample completo, sf/batería al máximo via
  reproductor compartido) mediante fader (`makeFader max:GAIN_MAX def:1`) asignable a knob CC
  (`volMap`/`volLearn`, escala 0–127 CC); y por instrumento global (`instGain`/`currentInstGain`/
  `store.instGain[clave]`, control deslizador en `#instGainWrap`) con destino propio `globalSf`. El bus
  maestro limitador + soft-clipper (v1.26) contiene saturación.
- **Bus maestro de efectos (v1.6):** `setupMasterBus()` (en `ensureAudio`) crea
  `masterIn → fxHP → fxLP → (seco + delay con realimentación) → masterOut → destination`. El synth
  conecta a `masterDest()` y `smplr` se crea con `{ destination: masterDest() }`. `fxParams`
  (filter 0.5=sin efecto, delayTime, delayAmount) + `applyFx()`. Sliders `#lpfx` y asignables a
  knobs (`fxMap`/`fxLearn`, patrón 🎛). Persistido en `store.fx`. **Reverb (v1.7):** `ConvolverNode`
  con impulso generado (`makeImpulse`) como envío en paralelo de la mezcla (`fxRevWet`). **Ecualizador maestro (v1.34):** etapa de EQ antes del limitador (`buildEq`: `masterIn → eqInput(preamp) → bandas biquad → fxHP`). Spec común `{preamp, bands}`. 5 presets en `EQ_PRESETS` (plano, cuerpo, cálido, brillante, loudness). Parser `parseApoEq` lee perfiles Equalizer APO. UI `#eqPreset` en "Mezcla maestra". Persistido en `store.eq`. **Editor gráfico de EQ (v1.35):** overlay `#eqEditor` con 8 bandas editables (`store.eq.manual`, preset `'manual'`), espectro en tiempo real (`eqAnalyser` sobre `masterFinal`) y curva de respuesta (`getFrequencyResponse`). Edición en vivo (`eqUpdateSlot`/`eqUpdatePreamp`) sin reconstruir. Canvas interactivo (arrastrar/rueda/táctil) con funciones `freqToX`/`xToFreq`/`gainToY`/`yToGain`. Botón "✎ Editar EQ".
- **Exportar audio (v1.8):** `exportLooperAudio()` graba en tiempo real `masterFinal` (mezcla con
  efectos) vía `MediaRecorder` mientras suenan 4 vueltas del loop, decodifica y convierte a **WAV**
  (`audioBufferToWav` + `downloadBlob`). El metrónomo va a `destination` (fuera de `masterFinal`),
  así que no entra en la exportación. Botón `#lpExport`.
- **Render:** un `<canvas>` dibuja el carril de notas (arriba) y el teclado (abajo) juntos,
  para que la posición horizontal de cada nota coincida con su tecla.
- **Geometría:** `geometry(width)` calcula x/anchura/centro de cada tecla (blancas y negras)
  en el rango `LOW` … `HIGH`. **Ahora son variables** (no constantes): `fitRange(notes)` los
  ajusta a la canción (octavas completas, mín. 2 octavas) en `setSong()`. Las canciones a mano
  siguen quedando en Do4–Do6. Las notas que caen y el teclado comparten esta geometría.
- **Importar `.mid`:** `parseMidi(buf)` (parser propio, sin librerías) lee el Standard MIDI
  File; `extractMelody()` saca una melodía monofónica (pista con más notas, nota más aguda) a
  `{midi,startBeat,dur}`. Botón `#openMidi` + input `#midiFile`.
- **Looper / caja de ritmos:** pestaña aparte (`tab='looper'`). Estado en `lp` (**8 canales**,
  reloj `lp.beat`, grabación con cuenta de entrada). Cada canal tiene **sonido** (spec
  `'synth:<preset>'` | `'sf:<nombre>'` | `'drum:<grupo>'` | `'synthx'` sinte editable) y **volumen** (`vol`).
  **Sinte editable por canal (v1.36):** sonido `'synthx'` permite editar osciladores (blend seno/cuadrada/sierra),
  ADSR, filtro LP/BP y resonancia; motor `synthVoiceAdj` reutiliza `voices`/`synthStopAt` agendado; editor
  overlay `#synthEd` con ✏️ por canal; persistido en `store.looper`. Los 5 presets synth fijos siguen
  disponibles. `playChannelSound()` enruta: synth/synthx (`synthNoteOn`/`synthVoiceAdj` con `gainMul`), real
  (`sfCache`/`ensureSoundfont`, varios a la vez: violín + piano…), batería (one-shot del `drumKit`); el
  volumen escala velocity/pico. `lpTick`,
  `lpCapture`, `lpPlayback`, `lpDraw`. **Batería real TR-808** vía `smplr` `DrumMachine`
  (`loadDrumKit`, `getGroupNames()`). Los **pads** (canal 10) pasan al looper. Sonido de canal
  especial **`'drumkit'`** (drum rack): cada nota/pad dispara un tambor distinto vía mapa General
  MIDI (`GM_DRUM` + `drumForNote`), pensado para los **pads del MPK61**.
  **Cuantización:** `quantizeGrid` (0/0.5/0.25) + `quantizeNotes` (al grabar y botón "Cuadrar").
  **Editor:** arrastrar/doble-clic sobre `#lpCanvas` mueve/borra notas (`lpNoteAt`, `lpEdit*`).
  El **patrón se guarda** en `localStorage` (`saveLooper`/`restoreLooper`: notas, sonido, volumen,
  mute, tempo, compases, cuadrícula).
- **Sampler (v1.10):** sonido de canal `'sample:<id>'` = audio importado por el usuario (WAV/MP3…).
  `playChannelSound` lo dispara one-shot (`BufferSource → gain(vol) → masterDest`). Import por canal
  (opción "📥 Importar sonido…" → `#lpSampleFile`). `samples[id]={name,buffer,b64}`; se **guardan
  los pequeños** (≤1,5 MB) en `localStorage` como base64 (`abToB64`/`b64ToAb`, `saveSamples`,
  `decodePendingSamples` al crear el audio); los grandes solo en la sesión. **Editor (v1.11):**
  botón ✏️ por canal abre `#sampleEd` con forma de onda (`drawSeWave`), **recorte** (`trimStart`/
  `trimEnd` → `BufferSource.start(0,offset,dur)`) y **melódico** (`melodic`/`base`, tono por
  `playbackRate = 2^((midi-base)/12)`). Parámetros guardados por sample.
- **Navegador de samples (v1.19):** panel lateral `#libPanel` (clase `.libPanel`) que se abre con
  el botón **"📁 Librería"** (`#libBtn`). Importa **carpetas enteras del disco** vía File System
  Access API (`showDirectoryPicker` + respaldo `webkitdirectory` para móvil/navegadores sin
  soporte). Escaneo **perezoso** del árbol de directorios (`scanDirHandle`/`libFileMap`): solo se
  leen los metadatos al navegar, el audio se decodifica bajo demanda (`libNodeBuffer`/`libBufCache`).
  El panel tiene tres pestañas: **Carpetas** (árbol), **Favoritos** (⭐) y **Recientes** (🕘);
  buscador de archivos; filas con acciones ▶ escuchar (`libPreview`), ✚ asignar a canal
  (`libAssignChannel`) y 🎹 asignar como instrumento global (`libAssignInstrument`). Se puede
  **arrastrar** una fila a la cabecera de un canal para asignarlo. El instrumento global de tipo
  `'sample'` es **melódico** (la nota cambia el tono por `pitchRate = 2^((midi-base)/12)`).
  Persistencia: el handle de carpeta se guarda en **IndexedDB** (base `pianova`) para reabrirla
  sin volver a elegirla; `store.lib` guarda favoritos y recientes. Solo escritorio para importar
  carpeta (en móvil el fallback abre el selector de archivos sueltos).
- **Piano-roll por canal (v1.20):** overlay `#pianoroll` (pantalla completa, z-index alto) que se
  abre con **doble-clic en el carril** de cualquier canal del Looper y se cierra con el botón ✕ o
  la tecla Esc. Estado en `prState` (canal activo, scroll, modo de edición). La geometría vertical
  (`prRows`) mapea cada semitono a una fila de píxeles. El render principal es `prDraw` (rejilla
  1/16, notas coloreadas, cabezal de reproducción sincronizado con `lp.beat`, Fold/rango visible) y
  `prDrawVel` (carril de velocity en la parte inferior, con barras arrastrables). La edición es por
  ratón y toque táctil: **crear** nota (clic en hueco), **mover** (arrastrar cuerpo), **alargar**
  (arrastrar borde derecho) y **borrar** (doble-clic o clic derecho). El **snap** `prSnap` (botón de
  rejilla: libre / 1/8 / 1/16) cuadra la posición y la duración al crear y mover. La paleta
  `PR_SCALES` define los intervalos de las escalas disponibles; `prInScale(midi, tonica, tipo)` indica
  si una tecla pertenece a la escala activa, y las filas de esas notas se iluminan con el resalte de
  escala. El modo **Fold** oculta las octavas sin notas para que se vea mejor el contenido. Las
  ediciones actúan directamente sobre `lp.channels[i].notes` (el mismo arreglo que usa el Looper) y
  llaman a `saveLooper`, por lo que los cambios son inmediatos y persisten en `localStorage`.
- **Edición avanzada del piano-roll (v1.22):** selección múltiple (`prSel`, array de notas
  seleccionadas), marquesina de recuadro (`prMarquee`; `prNotesInRect` devuelve las notas dentro del
  rectángulo dibujado), selección por Shift-clic (añadir/quitar nota individual) y Ctrl+A (seleccionar
  todo). Las notas seleccionadas se mueven en **grupo** arrastrando cualquiera de ellas (desplazamiento
  relativo aplicado a todas). Portapapeles relativo `prClip` (Ctrl+C copia con offsets respecto a la
  nota de menor beat; Ctrl+V pega en el **cabezal de reproducción** `lp.beat`; Ctrl+D duplica el
  fragmento justo detrás). El portapapeles es global al overlay, así que se puede copiar en un canal y
  pegar en otro. Deshacer/rehacer multinivel: `prPushUndo` guarda un snapshot de las notas antes de
  cada mutación; `prDoUndo`/`prDoRedo` recorren las pilas `prUndo`/`prRedo`. Atajos de teclado
  (`keydown`) activos **solo con el overlay abierto** y con `preventDefault` para no interferir con el
  navegador: Ctrl+A (todo), Ctrl+C (copiar), Ctrl+V (pegar), Ctrl+D (duplicar), Ctrl+Z (deshacer),
  Ctrl+Y (rehacer) y Delete/Backspace (borrar notas seleccionadas).
- **Secciones / bucle (Practicar y Acompañar):** `loopStart`/`loopEnd`/`loopOn`/`loopRounds` son
  índices de la **secuencia activa** (notas/`idx` en Practicar, acordes/`stepIdx` en Acompañar;
  helpers `seqLen`/`curSeqIdx`/`seqBeatAt`). Al acertar el final, vuelve al inicio (`seekToIndex`).
  **Barra de progreso** `#seek`: `updateSeek()` pinta cabezal + región del bucle; clic →
  `seekToBeat()` salta a ese punto (con `markAutoFiredBefore`/`markFullFiredBefore` para no
  redisparar lo ya pasado). `start()` arranca desde el inicio del fragmento si hay bucle.
- **Tiempo:** todo en **beats**. `songBeat` avanza con `dt * (bpm/60)`. `LOOKAHEAD` (≈4.2)
  son los beats visibles por encima de la línea de impacto. En **Escuchar y Looper**, el tiempo va por
  **reloj de audio + adelanto** (`makeTransport`, `LOOKAHEAD_SEC = 0.1`, `dueLinear`/`dueLoop`,
  `noteOnAt`/`synthStopAt`/`playChannelSound(...,when)`); el modo en vivo sigue siendo inmediato.
- **Lógica pedagógica:** ambos modos esperan a que toques (congelan `songBeat`).
  - `practice`: melodía a una nota; `waiting` hasta que `judge` recibe `notes[idx]`, avanza `idx`.
  - `playalong` (Acompañar): la **canción completa por acordes**. `rebuildSteps()` arma `steps`
    (acordes: notas que empiezan casi a la vez, EPS 0.04) según `handMode` ('both'|'right'|'left').
    Espera en `steps[stepIdx]` hasta tocar **todas** sus notas (`stepGot`); avanza `stepIdx`.
    Al practicar una mano, las notas de la otra van a `autoNotes` y **suenan solas** (`playAutoAt`).
    Caen todas las notas con **color por mano** (`n.hand`: L azul / R ámbar).
  - **Mano de cada nota** (`assignHands`): por **pista** del MIDI. Con 2 pistas, la de tono medio
    más alto = derecha; con 3+ pistas, derecha las que superan el promedio de tonos medios. Si solo
    hay una pista, separa por altura (Do central). Selector `#hands`.
  - **Dificultad de acordes** (`chordLevel`, selector `#chords`): `simple` = solo la nota aguda
    (melodía), `media` = aguda + grave, `full` = acorde completo. Las notas que no tocas se mandan
    a `autoNotes` y **suenan solas**, así la canción se oye llena en cualquier nivel.
- **Canciones:** objeto `SONGS`. Cada nota es `{ midi, startBeat, dur }` (más `vel` en las
  importadas). El helper `seq()` coloca notas en beats consecutivos. Solfeo vía `SOLFEGE`.
  Cada canción puede tener `full` (todas las notas: acordes + 2 manos). El estado tiene `notes`
  (melodía, para practicar/juzgar) y `fullNotes` (para el modo **Escuchar**).
- **Modos:** `practice` (melodía, una nota), `playalong` (Acompañar: canción completa por
  acordes, espera el acorde entero), `listen` (Escuchar: `playFullAt` reproduce `fullNotes` por
  beat con velocity e ilumina teclas), `reto`, `free`. La selección de modo es un **desplegable**
  `#mode` (v1.23) cuyo `change` llama a `setMode(m)` (antes eran botones `.seg`).
- **Cabecera pro de Aprender (v1.23):** la fila de controles (`.lnBar`) sigue el estilo del transporte
  del Looper (reutiliza `.tpCol/.tpLab/.tpSep/.tpBpm`): **Modo** (desplegable) · **▶ Empezar** /
  **↻ Reiniciar** · **Tempo = BPM grande editable** (`#lnBpmNum`/`setLnBpm`, doble-clic=prompt,
  arrastrar ↕; `#tempo` queda oculto como fuente de verdad) · **Canción** + **📂 .mid** · **Manos** ·
  **Acordes** · barra de bucle A–B. El tutorial (`TOUR`) apunta a `#mode`. **Compacta (v1.24):**
  Empezar/Reiniciar/.mid son **iconos** (`.lnStart` ▶ redondo amber; `.lnIcon` ↻ y 📂 cuadrados;
  `title=` conserva el texto); nombres de modo cortos; márgenes ajustados para no solapar.
  **Bucle A–B (v1.25):** sus botones también son iconos **A / B / ✕** en un grupo `.lnLoop` con
  etiqueta, empujado al **extremo derecho** (`.lnLoopSep{margin-left:auto}`).
- **Modo Reto (juego):** la melodía cae **a tempo del nivel** (no espera); aciertas si tocas a
  tiempo (ventana ±`RETO_WINDOW`). `levelTempo(L)` = `base*(0.5+0.1*L)` (L1≈60%…L8≈130%). Superar
  ≥85% sube de nivel (más tempo). Puntuación + combo + estrellas; `retoFinish` muestra `#retoEnd`.
  Guarda `bestLevel`/`bestScore` por canción en `store.progress`. HUD `#retoBar`. Lógica en las
  ramas `reto` de `start`/`frame`/`judge` (+ `startReto`, `updateRetoHUD`).

- **Tutorial guiado (v1.9):** tour de bienvenida que resalta botones reales con un "agujero"
  (box-shadow) + burbuja (`#tour`, `TOUR[]`, `startTour`/`showTourStep`/`positionTour`). Sale la
  primera vez (`store.seenIntro`) y se reabre con el botón **❔ Ayuda** (`#help`). Lenguaje simple
  para principiantes/niños; enfocado en aprender (conectar, modo Practicar, canción, Empezar, notas).

## Convenciones de código

- JavaScript puro, todo dentro de un IIFE `(() => { ... })()` con `'use strict'`.
- Sin frameworks, sin paso de compilación. Usa `localStorage` (clave `pianova-v1`) para
  persistencia. Única dependencia externa: `smplr` cargado **bajo demanda** por CDN para
  instrumentos reales.
- Comentarios y textos de interfaz **en español**.
- Mantener el archivo legible: secciones separadas por comentarios (`// ---------- ... ----------`).

## Hoja de ruta (orden sugerido)

- ✅ **Cargar `.mid`** (v0.3): parser propio + extracción de melodía monofónica.
- ✅ **Bucle de fragmento** (v0.2, modo Practicar).
- ✅ **Looper** (v0.2): pestaña tipo loop-station con 4 canales.
- ✅ **Más sonidos** (v0.4): motor de instrumentos (presets synth + reales vía `smplr`).

- ✅ **Sonido completo** (v0.5): modo **Escuchar** reproduce el arreglo entero (`full`).
- ✅ **Acordes + dos manos en Acompañar** (v0.6): la canción completa, paso a paso, esperando
  cada acorde; color por mano.
- ✅ **Manos por pista + practicar una mano** (v0.7): `assignHands` detecta la mano por pista del
  MIDI (con respaldo por altura); selector `#hands` para practicar solo derecha/izquierda con la
  otra sonando sola.
- ✅ **Dificultad de acordes** (v0.8): selector `#chords` (simple/medio/completo) para subir la
  dificultad poco a poco; lo que no tocas suena solo.
- ✅ **Practicar por secciones** (v0.9): barra de progreso con clic para saltar, y bucle A–B
  (Inicio/Fin aquí) también en Acompañar, para repetir un trozo de canciones largas.
- ✅ **Persistencia** (v1.0): `localStorage` guarda canciones `.mid` importadas, preferencias
  (instrumento/canción/modo/manos/dificultad) y **mejor precisión por canción** (stat "Mejor").
  Helpers `loadStore`/`saveStore`/`savePrefs`/`restoreSongs`/`recordProgress`.

Pendiente (orden sugerido):
1. **Búsqueda de MIDIs en la app:** choca con CORS desde el navegador; necesitaría un mini-proxy
   (rompe "sin backend"). De momento, los MIDIs se descargan a mano (carpeta `midis/`).
2. **Instrumento por canal en el Looper** (hoy el instrumento es global) y guardar samples en
   local para que los instrumentos reales funcionen offline.
3. **Persistir** (Looper y/o canciones importadas) entre sesiones → implicaría `localStorage`.
4. **Progreso:** guardar precisión por canción y repaso espaciado de lo que más se falla.
5. **Pedal de sustain (CC64)** y dinámica por velocity.
6. **Audio (MP3/WAV) → MIDI:** solo realista para melodías monofónicas limpias; canciones
   completas necesitan IA (rompe offline, resultados sucios). Experimento opcional.
7. **Light Guide del S49 MK1 (LEDs sobre las teclas):** muy deseable pero **complicado** en el
   MK1 (protocolo cerrado / ingeniería inversa, sin garantías). Investigar a fondo antes de
   prometer nada.

## Errores fáciles de cometer

- No asumir que Web MIDI está disponible: comprobar `navigator.requestMIDIAccess` y dar un
  mensaje claro si no.
- El `AudioContext` debe crearse/reanudarse tras un gesto del usuario (botón). Ya se hace en
  `ensureAudio()`.
- Al tocar el render, recuerda que notas y teclado comparten `geometry()`: si cambias el rango
  o la anchura, ambos deben usar el mismo cálculo o se desalinean.
