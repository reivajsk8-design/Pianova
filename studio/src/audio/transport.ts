// Reloj de transporte: la posición (en beats) se deriva de un reloj inyectable (el de audio),
// así un tirón de imagen no mueve el ritmo. Portado de pianova.html (misma lógica, ahora tipado).
export interface Transport {
  anchor(beat: number, bpm: number): void;
  beatNow(): number;
  timeForBeat(beat: number): number;
  setBpm(bpm: number): void;
  readonly bpm: number;
}

export function makeTransport(now: () => number): Transport {
  let t0 = 0, b0 = 0, _bpm = 120;
  return {
    anchor(beat, bpm) { t0 = now(); b0 = beat; _bpm = bpm; },
    beatNow() { return b0 + (now() - t0) * (_bpm / 60); },
    timeForBeat(beat) { return t0 + (beat - b0) * (60 / _bpm); },
    setBpm(bpm) { const b = this.beatNow(); t0 = now(); b0 = b; _bpm = bpm; },
    get bpm() { return _bpm; }
  };
}
