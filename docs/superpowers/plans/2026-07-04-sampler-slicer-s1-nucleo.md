# Sampler/Simpler con slicing · Sub-tanda S1 (núcleo) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un canal `slicer`: importar un audio, trocearlo en slices (por transitorios o en N iguales), mapear cada slice a una nota y dispararlo desde el secuenciador y el teclado, con un editor básico en la pestaña SAMPLES y persistencia.

**Architecture:** DSP puro de troceado (`daw/slicing.ts`: marcas iguales/transitorios, tipos `SliceDef`, mapeo nota→slice) separado y testeado; un almacén de audios (`audio/sampleStore.ts`, base64 puro testeado + decodificación); un motor de reproducción de slices (`audio/slicer.ts`); el modelo gana el `kind` `slicer` y el canal lo despacha; la pestaña SAMPLES muestra un editor (`ui/sampleEditor.ts`) con onda + marcas + troceado + probar; persistencia de los samples en el proyecto.

**Tech Stack:** Vite + TypeScript (strict) + Vitest. Web Audio API. Sin framework de UI. Textos/comentarios en español.

## Global Constraints

- Todo el trabajo va en `studio/` (NO tocar `pianova.html`).
- TypeScript **strict**; sin dependencias nuevas de instalación.
- Comentarios y textos de interfaz **en español**.
- El audio arranca tras gesto (`ensureAudio()`); `exponentialRampToValueAtTime` **nunca** a 0 (mín `0.0001`).
- Lógica pura (slicing, base64, mapeo nota→slice) separada del audio/DOM y testeada.
- Disparo agendado con `when` hacia el `instrumentBus` del canal, como synth/drum/synthx.
- Audios ≤ `SAMPLE_MAX` (1.500.000 bytes) se persisten en base64; los grandes solo en sesión.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Comandos siempre desde `studio/`.

---

### Task 1: DSP de troceado (`daw/slicing.ts`)

**Files:**
- Create: `studio/src/daw/slicing.ts`
- Test: `studio/src/daw/slicing.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `interface SliceDef { start:number; end:number; gain:number; reverse:boolean; fadeIn:number; fadeOut:number }`
  - `equalSlices(durationSec:number, n:number): number[]` — n marcas de inicio equiespaciadas desde 0.
  - `detectOnsets(pcm:Float32Array, sampleRate:number, opts?:{win?:number;hop?:number;threshold?:number;minGapSec?:number}): number[]` — marcas (seg) por energía; siempre incluye 0.
  - `marksToSlices(marks:number[], durationSec:number): SliceDef[]` — construye slices contiguos desde marcas (defaults gain 1, reverse false, fades 0).
  - `sliceIndexForNote(base:number, count:number, midi:number): number` — `midi-base` si está en `[0,count)`, si no `-1`.

- [ ] **Step 1: Write the failing test**

```ts
// studio/src/daw/slicing.test.ts
import { describe, it, expect } from 'vitest';
import { equalSlices, detectOnsets, marksToSlices, sliceIndexForNote } from './slicing';

