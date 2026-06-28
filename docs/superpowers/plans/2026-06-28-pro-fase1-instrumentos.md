# Proyecto pro · Fase 1 (motor de instrumentos) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el Estudio (`studio/`) se pueda tocar y oír: cadena maestra (limitador+soft-clipper+makeup), motor synth (5 presets) y entrada (MIDI + teclado en pantalla + teclas de ordenador) cableados en la vista Estudio.

**Architecture:** Se porta de `pianova.html` (fuente de verdad) a módulos TS: `audio/masterBus.ts` (cadena), `audio/synth.ts` (presets+voz), `midi/input.ts` (parseo puro + conexión), `ui/keyboard.ts` (teclado), y el cableado en la vista Estudio. El synth conecta por `masterDest()`. Entrada en vivo (sin agendado todavía).

**Tech Stack:** Vite + TypeScript (strict) + Vitest, Web Audio + Web MIDI. Sin framework de UI. Comandos desde `d:\PianoVa\studio`: `npm run typecheck`, `npm test`, `npm run build`.

## Global Constraints

- Todo en **`studio/`**; NO tocar `pianova.html`. TypeScript strict; Vitest; sin framework de UI; textos/comentarios en **español**.
- **Portar los valores exactos** de `pianova.html`: cadena maestra (limitador threshold −6/knee 0/ratio 20/attack 0.003/release 0.25; `SOFTCLIP_DRIVE=2.5`; `MASTER_MAKEUP=2.5`; pre = makeup/drive; curva `tanh(drive·x)`, oversample '4x'), los 5 presets `SYNTH`, la envolvente, el parseo MIDI e **ignorar canal 10**, y el mapa de teclas de ordenador.
- `exponentialRampToValueAtTime` nunca a 0 (mín 0.0001). Audio arranca tras gesto (`ensureAudio`).
- Web MIDI: acceder vía un camino con `any` (los tipos de Web MIDI dependen del entorno) para que `tsc` no falle; `parseMidiMessage` SÍ va tipado y testeado.
- Verificación por tarea: `npm run typecheck` + `npm test` + `npm run build` sin errores. Reportar BLOCKED si npm falla.

---

### Task 1: Cadena maestra (limitador + soft-clipper + makeup) en masterBus

**Files:**
- Modify: `studio/src/audio/masterBus.ts` (extender `setupMasterBus`, añadir `makeSoftClipCurve`).
- Create: `studio/src/audio/masterBus.test.ts`.

**Interfaces:**
- Produces: `makeSoftClipCurve(n, drive): Float32Array`; `setupMasterBus` ahora monta la cadena
  completa; `masterDest()` y `testTone()` siguen igual.

- [ ] **Step 1: Test de la curva (Vitest)** — `studio/src/audio/masterBus.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeSoftClipCurve } from './masterBus';

describe('makeSoftClipCurve', () => {
  it('es tanh(drive·x) sobre [-1,1], monótona y acotada', () => {
    const drive = 2.5, n = 2048;
    const c = makeSoftClipCurve(n, drive);
    expect(c.length).toBe(n);
    expect(Math.abs(c[(n - 1) / 2 | 0])).toBeLessThan(0.01);     // centro ≈ 0
    expect(c[0]).toBeCloseTo(Math.tanh(-drive), 5);              // extremo -
    expect(c[n - 1]).toBeCloseTo(Math.tanh(drive), 5);           // extremo +
    for (let i = 1; i < n; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]); // monótona
    expect(Math.abs(c[n - 1])).toBeLessThan(1);                  // < 1 (sin clipping duro)
  });
});
```

- [ ] **Step 2: Correr el test (falla: función no exportada)** — Run: `npm test` → FALLA.

- [ ] **Step 3: Extender `studio/src/audio/masterBus.ts`** (sustituye el cuerpo de `setupMasterBus` y
  añade la curva + constantes; conserva `masterDest()` y `testTone()`):

