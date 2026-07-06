// studio/src/ui/pianoRoll.ts
// Mini piano-roll por canal: filas = notas (~2 octavas), columnas = pasos. Monofónico por paso, con LONGITUD:
// una nota empieza en un paso y ocupa `len` pasos (se dibuja como barra). Clic simple = nota de 1 paso;
// pinchar y arrastrar a la derecha = alargar; clic sobre una nota = borrarla. Resalta la escala (informativo).
import type { Step } from '../daw/model';
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
    onPaint: (start: number, len: number, midi: number) => void;   // colocar/alargar
    onClear: (headIndex: number) => void;                          // borrar la nota cuyo head está aquí
    onRange: (lowMidi: number) => void;
  }
): PianoRollUI {
  let low = Math.max(0, Math.min(127 - ROWS, opts.lowMidi));
  let live = new Set<number>();
  // Arrastre en curso: paso de inicio, nota de la fila, head bajo el inicio (o null), paso final, si hubo arrastre.
  let ds: { startI: number; startM: number; head: number | null; end: number; moved: boolean } | null = null;

  // Celdas de la fila `midi`: cabeza (.on.head) + cuerpo cubierto (.cont). data-head apunta al paso de la cabeza.
  function rowCells(midi: number): string {
    let cells = '', coverUntil = -1, coverHead = -1;
    for (let i = 0; i < opts.total; i++) {
      const st = opts.getStep(i);
      const isHead = !!(st && st.on && (st.note ?? 60) === midi);
      let cls = '';
      let head = -1;
      if (isHead) {
        const len = Math.max(1, Math.min(st!.len ?? 1, opts.total - i));
        coverUntil = i + len - 1; coverHead = i; cls = ' on head'; head = i;
      } else if (i <= coverUntil) { cls = ' cont'; head = coverHead; }
      const hAttr = head >= 0 ? ` data-head="${head}"` : '';
      cells += `<div class="prCell${i % (opts.beatEvery ?? 4) === 0 ? ' beat' : ''}${cls}" data-i="${i}" data-m="${midi}"${hAttr}></div>`;
    }
    return cells;
  }

  function draw(): void {
    let rows = '';
    for (let r = 0; r < ROWS; r++) {
      const midi = low + (ROWS - 1 - r);                 // agudo arriba, grave abajo
      const cls = (BLACK.has(((midi % 12) + 12) % 12) ? ' black' : '') +
                  ((opts.scaleType !== 'chromatic' && inScale(midi, opts.scaleRoot, opts.scaleType)) ? ' inscale' : '');
      const liveCls = live.has(midi) ? ' live' : '';
      rows += `<div class="prRow${cls}${liveCls}" data-m="${midi}"><span class="prLabel">${noteName(midi)}</span><div class="prCells">${rowCells(midi)}</div></div>`;
    }
    root.innerHTML = `<div class="pr">
      <div class="prTools">
        <button class="chBtn" id="prUp" title="Subir una octava">▲</button>
        <button class="chBtn" id="prDown" title="Bajar una octava">▼</button>
        <span class="prHint muted">clic = nota de 1 paso · arrastra ▸ para alargar · clic en la nota para borrar</span>
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
    const clearPreview = (): void => grid.querySelectorAll('.prCell.pvsel').forEach(c => c.classList.remove('pvsel'));
    const showPreview = (m: number, from: number, to: number): void => {
      clearPreview();
      grid.querySelectorAll<HTMLElement>(`.prCell[data-m="${m}"]`).forEach(c => {
        const i = +(c.dataset.i ?? '-1'); if (i >= from && i <= to) c.classList.add('pvsel');
      });
    };
    const cellAt = (x: number, y: number): HTMLElement | null => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      return (el && el.closest('.prCell')) as HTMLElement | null;
    };

    grid.addEventListener('pointerdown', e => {
      const cell = (e.target as HTMLElement).closest('.prCell') as HTMLElement | null; if (!cell) return;
      const i = +(cell.dataset.i ?? '0'), m = +(cell.dataset.m ?? '60');
      ds = { startI: i, startM: m, head: cell.dataset.head != null ? +cell.dataset.head : null, end: i, moved: false };
      try { grid.setPointerCapture(e.pointerId); } catch { /* ya */ }
      showPreview(m, i, i);
    });
    grid.addEventListener('pointermove', e => {
      if (!ds) return;
      const cell = cellAt(e.clientX, e.clientY);
      if (!cell || +(cell.dataset.m ?? '-1') !== ds.startM) return;
      const i = +(cell.dataset.i ?? '0');
      if (i > ds.startI) { ds.end = i; ds.moved = true; }
      showPreview(ds.startM, ds.startI, Math.max(ds.startI, ds.end));
    });
    const finish = (e: PointerEvent): void => {
      if (!ds) return; const d = ds; ds = null; clearPreview();
      try { grid.releasePointerCapture(e.pointerId); } catch { /* ya */ }
      if (!d.moved) {
        if (d.head != null) opts.onClear(d.head);         // tocar una nota (cabeza o cuerpo) → borrar
        else opts.onPaint(d.startI, 1, d.startM);          // tocar hueco → nota de 1 paso
      } else { const s = d.head ?? d.startI; opts.onPaint(s, d.end - s + 1, d.startM); }   // arrastre → alarga desde la cabeza
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
