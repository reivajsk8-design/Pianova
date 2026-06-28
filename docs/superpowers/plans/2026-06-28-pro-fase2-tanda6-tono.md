# Fase 2 · Tanda 6 — Tono / Generadores (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la suite TAP con los 2 efectos de tono/generadores: **Pitch Shifter** (primer AudioWorklet del proyecto, granular) y **Pink/Fractal Noise** (generador de ruido rosa nativo en bucle).

**Architecture:** Se introduce la infraestructura de AudioWorklet con Vite: un módulo procesador (`pitch-processor.ts`) cargado con `audioWorklet.addModule(new URL(...))`, registrado **antes** de crear cualquier nodo (la vista Estudio pasa a inicializar los racks de forma asíncrona, esperando a que el worklet esté listo). La ventana del pitch (triangular) es pura y testeable. El Pink Noise es un `AudioBufferSourceNode` en bucle con muestras de ruido rosa generadas por una función pura (algoritmo de Paul Kellet, reusa el PRNG `mulberry32`); como es una fuente, devuelve `teardown` que la para.

**Tech Stack:** TypeScript strict, Vite (AudioWorklet via `new URL(...,import.meta.url)`), Vitest, Web Audio API. Proyecto en `studio/`.

## Global Constraints

- Todo el código nuevo va en **`studio/`**; **TypeScript strict**; **Vitest** para lo puro; **sin framework de UI**; textos/comentarios en **español**. **No tocar `pianova.html`**.
- Reusar el marco: `makeEffect`, `registerEffect`, `ParamSpec` de `studio/src/fx/effect.ts`; `mulberry32` de `studio/src/fx/effects/reverb-impulse.ts`. Registrar e importar cada efecto en `studio/src/fx/effects/index.ts`.
- `family: 'tone'` para los 2.
- **AudioWorklet + Vite:** el procesador se carga con `actx.audioWorklet.addModule(new URL('./effects/worklets/pitch-processor.ts', import.meta.url).href)`. Debe estar registrado **antes** de `new AudioWorkletNode(...)`. El módulo procesador corre en el `AudioWorkletGlobalScope` (sin DOM): declara sus tipos ambientales (`registerProcessor`, `AudioWorkletProcessor`, `sampleRate`) en el propio archivo.
- La función de ventana del pitch (`triWindow`) y el generador de ruido (`pinkNoiseSamples`) son **puros y testeables**.
- El Pink Noise es una fuente (`AudioBufferSourceNode`) → `build` devuelve `{ apply, teardown }` que para la fuente. El Pitch usa un `AudioWorkletNode` → su `teardown` lo desconecta.
- Verificación por tarea desde `d:\PianoVa\studio`: `npm run typecheck` + `npm test` + `npm run build`. Prueba manual por oído (especialmente que el worklet carga y el pitch cambia el tono).

---

### Task 1: Infraestructura AudioWorklet + procesador de pitch (`fx/effects/pitch-dsp.ts`, `fx/effects/worklets/pitch-processor.ts`, `fx/worklets.ts`, `app/studioView.ts`, `fx/rack.ts`)

**Files:**
- Create: `studio/src/fx/effects/pitch-dsp.ts` (ventana pura), `studio/src/fx/effects/pitch-dsp.test.ts`, `studio/src/fx/effects/worklets/pitch-processor.ts` (procesador), `studio/src/fx/worklets.ts` (carga del módulo).
- Modify: `studio/src/app/studioView.ts` (init de racks asíncrono esperando los worklets), `studio/src/fx/rack.ts` (`add` tolera que `create` lance).

**Interfaces:**
- Consumes: `ensureAudio` (ya existe), `mulberry32` (no aquí), `createRack`/`mountRack` (ya existen).
- Produces: `triWindow(x: number): number` (pura); `ensureWorklets(actx: AudioContext): Promise<void>` (carga e idempotente). El procesador registra `'pitch-processor'`.

- [ ] **Step 1: Escribe el test que falla** (ventana triangular pura)

