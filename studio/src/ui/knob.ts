// Knob giratorio (mando de DAW): se ajusta arrastrando arriba/abajo; doble-clic resetea al valor por
// defecto. Táctil (pointer events). El indicador gira de -135° (mín) a +135° (máx), barrido de 270°.
import { midiLearn } from '../midi/learn';
import { openMidiMenu } from './midiMenu';

// Ángulo del indicador para un valor (puro/testeable).
export function valueToAngle(value: number, min: number, max: number): number {
  const t = max === min ? 0 : (value - min) / (max - min);
  return -135 + 270 * Math.max(0, Math.min(1, t));
}

export interface KnobOpts {
  min: number; max: number; value: number; default?: number; size?: number; midiId?: string;
  onChange: (v: number) => void;
}
export interface KnobUI { setValue(v: number): void }

export function mountKnob(root: HTMLElement, opts: KnobOpts): KnobUI {
  const size = opts.size ?? 38;
  const range = opts.max - opts.min;
  root.classList.add('knob');
  root.style.width = root.style.height = size + 'px';
  root.innerHTML = '<div class="knobInd"></div>';
  const ind = root.querySelector('.knobInd') as HTMLElement;
  let value = opts.value;

  const clamp = (v: number) => Math.max(opts.min, Math.min(opts.max, v));
  const apply = (): void => { ind.style.transform = `rotate(${valueToAngle(value, opts.min, opts.max)}deg)`; };
  apply();
  const setValue = (v: number): void => { value = clamp(v); apply(); };

  let dragging = false, startY = 0, startVal = 0;
  root.addEventListener('pointerdown', e => {
    dragging = true; startY = e.clientY; startVal = value;
    root.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  root.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dy = startY - e.clientY;                 // arrastrar hacia arriba = subir
    value = clamp(startVal + (dy / 150) * range);  // 150 px = recorrido completo
    apply(); opts.onChange(value);
  });
  const end = (): void => { dragging = false; };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('dblclick', () => {
    if (opts.default !== undefined) { setValue(opts.default); opts.onChange(value); }
  });

  if (opts.midiId) {
    const id = opts.midiId;
    // El mando físico mueve el knob y aplica el valor (absoluto 0–127 → rango del parámetro).
    midiLearn.register(id, (v01) => { value = clamp(opts.min + v01 * range); apply(); opts.onChange(value); });
    const refreshDot = (): void => { root.classList.toggle('mapped', midiLearn.hasBinding(id)); };
    refreshDot();
    root.addEventListener('contextmenu', e => { e.preventDefault(); openMidiMenu(id, e.clientX, e.clientY, refreshDot); });
    // Long-press en táctil: abre el menú si mantienes sin arrastrar ~500 ms.
    let lpTimer: number | null = null;
    const cancelLp = (): void => { if (lpTimer != null) { clearTimeout(lpTimer); lpTimer = null; } };
    root.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      lpTimer = window.setTimeout(() => { dragging = false; openMidiMenu(id, e.clientX, e.clientY, refreshDot); }, 500);
    });
    root.addEventListener('pointermove', cancelLp);
    root.addEventListener('pointerup', cancelLp);
    root.addEventListener('pointercancel', cancelLp);
  }

  return { setValue };
}
