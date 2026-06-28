// Efecto utilidad: trim de ganancia (-24..+24 dB). Sirve para probar el rack de punta a punta.
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const GAIN_PARAMS: ParamSpec[] = [
  { name: 'gain', label: 'Ganancia', min: -24, max: 24, step: 0.5, default: 0, unit: 'dB' }
];

export function dbToLin(db: number): number { return Math.pow(10, db / 20); }

registerEffect('gain', {
  label: 'Ganancia', family: 'util', params: GAIN_PARAMS,
  create: (actx, state) => makeEffect(actx, 'gain', GAIN_PARAMS, (actx, input, sink) => {
    const g = actx.createGain();
    input.connect(g); g.connect(sink);
    return (name, value) => { if (name === 'gain') g.gain.value = dbToLin(value); };
  }, state)
});