```ts
// Bus maestro: masterIn -> limitador -> makeup/pre -> soft-clipper (tanh) -> final -> destino.
// Portado de pianova.html (misma pared anti-clipping con potencia). Aquí se colgarán EQ/efectos luego.
let masterIn: GainNode | null = null;

const SOFTCLIP_DRIVE = 2.5;
const MASTER_MAKEUP = 2.5;

// Curva tanh(drive·x) sobre [-1,1]: satura suave y la salida nunca pasa de ~tanh(drive) (<1).
export function makeSoftClipCurve(n: number, drive: number): Float32Array {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(drive * x); }
  return c;
}

export function setupMasterBus(actx: AudioContext): void {
  masterIn = actx.createGain();
  const limiter = actx.createDynamicsCompressor();
  limiter.threshold.value = -6; limiter.knee.value = 0; limiter.ratio.value = 20;
  limiter.attack.value = 0.003; limiter.release.value = 0.25;
  const clipPre = actx.createGain();
  clipPre.gain.value = MASTER_MAKEUP / SOFTCLIP_DRIVE;   // makeup + drive antes del shaper
  const clip = actx.createWaveShaper();
  clip.curve = makeSoftClipCurve(2048, SOFTCLIP_DRIVE);
  clip.oversample = '4x';
  const final = actx.createGain();
  masterIn.connect(limiter);
  limiter.connect(clipPre);
  clipPre.connect(clip);
  clip.connect(final);
  final.connect(actx.destination);
}

export function masterDest(): AudioNode {
  if (!masterIn) throw new Error('Bus maestro no inicializado (llama a ensureAudio primero).');
  return masterIn;
}

export function testTone(): void {
  const dest = masterDest();
  const actx = dest.context as AudioContext;
  const osc = actx.createOscillator();
  const g = actx.createGain();
  osc.type = 'sine'; osc.frequency.value = 440; g.gain.value = 0.2;
  osc.connect(g); g.connect(dest);
  const t = actx.currentTime;
  osc.start(t); osc.stop(t + 0.4);
}
```

- [ ] **Step 4: Verificar** — Run: `npm test` (pasa) · `npm run typecheck` · `npm run build`. Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add studio/src/audio/masterBus.ts studio/src/audio/masterBus.test.ts
git commit -m "Estudio F1: cadena maestra (limitador+soft-clipper+makeup) + test de la curva"
```

---

### Task 2: Motor synth (5 presets + noteOn/noteOff/setPreset)

**Files:**
- Create: `studio/src/audio/synth.ts`.

**Interfaces:**
- Consumes: `ensureAudio` (context.ts), `masterDest` (masterBus.ts).
- Produces: `noteOn(midi, vel?)`, `noteOff(midi)`, `setPreset(name)`, `getPresetNames(): [string,string][]`,
  `allNotesOff()`, `SYNTH`.

- [ ] **Step 1: Crear `studio/src/audio/synth.ts`** (presets y voz portados de pianova.html):

```ts
import { ensureAudio } from './context';
import { masterDest } from './masterBus';

interface Partial { type: OscillatorType; ratio: number; gain: number; detune?: number; }
interface Preset {
  label: string;
  partials: Partial[];
  filter: { start: number; startMax: number; end: number; endMin: number; time: number } | null;
  sustain: boolean;
  peak: [number, number];
  attack: number;
  decay?: number;
  release?: number;
  vibrato?: { rate: number; depth: number };
}
interface Voice { o: OscillatorNode[]; g: GainNode; release: number; }

export const SYNTH: Record<string, Preset> = {
  piano: { label: '🎹 Piano',
    partials: [{ type: 'triangle', ratio: 1, gain: 1 }, { type: 'sine', ratio: 2, gain: 0.22 },
               { type: 'sawtooth', ratio: 1, gain: 0.07, detune: 5 }],
    filter: { start: 9, startMax: 13000, end: 2, endMin: 700, time: 1.3 },
    sustain: false, peak: [0.16, 0.22], attack: 0.006, decay: 2.8 },
  brillante: { label: '✨ Piano brillante',
    partials: [{ type: 'sawtooth', ratio: 1, gain: 0.5 }, { type: 'square', ratio: 2, gain: 0.12 },
               { type: 'triangle', ratio: 1, gain: 0.5, detune: 6 }],
    filter: { start: 14, startMax: 16000, end: 4, endMin: 1400, time: 1.0 },
    sustain: false, peak: [0.11, 0.18], attack: 0.004, decay: 2.4 },
  organo: { label: '🎛️ Órgano',
    partials: [{ type: 'sine', ratio: 1, gain: 0.5 }, { type: 'sine', ratio: 2, gain: 0.3 },
               { type: 'sine', ratio: 4, gain: 0.18 }, { type: 'square', ratio: 1, gain: 0.06 }],
    filter: null, sustain: true, peak: [0.15, 0.10], attack: 0.02, release: 0.12 },
  campanas: { label: '🔔 Campanas',
    partials: [{ type: 'sine', ratio: 1, gain: 0.6 }, { type: 'sine', ratio: 3.0, gain: 0.3 },
               { type: 'sine', ratio: 5.4, gain: 0.12 }],
    filter: null, sustain: false, peak: [0.17, 0.16], attack: 0.003, decay: 3.4 },
  cuerda: { label: '🎻 Cuerda sintética',
    partials: [{ type: 'sawtooth', ratio: 1, gain: 0.4 }, { type: 'sawtooth', ratio: 1, gain: 0.4, detune: -7 },
               { type: 'sawtooth', ratio: 2, gain: 0.12 }],
    filter: { start: 6, startMax: 7000, end: 3, endMin: 900, time: 0.6 },
    sustain: true, peak: [0.12, 0.10], attack: 0.08, release: 0.22, vibrato: { rate: 5, depth: 4 } }
};

