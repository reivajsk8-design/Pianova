# EQ gráfico editable (estilo EQ Eight) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un editor visual de EQ estilo Ableton EQ Eight: 8 bandas fijas (activar/arrastrar nodos de frecuencia/ganancia/Q), curva de respuesta y analizador de espectro en tiempo real, sobre el motor de EQ v1.34.

**Architecture:** Un modelo de 8 slots (`store.eq.manual`) + un preset `'manual'`. `eqSpecFromStore('manual')` devuelve SIEMPRE 8 bandas (apagada = `peaking gain 0`), así `eqNodes[i+1]` es el biquad estable del slot `i` y se edita en vivo (`eqUpdateSlot`) sin reconstruir. Un `AnalyserNode` toma `masterFinal`. Un overlay `#eqEditor` (como `#pianoroll`) dibuja espectro + curva (`getFrequencyResponse`) + nodos en un `<canvas>` y gestiona el arrastre.

**Tech Stack:** HTML/CSS/JS vanilla en un solo archivo `pianova.html` (IIFE `'use strict'`), Web Audio API (`BiquadFilterNode`, `AnalyserNode`), Canvas 2D. Sin build. Verificación: `node --check` + balance CSS + test Node de funciones puras (Task 1) + prueba manual en Chrome/Edge y móvil (Live Server).

## Global Constraints

- **Un solo archivo** `pianova.html`; sin librerías nuevas; sin build; textos/comentarios en **español**.
- **No romper** el EQ v1.34 (`buildEq`/`eqApply`/`eqSpecFromStore`/`EQ_PRESETS`/`store.eq`, presets, importar APO), los efectos, ni el limitador/soft-clipper/makeup. El EQ sigue ANTES del limitador.
- 8 bandas FIJAS. Apagada = `peaking gain 0` (mapeo estable; **nunca** filtrar las apagadas fuera del array). Rango de ganancia ±15 dB; frecuencia 20–20000 Hz (log). Q 0.3–8.
- Reutilizar: el overlay del piano-roll como patrón (`prOpen`/`prClose`/`prFrame` con `requestAnimationFrame`, `hidden`, Esc en el `keydown` que ya cierra `#pianoroll`), `masterFinal`, `eqNodes` (v1.34), `$`, `dpr`, `status`, `saveStore`/`saveStoreDebounced`, `makeFader` no necesario aquí.
- **Táctil:** pointer events + `touch-action:none` en `#eqCanvas`; Q por barra (no rueda) en móvil.
- Tras implementar: subir `const VERSION` (de v1.34 a v1.35), actualizar `CLAUDE.md` y `HANDOFF.md`. Avisos markdownlint preexistentes: ignorar.
- Verificación base (correr antes de cada commit), desde `d:\PianoVa`:
  ```bash
  node -e "const fs=require('fs');const h=fs.readFileSync('pianova.html','utf8');const css=h.match(/<style>([\s\S]*?)<\/style>/)[1];let o=(css.match(/{/g)||[]).length,c=(css.match(/}/g)||[]).length;console.log('CSS',o,c,o===c?'OK':'MAL');const re=/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;let m,i=0;const cp=require('child_process');while((m=re.exec(h))){if(!m[1].trim())continue;const f=require('os').tmpdir()+'/pv'+i+'.js';fs.writeFileSync(f,m[1]);cp.execSync('node --check '+JSON.stringify(f));i++;}console.log('JS OK',i);"
  ```

---

### Task 1: Helpers puros (mapeo log/ganancia + manualToBands) + modelo y persistencia

**Files:**
- Create: `docs/superpowers/tests/eqedit.test.js`
- Modify: `pianova.html` — añadir constantes/helpers (tras `parseApoEq`), `EQ_MANUAL_DEFAULT`, extender
  `eqSpecFromStore` para `'manual'`, y `store.eq.manual` (init + `loadStore` + migración v1.34).

**Interfaces:**
- Produces: `EQ_FMIN=20`, `EQ_FMAX=20000`, `EQ_GAIN_RANGE=15`; `freqToX(f,w)`, `xToFreq(x,w)`,
  `gainToY(g,h)`, `yToGain(y,h)`; `manualToBands(slots)`; `eqDefaultSlots()` (8 slots por defecto);
  `eqManual()` (devuelve `store.eq.manual`, lo crea si falta). `eqSpecFromStore()` maneja `preset==='manual'`.

