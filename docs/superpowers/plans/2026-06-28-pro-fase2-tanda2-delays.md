# Fase 2 · Tanda 2 — Delays / Espacio (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir los 4 efectos de la familia Delays/Espacio (Echo, Stereo Echo, Reflector, Reverberator) al registro de efectos del Estudio, todos con nodos nativos de Web Audio, montables en cualquier rack.

**Architecture:** Cada efecto se construye con el helper `makeEffect` de la Tanda 1 (que ya aporta la puerta de bypass seco/húmedo): su `build(actx, input, sink)` arma la cadena interna `input → … → sink` con su propio dry/wet de mezcla y devuelve un `apply(nombre, valor)`. Echo/Stereo Echo/Reflector usan `DelayNode` + realimentación; Reverberator usa `ConvolverNode` con un impulso generado (ruido con caída exponencial) cuya generación de muestras es una función pura y testeable.

**Tech Stack:** TypeScript strict, Vite, Vitest, Web Audio API. Proyecto en `studio/`.

## Global Constraints

- Todo el código nuevo va en **`studio/`**; **TypeScript strict**; **Vitest** para la lógica pura; **sin framework de UI**; textos/comentarios en **español**. **No tocar `pianova.html`**.
- Reusar el marco de la Tanda 1: `makeEffect`, `registerEffect`, `ParamSpec` de `studio/src/fx/effect.ts`; cada efecto se registra y se importa desde `studio/src/fx/effects/index.ts`.
- **Todos los efectos de esta tanda son NATIVOS** (sin AudioWorklet). Reverberator usa `ConvolverNode` con impulso generado (decisión 2026-06-28; ver spec).
- Patrón de mezcla: el dry/wet **interno** del efecto es propio (gains `dryMix`/`wetMix`), independiente de la puerta de bypass de `makeEffect`. La regla de mezcla es `wetMix.gain = mix; dryMix.gain = 1 - mix`.
- `family: 'delay'` para los 4. Los tiempos se exponen en **ms** y se convierten a segundos (`/1000`) al asignar `delayTime`.
- La generación del impulso de reverb es **pura y testeable** (muestras = ruido·envolvente, PRNG con semilla).
- Verificación por tarea desde `d:\PianoVa\studio`: `npm run typecheck` + `npm test` + `npm run build`. Prueba manual por oído en `npm run dev`.

---

### Task 1: Efecto Echo (`fx/effects/echo.ts`)

**Files:**
- Create: `studio/src/fx/effects/echo.ts`
- Modify: `studio/src/fx/effects/index.ts` (añadir `import './echo';`)

**Interfaces:**
- Consumes: `registerEffect`, `makeEffect`, `ParamSpec` de `../effect`.
- Produces: registra el efecto `'echo'` (family `'delay'`). No exporta nada que otras tareas consuman.

> Sobre `makeEffect`: su `build` recibe `(actx, input: GainNode, sink: GainNode)` y debe conectar `input → (cadena interna) → sink`, devolviendo `(name, value) => void`. El bypass seco/húmedo lo gestiona `makeEffect`; aquí el `dryMix`/`wetMix` es la **mezcla** propia del efecto.

- [ ] **Step 1: Implementa `echo.ts`**

```ts
// studio/src/fx/effects/echo.ts
// Echo: línea de delay con realimentación filtrada (paso-bajo en el lazo) y mezcla seco/húmedo.
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const ECHO_PARAMS: ParamSpec[] = [
  { name: 'time', label: 'Tiempo', min: 20, max: 1000, step: 1, default: 300, unit: 'ms' },
  { name: 'feedback', label: 'Realimentación', min: 0, max: 0.9, step: 0.01, default: 0.35 },
  { name: 'tone', label: 'Tono', min: 500, max: 12000, step: 100, default: 6000, unit: 'Hz' },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 0.35 }
];

registerEffect('echo', {
  label: 'Echo', family: 'delay', params: ECHO_PARAMS,
  create: (actx, state) => makeEffect(actx, 'echo', ECHO_PARAMS, (actx, input, sink) => {
    const dryMix = actx.createGain();
    const delay = actx.createDelay(2.0);
    const fb = actx.createGain();
    const tone = actx.createBiquadFilter(); tone.type = 'lowpass';
    const wetMix = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    input.connect(delay);
    delay.connect(tone); tone.connect(wetMix); wetMix.connect(sink);
    tone.connect(fb); fb.connect(delay);   // realimentación filtrada
    return (name, value) => {
      if (name === 'time') delay.delayTime.value = value / 1000;
      else if (name === 'feedback') fb.gain.value = value;
      else if (name === 'tone') tone.frequency.value = value;
      else if (name === 'mix') { wetMix.gain.value = value; dryMix.gain.value = 1 - value; }
    };
  }, state)
});
```