const voices: Record<number, Voice> = {};
let currentPreset = 'piano';

export function setPreset(name: string): void { if (SYNTH[name]) currentPreset = name; }
export function getPresetNames(): [string, string][] {
  return Object.keys(SYNTH).map(k => [k, SYNTH[k].label]);
}

export function noteOn(midi: number, vel = 0.8): void {
  const actx = ensureAudio();
  if (voices[midi]) noteOff(midi);
  const preset = SYNTH[currentPreset] ?? SYNTH.piano;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const t = actx.currentTime;
  const g = actx.createGain();
  let out: AudioNode = g;
  if (preset.filter) {
    const f = actx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(Math.min(freq * preset.filter.start, preset.filter.startMax), t);
    f.frequency.exponentialRampToValueAtTime(Math.max(freq * preset.filter.end, preset.filter.endMin), t + preset.filter.time);
    g.connect(f); out = f;
  }
  out.connect(masterDest());
  const oscs: OscillatorNode[] = [];
  for (const part of preset.partials) {
    const o = actx.createOscillator(); o.type = part.type; o.frequency.value = freq * part.ratio;
    if (part.detune) o.detune.value = part.detune;
    const pg = actx.createGain(); pg.gain.value = part.gain;
    o.connect(pg); pg.connect(g); oscs.push(o);
  }
  if (preset.vibrato) {
    const lfo = actx.createOscillator(); lfo.frequency.value = preset.vibrato.rate;
    const lg = actx.createGain(); lg.gain.value = preset.vibrato.depth;
    lfo.connect(lg); oscs.forEach(o => lg.connect(o.detune)); lfo.start(t); oscs.push(lfo);
  }
  const peak = Math.max(0.0002, preset.peak[0] + preset.peak[1] * vel);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + preset.attack);
  if (!preset.sustain) g.gain.exponentialRampToValueAtTime(0.0001, t + (preset.decay ?? 1));
  oscs.forEach(o => o.start(t));
  voices[midi] = { o: oscs, g, release: preset.release ?? 0.18 };
}

export function noteOff(midi: number): void {
  const v = voices[midi]; if (!v) return;
  const actx = ensureAudio();
  const t = actx.currentTime, rel = v.release;
  try {
    const cur = v.g.gain.value;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setValueAtTime(Math.max(cur, 0.0001), t);
    v.g.gain.exponentialRampToValueAtTime(0.0001, t + rel);
  } catch (e) { /* ignora */ }
  const os = v.o;
  setTimeout(() => os.forEach(x => { try { x.stop(); } catch (e) { /* ya parado */ } }), rel * 1000 + 60);
  delete voices[midi];
}

export function allNotesOff(): void { Object.keys(voices).forEach(m => noteOff(+m)); }
```

- [ ] **Step 2: Verificar** — Run: `npm run typecheck` · `npm run build`. Expected: sin errores.

- [ ] **Step 3: Verificación manual** (`npm run dev`, consola): `import` no aplica, pero tras la Task 5
  se prueba por oído. Aquí basta typecheck/build. (Opcional: en la consola `window`-expuesto no hay; se
  verifica en la Task 5.)

- [ ] **Step 4: Commit**

```bash
git add studio/src/audio/synth.ts
git commit -m "Estudio F1: motor synth (5 presets + noteOn/noteOff/setPreset) portado a TS"
```

---

### Task 3: Entrada MIDI (parseo puro + conexión)

**Files:**
- Create: `studio/src/midi/input.ts`, `studio/src/midi/input.test.ts`.

**Interfaces:**
- Produces: `parseMidiMessage(data): { type:'on'|'off'|'other', midi, vel, channel }` (pura);
  `connectMidi(h: { onNoteOn(midi,vel), onNoteOff(midi), onState(names) }): Promise<void>`.

- [ ] **Step 1: Test del parseo (Vitest)** — `studio/src/midi/input.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseMidiMessage } from './input';

