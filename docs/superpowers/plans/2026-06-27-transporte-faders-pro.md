# Transporte pro + faders verticales — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al Looper aspecto de DAW: barra de transporte con BPM grande editable y metrónomo con
volumen, y faders verticales para volumen de canal y efectos, reutilizando el modelo de datos y la
integración MIDI actuales.

**Architecture:** Todo en `pianova.html`. Un componente reutilizable `makeFader` crea faders DOM
(pista + relleno + cap arrastrable + valor + etiqueta) con arrastre por puntero, doble-clic = reset y
`setValue` (para que los knobs MIDI muevan el fader sin bucles). Se registran en `lpFaders` por clave
(`vol:i`, `fx:param`, `metro`) para que `setChannelVolFromCC`/`setFxParam` actualicen su visual. El
volumen del metrónomo es un nuevo `lpClickVol` que escala el clic. La barra de transporte se reestructura
con un BPM grande editable ligado a `lpTempoEl`.

**Tech Stack:** HTML+CSS+JS inline (IIFE `'use strict'`), Canvas no; DOM + pointer events. Sin
librerías. Verificación: `node --check` + tests Node de funciones puras + prueba manual Chrome/Edge.

## Global Constraints

- **Un solo archivo** `pianova.html`; sin librerías; sin build; `smplr` intacto.
- **Textos e interfaz en español.** **No empeorar** táctil/móvil (faders arrastrables con el dedo,
  `touch-action:none`). **No romper** la integración MIDI (`volMap`/`fxMap`/`midiMap.lp_play`).
- Reutiliza: `lp.channels[i].vol`, `fxParams` (`filter`/`delayTime`/`delayAmount`/`reverb`),
  `applyFx()`, `setChannelVolFromCC`, `setFxParam`, `volMap`/`volLearn`/`refreshVolLearnUI`,
  `fxMap`/`fxLearn`/`refreshFxUI`, `lpClickSound`, `lpTempoEl`/`lpTempoVal`, `lpTogglePlay`, `store`.
- BPM rango **50–160** (como hoy); `lpTempoEl` (`#lpTempo`) sigue siendo la fuente de verdad del tempo.
- Verificación de sintaxis tras cada tarea:
  ```bash
  node -e "const fs=require('fs');const h=fs.readFileSync('pianova.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('pv_check.js',m.map(x=>x[1]).join('\n;\n'));" && node --check pv_check.js && echo SINTAXIS_OK && rm -f pv_check.js
  ```

---

### Task 1: Componente `makeFader` + CSS + test

**Files:**
- Modify: `pianova.html` — JS (componente `makeFader` + registro `lpFaders`), CSS (`.fader*`).
- Test: `scratchpad/fader_test.js` (no se commitea).

**Interfaces:**
- Produces:
  - `const lpFaders = {}` (clave → API del fader).
  - `makeFader(opts) -> { el, setValue(v), value }` con
    `opts = { key?, min, max, step?, def, value?, fmt?, color?, label?, onInput? }`.
  - `setValue(v)` actualiza visual + valor **sin** llamar a `onInput` (evita bucles con MIDI).
  - `faderFrac(value,min,max) -> number` (0..1), pura, para test.

- [ ] **Step 1: Test Node de la conversión valor↔fracción**

`scratchpad/fader_test.js`:
```js
function faderFrac(value, min, max){ return (value - min) / (max - min); }
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
if (faderFrac(0.5,0,1)!==0.5) throw new Error('FALLO frac 0.5');
if (faderFrac(90,50,160)!==(40/110)) throw new Error('FALLO frac bpm');
if (clamp(2,0,1)!==1 || clamp(-1,0,1)!==0) throw new Error('FALLO clamp');
// paso (step) redondea
function snapStep(v, step){ return step ? Math.round(v/step)*step : v; }
if (snapStep(0.83,0.05)!==0.85) throw new Error('FALLO step');
console.log('TEST_OK fader');
```

