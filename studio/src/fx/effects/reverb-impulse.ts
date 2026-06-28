// Generación pura (testeable) del impulso de reverb: ruido con caída exponencial. PRNG con semilla.

// PRNG mulberry32: determinista, [0,1). Permite impulsos reproducibles (y testeables).
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Muestras del impulso: ruido en [-1,1] multiplicado por una envolvente de caída.
// `decay` mayor = cola más corta (la envolvente cae más rápido).
export function impulseSamples(length: number, decay: number, seed = 1): Float32Array {
  const out = new Float32Array(length);
  const rnd = mulberry32(seed);
  for (let i = 0; i < length; i++) {
    const env = Math.pow(1 - i / length, decay);
    out[i] = (rnd() * 2 - 1) * env;
  }
  return out;
}
