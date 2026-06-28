// Pink/Fractal Noise: añade ruido rosa (fuente en bucle) a la señal. La señal de entrada pasa intacta;
// el ruido se suma con el nivel elegido. Es una fuente → teardown la para.
import { registerEffect, makeEffect, ParamSpec } from '../effect';
import { pinkNoiseSamples } from './noise-dsp';

export const PINK_PARAMS: ParamSpec[] = [
  { name: 'level', label: 'Nivel', min: 0, max: 1, step: 0.01, default: 0.2 }
];

registerEffect('pink-noise', {
  label: 'Pink/Fractal Noise', family: 'tone', params: PINK_PARAMS,
  create: (actx, state) => makeEffect(actx, 'pink-noise', PINK_PARAMS, (actx, input, sink) => {
    input.connect(sink);                                   // la señal pasa intacta
    const len = Math.floor(actx.sampleRate * 2);           // 2 s de ruido en bucle
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const ch = buf.getChannelData(0);
    const noise = pinkNoiseSamples(len, 1);
    for (let i = 0; i < len; i++) ch[i] = noise[i];
    const src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
    const level = actx.createGain();
    src.connect(level); level.connect(sink);
    src.start();
    return {
      apply: (name: string, value: number) => { if (name === 'level') level.gain.value = value; },
      teardown: () => { try { src.stop(); } catch { /* ya */ } src.disconnect(); level.disconnect(); }
    };
  }, state)
});
