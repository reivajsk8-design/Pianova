# Aprender: teclado más ancho + niveles de dificultad — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un teclado fijo de ~3 octavas en la vista Aprender y un selector "Nivel" (Fácil/Medio/Difícil/Importadas) que filtra un repertorio ampliado de melodías por dificultad.

**Architecture:** `learn/song.ts` gana `level` en `LearnSong`, más melodías por nivel y `songsByLevel`; `app/learnView.ts` usa un rango de teclado fijo (Do3–Do6, ampliable) y un selector de nivel que filtra el desplegable de canciones.

**Tech Stack:** TypeScript (strict), Vite, Vitest. Sin dependencias nuevas.

## Global Constraints

- Todo en `studio/`; **no tocar `pianova.html`**. TypeScript strict; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón del tema.
- Versión objetivo (package.json): **0.46.0**.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con el trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Ejecutar git desde `/c/Pianova` con rutas explícitas (drift de directorio en el shell).

## Mapa de archivos

- `studio/src/learn/song.ts` — **Modifica.** `level` en `LearnSong`, repertorio ampliado, `songsByLevel`. (Task 1)
- `studio/src/learn/song.test.ts` — **Modifica.** Tests de nivel. (Task 1)
- `studio/src/app/learnView.ts` — **Modifica.** Teclado fijo + selector "Nivel" + filtrado. (Task 2)
- `CLAUDE.md`, `HANDOFF.md`, `studio/package.json` — **Modifica.** Docs + versión 0.46.0. (Task 3)

---

### Task 1: Niveles + repertorio ampliado (`learn/song.ts`)

**Files:**
- Modify: `studio/src/learn/song.ts`
- Test: `studio/src/learn/song.test.ts`

**Interfaces:**
- Produces: `LearnSong` gana `level?: 1 | 2 | 3`; `SONGS` ampliado; `function songsByLevel(level: 1 | 2 | 3): LearnSong[]`.

- [ ] **Step 1: Amplía el test (falla)**

En `studio/src/learn/song.test.ts`, añade `songsByLevel` al import y estos casos dentro del `describe`:

```ts
import { SONGS, songRange, songsByLevel } from './song';
```

```ts
  it('todas las canciones a mano tienen nivel 1, 2 o 3', () => {
    for (const s of SONGS) expect([1, 2, 3]).toContain(s.level);
  });
  it('songsByLevel filtra por nivel y hay al menos una por nivel', () => {
    for (const lvl of [1, 2, 3] as const) {
      const list = songsByLevel(lvl);
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.every(s => s.level === lvl)).toBe(true);
    }
  });
```

- [ ] **Step 2: Corre el test (falla)** — `cd studio && npx vitest run src/learn/song.test.ts` → FAIL (no existe `songsByLevel`; `level` undefined).

- [ ] **Step 3: Implementa en `studio/src/learn/song.ts`**

Añade `level` a la interfaz `LearnSong`:

```ts
export interface LearnSong { id: string; name: string; bpm: number; level?: 1 | 2 | 3; notes: LearnNote[] }
```

Sustituye la constante `SONGS` por el repertorio ampliado con niveles (todas melodía monofónica, mano derecha):

