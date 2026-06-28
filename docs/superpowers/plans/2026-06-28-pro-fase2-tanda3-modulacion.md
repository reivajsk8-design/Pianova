# Fase 2 · Tanda 3 — Modulación (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir los 5 efectos de modulación (Tremolo, AutoPanner, Chorus/Flanger, Rotary Speaker, Fractal Doubler), todos nativos con osciladores LFO, tras ampliar el marco para que `dispose()` pare/desconecte esos osciladores.

**Architecture:** Primero se amplía `makeEffect` para que `build` pueda devolver, además de la función `apply`, un `teardown` que `dispose()` llamará (necesario porque los LFO son fuentes que siguen sonando si no se paran). Cada efecto usa un `OscillatorNode` (LFO) que modula un parámetro de audio (`gain`, `pan` o `delayTime`) y devuelve `{ apply, teardown }`.

**Tech Stack:** TypeScript strict, Vite, Vitest, Web Audio API. Proyecto en `studio/`.

## Global Constraints

- Todo el código nuevo va en **`studio/`**; **TypeScript strict**; **Vitest** para lo testeable; **sin framework de UI**; textos/comentarios en **español**. **No tocar `pianova.html`**.
- Reusar el marco: `makeEffect`, `registerEffect`, `ParamSpec` de `studio/src/fx/effect.ts`; registrar e importar cada efecto en `studio/src/fx/effects/index.ts`.
- **Todos los efectos de esta tanda son NATIVOS** y usan **LFO `OscillatorNode`**. Cada uno debe devolver `{ apply, teardown }` desde `build`; el `teardown` hace `lfo.stop()` + `disconnect()` de los nodos del LFO (las fuentes que no se recolectan solas).
- `family: 'mod'` para los 5.
- Patrón de mezcla (cuando aplique dry/wet): `wetMix.gain = mix; dryMix.gain = 1 - mix`. Tiempos en **ms** → `/1000`.
- `OscillatorNode` se arranca con `lfo.start()` al construir; los LFO modulan un `AudioParam` conectándose a él (suma).
- Verificación por tarea desde `d:\PianoVa\studio`: `npm run typecheck` + `npm test` + `npm run build`. Prueba manual por oído.

---

### Task 1: Ampliar `makeEffect` para teardown de osciladores (`fx/effect.ts`)

**Files:**
- Modify: `studio/src/fx/effect.ts` (tipo de `build`, extracción de `apply`/`teardown`, `dispose`).
- Test: `studio/src/fx/effect.test.ts`

**Interfaces:**
- Produces: `build` ahora puede devolver `((name,value)=>void)` **o** `{ apply: (name,value)=>void; teardown?: () => void }`. `dispose()` llama a `teardown()` (si existe) antes de desconectar los nodos del marco. Compatible hacia atrás: los efectos que devuelven solo la función `apply` siguen funcionando igual.

- [ ] **Step 1: Escribe el test que falla**

```ts
// studio/src/fx/effect.test.ts
import { describe, it, expect, vi } from 'vitest';
import { makeEffect } from './effect';

// AudioContext mínimo de prueba: nodos con gain.value/connect/disconnect.
function fakeCtx(): AudioContext {
  const mk = () => ({ gain: { value: 1 }, connect() { /* no-op */ }, disconnect() { /* no-op */ } });
  return { createGain: mk } as unknown as AudioContext;
}

describe('makeEffect teardown', () => {
  it('llama a teardown al hacer dispose cuando build devuelve {apply,teardown}', () => {
    const teardown = vi.fn();
    const fx = makeEffect(fakeCtx(), 'test', [], () => ({ apply: () => { /* no-op */ }, teardown }));
    fx.dispose();
    expect(teardown).toHaveBeenCalledTimes(1);
  });
  it('sigue funcionando cuando build devuelve solo la función apply', () => {
    const fx = makeEffect(fakeCtx(), 'test', [], () => () => { /* no-op */ });
    expect(() => fx.dispose()).not.toThrow();
  });
});
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `npm test`
Expected: FAIL — el segundo test puede pasar, pero el primero falla porque `teardown` no se llama (dispose actual no lo invoca). (Si TypeScript se queja del tipo de retorno de `build`, es porque aún no se ha ampliado: continúa al Step 3.)

- [ ] **Step 3: Amplía `makeEffect`**

En `studio/src/fx/effect.ts`, cambia la firma del parámetro `build` (línea ~38) de:

```ts
  build: (actx: AudioContext, input: GainNode, sink: GainNode) => (name: string, value: number) => void,
