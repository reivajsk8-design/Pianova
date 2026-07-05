// Equalizer/BW: una banda peaking paramétrica con control de ancho de banda (octavas → Q).
import { registerEffect, makeEffect, ParamSpec } from '../effect';
import { bandwidthToQ } from './color-dsp';
import { ramp } from '../param';

export const EQBW_PARAMS: ParamSpec[] = [
  { name: 'freq', label: 'Frecuencia', min: 60, max: 12000, step: 10, default: 1000, unit: 'Hz' },
  { name: 'gain', label: 'Ganancia', min: -18, max: 18, step: 0.5, default: 0, unit: 'dB' },
  { name: 'bw', label: 'Ancho', min: 0.2, max: 3, step: 0.1, default: 1, unit: 'oct' }
];

registerEffect('equalizer-bw', {
  label: 'Equalizer/BW', family: 'color', params: EQBW_PARAMS,
  create: (actx, state) => makeEffect(actx, 'equalizer-bw', EQBW_PARAMS, (actx, input, sink) => {
    const band = actx.createBiquadFilter(); band.type = 'peaking'; band.frequency.value = 1000;
    input.connect(band); band.connect(sink);
    return (name: string, value: number) => {
      if (name === 'freq') ramp(band.frequency, value, actx);
      else if (name === 'gain') ramp(band.gain, value, actx);
      else if (name === 'bw') ramp(band.Q, bandwidthToQ(value), actx);
    };
  }, state)
});
