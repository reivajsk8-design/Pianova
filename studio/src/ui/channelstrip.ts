// HTML de la tira de un canal (controles). Los eventos los engancha studioView por delegación (data-*).
import type { ChannelState } from '../daw/model';
import { getPresetNames } from '../audio/synth';
import { DRUM_VOICES, DRUM_LABELS } from '../audio/drums';

export function channelStripHTML(ch: ChannelState, index: number, selected: boolean): string {
  const cur = ch.instrument.kind === 'drum' ? `drum:${ch.instrument.voice}` : `synth:${ch.instrument.preset}`;
  const synthOpts = getPresetNames()
    .map(([k, label]) => `<option value="synth:${k}"${cur === `synth:${k}` ? ' selected' : ''}>${label}</option>`).join('');
  const drumOpts = DRUM_VOICES
    .map(vc => `<option value="drum:${vc}"${cur === `drum:${vc}` ? ' selected' : ''}>${DRUM_LABELS[vc]}</option>`).join('');
  return `<div class="chStrip${selected ? ' sel' : ''}">
    <div class="chHead">
      <button class="chSel" data-sel="${ch.id}" title="Seleccionar (lo toca el teclado)">${index + 1}</button>
      <select class="chInst" data-inst="${ch.id}">
        <optgroup label="Sintetizados">${synthOpts}</optgroup>
        <optgroup label="Batería">${drumOpts}</optgroup>
      </select>
    </div>
    <div class="chBtns">
      <button class="chBtn${ch.muted ? ' on' : ''}" data-mute="${ch.id}" title="Silenciar">M</button>
      <button class="chBtn${ch.soloed ? ' onS' : ''}" data-solo="${ch.id}" title="Solo">S</button>
      <button class="chBtn" data-fx="${ch.id}" title="Efectos del canal">🎛</button>
      <button class="chBtn" data-del="${ch.id}" title="Quitar canal">✕</button>
    </div>
    <div class="chMix">
      <label title="Volumen">Vol <input type="range" data-vol="${ch.id}" min="0" max="1.2" step="0.01" value="${ch.volume}"></label>
      <label title="Paneo">Pan <input type="range" data-pan="${ch.id}" min="-1" max="1" step="0.05" value="${ch.pan}"></label>
    </div>
  </div>`;
}