```

a:

```ts
  build: (actx: AudioContext, input: GainNode, sink: GainNode) =>
    | ((name: string, value: number) => void)
    | { apply: (name: string, value: number) => void; teardown?: () => void },
```

Cambia la línea `const apply = build(actx, input, wet);` (línea ~48) por:

```ts
  const built = build(actx, input, wet);
  const apply = typeof built === 'function' ? built : built.apply;
  const teardown = typeof built === 'function' ? undefined : built.teardown;
```

Y cambia la línea de `dispose` (línea ~70) por:

```ts
    dispose: () => {
      try { teardown?.(); } catch { /* ya */ }
      for (const n of [input, output, wet, dry]) { try { n.disconnect(); } catch { /* ya */ } }
    }
```

- [ ] **Step 4: Ejecuta el test y comprueba que pasa**

Run: `npm test`
Expected: PASS (2 tests nuevos + todos los previos; los efectos existentes que devuelven solo `apply` siguen verdes).

- [ ] **Step 5: Verifica typecheck + build**

Run: `npm run typecheck` → sin errores. Run: `npm run build` → OK.

- [ ] **Step 6: Commit**

```bash
git add studio/src/fx/effect.ts studio/src/fx/effect.test.ts
git commit -m "Estudio F2: makeEffect admite teardown (parar osciladores LFO en dispose) + test"
```

---

### Task 2: Tremolo y AutoPanner (`fx/effects/tremolo.ts`, `fx/effects/autopanner.ts`)

**Files:**
- Create: `studio/src/fx/effects/tremolo.ts`, `studio/src/fx/effects/autopanner.ts`
- Modify: `studio/src/fx/effects/index.ts`

**Interfaces:**
- Consumes: `registerEffect`, `makeEffect`, `ParamSpec` de `../effect`.
- Produces: registra `'tremolo'` y `'autopanner'` (family `'mod'`).

- [ ] **Step 1: Implementa `tremolo.ts`** (LFO modula la ganancia)

```ts
// studio/src/fx/effects/tremolo.ts
// Tremolo: un LFO modula la ganancia → la amplitud "tiembla". Forma 0=seno, 1=triángulo, 2=cuadrada.
import { registerEffect, makeEffect, ParamSpec } from '../effect';

const SHAPES: OscillatorType[] = ['sine', 'triangle', 'square'];

export const TREMOLO_PARAMS: ParamSpec[] = [
  { name: 'rate', label: 'Velocidad', min: 0.1, max: 12, step: 0.1, default: 5, unit: 'Hz' },
  { name: 'depth', label: 'Profundidad', min: 0, max: 1, step: 0.01, default: 0.6 },
  { name: 'shape', label: 'Forma', min: 0, max: 2, step: 1, default: 0 }
];

