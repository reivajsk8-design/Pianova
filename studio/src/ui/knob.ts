// Knob giratorio (mando de DAW): se ajusta arrastrando arriba/abajo; doble-clic resetea al valor por
// defecto. Táctil (pointer events). El indicador gira de -135° (mín) a +135° (máx), barrido de 270°.
import { midiLearn } from '../midi/learn';
import { openKnobMenu } from './knobMenu';

// Ángulo del indicador para un valor (puro/testeable).
export function valueToAngle(value: number, min: number, max: number): number {
  const t = max === min ? 0 : (value - min) / (max - min);
  return -135 + 270 * Math.max(0, Math.min(1, t));
}

// Fracción del rango que mueve un paso de rueda: normal 2%, Ctrl fino 0.5%, Shift grueso 10% (Shift gana).
export function wheelStepFraction(shift: boolean, ctrl: boolean): number {
  return shift ? 0.1 : ctrl ? 0.005 : 0.02;
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

  // Rueda del ratón: cambia el valor (normal / Shift grueso / Ctrl fino). preventDefault evita el scroll.
  root.addEventListener('wheel', e => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    setValue(value + dir * range * wheelStepFraction(e.shiftKey, e.ctrlKey));
    opts.onChange(value);
  }, { passive: false });

  const midiId = opts.midiId;
  const refreshDot = (): void => { if (midiId) root.classList.toggle('mapped', midiLearn.hasBinding(midiId)); };
  if (midiId) {
    // El mando físico mueve el knob y aplica (absoluto 0–127 → rango del parámetro).
    midiLearn.register(midiId, (v01) => { setValue(opts.min + v01 * range); opts.onChange(value); });
    refreshDot();
  }
  const openMenu = (x: number, y: number): void => openKnobMenu(x, y, {
    reset: opts.default !== undefined ? () => { setValue(opts.default as number); opts.onChange(value); } : undefined,
    typeValue: () => {
      const s = prompt('Valor exacto:', String(Math.round(value * 1000) / 1000));
      if (s == null) return;
      const n = parseFloat(s.replace(',', '.'));
      if (!Number.isNaN(n)) { setValue(n); opts.onChange(value); }
    },
    midiId, onChanged: refreshDot
  });
  root.addEventListener('contextmenu', e => { e.preventDefault(); openMenu(e.clientX, e.clientY); });
  // Long-press en táctil: abre el menú si mantienes sin arrastrar ~500 ms.
  let lpTimer: number | null = null;
  const cancelLp = (): void => { if (lpTimer != null) { clearTimeout(lpTimer); lpTimer = null; } };
  root.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    lpTimer = window.setTimeout(() => { dragging = false; openMenu(e.clientX, e.clientY); }, 500);
  });
  root.addEventListener('pointermove', cancelLp);
  root.addEventListener('pointerup', cancelLp);
  root.addEventListener('pointercancel', cancelLp);

  return { setValue };
}
