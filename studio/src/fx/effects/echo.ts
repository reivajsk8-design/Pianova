// Echo: línea de delay con realimentación filtrada (paso-bajo en el lazo) y mezcla seco/húmedo.
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const ECHO_PARAMS: ParamSpec[] = [
  { name: 'time', label: 'Tiempo', min: 20, max: 1000, step: 1, default: 300, unit: 'ms' },
  { name: 'feedback', label: 'Realimentación', min: 0, max: 0.9, step: 0.01, default: 0.35 },
  { name: 'tone', label: 'Tono', min: 500, max: 12000, step: 100, default: 6000, unit: 'Hz' },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 0.35 }
];

registerEffect('echo', {
  label: 'Echo', family: 'delay', params: ECHO_PARAMS,
  create: (actx, state) => makeEffect(actx, 'echo', ECHO_PARAMS, (actx, input, sink) => {
    const dryMix = actx.createGain();
    const delay = actx.createDelay(2.0);
    const fb = actx.createGain();
    const tone = actx.createBiquadFilter(); tone.type = 'lowpass';
    const wetMix = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    input.connect(delay);
    delay.connect(tone); tone.connect(wetMix); wetMix.connect(sink);
    tone.connect(fb); fb.connect(delay);   // realimentación filtrada
    return (name, value) => {
      if (name === 'time') delay.delayTime.value = value / 1000;
      else if (name === 'feedback') fb.gain.value = value;
      else if (name === 'tone') tone.frequency.value = value;
      else if (name === 'mix') { wetMix.gain.value = value; dryMix.gain.value = 1 - value; }
    };
  }, state)
});
