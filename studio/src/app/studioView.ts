import { ensureAudio, getAudioContext } from '../audio/context';
import * as synth from '../audio/synth';
import { makeTransport } from '../audio/transport';
import { makeSequencer } from '../daw/sequencer';
import { mountTransport } from '../ui/transport';
import { mountStepGrid } from '../ui/stepgrid';
import { masterDest, masterFxIn, masterFxOut } from '../audio/masterBus';
import { connectMidi } from '../midi/input';
import { mountKeyboard } from '../ui/keyboard';
import { createRack, Rack } from '../fx/rack';
import { mountRack } from '../ui/rack';
import '../fx/effects';   // registra los efectos disponibles
import { loadStore, saveStore, downloadProject, readProjectFile, ProjectState } from './store';
import { ensureWorklets } from '../fx/worklets';

// Vista Estudio: instrumento + MIDI + teclado + racks de efectos (instrumento y maestro) + guardar/abrir proyecto.
export function mountStudioView(root: HTMLElement): void {
  const store: ProjectState = loadStore();
  const opts = synth.getPresetNames()
    .map(([k, label]) => `<option value="${k}"${k === store.instrument ? ' selected' : ''}>${label}</option>`).join('');

  root.innerHTML = `
    <div class="studioBar">
      <label class="fld">Instrumento <select id="stInstrument">${opts}</select></label>
      <button id="stConnect">Conectar teclado</button>
      <span id="stMidi" class="muted">Sin conectar</span>
      <span class="grow"></span>
      <span class="projBtns">
        <button id="stSave">💾 Guardar proyecto</button>
        <button id="stOpen">📂 Abrir proyecto</button>
        <input id="stFile" type="file" accept="application/json,.json" hidden>
      </span>
    </div>
    <div id="stKeyboard"></div>
    <p class="muted">Toca con el ratón, las teclas <b>A S D F G H J K</b> / <b>W E T Y U</b>, o tu teclado MIDI. Pulsa una tecla para activar los efectos.</p>
    <div id="transport"></div>
    <section class="seqWrap">
      <h3>Secuenciador (toca el instrumento seleccionado)</h3>
      <div id="stepGrid"></div>
    </section>
    <div class="racks">
      <div id="instRack"></div>
      <div id="masterRack"></div>
    </div>`;

  synth.setPreset(store.instrument);

  let instRack: Rack | null = null;
  let masterRack: Rack | null = null;

  function persist(): void {
    store.instrument = (root.querySelector('#stInstrument') as HTMLSelectElement).value;
    if (instRack) store.instrumentRack = instRack.serialize();
    if (masterRack) store.masterRack = masterRack.serialize();
    saveStore(store);
  }

  let racksPromise: Promise<void> | null = null;
  function initRacks(): Promise<void> {
    if (!racksPromise) racksPromise = (async () => {
      const actx = ensureAudio();
      try { await ensureWorklets(actx); } catch { /* sin worklets: los efectos que los usan no se podrán añadir */ }
      const instrumentBus = actx.createGain();
      synth.setSynthOut(instrumentBus);
      instRack = createRack(actx, instrumentBus, masterDest());
      masterRack = createRack(actx, masterFxIn(), masterFxOut());
      instRack.restore(store.instrumentRack);
      masterRack.restore(store.masterRack);
      mountRack(root.querySelector('#instRack') as HTMLElement, instRack, 'Instrumento', persist);
      mountRack(root.querySelector('#masterRack') as HTMLElement, masterRack, 'Maestro', persist);
    })();
    return racksPromise;
  }
  function audioOn(): void { ensureAudio(); void initRacks(); }

  (root.querySelector('#stInstrument') as HTMLSelectElement).addEventListener('change', e => {
    synth.setPreset((e.target as HTMLSelectElement).value); persist();
  });

  (root.querySelector('#stConnect') as HTMLButtonElement).addEventListener('click', () => {
    audioOn();
    const st = root.querySelector('#stMidi') as HTMLElement;
    connectMidi({
      onNoteOn: (m, v) => synth.noteOn(m, v),
      onNoteOff: (m) => synth.noteOff(m),
      onState: (names) => { st.textContent = names.length ? '🟢 ' + names.join(' · ') : 'Ningún teclado'; }
    }).catch(err => {
      st.textContent = '🔴 ' + ((err instanceof Error && err.message) ? err.message
        : 'Este navegador no soporta Web MIDI; usa el ratón o el teclado del ordenador.');
    });
  });

  (root.querySelector('#stSave') as HTMLButtonElement).addEventListener('click', () => { persist(); downloadProject(store); });
  (root.querySelector('#stOpen') as HTMLButtonElement).addEventListener('click', () => (root.querySelector('#stFile') as HTMLInputElement).click());
  (root.querySelector('#stFile') as HTMLInputElement).addEventListener('change', async ev => {
    const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return;
    try {
      const p = await readProjectFile(file);
      store.instrument = p.instrument; store.instrumentRack = p.instrumentRack; store.masterRack = p.masterRack;
      (root.querySelector('#stInstrument') as HTMLSelectElement).value = p.instrument;
      synth.setPreset(p.instrument);
      await initRacks();
      if (instRack) instRack.restore(store.instrumentRack);
      if (masterRack) masterRack.restore(store.masterRack);
      saveStore(store);
    } catch {
      (root.querySelector('#stMidi') as HTMLElement).textContent = '🔴 No se pudo abrir el proyecto.';
    }
  });

  mountKeyboard(root.querySelector('#stKeyboard') as HTMLElement, {
    onNoteOn: (m, v) => { audioOn(); synth.noteOn(m, v); },
    onNoteOff: (m) => synth.noteOff(m),
    lowMidi: 60, highMidi: 84, baseMidi: 60
  });

  // --- Secuenciador de pasos (3A) ---
  const STEPS = 16;
  const STEPS_PER_BEAT = 4;          // semicorcheas
  const SEQ_NOTE = 60;               // Do central (nota fija por ahora; pitch por paso llega después)
  const seqSteps: boolean[] = new Array(STEPS).fill(false);

  const transport = makeTransport(() => getAudioContext()?.currentTime ?? 0);
  const seq = makeSequencer(transport, {
    stepsPerBeat: STEPS_PER_BEAT,
    getTotalSteps: () => STEPS,
    onStep: (i, when) => { if (seqSteps[i]) synth.triggerAt(SEQ_NOTE, 0.95, when, 0.12); }
  });

  const grid = mountStepGrid(root.querySelector('#stepGrid') as HTMLElement, {
    total: STEPS,
    isOn: (i) => seqSteps[i],
    onToggle: (i) => { seqSteps[i] = !seqSteps[i]; }
  });

  let phRaf = 0;
  function playhead(): void {
    const s = Math.floor(transport.beatNow() * STEPS_PER_BEAT);
    grid.setPlayhead(((s % STEPS) + STEPS) % STEPS);
    phRaf = requestAnimationFrame(playhead);
  }

  const tUI = mountTransport(root.querySelector('#transport') as HTMLElement, {
    getBpm: () => transport.bpm,
    onPlay: () => { audioOn(); seq.play(); tUI.setPlaying(true); phRaf = requestAnimationFrame(playhead); },
    onStop: () => { seq.stop(); tUI.setPlaying(false); cancelAnimationFrame(phRaf); grid.setPlayhead(-1); },
    onBpm: (bpm) => seq.setBpm(bpm)
  });
}
