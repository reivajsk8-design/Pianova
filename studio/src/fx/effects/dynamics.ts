// Dynamics: compresor completo (DynamicsCompressor) con makeup. Dos variantes: estéreo (detección
// enlazada nativa) y mono (suma a mono antes de comprimir). Comparten el mismo motor.
import { registerEffect, makeEffect, ParamSpec } from '../effect';
import { dbToLin } from './gain';

export const DYNAMICS_PARAMS: ParamSpec[] = [
  { name: 'threshold', label: 'Umbral', min: -60, max: 0, step: 0.5, default: -24, unit: 'dB' },
  { name: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, default: 4 },
  { name: 'knee', label: 'Codo', min: 0, max: 40, step: 1, default: 6, unit: 'dB' },
  { name: 'attack', label: 'Ataque', min: 0, max: 0.5, step: 0.001, default: 0.01, unit: 's' },
  { name: 'release', label: 'Release', min: 0.01, max: 1, step: 0.01, default: 0.25, unit: 's' },
  { name: 'makeup', label: 'Ganancia', min: 0, max: 24, step: 0.5, default: 0, unit: 'dB' }
];

// Monta el compresor entre input y sink. Si `mono`, suma a un solo canal antes de comprimir.
function buildCompressor(actx: AudioContext, input: GainNode, sink: GainNode, mono: boolean) {
  let head: AudioNode = input;
  if (mono) {
    const sum = actx.createGain();
    sum.channelCount = 1; sum.channelCountMode = 'explicit'; sum.channelInterpretation = 'speakers';
    input.connect(sum); head = sum;
  }
  const comp = actx.createDynamicsCompressor();
  const makeup = actx.createGain();
  head.connect(comp); comp.connect(makeup); makeup.connect(sink);
  return (name: string, value: number) => {
    if (name === 'threshold') comp.threshold.value = value;
    else if (name === 'ratio') comp.ratio.value = value;
    else if (name === 'knee') comp.knee.value = value;
    else if (name === 'attack') comp.attack.value = value;
    else if (name === 'release') comp.release.value = value;
    else if (name === 'makeup') makeup.gain.value = dbToLin(value);
  };
}

registerEffect('dynamics', {
  label: 'Dynamics (estéreo)', family: 'dyn', params: DYNAMICS_PARAMS,
  create: (actx, state) => makeEffect(actx, 'dynamics', DYNAMICS_PARAMS,
    (actx, input, sink) => buildCompressor(actx, input, sink, false), state)
});

registerEffect('dynamics-mono', {
  label: 'Dynamics (mono)', family: 'dyn', params: DYNAMICS_PARAMS,
  create: (actx, state) => makeEffect(actx, 'dynamics-mono', DYNAMICS_PARAMS,
    (actx, input, sink) => buildCompressor(actx, input, sink, true), state)
});