- [ ] **Step 2: Ejecutar el test**
Run: `node scratchpad/fader_test.js`
Expected: `TEST_OK fader`

- [ ] **Step 3: Añadir `makeFader` y `lpFaders` en `pianova.html`** (en la sección del Looper, cerca de `setChannelVolFromCC`)

```javascript
  // ---------- Fader vertical reutilizable (mezclador) ----------
  const lpFaders = {};   // clave -> { el, setValue, value }
  function makeFader(opts) {
    const wrap = document.createElement('div'); wrap.className = 'fader';
    wrap.innerHTML = '<span class="fVal"></span><div class="fTrack"><div class="fFill"></div>' +
                     '<div class="fCap"></div></div><span class="fLab"></span>';
    const fill = wrap.querySelector('.fFill'), cap = wrap.querySelector('.fCap'),
          valEl = wrap.querySelector('.fVal'), labEl = wrap.querySelector('.fLab'),
          track = wrap.querySelector('.fTrack');
    if (opts.color) fill.style.background = opts.color;
    labEl.innerHTML = opts.label || '';
    const min = opts.min, max = opts.max, def = opts.def;
    const fmt = opts.fmt || (v => String(Math.round(v)));
    let value = (opts.value != null ? opts.value : def);
    function render() {
      const f = Math.max(0, Math.min(1, (value - min) / (max - min)));
      fill.style.height = (f * 100) + '%';
      cap.style.bottom = 'calc(' + (f * 100) + '% - 7px)';
      valEl.textContent = fmt(value);
    }
    function set(v, fire) {
      value = Math.max(min, Math.min(max, v));
      if (opts.step) value = Math.round(value / opts.step) * opts.step;
      render(); if (fire && opts.onInput) opts.onInput(value);
    }
    let dragging = false, dy = 0, dv = 0;
    track.addEventListener('pointerdown', e => { dragging = true; dy = e.clientY; dv = value;
      track.setPointerCapture(e.pointerId); e.preventDefault(); });
    track.addEventListener('pointermove', e => { if (!dragging) return;
      const h = track.getBoundingClientRect().height || 1;
      set(dv + ((dy - e.clientY) / h) * (max - min), true); });
    const end = () => { dragging = false; };
    track.addEventListener('pointerup', end); track.addEventListener('pointercancel', end);
    wrap.addEventListener('dblclick', () => set(def, true));
    render();
    const api = { el: wrap, setValue: v => set(v, false), get value() { return value; } };
    if (opts.key) lpFaders[opts.key] = api;
    return api;
  }
```

- [ ] **Step 4: Añadir el CSS del fader** (tras el bloque CSS del looper, p. ej. junto a `.lpfx`)

```css
  .fader{display:flex; flex-direction:column; align-items:center; gap:4px; width:44px}
  .fader .fVal{font-family:ui-monospace,monospace; font-size:11px; color:var(--ink)}
  .fader .fTrack{position:relative; width:8px; height:96px; background:#12161d;
    border:1px solid var(--line); border-radius:6px; touch-action:none; cursor:ns-resize}
  .fader .fTrack::before{content:""; position:absolute; left:50%; top:6px; bottom:6px; width:2px;
    transform:translateX(-50%); background:#222a36}
  .fader .fFill{position:absolute; left:-1px; right:-1px; bottom:0; border-radius:0 0 6px 6px;
    background:var(--amber)}
  .fader .fCap{position:absolute; left:-7px; right:-7px; height:14px; border-radius:4px;
    background:#cfd6e0; box-shadow:0 2px 5px rgba(0,0,0,.6)}
  .fader .fLab{font-size:10px; color:var(--muted); text-align:center; line-height:1.05}
```

- [ ] **Step 5: Verificar sintaxis y test**
Run: `node scratchpad/fader_test.js && ` + (comando de verificación) → `TEST_OK fader` y `SINTAXIS_OK`.

