// Scaling Limiter: DynamicsCompressor con ratio alto (limita picos) + ganancia de compensación (makeup).
import { registerEffect, makeEffect, ParamSpec } from '../effect';
import { dbToLin } from './gain';

export const LIMITER_PARAMS: ParamSpec[] = [
  { name: 'threshold', label: 'Umbral', min: -40, max: 0, step: 0.5, default: -3, unit: 'dB' },
  { name: 'release', label: 'Release', min: 0.01, max: 0.5, step: 0.01, default: 0.1, unit: 's' },
  { name: 'makeup', label: 'Ganancia', min: 0, max: 24, step: 0.5, default: 0, unit: 'dB' }
];

registerEffect('limiter', {
  label: 'Scaling Limiter', family: 'dyn', params: LIMITER_PARAMS,
  create: (actx, state) => makeEffect(actx, 'limiter', LIMITER_PARAMS, (actx, input, sink) => {
    const comp = actx.createDynamicsCompressor();
    comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = 0.002;
    const makeup = actx.createGain();
    input.connect(comp); comp.connect(makeup); makeup.connect(sink);
    return (name: string, value: number) => {
      if (name === 'threshold') comp.threshold.value = value;
      else if (name === 'release') comp.release.value = value;
      else if (name === 'makeup') makeup.gain.value = dbToLin(value);
    };
  }, state)
});
