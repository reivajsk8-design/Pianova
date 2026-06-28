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