- [ ] **Step 1: Escribir el test que falla** — crea `docs/superpowers/tests/eqedit.test.js`:

```js
'use strict';
const assert = require('assert');

// ---- Copia EXACTA de lo que irá en pianova.html ----
const EQ_FMIN = 20, EQ_FMAX = 20000, EQ_GAIN_RANGE = 15;
function freqToX(f, w) { return Math.log(f / EQ_FMIN) / Math.log(EQ_FMAX / EQ_FMIN) * w; }
function xToFreq(x, w) { return EQ_FMIN * Math.pow(EQ_FMAX / EQ_FMIN, x / w); }
function gainToY(g, h) { return h / 2 * (1 - g / EQ_GAIN_RANGE); }
function yToGain(y, h) { return EQ_GAIN_RANGE * (1 - 2 * y / h); }
function manualToBands(slots) {
  return slots.map(s => s.on ? { type: s.type, freq: s.freq, gain: s.gain, q: s.q }
                             : { type: 'peaking', freq: s.freq, gain: 0, q: 1 });
}
// ----------------------------------------------------

const W = 800, H = 400;
// extremos del eje X
assert.ok(Math.abs(freqToX(EQ_FMIN, W) - 0) < 1e-9);
assert.ok(Math.abs(freqToX(EQ_FMAX, W) - W) < 1e-9);
// inversa freq<->X
[50, 440, 1000, 5000].forEach(f => assert.ok(Math.abs(xToFreq(freqToX(f, W), W) - f) < 1e-6, 'inv freq ' + f));
// ganancia: 0 dB en el centro, +15 arriba (y=0), -15 abajo (y=H)
assert.ok(Math.abs(gainToY(0, H) - H / 2) < 1e-9);
assert.ok(Math.abs(gainToY(EQ_GAIN_RANGE, H) - 0) < 1e-9);
assert.ok(Math.abs(gainToY(-EQ_GAIN_RANGE, H) - H) < 1e-9);
[-12, -3, 0, 6, 12].forEach(g => assert.ok(Math.abs(yToGain(gainToY(g, H), H) - g) < 1e-9, 'inv gain ' + g));
// manualToBands: activa = sus valores; apagada = peaking gain 0 (transparente)
const slots = [{ on: true, type: 'lowshelf', freq: 120, gain: 4, q: 0.7 },
               { on: false, type: 'highpass', freq: 60, gain: 0, q: 0.7 }];
assert.deepStrictEqual(manualToBands(slots)[0], { type: 'lowshelf', freq: 120, gain: 4, q: 0.7 });
assert.deepStrictEqual(manualToBands(slots)[1], { type: 'peaking', freq: 60, gain: 0, q: 1 });

console.log('eqedit.test.js OK');
```

- [ ] **Step 2: Correr el test**

Run: `node docs/superpowers/tests/eqedit.test.js`
Expected: imprime `eqedit.test.js OK`, código 0.

- [ ] **Step 3: Pegar helpers y modelo en `pianova.html`** (tras `function parseApoEq(...)`). Texto
  idéntico al del test para los helpers, más el default y `eqManual`:

```js
  // ---------- EQ gráfico editable (8 bandas) ----------
  const EQ_FMIN = 20, EQ_FMAX = 20000, EQ_GAIN_RANGE = 15;
  function freqToX(f, w) { return Math.log(f / EQ_FMIN) / Math.log(EQ_FMAX / EQ_FMIN) * w; }
  function xToFreq(x, w) { return EQ_FMIN * Math.pow(EQ_FMAX / EQ_FMIN, x / w); }
  function gainToY(g, h) { return h / 2 * (1 - g / EQ_GAIN_RANGE); }
  function yToGain(y, h) { return EQ_GAIN_RANGE * (1 - 2 * y / h); }
  // Una banda apagada se mapea a peaking gain 0 (transparente): la cadena tiene SIEMPRE 8 biquads.
  function manualToBands(slots) {
    return slots.map(s => s.on ? { type: s.type, freq: s.freq, gain: s.gain, q: s.q }
                               : { type: 'peaking', freq: s.freq, gain: 0, q: 1 });
  }
  // 8 bandas por defecto (todas apagadas = plano), repartidas como un EQ Eight.
  function eqDefaultSlots() { return [
    { on: false, type: 'highpass',  freq: 60,    gain: 0, q: 0.7 },
    { on: false, type: 'lowshelf',  freq: 120,   gain: 0, q: 0.7 },
    { on: false, type: 'peaking',   freq: 300,   gain: 0, q: 1 },
    { on: false, type: 'peaking',   freq: 800,   gain: 0, q: 1 },
    { on: false, type: 'peaking',   freq: 2000,  gain: 0, q: 1 },
    { on: false, type: 'peaking',   freq: 5000,  gain: 0, q: 1 },
    { on: false, type: 'highshelf', freq: 9000,  gain: 0, q: 0.7 },
    { on: false, type: 'lowpass',   freq: 14000, gain: 0, q: 0.7 } ]; }
  function eqManual() {
    if (!store.eq.manual) store.eq.manual = { preamp: 0, slots: eqDefaultSlots() };
    return store.eq.manual;
  }
```