- [ ] **Step 2: Registra el efecto en el índice**

En `studio/src/fx/effects/index.ts`, añade la línea `import './echo';` debajo de `import './gain';`. El archivo queda:

```ts
// studio/src/fx/effects/index.ts
// Importar este módulo registra todos los efectos disponibles. En tandas futuras se añaden más imports.
import './gain';
import './echo';
```

- [ ] **Step 3: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores.
Run: `npm test` → todo verde (sin test nuevo: efecto de cableado nativo, se valida por oído).
Run: `npm run build` → OK.

- [ ] **Step 4: Prueba manual (navegador)**

Run: `npm run dev`. En el Estudio, pulsa una tecla, añade **Echo** a un rack: debe oírse la repetición; Tiempo cambia el intervalo, Realimentación cuántas repeticiones, Tono apaga los agudos de las repeticiones, Mezcla el balance seco/eco. Bypass lo anula.

- [ ] **Step 5: Commit**

```bash
git add studio/src/fx/effects/echo.ts studio/src/fx/effects/index.ts
git commit -m "Estudio F2: efecto Echo (delay + realimentacion filtrada + mezcla)"
```

---

### Task 2: Efectos Stereo Echo y Reflector (`fx/effects/stereo-echo.ts`, `fx/effects/reflector.ts`)

**Files:**
- Create: `studio/src/fx/effects/stereo-echo.ts`, `studio/src/fx/effects/reflector.ts`
- Modify: `studio/src/fx/effects/index.ts` (añadir los dos imports)

**Interfaces:**
- Consumes: `registerEffect`, `makeEffect`, `ParamSpec` de `../effect`.
- Produces: registra los efectos `'stereo-echo'` y `'reflector'` (family `'delay'`).

- [ ] **Step 1: Implementa `stereo-echo.ts`** (ping-pong: dos delays L/R con realimentación cruzada)

```ts
// studio/src/fx/effects/stereo-echo.ts
// Stereo Echo (ping-pong): dos delays con paneo L/R y realimentación cruzada (rebota de un lado a otro).
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const STEREO_ECHO_PARAMS: ParamSpec[] = [
  { name: 'timeL', label: 'Tiempo izq.', min: 20, max: 1000, step: 1, default: 250, unit: 'ms' },
  { name: 'timeR', label: 'Tiempo der.', min: 20, max: 1000, step: 1, default: 375, unit: 'ms' },
  { name: 'feedback', label: 'Realimentación', min: 0, max: 0.85, step: 0.01, default: 0.4 },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 0.4 }
];

registerEffect('stereo-echo', {
  label: 'Stereo Echo', family: 'delay', params: STEREO_ECHO_PARAMS,
  create: (actx, state) => makeEffect(actx, 'stereo-echo', STEREO_ECHO_PARAMS, (actx, input, sink) => {
    const dryMix = actx.createGain();
    const dL = actx.createDelay(2.0), dR = actx.createDelay(2.0);
    const fbL = actx.createGain(), fbR = actx.createGain();
    const pL = actx.createStereoPanner(); pL.pan.value = -1;
    const pR = actx.createStereoPanner(); pR.pan.value = 1;
    const wetMix = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    input.connect(dL); input.connect(dR);
    dL.connect(pL); pL.connect(wetMix);
    dR.connect(pR); pR.connect(wetMix);
    wetMix.connect(sink);
    dL.connect(fbL); fbL.connect(dR);   // cruce L -> R
    dR.connect(fbR); fbR.connect(dL);   // cruce R -> L (ping-pong)
    return (name, value) => {
      if (name === 'timeL') dL.delayTime.value = value / 1000;
      else if (name === 'timeR') dR.delayTime.value = value / 1000;
      else if (name === 'feedback') { fbL.gain.value = value; fbR.gain.value = value; }
      else if (name === 'mix') { wetMix.gain.value = value; dryMix.gain.value = 1 - value; }
    };
  }, state)
});
```

