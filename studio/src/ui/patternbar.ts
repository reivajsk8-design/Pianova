// studio/src/ui/patternbar.ts
// Barra de patrones (1,2,3…) + modo canción (secuencia de patrones). Eventos por delegación (data-*).
import type { DawState } from '../daw/model';

export function patternBarHTML(daw: DawState, songMode: boolean, playingSong: number): string {
  const pats = daw.patterns.map((_, i) =>
    `<button class="patBtn${i === daw.current ? ' on' : ''}" data-pat="${i}">${i + 1}</button>`).join('');
  const chips = daw.song.length
    ? daw.song.map((p, idx) => `<span class="songChip${idx === playingSong ? ' play' : ''}">${p + 1}</span>`).join('')
    : '<span class="muted">canción vacía</span>';
  return `<div class="patBar">
    <span class="patLab">Patrón</span>${pats}
    <button class="patIcon" data-patadd title="Añadir patrón">＋</button>
    <button class="patIcon" data-patdup title="Duplicar patrón actual">⧉</button>
    <button class="patIcon" data-patdel title="Quitar patrón actual">✕</button>
    <span class="patSep"></span>
    <button class="songToggle${songMode ? ' on' : ''}" data-songtoggle title="Modo canción">🔗 Canción</button>
    <span class="songSeq">${chips}</span>
    <button class="patIcon" data-songadd title="Añadir el patrón actual a la canción">＋ patrón</button>
    <button class="patIcon" data-songclear title="Vaciar canción">limpiar</button>
  </div>`;
}
