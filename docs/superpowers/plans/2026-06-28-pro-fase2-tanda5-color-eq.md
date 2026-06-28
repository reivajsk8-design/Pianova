# Fase 2 · Tanda 5 — Color / EQ (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir los 4 efectos de color/EQ (TubeWarmth, Sigmoid Booster, Equalizer, Equalizer/BW), todos nativos: saturación con `WaveShaper` (curvas puras testeables) y ecualización con `BiquadFilter`.

**Architecture:** Las funciones de curva y conversiones (tube, sigmoide, ancho de banda→Q, generar curva) viven en un módulo puro `color-dsp.ts` testeado con Vitest. TubeWarmth y Sigmoid son `WaveShaperNode` con la curva regenerada (debounce) al cambiar el drive. Equalizer es una cadena de `BiquadFilter` (shelf+peaking); Equalizer/BW es una banda peaking con control de ancho de banda. Ninguno usa osciladores → `build` devuelve solo `apply`.

**Tech Stack:** TypeScript strict, Vite, Vitest, Web Audio API. Proyecto en `studio/`.

## Global Constraints

- Todo el código nuevo va en **`studio/`**; **TypeScript strict**; **Vitest** para lo puro; **sin framework de UI**; textos/comentarios en **español**. **No tocar `pianova.html`**.
- Reusar el marco: `makeEffect`, `registerEffect`, `ParamSpec` de `studio/src/fx/effect.ts`. Registrar e importar cada efecto en `studio/src/fx/effects/index.ts`.
- **Todos los efectos de esta tanda son NATIVOS** (`WaveShaperNode` + `BiquadFilterNode`). Sin AudioWorklet.
- `family: 'color'` para los 4.
- Las **curvas de saturación son puras y testeables** (`tubeSample`, `sigmoidSample`) y se muestrean con `makeCurve`; la conversión `bandwidthToQ` también es pura. Todo en `fx/effects/color-dsp.ts`.
- `WaveShaper`: `oversample = '4x'`; al asignar `curve` usar el cast `as Float32Array<ArrayBuffer>` (como en `masterBus.ts`). La curva se regenera con **debounce** al cambiar el drive (no en cada paso del deslizador).
- Estos efectos no tienen osciladores → `build` devuelve solo `(name, value) => void` (sin teardown).
- Patrón de mezcla donde aplique: `wetMix.gain = mix; dryMix.gain = 1 - mix`. (Los EQ van en serie, sin mezcla.)
- Verificación por tarea desde `d:\PianoVa\studio`: `npm run typecheck` + `npm test` + `npm run build`. Prueba manual por oído.

---

### Task 1: DSP puro de color (`fx/effects/color-dsp.ts`)

**Files:**
- Create: `studio/src/fx/effects/color-dsp.ts`
- Test: `studio/src/fx/effects/color-dsp.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `makeCurve(n: number, fn: (x: number) => number): Float32Array`; `tubeSample(x, drive, warmth): number`; `sigmoidSample(x, drive): number`; `bandwidthToQ(bw): number`.

- [ ] **Step 1: Escribe el test que falla**

```ts
// studio/src/fx/effects/color-dsp.test.ts
import { describe, it, expect } from 'vitest';
import { makeCurve, tubeSample, sigmoidSample, bandwidthToQ } from './color-dsp';

describe('makeCurve', () => {
  it('muestrea fn sobre [-1,1] con la longitud pedida', () => {
    expect(Array.from(makeCurve(3, x => x))).toEqual([-1, 0, 1]);
  });
});

describe('tubeSample', () => {
  it('silencio → silencio', () => {
    expect(tubeSample(0, 0.5, 0.5)).toBeCloseTo(0, 6);
  });
  it('es monótona creciente en x', () => {
    expect(tubeSample(0.5, 0.5, 0.3)).toBeGreaterThan(tubeSample(-0.5, 0.5, 0.3));
  });
  it('es asimétrica cuando warmth > 0', () => {
    expect(tubeSample(0.5, 0.5, 0.5)).not.toBeCloseTo(-tubeSample(-0.5, 0.5, 0.5), 4);
  });
  it('es (casi) simétrica cuando warmth = 0', () => {
    expect(tubeSample(0.5, 0.5, 0)).toBeCloseTo(-tubeSample(-0.5, 0.5, 0), 6);
  });
});

