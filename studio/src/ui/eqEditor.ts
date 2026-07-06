// studio/src/ui/eqEditor.ts
// Editor gráfico del EQ: canvas con espectro en tiempo real, curva de respuesta y 8 nodos arrastrables
// (arrastrar = frecuencia+ganancia · rueda = Q · botones 1–8 = seleccionar banda). Panel de la banda
// seleccionada: Activa + Dinámico + Umbral/Rango/Ataque/Liberación. Bucle rAF para el espectro y la curva.
import {
  EqApi, EQ_FMIN, EQ_FMAX, EQ_GAIN_RANGE, Q_MIN, Q_MAX, freqToX, xToFreq, gainToY, yToGain, bandAt
} from '../fx/eq-core';
import { mountKnob } from './knob';

export interface EqEditorHandle { close(): void }

export function mountEqEditor(root: HTMLElement, eq: EqApi, onChange: () => void): EqEditorHandle {
  const presetOpts = eq.presetNames().map(n => `<option value="${n}">${n}</option>`).join('');
  root.innerHTML = `<div class="eqEd">
    <div class="eqBar">
      <select id="eqPreset"><option value="">Presets…</option>${presetOpts}</select>
      <button id="eqFlat" class="smpBtn">Plano</button>
      <select id="eqMode"><option value="stereo">Estéreo</option><option value="ms">Mid/Side</option></select>
      <span id="eqChan" class="eqChan"></span>
      <span class="eqHint muted">arrastra un punto (frec./ganancia) · rueda = Q · botones = seleccionar banda</span>
      <span id="eqBands" class="eqBands"></span>
    </div>
    <canvas id="eqCanvas" class="eqCanvas" width="760" height="300"></canvas>
    <div id="eqDyn" class="eqDyn"></div>
  </div>`;

  const canvas = root.querySelector('#eqCanvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  let sel = 0, drag = -1;

  function bandButtons(): void {
    const wrap = root.querySelector('#eqBands') as HTMLElement;
    wrap.innerHTML = eq.getBands().map((b, i) =>
      `<button class="eqBtn${b.on ? ' on' : ''}${i === sel ? ' sel' : ''}" data-b="${i}">${i + 1}</button>`).join('');
    wrap.querySelectorAll<HTMLButtonElement>('.eqBtn').forEach(btn =>
      btn.addEventListener('click', () => { sel = +(btn.dataset.b ?? '0'); bandButtons(); renderDyn(); }));
  }

  function renderDyn(): void {
    const host = root.querySelector('#eqDyn') as HTMLElement;
    const b = eq.getBands()[sel]; if (!b) { host.innerHTML = ''; return; }
    host.innerHTML = `<div class="eqDynHead">BANDA ${sel + 1}
        <label class="eqChk"><input type="checkbox" id="eqActive" ${b.on ? 'checked' : ''}> Activa</label>
        <label class="eqChk"><input type="checkbox" id="eqDynOn" ${b.dyn.on ? 'checked' : ''}> Dinámico</label></div>
      <div class="eqKnobs">
        <div class="knobCell"><div class="knob" id="kThr"></div><span>Umbral</span></div>
        <div class="knobCell"><div class="knob" id="kRange"></div><span>Rango</span></div>
        <div class="knobCell"><div class="knob" id="kAtk"></div><span>Ataque</span></div>
        <div class="knobCell"><div class="knob" id="kRel"></div><span>Liberación</span></div>
      </div>`;
    (host.querySelector('#eqActive') as HTMLInputElement).addEventListener('change', e => {
      eq.setBand(sel, { on: (e.target as HTMLInputElement).checked }); onChange(); bandButtons();
    });
    (host.querySelector('#eqDynOn') as HTMLInputElement).addEventListener('change', e => {
      eq.setDyn(sel, { on: (e.target as HTMLInputElement).checked }); onChange();
    });
    mountKnob(host.querySelector('#kThr') as HTMLElement, { min: -60, max: 0, value: b.dyn.threshold, default: -24, size: 32, onChange: v => { eq.setDyn(sel, { threshold: v }); onChange(); } });
    mountKnob(host.querySelector('#kRange') as HTMLElement, { min: -18, max: 18, value: b.dyn.range, default: -6, size: 32, onChange: v => { eq.setDyn(sel, { range: v }); onChange(); } });
    mountKnob(host.querySelector('#kAtk') as HTMLElement, { min: 1, max: 200, value: b.dyn.attack, default: 20, size: 32, onChange: v => { eq.setDyn(sel, { attack: v }); onChange(); } });
    mountKnob(host.querySelector('#kRel') as HTMLElement, { min: 20, max: 800, value: b.dyn.release, default: 150, size: 32, onChange: v => { eq.setDyn(sel, { release: v }); onChange(); } });
  }

  bandButtons();
  renderDyn();

  function renderModeChan(): void {
    (root.querySelector('#eqMode') as HTMLSelectElement).value = eq.mode();
    const chan = root.querySelector('#eqChan') as HTMLElement;
    const labels = eq.channelLabels();
    chan.innerHTML = eq.mode() === 'ms'
      ? labels.map((l, i) => `<button class="eqBtn${i === eq.activeChannel() ? ' sel' : ''}" data-ch="${i}">${l}</button>`).join('')
      : '';
    chan.querySelectorAll<HTMLButtonElement>('[data-ch]').forEach(btn =>
      btn.addEventListener('click', () => { eq.setActiveChannel(+(btn.dataset.ch ?? '0')); sel = 0; renderModeChan(); bandButtons(); renderDyn(); }));
  }
  (root.querySelector('#eqMode') as HTMLSelectElement).addEventListener('change', e => {
    eq.setMode((e.target as HTMLSelectElement).value as 'stereo' | 'ms'); onChange();
    sel = 0; renderModeChan(); bandButtons(); renderDyn();
  });
  renderModeChan();

  const freqs = new Float32Array(256);
  for (let i = 0; i < 256; i++) freqs[i] = xToFreq(i / 255 * W, W);

  function draw(): void {
    ctx.fillStyle = '#0c110b'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.fillStyle = '#7b818e'; ctx.font = '10px ui-monospace,monospace';
    [100, 1000, 10000].forEach(f => { const x = freqToX(f, W); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.fillText(f >= 1000 ? (f / 1000) + 'k' : '' + f, x + 3, H - 4); });
    [-12, -6, 0, 6, 12].forEach(g => { const y = gainToY(g, H); ctx.strokeStyle = g === 0 ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.fillStyle = '#7b818e'; ctx.fillText((g > 0 ? '+' : '') + g, 3, y - 2); });
    const bins = eq.analyser.frequencyBinCount, data = new Uint8Array(bins); eq.analyser.getByteFrequencyData(data);
    const nyq = eq.analyser.context.sampleRate / 2;
    ctx.fillStyle = 'rgba(150,160,180,.16)'; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 2) { const f = xToFreq(x, W); const bin = Math.min(bins - 1, Math.max(0, Math.round(f / nyq * bins))); ctx.lineTo(x, H - (data[bin] / 255) * H); }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    const tot = eq.magResponse(freqs);
    ctx.strokeStyle = '#2dff6a'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 256; i++) { const db = 20 * Math.log10(tot[i] || 1e-6); const x = i / 255 * W, y = gainToY(db, H); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.lineWidth = 1;
    eq.getBands().forEach((b, i) => {
      if (!b.on) return;
      const x = freqToX(b.freq, W), y = gainToY(Math.max(-EQ_GAIN_RANGE, Math.min(EQ_GAIN_RANGE, b.gain)), H);
      ctx.fillStyle = i === sel ? '#fff' : (b.dyn.on ? '#f2a33c' : '#2dff6a'); ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#04140a'; ctx.font = 'bold 10px ui-monospace,monospace'; ctx.fillText('' + (i + 1), x - 3, y + 3);
    });
  }

  const rel = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  };
  canvas.addEventListener('pointerdown', e => {
    const { x, y } = rel(e); const i = bandAt(eq.getBands(), x, y, W, H);
    if (i >= 0) { sel = i; drag = i; canvas.setPointerCapture(e.pointerId); bandButtons(); renderDyn(); }
  });
  canvas.addEventListener('pointermove', e => {
    if (drag < 0) return;
    const { x, y } = rel(e);
    eq.setBand(drag, {
      freq: Math.max(EQ_FMIN, Math.min(EQ_FMAX, xToFreq(Math.max(0, Math.min(W, x)), W))),
      gain: Math.max(-EQ_GAIN_RANGE, Math.min(EQ_GAIN_RANGE, yToGain(Math.max(0, Math.min(H, y)), H)))
    });
    onChange();
  });
  const endDrag = (): void => { drag = -1; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', e => {
    const { x, y } = rel(e); const i = bandAt(eq.getBands(), x, y, W, H);
    if (i < 0) return; e.preventDefault();
    const q = eq.getBands()[i].q;
    eq.setBand(i, { q: Math.max(Q_MIN, Math.min(Q_MAX, q * (e.deltaY > 0 ? 0.9 : 1.1))) });
    sel = i; onChange(); bandButtons(); renderDyn();   // la rueda también cambia de banda: refresca el panel
  }, { passive: false });

  (root.querySelector('#eqPreset') as HTMLSelectElement).addEventListener('change', ev => {
    const s = ev.target as HTMLSelectElement; if (s.value) { eq.applyPreset(s.value); onChange(); bandButtons(); renderDyn(); } s.value = '';
  });
  (root.querySelector('#eqFlat') as HTMLButtonElement).addEventListener('click', () => { eq.reset(); onChange(); bandButtons(); renderDyn(); });

  let raf = 0;
  const loop = (): void => { draw(); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  return { close: () => cancelAnimationFrame(raf) };
}
