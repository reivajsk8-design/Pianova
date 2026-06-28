// Sigmoid Booster: WaveShaper con curva sigmoide (refuerzo/saturación simétrica). Curva regenerada con
// debounce al cambiar el drive. oversample 4x + mezcla seco/húmedo.
import { registerEffect, makeEffect, ParamSpec } from '../effect';
import { sigmoidSample, makeCurve } from './color-dsp';

export const SIGMOID_PARAMS: ParamSpec[] = [
  { name: 'drive', label: 'Drive', min: 0, max: 1, step: 0.01, default: 0.4 },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 1 }
];

registerEffect('sigmoid', {
  label: 'Sigmoid Booster', family: 'color', params: SIGMOID_PARAMS,
  create: (actx, state) => makeEffect(actx, 'sigmoid', SIGMOID_PARAMS, (actx, input, sink) => {
    let drive = SIGMOID_PARAMS[0].default;
    let t: ReturnType<typeof setTimeout> | null = null;
    const dryMix = actx.createGain();
    const shaper = actx.createWaveShaper(); shaper.oversample = '4x';
    shaper.curve = makeCurve(2048, x => sigmoidSample(x, drive)) as Float32Array<ArrayBuffer>;
    const wetMix = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    input.connect(shaper); shaper.connect(wetMix); wetMix.connect(sink);
    const rebuild = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { shaper.curve = makeCurve(2048, x => sigmoidSample(x, drive)) as Float32Array<ArrayBuffer>; t = null; }, 80);
    };
    return (name: string, value: number) => {
      if (name === 'drive') { drive = value; rebuild(); }
      else if (name === 'mix') { wetMix.gain.value = value; dryMix.gain.value = 1 - value; }
    };
  }, state)
});