describe('parseMidiMessage', () => {
  it('note on (0x90 vel>0)', () => {
    const r = parseMidiMessage(new Uint8Array([0x90, 60, 100]));
    expect(r.type).toBe('on'); expect(r.midi).toBe(60); expect(r.vel).toBeCloseTo(100 / 127, 5); expect(r.channel).toBe(1);
  });
  it('note off (0x80)', () => {
    const r = parseMidiMessage(new Uint8Array([0x80, 60, 64]));
    expect(r.type).toBe('off'); expect(r.midi).toBe(60);
  });
  it('note on con vel 0 = off', () => {
    expect(parseMidiMessage(new Uint8Array([0x90, 60, 0])).type).toBe('off');
  });
  it('canal 10 (percusión) se ignora', () => {
    const r = parseMidiMessage(new Uint8Array([0x99, 38, 100]));   // 0x90 | canal 9 (=canal 10)
    expect(r.type).toBe('other'); expect(r.channel).toBe(10);
  });
  it('CC u otros = other', () => {
    expect(parseMidiMessage(new Uint8Array([0xB0, 7, 100])).type).toBe('other');
  });
});
```

- [ ] **Step 2: Correr el test (falla)** — Run: `npm test` → FALLA.

- [ ] **Step 3: Crear `studio/src/midi/input.ts`**:

```ts
// Parseo de mensajes MIDI (puro). status 0x90 vel>0 = note on; 0x80 o 0x90 vel0 = note off.
// Ignora el canal 10 (percusión) -> 'other'. Portado de pianova.html.
export interface MidiParsed { type: 'on' | 'off' | 'other'; midi: number; vel: number; channel: number; }

export function parseMidiMessage(data: Uint8Array): MidiParsed {
  const status = data[0] ?? 0;
  const cmd = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  const midi = data[1] ?? 0;
  const raw = data[2] ?? 0;
  const vel = raw / 127;
  if (channel === 10) return { type: 'other', midi, vel, channel };
  if (cmd === 0x90 && raw > 0) return { type: 'on', midi, vel, channel };
  if (cmd === 0x80 || (cmd === 0x90 && raw === 0)) return { type: 'off', midi, vel: 0, channel };
  return { type: 'other', midi, vel, channel };
}

export interface MidiHandlers {
  onNoteOn(midi: number, vel: number): void;
  onNoteOff(midi: number): void;
  onState(names: string[]): void;
}

// Conecta todas las entradas MIDI (varios teclados). Web MIDI se accede con 'any' porque sus tipos
// dependen del entorno; el parseo (la parte importante) va tipado y testeado arriba.
export async function connectMidi(h: MidiHandlers): Promise<void> {
  const req = (navigator as unknown as { requestMIDIAccess?: (o?: { sysex?: boolean }) => Promise<any> }).requestMIDIAccess;
  if (!req) { h.onState([]); throw new Error('Este navegador no soporta Web MIDI (usa Chrome/Edge y HTTPS).'); }
  const access: any = await req.call(navigator, { sysex: false });
  const bind = (): void => {
    const names: string[] = [];
    access.inputs.forEach((inp: any) => {
      inp.onmidimessage = (ev: any): void => {
        const p = parseMidiMessage(ev.data as Uint8Array);
        if (p.type === 'on') h.onNoteOn(p.midi, p.vel);
        else if (p.type === 'off') h.onNoteOff(p.midi);
      };
      names.push(inp.name ?? 'MIDI');
    });
    h.onState(names);
  };
  access.onstatechange = bind;
  bind();
}
```

- [ ] **Step 4: Verificar** — Run: `npm test` (pasa) · `npm run typecheck` · `npm run build`. Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add studio/src/midi/input.ts studio/src/midi/input.test.ts
git commit -m "Estudio F1: entrada MIDI (parseMidiMessage puro + test + connectMidi)"
```

