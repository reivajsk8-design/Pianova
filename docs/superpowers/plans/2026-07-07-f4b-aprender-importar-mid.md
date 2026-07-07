# F4b — Módulo Aprender: importar `.mid` — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un botón "📂 .mid" en la vista Aprender que carga un archivo MIDI, extrae la melodía monofónica y la añade como canción practicable/escuchable, recordándola entre sesiones.

**Architecture:** Un parser puro de Standard MIDI File (`learn/midiFile.ts`, portado de `pianova.html`) que devuelve la melodía en beats; una capa de persistencia en localStorage (`learn/importedSongs.ts`); y el cableado en `app/learnView.ts` (botón + selector combinado a-mano + importadas).

**Tech Stack:** TypeScript (strict), Vite, Vitest, DataView. Sin dependencias nuevas.

## Global Constraints

- Todo en `studio/`; **no tocar `pianova.html`**. TypeScript strict; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón del tema.
- Versión objetivo (package.json): **0.45.0**.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con el trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Ejecutar git desde `/c/Pianova` con rutas explícitas (drift de directorio en el shell).

## Mapa de archivos

- `studio/src/learn/midiFile.ts` — **Crea.** Parser SMF + extracción de melodía → beats. (Task 1)
- `studio/src/learn/midiFile.test.ts` — **Crea.** (Task 1)
- `studio/src/learn/importedSongs.ts` — **Crea.** Persistencia localStorage de las canciones importadas. (Task 2)
- `studio/src/learn/importedSongs.test.ts` — **Crea.** (Task 2)
- `studio/src/app/learnView.ts` — **Modifica.** Botón 📂 .mid + selector combinado + import. (Task 3)
- `CLAUDE.md`, `HANDOFF.md`, `studio/package.json` — **Modifica.** Docs + versión 0.45.0. (Task 4)

---

### Task 1: Parser de `.mid` → melodía (`learn/midiFile.ts`)

**Files:**
- Create: `studio/src/learn/midiFile.ts`
- Test: `studio/src/learn/midiFile.test.ts`

**Interfaces:**
- Consumes: `LearnNote` (tipo) de `./song`.
- Produces: `function parseMidiToMelody(buf: ArrayBuffer): { bpm: number; notes: LearnNote[] }`.

- [ ] **Step 1: Escribe el test (falla)**

Crea `studio/src/learn/midiFile.test.ts`. Construye un `.mid` sintético en memoria (cabecera + 1 pista con
meta-tempo 120 bpm y note on/off, incluyendo un acorde en el mismo tick para probar el monofónico):

```ts
import { describe, it, expect } from 'vitest';
import { parseMidiToMelody } from './midiFile';

// Construye un ArrayBuffer de un Standard MIDI File mínimo (formato 0, 1 pista, división 96 ticks/negra).
function buildMidi(): ArrayBuffer {
  const track = [
    0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20,   // tempo 500000us = 120 bpm
    0x00, 0x90, 0x3C, 0x40,                       // t0: note on 60 vel 64
    0x00, 0x90, 0x43, 0x40,                       // t0: note on 67 (acorde: melodía se queda la más aguda)
    0x60, 0x80, 0x3C, 0x00,                       // +96: note off 60
    0x00, 0x80, 0x43, 0x00,                       // t96: note off 67
    0x00, 0x90, 0x3E, 0x40,                       // t96: note on 62
    0x60, 0x80, 0x3E, 0x00,                       // +96: note off 62 (t192)
    0x00, 0xFF, 0x2F, 0x00,                       // fin de pista
  ];
  const header = [
    0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,   // 'MThd' len 6
    0x00, 0x00, 0x00, 0x01, 0x00, 0x60,               // formato 0, 1 pista, división 96
  ];
  const len = track.length;
  const mtrk = [0x4D, 0x54, 0x72, 0x6B, (len >> 24) & 255, (len >> 16) & 255, (len >> 8) & 255, len & 255];
  return new Uint8Array([...header, ...mtrk, ...track]).buffer;
}

describe('parseMidiToMelody', () => {
  it('extrae melodía monofónica normalizada a beats + tempo', () => {
    const { bpm, notes } = parseMidiToMelody(buildMidi());
    expect(bpm).toBe(120);
    expect(notes.length).toBe(2);
    expect(notes[0].midi).toBe(67);          // acorde en t0 → la más aguda
    expect(notes[0].startBeat).toBeCloseTo(0);
    expect(notes[0].dur).toBeCloseTo(1);     // 96 ticks / división 96
    expect(notes[1].midi).toBe(62);
    expect(notes[1].startBeat).toBeCloseTo(1);
    expect(notes[1].dur).toBeCloseTo(1);
  });
  it('lanza con una cabecera que no es MIDI', () => {
    const bad = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
    expect(() => parseMidiToMelody(bad)).toThrow(/no es un archivo MIDI/);
  });
  it('lanza con división SMPTE', () => {
    const smpte = new Uint8Array([
      0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
      0x00, 0x00, 0x00, 0x01, 0xE7, 0x28,   // división con bit alto = SMPTE
    ]).buffer;
    expect(() => parseMidiToMelody(smpte)).toThrow(/SMPTE/);
  });
});
```

