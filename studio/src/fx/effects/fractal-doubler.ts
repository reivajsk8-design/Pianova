// studio/src/fx/effects/fractal-doubler.ts
// Fractal Doubler: 3 copias con delays cortos modulados a velocidades no enteras (suena "doblado"/grueso).
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const FRACTAL_PARAMS: ParamSpec[] = [
  { name: 'amount', label: 'Profundidad', min: 0, max: 8, step: 0.1, default: 3, unit: 'ms' },
  { name: 'rate', label: 'Velocidad', min: 0.05, max: 3, step: 0.05, default: 0.5, unit: 'Hz' },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 0.5 }
];

const DELAYS_MS = [11, 17, 23];          // retardos base de cada copia
const RATE_MUL = [1, 1.37, 0.71];        // multiplicadores no enteros = movimiento "fractal"
const PANS = [-0.5, 0.5, 0];             // reparto estéreo de las copias

registerEffect('fractal-doubler', {
  label: 'Fractal Doubler', family: 'mod', params: FRACTAL_PARAMS,
  create: (actx, state) => makeEffect(actx, 'fractal-doubler', FRACTAL_PARAMS, (actx, input, sink) => {
    const dryMix = actx.createGain();
    const wetMix = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    wetMix.connect(sink);
    const lfos: OscillatorNode[] = [];
    const lfoGains: GainNode[] = [];
    for (let i = 0; i < DELAYS_MS.length; i++) {
      const delay = actx.createDelay(0.1); delay.delayTime.value = DELAYS_MS[i] / 1000;
      const pan = actx.createStereoPanner(); pan.pan.value = PANS[i];
      const lfo = actx.createOscillator(); lfo.type = 'sine';
      const lg = actx.createGain();
      input.connect(delay); delay.connect(pan); pan.connect(wetMix);
      lfo.connect(lg); lg.connect(delay.delayTime); lfo.start();
      lfos.push(lfo); lfoGains.push(lg);
    }
    let rate = FRACTAL_PARAMS[1].default;
    let amount = FRACTAL_PARAMS[0].default;
    const applyMod = () => {
      for (let i = 0; i < lfos.length; i++) {
        lfos[i].frequency.value = rate * RATE_MUL[i];
        lfoGains[i].gain.value = (amount / 1000) * (0.6 + 0.4 * (i / lfos.length));
      }
    };
    const apply = (name: string, value: number) => {
      if (name === 'amount') { amount = value; applyMod(); }
      else if (name === 'rate') { rate = value; applyMod(); }
      else if (name === 'mix') { wetMix.gain.value = value; dryMix.gain.value = 1 - value; }
    };
    return { apply, teardown: () => { lfos.forEach(l => { try { l.stop(); } catch { /* ya */ } l.disconnect(); }); lfoGains.forEach(g => g.disconnect()); } };
  }, state)
});
