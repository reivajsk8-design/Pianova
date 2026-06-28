# Fase 2 · Tanda 4 — Dinámica (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir los 4 efectos de dinámica (Scaling Limiter, Dynamics estéreo, Dynamics mono, DeEsser), todos nativos con `DynamicsCompressorNode` y `BiquadFilter`.

**Architecture:** Cada efecto se construye con `makeEffect`. El compresor nativo `DynamicsCompressorNode` cubre limitador y compresor (con un `GainNode` de makeup detrás). El Dynamics mono suma a mono antes de comprimir. El DeEsser separa grave/agudo con `BiquadFilter` y comprime solo la banda aguda. Ninguno usa osciladores, así que `build` devuelve solo la función `apply` (sin teardown).

**Tech Stack:** TypeScript strict, Vite, Vitest, Web Audio API. Proyecto en `studio/`.

## Global Constraints

- Todo el código nuevo va en **`studio/`**; **TypeScript strict**; **sin framework de UI**; textos/comentarios en **español**. **No tocar `pianova.html`**.
- Reusar el marco: `makeEffect`, `registerEffect`, `ParamSpec` de `studio/src/fx/effect.ts`; `dbToLin` de `studio/src/fx/effects/gain.ts` (no redefinir dB→lineal). Registrar e importar cada efecto en `studio/src/fx/effects/index.ts`.
- **Todos los efectos de esta tanda son NATIVOS** (`DynamicsCompressorNode` + `BiquadFilter`). Sin AudioWorklet.
- `family: 'dyn'` para todos.
- El makeup gain se aplica con un `GainNode` detrás del compresor; el valor de UI va en **dB** → `dbToLin`.
- Estos efectos NO tienen osciladores: `build` devuelve solo `(name, value) => void` (sin teardown).
- Verificación por tarea desde `d:\PianoVa\studio`: `npm run typecheck` + `npm test` + `npm run build`. Prueba manual por oído.

---

### Task 1: Scaling Limiter (`fx/effects/limiter.ts`)

**Files:**
- Create: `studio/src/fx/effects/limiter.ts`
- Modify: `studio/src/fx/effects/index.ts` (añadir `import './limiter';`)

**Interfaces:**
- Consumes: `registerEffect`, `makeEffect`, `ParamSpec` de `../effect`; `dbToLin` de `./gain`.
- Produces: registra `'limiter'` (family `'dyn'`).

- [ ] **Step 1: Implementa `limiter.ts`** (compresor con ratio alto + makeup = limitador)

```ts
// studio/src/fx/effects/limiter.ts
// Scaling Limiter: DynamicsCompressor con ratio alto (limita picos) + ganancia de compensación (makeup).
import { registerEffect, makeEffect, ParamSpec } from '../effect';
import { dbToLin } from './gain';

export const LIMITER_PARAMS: ParamSpec[] = [
  { name: 'threshold', label: 'Umbral', min: -40, max: 0, step: 0.5, default: -3, unit: 'dB' },
  { name: 'release', label: 'Release', min: 0.01, max: 0.5, step: 0.01, default: 0.1, unit: 's' },
  { name: 'makeup', label: 'Ganancia', min: 0, max: 24, step: 0.5, default: 0, unit: 'dB' }
];

registerEffect('limiter', {
  label: 'Scaling Limiter', family: 'dyn', params: LIMITER_PARAMS,
  create: (actx, state) => makeEffect(actx, 'limiter', LIMITER_PARAMS, (actx, input, sink) => {
    const comp = actx.createDynamicsCompressor();
    comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = 0.002;
    const makeup = actx.createGain();
    input.connect(comp); comp.connect(makeup); makeup.connect(sink);
    return (name: string, value: number) => {
      if (name === 'threshold') comp.threshold.value = value;
      else if (name === 'release') comp.release.value = value;
      else if (name === 'makeup') makeup.gain.value = dbToLin(value);
    };
  }, state)
});
```

- [ ] **Step 2: Registra en el índice**

En `studio/src/fx/effects/index.ts`, añade tras `import './fractal-doubler';`:

```ts
import './limiter';
```

- [ ] **Step 3: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 4: Prueba manual (navegador)**

Run: `npm run dev`. Añade **Scaling Limiter** al rack maestro y toca fuerte (acordes): los picos deben quedar contenidos; baja Umbral para limitar más, sube Ganancia para recuperar volumen. Bypass lo anula.

- [ ] **Step 5: Commit**

```bash
git add studio/src/fx/effects/limiter.ts studio/src/fx/effects/index.ts
git commit -m "Estudio F2: efecto Scaling Limiter (DynamicsCompressor ratio alto + makeup)"
```

---

### Task 2: Dynamics estéreo y mono (`fx/effects/dynamics.ts`)

