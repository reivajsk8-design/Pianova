// HTML de la tira de un canal (controles). Los eventos los engancha studioView por delegación (data-*).
import type { ChannelState } from '../daw/model';
import { getPresetNames } from '../audio/synth';

export function channelStripHTML(ch: ChannelState, index: number, selected: boolean): string {
  const opts = getPresetNames()
    .map(([k, label]) => `<option value="${k}"${k === ch.instrument.preset ? ' selected' : ''}>${label}</option>`).join('');
  return `<div class="chStrip${selected ? ' sel' : ''}">
    <div class="chHead">
      <button class="chSel" data-sel="${ch.id}" title="Seleccionar (lo toca el teclado)">${index + 1}</button>
      <select class="chInst" data-inst="${ch.id}">${opts}</select>
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
