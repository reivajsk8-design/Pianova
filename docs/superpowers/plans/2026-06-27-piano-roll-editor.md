# Piano-roll por canal — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editor de piano-roll por canal en ventana superpuesta (overlay) estilo clip de Ableton:
dibujar/mover/alargar/borrar notas con rejilla (snap), carril de velocity, resaltar escala y Fold,
editando el mismo `lp.channels[i].notes`.

**Architecture:** Todo en `pianova.html`. Un overlay `#pianoroll` se abre con doble-clic en un carril
del Looper. Dentro: un `<canvas id="prCanvas">` desplazable verticalmente que dibuja a la izquierda un
piano vertical (`PR_KEYS_W` px) y a la derecha la rejilla de notas (filas = alturas MIDI, columnas =
beats con snap a `prState.grid`), y un `<canvas id="prVel">` debajo con los tallos de velocity. Las
ediciones mutan `lp.channels[prState.ch].notes` y llaman a `saveLooper()`; se ven también en los 8
carriles. Un `requestAnimationFrame` activo **solo con el overlay abierto** pinta el cabezal.

**Tech Stack:** HTML+CSS+JS inline (IIFE `'use strict'`), Canvas 2D. Sin librerías, sin build.
Verificación: `node --check` + tests Node de funciones puras + prueba manual en Chrome/Edge.

## Global Constraints

- **Un solo archivo** `pianova.html`; sin frameworks ni build; `smplr` intacto.
- **Textos e interfaz en español.** **No empeorar el escritorio**; usable en táctil.
- Edita el modelo existente: `lp.channels[i].notes` = `{midi,startBeat,dur,vel}`. Reutiliza
  `lpLoopBeats()`, `quantizeNotes(notes,grid)`, `saveLooper()`, `solfege(midi)`, `LP_COLORS`,
  `LP_CHANNELS`, `dpr`, `lp.beat`/`lp.playing`.
- Rejilla por defecto **1/16 = 0.25 beats**. Filas = alturas MIDI (descendente, agudo arriba).
- Verificación de sintaxis tras cada tarea:
  ```bash
  node -e "const fs=require('fs');const h=fs.readFileSync('pianova.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('pv_check.js',m.map(x=>x[1]).join('\n;\n'));" && node --check pv_check.js && echo SINTAXIS_OK && rm -f pv_check.js
  ```

## Constantes y estado (se crean en la Task 1, las demás las consumen)
- `const PR_ROWH = 16, PR_KEYS_W = 62, PR_VEL_H = 72;`
- `const prState = { ch:-1, grid:0.25, fold:false, scaleRoot:0, scaleType:'chromatic', scaleOn:false };`
- `let prW = 0, prRowsCache = [], prRAF = 0, prDrag = null;`
- Geometría (Task 3): `prRows()`, `prGridW()`, `prBeatToX`, `prXToBeat`, `prSnap`, `prMidiToY`, `prYToMidi`, `prNoteAt`.

---

### Task 1: Overlay (shell) + abrir/cerrar + reemplazar doble-clic

**Files:**
- Modify: `pianova.html` — HTML (añadir `#pianoroll` cerca de `#sampleEd`, ≈línea 322); CSS (cerca de
  `#sampleEd`, ≈236); estado/funciones JS; `lpEditDbl` (≈2224); keydown (≈1419).

**Interfaces:**
- Produces: `prState`, `PR_ROWH`/`PR_KEYS_W`/`PR_VEL_H`, `prOpen(ch)`, `prClose()`, `prResize()`,
  `prDraw()` (stub que limpia), `prCanvas`/`prVel`/`prCtx`/`prVelCtx`.

- [ ] **Step 1: Añadir el HTML del overlay** (tras el cierre de `#sampleEd`, ≈línea 322)