```ts
export const SONGS: LearnSong[] = [
  // --- Fácil (nivel 1) ---
  { id: 'escala-do', name: 'Escala de Do', bpm: 90, level: 1,
    notes: seq([60, 62, 64, 65, 67, 69, 71, 72].map(m => q(m))) },
  { id: 'estrellita', name: 'Estrellita', bpm: 100, level: 1,
    notes: seq([q(60), q(60), q(67), q(67), q(69), q(69), q(67, 2), q(65), q(65), q(64), q(64), q(62), q(62), q(60, 2)]) },
  { id: 'martinillo', name: 'Martinillo', bpm: 100, level: 1,
    notes: seq([
      q(60), q(62), q(64), q(60), q(60), q(62), q(64), q(60),
      q(64), q(65), q(67, 2), q(64), q(65), q(67, 2),
      q(67), q(69), q(67), q(65), q(64), q(60), q(67), q(69), q(67), q(65), q(64), q(60),
      q(60), q(55), q(60, 2), q(60), q(55), q(60, 2),
    ]) },
  { id: 'oda-alegria', name: 'Oda a la alegría', bpm: 100, level: 1,
    notes: seq([q(64), q(64), q(65), q(67), q(67), q(65), q(64), q(62), q(60), q(60), q(62), q(64), q(64, 1.5), q(62, 0.5), q(62, 2)]) },
  // --- Medio (nivel 2) ---
  { id: 'cumpleanos', name: 'Cumpleaños feliz', bpm: 100, level: 2,
    notes: seq([
      q(67, 0.5), q(67, 0.5), q(69), q(67), q(72), q(71, 2),
      q(67, 0.5), q(67, 0.5), q(69), q(67), q(74), q(72, 2),
      q(67, 0.5), q(67, 0.5), q(79), q(76), q(72), q(71), q(69),
      q(77, 0.5), q(77, 0.5), q(76), q(72), q(74), q(72, 2),
    ]) },
  { id: 'jingle-bells', name: 'Jingle Bells', bpm: 120, level: 2,
    notes: seq([
      q(64), q(64), q(64, 2), q(64), q(64), q(64, 2),
      q(64), q(67), q(60), q(62), q(64, 2),
      q(65), q(65), q(65), q(65), q(65), q(64), q(64), q(64),
      q(64), q(62), q(62), q(64), q(62, 2), q(67, 2),
    ]) },
  { id: 'noche-paz', name: 'Noche de paz', bpm: 90, level: 2,
    notes: seq([
      q(67, 1.5), q(69, 0.5), q(67), q(64, 3),
      q(67, 1.5), q(69, 0.5), q(67), q(64, 3),
      q(74, 2), q(74), q(71, 3), q(72, 2), q(72), q(67, 3),
    ]) },
  // --- Difícil (nivel 3) ---
  { id: 'fur-elise', name: 'Für Elise', bpm: 80, level: 3,
    notes: seq([
      q(76, 0.5), q(75, 0.5), q(76, 0.5), q(75, 0.5), q(76, 0.5), q(71, 0.5), q(74, 0.5), q(72, 0.5), q(69, 1),
      q(60, 0.5), q(64, 0.5), q(69, 0.5), q(71, 1),
      q(64, 0.5), q(68, 0.5), q(71, 0.5), q(72, 1),
    ]) },
  { id: 'minueto-sol', name: 'Minueto en Sol', bpm: 110, level: 3,
    notes: seq([
      q(74, 2), q(67), q(69), q(71), q(72), q(74),
      q(67, 2), q(67, 2),
      q(76, 2), q(72), q(74), q(76), q(78), q(79),
      q(67, 2), q(67, 2),
    ]) },
];

// Canciones a mano de un nivel de dificultad (1 Fácil, 2 Medio, 3 Difícil).
export function songsByLevel(level: 1 | 2 | 3): LearnSong[] {
  return SONGS.filter(s => s.level === level);
}
```

- [ ] **Step 4: Corre el test (pasa)** — `cd studio && npx vitest run src/learn/song.test.ts` → PASS.
- [ ] **Step 5: Typecheck + suite + build + commit**

Run: `cd studio && npm run typecheck && npm test && npm run build`

