# F4b — Módulo Aprender: importar `.mid` — Diseño

**Fecha:** 2026-07-07 · **Versión objetivo:** 0.45.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Añadir a la vista Aprender un botón **"📂 .mid"** que carga un archivo MIDI del usuario, extrae la **melodía
monofónica** y la añade como una canción más — practicable y "escuchable" igual que las 3 a mano de F4a. Las
canciones importadas **se recuerdan entre sesiones**. Segundo sub-proyecto de F4; el arreglo completo (acordes/dos
manos) y elegir mano quedan para F4c.

## Decisiones tomadas (con el usuario)

- **Escuchar reproduce la melodía** (monofónica), igual que Practicar — consistente con F4a. El arreglo completo
  es F4c.
- **Se persisten** las canciones importadas (localStorage), para que sobrevivan a recargar.
- **Sobrescribir por nombre:** importar un `.mid` con el mismo nombre reemplaza la versión anterior (id derivado
  del nombre).

## Piezas reutilizadas / de referencia

- `learn/song.ts` (F4a): tipos `LearnNote { midi, startBeat, dur, hand? }` y `LearnSong { id, name, bpm, notes }`.
- `pianova.html`: el parser propio probado (`parseMidi`/`pairTrack`/`extractMelodyRaw`) es la **referencia a
  portar** (no se toca `pianova.html`; se reescribe en TypeScript en `learn/midiFile.ts`).
- `app/learnView.ts` (F4a): la vista con el selector de canción y los modos Practicar/Escuchar.
- Patrón de persistencia con `try/catch` de `app/store.ts` (envoltorios finos sobre `localStorage`).

## Arquitectura

1. **`learn/midiFile.ts` (puro):** el parser de Standard MIDI File + extracción de melodía. Sin DOM.
2. **`learn/importedSongs.ts`:** persistencia de las canciones importadas en `localStorage`.
3. **`app/learnView.ts`:** botón 📂 .mid + input de archivo + selector combinado (a mano + importadas).
4. **Docs + versión 0.45.0.**

### 1. `learn/midiFile.ts`

Porta la lógica de `parseMidi` (DataView; cabecera `MThd`, pistas `MTrk`, running status, meta-tempo 0x51,
note on/off, saltar sysex/otros eventos), `pairTrack` (empareja on/off → `{midi, startTick, durTick, vel}`) y
`extractMelodyRaw` (pista con más note-on; en empate de inicio, la nota más aguda; recorta solapes). Añade la
normalización a beats.

```ts
import type { LearnNote } from './song';

// Lee un .mid y devuelve la melodía monofónica normalizada a beats + el tempo. Lanza Error con mensaje claro si
// el archivo no es un MIDI válido o no tiene notas.
export function parseMidiToMelody(buf: ArrayBuffer): { bpm: number; notes: LearnNote[] };
```

Comportamiento:
- Cabecera no `MThd` → `throw new Error('no es un archivo MIDI')`. División SMPTE (`division & 0x8000`) →
  `throw new Error('división SMPTE no soportada')`. Sin notas → `throw new Error('no encontré notas')`.
- `bpm` desde el primer meta-tempo (0x51); por defecto 120; **acotado y redondeado a [40, 240]**.
- Normalización: `offset = min(startTick)` de la melodía; por nota `startBeat = (startTick - offset) / division`,
  `dur = max(0.1, durTick / division)`. Orden por `startBeat`. `hand` queda sin asignar (Practicar la ignora).

### 2. `learn/importedSongs.ts`

```ts
import type { LearnSong } from './song';

// Serializa/parsea la lista de canciones importadas (tolerante: descarta entradas mal formadas).
export function serializeSongs(songs: LearnSong[]): string;
export function parseSongs(json: string | null): LearnSong[];

// Envoltorios de localStorage (clave 'estudio-learn-songs'), con try/catch.
export function loadImported(): LearnSong[];
export function addImported(song: LearnSong): void;   // reemplaza por id (mismo nombre → mismo id) y guarda
```

`parseSongs` valida por entrada: `id`/`name` string, `bpm` number, `notes` array de `{midi, startBeat, dur}`
numéricos; descarta lo que no cumpla. `addImported` sustituye la entrada con el mismo `id` (o la añade) y persiste.