describe('sigmoidSample', () => {
  it('silencio → silencio', () => {
    expect(sigmoidSample(0, 0.5)).toBeCloseTo(0, 6);
  });
  it('acotada en [-1,1]', () => {
    expect(sigmoidSample(1, 1)).toBeLessThanOrEqual(1);
    expect(sigmoidSample(-1, 1)).toBeGreaterThanOrEqual(-1);
  });
  it('más drive = más pendiente cerca de 0', () => {
    expect(sigmoidSample(0.1, 1)).toBeGreaterThan(sigmoidSample(0.1, 0));
  });
});

describe('bandwidthToQ', () => {
  it('1 octava ≈ 1.414', () => { expect(bandwidthToQ(1)).toBeCloseTo(1.41421, 4); });
  it('2 octavas ≈ 0.667', () => { expect(bandwidthToQ(2)).toBeCloseTo(0.66667, 4); });
  it('menos ancho = más Q', () => { expect(bandwidthToQ(0.5)).toBeGreaterThan(bandwidthToQ(2)); });
});
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `npm test`
Expected: FAIL — `Failed to load url ./color-dsp`.

- [ ] **Step 3: Implementa el módulo**

```ts
// studio/src/fx/effects/color-dsp.ts
// DSP puro de color/saturación (curvas de waveshaping y conversión de ancho de banda). Testeable.

// Muestrea fn sobre [-1,1] en n puntos → curva para WaveShaperNode.
export function makeCurve(n: number, fn: (x: number) => number): Float32Array {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
  return c;
}

// Saturación tipo válvula: asimétrica (warmth añade armónicos pares). drive 0..1, warmth 0..1.
export function tubeSample(x: number, drive: number, warmth: number): number {
  const g = 1 + drive * 6;
  const bias = warmth * 0.25;
  const y = Math.tanh(g * (x + bias)) - Math.tanh(g * bias);   // resta el DC del bias
  return y / (1 + drive * 1.5);                                 // compensación de nivel aprox.
}

// Refuerzo sigmoide simétrico (logística mapeada a [-1,1]). drive 0..1 = pendiente.
export function sigmoidSample(x: number, drive: number): number {
  const k = 1 + drive * 9;
  return (2 / (1 + Math.exp(-k * x))) - 1;
}

// Ancho de banda (octavas) → Q de un filtro peaking.
export function bandwidthToQ(bw: number): number {
  const a = Math.pow(2, bw);
  return Math.sqrt(a) / (a - 1);
}
```

- [ ] **Step 4: Ejecuta el test y comprueba que pasa**

Run: `npm test`
Expected: PASS (los tests nuevos + previos).

- [ ] **Step 5: Commit**

```bash
git add studio/src/fx/effects/color-dsp.ts studio/src/fx/effects/color-dsp.test.ts
git commit -m "Estudio F2: DSP puro de color (tube/sigmoide/bandwidthToQ/makeCurve) + test"
```

---

### Task 2: TubeWarmth y Sigmoid Booster (`fx/effects/tubewarmth.ts`, `fx/effects/sigmoid.ts`)

**Files:**
- Create: `studio/src/fx/effects/tubewarmth.ts`, `studio/src/fx/effects/sigmoid.ts`
- Modify: `studio/src/fx/effects/index.ts`

**Interfaces:**
- Consumes: `registerEffect`, `makeEffect`, `ParamSpec` de `../effect`; `tubeSample`, `sigmoidSample`, `makeCurve` de `./color-dsp`.
- Produces: registra `'tubewarmth'` y `'sigmoid'` (family `'color'`).

- [ ] **Step 1: Implementa `tubewarmth.ts`** (WaveShaper con curva de válvula regenerada con debounce)