```html
  <div id="pianoroll" hidden>
    <div id="prPanel">
      <div class="prHead">
        <span id="prTitle">Piano-roll</span>
        <label class="prCtl"><input type="checkbox" id="prFold"> Fold</label>
        <label class="prCtl">Rejilla
          <select id="prGrid">
            <option value="1">1/4</option><option value="0.5">1/8</option>
            <option value="0.25" selected>1/16</option><option value="0.125">1/32</option>
          </select>
        </label>
        <label class="prCtl">Escala
          <select id="prRoot"></select>
          <select id="prScale">
            <option value="chromatic">Cromática</option><option value="major">Mayor</option>
            <option value="minor">Menor</option><option value="pentaMajor">Penta mayor</option>
            <option value="pentaMinor">Penta menor</option><option value="dorian">Dórica</option>
          </select>
        </label>
        <label class="prCtl"><input type="checkbox" id="prScaleOn"> Resaltar escala</label>
        <button id="prQuant" class="prCtl">⊞ Cuadrar</button>
        <button id="prClose" class="primary">✕ Cerrar</button>
      </div>
      <div class="prScroll"><canvas id="prCanvas"></canvas></div>
      <div class="prVelWrap"><canvas id="prVel"></canvas></div>
    </div>
  </div>
```

- [ ] **Step 2: Añadir el CSS** (tras la regla `#sampleEdPanel{...}`, ≈línea 238)

```css
  #pianoroll{position:fixed; inset:0; z-index:1200; background:rgba(8,10,14,.72)}
  #pianoroll[hidden]{display:none}
  #prPanel{position:absolute; inset:18px; display:flex; flex-direction:column;
    background:var(--panel); border:1px solid var(--line); border-radius:14px; overflow:hidden;
    box-shadow:0 30px 80px rgba(0,0,0,.6)}
  .prHead{display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:10px 14px;
    background:var(--panel2); border-bottom:1px solid var(--line)}
  #prTitle{font-family:var(--disp); font-weight:600; font-size:14px; margin-right:auto}
  .prCtl{display:flex; align-items:center; gap:6px; font-size:12px; color:var(--muted)}
  .prCtl select{background:var(--panel); color:var(--ink); border:1px solid var(--line);
    border-radius:7px; padding:4px 6px; font-size:12px}
  .prScroll{flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; background:#0c0e13}
  #prCanvas{display:block; width:100%; touch-action:none}
  .prVelWrap{height:72px; border-top:1px solid var(--line); background:#0d0f15}
  #prVel{display:block; width:100%; height:72px; touch-action:none}
  @media (max-width:860px){ #prPanel{inset:8px} .prHead{gap:8px; padding:8px 10px} }
```

- [ ] **Step 3: Estado, referencias y abrir/cerrar** (en la sección del Looper, junto a otras vars de estado, p. ej. tras `let quantizeGrid = 0;`)

```javascript
  // ---------- Piano-roll por canal (overlay) ----------
  const PR_ROWH = 16, PR_KEYS_W = 62, PR_VEL_H = 72;
  const prState = { ch:-1, grid:0.25, fold:false, scaleRoot:0, scaleType:'chromatic', scaleOn:false };
  let prW = 0, prRowsCache = [], prRAF = 0, prDrag = null;
  const prCanvas = $('prCanvas'), prCtx = prCanvas.getContext('2d');
  const prVel = $('prVel'), prVelCtx = prVel.getContext('2d');
  function prOpen(ch) {
    prState.ch = ch;
    $('pianoroll').hidden = false;
    $('prTitle').textContent = 'Piano-roll · Canal ' + (ch + 1);
    prResize(); prDraw();
    if (!prRAF) prRAF = requestAnimationFrame(prFrame);
  }
  function prClose() {
    $('pianoroll').hidden = true; prState.ch = -1; prDrag = null;
    if (prRAF) { cancelAnimationFrame(prRAF); prRAF = 0; }
  }
  function prFrame() { if (prState.ch < 0) { prRAF = 0; return; } prDraw(); prDrawVel(); prRAF = requestAnimationFrame(prFrame); }
  function prResize() {
    const sc = prCanvas.parentElement.getBoundingClientRect();
    prW = sc.width;
    prRowsCache = prRows();
    prCanvas.style.height = (prRowsCache.length * PR_ROWH) + 'px';
    prCanvas.width = Math.round(prW * dpr);
    prCanvas.height = Math.round(prRowsCache.length * PR_ROWH * dpr);
    prCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    prVel.width = Math.round(prW * dpr); prVel.height = Math.round(PR_VEL_H * dpr);
    prVelCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function prDraw() { prCtx.clearRect(0, 0, prW, prRowsCache.length * PR_ROWH); }   // real en Task 3
  function prDrawVel() { prVelCtx.clearRect(0, 0, prW, PR_VEL_H); }                 // real en Task 5
  function prRows() {   // versión mínima; Task 3 la sustituye por la real (Fold/rango)
    const a = []; for (let m = 84; m >= 36; m--) a.push(m); return a;
  }
```
(Nota: `prRows` aquí es un stub de rango fijo; la Task 3 lo reemplaza por la versión con Fold y rango
dinámico. `prFrame` ya llama a `prDrawVel`, que es stub hasta la Task 5.)