- [ ] **Step 6: Commit**
```bash
git add pianova.html
git commit -m "Faders: componente makeFader (vertical, arrastre, reset, setValue) + CSS + test"
```

---

### Task 2: Rack de efectos → faders + volumen de metrónomo (`lpClickVol`)

**Files:**
- Modify: `pianova.html` — HTML `#lpfx` (≈495-505), `lpClickSound` (≈930), `setFxParam`/`refreshFxUI`
  (≈1587-1605), estado + `store`, y el construir el rack al iniciar.

**Interfaces:**
- Consumes: `makeFader`, `lpFaders`, `fxParams`, `applyFx`, `fxLearn`/`fxMap`, `store`.
- Produces: faders de efectos (`lpFaders['fx:'+param]`) + fader `lpFaders['metro']`; variable
  `lpClickVol` (0..1) aplicada en `lpClickSound` y persistida.

- [ ] **Step 1: Estado del volumen de metrónomo**
Cerca de `const fxParams = …` (≈699) añadir:
```javascript
  let lpClickVol = 0.8;   // volumen del clic del metrónomo (0..1)
```

- [ ] **Step 2: Aplicar `lpClickVol` en `lpClickSound`** (≈937)
Reemplazar la línea del pico por:
```javascript
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, (accent ? 0.20 : 0.12) * lpClickVol), t + 0.002);
```

- [ ] **Step 3: Vaciar el HTML de `#lpfx`** (≈495-505) dejando solo el contenedor:
```html
      <div class="lpfx" id="lpfx">
        <span class="lpmidiLabel">Mezcla maestra:</span>
        <div id="lpfxRack" class="lpfxRack"></div>
      </div>
```
Y CSS (junto a `.fader`):
```css
  .lpfxRack{display:flex; gap:16px; align-items:flex-end; flex-wrap:wrap}
  .lpfxRack .faderCol{display:flex; flex-direction:column; align-items:center; gap:4px}
  .lpfxRack .fxLearn{padding:1px 6px; font-size:11px; line-height:1; background:transparent; border:1px solid var(--line); border-radius:6px}
  .lpfxRack .fxLearn.assigned{border-color:var(--green); color:var(--green)}
  .lpfxRack .fxLearn.learning{background:var(--amber); color:#1a1306; border-color:var(--amber)}
```

- [ ] **Step 4: Construir el rack de faders** (en la inicialización del Looper, donde se cablean los listeners de efectos; sustituye el cableado de los sliders `#lpfx [data-fx]`)
```javascript
  function buildFxRack() {
    const rack = $('lpfxRack'); rack.innerHTML = '';
    const defs = [
      { key:'fx:filter', label:'Filtro', min:0, max:1, step:0.01, def:0.5, color:'#9fd0f0', param:'filter', fmt:v=>v.toFixed(2) },
      { key:'fx:delayTime', label:'Delay<br>tiempo', min:0, max:0.6, step:0.01, def:0.3, color:'#c79bf0', param:'delayTime', fmt:v=>v.toFixed(2) },
      { key:'fx:delayAmount', label:'Delay<br>cant.', min:0, max:1, step:0.05, def:0, color:'#c79bf0', param:'delayAmount', fmt:v=>v.toFixed(2) },
      { key:'fx:reverb', label:'Reverb', min:0, max:1, step:0.05, def:0, color:'#7ad3c7', param:'reverb', fmt:v=>v.toFixed(2) },
      { key:'metro', label:'Metr.', min:0, max:1, step:0.05, def:0.8, color:'#ffce7a', metro:true, fmt:v=>v.toFixed(2) }
    ];
    defs.forEach(d => {
      const col = document.createElement('div'); col.className = 'faderCol';
      const f = makeFader({ key:d.key, label:d.label, min:d.min, max:d.max, step:d.step, def:d.def,
        color:d.color, fmt:d.fmt,
        value: d.metro ? lpClickVol : fxParams[d.param],
        onInput: v => { if (d.metro) { lpClickVol = v; saveStoreDebounced(); }
                        else { setFxParam(d.param, v); saveStoreDebounced(); } } });
      col.appendChild(f.el);
      if (!d.metro) {   // botón 🎛 para mapear el efecto a un knob
        const b = document.createElement('button'); b.className = 'fxLearn'; b.dataset.fxlearn = d.param;
        b.title = 'Asignar un knob'; b.textContent = '🎛'; col.appendChild(b);
      }
      rack.appendChild(col);
    });
    refreshFxUI();
  }
```
Llamar `buildFxRack()` en el arranque (donde antes se inicializaban los efectos). El cableado de
`#lpfx [data-fx]` por `input` se ELIMINA (ahora lo maneja `onInput` del fader). El listener de
`[data-fxlearn]` (clic 🎛) se mantiene; sigue funcionando porque los botones tienen `data-fxlearn`.