```ts
// studio/src/fx/effects/tubewarmth.ts
// TubeWarmth: saturación de válvula con WaveShaper. La curva (tubeSample) se regenera con debounce al
// cambiar drive/warmth. oversample 4x + mezcla seco/húmedo.
import { registerEffect, makeEffect, ParamSpec } from '../effect';
import { tubeSample, makeCurve } from './color-dsp';

export const TUBEWARMTH_PARAMS: ParamSpec[] = [
  { name: 'drive', label: 'Drive', min: 0, max: 1, step: 0.01, default: 0.3 },
  { name: 'warmth', label: 'Calidez', min: 0, max: 1, step: 0.01, default: 0.5 },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 1 }
];

registerEffect('tubewarmth', {
  label: 'TubeWarmth', family: 'color', params: TUBEWARMTH_PARAMS,
  create: (actx, state) => makeEffect(actx, 'tubewarmth', TUBEWARMTH_PARAMS, (actx, input, sink) => {
    let drive = TUBEWARMTH_PARAMS[0].default;
    let warmth = TUBEWARMTH_PARAMS[1].default;
    let t: ReturnType<typeof setTimeout> | null = null;
    const dryMix = actx.createGain();
    const shaper = actx.createWaveShaper(); shaper.oversample = '4x';
    shaper.curve = makeCurve(2048, x => tubeSample(x, drive, warmth)) as Float32Array<ArrayBuffer>;
    const wetMix = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    input.connect(shaper); shaper.connect(wetMix); wetMix.connect(sink);
    const rebuild = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { shaper.curve = makeCurve(2048, x => tubeSample(x, drive, warmth)) as Float32Array<ArrayBuffer>; t = null; }, 80);
    };
    return (name: string, value: number) => {
      if (name === 'drive') { drive = value; rebuild(); }
      else if (name === 'warmth') { warmth = value; rebuild(); }
      else if (name === 'mix') { wetMix.gain.value = value; dryMix.gain.value = 1 - value; }
    };
  }, state)
});
```

- [ ] **Step 2: Implementa `sigmoid.ts`** (WaveShaper con curva sigmoide)

```ts
// studio/src/fx/effects/sigmoid.ts
// Sigmoid Booster: WaveShaper con curva sigmoide (refuerzo/saturación simétrica). Curva regenerada con
// debounce al cambiar el drive. oversample 4x + mezcla seco/húmedo.
import { registerEffect, makeEffect, ParamSpec } from '../effect';
import { sigmoidSample, makeCurve } from './color-dsp';

export const SIGMOID_PARAMS: ParamSpec[] = [
  { name: 'drive', label: 'Drive', min: 0, max: 1, step: 0.01, default: 0.4 },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 1 }
];

registerEffect('sigmoid', {
  label: 'Sigmoid Booster', family: 'color', params: SIGMOID_PARAMS,
  create: (actx, state) => makeEffect(actx, 'sigmoid', SIGMOID_PARAMS, (actx, input, sink) => {
    let drive = SIGMOID_PARAMS[0].default;
    let t: ReturnType<typeof setTimeout> | null = null;
    const dryMix = actx.createGain();
    const shaper = actx.createWaveShaper(); shaper.oversample = '4x';
    shaper.curve = makeCurve(2048, x => sigmoidSample(x, drive)) as Float32Array<ArrayBuffer>;
    const wetMix = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    input.connect(shaper); shaper.connect(wetMix); wetMix.connect(sink);
    const rebuild = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { shaper.curve = makeCurve(2048, x => sigmoidSample(x, drive)) as Float32Array<ArrayBuffer>; t = null; }, 80);
    };
    return (name: string, value: number) => {
      if (name === 'drive') { drive = value; rebuild(); }
      else if (name === 'mix') { wetMix.gain.value = value; dryMix.gain.value = 1 - value; }
    };
  }, state)
});
```

- [ ] **Step 3: Registra ambos en el índice**

En `studio/src/fx/effects/index.ts`, añade tras `import './deesser';`:

```ts
import './tubewarmth';
import './sigmoid';
```

