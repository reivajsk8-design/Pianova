// studio/src/daw/grid.ts
// Rejilla por canal. Un reloj base fino (BASE_SUBDIV = 1/32) y cada canal a su subdivisión (2=1/8, 4=1/16,
// 8=1/32). baseFactor = cuántos ticks base dura un paso del canal; channelStepAt = qué paso del canal cae en
// un tick base (o null); channelSpan = ticks base que ocupa el canal por vuelta. Puro y testeable.
export const BASE_SUBDIV = 8;                 // pasos por negra del reloj base (1/32)
export const SUBDIVS = [2, 4, 8] as const;    // 1/8, 1/16, 1/32
export const SUBDIV_LABELS: Record<number, string> = { 2: '1/8', 4: '1/16', 8: '1/32' };

// Subdivisión válida (2/4/8); cualquier otra cosa se trata como 4 (1/16).
// Subdivisión válida (2/4/8); cualquier otra cosa se trata como 4 (1/16).
export function safeSub(subdiv: number): number {
  return subdiv === 2 || subdiv === 4 || subdiv === 8 ? subdiv : 4;
}

export function baseFactor(subdiv: number): number {
  return BASE_SUBDIV / safeSub(subdiv);
}

export function channelStepAt(t: number, subdiv: number, len: number): number | null {
  const factor = baseFactor(subdiv);
  if (t % factor !== 0) return null;
  const step = t / factor;
  return ((step % len) + len) % len;
}

export function channelSpan(len: number, subdiv: number): number {
  return len * baseFactor(subdiv);
}
