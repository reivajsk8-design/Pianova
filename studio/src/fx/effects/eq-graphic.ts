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
