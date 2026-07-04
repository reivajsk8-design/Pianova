// studio/src/ui/padGrid.ts
// Rejilla de pads del rediseño PIANOVA STUDIO: un pad por canal (= sonido), seleccionable.
import type { ChannelState } from '../daw/model';

export function padGridHTML(channels: ChannelState[], selectedId: string): string {
  const pads = channels.map((c, i) =>
    `<div class="pvPad${c.id === selectedId ? ' sel' : ''}" data-pad="${c.id}" title="${c.name}">${c.name || ('Canal ' + (i + 1))}</div>`
  ).join('');
  return `<div class="pvGrid">${pads}<div class="pvPad add" data-addpad title="Añadir canal">＋ AÑADIR</div></div>`;
}
