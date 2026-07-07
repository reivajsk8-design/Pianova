// Canal de audio del groovebox: instrumentBus -> [rack del canal] -> gain (vol/mute) -> pan -> masterIn.
// Es el espejo vivo del ChannelState; el modelo (daw/model) sigue siendo la fuente de verdad de los datos.
import { createRack, Rack } from '../fx/rack';
import * as synth from '../audio/synth';
import { triggerDrum, DrumVoice } from '../audio/drums';
import { triggerSynthx } from '../audio/synthx';
import { playSlice } from '../audio/slicer';
import { getSample } from '../audio/sampleStore';
import { sliceIndexForNote } from './slicing';
import type { ChannelState, InstrumentSpec } from './model';
import type { RackState } from '../fx/rack-core';

export interface Channel {
  id: string;
  instrumentBus: GainNode;
  rack: Rack;
  setInstrument(spec: InstrumentSpec): void;
  setVolume(v: number): void;
  setPan(p: number): void;
  setAudible(a: boolean): void;
  trigger(note: number, vel: number, when: number, gate?: number): void;
  getLevel(): number;
  serializeRack(): RackState;
  dispose(): void;
}

export function makeChannel(actx: AudioContext, state: ChannelState, masterIn: AudioNode): Channel {
  const instrumentBus = actx.createGain();
  const gain = actx.createGain();
  const panner = actx.createStereoPanner(); panner.pan.value = state.pan;
  const rack = createRack(actx, instrumentBus, gain);   // instrumentBus -> [rack] -> gain
  gain.connect(panner); panner.connect(masterIn);
  const analyser = actx.createAnalyser(); analyser.fftSize = 256;
  gain.connect(analyser);   // tap post-fader (paralelo, sin salida → no afecta al sonido)
  const meterBuf = new Float32Array(analyser.fftSize);
  rack.restore(state.rack);

  let volume = state.volume;
  let audible = true;
  let instrument: InstrumentSpec = state.instrument;
  const applyGain = (): void => { gain.gain.value = audible ? volume : 0; };
  applyGain();

  return {
    id: state.id, instrumentBus, rack,
    setInstrument(spec) { instrument = spec; },
    setVolume(v) { volume = v; applyGain(); },
    setPan(p) { panner.pan.value = p; },
    setAudible(a) { audible = a; applyGain(); },
    trigger(note, vel, when, gate) {
      if (instrument.kind === 'drum') triggerDrum(actx, instrumentBus, instrument.voice as DrumVoice, when, vel);
      else if (instrument.kind === 'synthx') triggerSynthx(actx, instrument.params, note, vel, when, gate ?? 0.12, instrumentBus);
      else if (instrument.kind === 'slicer') {
        const s = getSample(instrument.sampleId);
        const idx = sliceIndexForNote(instrument.base, instrument.slices.length, note);
        if (s && s.buffer && idx >= 0) playSlice(instrumentBus, s.buffer, instrument.slices[idx], when, vel, gate);
      }
      else synth.triggerPreset(instrument.preset, note, vel, when, gate ?? 0.12, instrumentBus);
    },
    getLevel(): number {
      analyser.getFloatTimeDomainData(meterBuf as Float32Array<ArrayBuffer>);
      let peak = 0;
      for (let i = 0; i < meterBuf.length; i++) { const a = Math.abs(meterBuf[i]); if (a > peak) peak = a; }
      return peak;
    },
    serializeRack: () => rack.serialize(),
    dispose() {
      rack.dispose();
      for (const n of [instrumentBus, gain, panner, analyser]) { try { n.disconnect(); } catch { /* ya */ } }
    }
  };
}
