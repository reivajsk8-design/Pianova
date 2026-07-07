# F4a — Módulo Aprender: núcleo "Practicar" (+ Escuchar) — Diseño

**Fecha:** 2026-07-07 · **Versión objetivo:** 0.44.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Rellenar la pestaña **Aprender** del Estudio con la función estrella de Pianova: **notas que caen** (estilo
Synthesia) sobre un teclado, con dos modos — **Practicar** (la canción se congela hasta que tocas la nota
correcta) y **Escuchar** (suena sola para oírla) — y **2-3 canciones sencillas escritas a mano**. Se toca por
MIDI, por teclas del ordenador o con el ratón. Es el primer sub-proyecto de F4 (el módulo de aprendizaje); los
siguientes (importar `.mid`, Acompañar/manos, secciones/progreso, Reto) se apoyan en esta base.

## Decisiones tomadas (con el usuario)

- **Modos F4a:** Practicar + Escuchar (Reto y Acompañar llegan en sub-proyectos posteriores).
- **Canciones:** 2-3 a mano (Escala de Do, Estrellita, Oda a la alegría). Importar `.mid` es F4b.
- **Etiquetas:** nombres de nota musicales en español (Do, Re, Mi…) sobre las notas que caen. Se reutiliza
  `noteName` de `daw/scales.ts`.
- **Sonido:** preset **"piano"** del synth existente (offline, sin descargas), al bus maestro.

## Piezas reutilizadas (ya existen en `studio/`)

- `ui/keyboard.ts` → `mountKeyboard(root, { onNoteOn, onNoteOff, lowMidi, highMidi, baseMidi })`: teclado DOM
  clicable + teclas del ordenador. Las teclas llevan `data-midi` (para resaltarlas).
- `midi/input.ts` → `connectMidi({ onNoteOn, onNoteOff, onState })`: todas las entradas MIDI.
- `audio/synth.ts` → `noteOn(midi, vel)`, `noteOff(midi)`, `allNotesOff()`, `setPreset(name)`,
  `setSynthOut(node)`, `triggerPreset(preset, midi, vel, when, dur, dest)`.
- `audio/masterBus.ts` → `masterDest()`. `audio/context.ts` → `ensureAudio()`, `getAudioContext()`.
- `daw/scales.ts` → `noteName(midi)` (español, con octava).
- `app/shell.ts` → ya tiene la pestaña "Aprender" con `#viewLearn` (hoy un placeholder a sustituir).

## Arquitectura

Cuatro piezas nuevas, de más interna a más externa:

1. **`learn/song.ts` (puro):** tipos y las canciones a mano.
2. **`learn/practice.ts` (puro):** la lógica pedagógica (máquina de estados de "esperar a que toques").
3. **`learn/geometry.ts` (puro):** geometría de teclas compartida por las notas que caen y el resaltado.
4. **`app/learnView.ts`:** monta la vista (lienzo de notas + teclado + bucle + sonido + MIDI + controles).
5. **`app/shell.ts`:** sustituye el placeholder por `mountLearnView(...)`. + CSS.

### 1. `learn/song.ts`

```ts
export interface LearnNote { midi: number; startBeat: number; dur: number; hand?: 'L' | 'R' }
export interface LearnSong { id: string; name: string; bpm: number; notes: LearnNote[] }

export const SONGS: LearnSong[];   // 3 canciones (ver abajo)

// Rango de teclas de la canción (para dimensionar el teclado y el lienzo). Con un margen mínimo si es estrecho.
export function songRange(song: LearnSong): { low: number; high: number };
```

Las 3 canciones (Do central = midi 60; todas mano derecha, tempo ~90):

- **Escala de Do:** Do4…Do5 (60,62,64,65,67,69,71,72), una por beat, `dur 1`.
- **Estrellita (Twinkle):** 60 60 67 67 69 69 67(dur2) · 65 65 64 64 62 62 60(dur2), beats consecutivos.
- **Oda a la alegría:** 64 64 65 67 67 65 64 62 60 60 62 64 64(dur1.5) 62(dur0.5) 62(dur2), beats consecutivos.

