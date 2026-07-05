// Suaviza el cambio de un AudioParam para evitar el "zipper noise" (rasgueo/clic) al arrastrar un knob.
// setTargetAtTime hace una transición exponencial suave hacia `value` (constante de tiempo `tc`).
export function ramp(param: AudioParam, value: number, actx: AudioContext, tc = 0.01): void {
  param.setTargetAtTime(value, actx.currentTime, tc);
}