registerEffect('tremolo', {
  label: 'Tremolo', family: 'mod', params: TREMOLO_PARAMS,
  create: (actx, state) => makeEffect(actx, 'tremolo', TREMOLO_PARAMS, (actx, input, sink) => {
    const amp = actx.createGain();
    const lfo = actx.createOscillator();
    const lfoGain = actx.createGain();
    input.connect(amp); amp.connect(sink);
    lfo.connect(lfoGain); lfoGain.connect(amp.gain);
    lfo.start();
    const apply = (name: string, value: number) => {
      if (name === 'rate') lfo.frequency.value = value;
      else if (name === 'depth') { amp.gain.value = 1 - value * 0.5; lfoGain.gain.value = value * 0.5; }
      else if (name === 'shape') lfo.type = SHAPES[Math.max(0, Math.min(2, Math.round(value)))];
    };
    return { apply, teardown: () => { try { lfo.stop(); } catch { /* ya */ } lfo.disconnect(); lfoGain.disconnect(); } };
  }, state)
});
```

- [ ] **Step 2: Implementa `autopanner.ts`** (LFO modula el paneo)

```ts
// studio/src/fx/effects/autopanner.ts
// AutoPanner: un LFO mueve el paneo estéreo de izquierda a derecha.
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const AUTOPANNER_PARAMS: ParamSpec[] = [
  { name: 'rate', label: 'Velocidad', min: 0.1, max: 10, step: 0.1, default: 1, unit: 'Hz' },
  { name: 'depth', label: 'Profundidad', min: 0, max: 1, step: 0.01, default: 0.8 }
];

registerEffect('autopanner', {
  label: 'AutoPanner', family: 'mod', params: AUTOPANNER_PARAMS,
  create: (actx, state) => makeEffect(actx, 'autopanner', AUTOPANNER_PARAMS, (actx, input, sink) => {
    const panner = actx.createStereoPanner();
    const lfo = actx.createOscillator(); lfo.type = 'sine';
    const lfoGain = actx.createGain();
    input.connect(panner); panner.connect(sink);
    lfo.connect(lfoGain); lfoGain.connect(panner.pan);
    lfo.start();
    const apply = (name: string, value: number) => {
      if (name === 'rate') lfo.frequency.value = value;
      else if (name === 'depth') lfoGain.gain.value = value;   // paneo ±depth
    };
    return { apply, teardown: () => { try { lfo.stop(); } catch { /* ya */ } lfo.disconnect(); lfoGain.disconnect(); } };
  }, state)
});
```

- [ ] **Step 3: Registra ambos en el índice**

En `studio/src/fx/effects/index.ts`, añade las líneas tras `import './reverb';`:

```ts
import './tremolo';
import './autopanner';
```

- [ ] **Step 4: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 5: Prueba manual (navegador)**

Run: `npm run dev`. Añade **Tremolo**: la amplitud debe temblar; Velocidad cambia el ritmo, Profundidad la intensidad, Forma el carácter. Añade **AutoPanner** (con auriculares): el sonido se mueve de izquierda a derecha.

- [ ] **Step 6: Commit**

```bash
git add studio/src/fx/effects/tremolo.ts studio/src/fx/effects/autopanner.ts studio/src/fx/effects/index.ts
git commit -m "Estudio F2: efectos Tremolo y AutoPanner (LFO sobre ganancia/paneo)"
```

---

### Task 3: Chorus/Flanger (`fx/effects/chorus.ts`)

**Files:**
- Create: `studio/src/fx/effects/chorus.ts`
- Modify: `studio/src/fx/effects/index.ts`

**Interfaces:**
- Consumes: `registerEffect`, `makeEffect`, `ParamSpec` de `../effect`.
- Produces: registra `'chorus'` (family `'mod'`).

- [ ] **Step 1: Implementa `chorus.ts`** (delay corto modulado por LFO + realimentación; retardo pequeño = flanger, mayor = chorus)

```ts
// studio/src/fx/effects/chorus.ts
// Chorus/Flanger: un LFO modula un delay corto. Retardo base pequeño (~1-5ms) = flanger; mayor (~15-30ms) = chorus.
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const CHORUS_PARAMS: ParamSpec[] = [
  { name: 'rate', label: 'Velocidad', min: 0.05, max: 8, step: 0.05, default: 0.8, unit: 'Hz' },
  { name: 'depth', label: 'Profundidad', min: 0, max: 10, step: 0.1, default: 3, unit: 'ms' },
  { name: 'base', label: 'Retardo', min: 1, max: 30, step: 0.5, default: 18, unit: 'ms' },
  { name: 'feedback', label: 'Realimentación', min: 0, max: 0.9, step: 0.01, default: 0.2 },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 0.5 }
];