**Files:**
- Create: `studio/src/fx/effects/dynamics.ts`
- Modify: `studio/src/fx/effects/index.ts` (añadir `import './dynamics';`)

**Interfaces:**
- Consumes: `registerEffect`, `makeEffect`, `ParamSpec` de `../effect`; `dbToLin` de `./gain`.
- Produces: registra `'dynamics'` (estéreo) y `'dynamics-mono'` (family `'dyn'`). Exporta `DYNAMICS_PARAMS`.

- [ ] **Step 1: Implementa `dynamics.ts`** (compresor completo; la variante mono suma a mono antes de comprimir)

```ts
// studio/src/fx/effects/dynamics.ts
// Dynamics: compresor completo (DynamicsCompressor) con makeup. Dos variantes: estéreo (detección
// enlazada nativa) y mono (suma a mono antes de comprimir). Comparten el mismo motor.
import { registerEffect, makeEffect, ParamSpec } from '../effect';
import { dbToLin } from './gain';

export const DYNAMICS_PARAMS: ParamSpec[] = [
  { name: 'threshold', label: 'Umbral', min: -60, max: 0, step: 0.5, default: -24, unit: 'dB' },
  { name: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, default: 4 },
  { name: 'knee', label: 'Codo', min: 0, max: 40, step: 1, default: 6, unit: 'dB' },
  { name: 'attack', label: 'Ataque', min: 0, max: 0.5, step: 0.001, default: 0.01, unit: 's' },
  { name: 'release', label: 'Release', min: 0.01, max: 1, step: 0.01, default: 0.25, unit: 's' },
  { name: 'makeup', label: 'Ganancia', min: 0, max: 24, step: 0.5, default: 0, unit: 'dB' }
];

// Monta el compresor entre input y sink. Si `mono`, suma a un solo canal antes de comprimir.
function buildCompressor(actx: AudioContext, input: GainNode, sink: GainNode, mono: boolean) {
  let head: AudioNode = input;
  if (mono) {
    const sum = actx.createGain();
    sum.channelCount = 1; sum.channelCountMode = 'explicit'; sum.channelInterpretation = 'speakers';
    input.connect(sum); head = sum;
  }
  const comp = actx.createDynamicsCompressor();
  const makeup = actx.createGain();
  head.connect(comp); comp.connect(makeup); makeup.connect(sink);
  return (name: string, value: number) => {
    if (name === 'threshold') comp.threshold.value = value;
    else if (name === 'ratio') comp.ratio.value = value;
    else if (name === 'knee') comp.knee.value = value;
    else if (name === 'attack') comp.attack.value = value;
    else if (name === 'release') comp.release.value = value;
    else if (name === 'makeup') makeup.gain.value = dbToLin(value);
  };
}

registerEffect('dynamics', {
  label: 'Dynamics (estéreo)', family: 'dyn', params: DYNAMICS_PARAMS,
  create: (actx, state) => makeEffect(actx, 'dynamics', DYNAMICS_PARAMS,
    (actx, input, sink) => buildCompressor(actx, input, sink, false), state)
});

registerEffect('dynamics-mono', {
  label: 'Dynamics (mono)', family: 'dyn', params: DYNAMICS_PARAMS,
  create: (actx, state) => makeEffect(actx, 'dynamics-mono', DYNAMICS_PARAMS,
    (actx, input, sink) => buildCompressor(actx, input, sink, true), state)
});
```

- [ ] **Step 2: Registra en el índice**

En `studio/src/fx/effects/index.ts`, añade tras `import './limiter';`:

```ts
import './dynamics';
```

- [ ] **Step 3: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 4: Prueba manual (navegador)**

Run: `npm run dev`. Añade **Dynamics (estéreo)**: tocando fuerte, baja Umbral y sube Ratio → la dinámica se comprime (más parejo); Ataque/Release cambian la respuesta; Ganancia recupera nivel. Añade **Dynamics (mono)**: igual, pero la salida queda centrada (mono).

- [ ] **Step 5: Commit**

```bash
git add studio/src/fx/effects/dynamics.ts studio/src/fx/effects/index.ts
git commit -m "Estudio F2: efectos Dynamics estereo y mono (compresor completo + makeup)"
```

---

### Task 3: DeEsser (`fx/effects/deesser.ts`)

**Files:**
- Create: `studio/src/fx/effects/deesser.ts`
- Modify: `studio/src/fx/effects/index.ts` (añadir `import './deesser';`)

**Interfaces:**
- Consumes: `registerEffect`, `makeEffect`, `ParamSpec` de `../effect`.
- Produces: registra `'deesser'` (family `'dyn'`).

- [ ] **Step 1: Implementa `deesser.ts`** (separa grave/agudo y comprime solo la banda aguda)