- [ ] **Step 2: Implementa `reflector.ts`** (delay corto con realimentación que puede ser negativa = peines/reflexión)

```ts
// studio/src/fx/effects/reflector.ts
// Reflector: delay corto con realimentación (puede ser negativa → peines/inversión, sonido de reflexión).
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const REFLECTOR_PARAMS: ParamSpec[] = [
  { name: 'time', label: 'Tiempo', min: 1, max: 100, step: 0.5, default: 18, unit: 'ms' },
  { name: 'reflection', label: 'Reflexión', min: -0.9, max: 0.9, step: 0.01, default: 0.5 },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 0.5 }
];

registerEffect('reflector', {
  label: 'Reflector', family: 'delay', params: REFLECTOR_PARAMS,
  create: (actx, state) => makeEffect(actx, 'reflector', REFLECTOR_PARAMS, (actx, input, sink) => {
    const dryMix = actx.createGain();
    const delay = actx.createDelay(0.2);
    const fb = actx.createGain();
    const wetMix = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    input.connect(delay);
    delay.connect(wetMix); wetMix.connect(sink);
    delay.connect(fb); fb.connect(delay);
    return (name, value) => {
      if (name === 'time') delay.delayTime.value = value / 1000;
      else if (name === 'reflection') fb.gain.value = value;   // negativo permitido
      else if (name === 'mix') { wetMix.gain.value = value; dryMix.gain.value = 1 - value; }
    };
  }, state)
});
```

- [ ] **Step 3: Registra ambos en el índice**

En `studio/src/fx/effects/index.ts`, añade las líneas. El archivo queda:

```ts
// studio/src/fx/effects/index.ts
// Importar este módulo registra todos los efectos disponibles. En tandas futuras se añaden más imports.
import './gain';
import './echo';
import './stereo-echo';
import './reflector';
```

- [ ] **Step 4: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 5: Prueba manual (navegador)**

Run: `npm run dev`. Añade **Stereo Echo**: las repeticiones deben rebotar entre izquierda y derecha (mejor con auriculares); tiempos L/R independientes. Añade **Reflector**: con tiempo corto y reflexión alta suena metálico/resonante; reflexión negativa cambia el timbre (peines).

- [ ] **Step 6: Commit**

```bash
git add studio/src/fx/effects/stereo-echo.ts studio/src/fx/effects/reflector.ts studio/src/fx/effects/index.ts
git commit -m "Estudio F2: efectos Stereo Echo (ping-pong) y Reflector (peines)"
```

---

### Task 3: Generador de impulso de reverb (puro) (`fx/effects/reverb-impulse.ts`)

**Files:**
- Create: `studio/src/fx/effects/reverb-impulse.ts`
- Test: `studio/src/fx/effects/reverb-impulse.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `mulberry32(seed: number): () => number`; `impulseSamples(length: number, decay: number, seed?: number): Float32Array`.

- [ ] **Step 1: Escribe el test que falla**

```ts
// studio/src/fx/effects/reverb-impulse.test.ts
import { describe, it, expect } from 'vitest';
import { impulseSamples, mulberry32 } from './reverb-impulse';

