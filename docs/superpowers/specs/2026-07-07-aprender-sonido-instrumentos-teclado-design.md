# Aprender: arreglar distorsión + instrumentos + teclado a pantalla completa — Diseño

**Fecha:** 2026-07-07 · **Versión objetivo:** 0.47.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Tres mejoras del módulo Aprender tras probarlo:
1. **Arreglar la distorsión:** el piano (y demás) satura al tocar melodías.
2. **Selector de instrumento:** poder elegir entre los sonidos del synth (Piano, Órgano, Cuerda…) más un par
   nuevos (Guitarra, Flauta).
3. **Teclado a lo ancho, abajo del todo:** la vista ocupa toda la altura; el carril de notas que caen llena el
   centro a todo el ancho y el teclado queda fijo abajo, a lo ancho de la pantalla, para ver mejor las notas.

## Causa de la distorsión (investigada)

La vista Aprender enruta el synth **directo al bus maestro** (`setSynthOut(masterDest())` en vivo, y
`triggerPreset(..., masterDest())` en Escuchar), sin la atenuación que sí aplican los canales del Estudio (su
`gain` de volumen ~0.8). Además el preset de piano tiene un **decaimiento largo (~2,8 s)**: al tocar una melodía se
acumulan varias notas sonando a la vez, su suma se dispara y el **limitador + soft-clipper del maestro** satura →
distorsión. Solución: una etapa de ganancia propia de Aprender **antes** del maestro (como el volumen de canal del
Estudio), que baje el nivel y deje headroom.

## Decisiones tomadas (con el usuario)

- **Bus de ganancia de Aprender** con nivel conservador (empezar en **0.3**, ajustable).
- **Sonidos propios del synth** (offline): los 5 actuales + **Guitarra** y **Flauta** nuevos.
- **Teclado a pantalla completa abajo**; carril de notas llenando el centro; altura de teclado generosa (~170px).

## Arquitectura

1. **`audio/synth.ts`:** dos presets nuevos en `SYNTH` (`guitarra`, `flauta`).
2. **`app/learnView.ts`:** bus de ganancia propio (arregla la distorsión) + selector "Instrumento".
3. **`ui/styles.css`:** layout a pantalla completa con el teclado a lo ancho abajo.
4. **Docs + versión 0.47.0.**

### 1. `audio/synth.ts`

Añadir a `SYNTH` (mismo formato que los presets existentes; no tocar `noteOn`/`triggerVoice`):

- `guitarra` (🎸): pulsada, decaimiento medio. Osciladores triángulo + sierras, filtro paso-bajo que baja rápido,
  `sustain:false`, `decay ~1.6`, `peak` moderado.
- `flauta` (🪈): sostenida y suave. Senos + un armónico, `filter:null`, `sustain:true`, `attack ~0.05`,
  `release ~0.15`, vibrato leve.

Valores exactos en el plan. `getPresetNames()` los expondrá automáticamente (también en el selector de sonido del
Estudio — es un extra inofensivo).

### 2. `app/learnView.ts`

- **Bus de ganancia (arreglo de la distorsión):** `const LEARN_GAIN = 0.3;` y `let learnBus: GainNode | null =
  null; function ensureLearnBus(): GainNode` que crea `actx.createGain()` con `gain = LEARN_GAIN`, lo conecta a
  `masterDest()` una vez y lo cachea.
- **Enrutado en vivo:** un helper `learnRoute()` = `setSynthOut(ensureLearnBus()); setPreset(instrument);`. Se
  llama en `handlePlay` (antes de `noteOn`) y en `start()`, para que tanto tocar como reproducir suenen por el bus
  con el instrumento elegido, sin depender de si pulsaste Empezar antes.
- **Escuchar:** `triggerPreset(instrument, n.midi, 0.85, when, n.dur / bps, ensureLearnBus())` (en vez de
  `'piano'` y `masterDest()`).
- **Selector "Instrumento":** `let instrument = 'piano';` + `<select id="lnInst">` poblado con
  `getPresetNames()` (`[clave, etiqueta][]`). Al cambiar: `instrument = value` (se aplica en la siguiente nota vía
  `learnRoute`, y en Escuchar por la variable). En la barra de controles, tras el selector de Canción.
- El resto (niveles, teclado, MIDI, importar) igual.

### 3. `ui/styles.css`

La vista Aprender pasa a ocupar la altura disponible con el teclado abajo a todo el ancho:

- `.lnWrap`: `display:flex; flex-direction:column; min-height: calc(100vh - 64px); box-sizing:border-box`.
- `.lnStage`: quita `max-width:720px`; `flex:1; display:flex; flex-direction:column; min-height:0; width:100%`.
- `.lnLane` (canvas): `flex:1; width:100%; min-height:140px` (crece para llenar; su `height` de dibujo lo fija
  `resize()` desde `clientHeight`). Se quita el `height:260px` fijo.
- `.lnKb .kb`: `max-width:none; margin:0; height:170px` (teclado a lo ancho y más alto).

`resize()` ya toma `clientWidth/clientHeight`, así que con el layout flex el lienzo se ajusta al ancho completo y a
la nueva altura; las notas caen alineadas (comparten `range`/geometría).

### 4. Docs + versión

`studio/package.json` → 0.47.0. Entradas v0.47.0 en `CLAUDE.md` y `HANDOFF.md`.

## Qué NO cambia

- La lógica pedagógica, los niveles, la importación `.mid`, la geometría de teclas, el MIDI, el Estudio y su motor.
  El synth compartido gana 2 presets (extra inofensivo en el Estudio). No se toca `pianova.html`.
- La cadena del maestro (limitador/soft-clipper) sigue igual; solo entra menos nivel desde Aprender.

## Bordes

- **Nivel del bus:** `LEARN_GAIN = 0.3` es un punto de partida; si sigue fuerte, se baja (una constante).
- **Instrumento sostenido (órgano/flauta/cuerda):** su `noteOff` ya libera con su release; el bus no cambia eso.
- **Cambiar de instrumento a media melodía:** las notas ya sonando terminan con su sonido; las siguientes usan el
  nuevo. Aceptable.
- **Volver al Estudio:** el Estudio re-fija `synthOut`/preset en cada nota (`routeKeyboardToSelected`) y su
  secuenciador usa destinos explícitos, así que el `setSynthOut(learnBus)` de Aprender no afecta al Estudio.
- **Altura de la vista:** `min-height: calc(100vh - 64px)` deja el teclado abajo; si el offset no cuadra con la
  cabecera en algún tamaño, es un número a ajustar.

## Pruebas

- **`audio/synth.test.ts` (nuevo):** `SYNTH` incluye `guitarra` y `flauta`; `getPresetNames()` devuelve sus
  etiquetas; cada preset tiene `partials` no vacíos y `peak` de 2 elementos.
- **No unitarias (typecheck + build + a oído/vista):** el piano ya no distorsiona al tocar/reproducir melodías; el
  selector "Instrumento" cambia el sonido (Piano/Órgano/Guitarra/Flauta…); el teclado ocupa el ancho de la pantalla
  abajo y el carril de notas llena el centro; las notas siguen cayendo alineadas sobre su tecla.

## Restricciones globales

- Todo en `studio/`; **no tocar `pianova.html`**. TypeScript strict; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón del tema.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con el trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