- [ ] **Step 5: `setFxParam`/`refreshFxUI` actualizan el fader (no el slider)** (≈1587-1605)
```javascript
  function setFxParam(param, value) {     // value en las unidades del fader
    fxParams[param] = value; applyFx();
    const f = lpFaders['fx:' + param]; if (f) f.setValue(value);
  }
  function refreshFxUI() {
    ['filter','delayTime','delayAmount','reverb'].forEach(p => { const f = lpFaders['fx:'+p]; if (f) f.setValue(fxParams[p]); });
    if (lpFaders['metro']) lpFaders['metro'].setValue(lpClickVol);
    document.querySelectorAll('#lpfx [data-fxlearn]').forEach(b => {
      const p = b.dataset.fxlearn; b.classList.toggle('learning', fxLearn === p);
      b.classList.toggle('assigned', !!fxMap[p]); b.textContent = (fxLearn === p) ? '…' : '🎛';
    });
  }
```
(Si `refreshFxUI` ya tenía el bucle de `[data-fxlearn]`, conserva esa parte; arriba está completa.)

- [ ] **Step 6: Persistir `lpClickVol`** — en `saveStore` (donde se guarda `store.fx`), añadir
`store.clickVol = lpClickVol;`. En `loadStore`, tras leer: `if (o.clickVol != null) lpClickVol = o.clickVol;`.

- [ ] **Step 7: Verificar sintaxis y prueba manual**
Run: (verificación) → `SINTAXIS_OK`.
Manual: el rack muestra 5 faders (Filtro, Delay tiempo/cant., Reverb, Metr.); arrastrar cambia el
efecto/volumen y se oye; doble-clic resetea; 🎛 + girar un knob mueve el fader del efecto; el
metrónomo suena más/menos fuerte; al recargar persisten fx y volumen de metrónomo.

- [ ] **Step 8: Commit**
```bash
git add pianova.html
git commit -m "Mezcla: efectos como rack de faders + volumen de metrónomo (lpClickVol)"
```

---

### Task 3: Volumen por canal → fader en la cabecera

**Files:**
- Modify: `pianova.html` — `lpBuildChannelUI` (markup del volumen, ≈1163), creación del fader por canal,
  `setChannelVolFromCC` (≈1572), `refreshVolLearnUI`, restore.

**Interfaces:**
- Consumes: `makeFader`, `lpFaders`, `lp.channels[i].vol`, `saveLooper`, `volLearn`/`volMap`.
- Produces: fader por canal `lpFaders['vol:'+i]`.

- [ ] **Step 1: Cambiar el markup del volumen en `lpBuildChannelUI`** (la fila `.lpHeadMid`)
Reemplazar el bloque `'<div class="lpHeadMid">…lpVol…lpVolLearn…</div>'` por:
```javascript
        '<div class="lpHeadMid"><div class="lpVolSlot" data-volslot="' + i + '"></div>' +
          '<button class="lpVolLearn" data-vollearn="' + i + '" title="Asignar un knob a este volumen">🎛</button></div>' +
```

