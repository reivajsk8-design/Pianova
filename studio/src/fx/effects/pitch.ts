// Pitch Shifter: desplaza el tono con un AudioWorkletNode granular ('pitch-processor'). El módulo del
// worklet ya está cargado (la vista Estudio espera a ensureWorklets antes de permitir añadir efectos).
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const PITCH_PARAMS: ParamSpec[] = [
  { name: 'semitones', label: 'Semitonos', min: -12, max: 12, step: 1, default: 0, unit: 'st' },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 1 }
];

registerEffect('pitch', {
  label: 'Pitch Shifter', family: 'tone', params: PITCH_PARAMS,
  create: (actx, state) => makeEffect(actx, 'pitch', PITCH_PARAMS, (actx, input, sink) => {
    const dryMix = actx.createGain();
    const node = new AudioWorkletNode(actx, 'pitch-processor', { channelCount: 2, outputChannelCount: [2] });
    const wetMix = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    input.connect(node); node.connect(wetMix); wetMix.connect(sink);
    const pitchParam = node.parameters.get('pitch');
    return {
      apply: (name: string, value: number) => {
        if (name === 'semitones') { if (pitchParam) pitchParam.value = value; }
        else if (name === 'mix') { wetMix.gain.value = value; dryMix.gain.value = 1 - value; }
      },
      teardown: () => { try { node.disconnect(); } catch { /* ya */ } }
    };
  }, state)
});