- [ ] **Step 4: Extender `eqSpecFromStore` para `'manual'`.** En `eqSpecFromStore`, al principio (antes
  del `if (e.preset === 'custom' …)`), añade:

```js
    if (e.preset === 'manual') { const m = eqManual(); return { preamp: m.preamp || 0, bands: manualToBands(m.slots) }; }
```

- [ ] **Step 5: Persistencia de `store.eq.manual`.**
  - En el `let store = { …, eq: { preset: 'plano', custom: null } };` añade `manual: { preamp: 0, slots: eqDefaultSlots() }` dentro de `eq` (queda `eq: { preset:'plano', custom:null, manual:{ preamp:0, slots: eqDefaultSlots() } }`).
  - En `loadStore`, tras `store.eq = o.eq || { … };`, añade la **migración** desde v1.34 (que no tenía `manual`): `if (!store.eq.manual) store.eq.manual = { preamp: 0, slots: eqDefaultSlots() };`

- [ ] **Step 6: Verificar** (test + sintaxis base). Expected: `eqedit.test.js OK`, `CSS .. OK`, `JS OK 2`.

- [ ] **Step 7: Commit**

```bash
git add pianova.html docs/superpowers/tests/eqedit.test.js
git commit -m "EQ editor: helpers puros (mapeo log/ganancia) + modelo de 8 bandas + manual en eqSpecFromStore, con test"
```

---

### Task 2: Analizador de espectro + edición en vivo (`eqUpdateSlot`/`eqUpdatePreamp`)

**Files:**
- Modify: `pianova.html` — `setupMasterBus` (añadir `eqAnalyser`), estado, y `eqUpdateSlot`/`eqUpdatePreamp`.

**Interfaces:**
- Consumes: `masterFinal`, `eqNodes` (v1.34: `[eqInput, banda0..bandaN]`), `eqManual`.
- Produces: `eqAnalyser` (AnalyserNode), `eqUpdateSlot(i)`, `eqUpdatePreamp()`.

- [ ] **Step 1: Declarar estado.** Junto a `let eqInput = null, eqNodes = [], currentEq = …;` (v1.34) añade:
  `let eqAnalyser = null;`

- [ ] **Step 2: Crear el analizador en `setupMasterBus`.** Tras la línea que conecta
  `masterFinal.connect(actx.destination);`, añade la toma en paralelo:

```js
    eqAnalyser = actx.createAnalyser(); eqAnalyser.fftSize = 2048; eqAnalyser.smoothingTimeConstant = 0.8;
    masterFinal.connect(eqAnalyser);     // toma para el espectro del editor (no altera la salida)
```

- [ ] **Step 3: Edición en vivo de un slot.** Añade tras `eqApply` (o junto a las funciones del EQ):

```js
  // Aplica el slot i del EQ manual al biquad vivo eqNodes[i+1] (sin reconstruir la cadena).
  function eqUpdateSlot(i) {
    const node = eqNodes[i + 1]; if (!node || !actx) return;
    const s = eqManual().slots[i], t = actx.currentTime;
    if (s.on) {
      node.type = s.type;
      node.frequency.setTargetAtTime(s.freq, t, 0.01);
      node.gain.setTargetAtTime(s.gain, t, 0.01);
      node.Q.setTargetAtTime(s.q, t, 0.01);
    } else {
      node.type = 'peaking'; node.gain.setTargetAtTime(0, t, 0.01);
    }
  }
  // Aplica el preamp del EQ manual al nodo de entrada (eqNodes[0] = eqInput).
  function eqUpdatePreamp() {
    if (!eqNodes[0] || !actx) return;
    eqNodes[0].gain.setTargetAtTime(Math.pow(10, (eqManual().preamp || 0) / 20), actx.currentTime, 0.01);
  }
```

