# Sinte editable por canal (motor de oscilador) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir al Estudio un tercer tipo de instrumento de canal, un **sinte editable (`synthx`)** con mezcla de ondas + sub + unison, ADSR, filtro LP/BP con resonancia y LFO, editable en un cajón inferior con knobs.

**Architecture:** DSP puro (tipos, clamps, unison/sub, defaults, presets, normalización) separado y testeado en `audio/synthx-dsp.ts`; el motor de audio `audio/synthx.ts` (disparo agendado + voz viva) reutiliza el patrón del synth actual; el modelo gana la variante `synthx` en `InstrumentSpec` y el canal la despacha; la UI añade una opción al selector del canal y un editor (`ui/synthEditor.ts`) montado en un cajón inferior nuevo, con los knobs de `ui/knob.ts`.

**Tech Stack:** Vite + TypeScript (strict) + Vitest. Sin framework de UI. Web Audio API. Textos y comentarios en español.

## Global Constraints

- Todo el trabajo va en `studio/` (NO tocar `pianova.html`).
- TypeScript **strict**; sin dependencias nuevas de instalación.
- Comentarios y textos de interfaz **en español**.
- El audio arranca tras gesto del usuario (`ensureAudio()`); `exponentialRampToValueAtTime` **nunca** a 0 (mínimo `0.0001`); el nivel de sustain nunca 0 exacto (mínimo `0.0001`).
- Lógica pura (clamps, unison/sub, defaults, normalización) separada del audio/DOM y testeada.
- El motor sigue el contrato del synth actual: disparo agendado con `when`+gate `dur` hacia un `dest` concreto (el `instrumentBus` del canal).
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Comandos siempre desde `studio/` (donde está `package.json`).

---

### Task 1: DSP puro del sinte (`audio/synthx-dsp.ts`)

**Files:**
- Create: `studio/src/audio/synthx-dsp.ts`
- Test: `studio/src/audio/synthx-dsp.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `interface SynthxParams` (ver código).
  - `clamp01(v)`, `clampHz(v)` (20..20000), `clampQ(v)` (0.3..20), `clampTime(v)` (0..3), `clampDetune(v)` (0..50), `clampRate(v)` (0.1..20).
  - `unisonDetunes(cents: number): number[]` — `0`→`[0]`; `>0`→`[cents, -cents]`.
  - `subFreqRatio(): number` — `0.5`.
  - `SYNTHX_DEFAULT: SynthxParams`, `SYNTHX_PRESETS: Record<string, SynthxParams>` (bajo, lead, pluck, pad), `synthxPresetNames(): [string,string][]`.
  - `normalizeParams(p: Partial<SynthxParams> | undefined): SynthxParams` — rellena defaults y aplica clamps.

- [ ] **Step 1: Write the failing test**

```ts
// studio/src/audio/synthx-dsp.test.ts
import { describe, it, expect } from 'vitest';
import {
  clamp01, clampHz, clampQ, clampTime, clampDetune, clampRate,
  unisonDetunes, subFreqRatio, SYNTHX_DEFAULT, SYNTHX_PRESETS, synthxPresetNames, normalizeParams
} from './synthx-dsp';