---

### Task 4: Teclado en pantalla + teclas de ordenador

**Files:**
- Create: `studio/src/ui/keyboard.ts`, `studio/src/ui/keyboard.test.ts`.

**Interfaces:**
- Produces: `KEY_TO_SEMITONE: Record<string, number>` (puro);
  `mountKeyboard(root, opts: { onNoteOn(midi,vel), onNoteOff(midi), lowMidi, highMidi, baseMidi }): () => void`
  (devuelve una función de limpieza de listeners).

- [ ] **Step 1: Test del mapa de teclas (Vitest)** — `studio/src/ui/keyboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { KEY_TO_SEMITONE } from './keyboard';

describe('KEY_TO_SEMITONE', () => {
  it('mapea blancas A S D F G H J K a C D E F G A B C', () => {
    expect(KEY_TO_SEMITONE.a).toBe(0);  expect(KEY_TO_SEMITONE.s).toBe(2);
    expect(KEY_TO_SEMITONE.d).toBe(4);  expect(KEY_TO_SEMITONE.f).toBe(5);
    expect(KEY_TO_SEMITONE.g).toBe(7);  expect(KEY_TO_SEMITONE.h).toBe(9);
    expect(KEY_TO_SEMITONE.j).toBe(11); expect(KEY_TO_SEMITONE.k).toBe(12);
  });
  it('mapea negras W E T Y U a C# D# F# G# A#', () => {
    expect(KEY_TO_SEMITONE.w).toBe(1);  expect(KEY_TO_SEMITONE.e).toBe(3);
    expect(KEY_TO_SEMITONE.t).toBe(6);  expect(KEY_TO_SEMITONE.y).toBe(8);
    expect(KEY_TO_SEMITONE.u).toBe(10);
  });
});
```

- [ ] **Step 2: Correr el test (falla)** — Run: `npm test` → FALLA.

- [ ] **Step 3: Crear `studio/src/ui/keyboard.ts`**:

```ts
// Mapa de teclas del ordenador -> semitono (offset desde baseMidi). Portado de pianova.html.
export const KEY_TO_SEMITONE: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12
};

const WHITE = [0, 2, 4, 5, 7, 9, 11];   // semitonos de teclas blancas dentro de la octava
function isBlack(midi: number): boolean { return !WHITE.includes(((midi % 12) + 12) % 12); }

export interface KeyboardOpts {
  onNoteOn(midi: number, vel: number): void;
  onNoteOff(midi: number): void;
  lowMidi: number; highMidi: number; baseMidi: number;
}

// Dibuja un teclado clicable (ratón/táctil) + teclas del ordenador. Devuelve cleanup().
export function mountKeyboard(root: HTMLElement, opts: KeyboardOpts): () => void {
  const { onNoteOn, onNoteOff, lowMidi, highMidi, baseMidi } = opts;
  root.innerHTML = '';
  const kb = document.createElement('div'); kb.className = 'kb';
  const whites: number[] = [];
  for (let m = lowMidi; m <= highMidi; m++) if (!isBlack(m)) whites.push(m);
  kb.style.setProperty('--whites', String(whites.length));
  // teclas blancas
  whites.forEach(m => {
    const k = document.createElement('div'); k.className = 'kb-key kb-white'; k.dataset.midi = String(m);
    kb.appendChild(k);
  });
  // teclas negras (posicionadas sobre el hueco)
  for (let m = lowMidi; m <= highMidi; m++) {
    if (!isBlack(m)) continue;
    const leftWhiteIdx = whites.filter(w => w < m).length;   // nº de blancas a su izquierda
    const k = document.createElement('div'); k.className = 'kb-key kb-black'; k.dataset.midi = String(m);
    k.style.left = `calc(${leftWhiteIdx} * (100% / var(--whites)) - (100% / var(--whites)) * 0.3)`;
    kb.appendChild(k);
  }
  root.appendChild(kb);

  const down = (el: Element) => { const m = +(el as HTMLElement).dataset.midi!; el.classList.add('on'); onNoteOn(m, 0.85); };
  const up = (el: Element) => { const m = +(el as HTMLElement).dataset.midi!; el.classList.remove('on'); onNoteOff(m); };
  kb.addEventListener('pointerdown', e => { const t = e.target as HTMLElement; if (t.dataset.midi) { down(t); t.setPointerCapture?.(e.pointerId); } });
  kb.addEventListener('pointerup', e => { const t = e.target as HTMLElement; if (t.dataset.midi) up(t); });
  kb.addEventListener('pointerleave', e => { const t = e.target as HTMLElement; if (t.dataset.midi) up(t); });

  // teclas del ordenador (sin auto-repetición)
  const pressed = new Set<string>();
  const keyEl = (midi: number) => kb.querySelector<HTMLElement>(`[data-midi="${midi}"]`);
  const onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (!(key in KEY_TO_SEMITONE) || pressed.has(key) || e.repeat) return;
    pressed.add(key); const midi = baseMidi + KEY_TO_SEMITONE[key];
    keyEl(midi)?.classList.add('on'); onNoteOn(midi, 0.85);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (!(key in KEY_TO_SEMITONE) || !pressed.has(key)) return;
    pressed.delete(key); const midi = baseMidi + KEY_TO_SEMITONE[key];
    keyEl(midi)?.classList.remove('on'); onNoteOff(midi);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
}
```

