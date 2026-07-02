# Rediseño "PIANOVA STUDIO" (layout STORM + verde neón) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar y re-estilizar la vista del Estudio al layout tipo STORM/Tempest (cabecera con transporte, pestañas PADS/SAMPLES/MIXER, rejilla de pads = canales, panel de pasos + parámetros del canal seleccionado) con tema negro + verde neón, sin tocar el motor.

**Architecture:** Un tema CSS nuevo (variables de color) + dos componentes de presentación (`padGrid`, `studioTabs`) + una reestructuración de `studioView.ts` que reutiliza toda la lógica existente (transporte, secuenciador, canales, sinte, mezcla, proyecto) reorganizada en el nuevo layout. La pestaña PADS muestra la rejilla de canales y, del canal seleccionado, sus pasos y sus parámetros (editor del sinte inline para `synthx`); MIXER reubica las tiras de canal; SAMPLES es un placeholder.

**Tech Stack:** Vite + TypeScript (strict) + Vitest. Sin framework de UI. Textos y comentarios en español.

## Global Constraints

- Todo el trabajo va en `studio/` (NO tocar `pianova.html`).
- TypeScript **strict**; sin dependencias nuevas de instalación.
- Comentarios y textos de interfaz **en español**.
- **No cambiar el motor ni el modelo ni la persistencia:** solo la presentación (HTML/CSS/organización de la vista). Todas las acciones actuales siguen existiendo.
- Los tests actuales (lógica pura) deben seguir verdes; la UI se verifica por typecheck + build + prueba por vista/oído.
- El audio arranca tras gesto (`ensureAudio`/`audioOn`).
- Nombre en la UI: **PIANOVA STUDIO**. Acento: **verde neón `#2dff6a`** sobre negro.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Comandos siempre desde `studio/`.

---

### Task 1: Tema visual PIANOVA STUDIO (`ui/styles.css`)

**Files:**
- Modify: `studio/src/ui/styles.css` (añadir al final)

**Interfaces:**
- Consumes: nada.
- Produces: variables CSS (`--pv-bg`, `--pv-panel`, `--pv-line`, `--pv-acc`, `--pv-acc-dim`, `--pv-ink`, `--pv-muted`) y clases del nuevo layout: `.pvView`, `.pvBar`, `.pvTitle`, `.pvHdrBtns`, `.pvInfo`, `.pvWave`, `.pvTabs`, `.pvTab(.on)`, `.pvPanel(.on)`, `.pvGrid`, `.pvPad(.sel/.add)`, `.pvLbl`, `.pvParams`, `.pvSec`, `.pvMixer`, `.pvSoon`.

Estilos; sin test unitario. Verificado por typecheck + build (el CSS no rompe nada; las clases se usan en Tasks 2–3).

- [ ] **Step 1: Append the theme CSS**

Añade al final de `studio/src/ui/styles.css`:

