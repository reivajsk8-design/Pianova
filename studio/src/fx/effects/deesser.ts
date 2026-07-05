// DeEsser por bandas: la banda grave pasa intacta; la banda aguda (sibilancias) se comprime y se vuelve
// a sumar. Cuando suben las "eses", esa banda se atenúa.
import { registerEffect, makeEffect, ParamSpec } from '../effect';
import { ramp } from '../param';

export const DEESSER_PARAMS: ParamSpec[] = [
  { name: 'freq', label: 'Frecuencia', min: 2000, max: 12000, step: 100, default: 6000, unit: 'Hz' },
  { name: 'threshold', label: 'Umbral', min: -60, max: 0, step: 0.5, default: -30, unit: 'dB' },
  { name: 'amount', label: 'Cantidad', min: 1, max: 20, step: 0.5, default: 6 }
];

registerEffect('deesser', {
  label: 'DeEsser', family: 'dyn', params: DEESSER_PARAMS,
  create: (actx, state) => makeEffect(actx, 'deesser', DEESSER_PARAMS, (actx, input, sink) => {
    const low = actx.createBiquadFilter(); low.type = 'lowpass';
    const high = actx.createBiquadFilter(); high.type = 'highpass';
    const comp = actx.createDynamicsCompressor();
    comp.knee.value = 6; comp.attack.value = 0.001; comp.release.value = 0.05;
    input.connect(low); low.connect(sink);                          // banda grave intacta
    input.connect(high); high.connect(comp); comp.connect(sink);    // banda aguda comprimida
    return (name: string, value: number) => {
      if (name === 'freq') { ramp(low.frequency, value, actx); ramp(high.frequency, value, actx); }
      else if (name === 'threshold') ramp(comp.threshold, value, actx);
      else if (name === 'amount') ramp(comp.ratio, value, actx);
    };
  }, state)
});