- [ ] **Step 2: Corre el test (falla)** — `cd studio && npx vitest run src/learn/midiFile.test.ts` → FAIL (no existe).
- [ ] **Step 3: Implementa `studio/src/learn/midiFile.ts`**

```ts
// studio/src/learn/midiFile.ts
// Parser propio de Standard MIDI File + extracción de la melodía monofónica (portado de pianova.html a TS).
// Sin dependencias ni DOM. `parseMidiToMelody` devuelve la melodía normalizada a beats + el tempo.
import type { LearnNote } from './song';

interface RawEv { tick: number; type: 'on' | 'off'; midi: number; vel?: number }
interface Parsed { division: number; bpm: number; tracks: RawEv[][] }
interface RawNote { midi: number; startTick: number; durTick: number }

function parseMidi(buf: ArrayBuffer): Parsed {
  const dv = new DataView(buf);
  let p = 0;
  const u8 = (): number => dv.getUint8(p++);
  const u16 = (): number => { const v = dv.getUint16(p); p += 2; return v; };
  const u32 = (): number => { const v = dv.getUint32(p); p += 4; return v; };
  const str4 = (): string => { let s = ''; for (let i = 0; i < 4; i++) s += String.fromCharCode(dv.getUint8(p++)); return s; };
  const varlen = (): number => { let v = 0, b: number; do { b = u8(); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };

  if (str4() !== 'MThd') throw new Error('no es un archivo MIDI');
  const headLen = u32();
  u16();                        // formato (no se usa)
  const ntrks = u16();
  const division = u16();
  p = 8 + headLen;
  if (division & 0x8000) throw new Error('división SMPTE no soportada');

  let bpm = 120, tempoSet = false;
  const tracks: RawEv[][] = [];
  for (let t = 0; t < ntrks; t++) {
    if (p + 8 > dv.byteLength) break;
    const id = str4();
    const len = u32();
    const end = Math.min(p + len, dv.byteLength);
    if (id !== 'MTrk') { p = end; continue; }
    let tick = 0, status = 0;
    const ev: RawEv[] = [];
    while (p < end) {
      tick += varlen();
      let st = dv.getUint8(p);
      if (st & 0x80) { p++; if (st < 0xf0) status = st; } else { st = status; }   // running status
      const hi = st & 0xf0;
      if (st === 0xff) {                 // meta
        const type = u8();
        const mlen = varlen();
        if (type === 0x51 && mlen === 3 && !tempoSet) {
          const us = (dv.getUint8(p) << 16) | (dv.getUint8(p + 1) << 8) | dv.getUint8(p + 2);
          if (us > 0) { bpm = 60000000 / us; tempoSet = true; }
        }
        p += mlen;
      } else if (st === 0xf0 || st === 0xf7) {   // sysex
        p += varlen();
      } else if (hi === 0x90) {          // note on (vel 0 = off)
        const midi = u8(), vel = u8();
        ev.push({ tick, type: vel > 0 ? 'on' : 'off', midi, vel });
      } else if (hi === 0x80) {          // note off
        const midi = u8(); u8();
        ev.push({ tick, type: 'off', midi });
      } else if (hi === 0xc0 || hi === 0xd0) { p += 1; }
      else if (hi === 0xa0 || hi === 0xb0 || hi === 0xe0) { p += 2; }
      else break;                        // byte inesperado: cortar pista
    }
    p = end;
    tracks.push(ev);
  }
  return { division: division || 480, bpm, tracks };
}

// Empareja note on/off de una pista → notas con inicio y duración en ticks.
function pairTrack(ev: RawEv[]): RawNote[] {
  const s = ev.slice().sort((a, b) => a.tick - b.tick || (a.type === 'off' ? -1 : 1));
  const open: Record<number, { tick: number }[]> = {};
  const out: RawNote[] = [];
  for (const e of s) {
    if (e.type === 'on') { (open[e.midi] = open[e.midi] || []).push({ tick: e.tick }); }
    else {
      const arr = open[e.midi];
      if (arr && arr.length) { const o = arr.shift() as { tick: number }; out.push({ midi: e.midi, startTick: o.tick, durTick: Math.max(1, e.tick - o.tick) }); }
    }
  }
  return out;
}

// Melodía monofónica: pista con más note-on; en empate de inicio, la nota más aguda; recorta solapes.
function extractMelodyRaw(parsed: Parsed): RawNote[] {
  let best = -1, bestCount = -1;
  for (let i = 0; i < parsed.tracks.length; i++) {
    const c = parsed.tracks[i].reduce((sum, e) => sum + (e.type === 'on' ? 1 : 0), 0);
    if (c > bestCount) { bestCount = c; best = i; }
  }
  if (best < 0 || bestCount === 0) return [];
  const notes = pairTrack(parsed.tracks[best]);
  notes.sort((a, b) => a.startTick - b.startTick || b.midi - a.midi);
  const mono: RawNote[] = [];
  for (const n of notes) {
    const last = mono[mono.length - 1];
    if (last && n.startTick === last.startTick) continue;   // mismo inicio: la más aguda (ya ordenada)
    mono.push(n);
  }
  for (let i = 0; i < mono.length - 1; i++) {                // recortar solapes
    const maxDur = mono[i + 1].startTick - mono[i].startTick;
    if (maxDur > 0 && mono[i].durTick > maxDur) mono[i].durTick = maxDur;
  }
  return mono;
}

// Lee un .mid y devuelve la melodía monofónica normalizada a beats + el tempo (40..240). Lanza si no es válido.
export function parseMidiToMelody(buf: ArrayBuffer): { bpm: number; notes: LearnNote[] } {
  const parsed = parseMidi(buf);
  const mel = extractMelodyRaw(parsed);
  if (!mel.length) throw new Error('no encontré notas');
  const div = parsed.division;
  const offset = Math.min(...mel.map(n => n.startTick));
  const notes: LearnNote[] = mel.map(n => ({
    midi: n.midi,
    startBeat: (n.startTick - offset) / div,
    dur: Math.max(0.1, n.durTick / div),
  })).sort((a, b) => a.startBeat - b.startBeat);
  const bpm = Math.max(40, Math.min(240, Math.round(parsed.bpm || 120)));
  return { bpm, notes };
}
```

