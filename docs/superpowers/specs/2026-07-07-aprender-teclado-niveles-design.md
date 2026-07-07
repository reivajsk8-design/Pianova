# Aprender: teclado más ancho + niveles de dificultad — Diseño

**Fecha:** 2026-07-07 · **Versión objetivo:** 0.46.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Dos mejoras del módulo Aprender, tras probar F4a/F4b:
1. **Teclado más ancho:** hoy se ajusta al rango exacto de la canción (una octava para las 3 de ejemplo). Pasa a
   un teclado fijo cómodo de **~3 octavas (Do3–Do6)** que solo se amplía si una canción se sale de ese rango.
2. **Niveles de dificultad:** cada canción a mano gana un **nivel** (Fácil / Medio / Difícil); un desplegable
   **"Nivel"** filtra la lista, y se amplía el repertorio con melodías conocidas por nivel, para ir progresando
   poco a poco. Todo sigue siendo **solo melodía** (sin acordes).

## Decisiones tomadas (con el usuario)

- **Teclado fijo Do3–Do6** (midi 48–84), ampliable si la canción excede; teclas del ordenador centradas en el Do
  central (base 60).
- **Selector "Nivel"** con **Fácil / Medio / Difícil / Importadas**; filtra el desplegable de canciones.
- Los `.mid` importados van en la opción **Importadas** (siguen recordándose entre sesiones, F4b).
- Solo melodía (sin acordes), como en F4a/F4b.

## Arquitectura

1. **`learn/song.ts`:** `LearnSong` gana `level?: 1 | 2 | 3`; se etiquetan las 3 canciones existentes y se añaden
   melodías nuevas por nivel; helper `songsByLevel(level)`.
2. **`app/learnView.ts`:** rango de teclado fijo; selector "Nivel" + filtrado del listado (a mano por nivel /
   importadas).
3. **Docs + versión 0.46.0.**

### 1. `learn/song.ts`

- `LearnSong` gana `level?: 1 | 2 | 3` (1 = Fácil, 2 = Medio, 3 = Difícil). Las canciones a mano lo fijan; las
  importadas lo omiten (van en el cubo "Importadas", no por nivel).
- Helper: `export function songsByLevel(level: 1 | 2 | 3): LearnSong[]` = `SONGS.filter(s => s.level === level)`.
- **Repertorio** (todas melodía monofónica, mano derecha; el detalle de notas va en el plan):
  - **Fácil (1):** Escala de Do · Estrellita · Martinillo (Frère Jacques) · Oda a la alegría.
  - **Medio (2):** Cumpleaños feliz · Jingle Bells · Noche de paz.
  - **Difícil (3):** Für Elise (motivo) · Minueto en Sol (Bach, apertura).
- `songRange` no cambia.

### 2. `app/learnView.ts`

- **Rango de teclado fijo:** constantes `KB_LOW = 48` (Do3), `KB_HIGH = 84` (Do6). Nuevo helper local
  `keyboardRange(song)` = `{ low: Math.min(KB_LOW, songRange(song).low), high: Math.max(KB_HIGH, songRange(song).high) }`.
  `buildKeyboard` usa ese rango en vez de `songRange(song)`, y `baseMidi = 60` (Do central) recortado al rango
  (`Math.max(low, Math.min(high, 60))`). Las notas que caen siguen usando `keyLayout(range.low, range.high, …)` con
  el mismo rango, así que caen alineadas.
- **Selector "Nivel":** en la barra de controles, antes del selector de Canción, un
  `<select id="lnLevel">` con `Fácil` (value 1) · `Medio` (2) · `Difícil` (3) · `Importadas` (imp). Estado
  `let level: 1 | 2 | 3 | 'imp' = 1`.
- **Filtrado del listado:** `songsForLevel()` devuelve `level === 'imp' ? imported : songsByLevel(level)`.
  `renderSongOptions()` construye las opciones desde `songsForLevel()` (importadas con 🎵) y fija `songSel.value =
  song.id` si la canción actual está en el cubo. Al **cambiar de nivel**: si el cubo tiene canciones, `song =
  cubo[0]`, recomputa teclado/rango y `reset()`; si está vacío (p. ej. Importadas sin ninguna), deja la canción
  actual y muestra el listado vacío.
- **Importar un .mid:** además de añadirlo, cambia el nivel a `'imp'` y refresca, para que quede seleccionado y
  visible en su cubo.
- El resto (Practicar/Escuchar, bucle, MIDI, sonido) igual.

### 3. Docs + versión

`studio/package.json` → 0.46.0. Entradas v0.46.0 en `CLAUDE.md` y `HANDOFF.md`.

## Flujo de datos

Nivel elegido → `songsForLevel()` → opciones del desplegable → canción seleccionada → la vista la practica/escucha
igual. El teclado siempre muestra Do3–Do6 (o más si la canción lo pide), con las notas cayendo alineadas.

## Qué NO cambia

- Los modos Practicar/Escuchar, la lógica pedagógica, la geometría, el synth, el MIDI, la importación de `.mid`
  (F4b). Solo se amplía el teclado y se añade el eje de niveles.
- El Estudio y `pianova.html`.

## Bordes

- **Canción más ancha que Do3–Do6:** el teclado se amplía a su rango (nunca se recorta la canción).
- **Nivel "Importadas" sin ninguna importada:** listado vacío; se mantiene la canción actual (no rompe). Al
  importar un `.mid`, el nivel pasa a Importadas y queda seleccionado.
- **Compatibilidad:** las importadas guardadas en F4b (sin `level`) siguen cargando; `level` es opcional.
- **Base del teclado de ordenador:** Do central (60), recortado al rango, para que A-S-D-F caigan en una zona útil.

## Pruebas

- **`learn/song.test.ts` (ampliar):** todas las canciones a mano tienen `level` 1/2/3; `songsByLevel(1|2|3)`
  devuelve las de ese nivel y hay al menos una por nivel; las canciones nuevas están bien formadas (notas
  ordenadas por `startBeat`, `dur > 0`, midi de piano).
- **No unitarias (typecheck + build + a oído/vista):** el teclado muestra ~3 octavas; el selector "Nivel" filtra
  las canciones (Fácil/Medio/Difícil) y "Importadas" muestra los `.mid`; practicar/escuchar funciona en cada
  nivel; importar un `.mid` lo deja en Importadas seleccionado; una canción que se salga del rango amplía el
  teclado.

## Restricciones globales

- Todo en `studio/`; **no tocar `pianova.html`**. TypeScript strict; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón del tema.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con el trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