- [ ] **Step 4: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 5: Verificación manual** (Live Server, consola): tras crear audio, `eqAnalyser` existe;
  `store.eq.preset='manual'; eqApply(eqSpecFromStore());` crea 8 nodos; `store.eq.manual.slots[1].on=true;
  store.eq.manual.slots[1].gain=8; eqUpdateSlot(1)` → se oye realce de graves en vivo. No hay clipping.

- [ ] **Step 6: Commit**

```bash
git add pianova.html
git commit -m "EQ editor: AnalyserNode de espectro + edicion en vivo (eqUpdateSlot/eqUpdatePreamp)"
```

---

### Task 3: Overlay `#eqEditor` (HTML/CSS) + botón, abrir/cerrar, opción 'manual'

**Files:**
- Modify: `pianova.html` — HTML del overlay (junto a `#pianoroll`), botón en `#lpfx`, CSS, y JS de
  apertura/cierre + opción `'manual'` en `#eqPreset` + Esc.

**Interfaces:**
- Consumes: `eqApply`, `eqSpecFromStore`, `refreshEqUI` (v1.34), `store.eq`, `dpr`.
- Produces: `#eqEditor`/`#eqCanvas`/`#eqEdBands`/`#eqQ`/`#eqPreamp`/`#eqEdClose`/`#eqOpen`,
  `eqOpenEditor()`, `eqCloseEditor()`, `eqFrame()`, `eqSelBand` (−1), `eqRAF` (0).
  (El dibujo real `eqDraw()` y la interacción llegan en Tasks 4–5; aquí `eqFrame` llama a `eqDraw` si existe.)

- [ ] **Step 1: HTML del overlay.** Junto a `<div id="pianoroll" hidden>…</div>` añade:

```html
  <div id="eqEditor" hidden>
    <div class="eqEdPanel">
      <div class="eqEdHead">
        <b>Ecualizador</b>
        <span class="eqEdLab">Preamp</span>
        <input type="range" id="eqPreamp" min="-12" max="12" step="0.5" value="0">
        <span id="eqPreampVal">0 dB</span>
        <span class="eqEdLab">Banda</span><span id="eqSelLab">—</span>
        <span class="eqEdLab">Q</span>
        <input type="range" id="eqQ" min="0.3" max="8" step="0.1" value="1" disabled>
        <div class="grow"></div>
        <button id="eqEdClose" class="primary">✕ Cerrar</button>
      </div>
      <div class="eqEdCanvasWrap"><canvas id="eqCanvas"></canvas></div>
      <div class="eqEdBands" id="eqEdBands"></div>
    </div>
  </div>
```

- [ ] **Step 2: Botón "Editar EQ" en "Mezcla maestra".** En la `<div class="eqCtl">` (v1.34), tras el
  botón `#eqImport`, añade: `<button id="eqOpen" title="Editor gráfico de EQ">✎ Editar EQ</button>`

- [ ] **Step 3: CSS.** Tras las reglas `.eqCtl{…}` añade:

```css
  #eqEditor{position:fixed; inset:0; z-index:1200; background:rgba(8,10,14,.92); display:none}
  #eqEditor:not([hidden]){display:flex}
  .eqEdPanel{margin:auto; width:min(960px,96vw); height:min(620px,92vh); background:var(--panel);
    border:1px solid var(--line); border-radius:16px; display:flex; flex-direction:column; padding:14px; gap:10px}
  .eqEdHead{display:flex; align-items:center; gap:10px; flex-wrap:wrap}
  .eqEdLab{font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted)}
  .eqEdCanvasWrap{flex:1; min-height:200px; border:1px solid var(--line); border-radius:12px; overflow:hidden; background:#0c0e13}
  #eqCanvas{display:block; width:100%; height:100%; touch-action:none}
  .eqEdBands{display:flex; gap:8px; flex-wrap:wrap}
  .eqEdBand{display:flex; flex-direction:column; align-items:center; gap:3px}
  .eqEdBand .eqBtn{width:30px; height:30px; padding:0; border-radius:8px; font-weight:700}
  .eqEdBand .eqBtn.on{background:var(--amber); color:#1a1306; border-color:var(--amber)}
  .eqEdBand select{font-size:11px; padding:2px 4px}
```

