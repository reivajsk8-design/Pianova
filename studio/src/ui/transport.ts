// Barra de transporte: Play/Stop, BPM, Swing y Grabar (armar grabación de pasos en vivo).
export interface TransportUI { setPlaying(on: boolean): void; setRecording(on: boolean): void }

export function mountTransport(
  root: HTMLElement,
  opts: {
    getBpm: () => number; getSwing: () => number;
    onPlay: () => void; onStop: () => void; onBpm: (bpm: number) => void;
    onSwing: (swing: number) => void; onRecord: () => void;
  }
): TransportUI {
  root.innerHTML = `<div class="tbar">
    <button id="tbPlay" class="tbPlay" title="Reproducir / Parar">▶</button>
    <button id="tbRec" class="tbRec" title="Grabar pasos en vivo">●</button>
    <label class="fld">BPM <input id="tbBpm" type="number" min="40" max="240" step="1" value="${opts.getBpm()}"></label>
    <label class="fld">Swing <input id="tbSwing" type="range" min="0" max="0.7" step="0.01" value="${opts.getSwing()}"></label>
  </div>`;
  const play = root.querySelector('#tbPlay') as HTMLButtonElement;
  const rec = root.querySelector('#tbRec') as HTMLButtonElement;
  let playing = false;
  const setPlaying = (on: boolean) => { playing = on; play.textContent = on ? '⏹' : '▶'; play.classList.toggle('on', on); };
  const setRecording = (on: boolean) => { rec.classList.toggle('on', on); };
  play.addEventListener('click', () => { if (playing) opts.onStop(); else opts.onPlay(); });
  rec.addEventListener('click', () => opts.onRecord());
  (root.querySelector('#tbBpm') as HTMLInputElement).addEventListener('change', e => {
    opts.onBpm(Math.max(40, Math.min(240, +(e.target as HTMLInputElement).value || 120)));
  });
  (root.querySelector('#tbSwing') as HTMLInputElement).addEventListener('input', e => {
    opts.onSwing(+(e.target as HTMLInputElement).value);
  });
  return { setPlaying, setRecording };
}