- [ ] **Step 4: Reemplazar `lpEditDbl` para abrir el editor** (≈2224)

```javascript
  function lpEditDbl(ev) {
    const r = lpCanvas.getBoundingClientRect();
    const py = ev.clientY - r.top;
    const i = Math.floor(py / (lpH / LP_CHANNELS));
    if (i >= 0 && i < LP_CHANNELS) prOpen(i);
  }
```

- [ ] **Step 5: Cablear cierre (botón + Esc)** (junto a otros listeners del Looper, p. ej. cerca de `lpCanvas.addEventListener(...)`)

```javascript
  $('prClose').addEventListener('click', prClose);
```
Y en el listener `keydown` existente (≈1419), al principio del callback:
```javascript
    if (ev.key === 'Escape' && !$('pianoroll').hidden) { prClose(); return; }
```

- [ ] **Step 6: Rellenar el selector de tónica** (junto a `prOpen` o en el arranque)

```javascript
  (function fillPrRoot(){ const names=['Do','Do#','Re','Re#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si'];
    $('prRoot').innerHTML = names.map((n,i)=>'<option value="'+i+'">'+n+'</option>').join(''); })();
```

- [ ] **Step 7: Verificar sintaxis y prueba manual**
Run: (comando de verificación) → `SINTAXIS_OK`.
Manual: en el Looper, **doble-clic en un carril** → se abre el overlay con la cabecera y un lienzo
vacío; **✕** y **Esc** lo cierran. Arrastrar notas en los 8 carriles sigue funcionando.

- [ ] **Step 8: Commit**
```bash
git add pianova.html
git commit -m "Piano-roll: overlay (shell), abrir con doble-clic, cerrar con ✕/Esc"
```

---

### Task 2: Funciones puras (escala + snap) con tests

**Files:**
- Modify: `pianova.html` — añadir `PR_SCALES`, `prInScale`, `prSnap`.
- Test: `scratchpad/pr_test.js` (no se commitea).

**Interfaces:**
- Produces: `PR_SCALES` (obj tipo→array de clases 0..11), `prInScale(midi)->bool`, `prSnap(beat)->number`.

- [ ] **Step 1: Test Node de escala y snap**

`scratchpad/pr_test.js`:
```js
const PR_SCALES = { chromatic:[0,1,2,3,4,5,6,7,8,9,10,11], major:[0,2,4,5,7,9,11],
  minor:[0,2,3,5,7,8,10], pentaMajor:[0,2,4,7,9], pentaMinor:[0,3,5,7,10], dorian:[0,2,3,5,7,9,10] };
function inScale(midi, root, type){ const s = PR_SCALES[type] || PR_SCALES.chromatic;
  return s.includes(((midi - root) % 12 + 12) % 12); }
function snap(beat, grid){ return grid > 0 ? Math.round(beat / grid) * grid : beat; }
// Do mayor: Do(60) y Mi(64) dentro; Do#(61) fuera
if (!inScale(60,0,'major')) throw new Error('FALLO Do en Do mayor');
if (!inScale(64,0,'major')) throw new Error('FALLO Mi en Do mayor');
if (inScale(61,0,'major')) throw new Error('FALLO Do# NO debe estar en Do mayor');
// cromática: todo dentro
for (let m=60;m<72;m++) if(!inScale(m,0,'chromatic')) throw new Error('FALLO cromática');
// snap a 1/16 (0.25)
if (snap(0.30,0.25)!==0.25) throw new Error('FALLO snap 0.30→0.25');
if (snap(0.40,0.25)!==0.50) throw new Error('FALLO snap 0.40→0.50');
console.log('TEST_OK escala+snap');
```

