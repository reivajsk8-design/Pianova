# EQ dinámico por banda (E2) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada banda del EQ gráfico pueda reaccionar al nivel de su frecuencia (umbral/rango/ataque/liberación) — dinámica por banda estilo Waves F6.

**Architecture:** Se extiende `EqBand` con una sub-estructura `dyn` + helpers puros `dynTarget`/`envCoef` (`fx/eq-core.ts`). El efecto (`fx/effects/eq-graphic.ts`) añade un detector por banda (paso-banda→analyser) y un bucle `setInterval` (~60 Hz) que modula la ganancia del biquad de la banda sumando el offset dinámico. El editor (`ui/eqEditor.ts`) gana un panel por banda seleccionada (Activa + Dinámico + knobs). Control-rate (no worklet); sin dependencias nuevas.

**Tech Stack:** Vite + TypeScript (strict) + Vitest. Web Audio (BiquadFilter bandpass + AnalyserNode + setInterval).

## Global Constraints

- Todo el trabajo en `studio/` (NO tocar `pianova.html`). TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón `var(--pv-acc)`.
- No cambiar el motor de audio base ni el enrutado; el dinámico solo **modula la ganancia** de cada banda.
- Compatibilidad hacia atrás: proyectos v0.25 (sin `dyn`) cargan con la dinámica **apagada** (mismo sonido).
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build` (desde `studio/`).

---

### Task 1: Dinámica en el núcleo (`fx/eq-core.ts`)

**Files:**
- Modify: `studio/src/fx/eq-core.ts`
- Modify: `studio/src/fx/eq-core.test.ts`

**Interfaces:**
- Produces: `EqDyn`; `EqBand` gana `dyn: EqDyn`; `defaultDyn()`; `EqApi` gana `setDyn(i, patch: Partial<EqDyn>)`;
  `bandsToParams`/`bandsFromParams` incluyen la dinámica; `dynTarget(levelDb, threshold, range, knee?)`,
  `envCoef(tauMs, dtMs)`.

- [ ] **Step 1: Write the failing test (añadir a `fx/eq-core.test.ts`)**

Añade al final del archivo:

```ts
import { defaultDyn, dynTarget, envCoef } from './eq-core';