- [ ] **Step 2: Crear el fader de cada canal tras construir la cabecera** (al final de `lpBuildChannelUI`, tras el bucle y `lpChannelsEl.appendChild`)
```javascript
    for (let i = 0; i < LP_CHANNELS; i++) {
      const slot = lpChannelsEl.querySelector('[data-volslot="' + i + '"]'); if (!slot) continue;
      const vol = (lp.channels[i] && lp.channels[i].vol != null) ? lp.channels[i].vol : 0.85;
      const f = makeFader({ key:'vol:'+i, min:0, max:1, step:0.05, def:0.85, value:vol,
        color: LP_COLORS[i], fmt:v=>Math.round(v*100),
        onInput: v => { lp.channels[i].vol = v; saveLooperDebounced(); } });
      slot.appendChild(f.el);
    }
```
(Va DESPUÉS de `rebuildChannelSoundOptions()`/`lpUpdateSelected()` para que los slots existan.)

- [ ] **Step 3: CSS para que el fader quepa en la cabecera (compacto y horizontalito)**
```css
  .lpHeadMid{display:flex; align-items:center; gap:6px}
  .lpVolSlot{flex:1; display:flex; justify-content:flex-start}
  .lpVolSlot .fader{flex-direction:row; align-items:center; gap:6px; width:auto}
  .lpVolSlot .fTrack{width:80px; height:8px; cursor:ew-resize}
  .lpVolSlot .fFill{top:0; bottom:auto; left:0; right:auto; height:100%!important; width:var(--fw,60%); border-radius:6px}
  .lpVolSlot .fCap{top:-3px; bottom:auto!important; left:auto; height:14px; width:14px; border-radius:50%}
  .lpVolSlot .fLab{display:none}
```
**Nota:** en la cabecera el fader va **horizontal** (más cómodo en la fila). `makeFader` controla el
relleno por `height`; para el modo horizontal, en `render` usar `--fw`. Para no bifurcar `makeFader`,
en este modo la pista horizontal interpreta el alto como ancho vía CSS: **(decisión)** mantener el
fader **vertical pequeño** en la cabecera (no horizontal) para reutilizar `makeFader` sin cambios →
usar este CSS en su lugar:
```css
  .lpVolSlot .fTrack{height:52px}
  .lpVolSlot .fLab{display:none}
```
(Es decir: fader vertical compacto de 52px en la cabecera; descartar el bloque horizontal anterior.)

- [ ] **Step 4: `setChannelVolFromCC`/`refreshVolLearnUI` usan el fader** (≈1572)
```javascript
  function setChannelVolFromCC(ch, val) {
    const v = Math.max(0, Math.min(1, val / 127));
    if (lp.channels[ch]) lp.channels[ch].vol = v;
    const f = lpFaders['vol:' + ch]; if (f) f.setValue(v);
    saveLooperDebounced();
  }
```
(`refreshVolLearnUI` no cambia: sigue operando sobre `[data-vollearn]`.)

- [ ] **Step 5: Verificar sintaxis y prueba manual**
Run: (verificación) → `SINTAXIS_OK`.
Manual: cada canal muestra su **fader de volumen** (color del canal, %); arrastrar cambia el volumen
y se oye; doble-clic = 85%; 🎛 + knob mueve el fader; al recargar persiste; el resto de la cabecera
(sonido, Grabar/Silenciar/Borrar/Cuadrar, ✏️) sigue bien.

- [ ] **Step 6: Commit**
```bash
git add pianova.html
git commit -m "Mezcla: volumen por canal como fader vertical en la cabecera"
```

---

### Task 4: Barra de transporte pro + BPM grande editable + metrónomo icono

**Files:**
- Modify: `pianova.html` — HTML `.controls` del Looper (≈456-478), CSS, widget BPM, listeners.