- [ ] **Step 4: CSS del teclado.** Añade a `studio/src/ui/styles.css`:

```css
.kb { position:relative; display:flex; height:160px; max-width:720px; margin:18px 0; user-select:none; touch-action:none; }
.kb-key { box-sizing:border-box; cursor:pointer; }
.kb-white { flex:1; background:#f3f4f7; border:1px solid #b9bdc7; border-radius:0 0 6px 6px; }
.kb-white.on { background:var(--amber); }
.kb-black { position:absolute; top:0; width:calc((100% / var(--whites)) * 0.6); height:62%; background:#1b1f29; border:1px solid #000; border-radius:0 0 5px 5px; z-index:2; }
.kb-black.on { background:var(--amber); }
```

- [ ] **Step 5: Verificar** — Run: `npm test` (pasa) · `npm run typecheck` · `npm run build`. Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add studio/src/ui/keyboard.ts studio/src/ui/keyboard.test.ts studio/src/ui/styles.css
git commit -m "Estudio F1: teclado en pantalla + teclas de ordenador (KEY_TO_SEMITONE con test)"
```

---

### Task 5: Cablear la vista Estudio (instrumento + conectar MIDI + teclado)

**Files:**
- Create: `studio/src/app/studioView.ts`.
- Modify: `studio/src/app/shell.ts` (montar la vista Estudio).

**Interfaces:**
- Consumes: `synth` (noteOn/noteOff/setPreset/getPresetNames/allNotesOff), `connectMidi` (input.ts),
  `mountKeyboard` (keyboard.ts), `ensureAudio`.
- Produces: `mountStudioView(root: HTMLElement): void`.

- [ ] **Step 1: Crear `studio/src/app/studioView.ts`**:

```ts
import { ensureAudio } from '../audio/context';
import * as synth from '../audio/synth';
import { connectMidi } from '../midi/input';
import { mountKeyboard } from '../ui/keyboard';

// Monta la vista Estudio: selector de instrumento + conectar MIDI + teclado tocable.
export function mountStudioView(root: HTMLElement): void {
  const opts = synth.getPresetNames()
    .map(([k, label]) => `<option value="${k}">${label}</option>`).join('');
  root.innerHTML = `
    <div class="studioBar">
      <label class="fld">Instrumento
        <select id="stInstrument">${opts}</select>
      </label>
      <button id="stConnect">Conectar teclado</button>
      <span id="stMidi" class="muted">Sin conectar</span>
    </div>
    <div id="stKeyboard"></div>
    <p class="muted">Toca con el ratón, las teclas <b>A S D F G H J K</b> (blancas) / <b>W E T Y U</b> (negras), o tu teclado MIDI.</p>`;

  (root.querySelector('#stInstrument') as HTMLSelectElement).addEventListener('change', e => {
    synth.setPreset((e.target as HTMLSelectElement).value);
  });
  (root.querySelector('#stConnect') as HTMLButtonElement).addEventListener('click', () => {
    ensureAudio();
    const st = root.querySelector('#stMidi') as HTMLElement;
    connectMidi({
      onNoteOn: (m, v) => synth.noteOn(m, v),
      onNoteOff: (m) => synth.noteOff(m),
      onState: (names) => { st.textContent = names.length ? '🟢 ' + names.join(' · ') : 'Ningún teclado'; }
    }).catch(err => { st.textContent = '🔴 ' + (err?.message ?? 'Sin MIDI'); });
  });

  mountKeyboard(root.querySelector('#stKeyboard') as HTMLElement, {
    onNoteOn: (m, v) => { ensureAudio(); synth.noteOn(m, v); },
    onNoteOff: (m) => synth.noteOff(m),
    lowMidi: 60, highMidi: 84, baseMidi: 60
  });
}
```

- [ ] **Step 2: Montar la vista en `shell.ts`.** En `mountShell`, tras construir el `innerHTML`,
  reemplaza el contenido "próximamente" de Estudio montando la vista. Añade el import al principio:
  `import { mountStudioView } from './studioView';` y, después de obtener `const studio = root.querySelector('#viewStudio') as HTMLElement;`, añade: `mountStudioView(studio);`
  (la sección `#viewStudio` ya no necesita el texto "próximamente"; el `mountStudioView` lo sustituye).

