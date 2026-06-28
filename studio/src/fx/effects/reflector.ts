// Reflector: delay corto con realimentación (puede ser negativa → peines/inversión, sonido de reflexión).
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const REFLECTOR_PARAMS: ParamSpec[] = [
  { name: 'time', label: 'Tiempo', min: 1, max: 100, step: 0.5, default: 18, unit: 'ms' },
  { name: 'reflection', label: 'Reflexión', min: -0.9, max: 0.9, step: 0.01, default: 0.5 },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 0.5 }
];

registerEffect('reflector', {
  label: 'Reflector', family: 'delay', params: REFLECTOR_PARAMS,
  create: (actx, state) => makeEffect(actx, 'reflector', REFLECTOR_PARAMS, (actx, input, sink) => {
    const dryMix = actx.createGain();
    const delay = actx.createDelay(0.2);
    const fb = actx.createGain();
    const wetMix = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    input.connect(delay);
    delay.connect(wetMix); wetMix.connect(sink);
    delay.connect(fb); fb.connect(delay);
    return (name, value) => {
      if (name === 'time') delay.delayTime.value = value / 1000;
      else if (name === 'reflection') fb.gain.value = value;   // negativo permitido
      else if (name === 'mix') { wetMix.gain.value = value; dryMix.gain.value = 1 - value; }
    };
  }, state)
});
