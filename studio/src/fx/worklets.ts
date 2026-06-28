// studio/src/fx/worklets.ts
// Carga (una sola vez) los módulos AudioWorklet. Debe resolverse antes de crear sus AudioWorkletNode.
// La referencia vía new URL(...) hace que Vite emita el procesador como chunk independiente.
let ready: Promise<void> | null = null;

export function ensureWorklets(actx: AudioContext): Promise<void> {
  if (!ready) {
    const url = new URL('./effects/worklets/pitch-processor.ts', import.meta.url);
    ready = actx.audioWorklet.addModule(url.href);
  }
  return ready;
}
