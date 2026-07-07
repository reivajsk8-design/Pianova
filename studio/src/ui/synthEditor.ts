// Editor del sinte editable (cajón inferior): knobs por secciones OSC/FILTRO/ADSR/LFO + Probar.
import { SynthxParams, synthxPresetNames, SYNTHX_PRESETS } from '../audio/synthx-dsp';
import { mountKnob } from './knob';

export function mountSynthEditor(
  root: HTMLElement,
  opts: { params: SynthxParams; onChange: (p: SynthxParams) => void; onTest: () => void; midiPrefix?: string }
): void {
  let p: SynthxParams = { ...opts.params };
  const emit = (): void => opts.onChange({ ...p });

  const presetOpts = synthxPresetNames().map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  root.innerHTML = `<div class="synthEd">
    <div class="seRow">
      <label class="fld">Cargar preset <select class="sePreset"><option value="">—</option>${presetOpts}</select></label>
      <button class="chBtn seTest" title="Probar el sonido">▶ Probar</button>
    </div>
    <div class="seGrid">
      <div class="seSec"><h4>OSC</h4><div class="seKnobs">
        <div class="knobCell"><div class="knob" data-k="sine"></div><span>Seno</span></div>
        <div class="knobCell"><div class="knob" data-k="square"></div><span>Cuad</span></div>
        <div class="knobCell"><div class="knob" data-k="saw"></div><span>Sierra</span></div>
        <div class="knobCell"><div class="knob" data-k="sub"></div><span>Sub</span></div>
        <div class="knobCell"><div class="knob" data-k="detune"></div><span>Detune</span></div>
      </div></div>
      <div class="seSec"><h4>FILTRO</h4><div class="seKnobs">
        <label class="fld">Tipo <select class="seFilter"><option value="lowpass">LP</option><option value="bandpass">BP</option></select></label>
        <div class="knobCell"><div class="knob" data-k="cutoff"></div><span>Corte</span></div>
        <div class="knobCell"><div class="knob" data-k="resonance"></div><span>Reso</span></div>
      </div></div>
      <div class="seSec"><h4>ADSR</h4><div class="seKnobs">
        <div class="knobCell"><div class="knob" data-k="attack"></div><span>A</span></div>
        <div class="knobCell"><div class="knob" data-k="decay"></div><span>D</span></div>
        <div class="knobCell"><div class="knob" data-k="sustain"></div><span>S</span></div>
        <div class="knobCell"><div class="knob" data-k="release"></div><span>R</span></div>
      </div></div>
      <div class="seSec"><h4>LFO</h4><div class="seKnobs">
        <label class="fld">Destino <select class="seLfo"><option value="off">Off</option><option value="pitch">Tono</option><option value="filter">Filtro</option></select></label>
        <div class="knobCell"><div class="knob" data-k="lfoRate"></div><span>Vel</span></div>
        <div class="knobCell"><div class="knob" data-k="lfoDepth"></div><span>Prof</span></div>
      </div></div>
    </div>
  </div>`;

  // Rango y default de cada knob (coinciden con los clamps del DSP).
  const K: Record<string, { min: number; max: number; def: number }> = {
    sine: { min: 0, max: 1, def: 0.6 }, square: { min: 0, max: 1, def: 0 }, saw: { min: 0, max: 1, def: 0.4 },
    sub: { min: 0, max: 1, def: 0 }, detune: { min: 0, max: 50, def: 0 },
    cutoff: { min: 20, max: 20000, def: 6000 }, resonance: { min: 0.3, max: 20, def: 1 },
    attack: { min: 0, max: 3, def: 0.01 }, decay: { min: 0, max: 3, def: 0.3 },
    sustain: { min: 0, max: 1, def: 0 }, release: { min: 0, max: 3, def: 0.2 },
    lfoRate: { min: 0.1, max: 20, def: 5 }, lfoDepth: { min: 0, max: 1, def: 0.3 }
  };
  const knobs = root.querySelectorAll<HTMLElement>('.knob[data-k]');
  knobs.forEach(el => {
    const key = el.getAttribute('data-k') as keyof SynthxParams;
    const spec = K[key];
    // Guarda ante un valor data-k desconocido (evita crash en spec.min).
    if (!spec) return;
    mountKnob(el, { min: spec.min, max: spec.max, value: p[key] as number, default: spec.def,
      midiId: opts.midiPrefix ? `synthx:${opts.midiPrefix}:${key}` : undefined,
      onChange: v => { (p[key] as number) = v; emit(); } });
  });

  const fSel = root.querySelector('.seFilter') as HTMLSelectElement; fSel.value = p.filterType;
  fSel.addEventListener('change', () => { p.filterType = fSel.value === 'bandpass' ? 'bandpass' : 'lowpass'; emit(); });
  const lSel = root.querySelector('.seLfo') as HTMLSelectElement; lSel.value = p.lfoDest;
  lSel.addEventListener('change', () => { p.lfoDest = (lSel.value === 'pitch' || lSel.value === 'filter') ? lSel.value : 'off'; emit(); });

  const pSel = root.querySelector('.sePreset') as HTMLSelectElement;
  pSel.addEventListener('change', () => {
    const pr = SYNTHX_PRESETS[pSel.value];
    if (pr) { p = { ...pr }; emit(); mountSynthEditor(root, { params: p, onChange: opts.onChange, onTest: opts.onTest, midiPrefix: opts.midiPrefix }); }
  });
  (root.querySelector('.seTest') as HTMLButtonElement).addEventListener('click', () => opts.onTest());
}
