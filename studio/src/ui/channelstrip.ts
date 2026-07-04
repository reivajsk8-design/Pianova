// HTML de la tira de un canal (controles). Los eventos los engancha studioView por delegación (data-*).
import type { ChannelState } from '../daw/model';
import { getPresetNames } from '../audio/synth';
import { DRUM_VOICES, DRUM_LABELS } from '../audio/drums';

// Solo el selector de sonido del canal (reutilizable en la tira del MIXER y en el panel de PADS).
export function instrumentSelectHTML(ch: ChannelState): string {
  const cur = ch.instrument.kind === 'drum' ? `drum:${ch.instrument.voice}`
    : ch.instrument.kind === 'synthx' ? 'synthx'
    : ch.instrument.kind === 'slicer' ? 'slicer'
    : `synth:${ch.instrument.preset}`;
  const synthOpts = getPresetNames()
    .map(([k, label]) => `<option value="synth:${k}"${cur === `synth:${k}` ? ' selected' : ''}>${label}</option>`).join('');
  const drumOpts = DRUM_VOICES
    .map(vc => `<option value="drum:${vc}"${cur === `drum:${vc}` ? ' selected' : ''}>${DRUM_LABELS[vc]}</option>`).join('');
  const isSynthx = ch.instrument.kind === 'synthx';
  return `<select class="chInst" data-inst="${ch.id}">
    <optgroup label="Sintetizados">${synthOpts}</optgroup>
    <optgroup label="Sinte editable"><option value="synthx"${isSynthx ? ' selected' : ''}>Sinte editable</option></optgroup>
    <optgroup label="Sampler"><option value="slicer"${cur === 'slicer' ? ' selected' : ''}>🔪 Slicer (audio troceado)</option></optgroup>
    <optgroup label="Batería">${drumOpts}</optgroup>
  </select>`;
}

export function channelStripHTML(ch: ChannelState, index: number, selected: boolean): string {
  const isSynthx = ch.instrument.kind === 'synthx';
  return `<div class="chStrip${selected ? ' sel' : ''}">
    <div class="chMain">
      <div class="chHead">
        <button class="chSel" data-sel="${ch.id}" title="Seleccionar (lo toca el teclado)">${index + 1}</button>
        ${instrumentSelectHTML(ch)}
      </div>
      <div class="chBtns">
        ${isSynthx ? `<button class="chBtn" data-syned="${ch.id}" title="Editar el sinte">✏️</button>` : ''}
        <button class="chBtn${ch.muted ? ' on' : ''}" data-mute="${ch.id}" title="Silenciar">M</button>
        <button class="chBtn${ch.soloed ? ' onS' : ''}" data-solo="${ch.id}" title="Solo">S</button>
        <button class="chBtn" data-fx="${ch.id}" title="Efectos del canal">🎛</button>
        <button class="chBtn" data-del="${ch.id}" title="Quitar canal">✕</button>
      </div>
    </div>
    <div class="chMix">
      <div class="knobCell" title="Volumen (arrastra ↕ · doble-clic resetea)"><div class="knob" data-vol="${ch.id}"></div><span>Vol</span></div>
      <div class="knobCell" title="Paneo (arrastra ↕ · doble-clic centra)"><div class="knob" data-pan="${ch.id}"></div><span>Pan</span></div>
    </div>
  </div>`;
}
