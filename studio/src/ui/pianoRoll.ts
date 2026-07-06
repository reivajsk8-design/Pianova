// studio/src/ui/pianoRoll.ts
// Mini piano-roll por canal: filas = notas (~2 octavas), columnas = pasos. Monofónico por paso.
// Clic pone/mueve/borra la nota del paso; resalta las filas de la escala (informativo). Cabezal por columna.
import type { Step } from '../daw/model';
import { inScale, noteName } from '../daw/scales';

const ROWS = 24;                    // ~2 octavas visibles
const BLACK = new Set([1, 3, 6, 8, 10]);   // clases de nota negras

export interface PianoRollUI {
  setPlayhead(step: number): void;
  setLiveNotes(notes: number[], focus?: number): void;   // resalta las filas de las notas tocadas en vivo
}

export function mountPianoRoll(
  root: HTMLElement,
  opts: {
    total: number; lowMidi: number; scaleRoot: number; scaleType: string;
    getStep: (i: number) => Step | undefined;
    onSetNote: (i: number, midi: number | null) => void;
    onRange: (lowMidi: number) => void;
  }
): PianoRollUI {
  let low = Math.max(0, Math.min(127 - ROWS, opts.lowMidi));
  let live = new Set<number>();       // notas tocadas en vivo ahora (para sombrear su fila)

  function draw(): void {
    let rows = '';
    for (let r = 0; r < ROWS; r++) {
      const midi = low + (ROWS - 1 - r);                 // agudo arriba, grave abajo
      // En cromática no hay escala que marcar (todo entra) → no se resalta nada, solo con una escala real.
      const cls = (BLACK.has(((midi % 12) + 12) % 12) ? ' black' : '') +
                  ((opts.scaleType !== 'chromatic' && inScale(midi, opts.scaleRoot, opts.scaleType)) ? ' inscale' : '');
      let cells = '';
      for (let i = 0; i < opts.total; i++) {
        const st = opts.getStep(i);
        const on = !!(st && st.on && (st.note ?? 60) === midi);
        cells += `<div class="prCell${i % 4 === 0 ? ' beat' : ''}${on ? ' on' : ''}" data-i="${i}" data-m="${midi}"></div>`;
      }
      const liveCls = live.has(midi) ? ' live' : '';
      rows += `<div class="prRow${cls}${liveCls}" data-m="${midi}"><span class="prLabel">${noteName(midi)}</span><div class="prCells">${cells}</div></div>`;
    }
    root.innerHTML = `<div class="pr">
      <div class="prTools">
        <button class="chBtn" id="prUp" title="Subir una octava">▲</button>
        <button class="chBtn" id="prDown" title="Bajar una octava">▼</button>
        <span class="prHint muted">clic pone/mueve la nota del paso · clic en la nota puesta la borra</span>
      </div>
      <div class="prGrid">${rows}</div>
    </div>`;

    (root.querySelector('#prUp') as HTMLButtonElement).addEventListener('click', () => {
      low = Math.min(127 - ROWS, low + 12); opts.onRange(low); draw();
    });
    (root.querySelector('#prDown') as HTMLButtonElement).addEventListener('click', () => {
      low = Math.max(0, low - 12); opts.onRange(low); draw();
    });
    root.querySelectorAll<HTMLElement>('.prCell').forEach(c => {
      c.addEventListener('click', () => {
        const i = +(c.dataset.i ?? '0'), m = +(c.dataset.m ?? '60');
        opts.onSetNote(i, c.classList.contains('on') ? null : m);   // ya puesta → borrar; si no → poner
        draw();
      });
    });
  }
  draw();

  return {
    setPlayhead(step: number): void {
      root.querySelectorAll<HTMLElement>('.prCell.play').forEach(c => c.classList.remove('play'));
      if (step >= 0) root.querySelectorAll<HTMLElement>(`.prCell[data-i="${step}"]`).forEach(c => c.classList.add('play'));
    },
    setLiveNotes(notes: number[], focus?: number): void {
      live = new Set(notes);
      // Si la nota recién pulsada (focus) queda fuera de la vista, desplaza a su octava y redibuja.
      if (focus != null && (focus < low || focus > low + ROWS - 1)) {
        low = Math.max(0, Math.min(127 - ROWS, 12 * Math.floor(focus / 12) - 12));
        opts.onRange(low); draw(); return;
      }
      // Si no hay que desplazar, alterna el sombreado en las filas visibles (sin redibujar todo).
      root.querySelectorAll<HTMLElement>('.prRow').forEach(rowEl =>
        rowEl.classList.toggle('live', live.has(+(rowEl.dataset.m ?? '-1'))));
    }
  };
}
