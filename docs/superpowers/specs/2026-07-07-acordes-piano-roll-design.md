# Acordes en el piano-roll (varias notas por paso) — Diseño

**Fecha:** 2026-07-07 · **Versión objetivo:** 0.42.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Permitir **varias notas en la misma columna** del piano-roll (acordes), tanto **dibujando** con el ratón
como **grabando** en vivo con el teclado MIDI. Hoy cada paso guarda una sola nota, así que al tocar/dibujar
un acorde solo queda la última tecla. Afecta a todos los canales **melódicos** (synth, synthx y slicer, que
usan el piano-roll); la **batería** sigue con su rejilla on/off, sin cambios.

## Decisiones tomadas (con el usuario)

- **Modelo aditivo (no reescritura):** el paso conserva su nota actual y gana una lista opcional de notas
  extra. Sin migración de proyectos guardados; batería/slicer/rejilla intactos.
- **Grabación:** "apilar golpe + reemplazar pasada". Las teclas de un mismo acorde (tocadas casi a la vez)
  se apilan en el paso; una pulsación nueva sobre ese paso en otra vuelta del loop **sustituye** el acorde
  anterior (con una ventana de tiempo corta que distingue "mismo golpe" de "pasada nueva").
- **Dibujar:** nota a nota (clic apila; clic sobre una nota la borra; arrastrar el borde ajusta su longitud,
  sin tocar las demás notas de la columna) **más** una **herramienta de acorde**: un selector que coloca un
  acorde común entero de un clic.
- **Acordes ofrecidos** (los más conocidos): — (una nota), Mayor, Menor, 7ª, Maj7, m7, Sus2, Sus4, Dim,
  Aum, 5ª (power).
- **Reproducción:** en cada paso suenan **todas** las notas del acorde, cada una con su propia longitud; el
  "humanize" se aplica igual a todo el acorde (se mantiene compacto).

## Arquitectura

Cinco piezas, de más interna a más externa:

1. **`daw/model.ts`** — tipo `NoteEv`, campo `extra?` en `Step`, y helpers puros `stepNotes`, `paintNote`
   (reescrito, consciente de acordes), `removeNote`.
2. **`daw/chords.ts` (nuevo)** — tabla `CHORDS` de acordes comunes y `chordNotes(root, type)`. Puro, testeable.
3. **`ui/pianoRoll.ts`** — render y edición por nota (no por columna): dibujar barras de cada nota del acorde,
   detectar la nota bajo el puntero, y selector de acorde en la barra de herramientas.
4. **`app/studioView.ts`** — reproducción (`onStep`) que dispara todas las notas del paso; grabación
   (`recordStep`) con la lógica apilar/reemplazar; cableado del piano-roll (`onPaint`/`onClear`).
5. **`app/store.ts`** — sin cambios funcionales (el campo `extra` viaja en el JSON tal cual); confirmar que
   los proyectos viejos y nuevos se cargan.

### 1. Modelo de datos (`daw/model.ts`)

```ts
export interface NoteEv { note: number; vel?: number; len?: number }
export interface Step { on: boolean; note?: number; vel?: number; len?: number; extra?: NoteEv[] }
```

**Invariante:** `extra` solo existe cuando el paso está activo (`on` con `note`); un paso apagado no lleva
`extra`. La nota "raíz" (`note`/`vel`/`len`) es la primera del acorde; `extra` son las demás. Esta asimetría
(raíz + extras) es el precio de no migrar; queda contenida en los tres helpers siguientes.

```ts
// Todas las notas del paso (raíz primero si `on`), como NoteEv[]. [] si el paso está apagado o vacío.
export function stepNotes(st: Step | undefined): NoteEv[]

// Coloca/actualiza la nota `note` (longitud `len` en pasos; `vel` opcional) en el paso `start` del canal en
// el patrón ACTUAL, SIN tocar las otras notas de la columna:
//  - si el paso está vacío → `note` es la raíz;
//  - si el paso ya tiene notas y `note` no está → se añade a `extra`;
//  - si `note` ya está (raíz o extra) → se actualiza su longitud (y `vel` si se pasa).
// Además, para esa MISMA tecla, limpia sus apariciones en los pasos start+1 … start+L-1 (evita que una nota
// larga se solape/retrigger consigo misma). NUNCA borra otras teclas. Inmutable.
export function paintNote(daw: DawState, chId: string, start: number, len: number, note: number, vel?: number): DawState

// Quita la tecla `note` del paso `i`. Si era la raíz y hay extras, asciende la primera extra a raíz; si no
// queda ninguna nota → el paso queda apagado (`{on:false}`, sin `extra`). Inmutable.
export function removeNote(daw: DawState, chId: string, i: number, note: number): DawState
```