- [ ] **Step 4: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 5: Prueba manual (navegador)**

Run: `npm run dev`. Añade **TubeWarmth**: con Drive/Calidez la señal gana cuerpo/saturación cálida; al mover los deslizadores no debe entrecortarse (debounce). Añade **Sigmoid Booster**: Drive sube la saturación simétrica.

- [ ] **Step 6: Commit**

```bash
git add studio/src/fx/effects/tubewarmth.ts studio/src/fx/effects/sigmoid.ts studio/src/fx/effects/index.ts
git commit -m "Estudio F2: efectos TubeWarmth y Sigmoid Booster (WaveShaper, curva pura)"
```

---

### Task 3: Equalizer y Equalizer/BW (`fx/effects/equalizer.ts`, `fx/effects/equalizer-bw.ts`)

**Files:**
- Create: `studio/src/fx/effects/equalizer.ts`, `studio/src/fx/effects/equalizer-bw.ts`
- Modify: `studio/src/fx/effects/index.ts`

**Interfaces:**
- Consumes: `registerEffect`, `makeEffect`, `ParamSpec` de `../effect`; `bandwidthToQ` de `./color-dsp`.
- Produces: registra `'equalizer'` y `'equalizer-bw'` (family `'color'`).

- [ ] **Step 1: Implementa `equalizer.ts`** (3 bandas: low shelf, peaking medios, high shelf)

```ts
// studio/src/fx/effects/equalizer.ts
// Equalizer de 3 bandas: graves (low shelf), medios (peaking con frecuencia) y agudos (high shelf).
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const EQ_PARAMS: ParamSpec[] = [
  { name: 'low', label: 'Graves', min: -18, max: 18, step: 0.5, default: 0, unit: 'dB' },
  { name: 'mid', label: 'Medios', min: -18, max: 18, step: 0.5, default: 0, unit: 'dB' },
  { name: 'midFreq', label: 'Frec. medios', min: 300, max: 5000, step: 50, default: 1000, unit: 'Hz' },
  { name: 'high', label: 'Agudos', min: -18, max: 18, step: 0.5, default: 0, unit: 'dB' }
];

registerEffect('equalizer', {
  label: 'Equalizer', family: 'color', params: EQ_PARAMS,
  create: (actx, state) => makeEffect(actx, 'equalizer', EQ_PARAMS, (actx, input, sink) => {
    const lo = actx.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 120;
    const mid = actx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 1;
    const hi = actx.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 6000;
    input.connect(lo); lo.connect(mid); mid.connect(hi); hi.connect(sink);
    return (name: string, value: number) => {
      if (name === 'low') lo.gain.value = value;
      else if (name === 'mid') mid.gain.value = value;
      else if (name === 'midFreq') mid.frequency.value = value;
      else if (name === 'high') hi.gain.value = value;
    };
  }, state)
});
```

- [ ] **Step 2: Implementa `equalizer-bw.ts`** (banda peaking paramétrica con ancho de banda)

```ts
// studio/src/fx/effects/equalizer-bw.ts
// Equalizer/BW: una banda peaking paramétrica con control de ancho de banda (octavas → Q).
import { registerEffect, makeEffect, ParamSpec } from '../effect';
import { bandwidthToQ } from './color-dsp';

export const EQBW_PARAMS: ParamSpec[] = [
  { name: 'freq', label: 'Frecuencia', min: 60, max: 12000, step: 10, default: 1000, unit: 'Hz' },
  { name: 'gain', label: 'Ganancia', min: -18, max: 18, step: 0.5, default: 0, unit: 'dB' },
  { name: 'bw', label: 'Ancho', min: 0.2, max: 3, step: 0.1, default: 1, unit: 'oct' }
];

registerEffect('equalizer-bw', {
  label: 'Equalizer/BW', family: 'color', params: EQBW_PARAMS,
  create: (actx, state) => makeEffect(actx, 'equalizer-bw', EQBW_PARAMS, (actx, input, sink) => {
    const band = actx.createBiquadFilter(); band.type = 'peaking'; band.frequency.value = 1000;
    input.connect(band); band.connect(sink);
    return (name: string, value: number) => {
      if (name === 'freq') band.frequency.value = value;
      else if (name === 'gain') band.gain.value = value;
      else if (name === 'bw') band.Q.value = bandwidthToQ(value);
    };
  }, state)
});
```