- [ ] **Step 4: Corre el test (pasa)** — `cd studio && npx vitest run src/learn/midiFile.test.ts` → PASS.
- [ ] **Step 5: Typecheck + build + commit**

Run: `cd studio && npm run typecheck && npm run build`

```bash
cd /c/Pianova && git add studio/src/learn/midiFile.ts studio/src/learn/midiFile.test.ts && git commit -m "Aprender F4b: parser .mid -> melodia (portado de pianova.html)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Persistencia de canciones importadas (`learn/importedSongs.ts`)

**Files:**
- Create: `studio/src/learn/importedSongs.ts`
- Test: `studio/src/learn/importedSongs.test.ts`

**Interfaces:**
- Consumes: `LearnSong`, `LearnNote` (tipos) de `./song`.
- Produces: `serializeSongs(songs: LearnSong[]): string`; `parseSongs(json: string | null): LearnSong[]`;
  `loadImported(): LearnSong[]`; `addImported(song: LearnSong): void`.

- [ ] **Step 1: Escribe el test (falla)**

Crea `studio/src/learn/importedSongs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeSongs, parseSongs } from './importedSongs';
import type { LearnSong } from './song';

const song: LearnSong = { id: 'mid-x', name: 'X', bpm: 100, notes: [{ midi: 60, startBeat: 0, dur: 1 }] };

