// Motor del sinte editable: mezcla de ondas + sub + unison -> ADSR -> filtro LP/BP -> dest, con LFO opcional.
import { ensureAudio } from './context';
import { masterDest } from './masterBus';
import { SynthxParams, unisonDetunes, subFreqRatio } from './synthx-dsp';

interface Built { g: GainNode; oscs: OscillatorNode[]; lfo: OscillatorNode | null; }

// Construye osciladores + filtro + LFO hacia `dest`, devuelve el gain de envolvente y los nodos a parar.
function buildVoice(actx: AudioContext, p: SynthxParams, freq: number, at: number, dest: AudioNode): Built {
  const g = actx.createGain();
  const filt = actx.createBiquadFilter();
  filt.type = p.filterType === 'bandpass' ? 'bandpass' : 'lowpass';
  filt.frequency.value = p.cutoff; filt.Q.value = p.resonance;
  g.connect(filt); filt.connect(dest);

  const oscs: OscillatorNode[] = [];
  const waves: [OscillatorType, number][] = [['sine', p.sine], ['square', p.square], ['sawtooth', p.saw]];
  for (const [type, level] of waves) {
    if (!(level > 0)) continue;
    for (const cents of unisonDetunes(p.detune)) {
      const o = actx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = cents;
      const og = actx.createGain(); og.gain.value = level;
      o.connect(og); og.connect(g); oscs.push(o);
    }
  }
  if (p.sub > 0) {
    const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = freq * subFreqRatio();
    const og = actx.createGain(); og.gain.value = p.sub;
    o.connect(og); og.connect(g); oscs.push(o);
  }

  let lfo: OscillatorNode | null = null;
  if (p.lfoDest !== 'off') {
    lfo = actx.createOscillator(); lfo.frequency.value = p.lfoRate;
    const depth = actx.createGain();
    if (p.lfoDest === 'pitch') { depth.gain.value = p.lfoDepth * 50; oscs.forEach(o => depth.connect(o.detune)); }
    else { depth.gain.value = p.lfoDepth * p.cutoff; depth.connect(filt.frequency); }
    lfo.connect(depth); lfo.start(at);
  }
  oscs.forEach(o => o.start(at));
  return { g, oscs, lfo };
}

// Disparo agendado (secuenciador): ADSR con gate `dur`, luego release; para todo al final.
export function triggerSynthx(actx: AudioContext, p: SynthxParams, midi: number, vel: number, when: number, dur: number, dest: AudioNode): void {
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const out = dest ?? masterDest();
  const { g, oscs, lfo } = buildVoice(actx, p, freq, when, out);
  const peak = Math.max(0.0002, (0.16 + 0.22 * vel));
  const sus = Math.max(0.0001, peak * p.sustain);
  const a = Math.max(0.001, p.attack), d = Math.max(0.001, p.decay), rel = Math.max(0.02, p.release);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + a);
  g.gain.exponentialRampToValueAtTime(sus, when + a + d);
  const gateEnd = when + Math.max(dur, a + d);
  g.gain.setValueAtTime(Math.max(0.0001, sus), gateEnd);
  g.gain.exponentialRampToValueAtTime(0.0001, gateEnd + rel);
  const stopAt = gateEnd + rel + 0.03;
  oscs.forEach(o => o.stop(stopAt));
  if (lfo) lfo.stop(stopAt);
}

// --- Voz viva (teclado): sostiene en el nivel de sustain hasta noteOff ---
interface Live { g: GainNode; oscs: OscillatorNode[]; lfo: OscillatorNode | null; release: number; }
const liveVoices: Record<number, Live> = {};

export function noteOnSynthx(p: SynthxParams, midi: number, vel: number, dest: AudioNode): void {
  const actx = ensureAudio();
  if (liveVoices[midi]) noteOffSynthx(midi);
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const t = actx.currentTime;
  const { g, oscs, lfo } = buildVoice(actx, p, freq, t, dest ?? masterDest());
  const peak = Math.max(0.0002, (0.16 + 0.22 * vel));
  const sus = Math.max(0.0001, peak * p.sustain);
  const a = Math.max(0.001, p.attack), d = Math.max(0.001, p.decay);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(sus, t + a + d);
  liveVoices[midi] = { g, oscs, lfo, release: Math.max(0.02, p.release) };
}

export function noteOffSynthx(midi: number): void {
  const v = liveVoices[midi]; if (!v) return;
  const actx = ensureAudio();
  const t = actx.currentTime;
  try {
    const cur = v.g.gain.value;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setValueAtTime(Math.max(cur, 0.0001), t);
    v.g.gain.exponentialRampToValueAtTime(0.0001, t + v.release);
  } catch { /* ignora */ }
  const stopAt = t + v.release + 0.03;
  v.oscs.forEach(o => { try { o.stop(stopAt); } catch { /* ya */ } });
  if (v.lfo) { try { v.lfo.stop(stopAt); } catch { /* ya */ } }
  delete liveVoices[midi];
}