`stepNotes` centraliza "dame todas las notas de este paso" para que reproducción y piano-roll no repitan la
lógica raíz+extras.

**Longitud por nota:** cada `NoteEv` lleva su `len`. La longitud es un **gate** al disparar (no "ocupa"
columnas de otras teclas). Por eso `paintNote` solo limpia solapes de la **misma** tecla, no la columna
entera (que es justo lo que hoy borraba el acorde en el `paintNote` monofónico).

### 2. Acordes (`daw/chords.ts`, nuevo)

```ts
export interface ChordDef { label: string; intervals: number[] }

// Intervalos en semitonos desde la raíz. 'none' = una sola nota.
export const CHORDS: Record<string, ChordDef> = {
  none:  { label: '—',     intervals: [0] },
  maj:   { label: 'Mayor', intervals: [0, 4, 7] },
  min:   { label: 'Menor', intervals: [0, 3, 7] },
  dom7:  { label: '7ª',    intervals: [0, 4, 7, 10] },
  maj7:  { label: 'Maj7',  intervals: [0, 4, 7, 11] },
  min7:  { label: 'm7',    intervals: [0, 3, 7, 10] },
  sus2:  { label: 'Sus2',  intervals: [0, 2, 7] },
  sus4:  { label: 'Sus4',  intervals: [0, 5, 7] },
  dim:   { label: 'Dim',   intervals: [0, 3, 6] },
  aug:   { label: 'Aum',   intervals: [0, 4, 8] },
  power: { label: '5ª',    intervals: [0, 7] },
};

// Notas MIDI del acorde a partir de `root`, recortadas a 0..127 y sin duplicados. Tipo desconocido → [root].
export function chordNotes(root: number, type: string): number[]
```

### 3. Piano-roll (`ui/pianoRoll.ts`)

Pasa de "una nota por columna" a "varias notas por columna". Los cambios:

- **`noteBars(midi)`** e **`headAt(midi, posX)`**: en vez de mirar `st.note === midi`, buscan si la tecla
  `midi` está entre `stepNotes(st)` y usan la longitud **de esa nota** (`ev.len`) para la barra. Una nota de
  tono `midi` "empieza" en el paso `i` donde está guardada.
- **Colocar (clic en hueco):** si el selector de acorde está en "—", coloca una sola nota (`onPaint`). Si hay
  un acorde activo, expande con `chordNotes(midi, tipo)` y llama a `onPaint` **una vez por cada nota** del
  acorde (todas de longitud 1), recortando al rango del canal.
- **Borrar (clic sobre una nota):** `onClear(headIndex, midi)` — ahora pasa **también la tecla**, para quitar
  solo esa nota del acorde (antes apagaba el paso entero).
- **Redimensionar (arrastrar el borde):** por nota, como hoy; con acorde activo, arrastrar sigue afectando a
  una sola nota (el acorde solo se coloca con un clic simple en hueco).
- **Barra de herramientas:** nuevo `<select>` "Acorde" con las opciones de `CHORDS` (persistido en el estado
  local del piano-roll, no en el proyecto). El texto de ayuda (`prHint`) menciona el selector.

**Cambio de interfaz del componente** (lo consume `studioView`):

```ts
onPaint: (start: number, len: number, midi: number) => void;   // igual que hoy (una nota); el acorde se
                                                                //  expande dentro del piano-roll en varias llamadas
onClear: (headIndex: number, midi: number) => void;            // AÑADE `midi`: borra esa nota concreta
```

### 4. Vista/estudio (`app/studioView.ts`)

