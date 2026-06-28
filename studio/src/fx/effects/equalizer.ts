// Equalizer de 3 bandas: graves (low shelf), medios (peaking con frecuencia) y agudos (high shelf).
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const EQ_PARAMS: ParamSpec[] = [
  { name: 'low', label: 'Graves', min: -18, max: 18, step: 0.5, default: 0, unit: 'dB' },
  { name: 'mid', label: 'Medios', min: -18, max: 18, step: 0.5, default: 0, unit: 'dB' },
  { name: 'midFreq', label: 'Frec. medios', min: 300, max: 5000, step: 50, default: 1000, unit: 'Hz' },
  { name: 'high', label: 'Agudos', min: -18, max: 18, step: 0.5, default: 0, unit: 'dB' }
];

registerEffect('equalizer', {
  label: 'Equalizer', family: 'color', params: EQ_PARAMS,
  create: (actx, state) => makeEffect(actx, 'equalizer', EQ_PARAMS, (actx, input, sink) => {
    const lo = actx.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 120;
    const mid = actx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 1;
    const hi = actx.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 6000;
    input.connect(lo); lo.connect(mid); mid.connect(hi); hi.connect(sink);
    return (name: string, value: number) => {
      if (name === 'low') lo.gain.value = value;
      else if (name === 'mid') mid.gain.value = value;
      else if (name === 'midFreq') mid.frequency.value = value;
      else if (name === 'high') hi.gain.value = value;
    };
  }, state)
});
