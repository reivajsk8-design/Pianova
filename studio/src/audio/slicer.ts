// Reproduce un slice de un AudioBuffer (recorte inicio/fin, ganancia, fades, reverse). Agendado en `when`.
import { ensureAudio } from './context';
import { masterDest } from './masterBus';
import type { SliceDef } from '../daw/slicing';

const reverseCache = new WeakMap<AudioBuffer, AudioBuffer>();

// Devuelve una copia invertida del buffer (cacheada) — Web Audio no admite playbackRate negativo.
function reversed(actx: AudioContext, buffer: AudioBuffer): AudioBuffer {
  const hit = reverseCache.get(buffer); if (hit) return hit;
  const out = actx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch), dst = out.getChannelData(ch), n = src.length;
    for (let i = 0; i < n; i++) dst[i] = src[n - 1 - i];
  }
  reverseCache.set(buffer, out);
  return out;
}

export function playSlice(dest: AudioNode | null, buffer: AudioBuffer, slice: SliceDef, when: number, vel: number): void {
  const actx = ensureAudio();
  const out = dest ?? masterDest();
  const dur = Math.max(0.005, slice.end - slice.start);
  const useBuf = slice.reverse ? reversed(actx, buffer) : buffer;
  const offset = slice.reverse ? Math.max(0, buffer.duration - slice.end) : slice.start;
  const src = actx.createBufferSource(); src.buffer = useBuf;
  const g = actx.createGain();
  const peak = Math.max(0.0002, slice.gain * Math.max(0.05, vel));
  const fi = Math.min(slice.fadeIn, dur / 2), fo = Math.min(slice.fadeOut, dur / 2);
  const t = when;
  g.gain.setValueAtTime(fi > 0 ? 0.0001 : peak, t);
  if (fi > 0) g.gain.linearRampToValueAtTime(peak, t + fi);
  if (fo > 0) { g.gain.setValueAtTime(peak, t + dur - fo); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
  src.connect(g); g.connect(out);
  src.start(t, offset, dur);
  src.stop(t + dur + 0.02);
}
