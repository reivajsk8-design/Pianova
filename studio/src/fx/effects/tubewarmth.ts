// TubeWarmth: saturación de válvula con WaveShaper. La curva (tubeSample) se regenera con debounce al
// cambiar drive/warmth. oversample 4x + mezcla seco/húmedo.
import { registerEffect, makeEffect, ParamSpec } from '../effect';
import { tubeSample, makeCurve } from './color-dsp';
import { ramp } from '../param';

export const TUBEWARMTH_PARAMS: ParamSpec[] = [
  { name: 'drive', label: 'Drive', min: 0, max: 1, step: 0.01, default: 0.3 },
  { name: 'warmth', label: 'Calidez', min: 0, max: 1, step: 0.01, default: 0.5 },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 1 }
];

registerEffect('tubewarmth', {
  label: 'TubeWarmth', family: 'color', params: TUBEWARMTH_PARAMS,
  create: (actx, state) => makeEffect(actx, 'tubewarmth', TUBEWARMTH_PARAMS, (actx, input, sink) => {
    let drive = TUBEWARMTH_PARAMS[0].default;
    let warmth = TUBEWARMTH_PARAMS[1].default;
    let t: ReturnType<typeof setTimeout> | null = null;
    const dryMix = actx.createGain();
    const shaper = actx.createWaveShaper(); shaper.oversample = '4x';
    shaper.curve = makeCurve(2048, x => tubeSample(x, drive, warmth)) as Float32Array<ArrayBuffer>;
    const wetMix = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    input.connect(shaper); shaper.connect(wetMix); wetMix.connect(sink);
    const rebuild = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { shaper.curve = makeCurve(2048, x => tubeSample(x, drive, warmth)) as Float32Array<ArrayBuffer>; t = null; }, 80);
    };
    return (name: string, value: number) => {
      if (name === 'drive') { drive = value; rebuild(); }
      else if (name === 'warmth') { warmth = value; rebuild(); }
      else if (name === 'mix') { ramp(wetMix.gain, value, actx); ramp(dryMix.gain, 1 - value, actx); }
    };
  }, state)
});