- **`onPaint`** → `daw = paintNote(daw, selectedId, off + start, len, midi)`.
- **`onClear`** → `daw = removeNote(daw, selectedId, off + headIndex, midi)`.
- **`onStep` (reproducción):** por cada canal audible y paso activo, `const notes = stepNotes(st)`; si vacío,
  seguir. Calcular el desvío de humanize **una vez** por paso (mismo `dt`/`dvel` para todo el acorde) y luego,
  para cada `ev` de `notes`: `gate = kind==='drum' ? undefined : clamp(ev.len ?? 1, …) * secPerStep`;
  `vel = ev.vel ?? SEQ_VEL` ajustado por humanize; `audio.trigger(ev.note, vel, at, gate)`. El destello del
  pad y el `sliceHits` se calculan una vez por paso (usando la primera nota).
- **`recordStep` (grabación apilar/reemplazar):** estado nuevo en el cierre: `recLastStep: number | null` y
  `recLastAt: number` (tiempo de audio). Al grabar una nota `m` (vel `v`) en el paso `step`:
  - `now = getAudioContext()?.currentTime ?? 0`.
  - `sameStrike = recLastStep === step && (now - recLastAt) < CHORD_WINDOW` (`CHORD_WINDOW = 0.06` s).
  - `sameStrike` → **apilar**: `daw = paintNote(daw, selectedId, step, 1, m, v)`.
  - si no → **reemplazar**: `daw = setStep(daw, selectedId, step, { on: true, note: m, vel: v })` (borra el
    acorde previo de ese paso; el `extra` desaparece).
  - `recLastStep = step; recLastAt = now`.
  - `recLastStep` se resetea a `null` al iniciar/parar la grabación y en "Nuevo".

### 5. Persistencia (`app/store.ts`)

Sin cambios de lógica: `extra` es un campo más del `Step` y se serializa/deserializa con el patrón. Los
proyectos **v3 antiguos** (sin `extra`) se cargan como monofónicos; los nuevos con acordes se guardan y
releen igual. **No se sube la versión del proyecto** (sigue en 3) ni hay función de migración. Se añade un
test que confirma el viaje de ida y vuelta de un paso con `extra`.

## Qué NO cambia

- La batería (rejilla on/off, `toggleStep`, `mountStepGrid`) y el resto del secuenciador (subdivisión por
  canal, longitud por páginas, swing, patrones, song mode).
- El motor de audio, los efectos, el mezclador, los medidores.
- El formato ni la versión del proyecto (v3). Los proyectos existentes siguen abriéndose.

## Bordes

- **Nota fuera de rango al expandir un acorde:** `chordNotes` recorta a 0..127; una nota que se saldría se
  omite (el acorde queda incompleto pero no rompe).
- **Reemplazo vs apilado en la grabación:** con `CHORD_WINDOW = 0.06` s, un acorde tocado a la vez apila;
  volver a tocar en el mismo paso "más tarde" (siguiente vuelta) reemplaza. Un trémolo muy rápido sobre el
  mismo paso podría apilarse; es aceptable.
- **Borrar la raíz de un acorde:** `removeNote` asciende la primera `extra` a raíz para no perder el resto.
- **Slicer con acorde:** cada nota del paso dispara su slice; suenan varios slices a la vez (deseable). El
  resalte visual del slice usa la primera nota.
- **Humanize:** se aplica el mismo desvío a todas las notas del paso, para que el acorde no se desparrame.

## Pruebas

- **`daw/model.test.ts`:** `stepNotes` (paso vacío → []; mono → 1; con `extra` → raíz + extras en orden);
  `paintNote` apila una segunda tecla sin borrar la primera, actualiza la longitud si la tecla ya está, y
  limpia solo la misma tecla en el rango; `removeNote` quita una extra, y al quitar la raíz asciende una extra
  (o apaga el paso si era la única).
- **`daw/chords.test.ts`:** `chordNotes` para mayor/menor/7ª (intervalos correctos), recorte a 0..127, y
  `none` → una nota.
- **`app/store.test.ts`:** un paso con `extra` sobrevive a `serializeProject`/`parseProject`.
- **No unitarias (typecheck + build + a oído/vista):** dibujar un acorde nota a nota y con el selector; grabar
  un acorde con el teclado (queda completo); una nota larga en una tecla no borra las demás de la columna;
  borrar una nota del acorde deja el resto.

## Restricciones globales

- Todo en `studio/`; **no tocar `pianova.html`**. TypeScript strict; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón del tema.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con el trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