```bash
cd /c/Pianova && git add studio/src/learn/song.ts studio/src/learn/song.test.ts && git commit -m "Aprender: niveles de dificultad + repertorio ampliado (Facil/Medio/Dificil)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Teclado fijo + selector "Nivel" (`app/learnView.ts`)

**Files:**
- Modify: `studio/src/app/learnView.ts`

**Interfaces:**
- Consumes: `songsByLevel` de `../learn/song` (Task 1); `songRange`, `SONGS`, `LearnSong` (ya importados).

UI/DOM sin tests unitarios; se verifica con typecheck + build + prueba manual.

- [ ] **Step 1: Import + constantes + estado**

En `studio/src/app/learnView.ts`, amplía el import de `../learn/song` para incluir `songsByLevel`:

```ts
import { SONGS, songRange, songsByLevel, type LearnSong } from '../learn/song';
```

Añade las constantes del teclado justo antes de `export function mountLearnView` (nivel de módulo):

```ts
const KB_LOW = 48, KB_HIGH = 84;   // Do3..Do6: teclado fijo cómodo (se amplía si la canción se sale)
```

Dentro de `mountLearnView`, junto al estado (tras `let range = ...`), añade el nivel y el helper de rango de teclado. Cambia también la inicialización de `range` para usar el rango de teclado:

```ts
  let level: 1 | 2 | 3 | 'imp' = 1;
  function keyboardRange(s: LearnSong): { low: number; high: number } {
    const r = songRange(s);
    return { low: Math.min(KB_LOW, r.low), high: Math.max(KB_HIGH, r.high) };
  }
```

Y sustituye la línea `let range = songRange(song);` por:

```ts
  let range = keyboardRange(song);
```

- [ ] **Step 2: Barra con el selector "Nivel"**

En el `root.innerHTML`, dentro de `<div class="lnBar">`, añade el selector de Nivel **antes** del de Canción:

```ts
        <label class="fld">Nivel <select id="lnLevel"><option value="1">Fácil</option><option value="2">Medio</option><option value="3">Difícil</option><option value="imp">Importadas</option></select></label>
        <label class="fld">Canción <select id="lnSong"></select></label>
```

- [ ] **Step 3: Referencia + `songsForLevel` + `renderSongOptions`**

Añade la referencia (junto a `songSel`/`msgEl`/`midFile`):

```ts
  const levelSel = root.querySelector('#lnLevel') as HTMLSelectElement;
```

Añade el helper de cubo por nivel y actualiza `renderSongOptions` para filtrar por nivel (importadas con 🎵):

```ts
  function songsForLevel(): LearnSong[] {
    return level === 'imp' ? imported : songsByLevel(level);
  }
```

Sustituye la función `renderSongOptions` existente por:

```ts
  function renderSongOptions(): void {
    songSel.innerHTML = songsForLevel()
      .map(s => `<option value="${s.id}">${level === 'imp' ? '🎵 ' : ''}${s.name}</option>`).join('');
    songSel.value = song.id;
  }
```

- [ ] **Step 4: `buildKeyboard` con base en el Do central**

En `buildKeyboard`, fija `baseMidi` al Do central recortado al rango (para que A-S-D-F caigan en una zona útil):

```ts
    kbCleanup = mountKeyboard(kbHost, {
      lowMidi: range.low, highMidi: range.high, baseMidi: Math.max(range.low, Math.min(range.high, 60)),
      onNoteOn: (m, v) => { if (root.hidden) return; handlePlay(m, v); },
      onNoteOff: (m) => handleRelease(m),
    });
```

- [ ] **Step 5: Handlers (nivel, canción por cubo, importar con salto a Importadas)**

Sustituye el listener del `#lnSong` (el bloque `songSel.addEventListener('change', …)`) y el bloque de importación por esto, y añade el listener del `#lnLevel` justo antes:

