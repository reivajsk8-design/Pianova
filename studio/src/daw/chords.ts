// Acordes comunes para la herramienta de acorde del piano-roll. Intervalos en semitonos desde la raíz.

export interface ChordDef { label: string; intervals: number[] }

export const CHORDS: Record<string, ChordDef> = {
  none:  { label: '—',     intervals: [0] },
  maj:   { label: 'Mayor', intervals: [0, 4, 7] },
  min:   { label: 'Menor', intervals: [0, 3, 7] },
  dom7:  { label: '7ª',    intervals: [0, 4, 7, 10] },
  maj7:  { label: 'Maj7',  intervals: [0, 4, 7, 11] },
  min7:  { label: 'm7',    intervals: [0, 3, 7, 10] },
  sus2:  { label: 'Sus2',  intervals: [0, 2, 7] },
  sus4:  { label: 'Sus4',  intervals: [0, 5, 7] },
  dim:   { label: 'Dim',   intervals: [0, 3, 6] },
  aug:   { label: 'Aum',   intervals: [0, 4, 8] },
  power: { label: '5ª',    intervals: [0, 7] },
};

// Notas MIDI del acorde desde `root`, recortadas a 0..127 y sin duplicados. Tipo desconocido o 'none' → [root].
export function chordNotes(root: number, type: string): number[] {
  const def = CHORDS[type];
  const ivs = def ? def.intervals : [0];
  const out: number[] = [];
  for (const iv of ivs) {
    const n = root + iv;
    if (n >= 0 && n <= 127 && !out.includes(n)) out.push(n);
  }
  return out.length ? out : (root >= 0 && root <= 127 ? [root] : []);
}