- [ ] **Step 3: CSS de la barra.** Añade a `studio/src/ui/styles.css`:

```css
.studioBar { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
.fld { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:13px; }
.fld select { font:inherit; background:var(--panel); color:var(--ink); border:1px solid var(--line); border-radius:8px; padding:6px 9px; }
.muted { color:var(--muted); font-size:13px; }
```

- [ ] **Step 4: Verificar** — Run: `npm run typecheck` · `npm test` · `npm run build`. Expected: OK
  (build empaqueta synth/midi/keyboard ahora que la vista los usa).

- [ ] **Step 5: Verificación manual** (`npm run dev` en `studio/`): en la pestaña **Estudio** aparece el
  selector de instrumento + "Conectar teclado" + un teclado. Tocar con ratón/teclas **suena**; cambiar
  de instrumento cambia el sonido; "Conectar teclado" detecta el MIDI (o mensaje si no hay) y tocar el
  teclado físico suena. Subir fuerte no produce clipping. `pianova.html` sigue igual.

- [ ] **Step 6: Commit**

```bash
git add studio/src/app/studioView.ts studio/src/app/shell.ts studio/src/ui/styles.css
git commit -m "Estudio F1: vista Estudio cableada (instrumento + conectar MIDI + teclado) — toca y suena"
```

---

### Task 6: Versión y documentación

**Files:**
- Modify: `studio/package.json` (version), `HANDOFF.md`, `CLAUDE.md`.

- [ ] **Step 1: Subir versión del proyecto pro.** En `studio/package.json` cambia `"version": "0.1.0"`
  a `"version": "0.2.0"`.

- [ ] **Step 2: `HANDOFF.md`.** En el bloque del proyecto pro, marcar **Fase 1 hecha** y describir
  (español): cadena maestra (limitador+soft-clipper+makeup) en `audio/masterBus.ts`; motor synth (5
  presets) en `audio/synth.ts`; entrada MIDI (`midi/input.ts`, `parseMidiMessage` + `connectMidi`,
  ignora canal 10); teclado (`ui/keyboard.ts`, `KEY_TO_SEMITONE`); vista Estudio cableada
  (`app/studioView.ts`): selector de instrumento + Conectar teclado + teclado tocable. Tests Vitest:
  curva soft-clip, parseo MIDI, mapa de teclas. **Ya se puede tocar y oír en el Estudio.** Próxima: F2 suite TAP.

- [ ] **Step 3: `CLAUDE.md`.** En la decisión 5 / nota del `studio/`, actualizar la hoja de ruta para
  marcar **F1 hecha** (motor de instrumentos: synth + cadena maestra + MIDI + teclado en la vista Estudio).

- [ ] **Step 4: Verificar** — Run: `npm run build` (sin errores). Confirmar `version` 0.2.0 y docs.

- [ ] **Step 5: Commit**

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio F1 (motor de instrumentos) v0.2.0: version y docs"
```

---

## Notas de ejecución
- Verificación = `npm run typecheck` / `npm test` / `npm run build` desde `d:\PianoVa\studio`. No commitear `node_modules`/`dist`.
- Portar valores EXACTOS de `pianova.html` (cadena maestra, presets, envolvente, parseo MIDI). El synth conecta por `masterDest()`.
- Web MIDI se accede con `any` (tipos dependientes del entorno); `parseMidiMessage` va tipado/testeado.
- Entrada en vivo (sin `when`/agendado); el looper/agendado llega en su fase. No tocar `pianova.html`.
