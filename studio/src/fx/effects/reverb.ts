// Reverberator: ConvolverNode con impulso generado (ruido + caída). El buffer se reconstruye con
// debounce al cambiar tamaño/caída (evita reconstruir en cada paso del deslizador).
import { registerEffect, makeEffect, ParamSpec } from '../effect';
import { impulseSamples } from './reverb-impulse';

export const REVERB_PARAMS: ParamSpec[] = [
  { name: 'size', label: 'Tamaño', min: 0.2, max: 4, step: 0.1, default: 1.8, unit: 's' },
  { name: 'decay', label: 'Caída', min: 1, max: 8, step: 0.1, default: 2.5 },
  { name: 'tone', label: 'Color', min: 800, max: 16000, step: 100, default: 9000, unit: 'Hz' },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 0.3 }
];

function buildImpulse(actx: AudioContext, size: number, decay: number): AudioBuffer {
  const len = Math.max(1, Math.floor(actx.sampleRate * size));
  const buf = actx.createBuffer(2, len, actx.sampleRate);
  const ch0 = impulseSamples(len, decay, 1);
  const ch1 = impulseSamples(len, decay, 2);
  const out0 = buf.getChannelData(0);
  const out1 = buf.getChannelData(1);
  for (let i = 0; i < len; i++) { out0[i] = ch0[i]; out1[i] = ch1[i]; }
  return buf;
}

registerEffect('reverb', {
  label: 'Reverberación', family: 'delay', params: REVERB_PARAMS,
  create: (actx, state) => makeEffect(actx, 'reverb', REVERB_PARAMS, (actx, input, sink) => {
    let size = REVERB_PARAMS[0].default;
    let decay = REVERB_PARAMS[1].default;
    let rebuildT: ReturnType<typeof setTimeout> | null = null;
    const dryMix = actx.createGain();
    const conv = actx.createConvolver();
    conv.buffer = buildImpulse(actx, size, decay);
    const tone = actx.createBiquadFilter(); tone.type = 'lowpass';
    const wetMix = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    input.connect(conv); conv.connect(tone); tone.connect(wetMix); wetMix.connect(sink);
    const scheduleRebuild = () => {
      if (rebuildT) clearTimeout(rebuildT);
      rebuildT = setTimeout(() => { conv.buffer = buildImpulse(actx, size, decay); rebuildT = null; }, 120);
    };
    return (name, value) => {
      if (name === 'size') { size = value; scheduleRebuild(); }
      else if (name === 'decay') { decay = value; scheduleRebuild(); }
      else if (name === 'tone') tone.frequency.value = value;
      else if (name === 'mix') { wetMix.gain.value = value; dryMix.gain.value = 1 - value; }
    };
  }, state)
});