registerEffect('chorus', {
  label: 'Chorus/Flanger', family: 'mod', params: CHORUS_PARAMS,
  create: (actx, state) => makeEffect(actx, 'chorus', CHORUS_PARAMS, (actx, input, sink) => {
    const dryMix = actx.createGain();
    const delay = actx.createDelay(0.1);
    const fb = actx.createGain();
    const wetMix = actx.createGain();
    const lfo = actx.createOscillator(); lfo.type = 'sine';
    const lfoGain = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    input.connect(delay); delay.connect(wetMix); wetMix.connect(sink);
    delay.connect(fb); fb.connect(delay);
    lfo.connect(lfoGain); lfoGain.connect(delay.delayTime);
    lfo.start();
    const apply = (name: string, value: number) => {
      if (name === 'rate') lfo.frequency.value = value;
      else if (name === 'depth') lfoGain.gain.value = value / 1000;
      else if (name === 'base') delay.delayTime.value = value / 1000;
      else if (name === 'feedback') fb.gain.value = value;
      else if (name === 'mix') { wetMix.gain.value = value; dryMix.gain.value = 1 - value; }
    };
    return { apply, teardown: () => { try { lfo.stop(); } catch { /* ya */ } lfo.disconnect(); lfoGain.disconnect(); } };
  }, state)
});
```

- [ ] **Step 2: Registra en el índice**

En `studio/src/fx/effects/index.ts`, añade tras `import './autopanner';`:

```ts
import './chorus';
```

- [ ] **Step 3: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 4: Prueba manual (navegador)**

Run: `npm run dev`. Añade **Chorus/Flanger**: con Retardo ~18ms suena a coro (engrosa); baja Retardo a ~2ms y sube Realimentación para el barrido metálico de flanger; Velocidad y Profundidad controlan el vaivén.

- [ ] **Step 5: Commit**

```bash
git add studio/src/fx/effects/chorus.ts studio/src/fx/effects/index.ts
git commit -m "Estudio F2: efecto Chorus/Flanger (delay corto modulado por LFO)"
```

---

### Task 4: Rotary Speaker (`fx/effects/rotary.ts`)

**Files:**
- Create: `studio/src/fx/effects/rotary.ts`
- Modify: `studio/src/fx/effects/index.ts`

**Interfaces:**
- Consumes: `registerEffect`, `makeEffect`, `ParamSpec` de `../effect`.
- Produces: registra `'rotary'` (family `'mod'`).

- [ ] **Step 1: Implementa `rotary.ts`** (Leslie: un LFO modula amplitud y paneo a la vez = altavoz giratorio)

```ts
// studio/src/fx/effects/rotary.ts
// Rotary Speaker (Leslie): un LFO modula amplitud (tremolo suave) y paneo (giro) → altavoz giratorio.
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const ROTARY_PARAMS: ParamSpec[] = [
  { name: 'speed', label: 'Velocidad', min: 0.3, max: 7, step: 0.1, default: 5.5, unit: 'Hz' },
  { name: 'depth', label: 'Profundidad', min: 0, max: 1, step: 0.01, default: 0.6 }
];

