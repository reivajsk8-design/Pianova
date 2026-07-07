// studio/src/ui/lfoPanel.ts
// Panel compacto del banco de LFOs: por LFO on/off + forma de onda + Sincro/Hz + velocidad. Lee/escribe modEngine.
import { modEngine, LFO_COUNT } from '../mod/modEngine';
import { RATE_FIGURES, type LfoWave } from '../mod/lfo';

const WAVE_LABELS: Record<LfoWave, string> = {
  sine: 'Seno', tri: 'Triáng.', sawUp: 'Sierra ↑', sawDown: 'Sierra ↓', square: 'Cuadr.', random: 'Azar',
};

export function mountLfoPanel(root: HTMLElement, opts: { onChange: () => void }): void {
  function render(): void {
    const lfos = modEngine.getLfos();
    let cells = '';
    for (let i = 0; i < LFO_COUNT; i++) {
      const l = lfos[i];
      const waves = (Object.keys(WAVE_LABELS) as LfoWave[])
        .map(w => `<option value="${w}"${w === l.wave ? ' selected' : ''}>${WAVE_LABELS[w]}</option>`).join('');
      const figs = RATE_FIGURES.map(f => `<option value="${f.key}"${f.key === l.rateKey ? ' selected' : ''}>${f.label}</option>`).join('');
      const rate = l.mode === 'sync'
        ? `<select data-a="rate" data-i="${i}">${figs}</select>`
        : `<input data-a="hz" data-i="${i}" type="number" min="0.05" max="40" step="0.05" value="${l.hz}"> Hz`;
      cells += `<div class="lfoCell${l.on ? ' on' : ''}">
        <div class="lfoTop"><button class="lfoLed" data-a="on" data-i="${i}" title="On/Off"></button><b>LFO ${i + 1}</b></div>
        <select data-a="wave" data-i="${i}">${waves}</select>
        <button class="lfoMode" data-a="mode" data-i="${i}">${l.mode === 'sync' ? 'Sincro' : 'Hz'}</button>
        <div class="lfoRate">${rate}</div>
      </div>`;
    }
    root.innerHTML = `<div class="lfoBank"><div class="lfoBankHead">🌀 LFO</div><div class="lfoCells">${cells}</div></div>`;

    root.querySelectorAll<HTMLElement>('[data-a]').forEach(el => {
      const i = +(el.dataset.i ?? '0'); const a = el.dataset.a;
      if (a === 'on') el.addEventListener('click', () => { modEngine.setLfo(i, { on: !modEngine.getLfos()[i].on }); opts.onChange(); render(); });
      else if (a === 'mode') el.addEventListener('click', () => { modEngine.setLfo(i, { mode: modEngine.getLfos()[i].mode === 'sync' ? 'free' : 'sync' }); opts.onChange(); render(); });
      else if (a === 'wave') el.addEventListener('change', () => { modEngine.setLfo(i, { wave: (el as HTMLSelectElement).value as LfoWave }); opts.onChange(); });
      else if (a === 'rate') el.addEventListener('change', () => { modEngine.setLfo(i, { rateKey: (el as HTMLSelectElement).value }); opts.onChange(); });
      else if (a === 'hz') el.addEventListener('change', () => { const v = parseFloat((el as HTMLInputElement).value); if (v > 0) { modEngine.setLfo(i, { hz: v }); opts.onChange(); } });
    });
  }
  render();
}
