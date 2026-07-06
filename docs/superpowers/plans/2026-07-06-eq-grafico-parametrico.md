# EQ gráfico paramétrico (E1) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un EQ gráfico paramétrico de 8 bandas como efecto de inserción (canal + máster) con un editor gráfico (curva interactiva, espectro en tiempo real, bandas arrastrables).

**Architecture:** Helper puro `fx/eq-core.ts` (tipos, bandas, presets, conversión a params, matemática del canvas) + efecto `fx/effects/eq-graphic.ts` (cadena de 8 biquads que expone una `eq?: EqApi` en el `Effect`) + editor `ui/eqEditor.ts` (canvas) + gancho en `ui/rack.ts` (botón ✎ para efectos con `eq`) + overlay en `app/studioView.ts`. Sin tocar el motor de audio base.

**Tech Stack:** Vite + TypeScript (strict) + Vitest. Web Audio (BiquadFilter + AnalyserNode). Canvas 2D.

## Global Constraints

- Todo el trabajo en `studio/` (NO tocar `pianova.html`). TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón `#2dff6a` / `var(--pv-acc)`.
- No cambiar el motor de audio base ni el enrutado: solo se **añade** el efecto, su editor y el gancho del rack.
- 8 bandas: índice 0 = `lowshelf`, 1–6 = `peaking`, 7 = `highshelf`. Por defecto ganancia 0 (transparente).
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build` (desde `studio/`).

---

### Task 1: Núcleo del EQ (puro) (`fx/eq-core.ts`)

**Files:**
- Create: `studio/src/fx/eq-core.ts`
- Create: `studio/src/fx/eq-core.test.ts`

**Interfaces:**
- Produces: `EqBandType`, `EqBand`, `EqApi`; constantes `EQ_FMIN/EQ_FMAX/EQ_GAIN_RANGE/Q_MIN/Q_MAX`, `BAND_TYPES`,
  `DEFAULT_FREQS`, `EQ_PRESETS`; funciones `defaultBands()`, `presetBands(name)`, `presetNames()`,
  `bandsToParams(bands)`, `bandsFromParams(params)`, `freqToX/xToFreq/gainToY/yToGain`, `bandAt(bands,px,py,w,h)`.

- [ ] **Step 1: Write the failing test (`fx/eq-core.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import {
  defaultBands, bandsToParams, bandsFromParams, presetBands, presetNames,
  freqToX, xToFreq, gainToY, yToGain, EQ_GAIN_RANGE
} from './eq-core';