```ts
// studio/src/fx/effects/deesser.ts
// DeEsser por bandas: la banda grave pasa intacta; la banda aguda (sibilancias) se comprime y se vuelve
// a sumar. Cuando suben las "eses", esa banda se atenúa.
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const DEESSER_PARAMS: ParamSpec[] = [
  { name: 'freq', label: 'Frecuencia', min: 2000, max: 12000, step: 100, default: 6000, unit: 'Hz' },
  { name: 'threshold', label: 'Umbral', min: -60, max: 0, step: 0.5, default: -30, unit: 'dB' },
  { name: 'amount', label: 'Cantidad', min: 1, max: 20, step: 0.5, default: 6 }
];

registerEffect('deesser', {
  label: 'DeEsser', family: 'dyn', params: DEESSER_PARAMS,
  create: (actx, state) => makeEffect(actx, 'deesser', DEESSER_PARAMS, (actx, input, sink) => {
    const low = actx.createBiquadFilter(); low.type = 'lowpass';
    const high = actx.createBiquadFilter(); high.type = 'highpass';
    const comp = actx.createDynamicsCompressor();
    comp.knee.value = 6; comp.attack.value = 0.001; comp.release.value = 0.05;
    input.connect(low); low.connect(sink);                          // banda grave intacta
    input.connect(high); high.connect(comp); comp.connect(sink);    // banda aguda comprimida
    return (name: string, value: number) => {
      if (name === 'freq') { low.frequency.value = value; high.frequency.value = value; }
      else if (name === 'threshold') comp.threshold.value = value;
      else if (name === 'amount') comp.ratio.value = value;
    };
  }, state)
});
```

- [ ] **Step 2: Registra en el índice**

En `studio/src/fx/effects/index.ts`, añade tras `import './dynamics';`:

```ts
import './deesser';
```

- [ ] **Step 3: Verifica typecheck + tests + build**

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 4: Prueba manual (navegador)**

Run: `npm run dev`. Añade **DeEsser** (mejor sobre un instrumento con agudos): al subir Cantidad y bajar Umbral, los agudos fuertes se suavizan; Frecuencia elige dónde actúa.

- [ ] **Step 5: Commit**

```bash
git add studio/src/fx/effects/deesser.ts studio/src/fx/effects/index.ts
git commit -m "Estudio F2: efecto DeEsser (compresion de la banda aguda)"
```

---

### Task 4: Versión y documentación

**Files:**
- Modify: `studio/package.json` (version), `HANDOFF.md`, `CLAUDE.md`.

- [ ] **Step 1: Sube la versión.** En `studio/package.json` cambia `"version": "0.5.0"` a `"version": "0.6.0"`.

- [ ] **Step 2: `HANDOFF.md`.** En el bloque del proyecto pro, añade la **Tanda 4 (Dinámica)**: 4 efectos nativos `family:'dyn'` en `fx/effects/` (registrados en `index.ts`): **Scaling Limiter** (`limiter.ts`: DynamicsCompressor ratio 20 + makeup), **Dynamics estéreo** y **Dynamics mono** (`dynamics.ts`: compresor completo umbral/ratio/knee/ataque/release/makeup; mono suma a un canal antes de comprimir; helper `buildCompressor`), **DeEsser** (`deesser.ts`: separa grave/agudo con BiquadFilter y comprime solo la banda aguda). Reusan `dbToLin` de `gain.ts`. **Decisión:** toda la dinámica se hizo nativa (DynamicsCompressorNode), no AudioWorklet. Próximo: **Tanda 5 (Color/EQ)**.

- [ ] **Step 3: `CLAUDE.md`.** En la decisión 5 / hoja de ruta, marca que la **Tanda 4 (Dinámica) está hecha**; quedan Color/EQ y Tono.

- [ ] **Step 4: Verifica** — Run: `npm run build` (OK). Confirma `version` 0.6.0 y las docs.

- [ ] **Step 5: Commit**

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio F2 Tanda 4 (Dinamica) v0.6.0: version y docs"
```

---

## Notas de ejecución
- Verificación = `npm run typecheck` / `npm test` / `npm run build` desde `d:\PianoVa\studio`. No commitear `node_modules`/`dist`.
- Reusar `dbToLin` de `gain.ts` (no redefinir). El makeup es un `GainNode` detrás del compresor; UI en dB.
- Estos efectos no tienen osciladores → `build` devuelve solo la función `apply` (sin teardown).
- Dynamics mono: `GainNode` con `channelCount=1`/`channelCountMode='explicit'` fuerza la suma a mono.
- DeEsser: `low`(lowpass) y `high`(highpass) comparten la frecuencia de corte; solo la banda alta pasa por el compresor; `amount` mapea al `ratio`.
- No tocar `pianova.html`. Textos/comentarios en español.
```
