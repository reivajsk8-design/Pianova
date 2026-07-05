// Suaviza el cambio de un AudioParam para evitar el "zipper noise" (rasgueo/clic) al arrastrar un knob.
// setTargetAtTime hace una transición exponencial suave hacia `value` (constante de tiempo `tc`).
export function ramp(param: AudioParam, value: number, actx: AudioContext, tc = 0.01): void {
  param.setTargetAtTime(value, actx.currentTime, tc);
}

// Setter de tiempo de delay (en ms) con "debounce": NO barre la línea de delay en vivo mientras arrastras el
// knob (cambiar su longitud remuestrea el audio y produce un "warble" de tono = ruido). Solo aplica el cambio
// una vez cuando el knob se queda quieto ~`wait` ms, con una transición suave breve. Devuelve el setter.
export function delayTimeSetter(delayNode: DelayNode, actx: AudioContext, defaultMs: number, wait = 120): (ms: number) => void {
  let ms = defaultMs;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const apply = (): void => { ramp(delayNode.delayTime, ms / 1000, actx); timer = null; };
  return (v: number): void => { ms = v; if (timer) clearTimeout(timer); timer = setTimeout(apply, wait); };
}