describe('eq-core', () => {
  it('defaultBands: 8 bandas, shelf en los extremos, ganancia 0', () => {
    const b = defaultBands();
    expect(b.length).toBe(8);
    expect(b[0].type).toBe('lowshelf');
    expect(b[7].type).toBe('highshelf');
    expect(b[3].type).toBe('peaking');
    expect(b.every(x => x.gain === 0 && x.on)).toBe(true);
  });
  it('bandsToParams/bandsFromParams: ida y vuelta', () => {
    const b = defaultBands();
    b[2] = { ...b[2], gain: 6, freq: 500, q: 2, on: false };
    const round = bandsFromParams(bandsToParams(b));
    expect(round).toEqual(b);
  });
  it('presetNames incluye Plano; presetBands da 8 bandas', () => {
    expect(presetNames()).toContain('Plano');
    expect(presetBands('Cuerpo').length).toBe(8);
    expect(presetBands('desconocido').every(x => x.gain === 0)).toBe(true);   // fallback Plano
  });
  it('freqToX/xToFreq son inversas', () => {
    expect(xToFreq(freqToX(1000, 800), 800)).toBeCloseTo(1000, 3);
  });
  it('gainToY/yToGain son inversas y 0 dB va al centro', () => {
    expect(gainToY(0, 300)).toBeCloseTo(150, 6);
    expect(yToGain(gainToY(6, 300), 300)).toBeCloseTo(6, 6);
    expect(yToGain(gainToY(-EQ_GAIN_RANGE, 300), 300)).toBeCloseTo(-EQ_GAIN_RANGE, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd studio && npm test -- eq-core`
Expected: FAIL (no existe `./eq-core`).

- [ ] **Step 3: Create `fx/eq-core.ts`**

```ts
// studio/src/fx/eq-core.ts
// Núcleo puro del EQ gráfico: tipos, bandas por defecto, presets, conversión bandas↔params (persistencia)
// y matemática del canvas (frecuencia log / ganancia dB). Sin DOM ni Web Audio → testeable.

export type EqBandType = 'lowshelf' | 'peaking' | 'highshelf';
export interface EqBand { type: EqBandType; freq: number; gain: number; q: number; on: boolean }

// API que el efecto EQ expone para su editor a medida.
export interface EqApi {
  getBands(): EqBand[];
  setBand(i: number, patch: Partial<EqBand>): void;
  reset(): void;
  applyPreset(name: string): void;
  presetNames(): string[];
  analyser: AnalyserNode;
  magResponse(freqs: Float32Array): Float32Array;   // magnitud combinada de las bandas
}

export const EQ_FMIN = 20, EQ_FMAX = 20000, EQ_GAIN_RANGE = 18, Q_MIN = 0.3, Q_MAX = 8;
export const BAND_TYPES: EqBandType[] =
  ['lowshelf', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'highshelf'];
export const DEFAULT_FREQS = [80, 150, 350, 800, 1800, 4000, 8000, 12000];

// Presets = ganancia (dB) de cada una de las 8 bandas (freq/Q/on quedan por defecto).
export const EQ_PRESETS: Record<string, number[]> = {
  'Plano':     [0, 0, 0, 0, 0, 0, 0, 0],
  'Cuerpo':    [3, 2, 0, -1, 0, 0, 0, 1],
  'Cálido':    [2, 1, 0, 0, -1, -2, 0, 0],
  'Brillante': [-1, 0, 0, 0, 1, 2, 3, 4],
  'Presencia': [0, 0, -1, 0, 2, 3, 1, 0],
  'Loudness':  [4, 2, 0, -1, 0, 1, 3, 4]
};

export function defaultBands(): EqBand[] {
  return BAND_TYPES.map((t, i) => ({ type: t, freq: DEFAULT_FREQS[i], gain: 0, q: 1, on: true }));
}
export function presetNames(): string[] { return Object.keys(EQ_PRESETS); }
export function presetBands(name: string): EqBand[] {
  const g = EQ_PRESETS[name] ?? EQ_PRESETS['Plano'];
  return defaultBands().map((b, i) => ({ ...b, gain: g[i] ?? 0 }));
}

export function bandsToParams(bands: EqBand[]): Record<string, number> {
  const p: Record<string, number> = {};
  bands.forEach((b, i) => { p[`b${i}_freq`] = b.freq; p[`b${i}_gain`] = b.gain; p[`b${i}_q`] = b.q; p[`b${i}_on`] = b.on ? 1 : 0; });
  return p;
}
export function bandsFromParams(params: Record<string, number>): EqBand[] {
  return defaultBands().map((b, i) => ({
    type: b.type,
    freq: params[`b${i}_freq`] ?? b.freq,
    gain: params[`b${i}_gain`] ?? b.gain,
    q: params[`b${i}_q`] ?? b.q,
    on: params[`b${i}_on`] !== undefined ? params[`b${i}_on`] === 1 : b.on
  }));
}

// Matemática del canvas (portada de pianova.html).
export function freqToX(f: number, w: number): number { return Math.log(f / EQ_FMIN) / Math.log(EQ_FMAX / EQ_FMIN) * w; }
export function xToFreq(x: number, w: number): number { return EQ_FMIN * Math.pow(EQ_FMAX / EQ_FMIN, x / w); }
export function gainToY(g: number, h: number): number { return h / 2 * (1 - g / EQ_GAIN_RANGE); }
export function yToGain(y: number, h: number): number { return (1 - y / (h / 2)) * EQ_GAIN_RANGE; }

// Índice de la banda ACTIVA cuyo nodo está más cerca de (px,py), dentro de ~16px; o -1.
export function bandAt(bands: EqBand[], px: number, py: number, w: number, h: number): number {
  let best = -1, bd = 16 * 16;
  bands.forEach((b, i) => {
    if (!b.on) return;
    const x = freqToX(b.freq, w), y = gainToY(b.gain, h);
    const d = (x - px) * (x - px) + (y - py) * (y - py);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd studio && npm test -- eq-core`
Expected: PASS.

- [ ] **Step 5: Full check + commit**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS.

```bash
git add studio/src/fx/eq-core.ts studio/src/fx/eq-core.test.ts
git commit -m "Estudio EQ: núcleo puro (tipos, bandas, presets, params, matemática del canvas) + tests"
```

---

### Task 2: Efecto EQ de 8 bandas (`fx/effects/eq-graphic.ts` + `fx/effect.ts` + índice)

**Files:**
- Create: `studio/src/fx/effects/eq-graphic.ts`
- Modify: `studio/src/fx/effect.ts` (añadir `eq?: EqApi` a la interfaz `Effect`)
- Modify: `studio/src/fx/effects/index.ts` (importar el nuevo efecto para que se registre)

**Interfaces:**
- Consumes: `EqApi`, `EqBand`, `BAND_TYPES`, `defaultBands`, `bandsFromParams`, `bandsToParams`, `presetBands`,
  `presetNames` (Task 1); `registerEffect`, `Effect`, `EffectState` (`fx/effect.ts`); `ramp` (`fx/param.ts`).
- Produces: efecto registrado `'eq-graphic'` cuyo `Effect` tiene `eq: EqApi`.

Sin test unitario del efecto (Web Audio); la parte pura ya está en Task 1. Verificado por typecheck + build.

- [ ] **Step 1: Añade `eq?: EqApi` a la interfaz `Effect` (`fx/effect.ts`)**

Al principio de `fx/effect.ts`, añade el import de tipo:

```ts
import type { EqApi } from './eq-core';
```

Y en la interfaz `Effect`, añade el campo opcional al final (tras `dispose(): void;`):

```ts
export interface Effect {
  id: string;
  type: string;
  input: AudioNode;
  output: AudioNode;
  setParam(name: string, value: number): void;
  getParams(): ParamSpec[];
  getValues(): Record<string, number>;
  isBypassed(): boolean;
  bypass(on: boolean): void;
  serialize(): EffectState;
  dispose(): void;
  eq?: EqApi;   // solo el EQ gráfico lo define; el rack lo usa para mostrar su editor a medida
}
```

- [ ] **Step 2: Crea el efecto (`fx/effects/eq-graphic.ts`)**

```ts
// studio/src/fx/effects/eq-graphic.ts
// EQ gráfico de 8 bandas (lowshelf · 6 picos · highshelf) como efecto de inserción. Expone una EqApi para su
// editor gráfico. Puerta seco/húmedo para el bypass. Persistencia: bandas aplanadas a params (bandsToParams).
import { registerEffect, Effect, EffectState } from '../effect';
import { ramp } from '../param';
import {
  EqApi, EqBand, BAND_TYPES, defaultBands, bandsFromParams, bandsToParams, presetBands, presetNames
} from '../eq-core';

let _idc = 0;

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

  let bands: EqBand[] = state ? bandsFromParams(state.params) : defaultBands();
  let bypassed = false;
  const setBypass = (on: boolean): void => { bypassed = on; wet.gain.value = on ? 0 : 1; dry.gain.value = on ? 1 : 0; };

  function applyBand(i: number): void {
    const b = bands[i], n = nodes[i];
    ramp(n.frequency, b.freq, actx);
    ramp(n.Q, b.q, actx);
    ramp(n.gain, b.on ? b.gain : 0, actx);   // banda apagada → ganancia 0 (transparente, sin reconstruir el grafo)
  }
  bands.forEach((_, i) => applyBand(i));
  setBypass(state ? !!state.bypassed : false);

  const eq: EqApi = {
    getBands: () => bands.map(b => ({ ...b })),
    setBand: (i, patch) => { bands[i] = { ...bands[i], ...patch }; applyBand(i); },
    reset: () => { bands = defaultBands(); bands.forEach((_, i) => applyBand(i)); },
    applyPreset: (name) => { bands = presetBands(name); bands.forEach((_, i) => applyBand(i)); },
    presetNames,
    analyser,
    magResponse: (freqs) => {
      const N = freqs.length, mag = new Float32Array(N), ph = new Float32Array(N);
      const tot = new Float32Array(N).fill(1);
      for (const n of nodes) { n.getFrequencyResponse(freqs, mag, ph); for (let i = 0; i < N; i++) tot[i] *= mag[i]; }
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
    dispose: () => { for (const n of [input, output, wet, dry, analyser, ...nodes]) { try { n.disconnect(); } catch { /* ya */ } } },
    eq
  };
}

registerEffect('eq-graphic', { label: 'EQ gráfico', family: 'color', params: [], create: createEqEffect });
```

- [ ] **Step 3: Registra el efecto en el índice (`fx/effects/index.ts`)**

Añade una línea de import junto a los demás efectos de `studio/src/fx/effects/index.ts` (siguiendo el estilo del archivo, p. ej. `import './echo';`):

```ts
import './eq-graphic';
```

- [ ] **Step 4: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS. (El editor aún no existe; el efecto ya está registrado y aparece en "Añadir efecto…" bajo Color/EQ.)

- [ ] **Step 5: Commit**

```bash
git add studio/src/fx/effects/eq-graphic.ts studio/src/fx/effect.ts studio/src/fx/effects/index.ts
git commit -m "Estudio EQ: efecto de 8 bandas (biquads + EqApi + espectro) registrado en el rack"
```

---

### Task 3: Editor gráfico (`ui/eqEditor.ts` + CSS)

**Files:**
- Create: `studio/src/ui/eqEditor.ts`
- Modify: `studio/src/ui/styles.css`

**Interfaces:**
- Consumes: `EqApi` + `EQ_FMIN/EQ_FMAX/EQ_GAIN_RANGE/Q_MIN/Q_MAX/freqToX/xToFreq/gainToY/yToGain/bandAt` (Task 1).
- Produces: `mountEqEditor(root: HTMLElement, eq: EqApi, onChange: () => void): { close(): void }`.

DOM/canvas; sin test unitario. Verificado por typecheck + build.

- [ ] **Step 1: Crea `ui/eqEditor.ts`**

```ts
// studio/src/ui/eqEditor.ts
// Editor gráfico del EQ: canvas con espectro en tiempo real, curva de respuesta y 8 nodos de banda arrastrables
// (arrastrar = frecuencia+ganancia · rueda = Q · botones 1–8 = on/off · presets/Plano). Bucle rAF para el espectro.
import {
  EqApi, EQ_FMIN, EQ_FMAX, EQ_GAIN_RANGE, Q_MIN, Q_MAX, freqToX, xToFreq, gainToY, yToGain, bandAt
} from '../fx/eq-core';

export interface EqEditorHandle { close(): void }

export function mountEqEditor(root: HTMLElement, eq: EqApi, onChange: () => void): EqEditorHandle {
  const presetOpts = eq.presetNames().map(n => `<option value="${n}">${n}</option>`).join('');
  root.innerHTML = `<div class="eqEd">
    <div class="eqBar">
      <select id="eqPreset"><option value="">Presets…</option>${presetOpts}</select>
      <button id="eqFlat" class="smpBtn">Plano</button>
      <span class="eqHint muted">arrastra un punto (frec./ganancia) · rueda = Q · botón = on/off</span>
      <span id="eqBands" class="eqBands"></span>
    </div>
    <canvas id="eqCanvas" class="eqCanvas" width="760" height="300"></canvas>
  </div>`;

  const canvas = root.querySelector('#eqCanvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  let sel = -1, drag = -1;

  function bandButtons(): void {
    const wrap = root.querySelector('#eqBands') as HTMLElement;
    wrap.innerHTML = eq.getBands().map((b, i) => `<button class="eqBtn${b.on ? ' on' : ''}" data-b="${i}">${i + 1}</button>`).join('');
    wrap.querySelectorAll<HTMLButtonElement>('.eqBtn').forEach(btn =>
      btn.addEventListener('click', () => { const i = +(btn.dataset.b ?? '0'); eq.setBand(i, { on: !eq.getBands()[i].on }); onChange(); bandButtons(); }));
  }
  bandButtons();

  const freqs = new Float32Array(256);
  for (let i = 0; i < 256; i++) freqs[i] = xToFreq(i / 255 * W, W);

  function draw(): void {
    ctx.fillStyle = '#0c110b'; ctx.fillRect(0, 0, W, H);
    // rejilla frecuencia + ganancia
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.fillStyle = '#7b818e'; ctx.font = '10px ui-monospace,monospace';
    [100, 1000, 10000].forEach(f => { const x = freqToX(f, W); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.fillText(f >= 1000 ? (f / 1000) + 'k' : '' + f, x + 3, H - 4); });
    [-12, -6, 0, 6, 12].forEach(g => { const y = gainToY(g, H); ctx.strokeStyle = g === 0 ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.fillStyle = '#7b818e'; ctx.fillText((g > 0 ? '+' : '') + g, 3, y - 2); });
    // espectro
    const bins = eq.analyser.frequencyBinCount, data = new Uint8Array(bins); eq.analyser.getByteFrequencyData(data);
    const nyq = eq.analyser.context.sampleRate / 2;
    ctx.fillStyle = 'rgba(150,160,180,.16)'; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 2) { const f = xToFreq(x, W); const bin = Math.min(bins - 1, Math.max(0, Math.round(f / nyq * bins))); ctx.lineTo(x, H - (data[bin] / 255) * H); }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // curva de respuesta
    const tot = eq.magResponse(freqs);
    ctx.strokeStyle = '#2dff6a'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 256; i++) { const db = 20 * Math.log10(tot[i] || 1e-6); const x = i / 255 * W, y = gainToY(db, H); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.lineWidth = 1;
    // nodos de banda
    eq.getBands().forEach((b, i) => {
      if (!b.on) return;
      const x = freqToX(b.freq, W), y = gainToY(Math.max(-EQ_GAIN_RANGE, Math.min(EQ_GAIN_RANGE, b.gain)), H);
      ctx.fillStyle = i === sel ? '#fff' : '#2dff6a'; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#04140a'; ctx.font = 'bold 10px ui-monospace,monospace'; ctx.fillText('' + (i + 1), x - 3, y + 3);
    });
  }

  const rel = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  };
  canvas.addEventListener('pointerdown', e => {
    const { x, y } = rel(e); const i = bandAt(eq.getBands(), x, y, W, H);
    if (i >= 0) { sel = i; drag = i; canvas.setPointerCapture(e.pointerId); }
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
    sel = i; onChange();
  }, { passive: false });

  (root.querySelector('#eqPreset') as HTMLSelectElement).addEventListener('change', ev => {
    const s = ev.target as HTMLSelectElement; if (s.value) { eq.applyPreset(s.value); onChange(); bandButtons(); } s.value = '';
  });
  (root.querySelector('#eqFlat') as HTMLButtonElement).addEventListener('click', () => { eq.reset(); onChange(); bandButtons(); });

  let raf = 0;
  const loop = (): void => { draw(); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  return { close: () => cancelAnimationFrame(raf) };
}
```

- [ ] **Step 2: CSS (`ui/styles.css`)**

Añade al final de `studio/src/ui/styles.css`:

```css
/* ---------- Editor gráfico de EQ ---------- */
.eqEd{display:flex;flex-direction:column;gap:8px}
.eqBar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--pv-muted)}
.eqBar select{background:#141a13;border:1px solid #2b3324;color:var(--pv-ink);border-radius:6px;padding:4px 8px;cursor:pointer}
.eqHint{font-size:10px}
.eqBands{display:flex;gap:4px;margin-left:auto}
.eqBtn{width:24px;height:22px;background:#141a13;border:1px solid #2b3324;color:var(--pv-muted);border-radius:5px;cursor:pointer;font-size:11px}
.eqBtn.on{border-color:var(--pv-acc);color:#fff;box-shadow:0 0 6px var(--pv-acc-dim)}
.eqCanvas{width:100%;height:300px;border:1px solid var(--pv-line);border-radius:8px;background:#0c110b;touch-action:none}
```

- [ ] **Step 3: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS. (Aún no se abre desde ningún sitio; se cablea en Task 4.)

- [ ] **Step 4: Commit**

```bash
git add studio/src/ui/eqEditor.ts studio/src/ui/styles.css
git commit -m "Estudio EQ: editor gráfico (canvas: espectro + curva + nodos arrastrables + presets) + CSS"
```

---

### Task 4: Botón ✎ en el rack + overlay (`ui/rack.ts` + `app/studioView.ts` + CSS)

**Files:**
- Modify: `studio/src/ui/rack.ts`
- Modify: `studio/src/app/studioView.ts`
- Modify: `studio/src/ui/styles.css`

**Interfaces:**
- Consumes: `mountEqEditor` (Task 3); `Effect.eq` (Task 2). `mountRack` gana un 5º parámetro opcional
  `onEdit?: (effect: Effect) => void`.

Integración (DOM); sin test unitario. Verificado por typecheck + tests verdes + build + prueba a vista/oído.

- [ ] **Step 1: `ui/rack.ts` — tarjeta con ✎ para efectos con `eq` + callback `onEdit`**

(a) Añade el import del tipo `Effect`:

```ts
import { Rack } from '../fx/rack';
import { EFFECTS, Family, Effect } from '../fx/effect';
import { mountKnob } from './knob';
```

(b) Cambia la firma de `mountRack` para aceptar `onEdit`:

```ts
export function mountRack(root: HTMLElement, rack: Rack, title: string, onChange: () => void, onEdit?: (effect: Effect) => void): void {
```

(c) Dentro de `render()`, en el `.map(e => …)` de tarjetas, sustituye el cuerpo de la tarjeta para que los
efectos con `e.eq` muestren un botón ✎ en vez de knobs. Reemplaza el `return \`<div class="fxCard…\`` por:

```ts
      const body = e.eq
        ? `<div class="fxEditRow"><button class="smpBtn fxEditBtn" data-edit="${e.id}">✎ Editar EQ</button></div>`
        : `<div class="fxParams">${params}</div>`;
      return `<div class="fxCard${e.isBypassed() ? ' byp' : ''}">
        <div class="fxHead">
          <b>${def ? def.label : e.type}</b>
          <span class="grow"></span>
          <label class="fxByp"><input type="checkbox" data-byp="${e.id}" ${e.isBypassed() ? 'checked' : ''}> Bypass</label>
          <button class="chBtn" data-up="${e.id}" title="Mover a la izquierda">◀</button>
          <button class="chBtn" data-down="${e.id}" title="Mover a la derecha">▶</button>
          <button class="chBtn" data-del="${e.id}" title="Quitar">✕</button>
        </div>
        ${body}</div>`;
```

(d) Al final de `render()` (junto a los otros `querySelectorAll` de botones), añade el cableado del botón ✎:

```ts
    root.querySelectorAll<HTMLButtonElement>('button[data-edit]').forEach(b =>
      b.addEventListener('click', () => { const e = rack.list().find(x => x.id === b.dataset.edit); if (e) onEdit?.(e); }));
```

- [ ] **Step 2: `app/studioView.ts` — imports, overlay y apertura**

(a) Añade los imports (junto a los otros de `ui/`):

```ts
import { mountEqEditor, EqEditorHandle } from '../ui/eqEditor';
import type { Effect } from '../fx/effect';
```

(b) En el `root.innerHTML`, justo antes del cierre `</div>` de `.pvView` (tras la línea del `<p class="muted">…`
del teclado), añade el overlay del EQ:

```ts
      <div id="eqOverlay" class="eqOverlay" hidden>
        <div class="eqModal">
          <div class="eqModalHead"><b>EQ gráfico</b><span class="grow"></span><button id="eqClose" class="chBtn" title="Cerrar">✕</button></div>
          <div id="eqHost"></div>
        </div>
      </div>
```

(c) Junto a los `let` del principio de `mountStudioView`, añade el estado del editor:

```ts
  let eqHandle: EqEditorHandle | null = null;
```

(d) Añade las funciones de abrir/cerrar el overlay + cableado (p. ej. cerca de `renderSelectedRack`):

```ts
  function openEqEditor(effect: Effect): void {
    if (!effect.eq) return;
    eqHandle?.close();
    eqHandle = mountEqEditor(root.querySelector('#eqHost') as HTMLElement, effect.eq, persist);
    (root.querySelector('#eqOverlay') as HTMLElement).hidden = false;
  }
  function closeEqEditor(): void {
    (root.querySelector('#eqOverlay') as HTMLElement).hidden = true;
    eqHandle?.close(); eqHandle = null;
  }
  (root.querySelector('#eqClose') as HTMLButtonElement).addEventListener('click', closeEqEditor);
  (root.querySelector('#eqOverlay') as HTMLElement).addEventListener('click', e => { if (e.target === e.currentTarget) closeEqEditor(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !(root.querySelector('#eqOverlay') as HTMLElement).hidden) closeEqEditor(); });
```

(e) Pasa `openEqEditor` como 5º argumento en los DOS `mountRack`:
- El del máster (busca `mountRack(root.querySelector('#masterRack') as HTMLElement, masterRack, 'Maestro', persist);`) →

```ts
      mountRack(root.querySelector('#masterRack') as HTMLElement, masterRack, 'Maestro', persist, openEqEditor);
```

- El del canal en `renderSelectedRack` (busca `if (audio && ch) mountRack(host, audio.rack, 'Canal ' + n, persist);`) →

```ts
    if (audio && ch) mountRack(host, audio.rack, 'Canal ' + n, persist, openEqEditor);
```

- [ ] **Step 3: CSS del overlay (`ui/styles.css`)**

Añade al final:

```css
/* ---------- Overlay del editor de EQ ---------- */
.eqOverlay{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:16px}
.eqOverlay[hidden]{display:none}
.eqModal{width:min(820px,96vw);background:#10130f;border:1px solid #2b3324;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.6);padding:12px}
.eqModalHead{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.eqModalHead b{color:var(--pv-acc);letter-spacing:.06em}
```

- [ ] **Step 4: Verify typecheck, tests and build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS.

- [ ] **Step 5: Manual smoke test (prueba por vista/oído)**

Run: `cd studio && npm run dev` y abre la URL:
1. En el rack de un canal (o del máster), **➕ Añadir efecto… → Color/EQ → EQ gráfico**. La tarjeta muestra **✎ Editar EQ**.
2. Pulsa ✎: se abre el **overlay** con la curva, el **espectro** en tiempo real detrás y los 8 nodos.
3. **Arrastra** un nodo (cambia frecuencia/ganancia y se **oye**); **rueda** sobre un nodo cambia la **Q**;
   los botones **1–8** activan/desactivan bandas; **Presets** y **Plano** funcionan.
4. **Bypass/✕/◀▶** de la tarjeta siguen bien; cerrar con ✕/Esc/fondo detiene el editor.
5. El EQ **persiste** al guardar/abrir el proyecto.

- [ ] **Step 6: Commit**

```bash
git add studio/src/ui/rack.ts studio/src/app/studioView.ts studio/src/ui/styles.css
git commit -m "Estudio EQ: botón ✎ en el rack + overlay del editor gráfico (canal y máster)"
```

---

### Task 5: Docs y versión

**Files:**
- Modify: `studio/package.json` (subir `version` a `0.25.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.25.0"`.

- [ ] **Step 2: Update HANDOFF.md**

Añade en la zona de estado del Estudio:

```markdown
**Estudio · EQ gráfico paramétrico E1 (v0.25.0):** nuevo efecto de inserción **"EQ gráfico"** (canal o máster):
cadena de **8 biquads** (lowshelf · 6 picos · highshelf) con **editor gráfico** en overlay — curva de respuesta,
**espectro en tiempo real** (AnalyserNode) detrás, **8 nodos arrastrables** (arrastrar = frec./ganancia · rueda =
Q · botones 1–8 = on/off), **presets** + Plano. Núcleo puro testeado `fx/eq-core.ts` (bandas/params/matemática
del canvas) + efecto `fx/effects/eq-graphic.ts` (expone `eq: EqApi` en el `Effect`; el rack muestra ✎ Editar en
vez de knobs) + `ui/eqEditor.ts` (canvas) + overlay en `app/studioView.ts`. Persistencia por params aplanados.
Sin cambios de motor. **Pendiente E2:** dinámica por banda (threshold/attack/release) + mid/side.
```

- [ ] **Step 3: Update CLAUDE.md**

En la sección del Estudio (decisión 5), tras la última mención (piano-roll resalta nota), añade: **EQ gráfico
paramétrico E1 (v0.25.0): efecto de inserción de 8 bandas con editor gráfico (curva + espectro + nodos
arrastrables + presets)** (`fx/eq-core.ts` + `fx/effects/eq-graphic.ts` + `ui/eqEditor.ts`; el rack muestra ✎
para efectos con `eq`; sin cambios de motor). Pendiente E2: dinámica + mid/side.

- [ ] **Step 4: Verify and commit**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio EQ: docs (HANDOFF/CLAUDE) y versión 0.25.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- Núcleo puro (tipos/bandas/presets/params/matemática) + tests → Task 1 ✅
- Efecto de 8 biquads + `eq: EqApi` + espectro + persistencia + registro → Task 2 ✅
- Editor gráfico (curva + espectro + nodos arrastrables + Q rueda + on/off + presets/Plano) → Task 3 ✅
- Rack ✎ + overlay (canal y máster) + abrir/cerrar → Task 4 ✅
- Docs/versión → Task 5 ✅

**Placeholders:** ninguno; el código va completo. (El editor y el efecto se portan de `pianova.html`, adaptados a
la `EqApi`.)

**Consistencia de tipos:** `EqApi`/`EqBand`/`bandsToParams`/`bandsFromParams`/`defaultBands`/`presetBands`/
`presetNames`/`freqToX`/`xToFreq`/`gainToY`/`yToGain`/`bandAt` (Task 1) coinciden con su uso en Tasks 2–3.
`Effect.eq?: EqApi` (Task 2) es lo que `ui/rack.ts` comprueba (Task 4) y lo que `openEqEditor` consume. `mountRack(root, rack, title, onChange, onEdit?)` (Task 4) coincide con las dos llamadas en `studioView`.
`mountEqEditor(root, eq, onChange) → { close() }` (Task 3) coincide con `openEqEditor`.

**Estado intermedio válido:** Task 1 (puro) no afecta a la vista; Task 2 registra el efecto (aparece en el menú;
si lo añades sin editor, funciona como EQ plano editable por nada aún); Task 3 crea el editor (sin abrir); Task 4
lo cablea. Cada tarea compila.

**Decisión consciente:** una banda apagada no reconstruye el grafo — solo pone su ganancia a 0 (transparente),
más simple y sin clics; el bypass del efecto usa la puerta seco/húmedo estándar.
