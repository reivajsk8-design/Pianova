# EQ mid/side (E2b) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el EQ gráfico procese Mid (centro) y Side (lados) por separado — un modo Estéreo (una cadena) y un modo Mid/Side (dos cadenas independientes con la EQ completa).

**Architecture:** Se refactoriza la cadena de un canal (8 biquads + detectores + bucle dinámico) en `fx/eq-chain.ts` (`makeEqChain`). El efecto compone 1 cadena (estéreo) o 2 (mid+side) con una matriz de codificación/decodificación M/S (ChannelSplitter/Merger + gains) y reconstruye el enrutado al cambiar de modo. El editor gana un selector de modo/canal; el resto opera sobre el canal activo. `EqApi` se implementa enrutando al canal activo (con `analyser` como getter).

**Tech Stack:** Vite + TypeScript (strict) + Vitest. Web Audio (BiquadFilter, ChannelSplitter/Merger, AnalyserNode, setInterval).

## Global Constraints

- Todo el trabajo en `studio/` (NO tocar `pianova.html`). TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón `var(--pv-acc)`.
- No cambiar el motor de audio base ni el rack/overlay. Modo estéreo = comportamiento actual exacto.
- Compat: proyectos v0.26 (sin `_ms`) abren en **modo estéreo** (mismo sonido).
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build` (desde `studio/`).

---

### Task 1: Núcleo — prefijo de params + métodos de modo en `EqApi` (`fx/eq-core.ts`)

**Files:**
- Modify: `studio/src/fx/eq-core.ts`
- Modify: `studio/src/fx/eq-core.test.ts`
- Modify: `studio/src/fx/effects/eq-graphic.ts` (stubs mínimos de los nuevos métodos de `EqApi`, para que compile; se reemplaza en Task 3)

**Interfaces:**
- Produces: `bandsToParams(bands, prefix?='b')` y `bandsFromParams(params, prefix?='b')`; `EqApi` gana
  `mode()`, `setMode(m)`, `channelLabels()`, `activeChannel()`, `setActiveChannel(i)`.

- [ ] **Step 1: Write the failing test (añadir a `fx/eq-core.test.ts`)**

Añade al final del archivo:

```ts
describe('eq-core prefijo de params', () => {
  it('bandsToParams/bandsFromParams con prefijo "s": ida y vuelta e independencia', () => {
    const b = defaultBands();
    b[0] = { ...b[0], gain: 4 };
    const ps = bandsToParams(b, 's');
    expect(Object.keys(ps).every(k => k.startsWith('s'))).toBe(true);   // todas con prefijo s
    expect(bandsFromParams(ps, 's')).toEqual(b);                        // ida y vuelta
    expect(bandsFromParams(ps, 'b')[0].gain).toBe(0);                   // otro prefijo → por defecto
  });
  it('prefijo por defecto sigue siendo "b" (compatibilidad)', () => {
    const b = defaultBands();
    expect(Object.keys(bandsToParams(b)).every(k => k.startsWith('b'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd studio && npm test -- eq-core`
Expected: FAIL (`bandsToParams` no acepta prefijo).

- [ ] **Step 3: Edita `fx/eq-core.ts`**

(a) Añade los métodos de modo a la interfaz `EqApi` (tras `magResponse`):

```ts
export interface EqApi {
  getBands(): EqBand[];
  setBand(i: number, patch: Partial<EqBand>): void;
  setDyn(i: number, patch: Partial<EqDyn>): void;
  reset(): void;
  applyPreset(name: string): void;
  presetNames(): string[];
  analyser: AnalyserNode;
  magResponse(freqs: Float32Array): Float32Array;
  mode(): 'stereo' | 'ms';
  setMode(m: 'stereo' | 'ms'): void;
  channelLabels(): string[];
  activeChannel(): number;
  setActiveChannel(i: number): void;
}
```

(b) Sustituye `bandsToParams` y `bandsFromParams` para aceptar un prefijo (por defecto `'b'`):

```ts
export function bandsToParams(bands: EqBand[], prefix = 'b'): Record<string, number> {
  const p: Record<string, number> = {};
  bands.forEach((b, i) => {
    p[`${prefix}${i}_freq`] = b.freq; p[`${prefix}${i}_gain`] = b.gain; p[`${prefix}${i}_q`] = b.q; p[`${prefix}${i}_on`] = b.on ? 1 : 0;
    p[`${prefix}${i}_dyn_on`] = b.dyn.on ? 1 : 0; p[`${prefix}${i}_thr`] = b.dyn.threshold; p[`${prefix}${i}_range`] = b.dyn.range;
    p[`${prefix}${i}_atk`] = b.dyn.attack; p[`${prefix}${i}_rel`] = b.dyn.release;
  });
  return p;
}
export function bandsFromParams(params: Record<string, number>, prefix = 'b'): EqBand[] {
  return defaultBands().map((b, i) => ({
    type: b.type,
    freq: params[`${prefix}${i}_freq`] ?? b.freq,
    gain: params[`${prefix}${i}_gain`] ?? b.gain,
    q: params[`${prefix}${i}_q`] ?? b.q,
    on: params[`${prefix}${i}_on`] !== undefined ? params[`${prefix}${i}_on`] === 1 : b.on,
    dyn: {
      on: params[`${prefix}${i}_dyn_on`] !== undefined ? params[`${prefix}${i}_dyn_on`] === 1 : b.dyn.on,
      threshold: params[`${prefix}${i}_thr`] ?? b.dyn.threshold,
      range: params[`${prefix}${i}_range`] ?? b.dyn.range,
      attack: params[`${prefix}${i}_atk`] ?? b.dyn.attack,
      release: params[`${prefix}${i}_rel`] ?? b.dyn.release
    }
  }));
}
```

- [ ] **Step 4: Stubs mínimos en `fx/effects/eq-graphic.ts` (para que compile)**

En el objeto `const eq: EqApi = { … }` del efecto actual, añade estos métodos (tras `magResponse`):

```ts
    mode: () => 'stereo',
    setMode: () => { /* implementado en E2b */ },
    channelLabels: () => ['Estéreo'],
    activeChannel: () => 0,
    setActiveChannel: () => { /* implementado en E2b */ }
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS (los tests nuevos + los previos; el efecto E2 compila con los stubs).

- [ ] **Step 6: Commit**

```bash
git add studio/src/fx/eq-core.ts studio/src/fx/eq-core.test.ts studio/src/fx/effects/eq-graphic.ts
git commit -m "Estudio EQ M/S: prefijo en params + métodos de modo en EqApi (stubs) + tests"
```

---

### Task 2: Helper de cadena reutilizable (`fx/eq-chain.ts`)

**Files:**
- Create: `studio/src/fx/eq-chain.ts`

**Interfaces:**
- Consumes: `EqBand`, `EqDyn`, `BAND_TYPES`, `defaultBands`, `presetBands`, `dynTarget`, `envCoef` (`eq-core`);
  `ramp` (`fx/param.ts`).
- Produces: `EqChain` y `makeEqChain(actx, initial: EqBand[]): EqChain`. `EqChain = { input, output, analyser,
  getBands, setBand, setDyn, reset, applyPreset, magResponse, snapshot, dispose }`.

Sin test unitario (Web Audio); verificado por typecheck + build (no se usa aún).

- [ ] **Step 1: Crea `fx/eq-chain.ts`**

```ts
// studio/src/fx/eq-chain.ts
// Una CADENA de EQ de 8 bandas (estática + dinámica) reutilizable: input → 8 biquads → output, con detectores
// por banda (paso-banda→analyser) y un bucle ~60 Hz que modula la ganancia. Se compone 1 (estéreo) o 2 (mid/
// side) por el efecto. Portado de la versión monocanal de eq-graphic.
import { ramp } from './param';
import { EqBand, EqDyn, BAND_TYPES, defaultBands, presetBands, dynTarget, envCoef } from './eq-core';

const DET_Q = 2.5, TICK_MS = 16, KNEE = 18;

export interface EqChain {
  input: GainNode; output: GainNode; analyser: AnalyserNode;
  getBands(): EqBand[];
  setBand(i: number, patch: Partial<EqBand>): void;
  setDyn(i: number, patch: Partial<EqDyn>): void;
  reset(): void;
  applyPreset(name: string): void;
  magResponse(freqs: Float32Array): Float32Array;
  snapshot(): EqBand[];
  dispose(): void;
}

export function makeEqChain(actx: AudioContext, initial: EqBand[]): EqChain {
  const input = actx.createGain(), output = actx.createGain();
  const nodes = BAND_TYPES.map(t => { const b = actx.createBiquadFilter(); b.type = t; return b; });
  input.connect(nodes[0]);
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  nodes[nodes.length - 1].connect(output);

  const analyser = actx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.8;
  input.connect(analyser);

  const detBp = BAND_TYPES.map(() => { const b = actx.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = DET_Q; return b; });
  const detAn = BAND_TYPES.map(() => { const a = actx.createAnalyser(); a.fftSize = 256; return a; });
  detBp.forEach((bp, i) => { input.connect(bp); bp.connect(detAn[i]); });
  const env = new Float32Array(BAND_TYPES.length);
  const detBuf = new Float32Array(detAn[0].fftSize);
  let timer: ReturnType<typeof setInterval> | null = null;

  let bands: EqBand[] = initial;

  function applyBand(i: number): void {
    const b = bands[i], n = nodes[i];
    ramp(n.frequency, b.freq, actx);
    ramp(n.Q, b.q, actx);
    detBp[i].frequency.value = b.freq;
    if (!b.on) { env[i] = 0; ramp(n.gain, 0, actx); }
    else if (!b.dyn.on) { env[i] = 0; ramp(n.gain, b.gain, actx); }
    else ramp(n.gain, b.gain + env[i], actx);
  }
  function levelDb(i: number): number {
    detAn[i].getFloatTimeDomainData(detBuf as Float32Array<ArrayBuffer>);
    let s = 0; for (let k = 0; k < detBuf.length; k++) s += detBuf[k] * detBuf[k];
    return 20 * Math.log10(Math.max(Math.sqrt(s / detBuf.length), 1e-6));
  }
  function tick(): void {
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i]; if (!b.on || !b.dyn.on) continue;
      const target = dynTarget(levelDb(i), b.dyn.threshold, b.dyn.range, KNEE);
      const coef = envCoef(Math.abs(target) > Math.abs(env[i]) ? b.dyn.attack : b.dyn.release, TICK_MS);
      env[i] += (target - env[i]) * coef;
      ramp(nodes[i].gain, b.gain + env[i], actx, 0.01);
    }
  }
  function updateLoop(): void {
    const any = bands.some(b => b.on && b.dyn.on);
    if (any && !timer) timer = setInterval(tick, TICK_MS);
    else if (!any && timer) { clearInterval(timer); timer = null; }
  }

  bands.forEach((_, i) => applyBand(i));
  updateLoop();

  return {
    input, output, analyser,
    getBands: () => bands.map(b => ({ ...b, dyn: { ...b.dyn } })),
    setBand: (i, patch) => { bands[i] = { ...bands[i], ...patch }; applyBand(i); updateLoop(); },
    setDyn: (i, patch) => { bands[i] = { ...bands[i], dyn: { ...bands[i].dyn, ...patch } }; applyBand(i); updateLoop(); },
    reset: () => { bands = defaultBands(); bands.forEach((_, i) => applyBand(i)); updateLoop(); },
    applyPreset: (name) => { bands = presetBands(name); bands.forEach((_, i) => applyBand(i)); updateLoop(); },
    magResponse: (freqs) => {
      const N = freqs.length, mag = new Float32Array(N), ph = new Float32Array(N);
      const tot = new Float32Array(N).fill(1);
      for (const n of nodes) { n.getFrequencyResponse(freqs as Float32Array<ArrayBuffer>, mag, ph); for (let i = 0; i < N; i++) tot[i] *= mag[i]; }
      return tot;
    },
    snapshot: () => bands.map(b => ({ ...b, dyn: { ...b.dyn } })),
    dispose: () => {
      if (timer) { clearInterval(timer); timer = null; }
      for (const n of [input, output, analyser, ...nodes, ...detBp, ...detAn]) { try { n.disconnect(); } catch { /* ya */ } }
    }
  };
}
```

- [ ] **Step 2: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS (no se usa aún).

- [ ] **Step 3: Commit**

```bash
git add studio/src/fx/eq-chain.ts
git commit -m "Estudio EQ M/S: helper makeEqChain (cadena de 8 bandas + dinámica reutilizable)"
```

---

### Task 3: Efecto con modo Estéreo/Mid-Side (`fx/effects/eq-graphic.ts`)

**Files:**
- Modify: `studio/src/fx/effects/eq-graphic.ts` (reescritura completa)

**Interfaces:**
- Consumes: `makeEqChain`, `EqChain` (Task 2); `EqApi`, `defaultBands`, `bandsFromParams`, `bandsToParams`,
  `presetNames` (`eq-core`); `registerEffect`, `Effect`, `EffectState` (`fx/effect`).
- Produce: el efecto `eq-graphic` con modo estéreo/M/S (matriz de codificación/decodificación) y `EqApi` completo.

Sin test unitario (Web Audio); verificado por typecheck + build.

- [ ] **Step 1: Reemplaza `fx/effects/eq-graphic.ts` por esta versión**

```ts
// studio/src/fx/effects/eq-graphic.ts
// EQ gráfico de 8 bandas con dinámica y modo Estéreo / Mid-Side. En estéreo una sola cadena; en M/S codifica
// Mid=(L+R)/2 y Side=(L−R)/2, ecualiza cada uno con su cadena, y decodifica L=Mid+Side, R=Mid−Side. El editor
// opera sobre el canal activo (Estéreo, o Mid/Lados). Puerta seco/húmedo para el bypass.
import { registerEffect, Effect, EffectState } from '../effect';
import { EqApi, defaultBands, bandsFromParams, bandsToParams, presetNames } from '../eq-core';
import { makeEqChain, EqChain } from '../eq-chain';

let _idc = 0;

function createEqEffect(actx: AudioContext, state?: EffectState): Effect {
  const input = actx.createGain(), output = actx.createGain();
  const wet = actx.createGain(), dry = actx.createGain();
  wet.connect(output); input.connect(dry); dry.connect(output);
  let bypassed = false;
  const setBypass = (on: boolean): void => { bypassed = on; wet.gain.value = on ? 0 : 1; dry.gain.value = on ? 1 : 0; };

  const ms0 = !!(state && state.params['_ms'] === 1);
  const chainA = makeEqChain(actx, state ? bandsFromParams(state.params, 'b') : defaultBands());
  const bandsB0 = state ? bandsFromParams(state.params, 's') : defaultBands();
  let chainB: EqChain | null = null;
  let mode: 'stereo' | 'ms' = 'stereo';
  let active = 0;

  // Matriz M/S (se crea al primer paso a M/S y se reutiliza).
  let splitter: ChannelSplitterNode | null = null, merger: ChannelMergerNode | null = null;
  let gLm: GainNode, gRm: GainNode, midBus: GainNode, gLs: GainNode, gRs: GainNode, sideBus: GainNode, gSideR: GainNode;
  function buildMatrix(): void {
    splitter = actx.createChannelSplitter(2); merger = actx.createChannelMerger(2);
    gLm = actx.createGain(); gLm.gain.value = 0.5; gRm = actx.createGain(); gRm.gain.value = 0.5; midBus = actx.createGain();
    gLs = actx.createGain(); gLs.gain.value = 0.5; gRs = actx.createGain(); gRs.gain.value = -0.5; sideBus = actx.createGain();
    gSideR = actx.createGain(); gSideR.gain.value = -1;
  }

  function rebuild(): void {
    // Desconecta todo lo reconfigurable (input.disconnect() quita también el seco → se re-conecta).
    try { input.disconnect(); } catch { /* ya */ }
    try { chainA.output.disconnect(); } catch { /* ya */ }
    if (chainB) { try { chainB.output.disconnect(); } catch { /* ya */ } }
    if (splitter) { try { splitter.disconnect(); } catch { /* ya */ } }
    for (const g of [gLm, gRm, midBus, gLs, gRs, sideBus, gSideR]) { if (g) { try { g.disconnect(); } catch { /* ya */ } } }
    if (merger) { try { merger.disconnect(); } catch { /* ya */ } }

    input.connect(dry);   // ruta seca del bypass
    if (mode === 'stereo') {
      input.connect(chainA.input); chainA.output.connect(wet);
    } else {
      if (!splitter) buildMatrix();
      if (!chainB) chainB = makeEqChain(actx, bandsB0);
      input.connect(splitter!);
      splitter!.connect(gLm, 0); splitter!.connect(gRm, 1); gLm.connect(midBus); gRm.connect(midBus); midBus.connect(chainA.input);   // Mid=(L+R)/2
      splitter!.connect(gLs, 0); splitter!.connect(gRs, 1); gLs.connect(sideBus); gRs.connect(sideBus); sideBus.connect(chainB.input); // Side=(L−R)/2
      chainA.output.connect(merger!, 0, 0); chainA.output.connect(merger!, 0, 1);   // Mid → L y R
      chainB.output.connect(merger!, 0, 0);                                          // Side → L (+)
      chainB.output.connect(gSideR); gSideR.connect(merger!, 0, 1);                  // Side → R (−)
      merger!.connect(wet);
    }
  }

  if (ms0) mode = 'ms';
  rebuild();
  setBypass(state ? !!state.bypassed : false);

  const activeChain = (): EqChain => (mode === 'ms' && active === 1 && chainB) ? chainB : chainA;

  const eq: EqApi = {
    getBands: () => activeChain().getBands(),
    setBand: (i, patch) => activeChain().setBand(i, patch),
    setDyn: (i, patch) => activeChain().setDyn(i, patch),
    reset: () => activeChain().reset(),
    applyPreset: (name) => activeChain().applyPreset(name),
    presetNames,
    get analyser() { return activeChain().analyser; },
    magResponse: (freqs) => activeChain().magResponse(freqs),
    mode: () => mode,
    setMode: (m) => { if (m !== mode) { mode = m; if (m === 'stereo') active = 0; rebuild(); } },
    channelLabels: () => mode === 'ms' ? ['Mid', 'Lados'] : ['Estéreo'],
    activeChannel: () => active,
    setActiveChannel: (i) => { active = i; }
  };

  const serializeParams = (): Record<string, number> => ({
    ...bandsToParams(chainA.snapshot(), 'b'),
    ...(chainB ? bandsToParams(chainB.snapshot(), 's') : {}),
    _ms: mode === 'ms' ? 1 : 0
  });

  return {
    id: 'eq-graphic-' + (++_idc), type: 'eq-graphic', input, output,
    setParam: () => { /* el EQ se edita por su editor gráfico */ },
    getParams: () => [],
    getValues: () => serializeParams(),
    isBypassed: () => bypassed,
    bypass: setBypass,
    serialize: () => ({ type: 'eq-graphic', params: serializeParams(), bypassed }),
    dispose: () => {
      chainA.dispose(); if (chainB) chainB.dispose();
      for (const n of [input, output, wet, dry, splitter, merger, gLm, gRm, midBus, gLs, gRs, sideBus, gSideR]) {
        if (n) { try { n.disconnect(); } catch { /* ya */ } }
      }
    },
    eq
  };
}

registerEffect('eq-graphic', { label: 'EQ gráfico', family: 'color', params: [], create: createEqEffect });
```

- [ ] **Step 2: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add studio/src/fx/effects/eq-graphic.ts
git commit -m "Estudio EQ M/S: efecto con modo Estéreo/Mid-Side (matriz de codificación + 2 cadenas)"
```

---

### Task 4: Selector de modo/canal en el editor (`ui/eqEditor.ts`)

**Files:**
- Modify: `studio/src/ui/eqEditor.ts`

**Interfaces:**
- Consumes: `EqApi` con `mode`/`setMode`/`channelLabels`/`activeChannel`/`setActiveChannel` (Tasks 1,3).
- Produce: barra superior con **Modo (Estéreo/Mid-Side)** y, en M/S, selector **Mid/Lados**; el resto opera
  sobre el canal activo.

DOM; sin test unitario. Verificado por typecheck + build.

- [ ] **Step 1: Añade la barra de modo/canal y su lógica (`ui/eqEditor.ts`)**

(a) En el `root.innerHTML`, en el `<div class="eqBar">`, tras el botón `#eqFlat`, añade el selector de modo y el
contenedor del canal (antes del `<span class="eqHint …">`):

```ts
      <button id="eqFlat" class="smpBtn">Plano</button>
      <select id="eqMode"><option value="stereo">Estéreo</option><option value="ms">Mid/Side</option></select>
      <span id="eqChan" class="eqChan"></span>
      <span class="eqHint muted">arrastra un punto (frec./ganancia) · rueda = Q · botones = seleccionar banda</span>
```

(b) Tras `bandButtons(); renderDyn();` (montaje inicial), añade una función que pinta el estado de modo/canal y
la llamada inicial:

```ts
  function renderModeChan(): void {
    (root.querySelector('#eqMode') as HTMLSelectElement).value = eq.mode();
    const chan = root.querySelector('#eqChan') as HTMLElement;
    const labels = eq.channelLabels();
    chan.innerHTML = eq.mode() === 'ms'
      ? labels.map((l, i) => `<button class="eqBtn${i === eq.activeChannel() ? ' sel' : ''}" data-ch="${i}">${l}</button>`).join('')
      : '';
    chan.querySelectorAll<HTMLButtonElement>('[data-ch]').forEach(btn =>
      btn.addEventListener('click', () => { eq.setActiveChannel(+(btn.dataset.ch ?? '0')); sel = 0; renderModeChan(); bandButtons(); renderDyn(); }));
  }
  (root.querySelector('#eqMode') as HTMLSelectElement).addEventListener('change', e => {
    eq.setMode((e.target as HTMLSelectElement).value as 'stereo' | 'ms'); onChange();
    sel = 0; renderModeChan(); bandButtons(); renderDyn();
  });
  renderModeChan();
```

(Coloca esas líneas justo después de `bandButtons();` y `renderDyn();` iniciales, donde `sel` ya está
declarado.)

- [ ] **Step 2: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Manual smoke test (prueba por vista/oído)**

Run: `cd studio && npm run dev` y abre la URL:
1. Añade **EQ gráfico** a un canal con música estéreo, abre el editor.
2. Cambia **Modo → Mid/Side**: aparecen los botones **Mid | Lados**.
3. En **Mid**, sube unos graves; en **Lados**, baja o realza agudos → cada canal se ecualiza **independiente** y
   se **oye** la diferencia (Mid = centro, Lados = anchura). La dinámica funciona en cada canal.
4. Vuelve a **Estéreo** → una sola cadena (comportamiento de antes).
5. Persiste al guardar/abrir (modo + ambas cadenas). Un proyecto de v0.26 abre en **Estéreo**.

- [ ] **Step 4: Commit**

```bash
git add studio/src/ui/eqEditor.ts
git commit -m "Estudio EQ M/S: selector de modo (Estéreo/Mid-Side) y de canal (Mid/Lados) en el editor"
```

---

### Task 5: Docs y versión

**Files:**
- Modify: `studio/package.json` (subir `version` a `0.27.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.27.0"`.

- [ ] **Step 2: Update HANDOFF.md**

Añade en la zona de estado del Estudio:

```markdown
**Estudio · EQ mid/side E2b (v0.27.0):** el EQ gráfico gana modo **Estéreo ↔ Mid/Side**. En M/S codifica
**Mid=(L+R)/2** y **Side=(L−R)/2** (ChannelSplitter + gains), ecualiza cada uno con su **propia cadena de 8
bandas** (EQ estática + dinámica completa) y decodifica **L=Mid+Side, R=Mid−Side** (gains + ChannelMerger). La
cadena de un canal se factorizó en `fx/eq-chain.ts` (`makeEqChain`); el efecto compone 1 (estéreo) o 2 (mid+
side) y **reconstruye** el enrutado al cambiar de modo. El editor gana un selector **Modo** + **Mid/Lados**; el
resto opera sobre el canal activo (`analyser` como getter). Persistencia: modo `_ms` + params `b*` (mid) y `s*`
(lados). Compat v0.26 → estéreo. Cierra el EQ pro (E1 gráfico + E2 dinámico + E2b mid/side).
```

- [ ] **Step 3: Update CLAUDE.md**

En la sección del Estudio (decisión 5), tras la mención del EQ dinámico E2, añade: **EQ mid/side E2b (v0.27.0):
modo Estéreo/Mid-Side; en M/S ecualiza Mid (centro) y Side (lados) por separado, cada uno con su cadena completa**
(`fx/eq-chain.ts` `makeEqChain` + matriz M/S en `fx/effects/eq-graphic.ts` + selector en `ui/eqEditor.ts`; sin
cambios de motor).

- [ ] **Step 4: Verify and commit**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio EQ M/S: docs (HANDOFF/CLAUDE) y versión 0.27.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- Prefijo en params + métodos de modo en EqApi → Task 1 ✅
- Helper `makeEqChain` (cadena reutilizable) → Task 2 ✅
- Efecto con modo estéreo/M/S + matriz codificación/decodificación + rebuild + persistencia (`_ms`, `b*`, `s*`)
  + compat v0.26 → Task 3 ✅
- Editor: selector Modo + canal Mid/Lados; opera sobre el canal activo → Task 4 ✅
- Docs/versión → Task 5 ✅

**Placeholders:** ninguno; el código va completo (helper, efecto y editor).

**Consistencia de tipos:** `bandsToParams(bands, prefix?)`/`bandsFromParams(params, prefix?)` (Task 1) se usan en
Task 3 con `'b'`/`'s'`. `EqApi` con `mode/setMode/channelLabels/activeChannel/setActiveChannel` (Task 1) los
implementa Task 3 (stubs en Task 1) y los consume Task 4. `makeEqChain(actx, EqBand[]) → EqChain{input,output,
analyser,getBands,setBand,setDyn,reset,applyPreset,magResponse,snapshot,dispose}` (Task 2) coincide con su uso en
Task 3. `analyser` como getter satisface `analyser: AnalyserNode`. La matriz M/S usa `connect(dest, out, in)` con
índices de canal correctos (splitter 0=L/1=R; merger input 0=L/1=R).

**Estado intermedio válido:** Task 1 (eq-core + stubs) compila; Task 2 (helper nuevo, sin usar) compila; Task 3
cablea el helper + M/S; Task 4 añade la UI. Cada tarea compila y pasa tests.

**Decisión consciente:** las cadenas Mid/Side procesan señales **mono** (Mid y Side son sumas mono del
splitter), así que los biquads y el detector operan en mono correctamente; el modo estéreo es idéntico a E1/E2
(una cadena). `chainB` se crea perezosamente al primer paso a M/S y persiste (no se pierde la EQ de lados al
volver a estéreo).
