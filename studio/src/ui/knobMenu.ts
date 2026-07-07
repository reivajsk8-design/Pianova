// studio/src/ui/knobMenu.ts
// Menú flotante de un knob (clic derecho / long-press): Resetear, Teclear valor, y —en los mapeables— Asignar/
// Quitar MIDI. Más el aviso "Mueve un mando…" (Esc / clic fuera cancela el aprendizaje).
import { midiLearn } from '../midi/learn';

export interface KnobMenuActions {
  reset?: () => void;
  typeValue: () => void;
  midiId?: string;
  onChanged: () => void;
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
