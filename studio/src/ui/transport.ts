// Barra de transporte: Play/Stop, BPM, Swing (knob) y Grabar (armar grabación de pasos en vivo).
import { mountKnob } from './knob';

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
    <label class="fld">Swing <div id="tbSwing"></div></label>
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
  mountKnob(root.querySelector('#tbSwing') as HTMLElement, {
    min: 0, max: 0.7, value: opts.getSwing(), default: 0, size: 34, midiId: 'swing', onChange: opts.onSwing
  });
  return { setPlaying, setRecording };
}
