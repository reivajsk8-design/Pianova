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
