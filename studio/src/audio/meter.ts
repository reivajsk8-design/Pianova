// studio/src/audio/meter.ts
// Pico lineal (0–1) → nivel 0–1 en dB para el medidor de canal: 0 dB (pico 1) = 1; por debajo de floorDb = 0.
export function meterNorm(peak: number, floorDb = 48): number {
  if (peak <= 0) return 0;
  const db = 20 * Math.log10(peak);
  return Math.max(0, Math.min(1, (db + floorDb) / floorDb));
}