```css
/* ==================== PIANOVA STUDIO (rediseño STORM · verde neón) ==================== */
.pvView{--pv-bg:#0a0d0a;--pv-panel:#10130f;--pv-line:#23291f;--pv-acc:#2dff6a;--pv-acc-dim:rgba(45,255,106,.35);--pv-ink:#c9d2c9;--pv-muted:#8a958a;
  background:var(--pv-bg);color:var(--pv-ink);padding:14px;border-radius:10px}
.pvBar{display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--pv-line);padding-bottom:10px;margin-bottom:12px}
.pvTitle{color:var(--pv-acc);font-weight:800;letter-spacing:.14em;font-size:16px;text-shadow:0 0 12px var(--pv-acc-dim)}
.pvHdrBtns{margin-left:auto;display:flex;gap:8px;align-items:center}
.pvHdrBtns button{background:#161a14;border:1px solid #38402f;color:#e8eee8;padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer}
.pvHdrBtns button:hover{border-color:var(--pv-acc)}
.pvTop{display:flex;gap:16px;margin-bottom:14px;flex-wrap:wrap}
.pvInfo{flex:1;min-width:220px;background:var(--pv-panel);border:1px solid var(--pv-line);border-radius:8px;padding:10px 14px;display:flex;gap:16px;align-items:center}
.pvInfo .pvIName{color:var(--pv-acc);font-weight:700;letter-spacing:.08em;font-size:12px}
.pvInfo .pvISub{font-size:10px;color:var(--pv-muted);margin-top:4px}
.pvWave{flex:1;height:52px;background:linear-gradient(90deg,transparent,rgba(45,255,106,.08));border-radius:4px;overflow:hidden}
.pvWave svg{width:100%;height:100%}
.pvTabs{display:flex;gap:8px;margin-bottom:12px}
.pvTab{padding:6px 20px;border-radius:6px;font-size:12px;letter-spacing:.1em;border:1px solid #2b3324;color:var(--pv-muted);cursor:pointer;background:none}
.pvTab.on{background:var(--pv-acc);color:#07120a;font-weight:700;border-color:var(--pv-acc);box-shadow:0 0 14px var(--pv-acc-dim)}
.pvPanel{display:none}
.pvPanel.on{display:block}
.pvGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.pvPad{background:#141a13;border:1px solid #2b3324;border-radius:8px;min-height:56px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#b7c1b7;letter-spacing:.04em;text-align:center;padding:6px;cursor:pointer}
.pvPad:hover{border-color:var(--pv-acc)}
.pvPad.sel{border:2px solid var(--pv-acc);color:#fff;box-shadow:0 0 14px var(--pv-acc-dim) inset}
.pvPad.add{color:#5a6656;border-style:dashed}
.pvLbl{font-size:10px;letter-spacing:.14em;color:var(--pv-acc);margin:0 0 6px}
.pvSteps{margin-bottom:16px}
.pvSteps .stepRow{display:grid;grid-template-columns:repeat(16,1fr);gap:5px}
.pvSteps .stepCell{height:30px;border-radius:5px;background:#161c14;border:1px solid #2b3324;cursor:pointer}
.pvSteps .stepCell.beat{border-color:#44503c}
.pvSteps .stepCell.on{background:var(--pv-acc);border-color:var(--pv-acc);box-shadow:0 0 8px var(--pv-acc-dim)}
.pvSteps .stepCell.play{outline:2px solid #fff;outline-offset:1px}
.pvParams{background:var(--pv-panel);border:1px solid var(--pv-line);border-radius:8px;padding:12px 16px}
.pvParamsHead{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.pvSoon{background:var(--pv-panel);border:1px dashed #38402f;border-radius:8px;padding:40px;text-align:center;color:var(--pv-muted)}
.pvSoon b{color:var(--pv-acc)}
.pvMixer{display:flex;flex-direction:column;gap:8px}
```

- [ ] **Step 2: Verify build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS (CSS aditivo).

- [ ] **Step 3: Commit**

```bash
git add studio/src/ui/styles.css
git commit -m "PIANOVA STUDIO: tema visual (negro + verde neón, layout STORM)"
```

---

### Task 2: Componentes de presentación (`ui/padGrid.ts`, `ui/studioTabs.ts`)

**Files:**
- Create: `studio/src/ui/padGrid.ts`
- Create: `studio/src/ui/studioTabs.ts`

**Interfaces:**
- Consumes: `ChannelState` (`daw/model`).
- Produces:
  - `padGridHTML(channels: ChannelState[], selectedId: string): string` — la rejilla de pads. Cada pad lleva `data-pad="<id>"`, la clase `sel` si es el seleccionado, y un icono según `instrument.kind` (`🥁` drum, `🎚️` synthx, `🎹` synth). Añade una celda final `data-addpad` ("＋ Añadir").
  - `studioTabsHTML(active: 'pads' | 'samples' | 'mixer'): string` — los tres botones de pestaña con `data-tab="pads|samples|mixer"` y la clase `on` en el activo.

DOM (HTML puro); sin test unitario. Verificado por typecheck + build.

- [ ] **Step 1: Write `ui/padGrid.ts`**

```ts
// studio/src/ui/padGrid.ts
// Rejilla de pads del rediseño PIANOVA STUDIO: un pad por canal (= sonido), seleccionable.
import type { ChannelState } from '../daw/model';

function padIcon(ch: ChannelState): string {
  if (ch.instrument.kind === 'drum') return '🥁';
  if (ch.instrument.kind === 'synthx') return '🎚️';
  return '🎹';
}

export function padGridHTML(channels: ChannelState[], selectedId: string): string {
  const pads = channels.map((c, i) =>
    `<div class="pvPad${c.id === selectedId ? ' sel' : ''}" data-pad="${c.id}" title="${c.name}">${padIcon(c)} ${c.name || ('Canal ' + (i + 1))}</div>`
  ).join('');
  return `<div class="pvGrid">${pads}<div class="pvPad add" data-addpad title="Añadir canal">＋ AÑADIR</div></div>`;
}
```

