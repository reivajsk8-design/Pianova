// studio/src/ui/sampleEditor.ts
// Editor del canal slicer (pestaña SAMPLES): forma de onda + marcas editables + troceado + probar slice.
import type { SliceDef } from '../daw/slicing';

const NOTE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const noteName = (m: number): string => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

export function mountSampleEditor(
  root: HTMLElement,
  opts: {
    buffer: AudioBuffer | null; slices: SliceDef[]; base: number;
    onImport: (file: File) => void; onSliceEqual: (n: number) => void;
    onSliceOnsets: () => void; onTest: (index: number) => void;
    onSetMarks?: (marks: number[]) => void;
  }
): void {
  root.innerHTML = `<div class="smpEd">
    <div class="smpBar">
      <label class="smpBtn">Importar audio…<input id="smpFile" type="file" accept="audio/*" hidden></label>
      <button id="smpOnsets" class="smpBtn" ${opts.buffer ? '' : 'disabled'}>Por transitorios</button>
      <label class="smpBtn">En <select id="smpN"><option>8</option><option selected>16</option><option>32</option></select> iguales
        <button id="smpEqual" ${opts.buffer ? '' : 'disabled'}>Trocear</button></label>
    </div>
    ${opts.buffer ? '<canvas id="smpWave" class="smpWave" width="900" height="120"></canvas>' : '<p class="muted">Importa un audio para trocearlo en slices.</p>'}
    ${opts.buffer ? '<p class="smpHint muted">Arrastra una marca para moverla · doble-clic en un hueco para añadir · clic derecho en una marca para borrar</p>' : ''}
    <div id="smpList" class="smpList"></div>
  </div>`;

  (root.querySelector('#smpFile') as HTMLInputElement | null)?.addEventListener('change', ev => {
    const f = (ev.target as HTMLInputElement).files?.[0]; if (f) opts.onImport(f);
  });
  (root.querySelector('#smpOnsets') as HTMLButtonElement | null)?.addEventListener('click', () => opts.onSliceOnsets());
  (root.querySelector('#smpEqual') as HTMLButtonElement | null)?.addEventListener('click', () => {
    const n = +(root.querySelector('#smpN') as HTMLSelectElement).value || 16;
    opts.onSliceEqual(n);
  });

  const buffer = opts.buffer;
  const canvas = root.querySelector('#smpWave') as HTMLCanvasElement | null;
  if (buffer && canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const W = canvas.width, H = canvas.height, mid = H / 2;
      const data = buffer.getChannelData(0), N = data.length, dur = buffer.duration;
      const HIT = 6;   // px de tolerancia para "sobre una marca"
      const timeToX = (t: number): number => t / dur * W;
      const xToTime = (x: number): number => Math.max(0, Math.min(dur - 1 / buffer.sampleRate, x / W * dur));
      const relX = (e: PointerEvent | MouseEvent): number => {
        const r = canvas.getBoundingClientRect(); return (e.clientX - r.left) / r.width * W;
      };
      const marks = (): number[] => opts.slices.map(s => s.start);
      const markNear = (x: number): number => {
        const ms = marks();
        for (let i = 0; i < ms.length; i++) if (Math.abs(timeToX(ms[i]) - x) < HIT) return i;
        return -1;
      };

      // Dibuja la onda + una lista de marcas (para el redibujo en vivo durante el arrastre).
      const draw = (markList: number[]): void => {
        ctx.fillStyle = '#0c110b'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#2dff6a'; ctx.globalAlpha = 0.85; ctx.beginPath();
        for (let x = 0; x < W; x++) {
          let min = 1, max = -1; const i0 = Math.floor(x / W * N), i1 = Math.floor((x + 1) / W * N);
          for (let i = i0; i < i1; i++) { const v = data[i]; if (v < min) min = v; if (v > max) max = v; }
          ctx.moveTo(x, mid + min * mid); ctx.lineTo(x, mid + max * mid);
        }
        ctx.stroke(); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff';
        for (const t of markList) {
          const x = Math.round(timeToX(t)) + 0.5;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
      };
      draw(marks());

      let drag = -1;                 // índice de la marca que se arrastra (-1 = ninguna)
      let live: number[] | null = null;
      canvas.addEventListener('pointerdown', e => {
        const i = markNear(relX(e));
        if (i > 0) { drag = i; live = marks(); canvas.setPointerCapture(e.pointerId); }   // la marca 0 no se mueve
      });
      canvas.addEventListener('pointermove', e => {
        if (drag < 0 || !live) { canvas.style.cursor = markNear(relX(e)) > 0 ? 'ew-resize' : 'default'; return; }
        live[drag] = xToTime(relX(e));
        draw(live);
      });
      const endDrag = (): void => {
        if (drag >= 0 && live) opts.onSetMarks?.(live);
        drag = -1; live = null;
      };
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);
      canvas.addEventListener('dblclick', e => {
        const x = relX(e); if (markNear(x) >= 0) return;   // sobre una marca: no añadir
        opts.onSetMarks?.([...marks(), xToTime(x)]);
      });
      canvas.addEventListener('contextmenu', e => {
        e.preventDefault();
        const i = markNear(relX(e));
        if (i > 0) { const ms = marks(); ms.splice(i, 1); opts.onSetMarks?.(ms); }   // borrar (no la marca 0)
      });
    }
  }

  const list = root.querySelector('#smpList') as HTMLElement;
  list.innerHTML = opts.slices.map((s, i) =>
    `<button class="smpSlice" data-i="${i}" title="Probar">▶ ${i + 1} · ${noteName(opts.base + i)}</button>`).join('')
    || (buffer ? '<p class="muted">Pulsa "Trocear" para crear los slices.</p>' : '');
  list.querySelectorAll<HTMLButtonElement>('.smpSlice').forEach(b =>
    b.addEventListener('click', () => opts.onTest(+(b.dataset.i ?? '0'))));
}
