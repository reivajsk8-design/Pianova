// studio/src/fx/effects/rotary.ts
// Rotary Speaker (Leslie): un LFO modula amplitud (tremolo suave) y paneo (giro) → altavoz giratorio.
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const ROTARY_PARAMS: ParamSpec[] = [
  { name: 'speed', label: 'Velocidad', min: 0.3, max: 7, step: 0.1, default: 5.5, unit: 'Hz' },
  { name: 'depth', label: 'Profundidad', min: 0, max: 1, step: 0.01, default: 0.6 }
];

registerEffect('rotary', {
  label: 'Rotary Speaker', family: 'mod', params: ROTARY_PARAMS,
  create: (actx, state) => makeEffect(actx, 'rotary', ROTARY_PARAMS, (actx, input, sink) => {
    const amp = actx.createGain();
    const panner = actx.createStereoPanner();
    const lfo = actx.createOscillator(); lfo.type = 'sine';
    const ampDepth = actx.createGain();
    const panDepth = actx.createGain();
    input.connect(amp); amp.connect(panner); panner.connect(sink);
    lfo.connect(ampDepth); ampDepth.connect(amp.gain);
    lfo.connect(panDepth); panDepth.connect(panner.pan);
    lfo.start();
    const apply = (name: string, value: number) => {
      if (name === 'speed') lfo.frequency.value = value;
      else if (name === 'depth') {
        amp.gain.value = 1 - value * 0.3;   // tremolo suave (la amplitud no se va a 0)
        ampDepth.gain.value = value * 0.3;
        panDepth.gain.value = value;        // el giro sí usa todo el paneo
      }
    };
    return { apply, teardown: () => { try { lfo.stop(); } catch { /* ya */ } lfo.disconnect(); ampDepth.disconnect(); panDepth.disconnect(); } };
  }, state)
});