describe('mulberry32', () => {
  it('es determinista con la misma semilla', () => {
    const a = mulberry32(42), b = mulberry32(42);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });
  it('devuelve valores en [0,1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 100; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('impulseSamples', () => {
  it('tiene la longitud pedida', () => {
    expect(impulseSamples(1000, 2).length).toBe(1000);
  });
  it('todas las muestras están en [-1,1]', () => {
    const s = impulseSamples(2000, 3);
    for (let i = 0; i < s.length; i++) { expect(s[i]).toBeGreaterThanOrEqual(-1); expect(s[i]).toBeLessThanOrEqual(1); }
  });
  it('decae: el último cuarto tiene menos energía que el primero', () => {
    const s = impulseSamples(4000, 2);
    const q = s.length / 4;
    let first = 0, last = 0;
    for (let i = 0; i < q; i++) first += Math.abs(s[i]);
    for (let i = s.length - q; i < s.length; i++) last += Math.abs(s[i]);
    expect(last).toBeLessThan(first);
  });
  it('es determinista con la misma semilla', () => {
    expect(impulseSamples(50, 2, 5)[0]).toBe(impulseSamples(50, 2, 5)[0]);
  });
});
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `npm test`
Expected: FAIL — `Failed to load url ./reverb-impulse`.

- [ ] **Step 3: Implementa el módulo**

```ts
// studio/src/fx/effects/reverb-impulse.ts
// Generación pura (testeable) del impulso de reverb: ruido con caída exponencial. PRNG con semilla.

// PRNG mulberry32: determinista, [0,1). Permite impulsos reproducibles (y testeables).
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Muestras del impulso: ruido en [-1,1] multiplicado por una envolvente de caída.
// `decay` mayor = cola más corta (la envolvente cae más rápido).
export function impulseSamples(length: number, decay: number, seed = 1): Float32Array {
  const out = new Float32Array(length);
  const rnd = mulberry32(seed);
  for (let i = 0; i < length; i++) {
    const env = Math.pow(1 - i / length, decay);
    out[i] = (rnd() * 2 - 1) * env;
  }
  return out;
}
```

- [ ] **Step 4: Ejecuta el test y comprueba que pasa**

Run: `npm test`
Expected: PASS (6 tests nuevos + previos).

- [ ] **Step 5: Commit**

```bash
git add studio/src/fx/effects/reverb-impulse.ts studio/src/fx/effects/reverb-impulse.test.ts
git commit -m "Estudio F2: generador puro de impulso de reverb (ruido + caida) + test"
```

---

### Task 4: Efecto Reverberator (`fx/effects/reverb.ts`)

**Files:**
- Create: `studio/src/fx/effects/reverb.ts`
- Modify: `studio/src/fx/effects/index.ts` (añadir `import './reverb';`)

**Interfaces:**
- Consumes: `registerEffect`, `makeEffect`, `ParamSpec` de `../effect`; `impulseSamples` de `./reverb-impulse`.
- Produces: registra el efecto `'reverb'` (family `'delay'`).

- [ ] **Step 1: Implementa `reverb.ts`**

```ts
// studio/src/fx/effects/reverb.ts
// Reverberator: ConvolverNode con impulso generado (ruido + caída). El buffer se reconstruye con
// debounce al cambiar tamaño/caída (evita reconstruir en cada paso del deslizador).
import { registerEffect, makeEffect, ParamSpec } from '../effect';
import { impulseSamples } from './reverb-impulse';

export const REVERB_PARAMS: ParamSpec[] = [
  { name: 'size', label: 'Tamaño', min: 0.2, max: 4, step: 0.1, default: 1.8, unit: 's' },
  { name: 'decay', label: 'Caída', min: 1, max: 8, step: 0.1, default: 2.5 },
  { name: 'tone', label: 'Color', min: 800, max: 16000, step: 100, default: 9000, unit: 'Hz' },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 0.3 }
];

function buildImpulse(actx: AudioContext, size: number, decay: number): AudioBuffer {
  const len = Math.max(1, Math.floor(actx.sampleRate * size));
  const buf = actx.createBuffer(2, len, actx.sampleRate);
  buf.copyToChannel(impulseSamples(len, decay, 1), 0);
  buf.copyToChannel(impulseSamples(len, decay, 2), 1);   // semilla distinta por canal = estéreo
  return buf;
}

registerEffect('reverb', {
  label: 'Reverberación', family: 'delay', params: REVERB_PARAMS,
  create: (actx, state) => makeEffect(actx, 'reverb', REVERB_PARAMS, (actx, input, sink) => {
    let size = REVERB_PARAMS[0].default;
    let decay = REVERB_PARAMS[1].default;
    let rebuildT: ReturnType<typeof setTimeout> | null = null;
    const dryMix = actx.createGain();
    const conv = actx.createConvolver();
    conv.buffer = buildImpulse(actx, size, decay);
    const tone = actx.createBiquadFilter(); tone.type = 'lowpass';
    const wetMix = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    input.connect(conv); conv.connect(tone); tone.connect(wetMix); wetMix.connect(sink);
    const scheduleRebuild = () => {
      if (rebuildT) clearTimeout(rebuildT);
      rebuildT = setTimeout(() => { conv.buffer = buildImpulse(actx, size, decay); rebuildT = null; }, 120);
    };
    return (name, value) => {
      if (name === 'size') { size = value; scheduleRebuild(); }
      else if (name === 'decay') { decay = value; scheduleRebuild(); }
      else if (name === 'tone') tone.frequency.value = value;
      else if (name === 'mix') { wetMix.gain.value = value; dryMix.gain.value = 1 - value; }
    };
  }, state)
});
```

- [ ] **Step 2: Registra el efecto en el índice**

En `studio/src/fx/effects/index.ts`, añade `import './reverb';`. El archivo queda:

```ts
// studio/src/fx/effects/index.ts
// Importar este módulo registra todos los efectos disponibles. En tandas futuras se añaden más imports.
import './gain';
import './echo';
import './stereo-echo';
import './reflector';
import './reverb';
```

- [ ] **Step 3: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 4: Prueba manual (navegador)**

Run: `npm run dev`. Añade **Reverberación**: debe oírse una cola de reverberación; Tamaño alarga la cola, Caída la hace más corta/larga, Color apaga los agudos de la cola, Mezcla el balance. Al mover Tamaño/Caída no debe entrecortarse (debounce). Bypass la anula.

- [ ] **Step 5: Commit**

```bash
git add studio/src/fx/effects/reverb.ts studio/src/fx/effects/index.ts
git commit -m "Estudio F2: efecto Reverberator (ConvolverNode + impulso generado, presets por tamano/caida)"
```

---

### Task 5: Versión y documentación

**Files:**
- Modify: `studio/package.json` (version), `HANDOFF.md`, `CLAUDE.md`.

- [ ] **Step 1: Sube la versión.** En `studio/package.json` cambia `"version": "0.3.0"` a `"version": "0.4.0"`.

- [ ] **Step 2: `HANDOFF.md`.** En el bloque del proyecto pro, añade la **Tanda 2 (Delays/Espacio)**: 4 efectos nativos en `fx/effects/` (`echo.ts`, `stereo-echo.ts` ping-pong, `reflector.ts` peines, `reverb.ts` ConvolverNode con impulso generado puro `reverb-impulse.ts` + debounce al reconstruir el buffer), todos `family:'delay'`, registrados en `fx/effects/index.ts`. Test: `reverb-impulse` (mulberry32 + impulseSamples). Próximo: **Tanda 3 (Modulación)** — y ahí, antes de los efectos con osciladores LFO, el ajuste pendiente del marco (`makeEffect.dispose()` debe parar/desconectar osciladores: que `build` devuelva un teardown opcional).

- [ ] **Step 3: `CLAUDE.md`.** En la decisión 5 / hoja de ruta, marca que la **Tanda 2 (Delays/Espacio) está hecha**; quedan Modulación, Dinámica, Color/EQ y Tono.

- [ ] **Step 4: Verifica** — Run: `npm run build` (OK). Confirma `version` 0.4.0 y las docs.

- [ ] **Step 5: Commit**

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio F2 Tanda 2 (Delays/Espacio) v0.4.0: version y docs"
```

---

## Notas de ejecución
- Verificación = `npm run typecheck` / `npm test` / `npm run build` desde `d:\PianoVa\studio`. No commitear `node_modules`/`dist`.
- Patrón de todos los efectos: `build(actx, input, sink)` crea `dryMix`/`wetMix`, conecta `input → dryMix → sink` y `input → (cadena) → wetMix → sink`, y `apply` mapea cada parámetro. La regla de mezcla es siempre `wetMix.gain = mix; dryMix.gain = 1 - mix`.
- Tiempos en **ms** en la UI → `delayTime.value = ms/1000`.
- Reverb: el `conv.buffer` se reconstruye con debounce de 120 ms al cambiar `size`/`decay`; `tone`/`mix` se aplican al instante.
- Esta tanda NO necesita el ajuste de `dispose()` (ningún efecto usa osciladores; los `DelayNode`/`ConvolverNode` se recolectan al desconectarse). Ese ajuste va al inicio de la Tanda 3.
- No tocar `pianova.html`. Textos/comentarios en español.
```
