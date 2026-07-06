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