- [ ] **Step 2: Ejecutar el test**
Run: `node scratchpad/pr_test.js`
Expected: `TEST_OK escala+snap`

- [ ] **Step 3: Añadir las funciones en `pianova.html`** (en la sección del piano-roll)

```javascript
  const PR_SCALES = { chromatic:[0,1,2,3,4,5,6,7,8,9,10,11], major:[0,2,4,5,7,9,11],
    minor:[0,2,3,5,7,8,10], pentaMajor:[0,2,4,7,9], pentaMinor:[0,3,5,7,10], dorian:[0,2,3,5,7,9,10] };
  function prInScale(midi) {
    const s = PR_SCALES[prState.scaleType] || PR_SCALES.chromatic;
    return s.includes(((midi - prState.scaleRoot) % 12 + 12) % 12);
  }
  function prSnap(beat) { return prState.grid > 0 ? Math.round(beat / prState.grid) * prState.grid : beat; }
```

- [ ] **Step 4: Verificar sintaxis**
Run: `node scratchpad/pr_test.js && ` + (comando de verificación) → `TEST_OK escala+snap` y `SINTAXIS_OK`.

- [ ] **Step 5: Commit**
```bash
git add pianova.html
git commit -m "Piano-roll: escalas (PR_SCALES/prInScale) y snap de rejilla (prSnap) + tests"
```

---

### Task 3: Geometría + dibujo de teclas, rejilla, notas y cabezal

**Files:**
- Modify: `pianova.html` — sustituir el stub `prRows` y `prDraw`; añadir geometría `prGridW`,
  `prBeatToX`, `prXToBeat`, `prMidiToY`, `prYToMidi`, `prNoteAt`.

**Interfaces:**
- Consumes: `prState`, `prRowsCache`, `prW`, `PR_ROWH`/`PR_KEYS_W`, `lpLoopBeats`, `lp.channels`,
  `LP_COLORS`, `solfege`, `prInScale`, `lp.beat`/`lp.playing`.
- Produces: `prGridW()`, `prBeatToX(b)`, `prXToBeat(px)`, `prMidiToY(m)`, `prYToMidi(py)`,
  `prNoteAt(px,py)->{k,edge}|null`, `prRows()` real, `prDraw()` real.

- [ ] **Step 1: Sustituir `prRows` (stub) por la versión real (Fold + rango)**

```javascript
  function prRows() {
    const ch = lp.channels[prState.ch]; const used = ch ? ch.notes.map(n => n.midi) : [];
    if (prState.fold && used.length) {
      const uniq = [...new Set(used)].sort((a, b) => b - a); return uniq;
    }
    let lo = 36, hi = 84;
    if (used.length) { lo = Math.max(24, Math.min(...used) - 2); hi = Math.min(108, Math.max(...used) + 2); }
    const a = []; for (let m = hi; m >= lo; m--) a.push(m); return a;
  }
```

- [ ] **Step 2: Añadir la geometría**

```javascript
  function prGridW() { return Math.max(1, prW - PR_KEYS_W); }
  function prBeatToX(b) { return PR_KEYS_W + (b / lpLoopBeats()) * prGridW(); }
  function prXToBeat(px) { return ((px - PR_KEYS_W) / prGridW()) * lpLoopBeats(); }
  function prMidiToY(m) { const i = prRowsCache.indexOf(m); return i < 0 ? -100 : i * PR_ROWH; }
  function prYToMidi(py) { const i = Math.max(0, Math.min(prRowsCache.length - 1, Math.floor(py / PR_ROWH))); return prRowsCache[i]; }
  // Nota bajo el cursor; edge=true si está en el borde derecho (zona de redimensionar)
  function prNoteAt(px, py) {
    const ch = lp.channels[prState.ch]; if (!ch) return null;
    for (let k = ch.notes.length - 1; k >= 0; k--) {
      const n = ch.notes[k]; const y = prMidiToY(n.midi); if (y < 0) continue;
      const x = prBeatToX(n.startBeat), x2 = prBeatToX(n.startBeat + n.dur);
      if (px >= x && px <= x2 && py >= y && py <= y + PR_ROWH) return { k, edge: (px >= x2 - 6) };
    }
    return null;
  }
```