registerEffect('rotary', {
  label: 'Rotary Speaker', family: 'mod', params: ROTARY_PARAMS,
  create: (actx, state) => makeEffect(actx, 'rotary', ROTARY_PARAMS, (actx, input, sink) => {
    const amp = actx.createGain();
    const panner = actx.createStereoPanner();
    const lfo = actx.createOscillator(); lfo.type = 'sine';
    const ampDepth = actx.createGain();
    const panDepth = actx.createGain();
    input.connect(amp); amp.connect(panner); panner.connect(sink);
    lfo.connect(ampDepth); ampDepth.connect(amp.gain);
    lfo.connect(panDepth); panDepth.connect(panner.pan);
    lfo.start();
    const apply = (name: string, value: number) => {
      if (name === 'speed') lfo.frequency.value = value;
      else if (name === 'depth') {
        amp.gain.value = 1 - value * 0.3;   // tremolo suave (la amplitud no se va a 0)
        ampDepth.gain.value = value * 0.3;
        panDepth.gain.value = value;        // el giro sí usa todo el paneo
      }
    };
    return { apply, teardown: () => { try { lfo.stop(); } catch { /* ya */ } lfo.disconnect(); ampDepth.disconnect(); panDepth.disconnect(); } };
  }, state)
});
```

- [ ] **Step 2: Registra en el índice**

En `studio/src/fx/effects/index.ts`, añade tras `import './chorus';`:

```ts
import './rotary';
```

- [ ] **Step 3: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 4: Prueba manual (navegador)**

Run: `npm run dev`. Añade **Rotary Speaker** (con auriculares, mejor con órgano): el sonido gira (amplitud + paneo); Velocidad alta = giro rápido, baja = lento; Profundidad la intensidad del giro.

- [ ] **Step 5: Commit**

```bash
git add studio/src/fx/effects/rotary.ts studio/src/fx/effects/index.ts
git commit -m "Estudio F2: efecto Rotary Speaker (Leslie: LFO sobre amplitud y paneo)"
```

---

### Task 5: Fractal Doubler (`fx/effects/fractal-doubler.ts`)

**Files:**
- Create: `studio/src/fx/effects/fractal-doubler.ts`
- Modify: `studio/src/fx/effects/index.ts`

**Interfaces:**
- Consumes: `registerEffect`, `makeEffect`, `ParamSpec` de `../effect`.
- Produces: registra `'fractal-doubler'` (family `'mod'`).

- [ ] **Step 1: Implementa `fractal-doubler.ts`** (varias copias con delays cortos modulados a velocidades no enteras → engrosa la voz)

```ts
// studio/src/fx/effects/fractal-doubler.ts
// Fractal Doubler: 3 copias con delays cortos modulados a velocidades no enteras (suena "doblado"/grueso).
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const FRACTAL_PARAMS: ParamSpec[] = [
  { name: 'amount', label: 'Profundidad', min: 0, max: 8, step: 0.1, default: 3, unit: 'ms' },
  { name: 'rate', label: 'Velocidad', min: 0.05, max: 3, step: 0.05, default: 0.5, unit: 'Hz' },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 0.5 }
];

const DELAYS_MS = [11, 17, 23];          // retardos base de cada copia
const RATE_MUL = [1, 1.37, 0.71];        // multiplicadores no enteros = movimiento "fractal"
const PANS = [-0.5, 0.5, 0];             // reparto estéreo de las copias

registerEffect('fractal-doubler', {
  label: 'Fractal Doubler', family: 'mod', params: FRACTAL_PARAMS,
  create: (actx, state) => makeEffect(actx, 'fractal-doubler', FRACTAL_PARAMS, (actx, input, sink) => {
    const dryMix = actx.createGain();
    const wetMix = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    wetMix.connect(sink);
    const lfos: OscillatorNode[] = [];
    const lfoGains: GainNode[] = [];
    for (let i = 0; i < DELAYS_MS.length; i++) {
      const delay = actx.createDelay(0.1); delay.delayTime.value = DELAYS_MS[i] / 1000;
      const pan = actx.createStereoPanner(); pan.pan.value = PANS[i];
      const lfo = actx.createOscillator(); lfo.type = 'sine';
      const lg = actx.createGain();
      input.connect(delay); delay.connect(pan); pan.connect(wetMix);
      lfo.connect(lg); lg.connect(delay.delayTime); lfo.start();
      lfos.push(lfo); lfoGains.push(lg);
    }
    let rate = FRACTAL_PARAMS[1].default;
    let amount = FRACTAL_PARAMS[0].default;
    const applyMod = () => {
      for (let i = 0; i < lfos.length; i++) {
        lfos[i].frequency.value = rate * RATE_MUL[i];
        lfoGains[i].gain.value = (amount / 1000) * (0.6 + 0.4 * (i / lfos.length));
      }
    };
    const apply = (name: string, value: number) => {
      if (name === 'amount') { amount = value; applyMod(); }
      else if (name === 'rate') { rate = value; applyMod(); }
      else if (name === 'mix') { wetMix.gain.value = value; dryMix.gain.value = 1 - value; }
    };
    return { apply, teardown: () => { lfos.forEach(l => { try { l.stop(); } catch { /* ya */ } l.disconnect(); }); lfoGains.forEach(g => g.disconnect()); } };
  }, state)
});
```

- [ ] **Step 2: Registra en el índice**

En `studio/src/fx/effects/index.ts`, añade tras `import './rotary';`. El archivo completo queda:

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
```