- [ ] **Step 4: JS — abrir/cerrar + frame + opción 'manual'.** Añade cerca de `refreshEqUI` (v1.34):

```js
  // ---------- Overlay del editor de EQ ----------
  const eqCanvas = $('eqCanvas');
  let eqSelBand = -1, eqRAF = 0;
  function eqFrame() {
    if ($('eqEditor').hidden) { eqRAF = 0; return; }
    if (typeof eqDraw === 'function') eqDraw();
    eqRAF = requestAnimationFrame(eqFrame);
  }
  function eqOpenEditor() {
    ensureAudio();
    store.eq.preset = 'manual'; saveStore();
    refreshEqUI();
    eqApply(eqSpecFromStore());            // construye las 8 bandas
    eqSelBand = -1;
    $('eqPreamp').value = eqManual().preamp || 0; $('eqPreampVal').textContent = ($('eqPreamp').value | 0) + ' dB';
    if (typeof eqBuildBands === 'function') eqBuildBands();
    $('eqEditor').hidden = false;
    if (!eqRAF) eqRAF = requestAnimationFrame(eqFrame);
  }
  function eqCloseEditor() {
    $('eqEditor').hidden = true;
    if (eqRAF) { cancelAnimationFrame(eqRAF); eqRAF = 0; }
  }
  $('eqOpen').addEventListener('click', eqOpenEditor);
  $('eqEdClose').addEventListener('click', eqCloseEditor);
```

- [ ] **Step 5: Opción 'manual' en el desplegable + Esc.**
  - En `refreshEqUI` (v1.34), tras añadir las opciones de `EQ_PRESETS`, añade la opción manual antes de
    la del perfil importado: `html += '<option value="manual">Manual (editor)</option>';`
  - En el listener `keydown` que ya cierra el piano-roll (busca `if (ev.key === 'Escape' && !$('pianoroll').hidden) { prClose(); return; }`), añade antes una línea para el editor:
    `if (ev.key === 'Escape' && !$('eqEditor').hidden) { eqCloseEditor(); return; }`

- [ ] **Step 6: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 7: Verificación manual** (Live Server): en "Mezcla maestra" aparece "✎ Editar EQ"; al
  pulsarlo se abre el overlay (lienzo vacío de momento), el desplegable de EQ marca "Manual (editor)";
  ✕ y Esc lo cierran. (El dibujo y la edición llegan en Tasks 4–5.)

- [ ] **Step 8: Commit**

```bash
git add pianova.html
git commit -m "EQ editor: overlay #eqEditor + boton Editar EQ + abrir/cerrar/Esc + opcion manual"
```

---

### Task 4: Render del lienzo (`eqDraw`: rejilla + espectro + curva + nodos) y bandas

**Files:**
- Modify: `pianova.html` — añadir `eqResize`, `eqDraw`, `eqBuildBands`.

**Interfaces:**
- Consumes: `eqCanvas`, `dpr`, `eqAnalyser`, `eqNodes`, `freqToX`/`gainToY`/`xToFreq`, `eqManual`, `eqSelBand`, `actx`.
- Produces: `eqDraw()`, `eqResize()`, `eqBuildBands()`. (`eqFrame` ya llama a `eqDraw`.)

- [ ] **Step 1: `eqResize` y `eqDraw`.** Añade cerca de `eqOpenEditor`:

