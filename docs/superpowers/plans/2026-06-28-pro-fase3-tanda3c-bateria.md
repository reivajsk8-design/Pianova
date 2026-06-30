# Fase 3 · Sub-tanda 3C — Batería sintetizada 808 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un canal pueda ser de **batería** (voces 808 sintetizadas: bombo, caja, charles cerrado/abierto, clap, tom), para que el groovebox suene a caja de ritmos.

**Architecture:** `audio/drums.ts` genera las voces de percusión con osciladores + ruido + envolventes (`triggerDrum(actx, dest, voice, when, vel)`), con la generación de ruido como función pura testeable. `InstrumentSpec` pasa a ser una unión `synth | drum`; `daw/channel.ts` guarda el spec completo y `trigger` despacha (synth→`triggerPreset`, drum→`triggerDrum`). La UI (selector de instrumento) añade un grupo "Batería" con valores prefijados (`synth:`/`drum:`), y `studioView` despacha el teclado/MIDI según el tipo del canal seleccionado.

**Tech Stack:** TypeScript strict, Vite, Vitest, Web Audio API. Proyecto en `studio/`.

## Global Constraints

- Todo el código nuevo va en **`studio/`**; **TypeScript strict**; **Vitest** para lo puro; **sin framework de UI**; textos/comentarios en **español**. **No tocar `pianova.html`**.
- Reusar: `mulberry32` (`fx/effects/reverb-impulse.ts`), `synth.triggerPreset` (`audio/synth.ts`), `createRack` (`fx/rack.ts`), el modelo/canal/UI de 3B.
- **Batería sintetizada (nativa)**, sin samples (los samples por canal son una mejora posterior).
- El audio arranca tras gesto (`ensureAudio`). `exponentialRampToValueAtTime` nunca a 0 (mín. 0.0001); el pico de las envolventes con `Math.max(0.0002, …)`.
- Las voces son **de usar y tirar** (osciladores/buffers con auto-stop); no tocan estado compartido.
- Verificación por tarea desde `d:\PianoVa\studio`: `npm run typecheck` + `npm test` + `npm run build`. Prueba manual por oído.

---

### Task 1: Batería sintetizada (`audio/drums.ts`)

**Files:**
- Create: `studio/src/audio/drums.ts`
- Test: `studio/src/audio/drums.test.ts`

**Interfaces:**
- Consumes: `mulberry32` de `../fx/effects/reverb-impulse`.
- Produces: `DRUM_VOICES` (tupla readonly), `type DrumVoice`, `DRUM_LABELS: Record<DrumVoice,string>`, `whiteNoiseSamples(n, seed?): Float32Array` (pura), `triggerDrum(actx: AudioContext, dest: AudioNode, voice: DrumVoice, when: number, vel?: number): void`.

- [ ] **Step 1: Escribe el test que falla**

```ts
// studio/src/audio/drums.test.ts
import { describe, it, expect } from 'vitest';
import { whiteNoiseSamples, DRUM_VOICES, DRUM_LABELS } from './drums';

describe('whiteNoiseSamples', () => {
  it('tiene la longitud pedida', () => { expect(whiteNoiseSamples(500).length).toBe(500); });
  it('es determinista con la misma semilla', () => {
    expect(Array.from(whiteNoiseSamples(32, 9))).toEqual(Array.from(whiteNoiseSamples(32, 9)));
  });
  it('está acotado en [-1,1] y no es todo ceros', () => {
    const s = whiteNoiseSamples(1000, 3);
    let energy = 0;
    for (let i = 0; i < s.length; i++) { expect(Math.abs(s[i])).toBeLessThanOrEqual(1); energy += Math.abs(s[i]); }
    expect(energy).toBeGreaterThan(0);
  });
});

describe('DRUM_VOICES', () => {
  it('tiene las 6 voces y una etiqueta por voz', () => {
    expect(DRUM_VOICES).toEqual(['kick', 'snare', 'hatClosed', 'hatOpen', 'clap', 'tom']);
    for (const v of DRUM_VOICES) expect(typeof DRUM_LABELS[v]).toBe('string');
  });
});
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `npm test`
Expected: FAIL — `Failed to load url ./drums`.

- [ ] **Step 3: Implementa `audio/drums.ts`**

```ts
// studio/src/audio/drums.ts
// Batería sintetizada estilo 808: cada voz = osciladores + ruido + envolventes, agendada en `when`.
// De usar y tirar (auto-stop). La generación de ruido es pura y testeable.
import { mulberry32 } from '../fx/effects/reverb-impulse';

