import { ensureAudio } from '../audio/context';
import * as synth from '../audio/synth';
import { connectMidi } from '../midi/input';
import { mountKeyboard } from '../ui/keyboard';

// Monta la vista Estudio: selector de instrumento + conectar MIDI + teclado tocable.
export function mountStudioView(root: HTMLElement): void {
  const opts = synth.getPresetNames()
    .map(([k, label]) => `<option value="${k}">${label}</option>`).join('');
  root.innerHTML = `
    <div class="studioBar">
      <label class="fld">Instrumento
        <select id="stInstrument">${opts}</select>
      </label>
      <button id="stConnect">Conectar teclado</button>
      <span id="stMidi" class="muted">Sin conectar</span>
    </div>
    <div id="stKeyboard"></div>
    <p class="muted">Toca con el ratón, las teclas <b>A S D F G H J K</b> (blancas) / <b>W E T Y U</b> (negras), o tu teclado MIDI.</p>`;

  (root.querySelector('#stInstrument') as HTMLSelectElement).addEventListener('change', e => {
    synth.setPreset((e.target as HTMLSelectElement).value);
  });

  (root.querySelector('#stConnect') as HTMLButtonElement).addEventListener('click', () => {
    ensureAudio();
    const st = root.querySelector('#stMidi') as HTMLElement;
    connectMidi({
      onNoteOn: (m, v) => synth.noteOn(m, v),
      onNoteOff: (m) => synth.noteOff(m),
      onState: (names) => { st.textContent = names.length ? '🟢 ' + names.join(' · ') : 'Ningún teclado'; }
    }).catch(err => {
      const st2 = root.querySelector('#stMidi') as HTMLElement;
      st2.textContent = '🔴 ' + ((err instanceof Error && err.message)
        ? err.message
        : 'Este navegador no soporta Web MIDI; usa el ratón o el teclado del ordenador.');
    });
  });

  mountKeyboard(root.querySelector('#stKeyboard') as HTMLElement, {
    onNoteOn: (m, v) => { ensureAudio(); synth.noteOn(m, v); },
    onNoteOff: (m) => synth.noteOff(m),
    lowMidi: 60, highMidi: 84, baseMidi: 60
  });
}