**Interfaces:**
- Consumes: `lpTogglePlay`, `lpTempoEl`/`lpTempoVal`, `lpBarsEl`, `lpClickEl`, `quantizeGrid`, `lpFaders['metro']`.
- Produces: barra `.lpTransport`; widget BPM editable que escribe en `lpTempoEl`.

- [ ] **Step 1: Reestructurar el HTML de `.controls`** (Looper, ≈456-478)
```html
    <div class="controls lpTransport">
      <button class="primary tpPlay" id="lpPlay" title="Play/Stop (mapeable a MIDI)">▶</button>
      <span class="tpSep"></span>
      <div class="tpCol"><span class="tpLab">Tempo</span>
        <span class="tpBpm"><b id="lpBpmNum">90</b> BPM</span>
        <input type="range" id="lpTempo" min="50" max="160" value="90" hidden>
        <span id="lpTempoVal" hidden>90</span>
      </div>
      <span class="tpSep"></span>
      <div class="tpCol"><span class="tpLab">Compás</span>
        <select id="lpBars"><option>1</option><option selected>2</option><option>4</option></select></div>
      <span class="tpSep"></span>
      <div class="tpCol"><span class="tpLab">Metrónomo</span>
        <div class="tpMetro"><label class="tpIc"><input type="checkbox" id="lpClick" checked><span>🥁</span></label>
          <div id="lpMetroSlot"></div></div></div>
      <span class="tpSep"></span>
      <div class="tpCol"><span class="tpLab">Rejilla</span>
        <select id="lpQuant"><option value="0">Libre</option><option value="0.5">♪ Corchea</option>
          <option value="0.25">♬ Semicorchea</option></select></div>
      <span class="tpSep"></span>
      <div class="tpTools">
        <button id="lpDrum">🥁 Batería</button>
        <button id="lpExport">⬇ WAV</button>
        <button id="libBtn">📁 Librería</button>
      </div>
      <input type="file" id="lpSampleFile" accept="audio/*" hidden>
      <input type="file" id="libFolderInput" webkitdirectory hidden>
    </div>
```
(Se conserva `#lpTempo`/`#lpTempoVal` ocultos como **fuente de verdad** del tempo; el número grande
`#lpBpmNum` es la cara visible. El metrónomo: icono on/off `#lpClick` + un slot para su fader.)

- [ ] **Step 2: CSS de la barra**
```css
  .lpTransport{display:flex; align-items:center; gap:0; flex-wrap:wrap}
  .lpTransport .tpSep{width:1px; height:40px; background:var(--line); margin:0 12px}
  .tpPlay{width:44px; height:44px; border-radius:50%; font-size:18px; padding:0}
  .tpCol{display:flex; flex-direction:column; align-items:flex-start; gap:3px}
  .tpCol[data-center]{align-items:center}
  .tpLab{font-size:9px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted)}
  .tpBpm{font-family:ui-monospace,monospace; color:var(--muted); cursor:ns-resize; user-select:none}
  .tpBpm b{font-size:26px; font-weight:700; color:var(--ink); line-height:1}
  .tpBpm input{width:60px; font-size:22px; font-family:ui-monospace,monospace; background:var(--panel2);
    border:1px solid var(--line); border-radius:6px; color:var(--ink)}
  .tpMetro{display:flex; align-items:center; gap:8px}
  .tpIc{display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px;
    border-radius:8px; background:var(--panel2); border:1px solid var(--line); cursor:pointer}
  .tpIc input{display:none} .tpIc:has(input:checked){background:#3a2e12; border-color:#7a5a1a}
  #lpMetroSlot .fader{width:auto} #lpMetroSlot .fTrack{height:34px} #lpMetroSlot .fVal,#lpMetroSlot .fLab{display:none}
  .tpTools{display:flex; gap:8px; margin-left:auto}
```