describe('slicing', () => {
  it('equalSlices da n marcas de inicio equiespaciadas', () => {
    expect(equalSlices(4, 4)).toEqual([0, 1, 2, 3]);
    expect(equalSlices(1, 1)).toEqual([0]);
  });

  it('marksToSlices crea slices contiguos con defaults', () => {
    const s = marksToSlices([0, 1, 2], 3);
    expect(s.length).toBe(3);
    expect(s[0]).toEqual({ start: 0, end: 1, gain: 1, reverse: false, fadeIn: 0, fadeOut: 0 });
    expect(s[2].end).toBe(3);           // el último llega hasta la duración
  });

  it('marksToSlices ordena, fuerza el 0 y descarta fuera de rango', () => {
    const s = marksToSlices([2, 0.5, -1, 5], 3);   // dur 3: descarta -1 y 5
    expect(s.map(x => x.start)).toEqual([0, 0.5, 2]);
  });

  it('detectOnsets encuentra los golpes (además del 0)', () => {
    const sr = 8000; const pcm = new Float32Array(sr * 2);   // 2 s de silencio
    for (let k = 0; k < 500; k++) { pcm[Math.floor(0.5 * sr) + k] = 0.8; pcm[Math.floor(1.2 * sr) + k] = 0.8; }
    const m = detectOnsets(pcm, sr);
    expect(m[0]).toBe(0);
    expect(m.some(x => Math.abs(x - 0.5) < 0.06)).toBe(true);
    expect(m.some(x => Math.abs(x - 1.2) < 0.06)).toBe(true);
  });

  it('sliceIndexForNote mapea nota→índice y acota', () => {
    expect(sliceIndexForNote(60, 4, 60)).toBe(0);
    expect(sliceIndexForNote(60, 4, 63)).toBe(3);
    expect(sliceIndexForNote(60, 4, 64)).toBe(-1);
    expect(sliceIndexForNote(60, 4, 59)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd studio && npm test -- slicing`
Expected: FAIL (no existe `./slicing`).

- [ ] **Step 3: Write minimal implementation**

```ts
// studio/src/daw/slicing.ts
// Troceado de audio (puro): marcas iguales / por transitorios, y utilidades de slices. Sin audio ni DOM.

export interface SliceDef {
  start: number; end: number;   // segundos dentro del buffer
  gain: number; reverse: boolean; fadeIn: number; fadeOut: number;
}

// n marcas de inicio equiespaciadas desde 0 (el slice i va de marks[i] a marks[i+1] o al final).
export function equalSlices(durationSec: number, n: number): number[] {
  const k = Math.max(1, Math.floor(n));
  return Array.from({ length: k }, (_, i) => (i * durationSec) / k);
}

// Marcas (seg) donde sube la energía (RMS por ventana). Siempre incluye 0. Umbral relativo + separación mínima.
export function detectOnsets(
  pcm: Float32Array, sampleRate: number,
  opts?: { win?: number; hop?: number; threshold?: number; minGapSec?: number }
): number[] {
  const win = opts?.win ?? 1024;
  const hop = opts?.hop ?? 512;
  const threshold = opts?.threshold ?? 1.6;
  const minGap = opts?.minGapSec ?? 0.05;
  const marks: number[] = [0];
  let prev = 0, lastMark = -Infinity;
  for (let i = 0; i + win <= pcm.length; i += hop) {
    let e = 0;
    for (let j = 0; j < win; j++) { const s = pcm[i + j]; e += s * s; }
    e = Math.sqrt(e / win);
    const t = i / sampleRate;
    if (e > Math.max(prev, 1e-4) * threshold && (t - lastMark) >= minGap && t > 0) {
      marks.push(t); lastMark = t;
    }
    prev = e;
  }
  return marks;
}

// Construye slices contiguos desde una lista de marcas (ordena, fuerza el 0, descarta fuera de [0,dur)).
export function marksToSlices(marks: number[], durationSec: number): SliceDef[] {
  const sorted = [...new Set(marks.filter(m => m >= 0 && m < durationSec))].sort((a, b) => a - b);
  if (sorted.length === 0 || sorted[0] !== 0) sorted.unshift(0);
  return sorted.map((start, i) => ({
    start, end: i + 1 < sorted.length ? sorted[i + 1] : durationSec,
    gain: 1, reverse: false, fadeIn: 0, fadeOut: 0
  }));
}

// Índice del slice que dispara una nota MIDI (slice 0 = nota base). -1 si está fuera de rango.
export function sliceIndexForNote(base: number, count: number, midi: number): number {
  const idx = midi - base;
  return (idx >= 0 && idx < count) ? idx : -1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd studio && npm test -- slicing`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add studio/src/daw/slicing.ts studio/src/daw/slicing.test.ts
git commit -m "Estudio sampler S1: DSP puro de troceado (equalSlices/detectOnsets/marksToSlices/nota→slice) + tests"
```

---

### Task 2: Almacén de audios (`audio/sampleStore.ts`)

**Files:**
- Create: `studio/src/audio/sampleStore.ts`
- Test: `studio/src/audio/sampleStore.test.ts`

**Interfaces:**
- Consumes: `ensureAudio` (`audio/context.ts`).
- Produces:
  - `abToB64(buf: ArrayBuffer): string` y `b64ToAb(b64: string): ArrayBuffer` (**puros**, redondean sin pérdida).
  - `SAMPLE_MAX = 1_500_000`.
  - `importSample(name: string, arr: ArrayBuffer): Promise<string>` — decodifica, guarda `{name, buffer, b64}` (b64 solo si ≤ SAMPLE_MAX), devuelve el id (`smp-N`).
  - `getSample(id: string): { name: string; buffer: AudioBuffer | null; b64: string | null } | undefined`.
  - `serializeSamples(): Record<string, { name: string; b64: string }>` (solo los que tienen b64).
  - `restoreSamples(data: Record<string, { name: string; b64: string }>): void` (registra sin decodificar; el buffer llega con `decodePending`).
  - `decodePending(): Promise<void>` — decodifica los que tienen b64 y aún no tienen buffer.

Solo `abToB64`/`b64ToAb` se testean (round-trip). El resto usa Web Audio → verificado por typecheck + build.

- [ ] **Step 1: Write the failing test**

```ts
// studio/src/audio/sampleStore.test.ts
import { describe, it, expect } from 'vitest';
import { abToB64, b64ToAb } from './sampleStore';

describe('sampleStore base64', () => {
  it('round-trip ArrayBuffer <-> base64 sin pérdida', () => {
    const src = new Uint8Array([0, 1, 2, 250, 255, 128, 64, 7]);
    const b64 = abToB64(src.buffer);
    const back = new Uint8Array(b64ToAb(b64));
    expect(Array.from(back)).toEqual(Array.from(src));
  });
  it('cadena base64 es ASCII', () => {
    const b64 = abToB64(new Uint8Array([200, 201, 202]).buffer);
    expect(/^[A-Za-z0-9+/=]+$/.test(b64)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd studio && npm test -- sampleStore`
Expected: FAIL (no existe `./sampleStore`).

- [ ] **Step 3: Write minimal implementation**

```ts
// studio/src/audio/sampleStore.ts
// Almacén de audios importados: id -> {name, buffer, b64}. base64 puro (testeado) + decodificación Web Audio.
import { ensureAudio } from './context';

export const SAMPLE_MAX = 1_500_000;   // bytes; por encima no se persiste (solo sesión)

export function abToB64(buf: ArrayBuffer): string {
  let bin = ''; const bytes = new Uint8Array(buf), chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  return btoa(bin);
}
export function b64ToAb(b64: string): ArrayBuffer {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

interface SampleEntry { name: string; buffer: AudioBuffer | null; b64: string | null; }
const samples: Record<string, SampleEntry> = {};
let _sid = 0;

export async function importSample(name: string, arr: ArrayBuffer): Promise<string> {
  const actx = ensureAudio();
  const buffer = await actx.decodeAudioData(arr.slice(0));
  const id = 'smp-' + (++_sid);
  const b64 = arr.byteLength <= SAMPLE_MAX ? abToB64(arr) : null;
  samples[id] = { name: name.replace(/\.[^.]+$/, ''), buffer, b64 };
  return id;
}

export function getSample(id: string): SampleEntry | undefined { return samples[id]; }

export function serializeSamples(): Record<string, { name: string; b64: string }> {
  const out: Record<string, { name: string; b64: string }> = {};
  for (const id in samples) { const s = samples[id]; if (s.b64) out[id] = { name: s.name, b64: s.b64 }; }
  return out;
}

export function restoreSamples(data: Record<string, { name: string; b64: string }>): void {
  if (!data) return;
  for (const id in data) {
    samples[id] = { name: data[id].name, buffer: null, b64: data[id].b64 };
    const n = parseInt(id.replace('smp-', ''), 10);
    if (Number.isFinite(n) && n > _sid) _sid = n;   // evita colisiones de id nuevos
  }
}

export async function decodePending(): Promise<void> {
  const actx = ensureAudio();
  for (const id in samples) {
    const s = samples[id];
    if (s.b64 && !s.buffer) { try { s.buffer = await actx.decodeAudioData(b64ToAb(s.b64)); } catch { /* audio inválido */ } }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd studio && npm test -- sampleStore`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add studio/src/audio/sampleStore.ts studio/src/audio/sampleStore.test.ts
git commit -m "Estudio sampler S1: almacén de audios (importar/decodificar + base64 persistente) + tests"
```

---

### Task 3: Motor de reproducción de slices (`audio/slicer.ts`)

**Files:**
- Create: `studio/src/audio/slicer.ts`

**Interfaces:**
- Consumes: `SliceDef` (Task 1); `ensureAudio` (`audio/context.ts`); `masterDest` (`audio/masterBus.ts`).
- Produces: `playSlice(dest: AudioNode | null, buffer: AudioBuffer, slice: SliceDef, when: number, vel: number): void` — reproduce el trozo `[slice.start, slice.end)` del buffer en `when`, con ganancia (`slice.gain * vel`), fades y reverse.

Audio; sin test unitario (el DSP está en Task 1). Verificado por typecheck + build.

- [ ] **Step 1: Write the module**

```ts
// studio/src/audio/slicer.ts
// Reproduce un slice de un AudioBuffer (recorte inicio/fin, ganancia, fades, reverse). Agendado en `when`.
import { ensureAudio } from './context';
import { masterDest } from './masterBus';
import type { SliceDef } from '../daw/slicing';

const reverseCache = new WeakMap<AudioBuffer, AudioBuffer>();

// Devuelve una copia invertida del buffer (cacheada) — Web Audio no admite playbackRate negativo.
function reversed(actx: AudioContext, buffer: AudioBuffer): AudioBuffer {
  const hit = reverseCache.get(buffer); if (hit) return hit;
  const out = actx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch), dst = out.getChannelData(ch), n = src.length;
    for (let i = 0; i < n; i++) dst[i] = src[n - 1 - i];
  }
  reverseCache.set(buffer, out);
  return out;
}

export function playSlice(dest: AudioNode | null, buffer: AudioBuffer, slice: SliceDef, when: number, vel: number): void {
  const actx = ensureAudio();
  const out = dest ?? masterDest();
  const dur = Math.max(0.005, slice.end - slice.start);
  const useBuf = slice.reverse ? reversed(actx, buffer) : buffer;
  const offset = slice.reverse ? Math.max(0, buffer.duration - slice.end) : slice.start;
  const src = actx.createBufferSource(); src.buffer = useBuf;
  const g = actx.createGain();
  const peak = Math.max(0.0002, slice.gain * Math.max(0.05, vel));
  const fi = Math.min(slice.fadeIn, dur / 2), fo = Math.min(slice.fadeOut, dur / 2);
  const t = when;
  g.gain.setValueAtTime(fi > 0 ? 0.0001 : peak, t);
  if (fi > 0) g.gain.linearRampToValueAtTime(peak, t + fi);
  if (fo > 0) { g.gain.setValueAtTime(peak, t + dur - fo); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
  src.connect(g); g.connect(out);
  src.start(t, offset, dur);
  src.stop(t + dur + 0.02);
}
```

- [ ] **Step 2: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add studio/src/audio/slicer.ts
git commit -m "Estudio sampler S1: motor de reproducción de slices (recorte/ganancia/fades/reverse)"
```

---

### Task 4: Modelo y disparo del canal (`daw/model.ts` + `daw/channel.ts`)

**Files:**
- Modify: `studio/src/daw/model.ts`
- Modify: `studio/src/daw/channel.ts`
- Test: `studio/src/daw/model.test.ts` (añadir casos)

**Interfaces:**
- Consumes: `SliceDef`, `sliceIndexForNote` (Task 1); `getSample` (Task 2); `playSlice` (Task 3).
- Produces:
  - `InstrumentSpec` gana `{ kind:'slicer'; sampleId:string; base:number; slices: SliceDef[] }`.
  - `defaultSlicerInstrument(sampleId:string, base?:number): InstrumentSpec` (base por defecto 60).

**Nota:** añadir `slicer` al union obliga a tocar su consumidor (`channel.ts`); ambos van en la MISMA tarea para no romper el build.

- [ ] **Step 1: Write the failing test (añadir a model.test.ts)**

```ts
import { defaultSlicerInstrument } from './model';

describe('instrumento slicer', () => {
  it('defaultSlicerInstrument crea un slicer con base 60 y sin slices', () => {
    const inst = defaultSlicerInstrument('smp-1');
    expect(inst.kind).toBe('slicer');
    if (inst.kind === 'slicer') {
      expect(inst.sampleId).toBe('smp-1');
      expect(inst.base).toBe(60);
      expect(inst.slices).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd studio && npm test -- model`
Expected: FAIL (no existe `defaultSlicerInstrument`).

- [ ] **Step 3: Edit `daw/model.ts`**

Añade el import y amplía el union + helper:

```ts
import type { SliceDef } from './slicing';

export type InstrumentSpec =
  | { kind: 'synth'; preset: string }
  | { kind: 'drum'; voice: string }
  | { kind: 'synthx'; params: SynthxParams }
  | { kind: 'slicer'; sampleId: string; base: number; slices: SliceDef[] };

export function defaultSlicerInstrument(sampleId: string, base = 60): InstrumentSpec {
  return { kind: 'slicer', sampleId, base, slices: [] };
}
```

- [ ] **Step 4: Edit `daw/channel.ts` (rama slicer en trigger)**

Añade los imports y la rama:

```ts
import { playSlice } from '../audio/slicer';
import { getSample } from '../audio/sampleStore';
import { sliceIndexForNote } from './slicing';
```

Y sustituye el cuerpo de `trigger`:

```ts
    trigger(note, vel, when) {
      if (instrument.kind === 'drum') triggerDrum(actx, instrumentBus, instrument.voice as DrumVoice, when, vel);
      else if (instrument.kind === 'synthx') triggerSynthx(actx, instrument.params, note, vel, when, 0.12, instrumentBus);
      else if (instrument.kind === 'slicer') {
        const s = getSample(instrument.sampleId);
        const idx = sliceIndexForNote(instrument.base, instrument.slices.length, note);
        if (s && s.buffer && idx >= 0) playSlice(instrumentBus, s.buffer, instrument.slices[idx], when, vel);
      }
      else synth.triggerPreset(instrument.preset, note, vel, when, 0.12, instrumentBus);
    },
```

- [ ] **Step 5: Run tests and build**

Run: `cd studio && npm test -- model && npm run typecheck && npm run build`
Expected: test PASS; typecheck y build PASS.

- [ ] **Step 6: Commit**

```bash
git add studio/src/daw/model.ts studio/src/daw/channel.ts studio/src/daw/model.test.ts
git commit -m "Estudio sampler S1: InstrumentSpec 'slicer' + defaultSlicerInstrument + disparo en el canal"
```

---

### Task 5: Persistencia de los samples (`app/store.ts`)

**Files:**
- Modify: `studio/src/app/store.ts`
- Test: `studio/src/app/store.test.ts` (añadir casos)

**Interfaces:**
- Consumes: `serializeSamples`, `restoreSamples` (Task 2).
- Produces: `ProjectState` gana `samples?: Record<string,{name:string;b64:string}>`. `serializeProject` incluye `serializeSamples()`; `parseProject` devuelve `samples` (o `{}`), tolerante. `loadStore`/`readProjectFile` restauran los samples al almacén (vía una función `hydrateSamples(p)` exportada, que el `studioView` llamará tras `ensureAudio`).

**Nota:** la decodificación real (Web Audio) ocurre en `studioView` con `decodePending()` tras el gesto; `store.ts` solo (de)serializa el `b64` y llama a `restoreSamples`.

- [ ] **Step 1: Write the failing test (añadir a store.test.ts)**

```ts
import { serializeProject, parseProject, defaultProject } from './store';

describe('store · samples', () => {
  it('serializa/parsea el bloque de samples del proyecto', () => {
    const p = defaultProject();
    (p as unknown as { samples: Record<string, { name: string; b64: string }> }).samples = { 'smp-1': { name: 'break', b64: 'AAAA' } };
    const back = parseProject(serializeProject(p));
    expect(back.samples?.['smp-1']).toEqual({ name: 'break', b64: 'AAAA' });
  });
  it('proyecto sin samples da samples vacío (tolerante)', () => {
    const back = parseProject(serializeProject(defaultProject()));
    expect(back.samples).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd studio && npm test -- store`
Expected: FAIL (no existe `samples` en ProjectState).

- [ ] **Step 3: Edit `app/store.ts`**

Añade el import, el campo y el hidratado. Concretamente:

```ts
import { serializeSamples, restoreSamples } from '../audio/sampleStore';
```

En `ProjectState` añade el campo opcional:

```ts
export interface ProjectState { version: number; daw: DawState; masterRack: RackState; samples?: Record<string, { name: string; b64: string }> }
```

En `serializeProject`, incluye los samples actuales del almacén:

```ts
export function serializeProject(p: ProjectState): string {
  return JSON.stringify({ ...p, samples: serializeSamples() });
}
```

En `migrate`/`parseProject`, propaga `samples` de forma tolerante. Localiza donde se construye el `ProjectState` de retorno (la función `migrate`) y añade a cada objeto devuelto `samples: (o.samples && typeof o.samples === 'object') ? o.samples as Record<string,{name:string;b64:string}> : {}`. Si prefieres centralizarlo, envuelve el retorno de `parseProject`:

```ts
export function parseProject(json: string): ProjectState {
  const o = JSON.parse(json) as Record<string, unknown>;
  const base = migrate(o);
  base.samples = (o.samples && typeof o.samples === 'object') ? o.samples as Record<string, { name: string; b64: string }> : {};
  return base;
}
```

Y añade un helper que registra los samples del proyecto en el almacén (lo llama `studioView` tras el gesto de audio):

```ts
// Registra en el almacén los samples de un proyecto abierto (sin decodificar aún).
export function hydrateSamples(p: ProjectState): void {
  if (p.samples) restoreSamples(p.samples);
}
```

- [ ] **Step 4: Run tests and build**

Run: `cd studio && npm test -- store && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add studio/src/app/store.ts studio/src/app/store.test.ts
git commit -m "Estudio sampler S1: persistencia de samples en el proyecto (base64) + tests"
```

---

### Task 6: Editor del sampler (`ui/sampleEditor.ts`)

**Files:**
- Create: `studio/src/ui/sampleEditor.ts`
- Modify: `studio/src/ui/styles.css` (estilos del editor)

**Interfaces:**
- Consumes: `SliceDef` (Task 1).
- Produces: `mountSampleEditor(root, opts): void`
  - `opts = { buffer: AudioBuffer | null; slices: SliceDef[]; base: number; onImport: (file: File) => void; onSliceEqual: (n: number) => void; onSliceOnsets: () => void; onTest: (index: number) => void }`
  - Pinta: si `buffer` es null → aviso "Importa un audio…"; si hay buffer → **canvas** con la forma de onda (submuestreada) + líneas de marca por slice + fila de botones (Importar, Por transitorios, En N con selector 8/16/32) + lista de slices (índice → nota, con ▶). Clic en un slice o en su ▶ → `onTest(index)`.

DOM; sin test unitario. Verificado por typecheck + build.

- [ ] **Step 1: Write the module**

```ts
// studio/src/ui/sampleEditor.ts
// Editor del canal slicer (pestaña SAMPLES): forma de onda + marcas + troceado + probar slice.
import type { SliceDef } from '../daw/slicing';

const NOTE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const noteName = (m: number): string => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

export function mountSampleEditor(
  root: HTMLElement,
  opts: {
    buffer: AudioBuffer | null; slices: SliceDef[]; base: number;
    onImport: (file: File) => void; onSliceEqual: (n: number) => void;
    onSliceOnsets: () => void; onTest: (index: number) => void;
  }
): void {
  root.innerHTML = `<div class="smpEd">
    <div class="smpBar">
      <label class="smpBtn">Importar audio…<input id="smpFile" type="file" accept="audio/*" hidden></label>
      <button id="smpOnsets" class="smpBtn" ${opts.buffer ? '' : 'disabled'}>Por transitorios</button>
      <label class="smpBtn">En <select id="smpN"><option>8</option><option selected>16</option><option>32</option></select> iguales
        <button id="smpEqual" ${opts.buffer ? '' : 'disabled'}>Trocear</button></label>
    </div>
    ${opts.buffer ? '<canvas id="smpWave" class="smpWave" width="900" height="120"></canvas>' : '<p class="muted">Importa un audio para trocearlo en slices.</p>'}
    <div id="smpList" class="smpList"></div>
  </div>`;

  (root.querySelector('#smpFile') as HTMLInputElement).addEventListener('change', ev => {
    const f = (ev.target as HTMLInputElement).files?.[0]; if (f) opts.onImport(f);
  });
  (root.querySelector('#smpOnsets') as HTMLButtonElement | null)?.addEventListener('click', () => opts.onSliceOnsets());
  (root.querySelector('#smpEqual') as HTMLButtonElement | null)?.addEventListener('click', () => {
    const n = +(root.querySelector('#smpN') as HTMLSelectElement).value || 16;
    opts.onSliceEqual(n);
  });

  const buffer = opts.buffer;
  const canvas = root.querySelector('#smpWave') as HTMLCanvasElement | null;
  if (buffer && canvas) {
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height, mid = H / 2;
    const data = buffer.getChannelData(0), N = data.length;
    ctx.fillStyle = '#0c110b'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#2dff6a'; ctx.globalAlpha = 0.85; ctx.beginPath();
    for (let x = 0; x < W; x++) {
      let min = 1, max = -1; const i0 = Math.floor(x / W * N), i1 = Math.floor((x + 1) / W * N);
      for (let i = i0; i < i1; i++) { const v = data[i]; if (v < min) min = v; if (v > max) max = v; }
      ctx.moveTo(x, mid + min * mid); ctx.lineTo(x, mid + max * mid);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
    // marcas de slice
    ctx.strokeStyle = '#fff';
    for (const s of opts.slices) {
      const x = Math.round(s.start / buffer.duration * W) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
  }

  // lista de slices: índice -> nota, con ▶
  const list = root.querySelector('#smpList') as HTMLElement;
  list.innerHTML = opts.slices.map((s, i) =>
    `<button class="smpSlice" data-i="${i}" title="Probar">▶ ${i + 1} · ${noteName(opts.base + i)}</button>`).join('')
    || (buffer ? '<p class="muted">Pulsa “Trocear” para crear los slices.</p>' : '');
  list.querySelectorAll<HTMLButtonElement>('.smpSlice').forEach(b =>
    b.addEventListener('click', () => opts.onTest(+(b.dataset.i ?? '0'))));
}
```

- [ ] **Step 2: Add CSS**

Añade al final de `studio/src/ui/styles.css`:

```css
/* --- Editor del sampler (pestaña SAMPLES) --- */
.smpEd{padding:6px 2px}
.smpBar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:10px}
.smpBtn{background:#141a13;border:1px solid #2b3324;color:#c9d2c9;border-radius:6px;padding:6px 10px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.smpBtn:hover{border-color:#2dff6a}
.smpBtn select,.smpBtn button{background:#0e130d;border:1px solid #2b3324;color:#c9d2c9;border-radius:5px;padding:3px 7px;cursor:pointer}
.smpWave{width:100%;height:120px;border:1px solid #23291f;border-radius:8px;display:block;margin-bottom:10px;background:#0c110b}
.smpList{display:flex;flex-wrap:wrap;gap:6px}
.smpSlice{background:#141a13;border:1px solid #2b3324;color:#cdd2c9;border-radius:6px;padding:6px 10px;font-size:11px;cursor:pointer}
.smpSlice:hover{border-color:#2dff6a;color:#fff}
```

- [ ] **Step 3: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add studio/src/ui/sampleEditor.ts studio/src/ui/styles.css
git commit -m "Estudio sampler S1: editor (onda + marcas + troceado + probar) en la pestaña SAMPLES"
```

---

### Task 7: Integración en la vista (`ui/channelstrip.ts` + `app/studioView.ts`)

**Files:**
- Modify: `studio/src/ui/channelstrip.ts` (opción "Slicer" en el selector)
- Modify: `studio/src/app/studioView.ts` (pestaña SAMPLES + cambio a slicer + importar/trocear + teclado + hidratado al abrir)

**Interfaces:**
- Consumes: `defaultSlicerInstrument` (Task 4); `importSample`, `getSample`, `decodePending`, `hydrateSamples` (Tasks 2/5); `equalSlices`, `detectOnsets`, `marksToSlices`, `sliceIndexForNote` (Task 1); `playSlice` (Task 3); `mountSampleEditor` (Task 6).
- Produces: la pestaña SAMPLES muestra el editor del canal `slicer` seleccionado; el selector de SONIDO ofrece "🔪 Slicer"; importar/trocear actualizan el instrument; el teclado toca slices; al abrir proyecto se hidratan y decodifican los samples.

Integración (audio + DOM); sin test unitario. Verificado por typecheck + tests verdes + build + prueba por oído/vista.

- [ ] **Step 1: Add the "Slicer" option to the sound selector**

En `studio/src/ui/channelstrip.ts`, dentro de `instrumentSelectHTML`, calcula `cur` para slicer y añade el optgroup. Reemplaza el cálculo de `cur` y añade el grupo:

```ts
  const cur = ch.instrument.kind === 'drum' ? `drum:${ch.instrument.voice}`
    : ch.instrument.kind === 'synthx' ? 'synthx'
    : ch.instrument.kind === 'slicer' ? 'slicer'
    : `synth:${ch.instrument.preset}`;
```

Y dentro del `<select>`, tras el optgroup "Sinte editable", añade:

```ts
    `<optgroup label="Sampler"><option value="slicer"${ch.instrument.kind === 'slicer' ? ' selected' : ''}>🔪 Slicer (audio troceado)</option></optgroup>`
```

(colócalo en la plantilla del select, entre el grupo "Sinte editable" y el grupo "Batería").

- [ ] **Step 2: Wire `studioView.ts`**

**(a) Imports** — añade:

```ts
import { importSample, getSample, decodePending } from '../audio/sampleStore';
import { hydrateSamples } from './store';
import { equalSlices, detectOnsets, marksToSlices, sliceIndexForNote } from '../daw/slicing';
import { playSlice } from '../audio/slicer';
import { defaultSlicerInstrument } from '../daw/model';
import { mountSampleEditor } from '../ui/sampleEditor';
```

(`getSample`/`playSlice`/`sliceIndexForNote` puede que solo se usen en el teclado en vivo; mantenlos.)

**(b) Pestaña SAMPLES** — reemplaza el contenido del placeholder `#paneSamples` por un host:

```html
      <div id="paneSamples" class="pvPanel">
        <div id="sampleEditorHost"></div>
      </div>
```

**(c) `renderSamples()`** — añade esta función y llámala desde `renderAll()` y `selectChannel()` (junto a `renderSelected()`):

```ts
  function renderSamples(): void {
    const host = root.querySelector('#sampleEditorHost') as HTMLElement;
    const ch = findChannel(daw, selectedId);
    if (!ch || ch.instrument.kind !== 'slicer') {
      host.innerHTML = '<div class="pvSoon">Elige <b>🔪 Slicer</b> en el SONIDO de un canal para cargar y trocear un audio.</div>';
      return;
    }
    const inst = ch.instrument;
    const s = getSample(inst.sampleId);
    mountSampleEditor(host, {
      buffer: s?.buffer ?? null, slices: inst.slices, base: inst.base,
      onImport: (file) => { void importAudioToChannel(selectedId, file); },
      onSliceEqual: (n) => applySlices(selectedId, equalSlicesFor(selectedId, n)),
      onSliceOnsets: () => applySlices(selectedId, onsetsFor(selectedId)),
      onTest: (i) => testSlice(selectedId, i)
    });
  }
```

**(d) Helpers de importar / trocear / probar** — añade:

```ts
  async function importAudioToChannel(id: string, file: File): Promise<void> {
    audioOn(); await initAudio();
    const arr = await file.arrayBuffer();
    const sampleId = await importSample(file.name, arr);
    const spec = defaultSlicerInstrument(sampleId, 60);
    daw = updateChannel(daw, id, { instrument: spec });
    channels.find(a => a.id === id)?.setInstrument(spec);
    persist(); renderSamples(); renderPads();
  }
  function bufferOf(id: string): AudioBuffer | null {
    const ch = findChannel(daw, id);
    if (ch?.instrument.kind !== 'slicer') return null;
    return getSample(ch.instrument.sampleId)?.buffer ?? null;
  }
  function equalSlicesFor(id: string, n: number): number[] {
    const buf = bufferOf(id); return buf ? equalSlices(buf.duration, n) : [];
  }
  function onsetsFor(id: string): number[] {
    const buf = bufferOf(id); return buf ? detectOnsets(buf.getChannelData(0), buf.sampleRate) : [];
  }
  function applySlices(id: string, marks: number[]): void {
    const buf = bufferOf(id); const ch = findChannel(daw, id);
    if (!buf || ch?.instrument.kind !== 'slicer') return;
    const slices = marksToSlices(marks, buf.duration);
    const spec = { ...ch.instrument, slices };
    daw = updateChannel(daw, id, { instrument: spec });
    channels.find(a => a.id === id)?.setInstrument(spec);
    persist(); renderSamples();
  }
  function testSlice(id: string, index: number): void {
    audioOn();
    const buf = bufferOf(id); const ch = findChannel(daw, id); const audio = channels.find(a => a.id === id);
    if (buf && audio && ch?.instrument.kind === 'slicer' && ch.instrument.slices[index]) {
      playSlice(audio.instrumentBus, buf, ch.instrument.slices[index], (getAudioContext()?.currentTime ?? 0), 0.9);
    }
  }
```

**(e) `changeInstrument`** — añade la rama `slicer` (al elegirlo en el selector, crea un slicer vacío y cambia a la pestaña SAMPLES). En la función `changeInstrument(id, val)`:

```ts
    if (val === 'slicer') { spec = defaultSlicerInstrument('', 60); tab = 'samples'; renderTabs(); showPane(); }
    else if (val === 'synthx') spec = defaultSynthxInstrument();
    else if (val.startsWith('drum:')) spec = { kind: 'drum', voice: val.slice(5) };
    else spec = { kind: 'synth', preset: val.slice(6) };
```

y al final de `changeInstrument`, además de `renderMixer(); renderPads();`, llama `renderSamples();`.

**(f) Teclado en vivo (`playLive`/`stopLive`)** — añade la rama slicer en `playLive` (dispara el slice de la nota) y no hagas nada en `stopLive` (los slices son one-shot):

```ts
    } else if (ch?.instrument.kind === 'slicer') {
      const s = getSample(ch.instrument.sampleId);
      const idx = sliceIndexForNote(ch.instrument.base, ch.instrument.slices.length, m);
      const actx = getAudioContext();
      if (audio && actx && s?.buffer && idx >= 0) playSlice(audio.instrumentBus, s.buffer, ch.instrument.slices[idx], actx.currentTime, v);
    }
```

(colócala como otra rama del `if/else if` de `playLive`, junto a la de `synthx`; el `if (recording && seq.isPlaying()) recordStep(m, v);` final se conserva). En `stopLive`, no añadas nada para slicer (retorna sin tocar synth).

**(g) Hidratar samples al abrir/arrancar** — en `initAudio()`, tras crear los canales y antes de `renderAll()`, decodifica los samples del proyecto:

```ts
      hydrateSamples(project);
      await decodePending();
```

y en el manejador de **abrir proyecto** (`#stFile` change), tras `daw = p.daw; project.masterRack = p.masterRack;`, añade:

```ts
      hydrateSamples(p); await decodePending();
```

antes de recrear los canales/repintar, para que los buffers estén listos.

- [ ] **Step 3: Verify typecheck, tests and build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS (typecheck limpio, tests verdes, `dist/` generado).

- [ ] **Step 4: Manual smoke test (prueba por oído/vista)**

Run: `cd studio && npm run dev` y abre la URL.
Verifica:
1. En un canal, elige **🔪 Slicer** en SONIDO → salta a la pestaña **SAMPLES** con "Importa un audio…".
2. **Importar** un break/loop corto → aparece la **forma de onda**.
3. **Trocear** "En 16 iguales" o "Por transitorios" → aparecen las **marcas** y la lista de slices (índice → nota).
4. **▶** en un slice suena ese trozo.
5. En **PADS**, pon pasos en ese canal y toca notas (teclado A-S-D-F…): cada nota dispara su slice; al reproducir, el secuenciador los dispara.
6. **Guardar** y **Abrir** el proyecto: si el audio es pequeño, se conserva y vuelve a sonar; los slices se mantienen.

- [ ] **Step 5: Commit**

```bash
git add studio/src/ui/channelstrip.ts studio/src/app/studioView.ts
git commit -m "Estudio sampler S1: integración (pestaña SAMPLES + selector Slicer + importar/trocear + teclado + hidratar)"
```

---

### Task 8: Docs y versión

**Files:**
- Modify: `studio/package.json` (subir `version` a `0.16.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.16.0"`.

- [ ] **Step 2: Update HANDOFF.md**

Añade en la zona de estado del Estudio:

```markdown
**Estudio · Sampler con slicing — S1 núcleo (v0.16.0):** cuarto tipo de instrumento de canal `slicer`:
importar un audio (`audio/sampleStore.ts`, base64 persistente), trocearlo en slices por **transitorios** o
**N iguales** (`daw/slicing.ts` puro: `equalSlices`/`detectOnsets`/`marksToSlices`/`sliceIndexForNote`),
cada slice mapeado a una nota (slice 0 = `base`), disparado por el secuenciador y el teclado
(`audio/slicer.ts`: recorte/ganancia/fades/reverse). Editor en la pestaña SAMPLES (`ui/sampleEditor.ts`:
onda + marcas + botones de troceado + ▶ probar). Persistencia de los samples pequeños en el proyecto
(`app/store.ts`). Modelo `InstrumentSpec` `slicer` + rama en `daw/channel.ts`. Pendiente (S2–S4): ajuste
manual de marcas, edición por slice (recorte/ganancia/reverse/fade en la UI) y navegador de carpetas.
```

- [ ] **Step 3: Update CLAUDE.md**

En la sección del Estudio (decisión 5), añade una frase: el Estudio tiene ya un **sampler con slicing**
(canal `slicer`: importar audio, trocear por transitorios/iguales, slices→notas, secuenciable; editor en la
pestaña SAMPLES) como S1 del sub-proyecto del Simpler; pendientes S2 (marcas a mano), S3 (edición por slice)
y S4 (navegador de carpetas).

- [ ] **Step 4: Verify and commit**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio sampler S1: docs (HANDOFF/CLAUDE) y versión 0.16.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec (S1 núcleo):**
- Almacén de samples (importar + base64) → Task 2 ✅
- Slicing DSP (iguales + transitorios) → Task 1 ✅
- Motor de reproducción de slices → Task 3 ✅
- Modelo `slicer` + disparo del canal → Task 4 ✅
- Persistencia de samples → Task 5 ✅
- Editor pestaña SAMPLES (onda + marcas + troceado + probar) → Task 6 ✅
- Integración (selector Slicer + importar/trocear + teclado + hidratar) → Task 7 ✅
- Docs/versión → Task 8 ✅
- (S2 marcas a mano, S3 edición por slice en UI, S4 navegador → sub-tandas posteriores, fuera de S1.)

**Build verde en cada tarea:** aditivo salvo el union `InstrumentSpec` (Task 4), que toca modelo + `channel.ts` en la misma tarea. Task 1–3, 5, 6 no rompen `studioView`; Task 7 integra.

**Placeholders:** ninguno; el código va completo. Textos de UI ("Importa un audio…") son contenido, no marcadores. El "TODO PASS" de la Task 7 significa "todo pasa".

**Consistencia de tipos:** `SliceDef` (Task 1) se usa igual en Tasks 3/4/6/7. `importSample`→id, `getSample(id).buffer`, `sliceIndexForNote(base,count,midi)`, `playSlice(dest,buffer,slice,when,vel)`, `marksToSlices(marks,dur)` — firmas coherentes entre Tasks 1/2/3 y su uso en 4/7. `defaultSlicerInstrument(sampleId,base)` (Task 4) usado en Task 7. `mountSampleEditor(root,opts)` (Task 6) coincide con Task 7. `hydrateSamples`/`serializeSamples`/`restoreSamples`/`decodePending` (Tasks 2/5) usados en Task 7.

**Limitación consciente (S1):** el editor S1 muestra la onda + marcas + troceado + probar, pero **no** permite mover marcas a mano (S2) ni editar recorte/ganancia/reverse/fade por slice desde la UI (S3, aunque el motor y el modelo ya los soportan con sus defaults). El navegador de carpetas es S4. Un canal `slicer` sin audio no suena hasta importar.