- [ ] **Step 3: Sustituir `prDraw` (stub) por el dibujo real**

```javascript
  function prDraw() {
    const rows = prRowsCache, H = rows.length * PR_ROWH, gw = prGridW();
    prCtx.clearRect(0, 0, prW, H);
    // filas (teclas a la izq + sombreado de escala a la der)
    for (let i = 0; i < rows.length; i++) {
      const m = rows[i], y = i * PR_ROWH, black = [1,3,6,8,10].includes(((m % 12) + 12) % 12);
      // fondo de fila en la rejilla
      prCtx.fillStyle = (prState.scaleOn && prInScale(m)) ? 'rgba(159,208,240,0.06)'
                       : black ? 'rgba(255,255,255,0.015)' : 'transparent';
      prCtx.fillRect(PR_KEYS_W, y, gw, PR_ROWH);
      // tecla del piano
      prCtx.fillStyle = black ? '#1a1d24' : '#e8e4dc';
      prCtx.fillRect(0, y + 0.5, PR_KEYS_W - 1, PR_ROWH - 1);
      if (!black) { prCtx.fillStyle = 'rgba(0,0,0,.55)'; prCtx.font = '10px ui-monospace,monospace';
        prCtx.textAlign = 'right'; prCtx.textBaseline = 'middle'; prCtx.fillText(solfege(m), PR_KEYS_W - 5, y + PR_ROWH / 2); }
      // línea horizontal de fila
      prCtx.strokeStyle = 'rgba(255,255,255,0.05)'; prCtx.lineWidth = 1;
      prCtx.beginPath(); prCtx.moveTo(PR_KEYS_W, y + 0.5); prCtx.lineTo(prW, y + 0.5); prCtx.stroke();
    }
    // rejilla vertical (compás/pulso/grid)
    const total = lpLoopBeats();
    for (let b = 0; b <= total + 1e-6; b += prState.grid) {
      const x = prBeatToX(b);
      prCtx.strokeStyle = (Math.abs(b % 4) < 1e-6) ? 'rgba(255,255,255,0.20)'
                        : (Math.abs(b % 1) < 1e-6) ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)';
      prCtx.lineWidth = (Math.abs(b % 4) < 1e-6) ? 1.5 : 1;
      prCtx.beginPath(); prCtx.moveTo(x, 0); prCtx.lineTo(x, H); prCtx.stroke();
    }
    // notas
    const ch = lp.channels[prState.ch]; const col = LP_COLORS[prState.ch];
    if (ch) for (const n of ch.notes) {
      const y = prMidiToY(n.midi); if (y < 0) continue;
      const x = prBeatToX(n.startBeat), w = Math.max(4, prBeatToX(n.startBeat + n.dur) - x);
      prCtx.fillStyle = col; prCtx.strokeStyle = 'rgba(0,0,0,.5)';
      prCtx.fillRect(x, y + 1, w, PR_ROWH - 2); prCtx.strokeRect(x + 0.5, y + 1.5, w - 1, PR_ROWH - 3);
    }
    // cabezal
    if (lp.playing) { const x = prBeatToX(lp.beat % total);
      prCtx.fillStyle = '#ffce7a'; prCtx.fillRect(x - 1, 0, 2, H); }
  }
```

- [ ] **Step 4: Redibujar al cambiar Fold/escala** (provisional hasta la Task 6: que `prResize`+`prDraw`
se llamen). Añadir listeners mínimos para ver el efecto ya:
```javascript
  $('prFold').addEventListener('change', e => { prState.fold = e.target.checked; prResize(); prDraw(); });
  $('prScaleOn').addEventListener('change', e => { prState.scaleOn = e.target.checked; prDraw(); });
```

- [ ] **Step 5: Verificar sintaxis y prueba manual**
Run: (verificación) → `SINTAXIS_OK`.
Manual: graba unas notas en un canal, doble-clic en su carril → el overlay muestra el **piano
vertical**, la **rejilla 1/16** y las **notas** del canal; al reproducir, el **cabezal** cruza; Fold
y Resaltar escala cambian la vista.

