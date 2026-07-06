// Humanizar: desvío por disparo (no destructivo). A partir de una cantidad 0–1 y una fuente de aleatoriedad
// inyectable (Math.random en el motor; fija en los tests), devuelve un desvío de tiempo (dt, segundos) y de
// intensidad (dvel), ambos centrados en 0. Topes pequeños para que suene natural, no un desastre.
export const HUMANIZE_MAX_SHIFT = 0.02;   // ± segundos de desvío de tiempo a cantidad 1
export const HUMANIZE_MAX_VEL = 0.25;     // ± de velocity a cantidad 1

export function humanizeHit(amount: number, rnd: () => number): { dt: number; dvel: number } {
  const a = Math.max(0, Math.min(1, amount));
  if (a === 0) return { dt: 0, dvel: 0 };
  return {
    dt: (rnd() * 2 - 1) * HUMANIZE_MAX_SHIFT * a,
    dvel: (rnd() * 2 - 1) * HUMANIZE_MAX_VEL * a
  };
}
