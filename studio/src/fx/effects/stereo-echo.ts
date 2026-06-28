// Stereo Echo (ping-pong): dos delays con paneo L/R y realimentación cruzada (rebota de un lado a otro).
import { registerEffect, makeEffect, ParamSpec } from '../effect';

export const STEREO_ECHO_PARAMS: ParamSpec[] = [
  { name: 'timeL', label: 'Tiempo izq.', min: 20, max: 1000, step: 1, default: 250, unit: 'ms' },
  { name: 'timeR', label: 'Tiempo der.', min: 20, max: 1000, step: 1, default: 375, unit: 'ms' },
  { name: 'feedback', label: 'Realimentación', min: 0, max: 0.85, step: 0.01, default: 0.4 },
  { name: 'mix', label: 'Mezcla', min: 0, max: 1, step: 0.01, default: 0.4 }
];

registerEffect('stereo-echo', {
  label: 'Stereo Echo', family: 'delay', params: STEREO_ECHO_PARAMS,
  create: (actx, state) => makeEffect(actx, 'stereo-echo', STEREO_ECHO_PARAMS, (actx, input, sink) => {
    const dryMix = actx.createGain();
    const dL = actx.createDelay(2.0), dR = actx.createDelay(2.0);
    const fbL = actx.createGain(), fbR = actx.createGain();
    const pL = actx.createStereoPanner(); pL.pan.value = -1;
    const pR = actx.createStereoPanner(); pR.pan.value = 1;
    const wetMix = actx.createGain();
    input.connect(dryMix); dryMix.connect(sink);
    input.connect(dL); input.connect(dR);
    dL.connect(pL); pL.connect(wetMix);
    dR.connect(pR); pR.connect(wetMix);
    wetMix.connect(sink);
    dL.connect(fbL); fbL.connect(dR);   // cruce L -> R
    dR.connect(fbR); fbR.connect(dL);   // cruce R -> L (ping-pong)
    return (name, value) => {
      if (name === 'timeL') dL.delayTime.value = value / 1000;
      else if (name === 'timeR') dR.delayTime.value = value / 1000;
      else if (name === 'feedback') { fbL.gain.value = value; fbR.gain.value = value; }
      else if (name === 'mix') { wetMix.gain.value = value; dryMix.gain.value = 1 - value; }
    };
  }, state)
});