- [ ] **Step 6: Commit**
```bash
git add pianova.html
git commit -m "Piano-roll: geometría + dibujo de teclas, rejilla, notas y cabezal"
```

---

### Task 4: Edición — crear, mover, alargar, borrar + Cuadrar

**Files:**
- Modify: `pianova.html` — handlers pointer en `#prCanvas`; botón `#prQuant`; selector `#prGrid`.

**Interfaces:**
- Consumes: `prNoteAt`, `prXToBeat`, `prYToMidi`, `prSnap`, `lp.channels`, `saveLooper`, `quantizeNotes`, `lpLoopBeats`.
- Produces: edición funcional de notas en el piano-roll.

- [ ] **Step 1: Pointerdown — crear / empezar mover o redimensionar / borrar**

```javascript
  function prPos(ev) { const r = prCanvas.getBoundingClientRect(); return { px: ev.clientX - r.left, py: ev.clientY - r.top }; }
  prCanvas.addEventListener('pointerdown', ev => {
    if (prState.ch < 0) return;
    const { px, py } = prPos(ev); if (px < PR_KEYS_W) return;     // zona de teclas: ignorar
    const ch = lp.channels[prState.ch]; const hit = prNoteAt(px, py);
    if (ev.button === 2) { if (hit) { ch.notes.splice(hit.k, 1); saveLooper(); prDraw(); } return; }  // clic derecho = borrar
    if (hit) {
      prDrag = { k: hit.k, mode: hit.edge ? 'resize' : 'move', offBeat: prXToBeat(px) - ch.notes[hit.k].startBeat };
      prCanvas.setPointerCapture(ev.pointerId);
    } else {                                                       // crear nota
      const b = Math.max(0, Math.min(lpLoopBeats() - prState.grid, prSnap(prXToBeat(px))));
      ch.notes.push({ midi: prYToMidi(py), startBeat: b, dur: prState.grid, vel: 0.8 });
      prDrag = { k: ch.notes.length - 1, mode: 'resize', offBeat: 0 };
      prCanvas.setPointerCapture(ev.pointerId); saveLooper();
    }
    prDraw();
  });
```

- [ ] **Step 2: Pointermove — aplicar mover/redimensionar**

```javascript
  prCanvas.addEventListener('pointermove', ev => {
    if (!prDrag || prState.ch < 0) return;
    const { px, py } = prPos(ev); const n = lp.channels[prState.ch].notes[prDrag.k];
    if (!n) { prDrag = null; return; }
    const total = lpLoopBeats();
    if (prDrag.mode === 'move') {
      let b = prSnap(prXToBeat(px) - prDrag.offBeat);
      n.startBeat = Math.max(0, Math.min(total - n.dur, b));
      n.midi = prYToMidi(py);
    } else {   // resize: el borde derecho
      let end = prSnap(prXToBeat(px));
      n.dur = Math.max(prState.grid, Math.min(total - n.startBeat, end - n.startBeat));
    }
    prDraw();
  });
```

- [ ] **Step 3: Pointerup — fijar y guardar**

```javascript
  function prEditUp() { if (prDrag) { prDrag = null; saveLooper(); } }
  prCanvas.addEventListener('pointerup', prEditUp);
  prCanvas.addEventListener('pointercancel', prEditUp);
  prCanvas.addEventListener('dblclick', ev => {   // doble-clic en nota = borrar
    if (prState.ch < 0) return; const { px, py } = prPos(ev); const hit = prNoteAt(px, py);
    if (hit) { lp.channels[prState.ch].notes.splice(hit.k, 1); saveLooper(); prDraw(); }
  });
  prCanvas.addEventListener('contextmenu', ev => ev.preventDefault());   // permitir clic derecho = borrar
```

- [ ] **Step 4: Selector de rejilla + Cuadrar**

```javascript
  $('prGrid').addEventListener('change', e => { prState.grid = parseFloat(e.target.value); prDraw(); });
  $('prQuant').addEventListener('click', () => {
    if (prState.ch < 0) return; quantizeNotes(lp.channels[prState.ch].notes, prState.grid);
    saveLooper(); prDraw();
  });
```

