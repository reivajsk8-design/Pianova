// studio/src/daw/scales.ts
// Escalas musicales (puro, testeable): mapa tipo → clases de nota (0–11) + pertenencia a la escala.
// Portado de pianova.html (PR_SCALES / prInScale).

export const SCALES: Record<string, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentaMajor: [0, 2, 4, 7, 9],
  pentaMinor: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10]
};

export const SCALE_LABELS: Record<string, string> = {
  chromatic: 'Cromática',
  major: 'Mayor',
  minor: 'Menor',
  pentaMajor: 'Pentatónica mayor',
  pentaMinor: 'Pentatónica menor',
  dorian: 'Dórica'
};

// ¿Pertenece la nota MIDI a la escala (root+type)? Módulo negativo tratado con (((x%12)+12)%12).
export function inScale(midi: number, root: number, type: string): boolean {
  const s = SCALES[type] ?? SCALES.chromatic;
  return s.includes((((midi - root) % 12) + 12) % 12);
}

export const NOTE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
export function noteName(midi: number): string {
  return NOTE_NAMES[(((midi % 12) + 12) % 12)] + (Math.floor(midi / 12) - 1);
}