describe('importedSongs (serializar/parsear)', () => {
  it('ida y vuelta conserva las canciones', () => {
    expect(parseSongs(serializeSongs([song]))).toEqual([song]);
  });
  it('null o JSON inválido → []', () => {
    expect(parseSongs(null)).toEqual([]);
    expect(parseSongs('no-json')).toEqual([]);
  });
  it('descarta entradas mal formadas', () => {
    const json = JSON.stringify([song, { id: 'malo' }, { id: 'y', name: 'Y', bpm: 90, notes: 'x' }]);
    expect(parseSongs(json)).toEqual([song]);
  });
});
```

- [ ] **Step 2: Corre el test (falla)** — `cd studio && npx vitest run src/learn/importedSongs.test.ts` → FAIL (no existe).
- [ ] **Step 3: Implementa `studio/src/learn/importedSongs.ts`**

```ts
// studio/src/learn/importedSongs.ts
// Persistencia de las canciones .mid importadas en localStorage (clave propia, aparte del proyecto del Estudio).
import type { LearnSong, LearnNote } from './song';

const KEY = 'estudio-learn-songs';

function isNote(n: unknown): n is LearnNote {
  const o = n as Partial<LearnNote> | null;
  return !!o && typeof o.midi === 'number' && typeof o.startBeat === 'number' && typeof o.dur === 'number';
}
function isSong(s: unknown): s is LearnSong {
  const o = s as Partial<LearnSong> | null;
  return !!o && typeof o.id === 'string' && typeof o.name === 'string' && typeof o.bpm === 'number'
    && Array.isArray(o.notes) && o.notes.every(isNote);
}

export function serializeSongs(songs: LearnSong[]): string { return JSON.stringify(songs); }

export function parseSongs(json: string | null): LearnSong[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter(isSong) : [];
  } catch { return []; }
}

export function loadImported(): LearnSong[] {
  try { return parseSongs(localStorage.getItem(KEY)); } catch { return []; }
}

// Añade (o reemplaza por id) una canción importada y persiste. Si localStorage no está, no rompe.
export function addImported(song: LearnSong): void {
  const cur = loadImported().filter(s => s.id !== song.id);
  cur.push(song);
  try { localStorage.setItem(KEY, serializeSongs(cur)); } catch { /* no disponible */ }
}
```

- [ ] **Step 4: Corre el test (pasa)** — `cd studio && npx vitest run src/learn/importedSongs.test.ts` → PASS.
- [ ] **Step 5: Typecheck + build + commit**

Run: `cd studio && npm run typecheck && npm run build`

```bash
cd /c/Pianova && git add studio/src/learn/importedSongs.ts studio/src/learn/importedSongs.test.ts && git commit -m "Aprender F4b: persistencia de canciones importadas (localStorage)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Botón 📂 .mid + selector combinado (`app/learnView.ts`)

**Files:**
- Modify: `studio/src/app/learnView.ts`

**Interfaces:**
- Consumes: `parseMidiToMelody` de `../learn/midiFile` (Task 1); `loadImported`, `addImported` de `../learn/importedSongs` (Task 2); `SONGS`, `songRange`, `LearnSong` de `../learn/song`.

UI/DOM sin tests unitarios; se verifica con typecheck + build + prueba manual.

- [ ] **Step 1: Imports + estado**

En `studio/src/app/learnView.ts`, añade a los imports (junto a `import { SONGS, songRange, type LearnSong } from '../learn/song';`):

```ts
import { parseMidiToMelody } from '../learn/midiFile';
import { loadImported, addImported } from '../learn/importedSongs';
```

Tras `let midiReady = false;` (línea ~37), añade el estado de importadas y el combinador:

```ts
  let imported = loadImported();
  const allSongs = (): LearnSong[] => [...SONGS, ...imported];
```

- [ ] **Step 2: Barra de controles (botón .mid + select vacío + mensaje)**

Sustituye el bloque `<div class="lnBar">…</div>` del `root.innerHTML` por:

```ts
      <div class="lnBar">
        <label class="fld">Modo <select id="lnMode"><option value="practice">Practicar</option><option value="listen">Escuchar</option></select></label>
        <label class="fld">Canción <select id="lnSong"></select></label>
        <button id="lnOpenMid" title="Importar un archivo .mid">📂 .mid</button>
        <input id="lnMidFile" type="file" accept=".mid,.midi" hidden>
        <button id="lnStart">▶ Empezar</button>
        <button id="lnReset">↻ Reiniciar</button>
        <span id="lnMsg" class="lnMsg"></span>
        <span class="lnConn" id="lnConn">MIDI: —</span>
      </div>
```

- [ ] **Step 3: Referencias + `renderSongOptions`**

