// Transporte + secuenciador de pasos: planificación de adelanto sobre el reloj de audio.
import { Transport } from '../audio/transport';

// Pasos cuyo beat cae en [fromBeat, toBeat). `stepsPerBeat` p. ej. 4 (semicorcheas); `totalSteps` = compás.
// El patrón se repite cada totalSteps pasos; `step` es el índice dentro del patrón (con envoltura).
export function dueSteps(fromBeat: number, toBeat: number, totalSteps: number, stepsPerBeat: number): { step: number; beat: number }[] {
  const out: { step: number; beat: number }[] = [];
  const stepBeat = 1 / stepsPerBeat;
  const firstG = Math.ceil(fromBeat / stepBeat - 1e-9);
  for (let g = firstG; g * stepBeat < toBeat - 1e-9; g++) {
    const beat = g * stepBeat + 0; // elimina -0
    out.push({ step: ((g % totalSteps) + totalSteps) % totalSteps, beat });
  }
  return out;
}

export interface Sequencer {
  play(): void;
  stop(): void;
  isPlaying(): boolean;
  setBpm(bpm: number): void;
}

const LOOKAHEAD_SEC = 0.1;   // cuánto se agenda por delante (segundos)
const TICK_MS = 25;          // cada cuánto corre el planificador

export function makeSequencer(
  transport: Transport,
  opts: { stepsPerBeat: number; getTotalSteps: () => number; onStep: (step: number, when: number) => void }
): Sequencer {
  let timer: number | null = null;
  let lastBeat = 0;

  function tick(): void {
    const ahead = transport.beatNow() + LOOKAHEAD_SEC * (transport.bpm / 60);
    if (ahead <= lastBeat) return;
    for (const { step, beat } of dueSteps(lastBeat, ahead, opts.getTotalSteps(), opts.stepsPerBeat)) {
      opts.onStep(step, transport.timeForBeat(beat));
    }
    lastBeat = ahead;
  }

  return {
    play() {
      if (timer != null) return;
      transport.anchor(0, transport.bpm);
      lastBeat = 0;
      timer = globalThis.setInterval(tick, TICK_MS) as unknown as number;
      tick();
    },
    stop() { if (timer != null) { globalThis.clearInterval(timer); timer = null; } },
    isPlaying() { return timer != null; },
    setBpm(bpm) { transport.setBpm(bpm); }
  };
}

// Retardo de swing (segundos) para un paso: los pasos impares (la "contra") se retrasan swing·secPerStep.
export function swingOffset(step: number, swing: number, secPerStep: number): number {
  return step % 2 === 1 ? swing * secPerStep : 0;
}