```js
  function eqResize() {
    const r = eqCanvas.getBoundingClientRect();
    eqCanvas.width = Math.max(1, Math.round(r.width * dpr));
    eqCanvas.height = Math.max(1, Math.round(r.height * dpr));
  }
  function eqDraw() {
    if ($('eqEditor').hidden || !eqCanvas) return;
    eqResize();
    const ctx = eqCanvas.getContext('2d'), w = eqCanvas.width / dpr, h = eqCanvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // rejilla de frecuencia (100/1k/10k) y de ganancia (0, ±6, ±12)
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.fillStyle = '#7b818e'; ctx.font = '10px ui-monospace,monospace';
    [100, 1000, 10000].forEach(f => { const x = freqToX(f, w); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      ctx.fillText(f >= 1000 ? (f / 1000) + 'k' : '' + f, x + 3, h - 4); });
    [-12, -6, 0, 6, 12].forEach(g => { const y = gainToY(g, h); ctx.strokeStyle = g === 0 ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.07)';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); ctx.fillStyle = '#7b818e'; ctx.fillText((g > 0 ? '+' : '') + g, 3, y - 2); });
    // espectro (montaña gris)
    if (eqAnalyser && actx) {
      const bins = eqAnalyser.frequencyBinCount, data = new Uint8Array(bins);
      eqAnalyser.getByteFrequencyData(data); const nyq = actx.sampleRate / 2;
      ctx.fillStyle = 'rgba(150,160,180,.16)'; ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 2) { const f = xToFreq(x, w); const bin = Math.min(bins - 1, Math.max(0, Math.round(f / nyq * bins)));
        ctx.lineTo(x, h - (data[bin] / 255) * h); }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    }
    // curva de respuesta combinada (producto de magnitudes de los 8 biquads vivos)
    if (eqNodes.length > 1 && actx) {
      const N = 256, freqs = new Float32Array(N), mag = new Float32Array(N), ph = new Float32Array(N), tot = new Float32Array(N);
      for (let i = 0; i < N; i++) { freqs[i] = xToFreq(i / (N - 1) * w, w); tot[i] = 1; }
      for (let k = 1; k < eqNodes.length; k++) { eqNodes[k].getFrequencyResponse(freqs, mag, ph); for (let i = 0; i < N; i++) tot[i] *= mag[i]; }
      ctx.strokeStyle = '#f2a33c'; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < N; i++) { const db = 20 * Math.log10(tot[i] || 1e-6); const x = i / (N - 1) * w, y = gainToY(db, h); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); ctx.lineWidth = 1;
    }
    // nodos de las bandas activas
    const slots = eqManual().slots;
    slots.forEach((s, i) => { if (!s.on) return; const x = freqToX(s.freq, w), y = gainToY(Math.max(-EQ_GAIN_RANGE, Math.min(EQ_GAIN_RANGE, s.gain)), h);
      ctx.fillStyle = (i === eqSelBand) ? '#fff' : '#f2a33c'; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1306'; ctx.font = 'bold 11px ui-monospace,monospace'; ctx.fillText('' + (i + 1), x - 3, y + 4); });
  }
```

- [ ] **Step 2: `eqBuildBands` (8 toggles + selector de tipo).** Añade:

```js
  const EQ_TYPES = [['peaking', 'Campana'], ['lowshelf', 'Shelf grave'], ['highshelf', 'Shelf agudo'], ['highpass', 'Paso alto'], ['lowpass', 'Paso bajo']];
  function eqBuildBands() {
    const wrap = $('eqEdBands'); if (!wrap) return; const slots = eqManual().slots; let html = '';
    slots.forEach((s, i) => {
      let opt = ''; EQ_TYPES.forEach(t => opt += '<option value="' + t[0] + '"' + (s.type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>');
      html += '<div class="eqEdBand"><button class="eqBtn' + (s.on ? ' on' : '') + '" data-eqband="' + i + '">' + (i + 1) + '</button>' +
              '<select data-eqtype="' + i + '">' + opt + '</select></div>';
    });
    wrap.innerHTML = html;
  }
```

- [ ] **Step 3: Llamar a `eqResize`/`eqBuildBands` al abrir.** Ya en Task 3 `eqOpenEditor` llama
  `eqBuildBands()`; el `eqDraw` llama `eqResize`. No hace falta más aquí.

- [ ] **Step 4: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 5: Verificación manual** (Live Server): abrir "✎ Editar EQ" → se ve la **rejilla**, el
  **espectro** moviéndose con la música y, al activar una banda por consola
  (`eqManual().slots[2].on=true; eqUpdateSlot(2)`), su **nodo** y la **curva** ámbar. Los 8 botones de
  banda + selectores de tipo aparecen debajo.

- [ ] **Step 6: Commit**

```bash
git add pianova.html
git commit -m "EQ editor: render del lienzo (rejilla + espectro + curva + nodos) + controles de banda"
```

