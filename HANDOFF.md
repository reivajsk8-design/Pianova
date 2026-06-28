# HANDOFF — Pianova

Snapshot para retomar el proyecto en otra sesión (humana o con Claude Code).

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