- [ ] **Step 3: BPM grande editable** (en la inicialización del Looper)
```javascript
  const lpBpmNum = $('lpBpmNum');
  function setBpm(v) {
    v = Math.max(50, Math.min(160, Math.round(v)));
    lpTempoEl.value = v; lpTempoVal.textContent = v; lpBpmNum.textContent = v;
  }
  // clic = escribir
  lpBpmNum.parentElement.addEventListener('click', e => {
    if (e.target.tagName === 'INPUT') return;
    const cur = parseFloat(lpTempoEl.value);
    const inp = document.createElement('input'); inp.type = 'number'; inp.min = 50; inp.max = 160; inp.value = cur;
    lpBpmNum.replaceWith(inp); inp.id = 'lpBpmNum'; inp.focus(); inp.select();
    const done = () => { setBpm(parseFloat(inp.value) || cur); /* setBpm repinta #lpBpmNum */ };
    inp.addEventListener('blur', () => { const b = parseFloat(inp.value) || cur; const span = document.createElement('b'); span.id='lpBpmNum'; span.textContent = Math.max(50,Math.min(160,Math.round(b))); inp.replaceWith(span); rebindBpm(); setBpm(b); });
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); });
  });
  // arrastrar ↕ = subir/bajar
  let bpmDrag = null;
  lpBpmNum.parentElement.addEventListener('pointerdown', e => {
    if (e.target.tagName === 'INPUT') return;
    bpmDrag = { y: e.clientY, v: parseFloat(lpTempoEl.value) }; e.preventDefault();
  });
  window.addEventListener('pointermove', e => { if (!bpmDrag) return; setBpm(bpmDrag.v + (bpmDrag.y - e.clientY) * 0.5); });
  window.addEventListener('pointerup', () => bpmDrag = null);
  function rebindBpm() { /* tras recrear el <b>, re-capturar referencia */ }
```
**Simplificación (preferida):** para evitar el baile de `replaceWith`, mantener SIEMPRE el `<b id="lpBpmNum">`
visible y, al hacer **doble-clic**, usar `prompt('BPM (50-160):', lpTempoEl.value)` → `setBpm`. El
**arrastrar ↕** queda igual. Es robusto y simple; implementar ASÍ:
```javascript
  const lpBpmWrap = document.querySelector('.tpBpm');
  function setBpm(v){ v=Math.max(50,Math.min(160,Math.round(v))); lpTempoEl.value=v; lpTempoVal.textContent=v; $('lpBpmNum').textContent=v; }
  lpBpmWrap.addEventListener('dblclick', () => { const r = prompt('BPM (50-160):', lpTempoEl.value); if (r!=null && !isNaN(parseFloat(r))) setBpm(parseFloat(r)); });
  let bpmDrag=null;
  lpBpmWrap.addEventListener('pointerdown', e => { bpmDrag={y:e.clientY,v:parseFloat(lpTempoEl.value)}; e.preventDefault(); });
  window.addEventListener('pointermove', e => { if(bpmDrag) setBpm(bpmDrag.v + (bpmDrag.y - e.clientY)*0.5); });
  window.addEventListener('pointerup', () => bpmDrag=null);
```
Usar la versión **simplificada** (doble-clic = `prompt`, arrastrar = ↕). Borrar el bloque anterior.

- [ ] **Step 4: Play como ▶/⏹ y metrónomo fader** (en init)
```javascript
  // Play/Stop: el texto del botón pasa a icono (lpTogglePlay ya alterna estado).
  // En lpTogglePlay, donde pone lpPlayBtn.textContent = playing ? 'Parar' : 'Reproducir',
  // cambiar a:  lpPlayBtn.textContent = lp.playing ? '⏹' : '▶';
  // (buscar las 2 asignaciones de textContent del botón Play y ponerlas como ▶/⏹).
  // Fader de metrónomo en el transporte (mismo dato lpClickVol; reutiliza el del rack si existe):
  (function(){ const slot=$('lpMetroSlot'); if(!slot) return;
    const f = makeFader({ key:'metroTp', min:0, max:1, step:0.05, def:0.8, value:lpClickVol,
      color:'#ffce7a', onInput:v=>{ lpClickVol=v; if(lpFaders['metro']) lpFaders['metro'].setValue(v); saveStoreDebounced(); } });
    slot.appendChild(f.el); })();
```
Y que el fader del rack (`lpFaders['metro']`) también refleje cambios del transporte: su `onInput` ya
llama a `saveStoreDebounced`; para sincronizar ambos, en el `onInput` del rack añadir
`if(lpFaders['metroTp']) lpFaders['metroTp'].setValue(v);`.