- [ ] **Step 2: Write `ui/studioTabs.ts`**

```ts
// studio/src/ui/studioTabs.ts
// Pestañas del rediseño: PADS / SAMPLES / MIXER.
export type StudioTab = 'pads' | 'samples' | 'mixer';

export function studioTabsHTML(active: StudioTab): string {
  const tab = (id: StudioTab, label: string) =>
    `<button class="pvTab${active === id ? ' on' : ''}" data-tab="${id}">${label}</button>`;
  return `<div class="pvTabs">${tab('pads', 'PADS')}${tab('samples', 'SAMPLES')}${tab('mixer', 'MIXER')}</div>`;
}
```

- [ ] **Step 3: Verify typecheck and build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add studio/src/ui/padGrid.ts studio/src/ui/studioTabs.ts
git commit -m "PIANOVA STUDIO: componentes de rejilla de pads y pestañas"
```

---

### Task 3: Reestructurar la vista (`app/studioView.ts`)

**Files:**
- Modify: `studio/src/app/studioView.ts` (reescritura del layout y el render)

**Interfaces:**
- Consumes: `padGridHTML` (Task 2), `studioTabsHTML`/`StudioTab` (Task 2); tema (Task 1); y todo lo que ya usa `studioView` (transporte, secuenciador, canales, sinte, mezcla, proyecto, teclado, MIDI).
- Produces: `mountStudioView(root)` (firma intacta) con el layout PIANOVA STUDIO.

Integración (audio + DOM); sin test unitario. Verificado por typecheck + tests verdes + build + prueba por vista/oído.

**Qué cambia respecto al actual (resumen para el implementador):**
- El HTML raíz pasa al layout nuevo: `.pvView` con **cabecera** (título + transporte + botones) + **fila de info** (canal seleccionado + onda) + **pestañas** + **3 paneles** (`#panePads`, `#paneSamples`, `#paneMixer`) + el **cajón de efectos** (se mantiene) + el **teclado**. Se ELIMINA el cajón del sinte (`#synthDrawer`): los parámetros del sinte se muestran **inline** en el panel PADS.
- La rejilla de pads (`padGridHTML`) sustituye a la tira vertical de canales. Al seleccionar un pad se repintan los **pasos** y los **parámetros** del canal seleccionado.
- Hay **un solo** grid de pasos (el del canal seleccionado), no uno por canal. El cabezal actualiza ese grid.
- Los **parámetros**: si el canal es `synthx`, se monta `mountSynthEditor` inline; si no, un aviso "sin parámetros de síntesis".
- El **MIXER** reutiliza `channelStripHTML` por canal (selector de sonido + M/S/🎛/✕ + knobs vol/pan) — la vista de mezcla actual, reubicada en su pestaña.
- Se conservan intactos: `persist`, `initAudio`, `playLive`/`stopLive`/`recordStep`, el secuenciador `seq`, el transporte, patrones/canción, guardar/abrir, MIDI, teclado.

- [ ] **Step 1: Replace the file contents**

Reemplaza **todo** el contenido de `studio/src/app/studioView.ts` por:

```ts
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
```

- [ ] **Step 2: Verify typecheck, tests and build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS (typecheck limpio, tests actuales verdes, `dist/` generado).

- [ ] **Step 3: Manual smoke test (prueba por vista/oído)**

Run: `cd studio && npm run dev` y abre la URL.
Verifica:
1. Se ve **PIANOVA STUDIO** en negro + verde neón, con cabecera (transporte), pestañas y rejilla de pads.
2. **PADS:** clic en un pad lo selecciona; abajo aparecen sus PASOS (editables) y sus PARÁMETROS (editor del sinte si el canal es "Sinte editable"; aviso si no). "＋ Añadir" crea un canal.
3. **▶** reproduce; el cabezal recorre los pasos del canal seleccionado; BPM/swing/rec funcionan.
4. **MIXER:** las tiras con selector de sonido, M/S/🎛/✕ y knobs vol/pan funcionan; cambiar el sonido a "Sinte editable" y volver a PADS muestra su editor.
5. **SAMPLES:** muestra el cartel "Próximamente".
6. **🎛 Efectos** abre el cajón; **💾/📂** guardan/abren proyecto; el teclado suena en el canal seleccionado.

