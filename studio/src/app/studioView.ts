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
import { humanizeHit } from '../daw/humanize';
import { mountTransport } from '../ui/transport';
import { mountStepGrid } from '../ui/stepgrid';
import { mountPianoRoll } from '../ui/pianoRoll';
import { SCALE_LABELS, NOTE_NAMES } from '../daw/scales';
import { channelStripHTML, instrumentSelectHTML } from '../ui/channelstrip';
import { mountKnob } from '../ui/knob';
import { patternBarHTML } from '../ui/patternbar';
import { padGridHTML } from '../ui/padGrid';
import { studioTabsHTML, StudioTab } from '../ui/studioTabs';
import { makeChannel, Channel } from '../daw/channel';
import { padLevel, activeSlices, type PadHit, type SliceHit } from '../ui/hitViz';
import {
  DawState, ChannelState, InstrumentSpec, defaultChannel, addChannel, removeChannel,
  updateChannel, toggleStep, setStep, findChannel, audibleIds, channelSteps, effectiveLen,
  addPattern, duplicatePattern, removePattern, setCurrentPattern, setSong, defaultSynthxInstrument, defaultSlicerInstrument,
  syncChannelIdSeed, defaultDaw, channelLen, addStepsPage, removeStepsPage, paintNote
} from '../daw/model';
import { loadStore, saveStore, downloadProject, readProjectFile, ProjectState, hydrateSamples } from './store';
import * as synthx from '../audio/synthx';
import { mountSynthEditor } from '../ui/synthEditor';
import { importSample, getSample, decodePending, clearSamples } from '../audio/sampleStore';
import { equalSlices, detectOnsets, marksToSlices, sliceIndexForNote, updateSlice } from '../daw/slicing';
import { playSlice } from '../audio/slicer';
import { mountSampleEditor } from '../ui/sampleEditor';
import type { SampleEditorHandle } from '../ui/sampleEditor';
import { mountEqEditor } from '../ui/eqEditor';
import type { EqEditorHandle } from '../ui/eqEditor';
import type { Effect } from '../fx/effect';
import { BASE_SUBDIV, channelStepAt, channelSpan, SUBDIVS, SUBDIV_LABELS } from '../daw/grid';
import { createFileLibrary, LibNode } from '../audio/fileLibrary';
import { mountLibraryPanel } from '../ui/libraryPanel';

const SEQ_VEL = 0.95;
// Mínimo común múltiplo: la longitud maestra del secuenciador es el m.c.m. de las longitudes de los canales,
// así CADA canal divide a la maestra → ninguno se trunca y el cabezal (paso % longitud) queda exacto.
function lcm2(a: number, b: number): number { const g = (x: number, y: number): number => (y ? g(y, x % y) : x); return a / g(a, b) * b; }
const WAVE_SVG = '<svg viewBox="0 0 200 50" preserveAspectRatio="none"><path d="M0,25 Q10,5 20,25 T40,25 T60,25 T80,25 T100,25 T120,25 T140,25 T160,25 T180,25 T200,25" fill="none" stroke="#2dff6a" stroke-width="1.5" opacity=".85"/></svg>';