(Un helper interno tipo `seq(startMidi, [pasos], bpm)` puede construirlas; los valores exactos van en el plan.)

### 2. `learn/practice.ts`

Máquina de estados monofónica portada de la lógica `practice` de `pianova.html`:

```ts
import type { LearnNote } from './song';

export interface PracticeState { notes: LearnNote[]; idx: number; done: boolean; hits: number }
export interface JudgeResult { advanced: boolean; idx: number; done: boolean }

export function makePractice(notes: LearnNote[]): PracticeState;   // idx 0, done = notes.length === 0, hits 0

// Nota objetivo actual (la que hay que tocar), o undefined si terminó.
export function targetNote(s: PracticeState): LearnNote | undefined;

// Juzga una nota tocada. Si `s.done`, no hace nada. Si `midi === notes[idx].midi`: avanza idx, suma hit, marca
// done si llegó al final. Notas equivocadas se ignoran (no penalizan, no avanzan). Muta `s` y devuelve el
// resultado. (Estado transitorio de UI, no persistido.)
export function judge(s: PracticeState, midi: number): JudgeResult;
```

### 3. `learn/geometry.ts`

Fuente de verdad de la posición horizontal de cada tecla, para que las notas caigan justo sobre su columna. Se
calcula igual que el teclado DOM (`ui/keyboard.ts`): blancas repartidas por igual en el ancho; negras encima con
el mismo desfase que su CSS.

```ts
export interface KeyGeom { midi: number; x: number; w: number; black: boolean }

// Disposición de teclas para el rango [low,high] en un ancho `width` px. Blancas: ancho = width/nBlancas,
// x = índiceBlanca·ancho. Negras: x = blancasALaIzquierda·anchoBlanca - anchoBlanca·0.3, w = anchoBlanca·0.6.
export function keyLayout(low: number, high: number, width: number): KeyGeom[];

// Geometría de una tecla concreta dentro de la disposición (o undefined si midi fuera de [low,high]).
export function keyGeomFor(layout: KeyGeom[], midi: number): KeyGeom | undefined;
```

### 4. `app/learnView.ts`

`mountLearnView(root: HTMLElement): void`. Estructura y comportamiento:

- **Layout:** una barra de controles arriba, el **lienzo de notas** (`<canvas>`) en medio, y el **teclado** abajo
  (mismo ancho que el lienzo, mismo borde izquierdo → las columnas coinciden).
- **Controles:** **Modo** (Practicar / Escuchar) · **Canción** (selector con `SONGS`) · **▶ Empezar** /
  **↻ Reiniciar** · un chip de estado MIDI (reutiliza `onState`).
- **Estado interno:** `song`, `mode`, `running`, `songBeat`, `practice` (PracticeState), `lastTs`, `lit` (set de
  teclas encendidas), `raf`.
- **Bucle (`requestAnimationFrame(frame)`):** `frame(ts)` calcula `dt = (ts - lastTs)/1000`.
  - **Practicar:** si NO está esperando (`songBeat < targetNote.startBeat`), `songBeat += dt·(bpm/60)`; al
    alcanzar la nota objetivo, **congela** `songBeat = targetNote.startBeat` y resalta su tecla. Al terminar la
    canción, para.
  - **Escuchar:** `songBeat += dt·(bpm/60)` siempre; cada nota que **cruza** la línea de impacto (su `startBeat`
    quedó entre el beat anterior y el actual) suena con `triggerPreset('piano', midi, vel, cuando, dur, masterDest())`
    y enciende su tecla un instante; al terminar, para.
  - Redibuja el lienzo cada frame (ver **Render**).
- **Tocar (MIDI/teclas/ratón):** un único `handlePlay(midi, vel)`: suena (`noteOn`), enciende la tecla, y en
  **Practicar** llama a `judge`; si avanza, reproduce la nota y descongela. `handleRelease(midi)`: `noteOff` +
  apaga la tecla. El teclado DOM (`mountKeyboard`) y el MIDI (`connectMidi`) comparten estos dos handlers.