```ts
// studio/src/fx/effects/pitch-dsp.test.ts
import { describe, it, expect } from 'vitest';
import { triWindow } from './pitch-dsp';

describe('triWindow', () => {
  it('vale 0 en los bordes y 1 en el centro', () => {
    expect(triWindow(0)).toBeCloseTo(0, 6);
    expect(triWindow(0.5)).toBeCloseTo(1, 6);
    expect(triWindow(1)).toBeCloseTo(0, 6);
  });
  it('dos ventanas desfasadas media unidad suman 1 (crossfade constante)', () => {
    for (const x of [0.1, 0.25, 0.4, 0.7, 0.9]) {
      const x2 = (x + 0.5) % 1;
      expect(triWindow(x) + triWindow(x2)).toBeCloseTo(1, 6);
    }
  });
});
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `npm test`
Expected: FAIL — `Failed to load url ./pitch-dsp`.

- [ ] **Step 3: Implementa `pitch-dsp.ts`**

```ts
// studio/src/fx/effects/pitch-dsp.ts
// Ventana triangular para el crossfade granular del pitch shifter. Pura y testeable.
// triWindow(x) con x en [0,1]: 0 en los bordes, 1 en el centro. Dos ventanas a media unidad de
// desfase suman 1 (crossfade de amplitud constante).
export function triWindow(x: number): number {
  return 1 - Math.abs(2 * x - 1);
}
```

- [ ] **Step 4: Ejecuta el test y comprueba que pasa**

Run: `npm test`
Expected: PASS (los 2 tests nuevos + previos).

- [ ] **Step 5: Crea el procesador del worklet** (`fx/effects/worklets/pitch-processor.ts`)

```ts
// studio/src/fx/effects/worklets/pitch-processor.ts
// AudioWorkletProcessor: pitch shifter granular (dos lecturas con crossfade triangular sobre un buffer
// circular). Corre en el AudioWorkletGlobalScope (sin DOM): se declaran sus tipos ambientales.
import { triWindow } from '../pitch-dsp';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
interface AudioWorkletProcessorImpl {
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}
declare const AudioWorkletProcessor: { prototype: AudioWorkletProcessorImpl; new (): AudioWorkletProcessorImpl };

const BUF = 8192;     // tamaño del buffer circular (muestras)
const GRAIN = 2048;   // tamaño del grano (afecta al desfase de las dos lecturas)

// Lectura con interpolación lineal y envoltura en el buffer circular.
function readFrac(ring: Float32Array, pos: number): number {
  const n = ring.length;
  let p = pos % n; if (p < 0) p += n;
  const i0 = Math.floor(p);
  const frac = p - i0;
  const i1 = (i0 + 1) % n;
  return ring[i0] * (1 - frac) + ring[i1] * frac;
}

class PitchProcessor extends AudioWorkletProcessor {
  private rings: Float32Array[] = [];
  private w = 0;     // posición de escritura
  private ph = 0;    // fase del grano [0, GRAIN)