- [ ] **Step 5: Verificar sintaxis y prueba manual**
Run: (verificación) → `SINTAXIS_OK`.
Manual: en el editor, **clic en celda vacía** crea una nota pegada a la rejilla; **arrastrar el
cuerpo** la mueve (snap en tiempo, semitonos en altura); **arrastrar el borde derecho** la alarga;
**doble-clic o clic derecho** la borra; **Cuadrar** alinea todo; cambiar la rejilla afecta al snap.
Los cambios se ven en los 8 carriles y **persisten al recargar**.

- [ ] **Step 6: Commit**
```bash
git add pianova.html
git commit -m "Piano-roll: crear/mover/alargar/borrar notas + Cuadrar + rejilla"
```

---

### Task 5: Carril de velocity (dibujo + arrastre)

**Files:**
- Modify: `pianova.html` — sustituir el stub `prDrawVel`; handlers pointer en `#prVel`.

**Interfaces:**
- Consumes: `prBeatToX`, `prXToBeat`, `lp.channels`, `LP_COLORS`, `saveLooper`, `PR_VEL_H`.
- Produces: `prDrawVel()` real + edición de `vel`.

- [ ] **Step 1: Sustituir `prDrawVel` (stub) por el dibujo real**

```javascript
  function prDrawVel() {
    prVelCtx.clearRect(0, 0, prW, PR_VEL_H);
    prVelCtx.strokeStyle = 'rgba(255,255,255,0.06)';
    prVelCtx.beginPath(); prVelCtx.moveTo(PR_KEYS_W, 0.5); prVelCtx.lineTo(prW, 0.5); prVelCtx.stroke();
    const ch = lp.channels[prState.ch]; if (!ch) return; const col = LP_COLORS[prState.ch];
    for (const n of ch.notes) {
      const x = prBeatToX(n.startBeat), h = Math.max(2, (n.vel == null ? 0.8 : n.vel) * (PR_VEL_H - 8));
      prVelCtx.strokeStyle = col; prVelCtx.lineWidth = 2;
      prVelCtx.beginPath(); prVelCtx.moveTo(x + 1, PR_VEL_H - 2); prVelCtx.lineTo(x + 1, PR_VEL_H - 2 - h); prVelCtx.stroke();
      prVelCtx.fillStyle = col; prVelCtx.beginPath(); prVelCtx.arc(x + 1, PR_VEL_H - 2 - h, 2.5, 0, 7); prVelCtx.fill();
    }
  }
```

- [ ] **Step 2: Arrastre de velocity** (la nota más cercana en X recibe el nuevo valor según la altura del puntero)

```javascript
  let prVelDrag = false;
  function prVelApply(ev) {
    const ch = lp.channels[prState.ch]; if (!ch || !ch.notes.length) return;
    const r = prVel.getBoundingClientRect(); const px = ev.clientX - r.left, py = ev.clientY - r.top;
    let best = -1, bestDx = 1e9;
    for (let k = 0; k < ch.notes.length; k++) { const dx = Math.abs(prBeatToX(ch.notes[k].startBeat) - px); if (dx < bestDx) { bestDx = dx; best = k; } }
    if (best < 0 || bestDx > 14) return;
    const v = Math.max(0.05, Math.min(1, (PR_VEL_H - 2 - py) / (PR_VEL_H - 8)));
    ch.notes[best].vel = v; prDrawVel();
  }
  prVel.addEventListener('pointerdown', ev => { if (prState.ch < 0) return; prVelDrag = true; prVel.setPointerCapture(ev.pointerId); prVelApply(ev); });
  prVel.addEventListener('pointermove', ev => { if (prVelDrag) prVelApply(ev); });
  prVel.addEventListener('pointerup', () => { if (prVelDrag) { prVelDrag = false; saveLooper(); } });
  prVel.addEventListener('pointercancel', () => { if (prVelDrag) { prVelDrag = false; saveLooper(); } });
```

- [ ] **Step 3: Verificar sintaxis y prueba manual**
Run: (verificación) → `SINTAXIS_OK`.
Manual: en el carril inferior se ve un **tallo por nota** (altura = fuerza); arrastrar arriba/abajo
cambia la velocity de la nota más cercana; al reproducir se nota el cambio de volumen; persiste.