---

### Task 5: Interacción (arrastrar nodos, rueda Q, toggles, tipo, Q/preamp)

**Files:**
- Modify: `pianova.html` — listeners de `#eqCanvas` (pointer/wheel), `#eqEdBands` (toggle/tipo),
  `#eqQ`, `#eqPreamp`.

**Interfaces:**
- Consumes: `eqCanvas`, `eqManual`, `eqUpdateSlot`, `eqUpdatePreamp`, `eqDraw`, `eqBuildBands`,
  `freqToX`/`gainToY`/`xToFreq`/`yToGain`, `eqSelBand`, `saveStoreDebounced`, `dpr`.
- Produces: la edición completa (arrastre + Q + tipos + preamp), persistida.

- [ ] **Step 1: Hit-test + arrastre de nodos.** Añade:

```js
  // Devuelve el índice de la banda ACTIVA cuyo nodo está bajo (px,py), o -1.
  function eqBandAt(px, py, w, h) {
    const slots = eqManual().slots; let best = -1, bd = 16 * 16;
    slots.forEach((s, i) => { if (!s.on) return; const x = freqToX(s.freq, w), y = gainToY(s.gain, h);
      const d = (x - px) * (x - px) + (y - py) * (y - py); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  let eqDrag = -1;
  eqCanvas.addEventListener('pointerdown', e => {
    const r = eqCanvas.getBoundingClientRect(), w = r.width, h = r.height;
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const i = eqBandAt(px, py, w, h);
    if (i >= 0) { eqSelBand = i; eqDrag = i; eqSyncSel(); eqDraw(); eqCanvas.setPointerCapture(e.pointerId); }
  });
  eqCanvas.addEventListener('pointermove', e => {
    if (eqDrag < 0) return; const r = eqCanvas.getBoundingClientRect(), w = r.width, h = r.height;
    const px = Math.max(0, Math.min(w, e.clientX - r.left)), py = Math.max(0, Math.min(h, e.clientY - r.top));
    const s = eqManual().slots[eqDrag];
    s.freq = Math.max(EQ_FMIN, Math.min(EQ_FMAX, xToFreq(px, w)));
    s.gain = Math.max(-EQ_GAIN_RANGE, Math.min(EQ_GAIN_RANGE, yToGain(py, h)));
    eqUpdateSlot(eqDrag); eqDraw(); saveStoreDebounced();
  });
  eqCanvas.addEventListener('pointerup', () => { eqDrag = -1; });
  eqCanvas.addEventListener('wheel', e => {
    const r = eqCanvas.getBoundingClientRect(), w = r.width, h = r.height;
    const i = eqBandAt(e.clientX - r.left, e.clientY - r.top, w, h);
    if (i < 0) return; e.preventDefault();
    const s = eqManual().slots[i]; s.q = Math.max(0.3, Math.min(8, s.q * (e.deltaY > 0 ? 0.9 : 1.1)));
    eqSelBand = i; eqUpdateSlot(i); eqSyncSel(); eqDraw(); saveStoreDebounced();
  }, { passive: false });
```

- [ ] **Step 2: Sincronizar la banda seleccionada (etiqueta + barra Q).** Añade:

```js
  function eqSyncSel() {
    const lab = $('eqSelLab'), q = $('eqQ');
    if (eqSelBand < 0) { lab.textContent = '—'; q.value = 1; q.disabled = true; return; }
    lab.textContent = '' + (eqSelBand + 1); q.disabled = false; q.value = eqManual().slots[eqSelBand].q;
  }
```

- [ ] **Step 3: Toggles, tipo, Q y preamp.** Añade:

```js
  $('eqEdBands').addEventListener('click', e => {
    const b = e.target.closest('[data-eqband]'); if (!b) return;
    const i = +b.dataset.eqband, s = eqManual().slots[i]; s.on = !s.on;
    eqSelBand = s.on ? i : -1; eqUpdateSlot(i); eqBuildBands(); eqSyncSel(); eqDraw(); saveStore();
  });
  $('eqEdBands').addEventListener('change', e => {
    const sel = e.target.closest('[data-eqtype]'); if (!sel) return;
    const i = +sel.dataset.eqtype; eqManual().slots[i].type = sel.value; eqUpdateSlot(i); eqDraw(); saveStore();
  });
  $('eqQ').addEventListener('input', e => {
    if (eqSelBand < 0) return; eqManual().slots[eqSelBand].q = parseFloat(e.target.value);
    eqUpdateSlot(eqSelBand); eqDraw(); saveStoreDebounced();
  });
  $('eqPreamp').addEventListener('input', e => {
    eqManual().preamp = parseFloat(e.target.value); $('eqPreampVal').textContent = (parseFloat(e.target.value) | 0) + ' dB';
    eqUpdatePreamp(); saveStoreDebounced();
  });
```