  static get parameterDescriptors() {
    return [{ name: 'pitch', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' as const }];
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const semis = parameters.pitch.length ? parameters.pitch[0] : 0;
    const ratio = Math.pow(2, semis / 12);
    const dphase = 1 - ratio;       // cuánto se mueve la fase del grano por muestra
    const nCh = output.length;
    while (this.rings.length < nCh) this.rings.push(new Float32Array(BUF));
    const block = output[0].length;
    for (let i = 0; i < block; i++) {
      let ph = this.ph + dphase;
      if (ph >= GRAIN) ph -= GRAIN; else if (ph < 0) ph += GRAIN;
      this.ph = ph;
      let ph2 = ph + GRAIN / 2; if (ph2 >= GRAIN) ph2 -= GRAIN;
      const g1 = triWindow(ph / GRAIN);
      const g2 = triWindow(ph2 / GRAIN);
      for (let ch = 0; ch < nCh; ch++) {
        const ring = this.rings[ch];
        const inCh = input && input[ch] ? input[ch] : (input && input[0] ? input[0] : null);
        ring[this.w % BUF] = inCh ? inCh[i] : 0;
        const r1 = this.w - ph;
        const r2 = this.w - ph2;
        output[ch][i] = g1 * readFrac(ring, r1) + g2 * readFrac(ring, r2);
      }
      this.w++;
    }
    return true;
  }
}

registerProcessor('pitch-processor', PitchProcessor);
```

- [ ] **Step 6: Crea el cargador de worklets** (`fx/worklets.ts`)

```ts
// studio/src/fx/worklets.ts
// Carga (una sola vez) los módulos AudioWorklet. Debe resolverse antes de crear sus AudioWorkletNode.
let ready: Promise<void> | null = null;

export function ensureWorklets(actx: AudioContext): Promise<void> {
  if (!ready) {
    const url = new URL('./effects/worklets/pitch-processor.ts', import.meta.url);
    ready = actx.audioWorklet.addModule(url.href);
  }
  return ready;
}
```

- [ ] **Step 7: Haz tolerante `rack.add`** (que un `create` que lance no rompa el rack)

En `studio/src/fx/rack.ts`, dentro de `createRack`, reemplaza el método `add` por:

```ts
    add(type, state) {
      const def = EFFECTS[type]; if (!def) return null;
      let fx: Effect;
      try { fx = def.create(actx, state); } catch { return null; }   // p. ej. worklet no cargado
      effects.push(fx); reconnect(); notify(); return fx;
    },
```

- [ ] **Step 8: Inicializa los racks de forma asíncrona esperando los worklets** (`app/studioView.ts`)

En `studio/src/app/studioView.ts`: añade el import al principio, junto a los demás:

```ts
import { ensureWorklets } from '../fx/worklets';
```

Sustituye el bloque de `initRacks`/`audioOn` (actualmente síncrono) por esta versión con promesa compartida (dedupe y esperable):

```ts
  let racksPromise: Promise<void> | null = null;
  function initRacks(): Promise<void> {
    if (!racksPromise) racksPromise = (async () => {
      const actx = ensureAudio();
      try { await ensureWorklets(actx); } catch { /* sin worklets: los efectos que los usan no se podrán añadir */ }
      const instrumentBus = actx.createGain();
      synth.setSynthOut(instrumentBus);
      instRack = createRack(actx, instrumentBus, masterDest());
      masterRack = createRack(actx, masterFxIn(), masterFxOut());
      instRack.restore(store.instrumentRack);
      masterRack.restore(store.masterRack);
      mountRack(root.querySelector('#instRack') as HTMLElement, instRack, 'Instrumento', persist);
      mountRack(root.querySelector('#masterRack') as HTMLElement, masterRack, 'Maestro', persist);
    })();
    return racksPromise;
  }
  function audioOn(): void { ensureAudio(); void initRacks(); }
```

Y en el manejador de **Abrir proyecto** (`#stFile` change), donde antes hacía `audioOn(); instRack!.restore(...)`, cámbialo para **esperar** la inicialización:

```ts
      await initRacks();
      if (instRack) instRack.restore(store.instrumentRack);
      if (masterRack) masterRack.restore(store.masterRack);
      saveStore(store);
```

(El resto del manejador — leer el archivo, fijar `store.*`, el `<select>` y `synth.setPreset` — no cambia.)

- [ ] **Step 9: Verifica typecheck + tests + build, y que el worklet se emite**

Run: `npm run typecheck` → sin errores (strict).
Run: `npm test` → verde.
Run: `npm run build` → OK. Comprueba que en `dist/assets/` aparece un fichero JS aparte para el procesador (Vite emite el worklet como módulo independiente).

- [ ] **Step 10: Commit**

```bash
git add studio/src/fx/effects/pitch-dsp.ts studio/src/fx/effects/pitch-dsp.test.ts studio/src/fx/effects/worklets/pitch-processor.ts studio/src/fx/worklets.ts studio/src/fx/rack.ts studio/src/app/studioView.ts
git commit -m "Estudio F2: infraestructura AudioWorklet (carga Vite) + procesador pitch granular + ventana pura"
```

---

### Task 2: Efecto Pitch Shifter (`fx/effects/pitch.ts`)

**Files:**
- Create: `studio/src/fx/effects/pitch.ts`
- Modify: `studio/src/fx/effects/index.ts` (añadir `import './pitch';`)

**Interfaces:**
- Consumes: `registerEffect`, `makeEffect`, `ParamSpec` de `../effect`. Usa el procesador `'pitch-processor'` (registrado por `ensureWorklets`, que la vista Estudio espera antes de montar los racks).
- Produces: registra `'pitch'` (family `'tone'`).

- [ ] **Step 1: Implementa `pitch.ts`** (AudioWorkletNode + mezcla seco/húmedo)

```ts
// studio/src/fx/effects/pitch.ts
// Pitch Shifter: desplaza el tono con un AudioWorkletNode granular ('pitch-processor'). El módulo del
// worklet ya está cargado (la vista Estudio espera a ensureWorklets antes de permitir añadir efectos).
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const PITCH_PARAMS: ParamSpec[] = [
  { name: 'semitones', label: 'Semitonos', min: -12, max: 12, step: 1, default: 0, unit: 'st' },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 1 }
];

registerEffect('pitch', {
  label: 'Pitch Shifter', family: 'tone', params: PITCH_PARAMS,
  create: (actx, state) => makeEffect(actx, 'pitch', PITCH_PARAMS, (actx, input, sink) => {
    const dryMix = actx.createGain();
    const node = new AudioWorkletNode(actx, 'pitch-processor', { channelCount: 2, outputChannelCount: [2] });
    const wetMix = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    input.connect(node); node.connect(wetMix); wetMix.connect(sink);
    const pitchParam = node.parameters.get('pitch');
    return {
      apply: (name: string, value: number) => {
        if (name === 'semitones') { if (pitchParam) pitchParam.value = value; }
        else if (name === 'mix') { wetMix.gain.value = value; dryMix.gain.value = 1 - value; }
      },
      teardown: () => { try { node.disconnect(); } catch { /* ya */ } }
    };
  }, state)
});
```

- [ ] **Step 2: Registra en el índice**

En `studio/src/fx/effects/index.ts`, añade tras `import './equalizer-bw';`:

```ts
import './pitch';
```

- [ ] **Step 3: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 4: Prueba manual (navegador)** — IMPORTANTE: confirma que el worklet carga

Run: `npm run dev` y abre `http://localhost:5173`. Pulsa una tecla (esto inicializa el audio y carga el worklet). Añade **Pitch Shifter** a un rack: sube **Semitonos** a +12 y toca → debe sonar una octava más agudo; −12, una octava más grave; 0 = igual. Mezcla controla seco/efecto. Mira la consola del navegador: no debe haber errores de `addModule`/`AudioWorkletNode`. (Si el worklet no cargara, al añadirlo no pasaría nada por el `try/catch` de `rack.add`; en ese caso, revisa el `dist`/consola.)

- [ ] **Step 5: Commit**

```bash
git add studio/src/fx/effects/pitch.ts studio/src/fx/effects/index.ts
git commit -m "Estudio F2: efecto Pitch Shifter (AudioWorkletNode granular, semitonos + mezcla)"
```

---

### Task 3: Pink/Fractal Noise (`fx/effects/noise-dsp.ts`, `fx/effects/pink-noise.ts`)

**Files:**
- Create: `studio/src/fx/effects/noise-dsp.ts`, `studio/src/fx/effects/noise-dsp.test.ts`, `studio/src/fx/effects/pink-noise.ts`
- Modify: `studio/src/fx/effects/index.ts` (añadir `import './pink-noise';`)

**Interfaces:**
- Consumes: `registerEffect`, `makeEffect`, `ParamSpec` de `../effect`; `mulberry32` de `./reverb-impulse`.
- Produces: `pinkNoiseSamples(n: number, seed?: number): Float32Array` (pura); registra `'pink-noise'` (family `'tone'`).

- [ ] **Step 1: Escribe el test que falla**

```ts
// studio/src/fx/effects/noise-dsp.test.ts
import { describe, it, expect } from 'vitest';
import { pinkNoiseSamples } from './noise-dsp';

describe('pinkNoiseSamples', () => {
  it('tiene la longitud pedida', () => {
    expect(pinkNoiseSamples(1000).length).toBe(1000);
  });
  it('es determinista con la misma semilla', () => {
    expect(Array.from(pinkNoiseSamples(64, 7))).toEqual(Array.from(pinkNoiseSamples(64, 7)));
  });
  it('genera señal (no todo ceros) y finita y acotada', () => {
    const s = pinkNoiseSamples(2000, 3);
    let energy = 0;
    for (let i = 0; i < s.length; i++) {
      expect(Number.isFinite(s[i])).toBe(true);
      expect(Math.abs(s[i])).toBeLessThan(2);
      energy += Math.abs(s[i]);
    }
    expect(energy).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `npm test`
Expected: FAIL — `Failed to load url ./noise-dsp`.

- [ ] **Step 3: Implementa `noise-dsp.ts`** (ruido rosa de Paul Kellet, reusa el PRNG)

```ts
// studio/src/fx/effects/noise-dsp.ts
// Ruido rosa (algoritmo de Paul Kellet) a partir de ruido blanco con semilla. Puro y testeable.
import { mulberry32 } from './reverb-impulse';

export function pinkNoiseSamples(n: number, seed = 1): Float32Array {
  const out = new Float32Array(n);
  const rnd = mulberry32(seed);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const white = rnd() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    out[i] = pink * 0.11;   // escala a ~[-1,1]
  }
  return out;
}
```

- [ ] **Step 4: Ejecuta el test y comprueba que pasa**

Run: `npm test`
Expected: PASS (3 tests nuevos + previos).

- [ ] **Step 5: Implementa `pink-noise.ts`** (fuente en bucle + nivel; la señal pasa intacta)

```ts
// studio/src/fx/effects/pink-noise.ts
// Pink/Fractal Noise: añade ruido rosa (fuente en bucle) a la señal. La señal de entrada pasa intacta;
// el ruido se suma con el nivel elegido. Es una fuente → teardown la para.
import { registerEffect, makeEffect, ParamSpec } from '../effect';
import { pinkNoiseSamples } from './noise-dsp';

export const PINK_PARAMS: ParamSpec[] = [
  { name: 'level', label: 'Nivel', min: 0, max: 1, step: 0.01, default: 0.2 }
];

registerEffect('pink-noise', {
  label: 'Pink/Fractal Noise', family: 'tone', params: PINK_PARAMS,
  create: (actx, state) => makeEffect(actx, 'pink-noise', PINK_PARAMS, (actx, input, sink) => {
    input.connect(sink);                                   // la señal pasa intacta
    const len = Math.floor(actx.sampleRate * 2);           // 2 s de ruido en bucle
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    buf.copyToChannel(pinkNoiseSamples(len, 1), 0);
    const src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
    const level = actx.createGain();
    src.connect(level); level.connect(sink);
    src.start();
    return {
      apply: (name: string, value: number) => { if (name === 'level') level.gain.value = value; },
      teardown: () => { try { src.stop(); } catch { /* ya */ } src.disconnect(); level.disconnect(); }
    };
  }, state)
});
```

- [ ] **Step 6: Registra en el índice**

En `studio/src/fx/effects/index.ts`, añade tras `import './pitch';`. El archivo completo queda:

```ts
// studio/src/fx/effects/index.ts
// Importar este módulo registra todos los efectos disponibles.
import './gain';
import './echo';
import './stereo-echo';
import './reflector';
import './reverb';
import './tremolo';
import './autopanner';
import './chorus';
import './rotary';
import './fractal-doubler';
import './limiter';
import './dynamics';
import './deesser';
import './tubewarmth';
import './sigmoid';
import './equalizer';
import './equalizer-bw';
import './pitch';
import './pink-noise';
```

- [ ] **Step 7: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 8: Prueba manual (navegador)**

Run: `npm run dev`. Añade **Pink/Fractal Noise**: debe oírse un siseo (ruido rosa) sumado a la señal; Nivel sube/baja el ruido. Quítalo del rack (✕) y el ruido debe **parar** (teardown).

- [ ] **Step 9: Commit**

```bash
git add studio/src/fx/effects/noise-dsp.ts studio/src/fx/effects/noise-dsp.test.ts studio/src/fx/effects/pink-noise.ts studio/src/fx/effects/index.ts
git commit -m "Estudio F2: efecto Pink/Fractal Noise (ruido rosa en bucle + nivel) + test del generador"
```

---

### Task 4: Versión y documentación — ¡suite TAP completa!

**Files:**
- Modify: `studio/package.json` (version), `HANDOFF.md`, `CLAUDE.md`.

- [ ] **Step 1: Sube la versión.** En `studio/package.json` cambia `"version": "0.7.0"` a `"version": "0.8.0"`.

- [ ] **Step 2: `HANDOFF.md`.** En el bloque del proyecto pro, añade la **Tanda 6 (Tono) — suite TAP COMPLETA (19/19)**: se introdujo la **infraestructura AudioWorklet** (`fx/worklets.ts` `ensureWorklets`, carga con `new URL('./effects/worklets/pitch-processor.ts', import.meta.url)`; la vista Estudio inicializa los racks de forma **asíncrona** esperando los worklets; `rack.add` tolera que `create` lance). **Pitch Shifter** (`pitch.ts` + `worklets/pitch-processor.ts`: granular, dos lecturas con crossfade triangular `triWindow` puro; param semitonos −12..12 + mezcla). **Pink/Fractal Noise** (`pink-noise.ts` + `noise-dsp.ts` `pinkNoiseSamples` de Paul Kellet reusando `mulberry32`: fuente `BufferSource` en bucle, suma ruido a la señal, teardown la para). Ambos `family:'tone'`. Tests: `pitch-dsp` (ventana), `noise-dsp` (ruido). **La suite TAP está completa: 19 efectos** (+ utilidad Ganancia). Próximo: **F3 DAW/groovebox** (canales, step-grid, patrones/song mode, solo/pan, swing, MIDI), que reutilizará el rack en cada canal.

- [ ] **Step 3: `CLAUDE.md`.** En la decisión 5 / hoja de ruta, marca la **F2 (suite de efectos TAP) COMPLETA — 19 efectos en 6 tandas**; el siguiente hito es **F3 DAW/groovebox**.

- [ ] **Step 4: Verifica** — Run: `npm run build` (OK). Confirma `version` 0.8.0 y las docs.

- [ ] **Step 5: Commit**

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio F2 Tanda 6 (Tono) v0.8.0: suite TAP completa (19 efectos) + docs"
```

---

## Notas de ejecución
- Verificación = `npm run typecheck` / `npm test` / `npm run build` desde `d:\PianoVa\studio`. No commitear `node_modules`/`dist`.
- **AudioWorklet es lo novedoso/arriesgado:** el patrón Vite es `addModule(new URL('....ts', import.meta.url).href)`; el procesador declara sus globales (`registerProcessor`, `AudioWorkletProcessor`, `sampleRate`) porque no están en `lib.dom`. La vista Estudio **espera** (`await ensureWorklets`) antes de montar los racks, así el módulo siempre está registrado cuando se crea un `AudioWorkletNode`. La prueba manual del navegador (Task 2, Step 4) es la verificación definitiva de que carga.
- Pitch shifter granular: artefactos leves en material complejo son esperables (es lo normal en pitch shifting en tiempo real); calidad suficiente para el objetivo.
- Pink Noise es una fuente → `teardown` la para (como los LFO de la Tanda 3).
- No tocar `pianova.html`. Textos/comentarios en español.
```