- [ ] **Step 5: Mantener `#lpBpmNum` sincronizado** — el slider `#lpTempo` está oculto pero sigue siendo
la fuente; su listener `input` (≈2892) ya hace `lpTempoVal.textContent=…`; añadir
`$('lpBpmNum').textContent = lpTempoEl.value;` ahí para cubrir cargas/restore.

- [ ] **Step 6: Verificar sintaxis y prueba manual**
Run: (verificación) → `SINTAXIS_OK`.
Manual: la barra se ve pro; ▶ arranca y pasa a ⏹; **doble-clic en el BPM** abre el prompt para
escribirlo y **arrastrar ↕** sobre el BPM lo sube/baja (el tempo real cambia); compás y rejilla
funcionan; el metrónomo icono on/off + su mini-fader cambia el volumen del clic; **Play/Stop por un
control MIDI mapeado** (Aprender MIDI → Play/Stop) sigue funcionando; en móvil la barra envuelve.

- [ ] **Step 7: Commit**
```bash
git add pianova.html
git commit -m "Transporte: barra pro (BPM grande editable, Play ▶/⏹, metrónomo icono+volumen)"
```

---

### Task 5: Documentación + versión

**Files:**
- Modify: `pianova.html` (`const VERSION`), `CLAUDE.md`, `HANDOFF.md`.

- [ ] **Step 1: Subir versión** — `grep -n "VERSION = 'v1\." pianova.html` y subir a la siguiente
  (de `v1.20` a `v1.21`).
- [ ] **Step 2: `CLAUDE.md`** — en la sección del Looper/Mezclador, describir: **faders verticales**
  (`makeFader`/`lpFaders`) para volumen de canal y efectos; **volumen de metrónomo** (`lpClickVol`);
  **barra de transporte** pro (BPM grande editable ligado a `lpTempoEl`, Play ▶/⏹ mapeable por
  `lp_play`). Mantiene `volMap`/`fxMap` y la persistencia.
- [ ] **Step 3: `HANDOFF.md`** — entrada de versión nueva con el lavado de cara.
- [ ] **Step 4: Verificar sintaxis** → `SINTAXIS_OK`.
- [ ] **Step 5: Commit** (sin publicar; el controlador fusiona/publica tras la revisión final)
```bash
git add pianova.html CLAUDE.md HANDOFF.md
git commit -m "Transporte/faders pro: docs + versión vXY"
```

---

## Self-review (plan vs spec)
- `makeFader` reutilizable (arrastre, reset, setValue sin bucle) → Task 1. ✔
- Efectos como rack de faders + 🎛 → Task 2. ✔
- Volumen de metrónomo (`lpClickVol`) → Task 2. ✔
- Volumen por canal como fader + 🎛 + CC → Task 3. ✔
- Barra de transporte pro + BPM editable (ligado a `lpTempoEl`) + Play ▶/⏹ mapeable → Task 4. ✔
- MIDI-learn refleja en el fader (`setValue` sin disparar onInput) → Task 1 + setters Tasks 2/3. ✔
- Persistencia (vol, fx, lpClickVol, tempo) → Tasks 2/3 (+ store) ; tempo ya persiste. ✔
- Táctil (`touch-action:none`) + responsive (wrap) → Tasks 1/4. ✔
- Fuera de alcance (selección/clipboard del piano-roll, knobs) → no se implementan. ✔
- Verificación node --check + test puro + manual → cada tarea. ✔
```