- [ ] **Step 3: Registra ambos en el índice**

En `studio/src/fx/effects/index.ts`, añade tras `import './sigmoid';`. El archivo completo queda:

```ts
// studio/src/fx/effects/index.ts
// Importar este módulo registra todos los efectos disponibles. En tandas futuras se añaden más imports.
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
```

- [ ] **Step 4: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 5: Prueba manual (navegador)**

Run: `npm run dev`. Añade **Equalizer**: Graves/Medios/Agudos cambian el tono; Frec. medios mueve dónde actúa la banda media. Añade **Equalizer/BW**: con Frecuencia/Ganancia realza o atenúa una banda; Ancho la hace más estrecha (más Q) o ancha.

- [ ] **Step 6: Commit**

```bash
git add studio/src/fx/effects/equalizer.ts studio/src/fx/effects/equalizer-bw.ts studio/src/fx/effects/index.ts
git commit -m "Estudio F2: efectos Equalizer (3 bandas) y Equalizer/BW (ancho de banda)"
```

---

### Task 4: Versión y documentación

**Files:**
- Modify: `studio/package.json` (version), `HANDOFF.md`, `CLAUDE.md`.

- [ ] **Step 1: Sube la versión.** En `studio/package.json` cambia `"version": "0.6.0"` a `"version": "0.7.0"`.

- [ ] **Step 2: `HANDOFF.md`.** En el bloque del proyecto pro, añade la **Tanda 5 (Color/EQ)**: DSP puro `color-dsp.ts` (`tubeSample`, `sigmoidSample`, `bandwidthToQ`, `makeCurve`, testeado); 4 efectos nativos `family:'color'` en `fx/effects/` (registrados en `index.ts`): **TubeWarmth** (`tubewarmth.ts`: `WaveShaper` con curva de válvula asimétrica, debounce + oversample 4x + dry/wet), **Sigmoid Booster** (`sigmoid.ts`: `WaveShaper` sigmoide), **Equalizer** (`equalizer.ts`: 3 bandas low shelf/peaking/high shelf), **Equalizer/BW** (`equalizer-bw.ts`: banda peaking con ancho de banda en octavas → Q). **Decisión:** TubeWarmth se hizo nativo (WaveShaper, la válvula es transferencia estática), no AudioWorklet. Próximo: **Tanda 6 (Tono)** — Pitch Shifter (1er AudioWorklet, inevitable) y Pink/Fractal Noise.

- [ ] **Step 3: `CLAUDE.md`.** En la decisión 5 / hoja de ruta, marca que la **Tanda 5 (Color/EQ) está hecha**; queda solo la Tanda 6 (Tono).

- [ ] **Step 4: Verifica** — Run: `npm run build` (OK). Confirma `version` 0.7.0 y las docs.

- [ ] **Step 5: Commit**

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio F2 Tanda 5 (Color/EQ) v0.7.0: version y docs"
```

---

## Notas de ejecución
- Verificación = `npm run typecheck` / `npm test` / `npm run build` desde `d:\PianoVa\studio`. No commitear `node_modules`/`dist`.
- Las curvas de WaveShaper se regeneran con `makeCurve(2048, fn)` y debounce de 80 ms al cambiar el drive; `mix` es instantáneo.
- `WaveShaper.curve = ... as Float32Array<ArrayBuffer>` (mismo cast que `masterBus.ts`); `oversample='4x'`.
- Estos efectos no tienen osciladores → `build` devuelve solo la función `apply` (sin teardown).
- Equalizer/BW: `bw` (octavas) → `Q` con `bandwidthToQ`; no acotar a mano (Web Audio valida Q).
- No tocar `pianova.html`. Textos/comentarios en español.
```