describe('eq-core dinámica', () => {
  it('defaultBands: cada banda trae dinámica apagada por defecto', () => {
    const b = defaultBands();
    expect(b[0].dyn).toEqual(defaultDyn());
    expect(b.every(x => x.dyn.on === false)).toBe(true);
  });
  it('bandsToParams/bandsFromParams: ida y vuelta con dinámica', () => {
    const b = defaultBands();
    b[1] = { ...b[1], dyn: { on: true, threshold: -30, range: -9, attack: 5, release: 200 } };
    expect(bandsFromParams(bandsToParams(b))).toEqual(b);
  });
  it('bandsFromParams: sin params de dinámica → dinámica por defecto (compat v0.25)', () => {
    const b = bandsFromParams({ b0_freq: 100, b0_gain: 3 });   // proyecto viejo sin dyn
    expect(b[0].dyn).toEqual(defaultDyn());
  });
  it('dynTarget: 0 bajo umbral, proporcional hasta range en el knee', () => {
    expect(dynTarget(-30, -24, -6, 18)).toBe(0);          // por debajo del umbral
    expect(dynTarget(-24 + 18, -24, -6, 18)).toBeCloseTo(-6, 6);   // a un knee por encima → range completo
    expect(dynTarget(-24 + 9, -24, -6, 18)).toBeCloseTo(-3, 6);    // a medio knee → medio range
    expect(dynTarget(-24 + 36, -24, -6, 18)).toBeCloseTo(-6, 6);   // se satura en range
  });
  it('envCoef: entre 0 y 1, más lento (menor) con tau mayor', () => {
    const fast = envCoef(20, 16), slow = envCoef(200, 16);
    expect(fast).toBeGreaterThan(0); expect(fast).toBeLessThan(1);
    expect(slow).toBeLessThan(fast);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd studio && npm test -- eq-core`
Expected: FAIL (no existen `defaultDyn`/`dynTarget`/`envCoef` y `EqBand` no tiene `dyn`).

- [ ] **Step 3: Edita `fx/eq-core.ts`**

(a) Añade el tipo `EqDyn` y `dyn` a `EqBand`; sustituye:

```ts
export type EqBandType = 'lowshelf' | 'peaking' | 'highshelf';
export interface EqBand { type: EqBandType; freq: number; gain: number; q: number; on: boolean }
```

por:

```ts
export type EqBandType = 'lowshelf' | 'peaking' | 'highshelf';
export interface EqDyn { on: boolean; threshold: number; range: number; attack: number; release: number }
export interface EqBand { type: EqBandType; freq: number; gain: number; q: number; on: boolean; dyn: EqDyn }
```

(b) En la interfaz `EqApi`, añade `setDyn` (tras `setBand`):

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
}
```

(c) Añade `defaultDyn()` e incorpóralo a `defaultBands()`; sustituye la función `defaultBands` por:

```ts
export function defaultDyn(): EqDyn { return { on: false, threshold: -24, range: -6, attack: 20, release: 150 }; }
export function defaultBands(): EqBand[] {
  return BAND_TYPES.map((t, i) => ({ type: t, freq: DEFAULT_FREQS[i], gain: 0, q: 1, on: true, dyn: defaultDyn() }));
}
```

(d) Extiende `bandsToParams` y `bandsFromParams` con la dinámica; sustituye ambas por:

```ts
export function bandsToParams(bands: EqBand[]): Record<string, number> {
  const p: Record<string, number> = {};
  bands.forEach((b, i) => {
    p[`b${i}_freq`] = b.freq; p[`b${i}_gain`] = b.gain; p[`b${i}_q`] = b.q; p[`b${i}_on`] = b.on ? 1 : 0;
    p[`b${i}_dyn_on`] = b.dyn.on ? 1 : 0; p[`b${i}_thr`] = b.dyn.threshold; p[`b${i}_range`] = b.dyn.range;
    p[`b${i}_atk`] = b.dyn.attack; p[`b${i}_rel`] = b.dyn.release;
  });
  return p;
}
export function bandsFromParams(params: Record<string, number>): EqBand[] {
  return defaultBands().map((b, i) => ({
    type: b.type,
    freq: params[`b${i}_freq`] ?? b.freq,
    gain: params[`b${i}_gain`] ?? b.gain,
    q: params[`b${i}_q`] ?? b.q,
    on: params[`b${i}_on`] !== undefined ? params[`b${i}_on`] === 1 : b.on,
    dyn: {
      on: params[`b${i}_dyn_on`] !== undefined ? params[`b${i}_dyn_on`] === 1 : b.dyn.on,
      threshold: params[`b${i}_thr`] ?? b.dyn.threshold,
      range: params[`b${i}_range`] ?? b.dyn.range,
      attack: params[`b${i}_atk`] ?? b.dyn.attack,
      release: params[`b${i}_rel`] ?? b.dyn.release
    }
  }));
}
```

(e) Añade los helpers puros de dinámica (p. ej. tras `bandAt`):

```ts
// Desplazamiento de ganancia objetivo (dB) de una banda dinámica: 0 si el nivel no supera el umbral,
// si no proporcional (0..1 a lo largo de `knee` dB) hasta `range` (negativo = corta, positivo = sube).
export function dynTarget(levelDb: number, threshold: number, range: number, knee = 18): number {
  const over = levelDb - threshold;
  if (over <= 0) return 0;
  return range * Math.min(1, over / knee);
}
// Coeficiente de envolvente por tick (0..1): 1 - e^(-dt/tau). Menor tau ⇒ mayor coef (más rápido).
export function envCoef(tauMs: number, dtMs: number): number {
  return 1 - Math.exp(-dtMs / Math.max(1, tauMs));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd studio && npm test -- eq-core`
Expected: PASS (los nuevos + los de E1, que siguen cuadrando porque `bandsToParams`/`From` incluyen `dyn` en ambos lados).

- [ ] **Step 5: Full check + commit**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS.

```bash
git add studio/src/fx/eq-core.ts studio/src/fx/eq-core.test.ts
git commit -m "Estudio EQ dinámico: dinámica en el núcleo (EqDyn + dynTarget/envCoef + params) + tests"
```

---

### Task 2: Dinámica en el efecto (`fx/effects/eq-graphic.ts`)

**Files:**
- Modify: `studio/src/fx/effects/eq-graphic.ts`

**Interfaces:**
- Consumes: `defaultBands`, `bandsFromParams`, `bandsToParams`, `presetBands`, `presetNames`, `BAND_TYPES`,
  `dynTarget`, `envCoef`, `EqApi`, `EqBand` (Task 1); `ramp` (`fx/param.ts`).
- Produce: el efecto `eq-graphic` con dinámica por banda (detectores + bucle) y `eq.setDyn`.

Sin test unitario (Web Audio); la parte pura ya está en Task 1. Verificado por typecheck + build.

- [ ] **Step 1: Reemplaza `fx/effects/eq-graphic.ts` por esta versión (añade detectores + bucle + setDyn)**

```ts
// studio/src/fx/effects/eq-graphic.ts
// EQ gráfico de 8 bandas con dinámica por banda. Cada banda: biquad (EQ estática) + un detector (paso-banda →
// analyser) que mide el nivel de su zona; un bucle ~60 Hz suma un offset dinámico (umbral/rango/ataque/
// liberación) a la ganancia del biquad. Puerta seco/húmedo para el bypass. Persistencia por params aplanados.
import { registerEffect, Effect, EffectState } from '../effect';
import { ramp } from '../param';
import {
  EqApi, EqBand, BAND_TYPES, defaultBands, bandsFromParams, bandsToParams, presetBands, presetNames,
  dynTarget, envCoef
} from '../eq-core';

let _idc = 0;
const DET_Q = 2.5, TICK_MS = 16, KNEE = 18;

function createEqEffect(actx: AudioContext, state?: EffectState): Effect {
  const input = actx.createGain(), output = actx.createGain();
  const wet = actx.createGain(), dry = actx.createGain();
  wet.connect(output); input.connect(dry); dry.connect(output);

  const nodes = BAND_TYPES.map(t => { const b = actx.createBiquadFilter(); b.type = t; return b; });
  input.connect(nodes[0]);
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  nodes[nodes.length - 1].connect(wet);

  const analyser = actx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.8;
  input.connect(analyser);   // toma para el espectro; no altera la señal

  // Detectores por banda (paso-banda → analyser) para medir el nivel de cada zona.
  const detBp = BAND_TYPES.map(() => { const b = actx.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = DET_Q; return b; });
  const detAn = BAND_TYPES.map(() => { const a = actx.createAnalyser(); a.fftSize = 256; return a; });
  detBp.forEach((bp, i) => { input.connect(bp); bp.connect(detAn[i]); });
  const env = new Float32Array(BAND_TYPES.length);   // offset dinámico actual por banda (dB)
  const detBuf = new Float32Array(detAn[0].fftSize);
  let timer: ReturnType<typeof setInterval> | null = null;

  let bands: EqBand[] = state ? bandsFromParams(state.params) : defaultBands();
  let bypassed = false;
  const setBypass = (on: boolean): void => { bypassed = on; wet.gain.value = on ? 0 : 1; dry.gain.value = on ? 1 : 0; };

  function applyBand(i: number): void {
    const b = bands[i], n = nodes[i];
    ramp(n.frequency, b.freq, actx);
    ramp(n.Q, b.q, actx);
    detBp[i].frequency.value = b.freq;                 // el detector sigue a la frecuencia de la banda
    if (!b.on) { env[i] = 0; ramp(n.gain, 0, actx); }              // banda apagada → transparente
    else if (!b.dyn.on) { env[i] = 0; ramp(n.gain, b.gain, actx); } // estática
    else ramp(n.gain, b.gain + env[i], actx);                      // dinámica: el bucle actualizará env
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
  setBypass(state ? !!state.bypassed : false);

  const eq: EqApi = {
    getBands: () => bands.map(b => ({ ...b, dyn: { ...b.dyn } })),
    setBand: (i, patch) => { bands[i] = { ...bands[i], ...patch }; applyBand(i); updateLoop(); },
    setDyn: (i, patch) => { bands[i] = { ...bands[i], dyn: { ...bands[i].dyn, ...patch } }; applyBand(i); updateLoop(); },
    reset: () => { bands = defaultBands(); bands.forEach((_, i) => applyBand(i)); updateLoop(); },
    applyPreset: (name) => { bands = presetBands(name); bands.forEach((_, i) => applyBand(i)); updateLoop(); },
    presetNames,
    analyser,
    magResponse: (freqs) => {
      const N = freqs.length, mag = new Float32Array(N), ph = new Float32Array(N);
      const tot = new Float32Array(N).fill(1);
      for (const n of nodes) { n.getFrequencyResponse(freqs as Float32Array<ArrayBuffer>, mag, ph); for (let i = 0; i < N; i++) tot[i] *= mag[i]; }
      return tot;
    }
  };

  return {
    id: 'eq-graphic-' + (++_idc), type: 'eq-graphic', input, output,
    setParam: () => { /* el EQ se edita por su editor gráfico, no por knobs */ },
    getParams: () => [],
    getValues: () => bandsToParams(bands),
    isBypassed: () => bypassed,
    bypass: setBypass,
    serialize: () => ({ type: 'eq-graphic', params: bandsToParams(bands), bypassed }),
    dispose: () => {
      if (timer) { clearInterval(timer); timer = null; }
      for (const n of [input, output, wet, dry, analyser, ...nodes, ...detBp, ...detAn]) { try { n.disconnect(); } catch { /* ya */ } }
    },
    eq
  };
}

registerEffect('eq-graphic', { label: 'EQ gráfico', family: 'color', params: [], create: createEqEffect });
```

- [ ] **Step 2: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS. (Si `getFloatTimeDomainData` no acepta el `as Float32Array<ArrayBuffer>`, prueba sin el cast; el patrón se usa en otros efectos del repo.)

- [ ] **Step 3: Commit**

```bash
git add studio/src/fx/effects/eq-graphic.ts
git commit -m "Estudio EQ dinámico: detectores por banda + bucle de control (modula la ganancia) + setDyn"
```

---

### Task 3: Panel de dinámica en el editor (`ui/eqEditor.ts` + CSS)

**Files:**
- Modify: `studio/src/ui/eqEditor.ts`
- Modify: `studio/src/ui/styles.css`

**Interfaces:**
- Consumes: `EqApi.setDyn`/`setBand` (Tasks 1–2); `mountKnob` (`ui/knob.ts`).
- Produce: los botones 1–8 **seleccionan** la banda; un panel de la banda seleccionada con **Activa** +
  **Dinámico** + knobs **Umbral/Rango/Ataque/Liberación**.

DOM/canvas; sin test unitario. Verificado por typecheck + build.

- [ ] **Step 1: Reemplaza `ui/eqEditor.ts` por esta versión (botones = seleccionar + panel dinámico)**

```ts
// studio/src/ui/eqEditor.ts
// Editor gráfico del EQ: canvas con espectro en tiempo real, curva de respuesta y 8 nodos arrastrables
// (arrastrar = frecuencia+ganancia · rueda = Q · botones 1–8 = seleccionar banda). Panel de la banda
// seleccionada: Activa + Dinámico + Umbral/Rango/Ataque/Liberación. Bucle rAF para el espectro y la curva.
import {
  EqApi, EQ_FMIN, EQ_FMAX, EQ_GAIN_RANGE, Q_MIN, Q_MAX, freqToX, xToFreq, gainToY, yToGain, bandAt
} from '../fx/eq-core';
import { mountKnob } from './knob';

export interface EqEditorHandle { close(): void }

export function mountEqEditor(root: HTMLElement, eq: EqApi, onChange: () => void): EqEditorHandle {
  const presetOpts = eq.presetNames().map(n => `<option value="${n}">${n}</option>`).join('');
  root.innerHTML = `<div class="eqEd">
    <div class="eqBar">
      <select id="eqPreset"><option value="">Presets…</option>${presetOpts}</select>
      <button id="eqFlat" class="smpBtn">Plano</button>
      <span class="eqHint muted">arrastra un punto (frec./ganancia) · rueda = Q · botones = seleccionar banda</span>
      <span id="eqBands" class="eqBands"></span>
    </div>
    <canvas id="eqCanvas" class="eqCanvas" width="760" height="300"></canvas>
    <div id="eqDyn" class="eqDyn"></div>
  </div>`;

  const canvas = root.querySelector('#eqCanvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  let sel = 0, drag = -1;

  function bandButtons(): void {
    const wrap = root.querySelector('#eqBands') as HTMLElement;
    wrap.innerHTML = eq.getBands().map((b, i) =>
      `<button class="eqBtn${b.on ? ' on' : ''}${i === sel ? ' sel' : ''}" data-b="${i}">${i + 1}</button>`).join('');
    wrap.querySelectorAll<HTMLButtonElement>('.eqBtn').forEach(btn =>
      btn.addEventListener('click', () => { sel = +(btn.dataset.b ?? '0'); bandButtons(); renderDyn(); }));
  }

  function renderDyn(): void {
    const host = root.querySelector('#eqDyn') as HTMLElement;
    const b = eq.getBands()[sel]; if (!b) { host.innerHTML = ''; return; }
    host.innerHTML = `<div class="eqDynHead">BANDA ${sel + 1}
        <label class="eqChk"><input type="checkbox" id="eqActive" ${b.on ? 'checked' : ''}> Activa</label>
        <label class="eqChk"><input type="checkbox" id="eqDynOn" ${b.dyn.on ? 'checked' : ''}> Dinámico</label></div>
      <div class="eqKnobs">
        <div class="knobCell"><div class="knob" id="kThr"></div><span>Umbral</span></div>
        <div class="knobCell"><div class="knob" id="kRange"></div><span>Rango</span></div>
        <div class="knobCell"><div class="knob" id="kAtk"></div><span>Ataque</span></div>
        <div class="knobCell"><div class="knob" id="kRel"></div><span>Liberación</span></div>
      </div>`;
    (host.querySelector('#eqActive') as HTMLInputElement).addEventListener('change', e => {
      eq.setBand(sel, { on: (e.target as HTMLInputElement).checked }); onChange(); bandButtons();
    });
    (host.querySelector('#eqDynOn') as HTMLInputElement).addEventListener('change', e => {
      eq.setDyn(sel, { on: (e.target as HTMLInputElement).checked }); onChange();
    });
    mountKnob(host.querySelector('#kThr') as HTMLElement, { min: -60, max: 0, value: b.dyn.threshold, default: -24, size: 32, onChange: v => { eq.setDyn(sel, { threshold: v }); onChange(); } });
    mountKnob(host.querySelector('#kRange') as HTMLElement, { min: -18, max: 18, value: b.dyn.range, default: -6, size: 32, onChange: v => { eq.setDyn(sel, { range: v }); onChange(); } });
    mountKnob(host.querySelector('#kAtk') as HTMLElement, { min: 1, max: 200, value: b.dyn.attack, default: 20, size: 32, onChange: v => { eq.setDyn(sel, { attack: v }); onChange(); } });
    mountKnob(host.querySelector('#kRel') as HTMLElement, { min: 20, max: 800, value: b.dyn.release, default: 150, size: 32, onChange: v => { eq.setDyn(sel, { release: v }); onChange(); } });
  }

  bandButtons();
  renderDyn();

  const freqs = new Float32Array(256);
  for (let i = 0; i < 256; i++) freqs[i] = xToFreq(i / 255 * W, W);

  function draw(): void {
    ctx.fillStyle = '#0c110b'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.fillStyle = '#7b818e'; ctx.font = '10px ui-monospace,monospace';
    [100, 1000, 10000].forEach(f => { const x = freqToX(f, W); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.fillText(f >= 1000 ? (f / 1000) + 'k' : '' + f, x + 3, H - 4); });
    [-12, -6, 0, 6, 12].forEach(g => { const y = gainToY(g, H); ctx.strokeStyle = g === 0 ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.fillStyle = '#7b818e'; ctx.fillText((g > 0 ? '+' : '') + g, 3, y - 2); });
    const bins = eq.analyser.frequencyBinCount, data = new Uint8Array(bins); eq.analyser.getByteFrequencyData(data);
    const nyq = eq.analyser.context.sampleRate / 2;
    ctx.fillStyle = 'rgba(150,160,180,.16)'; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 2) { const f = xToFreq(x, W); const bin = Math.min(bins - 1, Math.max(0, Math.round(f / nyq * bins))); ctx.lineTo(x, H - (data[bin] / 255) * H); }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    const tot = eq.magResponse(freqs);
    ctx.strokeStyle = '#2dff6a'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 256; i++) { const db = 20 * Math.log10(tot[i] || 1e-6); const x = i / 255 * W, y = gainToY(db, H); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.lineWidth = 1;
    eq.getBands().forEach((b, i) => {
      if (!b.on) return;
      const x = freqToX(b.freq, W), y = gainToY(Math.max(-EQ_GAIN_RANGE, Math.min(EQ_GAIN_RANGE, b.gain)), H);
      ctx.fillStyle = i === sel ? '#fff' : (b.dyn.on ? '#f2a33c' : '#2dff6a'); ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#04140a'; ctx.font = 'bold 10px ui-monospace,monospace'; ctx.fillText('' + (i + 1), x - 3, y + 3);
    });
  }

  const rel = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  };
  canvas.addEventListener('pointerdown', e => {
    const { x, y } = rel(e); const i = bandAt(eq.getBands(), x, y, W, H);
    if (i >= 0) { sel = i; drag = i; canvas.setPointerCapture(e.pointerId); bandButtons(); renderDyn(); }
  });
  canvas.addEventListener('pointermove', e => {
    if (drag < 0) return;
    const { x, y } = rel(e);
    eq.setBand(drag, {
      freq: Math.max(EQ_FMIN, Math.min(EQ_FMAX, xToFreq(Math.max(0, Math.min(W, x)), W))),
      gain: Math.max(-EQ_GAIN_RANGE, Math.min(EQ_GAIN_RANGE, yToGain(Math.max(0, Math.min(H, y)), H)))
    });
    onChange();
  });
  const endDrag = (): void => { drag = -1; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', e => {
    const { x, y } = rel(e); const i = bandAt(eq.getBands(), x, y, W, H);
    if (i < 0) return; e.preventDefault();
    const q = eq.getBands()[i].q;
    eq.setBand(i, { q: Math.max(Q_MIN, Math.min(Q_MAX, q * (e.deltaY > 0 ? 0.9 : 1.1))) });
    sel = i; onChange(); bandButtons();
  }, { passive: false });

  (root.querySelector('#eqPreset') as HTMLSelectElement).addEventListener('change', ev => {
    const s = ev.target as HTMLSelectElement; if (s.value) { eq.applyPreset(s.value); onChange(); bandButtons(); renderDyn(); } s.value = '';
  });
  (root.querySelector('#eqFlat') as HTMLButtonElement).addEventListener('click', () => { eq.reset(); onChange(); bandButtons(); renderDyn(); });

  let raf = 0;
  const loop = (): void => { draw(); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  return { close: () => cancelAnimationFrame(raf) };
}
```

- [ ] **Step 2: CSS (`ui/styles.css`)**

Añade al final de `studio/src/ui/styles.css`:

```css
/* Panel de dinámica de la banda seleccionada (EQ) */
.eqDyn{background:#10130f;border:1px solid #23291f;border-radius:8px;padding:8px 10px;margin-top:8px}
.eqDynHead{display:flex;align-items:center;gap:14px;font-size:11px;letter-spacing:.1em;color:var(--pv-acc);margin-bottom:8px}
.eqChk{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--pv-ink);letter-spacing:0}
.eqKnobs{display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap}
.eqKnobs .knobCell{display:flex;flex-direction:column;align-items:center;gap:5px;font-size:10px;color:#c9d2c9}
.eqBtn.sel{border-color:#fff;color:#fff}
```

- [ ] **Step 3: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Manual smoke test (prueba por vista/oído)**

Run: `cd studio && npm run dev` y abre la URL:
1. En un canal con música, añade **EQ gráfico** y abre el editor.
2. Pulsa un botón **1–8** o un nodo → se **selecciona** (blanco) y aparece su panel con **Activa** + **Dinámico**.
3. Marca **Dinámico** en una banda de graves/agudos, baja el **Umbral** → esa zona se **comprime** cuando sube
   de nivel (la **curva se mueve** en vivo y se **oye**). Ajusta **Rango/Ataque/Liberación**.
4. Poner **Rango** positivo hace que esa banda **suba** cuando pasa el umbral (expansión).
5. Los nodos de bandas con dinámica se ven en **ámbar**; sin dinámica en verde.
6. Persiste al guardar/abrir; un proyecto de v0.25 abre con la dinámica **apagada** (igual que antes).

- [ ] **Step 5: Commit**

```bash
git add studio/src/ui/eqEditor.ts studio/src/ui/styles.css
git commit -m "Estudio EQ dinámico: panel por banda (Activa/Dinámico + umbral/rango/ataque/liberación) en el editor"
```

---

### Task 4: Docs y versión

**Files:**
- Modify: `studio/package.json` (subir `version` a `0.26.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.26.0"`.

- [ ] **Step 2: Update HANDOFF.md**

Añade en la zona de estado del Estudio:

```markdown
**Estudio · EQ dinámico por banda E2 (v0.26.0):** el EQ gráfico gana **dinámica por banda** (estilo F6): cada
banda tiene un **detector** (paso-banda→analyser) y un bucle de control (~60 Hz) que suma un **offset de
ganancia** según **umbral/rango/ataque/liberación** (`EqDyn` en `fx/eq-core.ts`; `dynTarget`/`envCoef`
testeados). En el editor, los botones 1–8 **seleccionan** la banda y aparece su panel (**Activa** + **Dinámico**
+ 4 knobs); la curva "respira" en vivo y los nodos con dinámica se ven en ámbar. Control-rate (sin worklet ni
deps); proyectos v0.25 cargan con la dinámica apagada. Pendiente **E2b: mid/side**.
```

- [ ] **Step 3: Update CLAUDE.md**

En la sección del Estudio (decisión 5), tras la mención del EQ gráfico E1, añade: **EQ dinámico por banda E2
(v0.26.0): cada banda puede comprimir/expandir su frecuencia (umbral/rango/ataque/liberación) con un detector +
bucle de control** (`fx/eq-core.ts` `EqDyn`/`dynTarget`/`envCoef` + `fx/effects/eq-graphic.ts` + panel en
`ui/eqEditor.ts`; control-rate, sin worklet). Pendiente E2b: mid/side.

- [ ] **Step 4: Verify and commit**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio EQ dinámico: docs (HANDOFF/CLAUDE) y versión 0.26.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- `EqDyn` + `dyn` en `EqBand` + `defaultDyn` + params + `dynTarget`/`envCoef` + `EqApi.setDyn` → Task 1 ✅
- Detectores por banda + bucle de control + modulación de ganancia + start/stop + dispose → Task 2 ✅
- Botones = seleccionar + panel (Activa/Dinámico + 4 knobs) + nodo ámbar con dinámica → Task 3 ✅
- Compat v0.25 (dyn por defecto) → Task 1 (bandsFromParams) ✅
- Docs/versión → Task 4 ✅

**Placeholders:** ninguno; el código va completo (efecto y editor como ficheros enteros).

**Consistencia de tipos:** `EqDyn`/`defaultDyn`/`dynTarget`/`envCoef` (Task 1) coinciden con su uso en Task 2;
`EqApi.setDyn(i, Partial<EqDyn>)` (Task 1) lo implementa Task 2 y lo consume Task 3. `mountKnob(root, {min,max,
value,default?,size?,onChange})` es la firma real. `getBands()` devuelve copias con `dyn` copiado.

**Estado intermedio válido:** Task 1 (puro) rompería el typecheck del efecto/editor actuales sólo si accedieran
a `dyn` — no lo hacen aún, y `EqBand.dyn` es requerido pero el efecto crea bandas vía `defaultBands`/`bandsFromParams` (ya incluyen `dyn`), así que **Task 1 compila** con el efecto E1 intacto (getBands sigue devolviendo bandas con dyn, que el editor E1 ignora). Task 2 usa la dinámica; Task 3 la edita. Cada tarea compila y pasa tests.

**Decisión consciente:** control-rate (~60 Hz) en vez de AudioWorklet — dinámica musical, simple y sin deps; el
detector no altera la señal (solo mide); una banda sin dinámica se comporta exactamente como en E1.
