// studio/src/ui/knobMenu.ts
// Menú flotante de un knob (clic derecho / long-press): Resetear, Teclear valor, y —en los mapeables— Asignar/
// Quitar MIDI. Más el aviso "Mueve un mando…" (Esc / clic fuera cancela el aprendizaje).
import { midiLearn } from '../midi/learn';
import { modEngine, LFO_COUNT } from '../mod/modEngine';

export interface KnobMenuActions {
  reset?: () => void;
  typeValue: () => void;
  midiId?: string;
  onChanged: () => void;
  modId?: string;
  onModChanged?: () => void;
}

let menuEl: HTMLElement | null = null;
let toastEl: HTMLElement | null = null;

function closeMenu(): void { menuEl?.remove(); menuEl = null; }
function toast(msg: string, ms = 0): void {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'midiToast'; document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.classList.add('on');
  if (ms > 0) window.setTimeout(hideToast, ms);
}
function hideToast(): void { toastEl?.classList.remove('on'); }

export function openKnobMenu(x: number, y: number, a: KnobMenuActions): void {
  closeMenu();
  const b = a.midiId ? midiLearn.getBinding(a.midiId) : undefined;
  const items: string[] = [];
  if (a.reset) items.push(`<button data-a="reset">Resetear</button>`);
  items.push(`<button data-a="type">Teclear valor…</button>`);
  if (a.midiId) {
    items.push(`<button data-a="learn">🎹 Asignar MIDI</button>`);
    if (b) items.push(`<button data-a="clear">Quitar (CC ${b.cc})</button>`);
  }
  if (a.modId) items.push(`<button data-a="mod">🌀 Modular (LFO)</button>`);
  const el = document.createElement('div'); el.className = 'midiMenu';
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.innerHTML = items.join('');
  document.body.appendChild(el); menuEl = el;

  (el.querySelector('[data-a="reset"]') as HTMLButtonElement | null)?.addEventListener('click', () => { closeMenu(); a.reset?.(); });
  (el.querySelector('[data-a="type"]') as HTMLButtonElement).addEventListener('click', () => { closeMenu(); a.typeValue(); });
  const id = a.midiId;
  if (id) {
    (el.querySelector('[data-a="learn"]') as HTMLButtonElement).addEventListener('click', () => {
      closeMenu();
      midiLearn.arm(id, () => { const nb = midiLearn.getBinding(id); toast('✓ Asignado a CC ' + (nb ? nb.cc : '?'), 1600); a.onChanged(); });
      toast('Mueve un mando MIDI…  ·  Esc cancela');
    });
    (el.querySelector('[data-a="clear"]') as HTMLButtonElement | null)?.addEventListener('click', () => {
      midiLearn.clear(id); closeMenu(); a.onChanged();
    });
  }
  if (a.modId) {
    const mid = a.modId;
    (el.querySelector('[data-a="mod"]') as HTMLButtonElement).addEventListener('click', () => renderModPanel(el, mid, a.onModChanged));
  }
}

// Panel de asignación de LFO dentro del menú del knob: elige LFO (Ninguno / 1..N) y la profundidad.
function renderModPanel(el: HTMLElement, modId: string, onModChanged?: () => void): void {
  const cur = modEngine.getAssign(modId);
  const depth = cur ? cur.depth : 0.5;
  const btn = (i: number, label: string): string =>
    `<button data-lfo="${i}" class="${(cur ? cur.lfo : -1) === i ? 'on' : ''}">${label}</button>`;
  let lfoBtns = btn(-1, '—');
  for (let i = 0; i < LFO_COUNT; i++) lfoBtns += btn(i, 'LFO ' + (i + 1));
  el.innerHTML = `<div class="modPanel">
    <div class="modRow">${lfoBtns}</div>
    <label class="modDepth">Profundidad <input type="range" min="0" max="1" step="0.01" value="${depth}"></label>
  </div>`;
  const rangeEl = el.querySelector('input[type="range"]') as HTMLInputElement;
  el.querySelectorAll<HTMLButtonElement>('[data-lfo]').forEach(b => b.addEventListener('click', () => {
    const i = +(b.dataset.lfo ?? '-1');
    if (i < 0) modEngine.unassign(modId);
    else modEngine.assign(modId, i, parseFloat(rangeEl.value));
    el.querySelectorAll<HTMLButtonElement>('[data-lfo]').forEach(x => x.classList.toggle('on', +(x.dataset.lfo ?? '-2') === i));
    onModChanged?.();
  }));
  rangeEl.addEventListener('input', () => {
    const a = modEngine.getAssign(modId);
    if (a) { modEngine.assign(modId, a.lfo, parseFloat(rangeEl.value)); onModChanged?.(); }
  });
}

// Cierra el menú al pulsar fuera; Esc / clic fuera cancela el aprendizaje armado. (Guardado con `typeof
// document` porque los tests de knob.ts corren sin DOM; en el navegador `document` siempre existe.)
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', e => {
    if (menuEl && !menuEl.contains(e.target as Node)) closeMenu();
    else if (!menuEl && midiLearn.armedId()) { midiLearn.cancel(); hideToast(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (midiLearn.armedId()) { midiLearn.cancel(); hideToast(); }
    closeMenu();
  });
}
