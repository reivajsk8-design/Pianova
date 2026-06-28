// Barra de transporte: botón Play/Stop y BPM editable.
export interface TransportUI { setPlaying(on: boolean): void }

export function mountTransport(
  root: HTMLElement,
  opts: { getBpm: () => number; onPlay: () => void; onStop: () => void; onBpm: (bpm: number) => void }
): TransportUI {
  root.innerHTML = `<div class="tbar">
    <button id="tbPlay" class="tbPlay" title="Reproducir / Parar">▶</button>
    <label class="fld">BPM <input id="tbBpm" type="number" min="40" max="240" step="1" value="${opts.getBpm()}"></label>
  </div>`;
  const btn = root.querySelector('#tbPlay') as HTMLButtonElement;
  let playing = false;
  const setPlaying = (on: boolean) => { playing = on; btn.textContent = on ? '⏹' : '▶'; btn.classList.toggle('on', on); };
  btn.addEventListener('click', () => { if (playing) opts.onStop(); else opts.onPlay(); });
  (root.querySelector('#tbBpm') as HTMLInputElement).addEventListener('change', e => {
    const v = Math.max(40, Math.min(240, +(e.target as HTMLInputElement).value || 120));
    opts.onBpm(v);
  });
  return { setPlaying };
}