- [ ] **Step 4: Commit**

```bash
git add studio/src/app/studioView.ts
git commit -m "PIANOVA STUDIO: vista reestructurada (cabecera + pestañas + rejilla de pads + pasos/params + mixer)"
```

---

### Task 4: Docs y versión

**Files:**
- Modify: `studio/package.json` (subir `version` a `0.15.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.15.0"`.

- [ ] **Step 2: Update HANDOFF.md**

Añade en la zona de estado del Estudio:

```markdown
**Estudio · Rediseño PIANOVA STUDIO (v0.15.0):** la vista del Estudio se reorganizó al estilo STORM/Tempest
(negro + **verde neón `#2dff6a`**): cabecera con transporte (BPM grande) + info del canal + onda; **pestañas
PADS / SAMPLES / MIXER**. **PADS** = rejilla de pads (= canales) + PASOS y PARÁMETROS del canal seleccionado
(editor del sinte inline para `synthx`; aviso para batería/preset). **MIXER** reubica las tiras de canal
(selector de sonido, mute/solo/efectos, knobs vol/pan). **SAMPLES** es un placeholder para el siguiente
sub-proyecto (Simpler con slicing). El **motor no cambió** (audio/secuenciador/sinte/modelo/persistencia);
es solo presentación. Tema en `ui/styles.css` (`.pv*`), componentes `ui/padGrid.ts` y `ui/studioTabs.ts`,
vista reescrita en `app/studioView.ts`.
```

- [ ] **Step 3: Update CLAUDE.md**

En la sección del Estudio (decisión 5), añade una frase indicando que el Estudio se renombró a **PIANOVA
STUDIO** con rediseño visual estilo STORM (negro + verde neón, pestañas PADS/SAMPLES/MIXER, rejilla de pads),
sin cambios de motor; y que la pestaña SAMPLES espera al sub-proyecto del Simpler con slicing.

- [ ] **Step 4: Verify and commit**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "PIANOVA STUDIO: docs (HANDOFF/CLAUDE) y versión 0.15.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- Tema visual (negro + verde neón) → Task 1 ✅
- Reestructura de la vista (cabecera + pestañas + rejilla + pasos/params) → Tasks 2 + 3 ✅
- MIXER reubica los controles de mezcla → Task 3 (`renderMixer` con `channelStripHTML`) ✅
- SAMPLES placeholder → Task 3 (`#paneSamples`) ✅
- Renombrado PIANOVA STUDIO → Task 3 (cabecera) + Task 4 (docs) ✅
- PARÁMETROS rico para `synthx` / aviso para el resto → Task 3 (`renderSelected`) ✅
- Motor/modelo/persistencia intactos → sí (Task 3 reutiliza toda la lógica) ✅
- Docs/versión → Task 4 ✅

**Build verde en cada tarea:** Task 1 (CSS aditivo) y Task 2 (módulos nuevos) no tocan `studioView`, así que compilan solos; Task 3 los integra y deja la vista final. No hay estados rotos entre tareas.

**Placeholders:** ninguno; el código va completo. (El texto de UI "Próximamente" es contenido intencional, no un marcador pendiente. El "TODO PASS" del Step 2 de Task 3 significa "todo pasa".)

**Consistencia de tipos:** `padGridHTML(channels, selectedId)` y `studioTabsHTML(active)`/`StudioTab` (Task 2) coinciden con su uso en Task 3. Los helpers reutilizados (`channelStripHTML`, `mountStepGrid`, `mountKnob`, `mountSynthEditor`, `mountRack`, `mountTransport`, `makeChannel`, y el modelo/daw) mantienen sus firmas actuales; `studioView` solo reorganiza cómo los llama.

**Decisiones conscientes (para el revisor):**
- Se elimina el cajón del sinte (`#synthDrawer`) y el flujo `openSynthEditor`: los parámetros del sinte se muestran **inline** en PADS. El botón `data-syned` (✏️) del MIXER ahora **cambia a la pestaña PADS** en vez de abrir un cajón.
- Un **solo** grid de pasos (el del canal seleccionado), no uno por canal (fiel a STORM). El cabezal actualiza ese único grid.
- `renderSelected` **re-monta** el editor del sinte y el grid de pasos cada vez que cambia la selección (patrón de re-render por `innerHTML`, coherente con el resto de la vista; sin acumulación de listeners porque el host se reemplaza).
```