- [ ] **Step 3: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 4: Prueba manual (navegador)**

Run: `npm run dev`. Añade **Fractal Doubler**: la voz debe sonar más gruesa/ancha (varias copias); Profundidad y Velocidad cambian el movimiento; Mezcla el balance.

- [ ] **Step 5: Commit**

```bash
git add studio/src/fx/effects/fractal-doubler.ts studio/src/fx/effects/index.ts
git commit -m "Estudio F2: efecto Fractal Doubler (copias cortas moduladas, engrosa la voz)"
```

---

### Task 6: Versión y documentación

**Files:**
- Modify: `studio/package.json` (version), `HANDOFF.md`, `CLAUDE.md`.

- [ ] **Step 1: Sube la versión.** En `studio/package.json` cambia `"version": "0.4.0"` a `"version": "0.5.0"`.

- [ ] **Step 2: `HANDOFF.md`.** En el bloque del proyecto pro, añade la **Tanda 3 (Modulación)**: el marco amplió `makeEffect` (`build` puede devolver `{apply, teardown}`; `dispose` llama a `teardown` para parar los LFO); 5 efectos nativos `family:'mod'` en `fx/effects/` (registrados en `index.ts`): **Tremolo** (LFO→ganancia, forma seno/triángulo/cuadrada), **AutoPanner** (LFO→paneo), **Chorus/Flanger** (`chorus.ts`: delay corto modulado + realimentación; base pequeño=flanger), **Rotary Speaker** (`rotary.ts`: Leslie, LFO→amplitud+paneo), **Fractal Doubler** (`fractal-doubler.ts`: 3 copias con delays cortos modulados a velocidades no enteras). Cada efecto devuelve `teardown` que para/desconecta sus LFO. Test: `effect.test.ts` (teardown). Próximo: **Tanda 4 (Dinámica)**.

- [ ] **Step 3: `CLAUDE.md`.** En la decisión 5 / hoja de ruta, marca que la **Tanda 3 (Modulación) está hecha** (y el marco ya para osciladores en dispose); quedan Dinámica, Color/EQ y Tono.

- [ ] **Step 4: Verifica** — Run: `npm run build` (OK). Confirma `version` 0.5.0 y las docs.

- [ ] **Step 5: Commit**

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio F2 Tanda 3 (Modulacion) v0.5.0: version y docs"
```

---

## Notas de ejecución
- Verificación = `npm run typecheck` / `npm test` / `npm run build` desde `d:\PianoVa\studio`. No commitear `node_modules`/`dist`.
- **Task 1 va primero**: amplía `makeEffect` (teardown). Sin ella, los LFO de los efectos siguientes seguirían sonando tras quitarlos del rack.
- Cada efecto con LFO **debe** devolver `{ apply, teardown }` y su `teardown` hace `lfo.stop()` + `disconnect()` de los nodos del LFO. Los nodos de señal (amp/delay/panner) se recolectan solos al desconectarse `input`/`sink`.
- LFO: `lfo.connect(lfoGain); lfoGain.connect(<AudioParam>)` modula sumando; `lfoGain.gain` = profundidad de modulación.
- Web Audio limita `delayTime`/`pan` a sus rangos válidos automáticamente; no hace falta acotar a mano.
- No tocar `pianova.html`. Textos/comentarios en español.
```
