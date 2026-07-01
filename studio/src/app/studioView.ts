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
import { makeSequencer, swingOffset } from '../daw/sequencer';
import { mountTransport } from '../ui/transport';
import { mountStepGrid } from '../ui/stepgrid';
import { channelStripHTML } from '../ui/channelstrip';
import { mountKnob } from '../ui/knob';
import { patternBarHTML } from '../ui/patternbar';
import { makeChannel, Channel } from '../daw/channel';
import {
  DawState, ChannelState, InstrumentSpec, defaultChannel, addChannel, removeChannel,
  updateChannel, toggleStep, setStep, findChannel, audibleIds, channelSteps,
  addPattern, removePattern, setCurrentPattern, setSong, defaultSynthxInstrument
} from '../daw/model';
import { loadStore, saveStore, downloadProject, readProjectFile, ProjectState } from './store';
import * as synthx from '../audio/synthx';
import { mountSynthEditor } from '../ui/synthEditor';

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
  let recording = false;

  root.innerHTML = `
    <div class="studioBar">
      <button id="stConnect">Conectar teclado</button>
      <span id="stMidi" class="muted">Sin conectar</span>
      <span class="grow"></span>
      <button id="fxToggle">🎛 Efectos</button>
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
    <div id="fxDrawer" class="fxDrawer">
      <div class="fxDrawerHead">
        <b id="fxTitle">Efectos</b>
        <span class="grow"></span>
        <button id="fxClose" class="chBtn" title="Cerrar el panel">✕ Cerrar</button>
      </div>
      <div class="racks">
        <div id="chRack"></div>
        <div id="masterRack"></div>
      </div>
    </div>
    <div id="synthDrawer" class="fxDrawer">
      <div class="fxDrawerHead">
        <b id="synthTitle">Sinte editable</b>
        <span class="grow"></span>
        <button id="synthClose" class="chBtn" title="Cerrar el panel">✕ Cerrar</button>
      </div>
      <div id="synthEdHost"></div>
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
    const audio = channels.find(a => a.id === selectedId);
    if (ch?.instrument.kind === 'drum') {
      const actx = getAudioContext();
      if (audio && actx) audio.trigger(m, v, actx.currentTime);
    } else if (ch?.instrument.kind === 'synthx') {
      if (audio) synthx.noteOnSynthx(ch.instrument.params, m, v, audio.instrumentBus);
    } else { routeKeyboardToSelected(); synth.noteOn(m, v); }
    if (recording && seq.isPlaying()) recordStep(m, v);
  }

  // Escribe un paso ON (con la nota) en la posición del cabezal del canal seleccionado.
  function recordStep(m: number, v: number): void {
    const step = ((Math.round(transport.beatNow() * STEPS_PER_BEAT) % daw.steps) + daw.steps) % daw.steps;
    daw = setStep(daw, selectedId, step, { on: true, note: m, vel: v });
    persist(); renderChannels();
  }
  function stopLive(m: number): void {
    const ch = findChannel(daw, selectedId);
    if (ch?.instrument.kind === 'synthx') { synthx.noteOffSynthx(m); return; }
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
        if (st && st.on) {
          const audio = channels.find(a => a.id === c.id);
          const secPerStep = (60 / transport.bpm) / STEPS_PER_BEAT;
          if (audio) audio.trigger(st.note ?? 60, st.vel ?? SEQ_VEL, when + swingOffset(i, daw.swing, secPerStep));
        }
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
    // knobs de volumen y paneo por canal
    for (const c of daw.channels) {
      const row = (root.querySelector(`#steps-${c.id}`) as HTMLElement).parentElement as HTMLElement;
      const volEl = row.querySelector(`[data-vol="${c.id}"]`) as HTMLElement;
      const panEl = row.querySelector(`[data-pan="${c.id}"]`) as HTMLElement;
      mountKnob(volEl, { min: 0, max: 1.2, value: c.volume, default: 0.8, size: 34, onChange: v => {
        daw = updateChannel(daw, c.id, { volume: v }); channels.find(a => a.id === c.id)?.setVolume(v); persist();
      } });
      mountKnob(panEl, { min: -1, max: 1, value: c.pan, default: 0, size: 34, onChange: v => {
        daw = updateChannel(daw, c.id, { pan: v }); channels.find(a => a.id === c.id)?.setPan(v); persist();
      } });
    }
    renderPatternBar();
    renderSelectedRack();
  }
  function renderSelectedRack(): void {
    const host = root.querySelector('#chRack') as HTMLElement;
    const audio = channels.find(a => a.id === selectedId);
    const ch = findChannel(daw, selectedId);
    const n = daw.channels.findIndex(c => c.id === selectedId) + 1;
    const titleEl = root.querySelector('#fxTitle'); if (titleEl) titleEl.textContent = 'Efectos · Canal ' + n;
    if (audio && ch) mountRack(host, audio.rack, 'Canal ' + n, persist);
    else host.innerHTML = '<div class="rack"><div class="rackHead"><b>Canal</b></div><p class="muted">Inicia el audio (pulsa una tecla o ▶) para sus efectos.</p></div>';
  }
  function selectChannel(id: string): void { selectedId = id; routeKeyboardToSelected(); renderChannels(); }
  function applyAudible(): void { const aud = audibleIds(daw.channels); for (const a of channels) a.setAudible(aud.has(a.id)); }

  // --- panel inferior de efectos (cajón) ---
  const fxDrawer = root.querySelector('#fxDrawer') as HTMLElement;
  // Los dos cajones son mutuamente excluyentes: abrir uno cierra el otro.
  function openDrawer(): void { synthDrawer.classList.remove('open'); fxDrawer.classList.add('open'); }
  (root.querySelector('#fxClose') as HTMLButtonElement).addEventListener('click', () => fxDrawer.classList.remove('open'));
  (root.querySelector('#fxToggle') as HTMLButtonElement).addEventListener('click', () => { audioOn(); fxDrawer.classList.toggle('open'); });

  // --- cajón del sinte editable ---
  const synthDrawer = root.querySelector('#synthDrawer') as HTMLElement;
  (root.querySelector('#synthClose') as HTMLButtonElement).addEventListener('click', () => synthDrawer.classList.remove('open'));

  function openSynthEditor(id: string): void {
    audioOn();
    const ch = findChannel(daw, id);
    if (!ch || ch.instrument.kind !== 'synthx') return;
    const n = daw.channels.findIndex(c => c.id === id) + 1;
    const titleEl = root.querySelector('#synthTitle'); if (titleEl) titleEl.textContent = 'Sinte editable · Canal ' + n;
    mountSynthEditor(root.querySelector('#synthEdHost') as HTMLElement, {
      params: ch.instrument.params,
      onChange: (p) => {
        const spec: InstrumentSpec = { kind: 'synthx', params: p };
        daw = updateChannel(daw, id, { instrument: spec });
        const audio = channels.find(a => a.id === id); if (audio) audio.setInstrument(spec);
        persist();
      },
      onTest: () => {
        const audio = channels.find(a => a.id === id);
        const cur = findChannel(daw, id);
        const actx = getAudioContext();
        if (audio && actx && cur && cur.instrument.kind === 'synthx') {
          synthx.triggerSynthx(actx, cur.instrument.params, 60, 0.9, actx.currentTime, 0.4, audio.instrumentBus);
        }
      }
    });
    // Cierra el cajón de efectos antes de abrir el de sinte (mutuamente excluyentes).
    fxDrawer.classList.remove('open');
    synthDrawer.classList.add('open');
  }

  // --- delegación: canales ---
  const channelsEl = root.querySelector('#channels') as HTMLElement;
  channelsEl.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const sel = t.getAttribute('data-sel'); if (sel) { selectChannel(sel); return; }
    const fx = t.getAttribute('data-fx'); if (fx) { selectChannel(fx); openDrawer(); return; }
    const syn = t.getAttribute('data-syned'); if (syn) { selectChannel(syn); openSynthEditor(syn); return; }
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
  // (Vol/Pan ahora son knobs: los monta renderChannels con sus propios handlers.)
  channelsEl.addEventListener('change', e => {
    const t = e.target as HTMLSelectElement;
    const inst = t.getAttribute('data-inst');
    if (inst) {
      const val = t.value;
      let spec: InstrumentSpec;
      if (val === 'synthx') spec = defaultSynthxInstrument();
      else if (val.startsWith('drum:')) spec = { kind: 'drum', voice: val.slice(5) };
      else spec = { kind: 'synth', preset: val.slice(6) };
      daw = updateChannel(daw, inst, { instrument: spec });
      const audio = channels.find(a => a.id === inst); if (audio) audio.setInstrument(spec);
      if (inst === selectedId) routeKeyboardToSelected();
      persist(); renderChannels(); return;
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
    getSwing: () => daw.swing,
    onPlay: () => {
      audioOn();
      barStarted = false;
      if (songMode && daw.song.length) { songPos = 0; playPattern = daw.song[0]; } else { songPos = -1; playPattern = daw.current; }
      seq.play(); tUI.setPlaying(true); renderPatternBar(); phRaf = requestAnimationFrame(playhead);
    },
    onStop: () => { seq.stop(); tUI.setPlaying(false); cancelAnimationFrame(phRaf); grids.forEach(g => g.setPlayhead(-1)); songPos = -1; playPattern = daw.current; renderPatternBar(); },
    onBpm: (bpm) => { daw = { ...daw, bpm }; seq.setBpm(bpm); persist(); },
    onSwing: (swing) => { daw = { ...daw, swing }; persist(); },
    onRecord: () => { recording = !recording; tUI.setRecording(recording); }
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