```ts
  levelSel.addEventListener('change', () => {
    const v = levelSel.value;
    level = v === 'imp' ? 'imp' : (Number(v) as 1 | 2 | 3);
    const list = songsForLevel();
    if (list.length) { song = list[0]; range = keyboardRange(song); buildKeyboard(); resize(); reset(); }
    renderSongOptions();
  });
  songSel.addEventListener('change', () => {
    song = songsForLevel().find(s => s.id === songSel.value) ?? song;
    range = keyboardRange(song); buildKeyboard(); resize(); reset();
  });
  (root.querySelector('#lnOpenMid') as HTMLButtonElement).addEventListener('click', () => midFile.click());
  midFile.addEventListener('change', async () => {
    const file = midFile.files && midFile.files[0]; if (!file) return;
    midFile.value = '';
    try {
      const buf = await file.arrayBuffer();
      const { bpm, notes } = parseMidiToMelody(buf);
      const name = file.name.replace(/\.midi?$/i, '');
      const id = 'mid-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const s: LearnSong = { id, name, bpm, notes };
      addImported(s); imported = loadImported();
      level = 'imp'; levelSel.value = 'imp';
      song = songsForLevel().find(x => x.id === id) ?? s;
      renderSongOptions();
      range = keyboardRange(song); buildKeyboard(); resize(); reset();
      msgEl.textContent = `Cargado: ${name} · ${notes.length} notas`;
    } catch (e) {
      msgEl.textContent = 'No pude leer el .mid (' + (e instanceof Error ? e.message : 'error') + ')';
    }
  });
```

(Comprueba que NO queda el listener antiguo del `#lnSong` ni el bloque de importación anterior — se reemplazan por completo por el de arriba.)

- [ ] **Step 6: Typecheck + build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: sin errores; build OK. (`npm test` sigue verde; los tests de nivel se añadieron en Task 1.)

- [ ] **Step 7: Prueba manual (dev)**

Run: `cd studio && npm run dev`
En la pestaña Aprender: el teclado muestra ~3 octavas (Do3–Do6); el selector **Nivel** filtra las canciones
(Fácil → Escala/Estrellita/Martinillo/Oda; Medio → Cumpleaños/Jingle/Noche de paz; Difícil → Für Elise/Minueto);
**Importadas** muestra tus `.mid`; practicar/escuchar funciona en cada uno; importar un `.mid` salta a Importadas y
lo deja seleccionado.

- [ ] **Step 8: Commit**

```bash
cd /c/Pianova && git add studio/src/app/learnView.ts && git commit -m "Aprender: teclado fijo ~3 octavas + selector de Nivel (filtra el repertorio)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Docs + versión 0.46.0

**Files:**
- Modify: `studio/package.json`, `CLAUDE.md`, `HANDOFF.md`

- [ ] **Step 1: Versión** — en `studio/package.json`, `"version": "0.45.0"` → `"version": "0.46.0"`.

- [ ] **Step 2: `CLAUDE.md`** — al final de la cadena de hitos "Rediseño PIANOVA STUDIO", añade con ` · `:

```
· **Aprender: teclado ancho + niveles (v0.46.0): el teclado de la vista Aprender es fijo de ~3 octavas (Do3–Do6, se amplía si la canción se sale) y un selector "Nivel" (Fácil/Medio/Difícil/Importadas) filtra un repertorio ampliado de melodías conocidas por dificultad** (`learn/song.ts` `level`/`songsByLevel` + más melodías + `app/learnView.ts`; solo melodía)
```

- [ ] **Step 3: `HANDOFF.md`** — entrada v0.46.0 al inicio del changelog del Estudio (qué hace + archivos).

- [ ] **Step 4: Verificación final + commit**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: todo verde.

```bash
cd /c/Pianova && git add studio/package.json CLAUDE.md HANDOFF.md && git commit -m "Aprender: docs + version 0.46.0

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notas de integración

- **Teclado fijo:** Do3–Do6 (48–84); `keyboardRange(song)` lo amplía si la canción excede. Notas que caen y
  teclado comparten `range`, así que siguen alineados.
- **Niveles:** `LearnSong.level` (1/2/3) solo en las de a mano; las importadas van en el cubo "Importadas".
  `level` es opcional → las importadas de F4b (sin nivel) siguen cargando.
- **Solo melodía:** sin acordes, como F4a/F4b. El arreglo completo y elegir mano siguen siendo F4c.