- [ ] **Step 4: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 5: Verificación manual** (Chrome/Edge + móvil, Live Server): abrir el editor; activar
  bandas con los botones 1–8; **arrastrar** sus nodos (frecuencia/ganancia) y oír el cambio en vivo;
  **rueda** sobre un nodo cambia la Q (PC); en móvil, seleccionar un nodo y mover la **barra Q**;
  cambiar el **tipo** de banda; mover **Preamp**. La curva y el espectro reaccionan. Cerrar/reabrir y
  **recargar** mantienen el ajuste. No hay clipping. El resto de la app no cambia.

- [ ] **Step 6: Commit**

```bash
git add pianova.html
git commit -m "EQ editor: interaccion (arrastrar nodos, rueda Q, toggles, tipo, Q/preamp) con persistencia"
```

---

### Task 6: Versión y documentación

**Files:**
- Modify: `pianova.html` (`const VERSION`), `CLAUDE.md`, `HANDOFF.md`.

- [ ] **Step 1: Subir versión.** `const VERSION = 'v1.34';` → `const VERSION = 'v1.35';` con comentario
  `// EQ gráfico editable estilo EQ Eight (8 bandas + espectro)`.

- [ ] **Step 2: `HANDOFF.md`.** Subir `**Versión:**` a v1.35 y añadir un bloque "**EQ gráfico editable
  (v1.35):**" explicando (español): editor estilo EQ Eight sobre el motor v1.34; 8 bandas fijas
  (`store.eq.manual.slots`, preset `'manual'`); mapeo estable (apagada = peaking gain 0 → siempre 8
  biquads, `eqNodes[i+1]`), edición en vivo (`eqUpdateSlot`/`eqUpdatePreamp`); `AnalyserNode`
  (`eqAnalyser` sobre `masterFinal`); overlay `#eqEditor` con `<canvas>` (rejilla + espectro + curva
  `getFrequencyResponse` + nodos, `eqDraw`/`eqResize`); interacción arrastrar/rueda/táctil
  (`freqToX`/`xToFreq`/`gainToY`/`yToGain`); persistido en `store.eq.manual`; abrir con "✎ Editar EQ".

- [ ] **Step 3: `CLAUDE.md`.** En la sección de Audio/EQ, añadir una frase: hay un **editor gráfico de
  EQ** (overlay `#eqEditor`, botón "✎ Editar EQ") de 8 bandas (`store.eq.manual`, preset `'manual'`)
  con espectro (`eqAnalyser`) y curva (`getFrequencyResponse`), editado en vivo (`eqUpdateSlot`); usa
  el motor `buildEq` del EQ maestro.

- [ ] **Step 4: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 5: Commit**

```bash
git add pianova.html CLAUDE.md HANDOFF.md
git commit -m "EQ grafico editable v1.35: version y docs"
```

---

## Notas de ejecución
- El mapeo estable (SIEMPRE 8 biquads; apagada = peaking gain 0) es lo que permite `eqUpdateSlot` en
  vivo sin reconstruir ni clics. No filtrar las apagadas fuera del array.
- `getFrequencyResponse` se llama sobre los `eqNodes` vivos (existen tras abrir el editor, que hace
  `eqApply`). El bucle rAF (`eqFrame`) solo corre con el overlay abierto.
- Las funciones puras (`freqToX`/`xToFreq`/`gainToY`/`yToGain`/`manualToBands`) se duplican en
  `docs/superpowers/tests/eqedit.test.js` a propósito (sin build); texto idéntico.
- `store.eq` ya existe (v1.34); se le añade `manual` con migración en `loadStore` para no romper datos
  guardados. Presets e importar APO siguen igual.
- Los realces grandes los contiene el limitador/soft-clipper/makeup; el `preamp` da margen.
