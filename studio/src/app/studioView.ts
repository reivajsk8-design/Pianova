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
import { padGridHTML } from '../ui/padGrid';
import { studioTabsHTML, StudioTab } from '../ui/studioTabs';
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
const WAVE_SVG = '<svg viewBox="0 0 200 50" preserveAspectRatio="none"><path d="M0,25 Q10,5 20,25 T40,25 T60,25 T80,25 T100,25 T120,25 T140,25 T160,25 T180,25 T200,25" fill="none" stroke="#2dff6a" stroke-width="1.5" opacity=".85"/></svg>';

export function mountStudioView(root: HTMLElement): void {
  const project: ProjectState = loadStore();
  let daw: DawState = project.daw;
  let selectedId = daw.channels[0]?.id ?? '';
  let tab: StudioTab = 'pads';

  let songMode = false;
  let playPattern = daw.current;
  let songPos = -1;
  let barStarted = false;
  let recording = false;

  root.innerHTML = `
    <div class="pvView">
      <div class="pvBar">
        <span class="pvTitle">◢ PIANOVA STUDIO</span>
        <span class="pvHdrBtns">
          <button id="stConnect">Conectar teclado</button>
          <span id="stMidi" class="muted">Sin conectar</span>
          <button id="fxToggle">🎛 Efectos</button>
          <button id="stSave">💾 Guardar</button>
          <button id="stOpen">📂 Abrir</button>
          <input id="stFile" type="file" accept="application/json,.json" hidden>
        </span>
      </div>
      <div class="pvTop">
        <div id="transport"></div>
        <div class="pvInfo">
          <div><div class="pvIName" id="pvIName">—</div><div class="pvISub" id="pvISub"></div></div>
          <div class="pvWave">${WAVE_SVG}</div>
        </div>
      </div>
      <div id="patternBar"></div>
      <div id="tabs"></div>
      <div id="panePads" class="pvPanel on">
        <div id="padGrid"></div>
        <div class="pvLbl" id="stepsLbl">PASOS</div>
        <div id="pvSteps" class="pvSteps"></div>
        <div class="pvLbl">PARÁMETROS</div>
        <div id="pvParams" class="pvParams"></div>
      </div>
      <div id="paneSamples" class="pvPanel">
        <div class="pvSoon">🎹 <b>Próximamente:</b> Simpler con slicing<br>
          <span style="font-size:12px">Cargar sonidos de la PC · trocear en slices · editar la muestra · secuenciarla</span></div>
      </div>
      <div id="paneMixer" class="pvPanel">
        <div id="mixer" class="pvMixer"></div>
        <button id="addCh" class="addCh">＋ Añadir canal</button>
      </div>
      <div id="stKeyboard"></div>
      <p class="muted">Toca con el ratón, las teclas <b>A S D F G H J K</b> / <b>W E T Y U</b>, o tu teclado MIDI.</p>
      <div id="fxDrawer" class="fxDrawer">
        <div class="fxDrawerHead"><b id="fxTitle">Efectos</b><span class="grow"></span>
          <button id="fxClose" class="chBtn" title="Cerrar el panel">✕ Cerrar</button></div>
        <div class="racks"><div id="chRack"></div><div id="masterRack"></div></div>
      </div>
    </div>`;

  let channels: Channel[] = [];
  let masterRack: Rack | null = null;
  let audioReady: Promise<void> | null = null;
  let selGrid: { setPlayhead: (s: number) => void } | null = null;

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
  function recordStep(m: number, v: number): void {
    const step = ((Math.round(transport.beatNow() * STEPS_PER_BEAT) % daw.steps) + daw.steps) % daw.steps;
    daw = setStep(daw, selectedId, step, { on: true, note: m, vel: v });
    persist(); renderSelected();
  }
  function stopLive(m: number): void {
    const ch = findChannel(daw, selectedId);
    if (ch?.instrument.kind === 'synthx') { synthx.noteOffSynthx(m); return; }
    if (ch && ch.instrument.kind !== 'drum') synth.noteOff(m);
  }

  function initAudio(): Promise<void> {
    if (!audioReady) audioReady = (async () => {
      const actx = ensureAudio();
      try { await ensureWorklets(actx); } catch { /* sin worklets */ }
      masterRack = createRack(actx, masterFxIn(), masterFxOut());
      masterRack.restore(project.masterRack);
      channels = daw.channels.map(c => makeChannel(actx, c, masterDest()));
      routeKeyboardToSelected();
      mountRack(root.querySelector('#masterRack') as HTMLElement, masterRack, 'Maestro', persist);
      renderAll();
    })();
    return audioReady;
  }
  function audioOn(): void { ensureAudio(); void initAudio(); }

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

  // ---------- render ----------
  function renderPatternBar(): void {
    (root.querySelector('#patternBar') as HTMLElement).innerHTML =
      patternBarHTML(daw, songMode, songMode && seq.isPlaying() ? songPos : -1);
  }
  function renderTabs(): void { (root.querySelector('#tabs') as HTMLElement).innerHTML = studioTabsHTML(tab); }
  function showPane(): void {
    (root.querySelector('#panePads') as HTMLElement).classList.toggle('on', tab === 'pads');
    (root.querySelector('#paneSamples') as HTMLElement).classList.toggle('on', tab === 'samples');
    (root.querySelector('#paneMixer') as HTMLElement).classList.toggle('on', tab === 'mixer');
  }
  function renderPads(): void {
    (root.querySelector('#padGrid') as HTMLElement).innerHTML = padGridHTML(daw.channels, selectedId);
  }
  function renderSelected(): void {
    const ch = findChannel(daw, selectedId);
    const n = daw.channels.findIndex(c => c.id === selectedId) + 1;
    (root.querySelector('#pvIName') as HTMLElement).textContent = ch ? `CANAL ${n} · ${ch.name}` : '—';
    (root.querySelector('#pvISub') as HTMLElement).textContent = ch ? tipoLabel(ch) : '';
    (root.querySelector('#stepsLbl') as HTMLElement).textContent = `PASOS · CANAL ${n}`;
    // pasos del canal seleccionado (un solo grid)
    const g = mountStepGrid(root.querySelector('#pvSteps') as HTMLElement, {
      total: daw.steps,
      isOn: (i) => channelSteps(daw, selectedId)[i]?.on ?? false,
      onToggle: (i) => { daw = toggleStep(daw, selectedId, i); persist(); }
    });
    selGrid = { setPlayhead: g.setPlayhead };
    // parámetros del canal seleccionado
    const host = root.querySelector('#pvParams') as HTMLElement;
    if (ch && ch.instrument.kind === 'synthx') {
      mountSynthEditor(host, {
        params: ch.instrument.params,
        onChange: (p) => {
          const spec: InstrumentSpec = { kind: 'synthx', params: p };
          daw = updateChannel(daw, selectedId, { instrument: spec });
          const audio = channels.find(a => a.id === selectedId); if (audio) audio.setInstrument(spec);
          persist();
        },
        onTest: () => {
          const audio = channels.find(a => a.id === selectedId);
          const cur = findChannel(daw, selectedId);
          const actx = getAudioContext();
          if (audio && actx && cur && cur.instrument.kind === 'synthx') {
            synthx.triggerSynthx(actx, cur.instrument.params, 60, 0.9, actx.currentTime, 0.4, audio.instrumentBus);
          }
        }
      });
    } else {
      host.innerHTML = '<p class="muted">Este sonido no tiene parámetros de síntesis editables. Elige <b>🎚️ Sinte editable</b> en el MIXER para diseñar el sonido, o usa los efectos.</p>';
    }
  }
  function tipoLabel(ch: ChannelState): string {
    if (ch.instrument.kind === 'drum') return 'batería · ' + ch.instrument.voice;
    if (ch.instrument.kind === 'synthx') return 'sinte editable';
    return 'preset · ' + ch.instrument.preset;
  }
  function renderMixer(): void {
    const host = root.querySelector('#mixer') as HTMLElement;
    host.innerHTML = daw.channels.map((c, idx) => channelStripHTML(c, idx, c.id === selectedId)).join('');
    for (const c of daw.channels) {
      const volEl = host.querySelector(`[data-vol="${c.id}"]`) as HTMLElement;
      const panEl = host.querySelector(`[data-pan="${c.id}"]`) as HTMLElement;
      if (volEl) mountKnob(volEl, { min: 0, max: 1.2, value: c.volume, default: 0.8, size: 34, onChange: v => {
        daw = updateChannel(daw, c.id, { volume: v }); channels.find(a => a.id === c.id)?.setVolume(v); persist();
      } });
      if (panEl) mountKnob(panEl, { min: -1, max: 1, value: c.pan, default: 0, size: 34, onChange: v => {
        daw = updateChannel(daw, c.id, { pan: v }); channels.find(a => a.id === c.id)?.setPan(v); persist();
      } });
    }
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
  function renderAll(): void { renderTabs(); showPane(); renderPads(); renderSelected(); renderMixer(); renderPatternBar(); renderSelectedRack(); }
  function selectChannel(id: string): void { selectedId = id; routeKeyboardToSelected(); renderPads(); renderSelected(); renderMixer(); renderSelectedRack(); }
  function applyAudible(): void { const aud = audibleIds(daw.channels); for (const a of channels) a.setAudible(aud.has(a.id)); }

  // ---------- cajón de efectos ----------
  const fxDrawer = root.querySelector('#fxDrawer') as HTMLElement;
  function openDrawer(): void { fxDrawer.classList.add('open'); }
  (root.querySelector('#fxClose') as HTMLButtonElement).addEventListener('click', () => fxDrawer.classList.remove('open'));
  (root.querySelector('#fxToggle') as HTMLButtonElement).addEventListener('click', () => { audioOn(); fxDrawer.classList.toggle('open'); });

  // ---------- pestañas ----------
  (root.querySelector('#tabs') as HTMLElement).addEventListener('click', e => {
    const t = (e.target as HTMLElement).getAttribute('data-tab') as StudioTab | null;
    if (t) { tab = t; renderTabs(); showPane(); }
  });

  // ---------- rejilla de pads ----------
  (root.querySelector('#padGrid') as HTMLElement).addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const pad = t.closest('[data-pad]')?.getAttribute('data-pad');
    if (pad) { selectChannel(pad); return; }
    if (t.closest('[data-addpad]')) { addNewChannel(); }
  });

  // ---------- mixer (tiras de canal) ----------
  const mixerEl = root.querySelector('#mixer') as HTMLElement;
  mixerEl.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const sel = t.getAttribute('data-sel'); if (sel) { selectChannel(sel); return; }
    const fx = t.getAttribute('data-fx'); if (fx) { selectChannel(fx); openDrawer(); return; }
    const syn = t.getAttribute('data-syned'); if (syn) { selectChannel(syn); tab = 'pads'; renderTabs(); showPane(); return; }
    const mute = t.getAttribute('data-mute');
    if (mute) { const c = findChannel(daw, mute); daw = updateChannel(daw, mute, { muted: !c?.muted }); applyAudible(); persist(); renderMixer(); return; }
    const solo = t.getAttribute('data-solo');
    if (solo) { const c = findChannel(daw, solo); daw = updateChannel(daw, solo, { soloed: !c?.soloed }); applyAudible(); persist(); renderMixer(); return; }
    const del = t.getAttribute('data-del');
    if (del) {
      if (daw.channels.length <= 1) return;
      const audio = channels.find(a => a.id === del); if (audio) { audio.dispose(); channels = channels.filter(a => a.id !== del); }
      daw = removeChannel(daw, del);
      if (selectedId === del) selectedId = daw.channels[0].id;
      routeKeyboardToSelected(); applyAudible(); persist(); renderPads(); renderSelected(); renderMixer(); renderSelectedRack(); return;
    }
  });
  mixerEl.addEventListener('change', e => {
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
      if (inst === selectedId) { routeKeyboardToSelected(); renderSelected(); }
      persist(); renderMixer(); renderPads(); return;
    }
  });

  // ---------- barra de patrones/canción ----------
  (root.querySelector('#patternBar') as HTMLElement).addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const pat = t.getAttribute('data-pat');
    if (pat) { daw = setCurrentPattern(daw, +pat); persist(); renderSelected(); renderPatternBar(); return; }
    if (t.hasAttribute('data-patadd')) { daw = addPattern(daw); persist(); renderSelected(); renderPatternBar(); return; }
    if (t.hasAttribute('data-patdel')) { daw = removePattern(daw, daw.current); persist(); renderSelected(); renderPatternBar(); return; }
    if (t.hasAttribute('data-songtoggle')) { songMode = !songMode; renderPatternBar(); return; }
    if (t.hasAttribute('data-songadd')) { daw = setSong(daw, [...daw.song, daw.current]); persist(); renderPatternBar(); return; }
    if (t.hasAttribute('data-songclear')) { daw = setSong(daw, []); persist(); renderPatternBar(); return; }
  });

  function addNewChannel(): void {
    const ch: ChannelState = defaultChannel('piano');
    daw = addChannel(daw, ch);
    const actx = getAudioContext();
    if (actx) channels.push(makeChannel(actx, ch, masterDest()));
    selectedId = ch.id; applyAudible(); persist(); renderPads(); renderSelected(); renderMixer(); routeKeyboardToSelected();
  }
  (root.querySelector('#addCh') as HTMLButtonElement).addEventListener('click', addNewChannel);

  // ---------- transporte + cabezal ----------
  let phRaf = 0;
  function playhead(): void {
    const s = ((Math.floor(transport.beatNow() * STEPS_PER_BEAT) % daw.steps) + daw.steps) % daw.steps;
    selGrid?.setPlayhead(s);
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
    onStop: () => { seq.stop(); tUI.setPlaying(false); cancelAnimationFrame(phRaf); selGrid?.setPlayhead(-1); songPos = -1; playPattern = daw.current; renderPatternBar(); },
    onBpm: (bpm) => { daw = { ...daw, bpm }; seq.setBpm(bpm); persist(); },
    onSwing: (swing) => { daw = { ...daw, swing }; persist(); },
    onRecord: () => { recording = !recording; tUI.setRecording(recording); }
  });

  // ---------- teclado ----------
  mountKeyboard(root.querySelector('#stKeyboard') as HTMLElement, {
    onNoteOn: (m, v) => { audioOn(); playLive(m, v); },
    onNoteOff: (m) => stopLive(m),
    lowMidi: 60, highMidi: 84, baseMidi: 60
  });

  // ---------- conectar MIDI ----------
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

  // ---------- guardar / abrir proyecto ----------
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
      renderAll(); saveStore({ version: 3, daw, masterRack: p.masterRack });
    } catch {
      (root.querySelector('#stMidi') as HTMLElement).textContent = '🔴 No se pudo abrir el proyecto.';
    }
  });

  renderAll();
}