export const DRUM_VOICES = ['kick', 'snare', 'hatClosed', 'hatOpen', 'clap', 'tom'] as const;
export type DrumVoice = typeof DRUM_VOICES[number];

export const DRUM_LABELS: Record<DrumVoice, string> = {
  kick: '🥁 Bombo', snare: '🪘 Caja', hatClosed: '🎩 Charles cerrado',
  hatOpen: '🎩 Charles abierto', clap: '👏 Clap', tom: '🛢️ Tom'
};

// Ruido blanco [-1,1] con semilla (determinista, testeable).
export function whiteNoiseSamples(n: number, seed = 1): Float32Array {
  const out = new Float32Array(n);
  const rnd = mulberry32(seed);
  for (let i = 0; i < n; i++) out[i] = rnd() * 2 - 1;
  return out;
}

let _noiseBuf: AudioBuffer | null = null;
function noiseBuffer(actx: AudioContext): AudioBuffer {
  if (!_noiseBuf || _noiseBuf.length !== actx.sampleRate) {
    const n = actx.sampleRate;   // 1 s de ruido en bucle/recorte
    _noiseBuf = actx.createBuffer(1, n, actx.sampleRate);
    const data = _noiseBuf.getChannelData(0);
    const s = whiteNoiseSamples(n, 1);
    for (let i = 0; i < n; i++) data[i] = s[i];
  }
  return _noiseBuf;
}

