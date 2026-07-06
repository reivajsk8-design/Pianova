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
    dispose: () => { for (const n of [input, output, wet, dry, analyser, ...nodes]) { try { n.disconnect(); } catch { /* ya */ } } },
    eq
  };
}

registerEffect('eq-graphic', { label: 'EQ gráfico', family: 'color', params: [], create: createEqEffect });