### 3. `app/learnView.ts` (modificar)

- **Estado:** `let imported = loadImported();` y un `allSongs = () => [...SONGS, ...imported]`.
- **Selector por id:** el `<select>` de canción usa `value = song.id`; al cambiar, `song = allSongs().find(s =>
  s.id === value) ?? SONGS[0]`. Un helper `renderSongOptions()` reconstruye las `<option>` (a mano + importadas,
  las importadas con prefijo 🎵) y fija el valor seleccionado.
- **Botón 📂 .mid:** en la barra de controles, un botón `#lnOpenMid` + `<input type="file" accept=".mid,.midi"
  hidden id="lnMidFile">`. Al elegir archivo: `await file.arrayBuffer()` → `parseMidiToMelody(buf)` → construir
  `LearnSong { id: 'mid-' + slug(nombre), name: nombreSinExtensión, bpm, notes }` → `addImported(song)` →
  `imported = loadImported()` → `renderSongOptions()` (selecciona el nuevo id) → recomponer teclado/geometría
  (`range = songRange(song); buildKeyboard(); resize();`) → `reset()`. `slug = nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-')`.
- **Mensajes:** un `<span id="lnMsg">` en la barra muestra "Cargado: <nombre> · N notas" o el error
  (`No pude leer el .mid (<mensaje>)`).
- **Al montar:** `renderSongOptions()` incluye ya las importadas cargadas.

### 4. Docs + versión

`studio/package.json` → 0.45.0. Entradas v0.45.0 en `CLAUDE.md` (cadena de hitos) y `HANDOFF.md`.

## Flujo de datos

Archivo `.mid` → `parseMidiToMelody` (puro) → `LearnSong` → `addImported` (localStorage) + selector → la vista lo
trata como cualquier canción de F4a (Practicar/Escuchar sobre `notes`). Al recargar, `loadImported()` las repone.

## Qué NO cambia

- Los modos Practicar/Escuchar de F4a, la geometría, el teclado, el synth, la convivencia MIDI. F4b solo añade una
  fuente de canciones.
- El Estudio y `pianova.html`. La persistencia de F4b es una clave `localStorage` propia, aparte del proyecto.

## Bordes

- **Archivo no MIDI / vacío / sin notas:** `parseMidiToMelody` lanza; la vista muestra el mensaje y no cambia la
  canción actual.
- **SMPTE:** no soportado (mensaje claro), como en `pianova.html`.
- **Rango del teclado:** `songRange(song)` ajusta el teclado/lienzo a la melodía importada (puede ser ancho).
- **Nombre duplicado:** mismo `slug` → mismo `id` → sobrescribe (sin acumular duplicados).
- **localStorage no disponible / lleno:** los envoltorios usan `try/catch`; si falla el guardado, la canción sigue
  disponible en la sesión pero no persiste (sin romper).
- **Running status / eventos raros:** el parser corta la pista ante un byte inesperado (igual que `pianova.html`),
  sin lanzar por todo el archivo salvo cabecera inválida.

## Pruebas

- **`learn/midiFile.test.ts`:** construir un `.mid` sintético en memoria (cabecera `MThd` + una pista `MTrk` con
  meta-tempo + varias note on/off) y comprobar que `parseMidiToMelody` devuelve el `bpm` esperado y las notas
  (midi/startBeat/dur) normalizadas y ordenadas; que en un acorde (dos on al mismo tick) queda la más aguda
  (monofónico); que recorta solapes; que una cabecera inválida lanza `'no es un archivo MIDI'`; que SMPTE lanza.
- **`learn/importedSongs.test.ts`:** `serializeSongs`/`parseSongs` ida y vuelta; `parseSongs` descarta entradas
  mal formadas y `null`/JSON inválido → `[]`.
- **No unitarias (typecheck + build + a oído/vista):** botón 📂 .mid carga un archivo real, aparece en el selector
  con 🎵, se practica/escucha; recargar la página conserva la importada; un archivo no-MIDI muestra el error.

## Restricciones globales

- Todo en `studio/`; **no tocar `pianova.html`**. TypeScript strict; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón del tema.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con el trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
