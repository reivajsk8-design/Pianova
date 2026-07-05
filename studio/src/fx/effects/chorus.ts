// studio/src/fx/effects/chorus.ts
// Chorus/Flanger: un LFO modula un delay corto. Retardo base pequeño (~1-5ms) = flanger; mayor (~15-30ms) = chorus.
import { registerEffect, makeEffect, ParamSpec } from '../effect';
import { ramp } from '../param';

export const CHORUS_PARAMS: ParamSpec[] = [
  { name: 'rate', label: 'Velocidad', min: 0.05, max: 8, step: 0.05, default: 0.8, unit: 'Hz' },
  { name: 'depth', label: 'Profundidad', min: 0, max: 10, step: 0.1, default: 3, unit: 'ms' },
  { name: 'base', label: 'Retardo', min: 1, max: 30, step: 0.5, default: 18, unit: 'ms' },
  { name: 'feedback', label: 'Realimentación', min: 0, max: 0.9, step: 0.01, default: 0.2 },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 0.5 }
];

registerEffect('chorus', {
  label: 'Chorus/Flanger', family: 'mod', params: CHORUS_PARAMS,
  create: (actx, state) => makeEffect(actx, 'chorus', CHORUS_PARAMS, (actx, input, sink) => {
    const dryMix = actx.createGain();
    const delay = actx.createDelay(0.1);
    const fb = actx.createGain();
    const wetMix = actx.createGain();
    const lfo = actx.createOscillator(); lfo.type = 'sine';
    const lfoGain = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    input.connect(delay); delay.connect(wetMix); wetMix.connect(sink);
    delay.connect(fb); fb.connect(delay);
    lfo.connect(lfoGain); lfoGain.connect(delay.delayTime);
    lfo.start();
    const apply = (name: string, value: number) => {
      if (name === 'rate') ramp(lfo.frequency, value, actx);
      else if (name === 'depth') ramp(lfoGain.gain, value / 1000, actx);
      else if (name === 'base') ramp(delay.delayTime, value / 1000, actx);
      else if (name === 'feedback') ramp(fb.gain, value, actx);
      else if (name === 'mix') { ramp(wetMix.gain, value, actx); ramp(dryMix.gain, 1 - value, actx); }
    };
    return { apply, teardown: () => { try { lfo.stop(); } catch { /* ya */ } lfo.disconnect(); lfoGain.disconnect(); } };
  }, state)
});
