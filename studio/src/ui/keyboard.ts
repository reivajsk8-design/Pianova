// Mapa de teclas del ordenador -> semitono (offset desde baseMidi). Portado de pianova.html.
export const KEY_TO_SEMITONE: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12
};

const WHITE = [0, 2, 4, 5, 7, 9, 11];   // semitonos de teclas blancas dentro de la octava
function isBlack(midi: number): boolean { return !WHITE.includes(((midi % 12) + 12) % 12); }

export interface KeyboardOpts {
  onNoteOn(midi: number, vel: number): void;
  onNoteOff(midi: number): void;
  lowMidi: number; highMidi: number; baseMidi: number;
}

// Dibuja un teclado clicable (ratón/táctil) + teclas del ordenador. Devuelve cleanup().
export function mountKeyboard(root: HTMLElement, opts: KeyboardOpts): () => void {
  const { onNoteOn, onNoteOff, lowMidi, highMidi, baseMidi } = opts;
  root.innerHTML = '';
  const kb = document.createElement('div'); kb.className = 'kb';
  const whites: number[] = [];
  for (let m = lowMidi; m <= highMidi; m++) if (!isBlack(m)) whites.push(m);
  kb.style.setProperty('--whites', String(whites.length));
  // teclas blancas
  whites.forEach(m => {
    const k = document.createElement('div'); k.className = 'kb-key kb-white'; k.dataset.midi = String(m);
    kb.appendChild(k);
  });
  // teclas negras (posicionadas sobre el hueco)
  for (let m = lowMidi; m <= highMidi; m++) {
    if (!isBlack(m)) continue;
    const leftWhiteIdx = whites.filter(w => w < m).length;   // nº de blancas a su izquierda
    const k = document.createElement('div'); k.className = 'kb-key kb-black'; k.dataset.midi = String(m);
    k.style.left = `calc(${leftWhiteIdx} * (100% / var(--whites)) - (100% / var(--whites)) * 0.3)`;
    kb.appendChild(k);
  }
  root.appendChild(kb);

  const down = (el: Element) => { const m = +(el as HTMLElement).dataset.midi!; el.classList.add('on'); onNoteOn(m, 0.85); };
  const up = (el: Element) => { const m = +(el as HTMLElement).dataset.midi!; el.classList.remove('on'); onNoteOff(m); };
  kb.addEventListener('pointerdown', e => { const t = e.target as HTMLElement; if (t.dataset.midi) { down(t); t.setPointerCapture?.(e.pointerId); } });
  kb.addEventListener('pointerup', e => { const t = e.target as HTMLElement; if (t.dataset.midi) up(t); });
  kb.addEventListener('pointerleave', e => { const t = e.target as HTMLElement; if (t.dataset.midi) up(t); });
  kb.addEventListener('pointercancel', e => { const t = e.target as HTMLElement; if (t.dataset.midi) up(t); }); // móvil: el navegador toma el control del gesto

  // teclas del ordenador (sin auto-repetición)
  const pressed = new Set<string>();
  const keyEl = (midi: number) => kb.querySelector<HTMLElement>(`[data-midi="${midi}"]`);
  const onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (!(key in KEY_TO_SEMITONE) || pressed.has(key) || e.repeat) return;
    pressed.add(key); const midi = baseMidi + KEY_TO_SEMITONE[key];
    keyEl(midi)?.classList.add('on'); onNoteOn(midi, 0.85);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (!(key in KEY_TO_SEMITONE) || !pressed.has(key)) return;
    pressed.delete(key); const midi = baseMidi + KEY_TO_SEMITONE[key];
    keyEl(midi)?.classList.remove('on'); onNoteOff(midi);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
}
