// Batería sintetizada estilo 808: cada voz = osciladores + ruido + envolventes, agendada en `when`.
// De usar y tirar (auto-stop). La generación de ruido es pura y testeable.
import { mulberry32 } from '../fx/effects/reverb-impulse';

export const DRUM_VOICES = ['kick', 'snare', 'hatClosed', 'hatOpen', 'clap', 'tom'] as const;
export type DrumVoice = typeof DRUM_VOICES[number];

export const DRUM_LABELS: Record<DrumVoice, string> = {
  kick: '🥁 Bombo', snare: '🪘 Caja', hatClosed: '🎩 Charles cerrado',
  hatOpen: '🎩 Charles abierto', clap: '👏 Clap', tom: '🛢️ Tom'
};

// Ruido blanco [-1,1] con semilla (determinista, testeable).
export function whiteNoiseSamples(n: number, seed = 1): Float32Array {
  const out = new Float32Array(n);
  const rnd = mulberry32(seed);
  for (let i = 0; i < n; i++) out[i] = rnd() * 2 - 1;
  return out;
}

let _noiseBuf: AudioBuffer | null = null;
function noiseBuffer(actx: AudioContext): AudioBuffer {
  if (!_noiseBuf || _noiseBuf.length !== actx.sampleRate) {
    const n = actx.sampleRate;   // 1 s de ruido en bucle/recorte
    _noiseBuf = actx.createBuffer(1, n, actx.sampleRate);
    const data = _noiseBuf.getChannelData(0);
    const s = whiteNoiseSamples(n, 1);
    for (let i = 0; i < n; i++) data[i] = s[i];
  }
  return _noiseBuf;
}

// Dispara una voz de batería en el tiempo de audio `when` hacia `dest`. `vel` 0..1 escala el pico.
export function triggerDrum(actx: AudioContext, dest: AudioNode, voice: DrumVoice, when: number, vel = 0.9): void {
  const v = Math.max(0.05, vel);
  const peak = (p: number): number => Math.max(0.0002, p * v);

  if (voice === 'kick' || voice === 'tom') {
    const o = actx.createOscillator(); o.type = 'sine';
    const g = actx.createGain();
    const f0 = voice === 'kick' ? 150 : 200, f1 = voice === 'kick' ? 50 : 90;
    const pf = voice === 'kick' ? 0.08 : 0.12, dur = voice === 'kick' ? 0.28 : 0.3, amp = voice === 'kick' ? 1.0 : 0.8;
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(f1, when + pf);
    g.gain.setValueAtTime(peak(amp), when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(dest);
    o.start(when); o.stop(when + dur + 0.04);
    return;
  }

  if (voice === 'snare') {
    // cuerpo tonal
    const o = actx.createOscillator(); o.type = 'triangle'; o.frequency.value = 180;
    const og = actx.createGain();
    og.gain.setValueAtTime(peak(0.5), when);
    og.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
    o.connect(og); og.connect(dest); o.start(when); o.stop(when + 0.16);
    // ruido (banda media)
    const n = actx.createBufferSource(); n.buffer = noiseBuffer(actx);
    const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.7;
    const ng = actx.createGain();
    ng.gain.setValueAtTime(peak(0.7), when);
    ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
    n.connect(bp); bp.connect(ng); ng.connect(dest); n.start(when); n.stop(when + 0.2);
    return;
  }

  // charles (cerrado/abierto) y clap = ruido filtrado con distinta duración
  const n = actx.createBufferSource(); n.buffer = noiseBuffer(actx);
  const f = actx.createBiquadFilter();
  const g = actx.createGain();
  let dur: number;
  if (voice === 'clap') { f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.8; dur = 0.12; }
  else { f.type = 'highpass'; f.frequency.value = 7000; dur = voice === 'hatOpen' ? 0.3 : 0.045; }
  g.gain.setValueAtTime(peak(0.6), when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  n.connect(f); f.connect(g); g.connect(dest); n.start(when); n.stop(when + dur + 0.02);
}
