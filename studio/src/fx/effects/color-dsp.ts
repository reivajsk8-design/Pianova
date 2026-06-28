// DSP puro de color/saturación (curvas de waveshaping y conversión de ancho de banda). Testeable.

// Muestrea fn sobre [-1,1] en n puntos → curva para WaveShaperNode.
export function makeCurve(n: number, fn: (x: number) => number): Float32Array {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
  return c;
}

// Saturación tipo válvula: asimétrica (warmth añade armónicos pares). drive 0..1, warmth 0..1.
export function tubeSample(x: number, drive: number, warmth: number): number {
  const g = 1 + drive * 6;
  const bias = warmth * 0.25;
  const y = Math.tanh(g * (x + bias)) - Math.tanh(g * bias);   // resta el DC del bias
  return y / (1 + drive * 1.5);                                 // compensación de nivel aprox.
}

// Refuerzo sigmoide simétrico (logística mapeada a [-1,1]). drive 0..1 = pendiente.
export function sigmoidSample(x: number, drive: number): number {
  const k = 1 + drive * 9;
  return (2 / (1 + Math.exp(-k * x))) - 1;
}

// Ancho de banda (octavas) → Q de un filtro peaking.
export function bandwidthToQ(bw: number): number {
  const a = Math.pow(2, bw);
  return Math.sqrt(a) / (a - 1);
}