// Dispara una voz de batería en el tiempo de audio `when` hacia `dest`. `vel` 0..1 escala el pico.
export function triggerDrum(actx: AudioContext, dest: AudioNode, voice: DrumVoice, when: number, vel = 0.9): void {
  const v = Math.max(0.05, vel);
  const peak = (p: number): number => Math.max(0.0002, p * v);

  if (voice === 'kick' || voice === 'tom') {
    const o = actx.createOscillator(); o.type = 'sine';
    const g = actx.createGain();
    const f0 = voice === 'kick' ? 150 : 200, f1 = voice === 'kick' ? 50 : 90;
    const pf = voice === 'kick' ? 0.08 : 0.12, dur = voice === 'kick' ? 0.28 : 0.3, amp = voice === 'kick' ? 1.0 : 0.8;
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(f1, when + pf);
    g.gain.setValueAtTime(peak(amp), when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(dest);
    o.start(when); o.stop(when + dur + 0.04);
    return;
  }

  if (voice === 'snare') {
    // cuerpo tonal
    const o = actx.createOscillator(); o.type = 'triangle'; o.frequency.value = 180;
    const og = actx.createGain();
    og.gain.setValueAtTime(peak(0.5), when);
    og.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
    o.connect(og); og.connect(dest); o.start(when); o.stop(when + 0.16);
    // ruido (banda media)
    const n = actx.createBufferSource(); n.buffer = noiseBuffer(actx);
    const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.7;
    const ng = actx.createGain();
    ng.gain.setValueAtTime(peak(0.7), when);
    ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
    n.connect(bp); bp.connect(ng); ng.connect(dest); n.start(when); n.stop(when + 0.2);
    return;
  }

  // charles (cerrado/abierto) y clap = ruido filtrado con distinta duración
  const n = actx.createBufferSource(); n.buffer = noiseBuffer(actx);
  const f = actx.createBiquadFilter();
  const g = actx.createGain();
  let dur: number;
  if (voice === 'clap') { f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.8; dur = 0.12; }
  else { f.type = 'highpass'; f.frequency.value = 7000; dur = voice === 'hatOpen' ? 0.3 : 0.045; }
  g.gain.setValueAtTime(peak(0.6), when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  n.connect(f); f.connect(g); g.connect(dest); n.start(when); n.stop(when + dur + 0.02);
}
```

- [ ] **Step 4: Ejecuta el test y comprueba que pasa**

Run: `npm test`
Expected: PASS (4 tests nuevos + previos).

- [ ] **Step 5: Commit**

```bash
git add studio/src/audio/drums.ts studio/src/audio/drums.test.ts
git commit -m "Estudio F3: bateria sintetizada 808 (voces + triggerDrum + ruido puro) + test"
```

---

### Task 2: Instrumento de batería en el modelo y el canal (`daw/model.ts`, `daw/channel.ts`)

**Files:**
- Modify: `studio/src/daw/model.ts` (unión `InstrumentSpec`).
- Modify: `studio/src/daw/channel.ts` (guardar `InstrumentSpec`; `trigger` despacha; `setInstrument`).

**Interfaces:**
- Consumes: `triggerDrum`/`DrumVoice` (`../audio/drums`), `InstrumentSpec` (`./model`).
- Produces: `InstrumentSpec = { kind:'synth'; preset:string } | { kind:'drum'; voice:string }`; `Channel` con `setInstrument(spec: InstrumentSpec): void` (sustituye a `preset()`/`setPreset`); `trigger` despacha synth/drum.

- [ ] **Step 1: Amplía `InstrumentSpec` en `daw/model.ts`**

Cambia la línea:

```ts
export type InstrumentSpec = { kind: 'synth'; preset: string };
```

por:

```ts
export type InstrumentSpec = { kind: 'synth'; preset: string } | { kind: 'drum'; voice: string };
```

- [ ] **Step 2: Reescribe `daw/channel.ts`** (guarda el spec completo; `trigger` despacha; `setInstrument`)

```ts
// studio/src/daw/channel.ts
// Canal de audio del groovebox: instrumentBus -> [rack del canal] -> gain (vol/mute) -> pan -> masterIn.
// Es el espejo vivo del ChannelState; el modelo (daw/model) sigue siendo la fuente de verdad de los datos.
import { createRack, Rack } from '../fx/rack';
import * as synth from '../audio/synth';
import { triggerDrum, DrumVoice } from '../audio/drums';
import type { ChannelState, InstrumentSpec } from './model';
import type { RackState } from '../fx/rack-core';

export interface Channel {
  id: string;
  instrumentBus: GainNode;
  rack: Rack;
  setInstrument(spec: InstrumentSpec): void;
  setVolume(v: number): void;
  setPan(p: number): void;
  setAudible(a: boolean): void;
  trigger(note: number, vel: number, when: number): void;
  serializeRack(): RackState;
  dispose(): void;
}

export function makeChannel(actx: AudioContext, state: ChannelState, masterIn: AudioNode): Channel {
  const instrumentBus = actx.createGain();
  const gain = actx.createGain();
  const panner = actx.createStereoPanner(); panner.pan.value = state.pan;
  const rack = createRack(actx, instrumentBus, gain);   // instrumentBus -> [rack] -> gain
  gain.connect(panner); panner.connect(masterIn);
  rack.restore(state.rack);

  let volume = state.volume;
  let audible = true;
  let instrument: InstrumentSpec = state.instrument;
  const applyGain = (): void => { gain.gain.value = audible ? volume : 0; };
  applyGain();

  return {
    id: state.id, instrumentBus, rack,
    setInstrument(spec) { instrument = spec; },
    setVolume(v) { volume = v; applyGain(); },
    setPan(p) { panner.pan.value = p; },
    setAudible(a) { audible = a; applyGain(); },
    trigger(note, vel, when) {
      if (instrument.kind === 'drum') triggerDrum(actx, instrumentBus, instrument.voice as DrumVoice, when, vel);
      else synth.triggerPreset(instrument.preset, note, vel, when, 0.12, instrumentBus);
    },
    serializeRack: () => rack.serialize(),
    dispose() {
      rack.dispose();
      for (const n of [instrumentBus, gain, panner]) { try { n.disconnect(); } catch { /* ya */ } }
    }
  };
}
```

- [ ] **Step 3: Verifica typecheck + tests + build**

Run: `npm run typecheck` → **fallará** en `studioView.ts` (aún usa `setPreset`/`ch.instrument.preset` sin guardar) — es esperado y se arregla en la Task 3. Run: `npm test` → verde. Run: `npm run build` → puede avisar del mismo punto de `studioView`; si solo es eso, es esperado.

- [ ] **Step 4: Commit**

```bash
git add studio/src/daw/model.ts studio/src/daw/channel.ts
git commit -m "Estudio F3: InstrumentSpec synth|drum + canal despacha synth/bateria (setInstrument)"
```

> Nota de orden: igual que en 3B, este cambio rompe el typecheck global por `studioView` hasta la **Task 3**. Verifica con `npm test`; el typecheck global vuelve a verde al cerrar la Task 3.

---

### Task 3: Selector de batería en la UI (`ui/channelstrip.ts`, `app/studioView.ts`)

**Files:**
- Modify: `studio/src/ui/channelstrip.ts` (dropdown con grupo de batería, valores prefijados).
- Modify: `studio/src/app/studioView.ts` (parseo del instrumento, despacho de teclado/MIDI por tipo, `routeKeyboardToSelected` solo synth).

**Interfaces:**
- Consumes: `DRUM_VOICES`/`DRUM_LABELS` (`../audio/drums`), `InstrumentSpec` (`../daw/model`), `Channel.setInstrument`.
- Produces: nada nuevo.

- [ ] **Step 1: Reescribe `ui/channelstrip.ts`** (dos grupos: Sintetizados y Batería; valores `synth:<preset>` / `drum:<voz>`)

```ts
// studio/src/ui/channelstrip.ts
// HTML de la tira de un canal (controles). Los eventos los engancha studioView por delegación (data-*).
import type { ChannelState } from '../daw/model';
import { getPresetNames } from '../audio/synth';
import { DRUM_VOICES, DRUM_LABELS } from '../audio/drums';

export function channelStripHTML(ch: ChannelState, index: number, selected: boolean): string {
  const cur = ch.instrument.kind === 'drum' ? `drum:${ch.instrument.voice}` : `synth:${ch.instrument.preset}`;
  const synthOpts = getPresetNames()
    .map(([k, label]) => `<option value="synth:${k}"${cur === `synth:${k}` ? ' selected' : ''}>${label}</option>`).join('');
  const drumOpts = DRUM_VOICES
    .map(vc => `<option value="drum:${vc}"${cur === `drum:${vc}` ? ' selected' : ''}>${DRUM_LABELS[vc]}</option>`).join('');
  return `<div class="chStrip${selected ? ' sel' : ''}">
    <div class="chHead">
      <button class="chSel" data-sel="${ch.id}" title="Seleccionar (lo toca el teclado)">${index + 1}</button>
      <select class="chInst" data-inst="${ch.id}">
        <optgroup label="Sintetizados">${synthOpts}</optgroup>
        <optgroup label="Batería">${drumOpts}</optgroup>
      </select>
      <button class="chBtn${ch.muted ? ' on' : ''}" data-mute="${ch.id}" title="Silenciar">M</button>
      <button class="chBtn${ch.soloed ? ' onS' : ''}" data-solo="${ch.id}" title="Solo">S</button>
      <button class="chBtn" data-fx="${ch.id}" title="Efectos del canal">🎛</button>
      <button class="chBtn" data-del="${ch.id}" title="Quitar canal">✕</button>
    </div>
    <div class="chMix">
      <label title="Volumen">Vol <input type="range" data-vol="${ch.id}" min="0" max="1.2" step="0.01" value="${ch.volume}"></label>
      <label title="Paneo">Pan <input type="range" data-pan="${ch.id}" min="-1" max="1" step="0.05" value="${ch.pan}"></label>
    </div>
  </div>`;
}
```

- [ ] **Step 2: En `app/studioView.ts`, añade `InstrumentSpec` al import del modelo**

Busca la línea del import desde `'../daw/model'` y añade `InstrumentSpec` a la lista de tipos importados, p. ej.:

```ts
import {
  DawState, ChannelState, InstrumentSpec, defaultChannel, addChannel, removeChannel,
  updateChannel, toggleStep, findChannel, audibleIds
} from '../daw/model';
```

- [ ] **Step 3: En `app/studioView.ts`, guarda `routeKeyboardToSelected` para que solo enrute synth**

Reemplaza la función `routeKeyboardToSelected` por:

```ts
  function routeKeyboardToSelected(): void {
    const audio = channels.find(a => a.id === selectedId);
    const ch = findChannel(daw, selectedId);
    if (audio && ch && ch.instrument.kind === 'synth') { synth.setSynthOut(audio.instrumentBus); synth.setPreset(ch.instrument.preset); }
  }
```

- [ ] **Step 4: En `app/studioView.ts`, añade los helpers `playLive`/`stopLive`** (justo después de `routeKeyboardToSelected`)

```ts
  // Toca en vivo el canal seleccionado: batería = golpe one-shot; synth = nota sostenida.
  function playLive(m: number, v: number): void {
    const ch = findChannel(daw, selectedId);
    if (ch?.instrument.kind === 'drum') {
      const audio = channels.find(a => a.id === selectedId);
      const actx = getAudioContext();
      if (audio && actx) audio.trigger(m, v, actx.currentTime);
    } else { routeKeyboardToSelected(); synth.noteOn(m, v); }
  }
  function stopLive(m: number): void {
    const ch = findChannel(daw, selectedId);
    if (ch?.instrument.kind !== 'drum') synth.noteOff(m);
  }
```

- [ ] **Step 5: En `app/studioView.ts`, usa los helpers en el teclado y en el MIDI**

Reemplaza el bloque `mountKeyboard(...)` por:

```ts
  mountKeyboard(root.querySelector('#stKeyboard') as HTMLElement, {
    onNoteOn: (m, v) => { audioOn(); playLive(m, v); },
    onNoteOff: (m) => stopLive(m),
    lowMidi: 60, highMidi: 84, baseMidi: 60
  });
```

Y dentro del handler de **Conectar teclado** (`connectMidi({...})`), reemplaza `onNoteOn`/`onNoteOff` por:

```ts
      onNoteOn: (m, v) => playLive(m, v),
      onNoteOff: (m) => stopLive(m),
```

- [ ] **Step 6: En `app/studioView.ts`, parsea el valor del selector de instrumento**

En el listener de `change` de `#channels`, reemplaza el bloque del `data-inst` por:

```ts
    const inst = t.getAttribute('data-inst');
    if (inst) {
      const [kind, name] = t.value.split(':');
      const spec: InstrumentSpec = kind === 'drum' ? { kind: 'drum', voice: name } : { kind: 'synth', preset: name };
      daw = updateChannel(daw, inst, { instrument: spec });
      channels.find(a => a.id === inst)?.setInstrument(spec);
      if (inst === selectedId) routeKeyboardToSelected();
      persist();
    }
```

- [ ] **Step 7: Verifica typecheck + tests + build** (typecheck global vuelve a verde)

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 8: Prueba manual (navegador)**

Run: `npm run dev`. En un canal, elige en el selector una voz del grupo **Batería** (p. ej. Bombo). Programa pasos y pulsa **▶**: debe sonar la percusión. Crea un canal Bombo, otro Caja, otro Charles cerrado y haz un ritmo. Selecciona un canal de batería y toca el teclado → suena el golpe (one-shot). Los canales de synth siguen igual (notas sostenidas).

- [ ] **Step 9: Commit**

```bash
git add studio/src/ui/channelstrip.ts studio/src/app/studioView.ts
git commit -m "Estudio F3: selector con grupo Bateria + despacho de teclado/MIDI por tipo de canal"
```

---

### Task 4: Versión y documentación

**Files:**
- Modify: `studio/package.json` (version), `HANDOFF.md`, `CLAUDE.md`.

- [ ] **Step 1: Sube la versión.** En `studio/package.json` cambia `"version": "0.10.0"` a `"version": "0.11.0"`.

- [ ] **Step 2: `HANDOFF.md`.** Añade la **Sub-tanda 3C**: `audio/drums.ts` (batería 808 sintetizada: `DRUM_VOICES` bombo/caja/charles cerrado/abierto/clap/tom + `triggerDrum` con osc+ruido+envolventes; `whiteNoiseSamples` pura+testeada reusando `mulberry32`); `InstrumentSpec` ahora es `synth | drum`; `daw/channel.ts` guarda el spec y `trigger` despacha (synth→`triggerPreset`, drum→`triggerDrum`) + `setInstrument`; UI: el selector de canal añade un grupo **Batería** (valores `synth:`/`drum:`), y `studioView` despacha el teclado/MIDI por tipo (`playLive`/`stopLive`: batería one-shot, synth sostenido) y `routeKeyboardToSelected` solo enruta synth. Próximo: **3D (patrones + song mode)**.

- [ ] **Step 3: `CLAUDE.md`.** En la decisión 5, marca **3C hecha** (batería sintetizada 808 como tipo de canal); pendientes 3D patrones+song, 3E swing+MIDI.

- [ ] **Step 4: Verifica** — `npm run build` (OK). Confirma `version` 0.11.0 y las docs.

- [ ] **Step 5: Commit**

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio F3 sub-tanda 3C (bateria 808) v0.11.0: version y docs"
```

---

## Notas de ejecución
- Verificación = `npm run typecheck` / `npm test` / `npm run build` desde `d:\PianoVa\studio`. No commitear `node_modules`/`dist`.
- **Orden:** la Task 2 (unión `InstrumentSpec` + canal) rompe el typecheck global por `studioView` hasta la **Task 3**; verifica con `npm test` entre medias.
- Las voces de batería son one-shot agendadas en `when`; el secuenciador ya llama `channel.trigger(note,vel,when)` y el canal despacha según el tipo. La nota se ignora en batería (percusión).
- El teclado/MIDI sobre un canal de batería dispara un golpe inmediato (`playLive` con `currentTime`); sobre un canal synth, nota sostenida (`noteOn`/`noteOff`).
- No tocar `pianova.html`. Textos/comentarios en español.
```
