import { ensureAudio, getAudioContext } from '../audio/context';
import * as synth from '../audio/synth';
import { masterDest, masterFxIn, masterFxOut } from '../audio/masterBus';
import { connectMidi } from '../midi/input';
import { mountKeyboard } from '../ui/keyboard';
import { createRack, Rack } from '../fx/rack';
import { mountRack } from '../ui/rack';
import '../fx/effects';
import { ensureWorklets } from '../fx/worklets';
import { makeTransport } from '../audio/transport';
import { makeSequencer } from '../daw/sequencer';
import { mountTransport } from '../ui/transport';
import { mountStepGrid } from '../ui/stepgrid';
import { channelStripHTML } from '../ui/channelstrip';
import { patternBarHTML } from '../ui/patternbar';
import { makeChannel, Channel } from '../daw/channel';
import {
  DawState, ChannelState, InstrumentSpec, defaultChannel, addChannel, removeChannel,
  updateChannel, toggleStep, findChannel, audibleIds, channelSteps,
  addPattern, removePattern, setCurrentPattern, setSong
} from '../daw/model';
import { loadStore, saveStore, downloadProject, readProjectFile, ProjectState } from './store';

const STEPS_PER_BEAT = 4;
const SEQ_VEL = 0.95;

export function mountStudioView(root: HTMLElement): void {
  const project: ProjectState = loadStore();
  let daw: DawState = project.daw;
  let selectedId = daw.channels[0]?.id ?? '';

  // estado de reproducción de patrón/canción
  let songMode = false;
  let playPattern = daw.current;
  let songPos = -1;
  let barStarted = false;

  root.innerHTML = `
    <div class="studioBar">
      <button id="stConnect">Conectar teclado</button>
      <span id="stMidi" class="muted">Sin conectar</span>
      <span class="grow"></span>
      <span class="projBtns">
        <button id="stSave">💾 Guardar proyecto</button>
        <button id="stOpen">📂 Abrir proyecto</button>
        <input id="stFile" type="file" accept="application/json,.json" hidden>
      </span>
    </div>
    <div id="transport"></div>
    <div id="patternBar"></div>
    <section class="seqWrap">
      <h3>Canales · secuenciador (el canal seleccionado lo toca el teclado)</h3>
      <div id="channels" class="channels"></div>
      <button id="addCh" class="addCh">＋ Añadir canal</button>
    </section>
    <div id="stKeyboard"></div>
    <p class="muted">Toca con el ratón, las teclas <b>A S D F G H J K</b> / <b>W E T Y U</b>, o tu teclado MIDI.</p>
    <div class="racks">
      <div id="chRack"></div>
      <div id="masterRack"></div>
    </div>`;

  let channels: Channel[] = [];
  let masterRack: Rack | null = null;
  let audioReady: Promise<void> | null = null;

  function persist(): void {
    daw = { ...daw, channels: daw.channels.map(c => {
      const audio = channels.find(a => a.id === c.id);
      return audio ? { ...c, rack: audio.serializeRack() } : c;
    }) };
    saveStore({ version: 3, daw, masterRack: masterRack ? masterRack.serialize() : project.masterRack });
  }

  function routeKeyboardToSelected(): void {
    const audio = channels.find(a => a.id === selectedId);
    const ch = findChannel(daw, selectedId);
    if (audio && ch && ch.instrument.kind === 'synth') { synth.setSynthOut(audio.instrumentBus); synth.setPreset(ch.instrument.preset); }
  }
  function playLive(m: number, v: number): void {
    const ch = findChannel(daw, selectedId);
    if (ch?.instrument.kind === 'drum') {
      const audio = channels.find(a => a.id === selectedId);
      const actx = getAudioContext();
      if (audio && actx) audio.trigger(m, v, actx.currentTime);
    } else { routeKeyboardToSelected(); synth.noteOn(m, v); }
  }
  function stopLive(m: number): void {
    const ch = findChannel(daw, selectedId);
    if (ch && ch.instrument.kind !== 'drum') synth.noteOff(m);
  }

  function initAudio(): Promise<void> {
    if (!audioReady) audioReady = (async () => {
      const actx = ensureAudio();
      try { await ensureWorklets(actx); } catch { /* sin worklets, esos efectos no se podrán añadir */ }
      masterRack = createRack(actx, masterFxIn(), masterFxOut());
      masterRack.restore(project.masterRack);
      channels = daw.channels.map(c => makeChannel(actx, c, masterDest()));
      routeKeyboardToSelected();
      mountRack(root.querySelector('#masterRack') as HTMLElement, masterRack, 'Maestro', persist);
      renderChannels();
    })();
    return audioReady;
  }
  function audioOn(): void { ensureAudio(); void initAudio(); }

  // --- secuenciador (multi-canal + patrones/canción) ---
  const transport = makeTransport(() => getAudioContext()?.currentTime ?? 0);
  const seq = makeSequencer(transport, {
    stepsPerBeat: STEPS_PER_BEAT,
    getTotalSteps: () => daw.steps,
    onStep: (i, when) => {
      if (i === 0) {
        if (!barStarted) barStarted = true;
        else if (songMode && daw.song.length) { songPos = (songPos + 1) % daw.song.length; playPattern = daw.song[songPos]; renderPatternBar(); }
      }
      const pat = daw.patterns[playPattern]; if (!pat) return;
      const audibles = audibleIds(daw.channels);
      for (const c of daw.channels) {
        if (!audibles.has(c.id)) continue;
        const st = pat.steps[c.id]?.[i];
        if (st && st.on) { const audio = channels.find(a => a.id === c.id); if (audio) audio.trigger(st.note ?? 60, st.vel ?? SEQ_VEL, when); }
      }
    }
  });

  // --- render ---
  let grids: { id: string; setPlayhead: (s: number) => void }[] = [];
  function renderPatternBar(): void {
    (root.querySelector('#patternBar') as HTMLElement).innerHTML =
      patternBarHTML(daw, songMode, songMode && seq.isPlaying() ? songPos : -1);
  }
  function renderChannels(): void {
    const host = root.querySelector('#channels') as HTMLElement;
    host.innerHTML = daw.channels.map((c, idx) =>
      `<div class="chRow">${channelStripHTML(c, idx, c.id === selectedId)}<div class="chSteps" id="steps-${c.id}"></div></div>`
    ).join('');
    grids = daw.channels.map(c => {
      const g = mountStepGrid(root.querySelector(`#steps-${c.id}`) as HTMLElement, {
        total: daw.steps,
        isOn: (i) => channelSteps(daw, c.id)[i]?.on ?? false,
        onToggle: (i) => { daw = toggleStep(daw, c.id, i); persist(); }
      });
      return { id: c.id, setPlayhead: g.setPlayhead };
    });
    renderPatternBar();
    renderSelectedRack();
  }
  function renderSelectedRack(): void {
    const host = root.querySelector('#chRack') as HTMLElement;
    const audio = channels.find(a => a.id === selectedId);
    const ch = findChannel(daw, selectedId);
    if (audio && ch) mountRack(host, audio.rack, 'Canal ' + (daw.channels.findIndex(c => c.id === selectedId) + 1), persist);
    else host.innerHTML = '<div class="rack"><div class="rackHead"><b>Canal</b></div><p class="muted">Inicia el audio (pulsa una tecla o ▶) para sus efectos.</p></div>';
  }
  function selectChannel(id: string): void { selectedId = id; routeKeyboardToSelected(); renderChannels(); }
  function applyAudible(): void { const aud = audibleIds(daw.channels); for (const a of channels) a.setAudible(aud.has(a.id)); }

  // --- delegación: canales ---
  const channelsEl = root.querySelector('#channels') as HTMLElement;
  channelsEl.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const sel = t.getAttribute('data-sel'); if (sel) { selectChannel(sel); return; }
    const fx = t.getAttribute('data-fx'); if (fx) { selectChannel(fx); return; }
    const mute = t.getAttribute('data-mute');
    if (mute) { const c = findChannel(daw, mute); daw = updateChannel(daw, mute, { muted: !c?.muted }); applyAudible(); persist(); renderChannels(); return; }
    const solo = t.getAttribute('data-solo');
    if (solo) { const c = findChannel(daw, solo); daw = updateChannel(daw, solo, { soloed: !c?.soloed }); applyAudible(); persist(); renderChannels(); return; }
    const del = t.getAttribute('data-del');
    if (del) {
      if (daw.channels.length <= 1) return;
      const audio = channels.find(a => a.id === del); if (audio) { audio.dispose(); channels = channels.filter(a => a.id !== del); }
      daw = removeChannel(daw, del);
      if (selectedId === del) selectedId = daw.channels[0].id;
      routeKeyboardToSelected(); applyAudible(); persist(); renderChannels(); return;
    }
  });
  channelsEl.addEventListener('input', e => {
    const t = e.target as HTMLInputElement;
    const vol = t.getAttribute('data-vol');
    if (vol) { const v = +t.value; daw = updateChannel(daw, vol, { volume: v }); channels.find(a => a.id === vol)?.setVolume(v); persist(); return; }
    const pan = t.getAttribute('data-pan');
    if (pan) { const v = +t.value; daw = updateChannel(daw, pan, { pan: v }); channels.find(a => a.id === pan)?.setPan(v); persist(); return; }
  });
  channelsEl.addEventListener('change', e => {
    const t = e.target as HTMLSelectElement;
    const inst = t.getAttribute('data-inst');
    if (inst) {
      const [kind, name] = t.value.split(':');
      const spec: InstrumentSpec = kind === 'drum' ? { kind: 'drum', voice: name } : { kind: 'synth', preset: name };
      daw = updateChannel(daw, inst, { instrument: spec });
      channels.find(a => a.id === inst)?.setInstrument(spec);
      if (inst === selectedId) routeKeyboardToSelected();
      persist();
    }
  });

  // --- delegación: barra de patrones/canción ---
  (root.querySelector('#patternBar') as HTMLElement).addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const pat = t.getAttribute('data-pat');
    if (pat) { daw = setCurrentPattern(daw, +pat); persist(); renderChannels(); return; }
    if (t.hasAttribute('data-patadd')) { daw = addPattern(daw); persist(); renderChannels(); return; }
    if (t.hasAttribute('data-patdel')) { daw = removePattern(daw, daw.current); persist(); renderChannels(); return; }
    if (t.hasAttribute('data-songtoggle')) { songMode = !songMode; renderPatternBar(); return; }
    if (t.hasAttribute('data-songadd')) { daw = setSong(daw, [...daw.song, daw.current]); persist(); renderPatternBar(); return; }
    if (t.hasAttribute('data-songclear')) { daw = setSong(daw, []); persist(); renderPatternBar(); return; }
  });

  (root.querySelector('#addCh') as HTMLButtonElement).addEventListener('click', () => {
    const ch: ChannelState = defaultChannel('piano');
    daw = addChannel(daw, ch);
    const actx = getAudioContext();
    if (actx) channels.push(makeChannel(actx, ch, masterDest()));
    selectedId = ch.id; applyAudible(); persist(); renderChannels(); routeKeyboardToSelected();
  });

  // --- transporte + cabezal ---
  let phRaf = 0;
  function playhead(): void {
    const s = ((Math.floor(transport.beatNow() * STEPS_PER_BEAT) % daw.steps) + daw.steps) % daw.steps;
    grids.forEach(g => g.setPlayhead(s));
    phRaf = requestAnimationFrame(playhead);
  }
  seq.setBpm(daw.bpm);
  const tUI = mountTransport(root.querySelector('#transport') as HTMLElement, {
    getBpm: () => transport.bpm,
    onPlay: () => {
      audioOn();
      barStarted = false;
      if (songMode && daw.song.length) { songPos = 0; playPattern = daw.song[0]; } else { songPos = -1; playPattern = daw.current; }
      seq.play(); tUI.setPlaying(true); renderPatternBar(); phRaf = requestAnimationFrame(playhead);
    },
    onStop: () => { seq.stop(); tUI.setPlaying(false); cancelAnimationFrame(phRaf); grids.forEach(g => g.setPlayhead(-1)); songPos = -1; playPattern = daw.current; renderPatternBar(); },
    onBpm: (bpm) => { daw = { ...daw, bpm }; seq.setBpm(bpm); persist(); }
  });

  // --- teclado ---
  mountKeyboard(root.querySelector('#stKeyboard') as HTMLElement, {
    onNoteOn: (m, v) => { audioOn(); playLive(m, v); },
    onNoteOff: (m) => stopLive(m),
    lowMidi: 60, highMidi: 84, baseMidi: 60
  });

  // --- conectar MIDI ---
  (root.querySelector('#stConnect') as HTMLButtonElement).addEventListener('click', () => {
    audioOn();
    const st = root.querySelector('#stMidi') as HTMLElement;
    connectMidi({
      onNoteOn: (m, v) => playLive(m, v),
      onNoteOff: (m) => stopLive(m),
      onState: (names) => { st.textContent = names.length ? '🟢 ' + names.join(' · ') : 'Ningún teclado'; }
    }).catch(err => {
      st.textContent = '🔴 ' + ((err instanceof Error && err.message) ? err.message
        : 'Este navegador no soporta Web MIDI; usa el ratón o el teclado del ordenador.');
    });
  });

  // --- guardar / abrir proyecto ---
  (root.querySelector('#stSave') as HTMLButtonElement).addEventListener('click', () => { persist(); downloadProject({ version: 3, daw, masterRack: masterRack ? masterRack.serialize() : project.masterRack }); });
  (root.querySelector('#stOpen') as HTMLButtonElement).addEventListener('click', () => (root.querySelector('#stFile') as HTMLInputElement).click());
  (root.querySelector('#stFile') as HTMLInputElement).addEventListener('change', async ev => {
    const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return;
    try {
      const p = await readProjectFile(file);
      await initAudio();
      channels.forEach(a => a.dispose()); channels = [];
      daw = p.daw; project.masterRack = p.masterRack;
      const actx = ensureAudio();
      channels = daw.channels.map(c => makeChannel(actx, c, masterDest()));
      if (masterRack) masterRack.restore(p.masterRack);
      selectedId = daw.channels[0]?.id ?? '';
      songMode = false; playPattern = daw.current; songPos = -1;
      applyAudible(); routeKeyboardToSelected();
      seq.setBpm(daw.bpm);
      const bpmEl = root.querySelector('#tbBpm') as HTMLInputElement | null;
      if (bpmEl) bpmEl.value = String(daw.bpm);
      renderChannels(); saveStore({ version: 3, daw, masterRack: p.masterRack });
    } catch {
      (root.querySelector('#stMidi') as HTMLElement).textContent = '🔴 No se pudo abrir el proyecto.';
    }
  });

  renderChannels();
}
