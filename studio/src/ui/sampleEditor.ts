// studio/src/ui/sampleEditor.ts
// Editor del canal slicer (pestaña SAMPLES): forma de onda + marcas + troceado + probar slice.
import type { SliceDef } from '../daw/slicing';

const NOTE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const noteName = (m: number): string => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

export function mountSampleEditor(
  root: HTMLElement,
  opts: {
    buffer: AudioBuffer | null; slices: SliceDef[]; base: number;
    onImport: (file: File) => void; onSliceEqual: (n: number) => void;
    onSliceOnsets: () => void; onTest: (index: number) => void;
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
    <div id="smpList" class="smpList"></div>
  </div>`;

  (root.querySelector('#smpFile') as HTMLInputElement).addEventListener('change', ev => {
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
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height, mid = H / 2;
    const data = buffer.getChannelData(0), N = data.length;
    ctx.fillStyle = '#0c110b'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#2dff6a'; ctx.globalAlpha = 0.85; ctx.beginPath();
    for (let x = 0; x < W; x++) {
      let min = 1, max = -1; const i0 = Math.floor(x / W * N), i1 = Math.floor((x + 1) / W * N);
      for (let i = i0; i < i1; i++) { const v = data[i]; if (v < min) min = v; if (v > max) max = v; }
      ctx.moveTo(x, mid + min * mid); ctx.lineTo(x, mid + max * mid);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
    // marcas de slice
    ctx.strokeStyle = '#fff';
    for (const s of opts.slices) {
      const x = Math.round(s.start / buffer.duration * W) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
  }

  // lista de slices: índice -> nota, con ▶
  const list = root.querySelector('#smpList') as HTMLElement;
  list.innerHTML = opts.slices.map((s, i) =>
    `<button class="smpSlice" data-i="${i}" title="Probar">▶ ${i + 1} · ${noteName(opts.base + i)}</button>`).join('')
    || (buffer ? '<p class="muted">Pulsa "Trocear" para crear los slices.</p>' : '');
  list.querySelectorAll<HTMLButtonElement>('.smpSlice').forEach(b =>
    b.addEventListener('click', () => opts.onTest(+(b.dataset.i ?? '0'))));
}
