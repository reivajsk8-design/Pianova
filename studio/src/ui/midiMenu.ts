// studio/src/ui/midiMenu.ts
// Menú flotante para asignar/quitar un CC MIDI a un knob (clic derecho / long-press) + aviso "Mueve un mando…".
import { midiLearn } from '../midi/learn';

let menuEl: HTMLElement | null = null;
let toastEl: HTMLElement | null = null;

function closeMenu(): void { menuEl?.remove(); menuEl = null; }
function toast(msg: string, ms = 0): void {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'midiToast'; document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.classList.add('on');
  if (ms > 0) window.setTimeout(hideToast, ms);
}
function hideToast(): void { toastEl?.classList.remove('on'); }

export function openMidiMenu(id: string, x: number, y: number, onChanged: () => void): void {
  closeMenu();
  const b = midiLearn.getBinding(id);
  const el = document.createElement('div'); el.className = 'midiMenu';
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.innerHTML = `<button data-a="learn">🎹 Asignar MIDI</button>` +
    (b ? `<button data-a="clear">Quitar (CC ${b.cc})</button>` : '');
  document.body.appendChild(el); menuEl = el;
  (el.querySelector('[data-a="learn"]') as HTMLButtonElement).addEventListener('click', () => {
    closeMenu();
    midiLearn.arm(id, () => { const nb = midiLearn.getBinding(id); toast('✓ Asignado a CC ' + (nb ? nb.cc : '?'), 1600); onChanged(); });
    toast('Mueve un mando MIDI…  ·  Esc cancela');
  });
  (el.querySelector('[data-a="clear"]') as HTMLButtonElement | null)?.addEventListener('click', () => {
    midiLearn.clear(id); closeMenu(); onChanged();
  });
}

// Cierra el menú al pulsar fuera; Esc cancela el aprendizaje (si lo hay) y cierra el menú.
// (Guardado con `typeof document` porque los tests unitarios de knob.ts corren sin DOM/jsdom
// y este módulo se importa transitivamente; en el navegador `document` siempre existe.)
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', e => { if (menuEl && !menuEl.contains(e.target as Node)) closeMenu(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (midiLearn.armedId()) { midiLearn.cancel(); hideToast(); }
    closeMenu();
  });
}