describe('synthx-dsp', () => {
  it('clamps acotan a sus rangos', () => {
    expect(clamp01(-1)).toBe(0); expect(clamp01(2)).toBe(1);
    expect(clampHz(5)).toBe(20); expect(clampHz(99999)).toBe(20000);
    expect(clampQ(0)).toBeCloseTo(0.3, 6); expect(clampQ(99)).toBe(20);
    expect(clampTime(-1)).toBe(0); expect(clampTime(9)).toBe(3);
    expect(clampDetune(-5)).toBe(0); expect(clampDetune(80)).toBe(50);
    expect(clampRate(0)).toBeCloseTo(0.1, 6); expect(clampRate(50)).toBe(20);
  });

  it('unisonDetunes: 0 da una voz; >0 da par simétrico', () => {
    expect(unisonDetunes(0)).toEqual([0]);
    expect(unisonDetunes(12)).toEqual([12, -12]);
  });

  it('el sub suena una octava por debajo', () => {
    expect(subFreqRatio()).toBeCloseTo(0.5, 6);
  });

  it('hay 4 presets con nombre', () => {
    expect(Object.keys(SYNTHX_PRESETS).sort()).toEqual(['bajo', 'lead', 'pad', 'pluck']);
    expect(synthxPresetNames().length).toBe(4);
  });

  it('normalizeParams: objeto vacío da el default completo', () => {
    expect(normalizeParams(undefined)).toEqual(SYNTHX_DEFAULT);
    expect(normalizeParams({})).toEqual(SYNTHX_DEFAULT);
  });

  it('normalizeParams: acota valores fuera de rango y corrige tipos inválidos', () => {
    const n = normalizeParams({ cutoff: 999999, resonance: 0, sine: 5, filterType: 'x' as never, lfoDest: 'z' as never });
    expect(n.cutoff).toBe(20000);
    expect(n.resonance).toBeCloseTo(0.3, 6);
    expect(n.sine).toBe(1);
    expect(n.filterType).toBe('lowpass');
    expect(n.lfoDest).toBe('off');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd studio && npm test -- synthx-dsp`
Expected: FAIL (no existe `./synthx-dsp`).

- [ ] **Step 3: Write minimal implementation**

```ts
// studio/src/audio/synthx-dsp.ts
// Parámetros y matemática (pura) del sinte editable por canal. Sin audio ni DOM.

export interface SynthxParams {
  sine: number; square: number; saw: number;   // 0..1 mezcla de las 3 ondas base
  sub: number;                                  // 0..1 nivel del sub-oscilador (seno, una octava abajo)
  detune: number;                               // 0..50 cents de unison (0 = sin unison)
  filterType: 'lowpass' | 'bandpass';
  cutoff: number;                               // 20..20000 Hz
  resonance: number;                            // 0.3..20 Q
  attack: number; decay: number; sustain: number; release: number;  // ADSR (sustain 0..1)
  lfoDest: 'off' | 'pitch' | 'filter';
  lfoRate: number;                              // 0.1..20 Hz
  lfoDepth: number;                             // 0..1
}

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
export const clampHz = (v: number): number => Math.max(20, Math.min(20000, v));
export const clampQ = (v: number): number => Math.max(0.3, Math.min(20, v));
export const clampTime = (v: number): number => Math.max(0, Math.min(3, v));
export const clampDetune = (v: number): number => Math.max(0, Math.min(50, v));
export const clampRate = (v: number): number => Math.max(0.1, Math.min(20, v));

// Desafinados (cents) de las voces de unison: 0 -> una voz; >0 -> par simétrico.
export function unisonDetunes(cents: number): number[] {
  return cents > 0 ? [cents, -cents] : [0];
}

// El sub-oscilador suena una octava por debajo (relación de frecuencia).
export function subFreqRatio(): number { return 0.5; }

export const SYNTHX_DEFAULT: SynthxParams = {
  sine: 0.6, square: 0, saw: 0.4, sub: 0, detune: 0,
  filterType: 'lowpass', cutoff: 6000, resonance: 1,
  attack: 0.01, decay: 0.3, sustain: 0, release: 0.2,
  lfoDest: 'off', lfoRate: 5, lfoDepth: 0.3
};

export const SYNTHX_PRESETS: Record<string, SynthxParams> = {
  bajo:  { sine: 0.5, square: 0.2, saw: 0.3, sub: 0.6, detune: 0, filterType: 'lowpass', cutoff: 800, resonance: 6, attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.15, lfoDest: 'off', lfoRate: 5, lfoDepth: 0.3 },
  lead:  { sine: 0, square: 0.3, saw: 0.7, sub: 0, detune: 12, filterType: 'lowpass', cutoff: 4000, resonance: 3, attack: 0.01, decay: 0.4, sustain: 0.6, release: 0.2, lfoDest: 'pitch', lfoRate: 5, lfoDepth: 0.1 },
  pluck: { sine: 0.6, square: 0, saw: 0.4, sub: 0, detune: 0, filterType: 'lowpass', cutoff: 6000, resonance: 2, attack: 0.005, decay: 0.25, sustain: 0, release: 0.15, lfoDest: 'off', lfoRate: 5, lfoDepth: 0.3 },
  pad:   { sine: 0.4, square: 0, saw: 0.5, sub: 0.2, detune: 18, filterType: 'lowpass', cutoff: 3000, resonance: 1, attack: 0.4, decay: 0.5, sustain: 0.7, release: 0.6, lfoDest: 'filter', lfoRate: 0.5, lfoDepth: 0.4 }
};

const PRESET_LABELS: Record<string, string> = { bajo: '🔊 Bajo', lead: '🎯 Lead', pluck: '🪕 Pluck', pad: '🌫️ Pad' };
export function synthxPresetNames(): [string, string][] {
  return Object.keys(SYNTHX_PRESETS).map(k => [k, PRESET_LABELS[k] ?? k]);
}

// Rellena defaults y aplica clamps a un objeto posiblemente incompleto (al abrir proyectos).
export function normalizeParams(p: Partial<SynthxParams> | undefined): SynthxParams {
  const d = SYNTHX_DEFAULT;
  const o = p ?? {};
  return {
    sine: clamp01(o.sine ?? d.sine), square: clamp01(o.square ?? d.square), saw: clamp01(o.saw ?? d.saw),
    sub: clamp01(o.sub ?? d.sub), detune: clampDetune(o.detune ?? d.detune),
    filterType: o.filterType === 'bandpass' ? 'bandpass' : 'lowpass',
    cutoff: clampHz(o.cutoff ?? d.cutoff), resonance: clampQ(o.resonance ?? d.resonance),
    attack: clampTime(o.attack ?? d.attack), decay: clampTime(o.decay ?? d.decay),
    sustain: clamp01(o.sustain ?? d.sustain), release: clampTime(o.release ?? d.release),
    lfoDest: (o.lfoDest === 'pitch' || o.lfoDest === 'filter') ? o.lfoDest : 'off',
    lfoRate: clampRate(o.lfoRate ?? d.lfoRate), lfoDepth: clamp01(o.lfoDepth ?? d.lfoDepth)
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd studio && npm test -- synthx-dsp`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add studio/src/audio/synthx-dsp.ts studio/src/audio/synthx-dsp.test.ts
git commit -m "Estudio sinte: DSP puro (params + clamps + unison/sub + presets + normalize) + tests"
```

---

### Task 2: Motor de audio del sinte (`audio/synthx.ts`)

**Files:**
- Create: `studio/src/audio/synthx.ts`

**Interfaces:**
- Consumes: `SynthxParams`, `unisonDetunes`, `subFreqRatio` (Task 1); `ensureAudio` (`audio/context.ts`); `masterDest` (`audio/masterBus.ts`).
- Produces:
  - `triggerSynthx(actx: AudioContext, p: SynthxParams, midi: number, vel: number, when: number, dur: number, dest: AudioNode): void` — dispara una voz agendada (gate `dur`) de usar y tirar.
  - `noteOnSynthx(p: SynthxParams, midi: number, vel: number, dest: AudioNode): void` y `noteOffSynthx(midi: number): void` — voz viva sostenida (teclado).

Audio puro (Web Audio); sin test unitario (el DSP ya está cubierto en Task 1). Verificado por typecheck + build.

- [ ] **Step 1: Write the module**

```ts
// studio/src/audio/synthx.ts
// Motor del sinte editable: mezcla de ondas + sub + unison -> ADSR -> filtro LP/BP -> dest, con LFO opcional.
import { ensureAudio } from './context';
import { masterDest } from './masterBus';
import { SynthxParams, unisonDetunes, subFreqRatio } from './synthx-dsp';

interface Built { g: GainNode; oscs: OscillatorNode[]; lfo: OscillatorNode | null; }

// Construye osciladores + filtro + LFO hacia `dest`, devuelve el gain de envolvente y los nodos a parar.
function buildVoice(actx: AudioContext, p: SynthxParams, freq: number, at: number, dest: AudioNode): Built {
  const g = actx.createGain();
  const filt = actx.createBiquadFilter();
  filt.type = p.filterType === 'bandpass' ? 'bandpass' : 'lowpass';
  filt.frequency.value = p.cutoff; filt.Q.value = p.resonance;
  g.connect(filt); filt.connect(dest);

  const oscs: OscillatorNode[] = [];
  const waves: [OscillatorType, number][] = [['sine', p.sine], ['square', p.square], ['sawtooth', p.saw]];
  for (const [type, level] of waves) {
    if (!(level > 0)) continue;
    for (const cents of unisonDetunes(p.detune)) {
      const o = actx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = cents;
      const og = actx.createGain(); og.gain.value = level;
      o.connect(og); og.connect(g); oscs.push(o);
    }
  }
  if (p.sub > 0) {
    const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = freq * subFreqRatio();
    const og = actx.createGain(); og.gain.value = p.sub;
    o.connect(og); og.connect(g); oscs.push(o);
  }

  let lfo: OscillatorNode | null = null;
  if (p.lfoDest !== 'off') {
    lfo = actx.createOscillator(); lfo.frequency.value = p.lfoRate;
    const depth = actx.createGain();
    if (p.lfoDest === 'pitch') { depth.gain.value = p.lfoDepth * 50; oscs.forEach(o => depth.connect(o.detune)); }
    else { depth.gain.value = p.lfoDepth * p.cutoff; depth.connect(filt.frequency); }
    lfo.connect(depth); lfo.start(at);
  }
  oscs.forEach(o => o.start(at));
  return { g, oscs, lfo };
}

// Disparo agendado (secuenciador): ADSR con gate `dur`, luego release; para todo al final.
export function triggerSynthx(actx: AudioContext, p: SynthxParams, midi: number, vel: number, when: number, dur: number, dest: AudioNode): void {
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const out = dest ?? masterDest();
  const { g, oscs, lfo } = buildVoice(actx, p, freq, when, out);
  const peak = Math.max(0.0002, (0.16 + 0.22 * vel));
  const sus = Math.max(0.0001, peak * p.sustain);
  const a = Math.max(0.001, p.attack), d = Math.max(0.001, p.decay), rel = Math.max(0.02, p.release);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + a);
  g.gain.exponentialRampToValueAtTime(sus, when + a + d);
  const gateEnd = when + Math.max(dur, a + d);
  g.gain.setValueAtTime(Math.max(0.0001, sus), gateEnd);
  g.gain.exponentialRampToValueAtTime(0.0001, gateEnd + rel);
  const stopAt = gateEnd + rel + 0.03;
  oscs.forEach(o => o.stop(stopAt));
  if (lfo) lfo.stop(stopAt);
}

// --- Voz viva (teclado): sostiene en el nivel de sustain hasta noteOff ---
interface Live { g: GainNode; oscs: OscillatorNode[]; lfo: OscillatorNode | null; release: number; }
const liveVoices: Record<number, Live> = {};

export function noteOnSynthx(p: SynthxParams, midi: number, vel: number, dest: AudioNode): void {
  const actx = ensureAudio();
  if (liveVoices[midi]) noteOffSynthx(midi);
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const t = actx.currentTime;
  const { g, oscs, lfo } = buildVoice(actx, p, freq, t, dest ?? masterDest());
  const peak = Math.max(0.0002, (0.16 + 0.22 * vel));
  const sus = Math.max(0.0001, peak * p.sustain);
  const a = Math.max(0.001, p.attack), d = Math.max(0.001, p.decay);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(sus, t + a + d);
  liveVoices[midi] = { g, oscs, lfo, release: Math.max(0.02, p.release) };
}

export function noteOffSynthx(midi: number): void {
  const v = liveVoices[midi]; if (!v) return;
  const actx = ensureAudio();
  const t = actx.currentTime;
  try {
    const cur = v.g.gain.value;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setValueAtTime(Math.max(cur, 0.0001), t);
    v.g.gain.exponentialRampToValueAtTime(0.0001, t + v.release);
  } catch { /* ignora */ }
  const stopAt = t + v.release + 0.03;
  v.oscs.forEach(o => { try { o.stop(stopAt); } catch { /* ya */ } });
  if (v.lfo) { try { v.lfo.stop(stopAt); } catch { /* ya */ } }
  delete liveVoices[midi];
}
```

- [ ] **Step 2: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: ambos PASS.

- [ ] **Step 3: Commit**

```bash
git add studio/src/audio/synthx.ts
git commit -m "Estudio sinte: motor de audio (triggerSynthx agendado + noteOn/off vivo, con LFO)"
```

---

### Task 3: Modelo y disparo del canal (`daw/model.ts` + `daw/channel.ts`)

**Files:**
- Modify: `studio/src/daw/model.ts`
- Modify: `studio/src/daw/channel.ts`
- Test: `studio/src/daw/model.test.ts` (añadir casos)

**Interfaces:**
- Consumes: `SynthxParams`, `SYNTHX_DEFAULT` (Task 1); `triggerSynthx` (Task 2).
- Produces:
  - `InstrumentSpec` gana `| { kind: 'synthx'; params: SynthxParams }`.
  - `defaultSynthxInstrument(): InstrumentSpec` — `{ kind:'synthx', params: {...SYNTHX_DEFAULT} }` (copia).

**Nota:** al añadir `synthx` al union, `channel.ts` deja de compilar hasta añadir su rama; por eso ambos archivos van en la MISMA tarea (el cambio de union y su consumidor juntos → build verde al cerrar la tarea).

- [ ] **Step 1: Write the failing test (añadir a model.test.ts)**

Añade al final del `describe` existente en `studio/src/daw/model.test.ts` (o dentro de un `describe('synthx', ...)` nuevo):

```ts
import { defaultSynthxInstrument } from './model';
import { SYNTHX_DEFAULT } from '../audio/synthx-dsp';

describe('instrumento synthx', () => {
  it('defaultSynthxInstrument crea un synthx con los params por defecto (copia)', () => {
    const inst = defaultSynthxInstrument();
    expect(inst.kind).toBe('synthx');
    if (inst.kind === 'synthx') {
      expect(inst.params).toEqual(SYNTHX_DEFAULT);
      expect(inst.params).not.toBe(SYNTHX_DEFAULT);   // es copia, no la referencia compartida
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd studio && npm test -- model`
Expected: FAIL (no existe `defaultSynthxInstrument`).

- [ ] **Step 3: Edit `daw/model.ts`**

Localiza la definición de `InstrumentSpec` (línea ~6) y amplíala; añade el import y el helper:

```ts
import { SynthxParams, SYNTHX_DEFAULT } from '../audio/synthx-dsp';

export type InstrumentSpec =
  | { kind: 'synth'; preset: string }
  | { kind: 'drum'; voice: string }
  | { kind: 'synthx'; params: SynthxParams };

export function defaultSynthxInstrument(): InstrumentSpec {
  return { kind: 'synthx', params: { ...SYNTHX_DEFAULT } };
}
```

(No cambies el resto del modelo. `defaultChannel` sigue creando `{kind:'synth', preset}`.)

- [ ] **Step 4: Edit `daw/channel.ts` (rama synthx en trigger)**

En `studio/src/daw/channel.ts`, añade el import y la rama en `trigger`:

```ts
import { triggerSynthx } from '../audio/synthx';
```

Y sustituye el cuerpo de `trigger`:

```ts
    trigger(note, vel, when) {
      if (instrument.kind === 'drum') triggerDrum(actx, instrumentBus, instrument.voice as DrumVoice, when, vel);
      else if (instrument.kind === 'synthx') triggerSynthx(actx, instrument.params, note, vel, when, 0.12, instrumentBus);
      else synth.triggerPreset(instrument.preset, note, vel, when, 0.12, instrumentBus);
    },
```

- [ ] **Step 5: Run tests and build**

Run: `cd studio && npm test -- model && npm run typecheck && npm run build`
Expected: test PASS; typecheck y build PASS (la rama synthx hace compilar el union nuevo).

- [ ] **Step 6: Commit**

```bash
git add studio/src/daw/model.ts studio/src/daw/channel.ts studio/src/daw/model.test.ts
git commit -m "Estudio sinte: InstrumentSpec 'synthx' + defaultSynthxInstrument + disparo en el canal"
```

---

### Task 4: Persistencia tolerante del synthx (`app/store.ts`)

**Files:**
- Modify: `studio/src/app/store.ts`
- Test: `studio/src/app/store.test.ts` (añadir casos)

**Interfaces:**
- Consumes: `normalizeParams` (Task 1); `ChannelState`, `InstrumentSpec` (`daw/model`).
- Produces: `dawV3` normaliza los `params` de los canales `synthx` al cargar (defaults si faltan/mal). Comportamiento observable: un canal `synthx` con `params` incompletos se completa; el resto de canales, intactos.

- [ ] **Step 1: Write the failing test (añadir a store.test.ts)**

```ts
import { parseProject } from './store';
import { SYNTHX_DEFAULT } from '../audio/synthx-dsp';

describe('store · synthx tolerante', () => {
  it('normaliza los params de un canal synthx incompleto al abrir', () => {
    const proj = {
      version: 3,
      daw: {
        channels: [{ id: 'c1', name: 'Canal', instrument: { kind: 'synthx', params: { cutoff: 999999 } },
          volume: 0.8, pan: 0, muted: false, soloed: false, rack: { effects: [] } }],
        patterns: [{ steps: { c1: [] } }], current: 0, song: [], bpm: 120, steps: 16, swing: 0
      },
      masterRack: { effects: [] }
    };
    const p = parseProject(JSON.stringify(proj));
    const inst = p.daw.channels[0].instrument;
    expect(inst.kind).toBe('synthx');
    if (inst.kind === 'synthx') {
      expect(inst.params.cutoff).toBe(20000);              // acotado
      expect(inst.params.sine).toBe(SYNTHX_DEFAULT.sine);  // relleno por defecto
      expect(inst.params.lfoDest).toBe('off');
    }
  });

  it('no toca los canales synth/drum', () => {
    const proj = {
      version: 3,
      daw: {
        channels: [{ id: 'c1', name: 'C', instrument: { kind: 'synth', preset: 'organo' },
          volume: 0.8, pan: 0, muted: false, soloed: false, rack: { effects: [] } }],
        patterns: [{ steps: { c1: [] } }], current: 0, song: [], bpm: 120, steps: 16, swing: 0
      },
      masterRack: { effects: [] }
    };
    const p = parseProject(JSON.stringify(proj));
    expect(p.daw.channels[0].instrument).toEqual({ kind: 'synth', preset: 'organo' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd studio && npm test -- store`
Expected: FAIL (cutoff no se acota; `dawV3` pasa `o.channels` tal cual).

- [ ] **Step 3: Edit `app/store.ts`**

Añade el import y una función que normalice el instrumento de cada canal; úsala en `dawV3`:

```ts
import { normalizeParams } from '../audio/synthx-dsp';
```

Justo encima de `function dawV3(...)` añade:

```ts
// Normaliza el instrumento de un canal (rellena/acota los params de synthx; deja synth/drum igual).
function normalizeChannel(c: ChannelState): ChannelState {
  if (c.instrument && c.instrument.kind === 'synthx') {
    return { ...c, instrument: { kind: 'synthx', params: normalizeParams(c.instrument.params) } };
  }
  return c;
}
```

Y en `dawV3`, cambia `channels: o.channels,` por:

```ts
    channels: o.channels.map(normalizeChannel),
```

- [ ] **Step 4: Run tests**

Run: `cd studio && npm test -- store && npm run typecheck && npm run build`
Expected: PASS (2 tests nuevos verdes; build verde).

- [ ] **Step 5: Commit**

```bash
git add studio/src/app/store.ts studio/src/app/store.test.ts
git commit -m "Estudio sinte: persistencia tolerante (normaliza params de canales synthx al abrir) + tests"
```

---

### Task 5: Opción y botón en la tira de canal (`ui/channelstrip.ts`)

**Files:**
- Modify: `studio/src/ui/channelstrip.ts`

**Interfaces:**
- Consumes: `ChannelState` (`daw/model`).
- Produces: el `<select class="chInst">` incluye un `optgroup` "Sinte editable" con `value="synthx"`; cuando `ch.instrument.kind === 'synthx'`, ese `<option>` va `selected` y aparece un botón `data-syned` (✏️) en `.chBtns`.

DOM; sin test unitario. Verificado por typecheck + build.

- [ ] **Step 1: Edit `ui/channelstrip.ts`**

Reemplaza el contenido por (añade el valor `cur` para synthx, el optgroup y el botón ✏️):

```ts
// HTML de la tira de un canal (controles). Los eventos los engancha studioView por delegación (data-*).
import type { ChannelState } from '../daw/model';
import { getPresetNames } from '../audio/synth';
import { DRUM_VOICES, DRUM_LABELS } from '../audio/drums';

export function channelStripHTML(ch: ChannelState, index: number, selected: boolean): string {
  const cur = ch.instrument.kind === 'drum' ? `drum:${ch.instrument.voice}`
    : ch.instrument.kind === 'synthx' ? 'synthx'
    : `synth:${ch.instrument.preset}`;
  const synthOpts = getPresetNames()
    .map(([k, label]) => `<option value="synth:${k}"${cur === `synth:${k}` ? ' selected' : ''}>${label}</option>`).join('');
  const drumOpts = DRUM_VOICES
    .map(vc => `<option value="drum:${vc}"${cur === `drum:${vc}` ? ' selected' : ''}>${DRUM_LABELS[vc]}</option>`).join('');
  const isSynthx = ch.instrument.kind === 'synthx';
  return `<div class="chStrip${selected ? ' sel' : ''}">
    <div class="chMain">
      <div class="chHead">
        <button class="chSel" data-sel="${ch.id}" title="Seleccionar (lo toca el teclado)">${index + 1}</button>
        <select class="chInst" data-inst="${ch.id}">
          <optgroup label="Sintetizados">${synthOpts}</optgroup>
          <optgroup label="Sinte editable"><option value="synthx"${isSynthx ? ' selected' : ''}>🎚️ Sinte editable</option></optgroup>
          <optgroup label="Batería">${drumOpts}</optgroup>
        </select>
      </div>
      <div class="chBtns">
        ${isSynthx ? `<button class="chBtn" data-syned="${ch.id}" title="Editar el sinte">✏️</button>` : ''}
        <button class="chBtn${ch.muted ? ' on' : ''}" data-mute="${ch.id}" title="Silenciar">M</button>
        <button class="chBtn${ch.soloed ? ' onS' : ''}" data-solo="${ch.id}" title="Solo">S</button>
        <button class="chBtn" data-fx="${ch.id}" title="Efectos del canal">🎛</button>
        <button class="chBtn" data-del="${ch.id}" title="Quitar canal">✕</button>
      </div>
    </div>
    <div class="chMix">
      <div class="knobCell" title="Volumen (arrastra ↕ · doble-clic resetea)"><div class="knob" data-vol="${ch.id}"></div><span>Vol</span></div>
      <div class="knobCell" title="Paneo (arrastra ↕ · doble-clic centra)"><div class="knob" data-pan="${ch.id}"></div><span>Pan</span></div>
    </div>
  </div>`;
}
```

- [ ] **Step 2: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add studio/src/ui/channelstrip.ts
git commit -m "Estudio sinte: opción 'Sinte editable' + botón ✏️ en la tira de canal"
```

---

### Task 6: Editor del sinte (`ui/synthEditor.ts` + CSS)

**Files:**
- Create: `studio/src/ui/synthEditor.ts`
- Modify: `studio/src/ui/styles.css`

**Interfaces:**
- Consumes: `SynthxParams`, `synthxPresetNames`, `SYNTHX_PRESETS` (Task 1); `mountKnob` (`ui/knob.ts`).
- Produces: `mountSynthEditor(root: HTMLElement, opts: { params: SynthxParams; onChange: (p: SynthxParams) => void; onTest: () => void }): void` — pinta el editor y engancha knobs/selectores; cada cambio construye un `SynthxParams` nuevo y llama `onChange`; el botón Probar llama `onTest`.

DOM; sin test unitario. Verificado por typecheck + build.

- [ ] **Step 1: Write the module**

```ts
// studio/src/ui/synthEditor.ts
// Editor del sinte editable (cajón inferior): knobs por secciones OSC/FILTRO/ADSR/LFO + Probar.
import { SynthxParams, synthxPresetNames, SYNTHX_PRESETS } from '../audio/synthx-dsp';
import { mountKnob } from './knob';

export function mountSynthEditor(
  root: HTMLElement,
  opts: { params: SynthxParams; onChange: (p: SynthxParams) => void; onTest: () => void }
): void {
  let p: SynthxParams = { ...opts.params };
  const emit = (): void => opts.onChange({ ...p });

  const presetOpts = synthxPresetNames().map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  root.innerHTML = `<div class="synthEd">
    <div class="seRow">
      <label class="fld">Cargar preset <select class="sePreset"><option value="">—</option>${presetOpts}</select></label>
      <button class="chBtn seTest" title="Probar el sonido">▶ Probar</button>
    </div>
    <div class="seGrid">
      <div class="seSec"><h4>OSC</h4><div class="seKnobs">
        <div class="knobCell"><div class="knob" data-k="sine"></div><span>Seno</span></div>
        <div class="knobCell"><div class="knob" data-k="square"></div><span>Cuad</span></div>
        <div class="knobCell"><div class="knob" data-k="saw"></div><span>Sierra</span></div>
        <div class="knobCell"><div class="knob" data-k="sub"></div><span>Sub</span></div>
        <div class="knobCell"><div class="knob" data-k="detune"></div><span>Detune</span></div>
      </div></div>
      <div class="seSec"><h4>FILTRO</h4><div class="seKnobs">
        <label class="fld">Tipo <select class="seFilter"><option value="lowpass">LP</option><option value="bandpass">BP</option></select></label>
        <div class="knobCell"><div class="knob" data-k="cutoff"></div><span>Corte</span></div>
        <div class="knobCell"><div class="knob" data-k="resonance"></div><span>Reso</span></div>
      </div></div>
      <div class="seSec"><h4>ADSR</h4><div class="seKnobs">
        <div class="knobCell"><div class="knob" data-k="attack"></div><span>A</span></div>
        <div class="knobCell"><div class="knob" data-k="decay"></div><span>D</span></div>
        <div class="knobCell"><div class="knob" data-k="sustain"></div><span>S</span></div>
        <div class="knobCell"><div class="knob" data-k="release"></div><span>R</span></div>
      </div></div>
      <div class="seSec"><h4>LFO</h4><div class="seKnobs">
        <label class="fld">Destino <select class="seLfo"><option value="off">Off</option><option value="pitch">Tono</option><option value="filter">Filtro</option></select></label>
        <div class="knobCell"><div class="knob" data-k="lfoRate"></div><span>Vel</span></div>
        <div class="knobCell"><div class="knob" data-k="lfoDepth"></div><span>Prof</span></div>
      </div></div>
    </div>
  </div>`;

  // Rango y default de cada knob (coinciden con los clamps del DSP).
  const K: Record<string, { min: number; max: number; def: number }> = {
    sine: { min: 0, max: 1, def: 0.6 }, square: { min: 0, max: 1, def: 0 }, saw: { min: 0, max: 1, def: 0.4 },
    sub: { min: 0, max: 1, def: 0 }, detune: { min: 0, max: 50, def: 0 },
    cutoff: { min: 20, max: 20000, def: 6000 }, resonance: { min: 0.3, max: 20, def: 1 },
    attack: { min: 0, max: 3, def: 0.01 }, decay: { min: 0, max: 3, def: 0.3 },
    sustain: { min: 0, max: 1, def: 0 }, release: { min: 0, max: 3, def: 0.2 },
    lfoRate: { min: 0.1, max: 20, def: 5 }, lfoDepth: { min: 0, max: 1, def: 0.3 }
  };
  const knobs = root.querySelectorAll<HTMLElement>('.knob[data-k]');
  knobs.forEach(el => {
    const key = el.getAttribute('data-k') as keyof SynthxParams;
    const spec = K[key];
    mountKnob(el, { min: spec.min, max: spec.max, value: p[key] as number, default: spec.def,
      onChange: v => { (p[key] as number) = v; emit(); } });
  });

  const fSel = root.querySelector('.seFilter') as HTMLSelectElement; fSel.value = p.filterType;
  fSel.addEventListener('change', () => { p.filterType = fSel.value === 'bandpass' ? 'bandpass' : 'lowpass'; emit(); });
  const lSel = root.querySelector('.seLfo') as HTMLSelectElement; lSel.value = p.lfoDest;
  lSel.addEventListener('change', () => { p.lfoDest = (lSel.value === 'pitch' || lSel.value === 'filter') ? lSel.value : 'off'; emit(); });

  const pSel = root.querySelector('.sePreset') as HTMLSelectElement;
  pSel.addEventListener('change', () => {
    const pr = SYNTHX_PRESETS[pSel.value];
    if (pr) { p = { ...pr }; emit(); mountSynthEditor(root, { params: p, onChange: opts.onChange, onTest: opts.onTest }); }
  });
  (root.querySelector('.seTest') as HTMLButtonElement).addEventListener('click', () => opts.onTest());
}
```

- [ ] **Step 2: Add CSS**

Añade al final de `studio/src/ui/styles.css`:

```css
/* --- Editor del sinte editable --- */
.synthEd { padding: 6px 4px; }
.seRow { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.seGrid { display: flex; flex-wrap: wrap; gap: 16px; }
.seSec { border: 1px solid #2a2f3a; border-radius: 8px; padding: 8px 10px; }
.seSec h4 { margin: 0 0 6px; font-size: 11px; color: #9aa0ac; letter-spacing: .06em; }
.seKnobs { display: flex; align-items: flex-end; gap: 12px; }
.seKnobs .knobCell { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 10px; color: #cdd2db; }
.seTest { background: #2a2f3a; color: #e8eaed; border: 1px solid #3a4150; border-radius: 6px; padding: 5px 10px; cursor: pointer; }
```

- [ ] **Step 3: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add studio/src/ui/synthEditor.ts studio/src/ui/styles.css
git commit -m "Estudio sinte: editor (cajón) con knobs OSC/FILTRO/ADSR/LFO + presets + Probar"
```

---

### Task 7: Integración en el Estudio (`app/studioView.ts`)

**Files:**
- Modify: `studio/src/app/studioView.ts`

**Interfaces:**
- Consumes: `defaultSynthxInstrument` (Task 3); `noteOnSynthx`, `noteOffSynthx`, `triggerSynthx` (Task 2); `mountSynthEditor` (Task 6); `updateChannel`, `findChannel` (ya en `daw/model`); patrón del cajón `#fxDrawer`.
- Produces: cajón `#synthDrawer` que se abre con `data-syned` y muestra el editor del canal; el selector de instrumento acepta `synthx`; el teclado en vivo toca el sinte del canal seleccionado; editar un knob actualiza el modelo + `persist` + el audio del canal; Probar suena.

Integración (audio + DOM); sin test unitario. Verificado por typecheck + build + prueba por oído.

- [ ] **Step 1: Add the `#synthDrawer` to the view HTML**

En el `root.innerHTML` de `studioView.ts`, justo después del bloque `<div id="fxDrawer" ...>...</div>` (antes del backtick de cierre), añade:

```html
    <div id="synthDrawer" class="fxDrawer">
      <div class="fxDrawerHead">
        <b id="synthTitle">Sinte editable</b>
        <span class="grow"></span>
        <button id="synthClose" class="chBtn" title="Cerrar el panel">✕ Cerrar</button>
      </div>
      <div id="synthEdHost"></div>
    </div>
```

- [ ] **Step 2: Wire imports**

En las importaciones de `studioView.ts` añade:

```ts
import { defaultSynthxInstrument } from '../daw/model';
import * as synthx from '../audio/synthx';
import { mountSynthEditor } from '../ui/synthEditor';
```

(Si `updateChannel`/`findChannel` no están ya importados de `../daw/model`, añádelos al import existente de ese módulo.)

- [ ] **Step 3: Live keyboard for synthx (playLive/stopLive/routeKeyboardToSelected)**

Sustituye `playLive` y `stopLive` por versiones que contemplen `synthx`:

```ts
  function playLive(m: number, v: number): void {
    const ch = findChannel(daw, selectedId);
    const audio = channels.find(a => a.id === selectedId);
    if (ch?.instrument.kind === 'drum') {
      const actx = getAudioContext();
      if (audio && actx) audio.trigger(m, v, actx.currentTime);
    } else if (ch?.instrument.kind === 'synthx') {
      if (audio) synthx.noteOnSynthx(ch.instrument.params, m, v, audio.instrumentBus);
    } else { routeKeyboardToSelected(); synth.noteOn(m, v); }
    if (recording && seq.isPlaying()) recordStep(m, v);
  }
  function stopLive(m: number): void {
    const ch = findChannel(daw, selectedId);
    if (ch?.instrument.kind === 'synthx') { synthx.noteOffSynthx(m); return; }
    if (ch && ch.instrument.kind !== 'drum') synth.noteOff(m);
  }
```

- [ ] **Step 4: Instrument selector accepts `synthx`**

Localiza el manejador del `data-inst` (el `change` del selector de instrumento; busca `data-inst` o `getAttribute('data-inst')`). Debe fijar el instrumento según el valor. Ajústalo para soportar `synthx` (además de `synth:<preset>` y `drum:<voice>`). El patrón resultante:

```ts
    const inst = t.getAttribute('data-inst');   // en el handler 'change' del select
    if (inst) {
      const val = (t as HTMLSelectElement).value;
      let spec;
      if (val === 'synthx') spec = defaultSynthxInstrument();
      else if (val.startsWith('drum:')) spec = { kind: 'drum', voice: val.slice(5) } as const;
      else spec = { kind: 'synth', preset: val.slice(6) } as const;
      daw = updateChannel(daw, inst, { instrument: spec });
      const audio = channels.find(a => a.id === inst); if (audio) audio.setInstrument(spec);
      if (inst === selectedId) routeKeyboardToSelected();
      persist(); renderChannels(); return;
    }
```

(Si el handler existente ya construye `spec` de otra forma, respeta su estructura y solo añade la rama `val === 'synthx'` → `defaultSynthxInstrument()`. Lee el handler real antes de editar.)

- [ ] **Step 5: Open the synth drawer on `data-syned` + editor wiring**

Junto al manejador de `data-fx` (que hace `selectChannel(fx); openDrawer();`), añade el de `data-syned` en la misma delegación de `#channels`:

```ts
    const syn = t.getAttribute('data-syned');
    if (syn) { selectChannel(syn); openSynthEditor(syn); return; }
```

Y añade estas funciones (cerca de `openDrawer`) + el cierre del cajón:

```ts
  const synthDrawer = root.querySelector('#synthDrawer') as HTMLElement;
  (root.querySelector('#synthClose') as HTMLButtonElement).addEventListener('click', () => synthDrawer.classList.remove('open'));

  function openSynthEditor(id: string): void {
    audioOn();
    const ch = findChannel(daw, id);
    if (!ch || ch.instrument.kind !== 'synthx') return;
    const n = daw.channels.findIndex(c => c.id === id) + 1;
    const titleEl = root.querySelector('#synthTitle'); if (titleEl) titleEl.textContent = 'Sinte editable · Canal ' + n;
    mountSynthEditor(root.querySelector('#synthEdHost') as HTMLElement, {
      params: ch.instrument.params,
      onChange: (p) => {
        const spec = { kind: 'synthx', params: p } as const;
        daw = updateChannel(daw, id, { instrument: spec });
        const audio = channels.find(a => a.id === id); if (audio) audio.setInstrument(spec);
        persist();
      },
      onTest: () => {
        const audio = channels.find(a => a.id === id);
        const cur = findChannel(daw, id);
        const actx = getAudioContext();
        if (audio && actx && cur && cur.instrument.kind === 'synthx') {
          synthx.triggerSynthx(actx, cur.instrument.params, 60, 0.9, actx.currentTime, 0.4, audio.instrumentBus);
        }
      }
    });
    synthDrawer.classList.add('open');
  }
```

- [ ] **Step 6: Verify typecheck, tests and build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS (typecheck limpio, tests verdes, `dist/` generado).

- [ ] **Step 7: Manual smoke test (prueba por oído)**

Run: `cd studio && npm run dev` y abre la URL.
Verifica:
1. En un canal, el selector muestra "🎚️ Sinte editable"; al elegirlo aparece el botón ✏️.
2. ✏️ abre el cajón del editor con knobs (OSC/FILTRO/ADSR/LFO).
3. Mover Corte/Reso/ADSR/osciladores cambia el sonido; ▶ Probar suena.
4. "Cargar preset" (Bajo/Lead/Pluck/Pad) cambia el sonido.
5. Tocar el teclado (canal seleccionado) suena con el sinte; secuenciar el canal suena.
6. Guardar y reabrir el proyecto conserva el sinte y sus ajustes.

- [ ] **Step 8: Commit**

```bash
git add studio/src/app/studioView.ts
git commit -m "Estudio sinte: integración (cajón editor + selector synthx + teclado en vivo + Probar)"
```

---

### Task 8: Docs y versión

**Files:**
- Modify: `studio/package.json` (subir `version` a `0.14.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.14.0"`.

- [ ] **Step 2: Update HANDOFF.md**

Añade, en la zona de estado del Estudio (tras el último bloque de Fase 3), este párrafo:

```markdown
**Estudio · Sinte editable por canal (v0.14.0):** tercer tipo de instrumento de canal `synthx` (además de
los presets fijos y la batería): mezcla de ondas (seno/cuadrada/sierra) + sub-oscilador + unison/detune,
ADSR, filtro LP/BP con resonancia y LFO (a tono o filtro). Motor `audio/synthx.ts` (`triggerSynthx`
agendado + `noteOnSynthx`/`noteOffSynthx` en vivo) sobre DSP puro y testeado `audio/synthx-dsp.ts` (clamps,
unison, sub, `SYNTHX_DEFAULT`, `SYNTHX_PRESETS` bajo/lead/pluck/pad, `normalizeParams`). Editor en cajón
inferior (`ui/synthEditor.ts`) con knobs por secciones OSC/FILTRO/ADSR/LFO + presets + Probar. Persistencia
tolerante (los params viajan en `instrument`; se normalizan al abrir), sin migración. Portado/ampliado del
sinte editable de `pianova.html` v1.36.
```

- [ ] **Step 3: Update CLAUDE.md**

En la sección del proyecto pro / Estudio (decisión 5), añade una frase al estado indicando que el Estudio
tiene ya un **sinte editable por canal** (`synthx`: osc blend + sub + unison + ADSR + filtro + LFO, con
editor en cajón), primer paso de las mejoras de sonido (pendientes: sampler con slicing y EQ gráfico pro).

- [ ] **Step 4: Verify and commit**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio sinte: docs (HANDOFF/CLAUDE) y versión 0.14.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- DSP puro (clamps, unison, sub, defaults, presets, normalizeParams) → Task 1 ✅
- Motor `triggerSynthx` + voz viva → Task 2 ✅
- `InstrumentSpec` synthx + disparo del canal → Task 3 ✅
- Persistencia tolerante sin migración → Task 4 ✅
- UI: opción en selector + botón ✏️ → Task 5 ✅
- Editor en cajón con knobs + presets + Probar → Task 6 ✅
- Integración (cajón, teclado en vivo, edición en vivo) → Task 7 ✅
- Presets de fábrica (bajo/lead/pluck/pad) → Task 1 (datos) + Task 6 (UI) ✅
- Docs/versión → Task 8 ✅

**Build verde en cada tarea:** todos los cambios son aditivos salvo el union `InstrumentSpec` (Task 3), que toca el modelo y su consumidor (`channel.ts`) en la MISMA tarea para no dejar el build roto.

**Placeholders:** ninguno; el código va completo. (Los "(Si el handler existente…)" de la Task 7 son avisos para leer el código real antes de editar, no marcadores pendientes: el patrón de reemplazo está dado.)

**Consistencia de tipos:** `SynthxParams` (Task 1) se usa igual en Tasks 2/3/4/6/7. `triggerSynthx(actx,p,midi,vel,when,dur,dest)` y `noteOnSynthx(p,midi,vel,dest)`/`noteOffSynthx(midi)` (Task 2) coinciden con su uso en Tasks 3 y 7. `defaultSynthxInstrument()` (Task 3) se usa en Tasks 5/7. `mountSynthEditor(root,{params,onChange,onTest})` (Task 6) coincide con Task 7.

**Limitación consciente (YAGNI):** una voz por nota (sin polifonía extra por unison más allá del par); un solo LFO con un destino; el editor no muestra el valor numérico de cada knob (coherente con los knobs de Vol/Pan actuales). Ampliable en el futuro.