- **Sonido:** al **Empezar**, `ensureAudio()`, `setPreset('piano')` y `setSynthOut(masterDest())` (la vista
  Aprender usa el synth compartido con el preset piano hacia el maestro). `allNotesOff()` al reiniciar/cambiar.
- **Render (canvas):** fondo oscuro; **línea de impacto** cerca del borde superior del teclado; `pxPorBeat =
  altoLienzo / LOOKAHEAD` (LOOKAHEAD ≈ 4 beats visibles). Cada nota se dibuja como barra redondeada en
  `x = keyGeomFor(layout, midi).x`, ancho de su tecla, con alto `dur·pxPorBeat` y base en
  `impactoY − (startBeat − songBeat)·pxPorBeat`; encima, su **nombre** (`noteName(midi)` sin octava). La nota
  objetivo (Practicar) se pinta en **verde neón**; las demás, atenuadas. La tecla objetivo se resalta en el
  teclado DOM (clase CSS sobre `[data-midi]`).

### 5. `app/shell.ts`

Sustituir el contenido placeholder de `#viewLearn` por `mountLearnView(learn)` (importando de `./learnView`).
Igual que hoy hace con `mountStudioView(studio)`.

## Flujo de datos

`connectMidi`/`mountKeyboard` → `handlePlay/handleRelease` → synth (sonido) + resaltado + (en Practicar) `judge`.
El bucle rAF avanza `songBeat`, congela en la nota objetivo (Practicar) o autoreproduce (Escuchar), y redibuja el
lienzo usando `learn/geometry` + `learn/song`. Sin persistencia en F4a (el progreso llega en F4d).

## Qué NO cambia

- El Estudio (DAW/groovebox), su motor, efectos, LFOs, etc. La vista Aprender es independiente (otra pestaña).
- `pianova.html`. No hay persistencia nueva ni cambios de proyecto.

## Bordes

- **Audio no iniciado:** el sonido necesita un gesto del usuario; se arranca (`ensureAudio`) al pulsar Empezar.
- **Sin MIDI:** el chip de estado lo indica; se puede practicar con el teclado del ordenador o el ratón.
- **Nota fuera del rango visible:** el rango del teclado/lienzo se ajusta a `songRange(song)` (con un mínimo).
- **Practicar, nota mantenida/repetida:** solo avanza al recibir la nota objetivo; notas erróneas suenan pero no
  avanzan ni penalizan.
- **Cambiar de canción/modo o Reiniciar:** `allNotesOff()`, resetea `songBeat`/`practice`, vuelve a dibujar.
- **Reproducción exacta en Escuchar:** las notas se agendan con el reloj de audio (`getAudioContext().currentTime`)
  para que no dependan de la cadencia del rAF.

## Pruebas

- **`learn/song.test.ts`:** las 3 canciones están bien formadas (notas ordenadas por `startBeat`, `dur > 0`,
  midis en rango de piano); `songRange` da low/high correctos.
- **`learn/practice.test.ts`:** `makePractice` (idx 0, done si vacío); `targetNote`; `judge` avanza con la nota
  correcta, ignora la equivocada, suma hits, marca `done` al final y es no-op tras terminar.
- **`learn/geometry.test.ts`:** `keyLayout` reparte las blancas por igual (x consecutivos), coloca las negras con
  el desfase, marca `black` bien, y cuenta las teclas correctas; `keyGeomFor` encuentra la tecla y devuelve `undefined` fuera de rango.
- **No unitarias (typecheck + build + a oído/vista):** en la pestaña Aprender, elegir canción y **Practicar**:
  las notas caen, se congela en la línea hasta tocar la correcta (MIDI/teclas/ratón), suena a piano y avanza;
  **Escuchar** la reproduce sola encendiendo las teclas; Reiniciar y cambiar de canción funcionan.

## Restricciones globales

- Todo en `studio/`; **no tocar `pianova.html`**. TypeScript strict; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón del tema.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con el trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
