// studio/src/ui/padGrid.ts
// Rejilla de pads del rediseño PIANOVA STUDIO: un pad por canal (= sonido), seleccionable.
import type { ChannelState } from '../daw/model';

function padIcon(ch: ChannelState): string {
  if (ch.instrument.kind === 'drum') return '🥁';
  if (ch.instrument.kind === 'synthx') return '🎚️';
  return '🎹';
}

export function padGridHTML(channels: ChannelState[], selectedId: string): string {
  const pads = channels.map((c, i) =>
    `<div class="pvPad${c.id === selectedId ? ' sel' : ''}" data-pad="${c.id}" title="${c.name}">${padIcon(c)} ${c.name || ('Canal ' + (i + 1))}</div>`
  ).join('');
  return `<div class="pvGrid">${pads}<div class="pvPad add" data-addpad title="Añadir canal">＋ AÑADIR</div></div>`;
}