- [ ] **Step 4: Commit**
```bash
git add pianova.html
git commit -m "Piano-roll: carril de velocity (tallos + arrastre)"
```

---

### Task 6: Controles de escala + redibujo coherente + táctil

**Files:**
- Modify: `pianova.html` — listeners de `#prRoot`/`#prScale`; asegurar `prResize` en `resize` y
  scroll; ajuste táctil del scroll de teclas.

**Interfaces:**
- Consumes: `prState`, `prResize`, `prDraw`.

- [ ] **Step 1: Listeners de tónica y tipo de escala**

```javascript
  $('prRoot').addEventListener('change', e => { prState.scaleRoot = parseInt(e.target.value, 10); prDraw(); });
  $('prScale').addEventListener('change', e => { prState.scaleType = e.target.value; prDraw(); });
```

- [ ] **Step 2: Recalcular tamaño al cambiar la ventana** (en el listener `window resize` existente, ≈donde se llama a `looperResize`)

Añadir, dentro del callback de `window.addEventListener('resize', …)`:
```javascript
    if (!$('pianoroll').hidden) { prResize(); prDraw(); prDrawVel(); }
```

- [ ] **Step 3: Verificar sintaxis y prueba manual**
Run: (verificación) → `SINTAXIS_OK`.
Manual: cambiar **tónica** y **tipo de escala** con *Resaltar escala* activo sombrea las filas
correctas; redimensionar la ventana recoloca el editor; en táctil, el lienzo se puede desplazar
verticalmente (scroll del contenedor) y editar.

- [ ] **Step 4: Commit**
```bash
git add pianova.html
git commit -m "Piano-roll: controles de escala (tónica/tipo) + redibujo al redimensionar"
```

---

### Task 7: Documentación + versión

**Files:**
- Modify: `pianova.html` (constante `VERSION`), `CLAUDE.md`, `HANDOFF.md`.

- [ ] **Step 1: Subir versión** — `grep -n "VERSION = 'v1\." pianova.html` y subir a la siguiente
  (de `v1.19` a `v1.20`), manteniendo el formato.

- [ ] **Step 2: `CLAUDE.md`** — en la sección del Looper, añadir un párrafo: **Piano-roll por canal**
  (overlay `#pianoroll`, abre con doble-clic en un carril; `prState`, `prRows`/geometría,
  `prDraw`/`prDrawVel`, edición crear/mover/alargar/borrar con snap `prSnap`, velocity, `PR_SCALES`/
  `prInScale` para resaltar escala, Fold; edita el mismo `lp.channels[i].notes` y `saveLooper`).

- [ ] **Step 3: `HANDOFF.md`** — entrada de la versión nueva con el editor de piano-roll.

- [ ] **Step 4: Verificar sintaxis**
Run: (verificación) → `SINTAXIS_OK`.

- [ ] **Step 5: Commit** (sin publicar; el controlador fusiona/publica tras la revisión final)
```bash
git add pianova.html CLAUDE.md HANDOFF.md
git commit -m "Piano-roll: docs (CLAUDE/HANDOFF) + versión vXY"
```

---

## Self-review (plan vs spec)
- Overlay + abrir (doble-clic)/cerrar (✕/Esc) → Task 1. ✔
- Funciones puras escala/snap con tests → Task 2. ✔
- Piano vertical + rejilla 1/16 + notas + cabezal + Fold/rango → Task 3. ✔
- Crear/mover/alargar/borrar + snap + Cuadrar + selector rejilla → Task 4. ✔
- Carril de velocity (dibujo + arrastre) → Task 5. ✔
- Resaltar escala (tónica/tipo) + redibujo/táctil → Task 6. ✔
- Edita mismo `lp.channels[i].notes` + `saveLooper` + se ve en 8 carriles + persiste → Tasks 3-5. ✔
- Reproducción/cabezal con rAF solo abierto → Task 1 (`prFrame`) + Task 3 (cabezal). ✔
- Fuera de alcance (Humanize/Invert/selección/zoom) → no se implementan. ✔
- Verificación node --check + tests puros + manual → cada tarea. ✔
```