export function mountStudioView(root: HTMLElement): void {
  const project: ProjectState = loadStore();
  let daw: DawState = project.daw;
  syncChannelIdSeed(daw.channels);   // evita que un canal nuevo repita un id 'ch-N' ya restaurado
  let selectedId = daw.channels[0]?.id ?? '';
  let tab: StudioTab = 'pads';

  let songMode = false;
  let playPattern = daw.current;
  let songPos = -1;
  let barStarted = false;
  let recording = false;
  let prLow = 48;   // octava base visible del piano-roll (Do3), recordada entre re-montajes
  const PAGE = 16;    // una página = 16 pasos
  let stepPage = 0;   // página visible del canal seleccionado
  let stepsCollapsed = false;   // piano-roll plegado (para compactar la vista cuando ya tienes la melodía)
  const liveNotes = new Set<number>();   // notas tocadas en vivo (para sombrearlas en el piano-roll)
  let prLive: ((notes: number[], focus?: number) => void) | null = null;

  root.innerHTML = `
    <div class="pvView">
      <div class="pvBar">
        <span class="pvTitle">◢ PIANOVA STUDIO</span>
        <span class="pvHdrBtns">
          <button id="stConnect">Conectar teclado</button>
          <span id="stMidi" class="pvConn">Sin conectar</span>
          <button id="stNew">🆕 Nuevo</button>
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
        <div class="pvCtlBar">
          <span class="pvLbl">SONIDO</span><span id="pvSound"></span>
          <button class="pvFoldBtn" id="stepsFold" title="Plegar / desplegar el piano-roll"><span class="pvFold">▾</span> Piano-roll</button>
          <div id="pvLenBar" class="pvLenBar"></div>
          <div id="pvScale" class="pvScale"></div>
        </div>
        <div id="pvSteps" class="pvSteps"></div>
        <div class="pvLbl">PARÁMETROS</div>
        <div id="pvParams" class="pvParams"></div>
      </div>
      <div id="paneSamples" class="pvPanel">
        <div id="libHost"></div>
        <input id="libFolderInput" type="file" webkitdirectory hidden>
        <div id="sampleEditorHost"></div>
      </div>
      <div id="paneMixer" class="pvPanel">
        <div id="mixer" class="pvMixer"></div>
        <button id="addCh" class="addCh">＋ Añadir canal</button>
      </div>
      <div id="fxSection" class="fxSection">
        <div id="chRack"></div>
        <div id="masterRack"></div>
      </div>
      <div id="stKeyboard"></div>
      <p class="muted">Toca con el ratón, las teclas <b>A S D F G H J K</b> / <b>W E T Y U</b>, o tu teclado MIDI.</p>
      <div id="eqOverlay" class="eqOverlay" hidden>
        <div class="eqModal">
          <div class="eqModalHead"><b>EQ gráfico</b><span class="grow"></span><button id="eqClose" class="chBtn" title="Cerrar">✕</button></div>
          <div id="eqHost"></div>
        </div>
      </div>
    </div>`;

  let channels: Channel[] = [];
  let masterRack: Rack | null = null;
  let audioReady: Promise<void> | null = null;
  let selGrid: { setPlayhead: (s: number) => void } | null = null;
  const padHits = new Map<string, PadHit>();   // último golpe por canal (para el destello)
  const PAD_FADE = 0.15;                        // s que dura el destello
  let visRaf = 0;                               // rAF del bucle visual (0 = parado)
  const sliceHits: SliceHit[] = [];               // slices sonando (canal slicer seleccionado)
  let sampleHandle: SampleEditorHandle | null = null;
  let eqHandle: EqEditorHandle | null = null;

  // El guardado en localStorage se difiere y se agrupa (400ms): `serializeProject` siempre
  // vuelca el almacén de samples en base64 (hasta ~2MB) y `persist()` se llama en cada
  // interacción (arrastrar un knob, tocar un paso), así que escribir sin diferir daba tirones.
  let saveTimer = 0;
  function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveStore({ version: 3, daw, masterRack: masterRack ? masterRack.serialize() : project.masterRack });
    }, 400) as unknown as number;
  }
  // Escribe ya mismo (cancelando cualquier guardado pendiente): para el botón Guardar,
  // donde el localStorage debe reflejar el estado actual sin esperar el debounce.
  function flushSave(): void {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
    saveStore({ version: 3, daw, masterRack: masterRack ? masterRack.serialize() : project.masterRack });
  }
  function persist(): void {
    daw = { ...daw, channels: daw.channels.map(c => {
      const audio = channels.find(a => a.id === c.id);
      return audio ? { ...c, rack: audio.serializeRack() } : c;
    }) };
    scheduleSave();
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
    } else if (ch?.instrument.kind === 'slicer') {
      const s = getSample(ch.instrument.sampleId);
      const idx = sliceIndexForNote(ch.instrument.base, ch.instrument.slices.length, m);
      const actx = getAudioContext();
      if (audio && actx && s?.buffer && idx >= 0) playSlice(audio.instrumentBus, s.buffer, ch.instrument.slices[idx], actx.currentTime, v);
      if (s?.buffer && idx >= 0 && actx) { const sl = ch.instrument.slices[idx]; if (sl) sliceHits.push({ index: idx, t: actx.currentTime, dur: sl.end - sl.start }); }
    } else { routeKeyboardToSelected(); synth.noteOn(m, v); }
    const nowT = getAudioContext()?.currentTime;
    if (nowT !== undefined) { padHits.set(selectedId, { t: nowT, vel: v }); ensureVisualLoop(); }
    liveNotes.add(m); prLive?.([...liveNotes], m);   // sombrea la fila de la nota tocada (auto-desplaza si hace falta)
    if (recording && seq.isPlaying()) recordStep(m, v);
  }
  function recordStep(m: number, v: number): void {
    const len = channelLen(daw, selectedId);
    const sub = findChannel(daw, selectedId)?.subdiv ?? 4;
    const step = ((Math.round(transport.beatNow() * sub) % len) + len) % len;
    daw = setStep(daw, selectedId, step, { on: true, note: m, vel: v });
    persist(); renderSelected();
  }
  function stopLive(m: number): void {
    // Apaga la nota por midi de forma INCONDICIONAL (como silence() en pianova.html). El note-off
    // debe soltar lo que sonó al TOCAR, y la selección puede haber cambiado desde entonces (p. ej.
    // pulsar otro pad mientras suena). Antes stopLive decidía según el canal seleccionado AHORA, así
    // que si apuntaba a batería/slicer no se llamaba synth.noteOff y la voz synth quedaba colgada;
    // solo se notaba en presets sustain:true (cuerda, órgano). Ambos note-off hacen no-op si no hay
    // voz para ese midi, así que es seguro llamarlos siempre. Los slices/batería son one-shot.
    synth.noteOff(m);
    synthx.noteOffSynthx(m);
    liveNotes.delete(m); prLive?.([...liveNotes]);   // quita el sombreado de la fila al soltar
  }

  function initAudio(): Promise<void> {
    if (!audioReady) audioReady = (async () => {
      const actx = ensureAudio();
      try { await ensureWorklets(actx); } catch { /* sin worklets */ }
      masterRack = createRack(actx, masterFxIn(), masterFxOut());
      masterRack.restore(project.masterRack);
      channels = daw.channels.map(c => makeChannel(actx, c, masterDest()));
      routeKeyboardToSelected();
      mountRack(root.querySelector('#masterRack') as HTMLElement, masterRack, 'Maestro', persist, openEqEditor);
      hydrateSamples(project);
      await decodePending();
      renderAll();
    })();
    return audioReady;
  }
  function audioOn(): void { ensureAudio(); void initAudio(); }

  const transport = makeTransport(() => getAudioContext()?.currentTime ?? 0);
  const seq = makeSequencer(transport, {
    stepsPerBeat: BASE_SUBDIV,
    getTotalSteps: () => {
      const pIdx = (songMode && daw.song.length) ? playPattern : daw.current;
      const pat = daw.patterns[pIdx];
      if (!pat) return BASE_SUBDIV * 4;
      let m = 1;
      for (const c of daw.channels) {
        const L = pat.steps[c.id]?.length ?? 0;
        if (L > 0) m = lcm2(m, channelSpan(L, c.subdiv ?? 4));   // tramo del canal en ticks base
      }
      return m > 1 ? m : BASE_SUBDIV * 4;                         // fallback: un compás
    },
    onStep: (i, when) => {
      if (i === 0) {
        if (!barStarted) barStarted = true;
        else if (songMode && daw.song.length) { songPos = (songPos + 1) % daw.song.length; playPattern = daw.song[songPos]; renderPatternBar(); }
      }
      const idx = (songMode && daw.song.length) ? playPattern : daw.current;
      const pat = daw.patterns[idx]; if (!pat) return;
      const audibles = audibleIds(daw.channels);
      for (const c of daw.channels) {
        if (!audibles.has(c.id)) continue;
        const arr = pat.steps[c.id];
        if (!arr || !arr.length) continue;
        const sub = c.subdiv ?? 4;
        const k = channelStepAt(i, sub, arr.length);         // paso del canal en este tick base (o null)
        if (k === null) continue;
        const st = arr[k];
        if (!st || !st.on) continue;
        const audio = channels.find(a => a.id === c.id);
        const secPerStep = (60 / transport.bpm) / sub;        // duración de un paso de ESTE canal
        let vel = st.vel ?? SEQ_VEL;
        let at = when + swingOffset(k, daw.swing, secPerStep);
        const hz = c.humanize ?? 0;
        if (hz > 0) { const h = humanizeHit(hz, Math.random); at += h.dt; vel = Math.max(0.05, Math.min(1, vel + h.dvel)); }
        const gate = c.instrument.kind === 'drum' ? undefined : effectiveLen(arr, k) * secPerStep;
        if (audio) audio.trigger(st.note ?? 60, vel, at, gate);
        padHits.set(c.id, { t: at, vel });                    // destello del pad, sincronizado al sonido
        if (c.id === selectedId && c.instrument.kind === 'slicer') {
          const idx = sliceIndexForNote(c.instrument.base, c.instrument.slices.length, st.note ?? 60);
          const sl = c.instrument.slices[idx];
          if (sl) sliceHits.push({ index: idx, t: at, dur: sl.end - sl.start });
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
    // Botón "▾ Piano-roll": pliega/despliega el piano-roll para compactar la vista.
    const foldBtn = root.querySelector('#stepsFold') as HTMLButtonElement;
    (foldBtn.querySelector('.pvFold') as HTMLElement).textContent = stepsCollapsed ? '▸' : '▾';
    foldBtn.onclick = () => {
      stepsCollapsed = !stepsCollapsed;
      (root.querySelector('#pvSteps') as HTMLElement).style.display = stepsCollapsed ? 'none' : '';
      (foldBtn.querySelector('.pvFold') as HTMLElement).textContent = stepsCollapsed ? '▸' : '▾';
    };
    // selector de sonido del canal seleccionado (aquí mismo, sin ir al MIXER)
    (root.querySelector('#pvSound') as HTMLElement).innerHTML = ch ? instrumentSelectHTML(ch) : '';
    // PASOS: piano-roll para canales melódicos; fila on/off para batería. Longitud por canal, en páginas de 16.
    const stepsHost = root.querySelector('#pvSteps') as HTMLElement;
    stepsHost.style.display = stepsCollapsed ? 'none' : '';   // respeta el estado plegado al re-render
    const scaleHost = root.querySelector('#pvScale') as HTMLElement;
    const lenHost = root.querySelector('#pvLenBar') as HTMLElement;
    const melodic = !!ch && ch.instrument.kind !== 'drum';

    // Barra de longitud + páginas (para cualquier canal).
    const len = channelLen(daw, selectedId);
    const pages = Math.max(1, Math.ceil(len / PAGE));
    if (stepPage >= pages) stepPage = pages - 1;
    const pageTabs = pages > 1
      ? '<span class="pvPages">Pág:' + Array.from({ length: pages }, (_, p) =>
          `<button class="pvPage${p === stepPage ? ' on' : ''}" data-page="${p}">${p + 1}</button>`).join('') + '</span>'
      : '';
    const sub = ch?.subdiv ?? 4;
    const subOpts = SUBDIVS.map(s => `<option value="${s}"${s === sub ? ' selected' : ''}>${SUBDIV_LABELS[s]}</option>`).join('');
    lenHost.innerHTML = `<span>Longitud</span>`
      + `<button class="pvLenBtn" data-lenminus title="Quitar 16 pasos">−16</button>`
      + `<span class="pvLenN">${len} pasos</span>`
      + `<button class="pvLenBtn" data-lenplus title="Añadir 16 pasos">＋16</button>${pageTabs}`
      + `<span class="pvLenSep"></span><span>Rejilla</span><select id="pvSubdiv" title="Resolución de este canal">${subOpts}</select>`;
    (lenHost.querySelector('[data-lenplus]') as HTMLButtonElement).addEventListener('click', () => {
      daw = addStepsPage(daw, selectedId); persist(); renderSelected();
    });
    (lenHost.querySelector('[data-lenminus]') as HTMLButtonElement).addEventListener('click', () => {
      daw = removeStepsPage(daw, selectedId); persist(); renderSelected();
    });
    (lenHost.querySelector('#pvSubdiv') as HTMLSelectElement).addEventListener('change', e => {
      daw = updateChannel(daw, selectedId, { subdiv: +(e.target as HTMLSelectElement).value }); persist(); renderSelected();
    });
    lenHost.querySelectorAll<HTMLButtonElement>('.pvPage').forEach(b =>
      b.addEventListener('click', () => { stepPage = +(b.dataset.page ?? '0'); renderSelected(); }));

    const off = stepPage * PAGE;   // desplazamiento de la página visible
    if (melodic) {
      // barra de escala
      const tonicOpts = NOTE_NAMES.map((nm, i) => `<option value="${i}"${i === daw.scaleRoot ? ' selected' : ''}>${nm}</option>`).join('');
      const typeOpts = Object.keys(SCALE_LABELS).map(k => `<option value="${k}"${k === daw.scaleType ? ' selected' : ''}>${SCALE_LABELS[k]}</option>`).join('');
      scaleHost.innerHTML = `<span>Escala</span><select id="scTonic">${tonicOpts}</select><select id="scType">${typeOpts}</select>`;
      (scaleHost.querySelector('#scTonic') as HTMLSelectElement).addEventListener('change', e => {
        daw = { ...daw, scaleRoot: +(e.target as HTMLSelectElement).value }; persist(); renderSelected();
      });
      (scaleHost.querySelector('#scType') as HTMLSelectElement).addEventListener('change', e => {
        daw = { ...daw, scaleType: (e.target as HTMLSelectElement).value }; persist(); renderSelected();
      });
      const pr = mountPianoRoll(stepsHost, {
        total: PAGE, lowMidi: prLow, scaleRoot: daw.scaleRoot, scaleType: daw.scaleType, beatEvery: ch?.subdiv ?? 4,
        getStep: (i) => channelSteps(daw, selectedId)[off + i],
        onPaint: (start, len, midi) => { daw = paintNote(daw, selectedId, off + start, len, midi); persist(); },
        onClear: (headIndex) => { daw = setStep(daw, selectedId, off + headIndex, { on: false }); persist(); },
        onRange: (lo) => { prLow = lo; }
      });
      selGrid = { setPlayhead: pr.setPlayhead };
      prLive = pr.setLiveNotes; prLive([...liveNotes]);   // muestra las notas ya pulsadas al (re)montar
    } else {
      scaleHost.innerHTML = '';
      const g = mountStepGrid(stepsHost, {
        total: PAGE, beatEvery: ch?.subdiv ?? 4,
        isOn: (i) => channelSteps(daw, selectedId)[off + i]?.on ?? false,
        onToggle: (i) => { daw = toggleStep(daw, selectedId, off + i); persist(); }
      });
      selGrid = { setPlayhead: g.setPlayhead };
      prLive = null;   // batería: no hay piano-roll que sombrear
    }
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
      host.innerHTML = '<p class="muted">Este sonido no tiene parámetros de síntesis editables. Elige <b>Sinte editable</b> en el selector de SONIDO de arriba para diseñar el sonido, o usa los efectos.</p>';
    }
  }
  function tipoLabel(ch: ChannelState): string {
    if (ch.instrument.kind === 'drum') return 'batería · ' + ch.instrument.voice;
    if (ch.instrument.kind === 'synthx') return 'sinte editable';
    if (ch.instrument.kind === 'slicer') { const s = getSample(ch.instrument.sampleId); return 'slicer · ' + (s?.name ?? 'sin audio'); }
    return 'preset · ' + ch.instrument.preset;
  }
  // Pestaña SAMPLES: editor del canal slicer seleccionado (forma de onda + troceado + probar).
  function renderSamples(): void {
    const host = root.querySelector('#sampleEditorHost') as HTMLElement;
    const ch = findChannel(daw, selectedId);
    if (!ch || ch.instrument.kind !== 'slicer') {
      host.innerHTML = '<div class="pvSoon">Elige <b>🔪 Slicer</b> en el SONIDO de un canal para cargar y trocear un audio.</div>';
      sampleHandle = null;
      return;
    }
    const inst = ch.instrument;
    const s = getSample(inst.sampleId);
    sampleHandle = mountSampleEditor(host, {
      buffer: s?.buffer ?? null, slices: inst.slices, base: inst.base,
      onImport: (file) => { void importAudioToChannel(selectedId, file); },
      onSliceEqual: (n) => applySlices(selectedId, equalSlicesFor(selectedId, n)),
      onSliceOnsets: () => applySlices(selectedId, onsetsFor(selectedId)),
      onSetMarks: (marks) => applySlices(selectedId, marks),
      onTest: (i) => testSlice(selectedId, i),
      onUpdateSlice: (index, patch) => {
        const ch = findChannel(daw, selectedId);
        if (ch?.instrument.kind !== 'slicer') return;
        const slices = updateSlice(ch.instrument.slices, index, patch);
        const spec: InstrumentSpec = { ...ch.instrument, slices };
        daw = updateChannel(daw, selectedId, { instrument: spec });
        channels.find(a => a.id === selectedId)?.setInstrument(spec);
        persist();   // NO renderSamples(): el editor no se re-monta mientras arrastras un knob
      }
    });
  }
  async function importArrayBufferToChannel(id: string, name: string, arr: ArrayBuffer): Promise<void> {
    audioOn(); await initAudio();
    const sampleId = await importSample(name, arr);
    const spec = defaultSlicerInstrument(sampleId, 60);
    daw = updateChannel(daw, id, { instrument: spec });
    channels.find(a => a.id === id)?.setInstrument(spec);
    persist(); renderSamples(); renderPads();
  }
  async function importAudioToChannel(id: string, file: File): Promise<void> {
    const arr = await file.arrayBuffer();
    await importArrayBufferToChannel(id, file.name, arr);
  }
  const lib = createFileLibrary();
  let previewSrc: AudioBufferSourceNode | null = null;
  async function previewLibNode(node: LibNode): Promise<void> {
    audioOn(); await initAudio();
    const buf = await lib.readBuffer(node); if (!buf) return;
    try { previewSrc?.stop(); } catch { /* ya parado */ }
    const src = ensureAudio().createBufferSource(); src.buffer = buf; src.connect(masterDest()); src.start();
    previewSrc = src;
  }
  async function assignLibNode(node: LibNode): Promise<void> {
    const arr = await lib.readArrayBuffer(node); if (!arr) return;
    await importArrayBufferToChannel(selectedId, node.name, arr);
  }
  const libUI = mountLibraryPanel(root.querySelector('#libHost') as HTMLElement, lib, {
    onImportFolder: async () => {
      if (lib.supported()) { audioOn(); if (await lib.pickFolder()) libUI.refresh(); }
      else (root.querySelector('#libFolderInput') as HTMLInputElement).click();
    },
    onPreview: (node) => { void previewLibNode(node); },
    onAssign: (node) => { void assignLibNode(node); }
  });
  (root.querySelector('#libFolderInput') as HTMLInputElement).addEventListener('change', e => {
    const input = e.target as HTMLInputElement; const files = [...(input.files ?? [])]; input.value = '';
    if (files.length) { lib.loadFromFiles(files); libUI.refresh(); }
  });
  void lib.restore().then(ok => { if (ok) libUI.refresh(); });   // reabre la carpeta si el permiso sigue concedido
  function bufferOf(id: string): AudioBuffer | null {
    const ch = findChannel(daw, id);
    if (ch?.instrument.kind !== 'slicer') return null;
    return getSample(ch.instrument.sampleId)?.buffer ?? null;
  }
  function equalSlicesFor(id: string, n: number): number[] {
    const buf = bufferOf(id); return buf ? equalSlices(buf.duration, n) : [];
  }
  function onsetsFor(id: string): number[] {
    const buf = bufferOf(id); return buf ? detectOnsets(buf.getChannelData(0), buf.sampleRate) : [];
  }
  function applySlices(id: string, marks: number[]): void {
    const buf = bufferOf(id); const ch = findChannel(daw, id);
    if (!buf || ch?.instrument.kind !== 'slicer') return;
    const slices = marksToSlices(marks, buf.duration);
    const spec: InstrumentSpec = { ...ch.instrument, slices };
    daw = updateChannel(daw, id, { instrument: spec });
    channels.find(a => a.id === id)?.setInstrument(spec);
    persist(); renderSamples();
  }
  function testSlice(id: string, index: number): void {
    audioOn();
    const buf = bufferOf(id); const ch = findChannel(daw, id); const audio = channels.find(a => a.id === id);
    if (buf && audio && ch?.instrument.kind === 'slicer' && ch.instrument.slices[index]) {
      playSlice(audio.instrumentBus, buf, ch.instrument.slices[index], (getAudioContext()?.currentTime ?? 0), 0.9);
      if (id === selectedId) { const sl = ch.instrument.slices[index]; sliceHits.push({ index, t: (getAudioContext()?.currentTime ?? 0), dur: sl.end - sl.start }); ensureVisualLoop(); }
    }
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
      const humEl = host.querySelector(`[data-hum="${c.id}"]`) as HTMLElement;
      if (humEl) mountKnob(humEl, { min: 0, max: 1, value: c.humanize ?? 0, default: 0, size: 34, onChange: v => {
        daw = updateChannel(daw, c.id, { humanize: v }); persist();
      } });
    }
  }
  function renderSelectedRack(): void {
    const host = root.querySelector('#chRack') as HTMLElement;
    const audio = channels.find(a => a.id === selectedId);
    const ch = findChannel(daw, selectedId);
    const n = daw.channels.findIndex(c => c.id === selectedId) + 1;
    if (audio && ch) mountRack(host, audio.rack, 'Canal ' + n, persist, openEqEditor);
    else host.innerHTML = '<div class="rack"><div class="rackHead"><b>Canal</b></div><p class="muted">Inicia el audio (pulsa una tecla o ▶) para sus efectos.</p></div>';
  }
  function openEqEditor(effect: Effect): void {
    if (!effect.eq) return;
    eqHandle?.close();
    eqHandle = mountEqEditor(root.querySelector('#eqHost') as HTMLElement, effect.eq, persist);
    (root.querySelector('#eqOverlay') as HTMLElement).hidden = false;
  }
  function closeEqEditor(): void {
    (root.querySelector('#eqOverlay') as HTMLElement).hidden = true;
    eqHandle?.close(); eqHandle = null;
  }
  (root.querySelector('#eqClose') as HTMLButtonElement).addEventListener('click', closeEqEditor);
  (root.querySelector('#eqOverlay') as HTMLElement).addEventListener('click', e => { if (e.target === e.currentTarget) closeEqEditor(); });
  window.addEventListener('keydown', e => {
    const eqOpen = !(root.querySelector('#eqOverlay') as HTMLElement).hidden;
    if (e.key === 'Escape' && eqOpen) { closeEqEditor(); return; }
    // Atajos de pestaña 1/2/3 — salvo escribiendo en un campo, con el editor EQ abierto, o con modificadores
    // (Ctrl+1/2/3 los usa el navegador para sus propias pestañas).
    const el = document.activeElement as HTMLElement | null;
    const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
    if (!typing && !eqOpen && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === '1' || e.key === '2' || e.key === '3')) {
      tab = e.key === '1' ? 'pads' : e.key === '2' ? 'samples' : 'mixer';
      renderTabs(); showPane();
    }
  });

  function renderAll(): void { renderTabs(); showPane(); renderPads(); renderSelected(); renderSamples(); renderMixer(); renderPatternBar(); renderSelectedRack(); }
  function selectChannel(id: string): void { selectedId = id; stepPage = 0; sliceHits.length = 0; routeKeyboardToSelected(); renderPads(); renderSelected(); renderSamples(); renderMixer(); renderSelectedRack(); }
  function applyAudible(): void { const aud = audibleIds(daw.channels); for (const a of channels) a.setAudible(aud.has(a.id)); }


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
    const fx = t.getAttribute('data-fx'); if (fx) { selectChannel(fx); return; }
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
  // Cambia el sonido de un canal (desde el MIXER o desde el selector SONIDO del panel de PADS).
  function changeInstrument(id: string, val: string): void {
    let spec: InstrumentSpec;
    if (val === 'slicer') { spec = defaultSlicerInstrument('', 60); selectedId = id; tab = 'samples'; renderTabs(); showPane(); }
    else if (val === 'synthx') spec = defaultSynthxInstrument();
    else if (val.startsWith('drum:')) spec = { kind: 'drum', voice: val.slice(5) };
    else spec = { kind: 'synth', preset: val.slice(6) };
    daw = updateChannel(daw, id, { instrument: spec });
    const audio = channels.find(a => a.id === id); if (audio) audio.setInstrument(spec);
    if (id === selectedId) { routeKeyboardToSelected(); renderSelected(); }
    persist(); renderMixer(); renderPads(); renderSamples();
  }
  mixerEl.addEventListener('change', e => {
    const t = e.target as HTMLSelectElement;
    const inst = t.getAttribute('data-inst');
    if (inst) changeInstrument(inst, t.value);
  });
  (root.querySelector('#pvSound') as HTMLElement).addEventListener('change', e => {
    const t = e.target as HTMLSelectElement;
    const inst = t.getAttribute('data-inst');
    if (inst) changeInstrument(inst, t.value);
  });

  // ---------- barra de patrones/canción ----------
  (root.querySelector('#patternBar') as HTMLElement).addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const pat = t.getAttribute('data-pat');
    if (pat) { daw = setCurrentPattern(daw, +pat); persist(); renderSelected(); renderPatternBar(); return; }
    if (t.hasAttribute('data-patadd')) { daw = addPattern(daw); persist(); renderSelected(); renderPatternBar(); return; }
    if (t.hasAttribute('data-patdup')) { daw = duplicatePattern(daw, daw.current); persist(); renderSelected(); renderPatternBar(); return; }
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
  function paintPads(now: number): void {
    const grid = root.querySelector('#padGrid'); if (!grid) return;
    grid.querySelectorAll<HTMLElement>('[data-pad]').forEach(el => {
      const lvl = padLevel(padHits.get(el.dataset.pad ?? ''), now, PAD_FADE);
      el.style.setProperty('--hit', lvl.toFixed(3));
    });
  }
  function clearPads(): void {
    root.querySelectorAll<HTMLElement>('#padGrid [data-pad]').forEach(el => el.style.setProperty('--hit', '0'));
  }
  function visualTick(): void {
    const now = getAudioContext()?.currentTime ?? 0;
    const playing = seq.isPlaying();
    if (playing) {
      const len = channelLen(daw, selectedId);
      const sub = findChannel(daw, selectedId)?.subdiv ?? 4;
      const s = ((Math.floor(transport.beatNow() * sub) % len) + len) % len;
      selGrid?.setPlayhead(Math.floor(s / PAGE) === stepPage ? (s % PAGE) : -1);   // solo si suena esta página
    }
    for (const [id, h] of padHits) if (now - h.t >= PAD_FADE) padHits.delete(id);            // poda pads
    for (let k = sliceHits.length - 1; k >= 0; k--) if (now - sliceHits[k].t >= sliceHits[k].dur) sliceHits.splice(k, 1);   // poda slices
    paintPads(now);
    sampleHandle?.setActiveSlices(activeSlices(sliceHits, now));
    if (playing || padHits.size || sliceHits.length) visRaf = requestAnimationFrame(visualTick);
    else { visRaf = 0; clearPads(); sampleHandle?.setActiveSlices([]); }
  }
  function ensureVisualLoop(): void { if (!visRaf) visRaf = requestAnimationFrame(visualTick); }
  seq.setBpm(daw.bpm);
  const tUI = mountTransport(root.querySelector('#transport') as HTMLElement, {
    getBpm: () => transport.bpm,
    getSwing: () => daw.swing,
    onPlay: () => {
      audioOn();
      barStarted = false;
      if (songMode && daw.song.length) { songPos = 0; playPattern = daw.song[0]; } else { songPos = -1; playPattern = daw.current; }
      seq.play(); tUI.setPlaying(true); renderPatternBar(); ensureVisualLoop();
    },
    onStop: () => { seq.stop(); tUI.setPlaying(false); selGrid?.setPlayhead(-1); padHits.clear(); clearPads(); sliceHits.length = 0; sampleHandle?.setActiveSlices([]); songPos = -1; playPattern = daw.current; renderPatternBar(); },
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
      onState: (names) => {   // chip verde con el nombre del teclado, o gris/rojo si no hay ninguno
        st.classList.toggle('on', names.length > 0);
        st.textContent = names.length ? names.join(' · ') : 'Ningún teclado';
      }
    }).catch(err => {
      st.classList.remove('on');
      st.textContent = (err instanceof Error && err.message) ? err.message
        : 'Sin Web MIDI; usa el ratón o el teclado del ordenador.';
    });
  });

  // ---------- guardar / abrir proyecto ----------
  (root.querySelector('#stSave') as HTMLButtonElement).addEventListener('click', () => { persist(); flushSave(); downloadProject({ version: 3, daw, masterRack: masterRack ? masterRack.serialize() : project.masterRack }); });
  (root.querySelector('#stOpen') as HTMLButtonElement).addEventListener('click', () => (root.querySelector('#stFile') as HTMLInputElement).click());
  (root.querySelector('#stNew') as HTMLButtonElement).addEventListener('click', async () => {
    if (!window.confirm('¿Empezar de cero? Se borrará el proyecto actual (patrones, canciones, samples y efectos).')) return;
    seq.stop(); tUI.setPlaying(false);   // empezar de cero también para la reproducción
    await initAudio();
    channels.forEach(a => a.dispose()); channels = [];
    daw = defaultDaw();
    clearSamples();
    const actx = ensureAudio();
    channels = daw.channels.map(c => makeChannel(actx, c, masterDest()));
    project.masterRack = { effects: [] };
    if (masterRack) masterRack.restore(project.masterRack);
    selectedId = daw.channels[0]?.id ?? '';
    songMode = false; playPattern = daw.current; songPos = -1; prLow = 48; recording = false;
    applyAudible(); routeKeyboardToSelected();
    seq.setBpm(daw.bpm);
    const bpmEl = root.querySelector('#tbBpm') as HTMLInputElement | null;
    if (bpmEl) bpmEl.value = String(daw.bpm);
    renderAll(); saveStore({ version: 3, daw, masterRack: project.masterRack });
  });
  (root.querySelector('#stFile') as HTMLInputElement).addEventListener('change', async ev => {
    const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return;
    try {
      const p = await readProjectFile(file);
      await initAudio();
      channels.forEach(a => a.dispose()); channels = [];
      daw = p.daw; project.masterRack = p.masterRack;
      syncChannelIdSeed(daw.channels);   // igual al abrir un proyecto de archivo
      hydrateSamples(p); await decodePending();
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
      const st = root.querySelector('#stMidi') as HTMLElement;
      st.classList.remove('on'); st.textContent = 'No se pudo abrir el proyecto.';
    }
  });

  renderAll();
}