Junto a las demás referencias (tras `const connEl = ...`), añade:

```ts
  const songSel = root.querySelector('#lnSong') as HTMLSelectElement;
  const msgEl = root.querySelector('#lnMsg') as HTMLElement;
  const midFile = root.querySelector('#lnMidFile') as HTMLInputElement;

  function renderSongOptions(): void {
    songSel.innerHTML = allSongs()
      .map(s => `<option value="${s.id}">${imported.includes(s) ? '🎵 ' : ''}${s.name}</option>`).join('');
    songSel.value = song.id;
  }
```

- [ ] **Step 4: Handler del selector (por id) + importar**

Sustituye el listener actual del `#lnSong` (el bloque `(root.querySelector('#lnSong') as HTMLSelectElement).addEventListener('change', …)`, líneas ~172-175) por el nuevo, que busca por id, y añade el import:

```ts
  songSel.addEventListener('change', () => {
    song = allSongs().find(s => s.id === songSel.value) ?? SONGS[0];
    range = songRange(song); buildKeyboard(); resize(); reset();
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
      song = allSongs().find(x => x.id === id) ?? s;
      renderSongOptions();
      range = songRange(song); buildKeyboard(); resize(); reset();
      msgEl.textContent = `Cargado: ${name} · ${notes.length} notas`;
    } catch (e) {
      msgEl.textContent = 'No pude leer el .mid (' + (e instanceof Error ? e.message : 'error') + ')';
    }
  });
```

- [ ] **Step 5: Rellenar el selector al montar**

Al final de `mountLearnView`, antes de `buildKeyboard(); resize(); draw();`, añade la primera pintura de opciones:

```ts
  renderSongOptions();
  buildKeyboard(); resize(); draw();
```

- [ ] **Step 6: Typecheck + build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: sin errores; build OK. (`npm test` sigue verde; F4b añadió tests en Tasks 1-2.)

- [ ] **Step 7: Prueba manual (dev)**

Run: `cd studio && npm run dev`
En la pestaña Aprender: pulsa 📂 .mid, elige un archivo `.mid` real; aparece en el selector con 🎵 y queda
seleccionado; Practicar/Escuchar funcionan sobre él; recarga la página y sigue en el selector; un archivo que no
sea MIDI muestra "No pude leer el .mid (…)".

- [ ] **Step 8: Commit**

```bash
cd /c/Pianova && git add studio/src/app/learnView.ts && git commit -m "Aprender F4b: boton .mid + selector combinado (a mano + importadas)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Docs + versión 0.45.0

**Files:**
- Modify: `studio/package.json`, `CLAUDE.md`, `HANDOFF.md`

- [ ] **Step 1: Versión** — en `studio/package.json`, `"version": "0.44.0"` → `"version": "0.45.0"`.

- [ ] **Step 2: `CLAUDE.md`** — al final de la cadena de hitos "Rediseño PIANOVA STUDIO", añade con ` · `:

```
· **F4b — Aprender: importar .mid (v0.45.0): botón 📂 .mid que carga un MIDI, extrae la melodía monofónica (parser propio portado) y la añade como canción practicable/escuchable; se recuerdan entre sesiones (localStorage)** (`learn/midiFile.ts` + `learn/importedSongs.ts` + `app/learnView.ts`; solo melodía, el arreglo completo llega en F4c)
```

- [ ] **Step 3: `HANDOFF.md`** — entrada v0.45.0 al inicio del changelog del Estudio (qué hace + archivos + "segundo sub-proyecto de F4; solo melodía").

- [ ] **Step 4: Verificación final + commit**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: todo verde.

```bash
cd /c/Pianova && git add studio/package.json CLAUDE.md HANDOFF.md && git commit -m "Aprender F4b: docs + version 0.45.0

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notas de integración

- **Solo melodía:** la canción importada es la melodía monofónica; Practicar y Escuchar la usan igual que las de
  F4a. El arreglo completo (acordes/manos) es F4c.
- **Persistencia aparte:** clave `localStorage` `estudio-learn-songs`, independiente del proyecto del Estudio.
- **Selector por id:** al combinar canciones a mano + importadas, el `<select>` pasa a usar `value = id` (antes
  índice); el lookup es por id.
- **Sobrescribir por nombre:** `id = 'mid-' + slug(nombre)`, así que reimportar el mismo nombre reemplaza.
