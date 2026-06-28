// studio/src/fx/effects/worklets/pitch-processor.ts
// AudioWorkletProcessor: pitch shifter granular (dos lecturas con crossfade triangular sobre un buffer
// circular). Corre en el AudioWorkletGlobalScope (sin DOM): se declaran sus tipos ambientales.
import { triWindow } from '../pitch-dsp';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
interface AudioWorkletProcessorImpl {
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}
declare const AudioWorkletProcessor: { prototype: AudioWorkletProcessorImpl; new (): AudioWorkletProcessorImpl };

const BUF = 8192;     // tamaño del buffer circular (muestras)
const GRAIN = 2048;   // tamaño del grano (afecta al desfase de las dos lecturas)

// Lectura con interpolación lineal y envoltura en el buffer circular.
function readFrac(ring: Float32Array, pos: number): number {
  const n = ring.length;
  let p = pos % n; if (p < 0) p += n;
  const i0 = Math.floor(p);
  const frac = p - i0;
  const i1 = (i0 + 1) % n;
  return ring[i0] * (1 - frac) + ring[i1] * frac;
}

class PitchProcessor extends AudioWorkletProcessor {
  private rings: Float32Array[] = [];
  private w = 0;     // posición de escritura
  private ph = 0;    // fase del grano [0, GRAIN)

  static get parameterDescriptors() {
    return [{ name: 'pitch', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' as const }];
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const semis = parameters.pitch.length ? parameters.pitch[0] : 0;
    const ratio = Math.pow(2, semis / 12);
    const dphase = 1 - ratio;       // cuánto se mueve la fase del grano por muestra
    const nCh = output.length;
    while (this.rings.length < nCh) this.rings.push(new Float32Array(BUF));
    const block = output[0].length;
    for (let i = 0; i < block; i++) {
      let ph = this.ph + dphase;
      if (ph >= GRAIN) ph -= GRAIN; else if (ph < 0) ph += GRAIN;
      this.ph = ph;
      let ph2 = ph + GRAIN / 2; if (ph2 >= GRAIN) ph2 -= GRAIN;
      const g1 = triWindow(ph / GRAIN);
      const g2 = triWindow(ph2 / GRAIN);
      for (let ch = 0; ch < nCh; ch++) {
        const ring = this.rings[ch];
        const inCh = input && input[ch] ? input[ch] : (input && input[0] ? input[0] : null);
        ring[this.w % BUF] = inCh ? inCh[i] : 0;
        const r1 = this.w - ph;
        const r2 = this.w - ph2;
        output[ch][i] = g1 * readFrac(ring, r1) + g2 * readFrac(ring, r2);
      }
      this.w++;
    }
    return true;
  }
}

// Silencia la advertencia de TS sobre sampleRate no usado (es necesario en el scope del worklet).
void (sampleRate as number);

registerProcessor('pitch-processor', PitchProcessor);
