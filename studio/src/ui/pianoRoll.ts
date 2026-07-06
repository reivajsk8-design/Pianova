// studio/src/ui/pianoRoll.ts
// Mini piano-roll por canal: filas = notas (~2 octavas), columnas = pasos. Monofónico por paso, con LONGITUD
// FRACCIONARIA: una nota empieza en un paso y dura `len` pasos (múltiplos de 1/4), y se dibuja como BARRA
// proporcional sobre las celdas. Clic = nota de 1 paso; arrastrar el borde alarga o ACORTA (mín. 1/4); clic
// sobre una nota la borra. Resalta la escala (informativo).
import type { Step } from '../daw/model';
import { MIN_LEN, snapLen } from '../daw/model';
import { inScale, noteName } from '../daw/scales';

const ROWS = 24;                            // ~2 octavas visibles
const BLACK = new Set([1, 3, 6, 8, 10]);    // clases de nota negras

export interface PianoRollUI {
  setPlayhead(step: number): void;
  setLiveNotes(notes: number[], focus?: number): void;
}

export function mountPianoRoll(
  root: HTMLElement,
  opts: {
    total: number; lowMidi: number; scaleRoot: number; scaleType: string; beatEvery?: number;
    getStep: (i: number) => Step | undefined;
    onPaint: (start: number, len: number, midi: number) => void;   // colocar/alargar/acortar
    onClear: (headIndex: number) => void;                          // borrar la nota cuyo head está aquí
    onRange: (lowMidi: number) => void;
  }
): PianoRollUI {
  let low = Math.max(0, Math.min(127 - ROWS, opts.lowMidi));
  let live = new Set<number>();
  // Arrastre en curso: cabeza ancla, fila, si empezó sobre una nota, x inicial, largo actual, si hubo arrastre.
  let ds: { anchor: number; startM: number; onNote: boolean; downX: number; len: number; moved: boolean; cellsEl: HTMLElement } | null = null;

  // Largo efectivo (clamp mín/fin) de la nota que empieza en la celda `i`.
  const barLen = (st: Step, i: number): number => Math.max(MIN_LEN, Math.min(st.len ?? 1, opts.total - i));

  function rowCells(midi: number): string {
    let cells = '';
    for (let i = 0; i < opts.total; i++) {
      cells += `<div class="prCell${i % (opts.beatEvery ?? 4) === 0 ? ' beat' : ''}" data-i="${i}" data-m="${midi}"></div>`;
    }
    return cells;
  }
  // Barras de nota de la fila (capa superpuesta, no interactiva): left/width en % del ancho de la fila.
  function noteBars(midi: number): string {
    let bars = '';
    for (let i = 0; i < opts.total; i++) {
      const st = opts.getStep(i);
      if (st && st.on && (st.note ?? 60) === midi) {
        const len = barLen(st, i);
        bars += `<div class="prNote" style="left:${i / opts.total * 100}%;width:${len / opts.total * 100}%"></div>`;
      }
    }
    return bars;
  }

  // Posición fraccionaria (en pasos) del puntero dentro de una fila de celdas.
  function posAt(cellsEl: HTMLElement, clientX: number): number {
    const r = cellsEl.getBoundingClientRect();
    const p = (clientX - r.left) / (r.width / opts.total);
    return Math.max(0, Math.min(opts.total, p));
  }
  // Cabeza (celda con nota de la fila `midi`) que cubre la posición fraccionaria `posX`, o null.
  function headAt(midi: number, posX: number): number | null {
    for (let i = 0; i < opts.total; i++) {
      const st = opts.getStep(i);
      if (st && st.on && (st.note ?? 60) === midi && posX >= i && posX < i + barLen(st, i)) return i;
    }
    return null;
  }

  function draw(): void {
    let rows = '';
    for (let r = 0; r < ROWS; r++) {
      const midi = low + (ROWS - 1 - r);                 // agudo arriba, grave abajo
      const cls = (BLACK.has(((midi % 12) + 12) % 12) ? ' black' : '') +
                  ((opts.scaleType !== 'chromatic' && inScale(midi, opts.scaleRoot, opts.scaleType)) ? ' inscale' : '');
      const liveCls = live.has(midi) ? ' live' : '';
      rows += `<div class="prRow${cls}${liveCls}" data-m="${midi}"><span class="prLabel">${noteName(midi)}</span><div class="prCells">${rowCells(midi)}${noteBars(midi)}</div></div>`;
    }
    root.innerHTML = `<div class="pr">
      <div class="prTools">
        <button class="chBtn" id="prUp" title="Subir una octava">▲</button>
        <button class="chBtn" id="prDown" title="Bajar una octava">▼</button>
        <span class="prHint muted">clic = nota de 1 paso · arrastra el borde para alargar o acortar · clic en la nota para borrar</span>
      </div>
      <div class="prGrid">${rows}</div>
    </div>`;

    (root.querySelector('#prUp') as HTMLButtonElement).addEventListener('click', () => {
      low = Math.min(127 - ROWS, low + 12); opts.onRange(low); draw();
    });
    (root.querySelector('#prDown') as HTMLButtonElement).addEventListener('click', () => {
      low = Math.max(0, low - 12); opts.onRange(low); draw();
    });

    const grid = root.querySelector('.prGrid') as HTMLElement;
    const clearPreview = (): void => grid.querySelectorAll('.prNote.preview').forEach(el => el.remove());
    const showPreview = (m: number, anchor: number, len: number): void => {
      clearPreview();
      const cells = grid.querySelector(`.prRow[data-m="${m}"] .prCells`) as HTMLElement | null;
      if (!cells) return;
      const bar = document.createElement('div');
      bar.className = 'prNote preview';
      bar.style.left = anchor / opts.total * 100 + '%';
      bar.style.width = len / opts.total * 100 + '%';
      cells.appendChild(bar);
    };

    grid.addEventListener('pointerdown', e => {
      const cellEl = (e.target as HTMLElement).closest('.prCell') as HTMLElement | null; if (!cellEl) return;
      const m = +(cellEl.dataset.m ?? '60');
      const cellsEl = cellEl.parentElement as HTMLElement;
      const c = +(cellEl.dataset.i ?? '0');
      const head = headAt(m, posAt(cellsEl, e.clientX));
      const hs = head != null ? opts.getStep(head) : undefined;
      ds = {
        anchor: head ?? c, startM: m, onNote: head != null, downX: e.clientX,
        len: hs ? barLen(hs, head as number) : 1, moved: false, cellsEl
      };
      try { grid.setPointerCapture(e.pointerId); } catch { /* ya */ }
    });
    grid.addEventListener('pointermove', e => {
      if (!ds) return;
      if (!ds.moved && Math.abs(e.clientX - ds.downX) < 4) return;   // umbral: distingue clic de arrastre
      ds.moved = true;
      ds.len = Math.max(MIN_LEN, Math.min(snapLen(posAt(ds.cellsEl, e.clientX) - ds.anchor), opts.total - ds.anchor));
      showPreview(ds.startM, ds.anchor, ds.len);
    });
    const finish = (e: PointerEvent): void => {
      if (!ds) return; const d = ds; ds = null; clearPreview();
      try { grid.releasePointerCapture(e.pointerId); } catch { /* ya */ }
      if (!d.moved) {
        if (d.onNote) opts.onClear(d.anchor);              // clic en nota → borrar
        else opts.onPaint(d.anchor, 1, d.startM);           // clic en hueco → nota de 1 paso
      } else opts.onPaint(d.anchor, d.len, d.startM);        // arrastre → alarga/acorta desde la cabeza
      draw();
    };
    grid.addEventListener('pointerup', finish);
    grid.addEventListener('pointercancel', finish);
  }
  draw();

  return {
    setPlayhead(step: number): void {
      root.querySelectorAll<HTMLElement>('.prCell.play').forEach(c => c.classList.remove('play'));
      if (step >= 0) root.querySelectorAll<HTMLElement>(`.prCell[data-i="${step}"]`).forEach(c => c.classList.add('play'));
    },
    setLiveNotes(notes: number[], focus?: number): void {
      live = new Set(notes);
      if (focus != null && (focus < low || focus > low + ROWS - 1)) {
        low = Math.max(0, Math.min(127 - ROWS, 12 * Math.floor(focus / 12) - 12));
        opts.onRange(low); draw(); return;
      }
      root.querySelectorAll<HTMLElement>('.prRow').forEach(rowEl =>
        rowEl.classList.toggle('live', live.has(+(rowEl.dataset.m ?? '-1'))));
    }
  };
}
