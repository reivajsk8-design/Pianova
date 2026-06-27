# Piano-roll edición avanzada — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir al piano-roll (overlay) selección por recuadro/Shift/Ctrl+A, mover en grupo, borrar,
copiar/pegar (en el cabezal)/duplicar y deshacer/rehacer multinivel, sobre `lp.channels[prState.ch].notes`.

**Architecture:** Todo en `pianova.html`. Estado nuevo: `prSel` (Set de objetos nota), `prClip`
(portapapeles relativo, global), `prMarquee` (rectángulo en arrastre), `prUndo`/`prRedo` (pilas de
copias de las notas del canal). Se reescriben los manejadores de puntero de `#prCanvas` para
selección + mover en grupo + recuadro, se amplía `prDraw` (resaltado + recuadro), y se añaden los
atajos de teclado en el listener `keydown` existente (solo con el overlay abierto, con
`preventDefault`). Toda mutación llama `prPushUndo()` antes, y `saveLooper()`/`prDraw()` después.

**Tech Stack:** HTML+CSS+JS inline (IIFE `'use strict'`), Canvas 2D, eventos puntero/teclado. Sin
librerías. Verificación: `node --check` + tests Node de funciones puras + prueba manual Chrome/Edge.

## Global Constraints

- **Un solo archivo** `pianova.html`; sin librerías; sin build; `smplr` intacto. Textos/ comentarios
  en español.
- Activo **solo con el overlay del piano-roll abierto** (`!$('pianoroll').hidden`); no afecta a los 8
  carriles (`lpCanvas`/`lpEdit*`) ni al resto de la app. Atajos con `ev.preventDefault()` para no
  disparar el copiar/pegar/deshacer del navegador.
- Reutiliza: `prState` (`.ch`,`.grid`), `lp.channels[i].notes` (`{midi,startBeat,dur,vel}`),
  `prNoteAt(px,py)->{k,edge}|null`, `prXToBeat`/`prYToMidi`/`prBeatToX`/`prMidiToY`, `prSnap`, `prPos`,
  `prRowsCache`, `PR_KEYS_W`/`PR_ROWH`, `prDraw`, `lpLoopBeats`, `lp.beat`/`lp.playing`, `saveLooper`,
  `prOpen`/`prClose`, el listener `keydown` (que ya intercepta `Escape` con el overlay abierto).
- Verificación de sintaxis tras cada tarea:
  ```bash
  node -e "const fs=require('fs');const h=fs.readFileSync('pianova.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('pv_check.js',m.map(x=>x[1]).join('\n;\n'));" && node --check pv_check.js && echo SINTAXIS_OK && rm -f pv_check.js
  ```

---

### Task 1: Funciones puras (recuadro, copia relativa, span) + tests

**Files:**
- Modify: `pianova.html` — añadir `rectsOverlap`, `prRelClip`, `prSpan` en la sección del piano-roll.
- Test: `scratchpad/proll_test.js` (no se commitea).

**Interfaces:**
- Produces:
  - `rectsOverlap(ax0,ay0,ax1,ay1, bx0,by0,bx1,by1) -> bool` (intersección de dos rectángulos, ejes
    normalizados internamente).
  - `prRelClip(sel) -> [{midi,startBeat,dur,vel}]` (copias con `startBeat` relativo al mínimo).
  - `prSpan(sel) -> number` (`max(startBeat+dur) - min(startBeat)`).

- [ ] **Step 1: Test Node de las funciones puras**

`scratchpad/proll_test.js`:
```js
function rectsOverlap(ax0,ay0,ax1,ay1,bx0,by0,bx1,by1){
  const aX0=Math.min(ax0,ax1),aX1=Math.max(ax0,ax1),aY0=Math.min(ay0,ay1),aY1=Math.max(ay0,ay1);
  const bX0=Math.min(bx0,bx1),bX1=Math.max(bx0,bx1),bY0=Math.min(by0,by1),bY1=Math.max(by0,by1);
  return aX0<=bX1 && aX1>=bX0 && aY0<=bY1 && aY1>=bY0;
}
function prRelClip(sel){ const base=Math.min(...sel.map(n=>n.startBeat));
  return sel.map(n=>({midi:n.midi,startBeat:n.startBeat-base,dur:n.dur,vel:n.vel})); }
function prSpan(sel){ return Math.max(...sel.map(n=>n.startBeat+n.dur)) - Math.min(...sel.map(n=>n.startBeat)); }
// overlap
if(!rectsOverlap(0,0,10,10, 5,5,20,20)) throw new Error('FALLO overlap sí');
if(rectsOverlap(0,0,10,10, 20,20,30,30)) throw new Error('FALLO overlap no');
if(!rectsOverlap(10,0,0,10, 5,5,6,6)) throw new Error('FALLO overlap ejes invertidos');
// rel clip
const sel=[{midi:60,startBeat:2,dur:0.5,vel:0.8},{midi:64,startBeat:3,dur:1,vel:0.5}];
const c=prRelClip(sel);
if(c[0].startBeat!==0 || c[1].startBeat!==1) throw new Error('FALLO relClip');
if(c[0].midi!==60 || c[1].dur!==1) throw new Error('FALLO relClip datos');
// span: de 2 a 4 (3+1) = 2
if(prSpan(sel)!==2) throw new Error('FALLO span');
console.log('TEST_OK proll');
```

- [ ] **Step 2: Ejecutar el test**
Run: `node scratchpad/proll_test.js`
Expected: `TEST_OK proll`

- [ ] **Step 3: Añadir las funciones en `pianova.html`** (en la sección del piano-roll, p. ej. tras `prNoteAt`)

```javascript
  // ---------- Piano-roll: utilidades de selección ----------
  function rectsOverlap(ax0,ay0,ax1,ay1,bx0,by0,bx1,by1){
    const aX0=Math.min(ax0,ax1),aX1=Math.max(ax0,ax1),aY0=Math.min(ay0,ay1),aY1=Math.max(ay0,ay1);
    const bX0=Math.min(bx0,bx1),bX1=Math.max(bx0,bx1),bY0=Math.min(by0,by1),bY1=Math.max(by0,by1);
    return aX0<=bX1 && aX1>=bX0 && aY0<=bY1 && aY1>=bY0;
  }
  function prRelClip(sel){ if(!sel.length) return []; const base=Math.min(...sel.map(n=>n.startBeat));
    return sel.map(n=>({midi:n.midi,startBeat:n.startBeat-base,dur:n.dur,vel:n.vel})); }
  function prSpan(sel){ return Math.max(...sel.map(n=>n.startBeat+n.dur)) - Math.min(...sel.map(n=>n.startBeat)); }
```

- [ ] **Step 4: Verificar**
Run: `node scratchpad/proll_test.js && ` + (comando de verificación) → `TEST_OK proll` y `SINTAXIS_OK`.

- [ ] **Step 5: Commit**
```bash
git add pianova.html
git commit -m "Piano-roll: utilidades puras de selección (rectsOverlap/prRelClip/prSpan) + test"
```

---

### Task 2: Estado, deshacer/rehacer y dibujo de selección/recuadro

**Files:**
- Modify: `pianova.html` — estado nuevo; `prPushUndo`/`prDoUndo`/`prDoRedo`/`prRestore`; `prOpen`/
  `prClose` (limpiar); `prDraw` (resaltado + recuadro).

**Interfaces:**
- Consumes: `prState`, `lp.channels`, `saveLooper`, `prDraw`, `prBeatToX`/`prMidiToY`, `prRowsCache`.
- Produces: `prSel` (Set), `prClip` (array), `prMarquee` (obj|null), `prUndo`/`prRedo`,
  `prPushUndo()`, `prDoUndo()`, `prDoRedo()`, `prRestore(snap)`, `prNotesInRect(x0,y0,x1,y1)->[note]`.

- [ ] **Step 1: Estado** (junto a `let prDrag = null;`)
```javascript
  let prSel = new Set();      // notas seleccionadas (referencias a objetos)
  let prClip = [];            // portapapeles relativo (global, permite pegar en otro canal)
  let prMarquee = null;       // {x0,y0,x1,y1,add,moved} mientras se arrastra el recuadro
  let prUndo = [], prRedo = [];   // pilas de fotos de las notas del canal
```

- [ ] **Step 2: Deshacer/rehacer**
```javascript
  function prSnapshotNotes(){ return lp.channels[prState.ch].notes.map(n => ({...n})); }
  function prPushUndo(){ if (prState.ch < 0) return; prUndo.push(prSnapshotNotes()); if (prUndo.length > 60) prUndo.shift(); prRedo.length = 0; }
  function prRestore(snap){ const a = lp.channels[prState.ch].notes; a.length = 0; snap.forEach(o => a.push({...o})); prSel = new Set(); }
  function prDoUndo(){ if (prState.ch < 0 || !prUndo.length) return; prRedo.push(prSnapshotNotes()); prRestore(prUndo.pop()); saveLooper(); prDraw(); }
  function prDoRedo(){ if (prState.ch < 0 || !prRedo.length) return; prUndo.push(prSnapshotNotes()); prRestore(prRedo.pop()); saveLooper(); prDraw(); }
```

- [ ] **Step 3: Limpiar al abrir/cerrar** — en `prOpen(ch)` (al fijar `prState.ch`) y en `prClose()` añadir:
```javascript
    prSel = new Set(); prMarquee = null; prUndo = []; prRedo = [];
```
(En `prOpen` ponerlo tras `prState.ch = ch;`. En `prClose` junto a `prDrag = null;`. El portapapeles
`prClip` NO se limpia, para poder pegar en otro canal.)

- [ ] **Step 4: `prNotesInRect`**
```javascript
  function prNotesInRect(x0,y0,x1,y1){
    const ch = lp.channels[prState.ch]; if (!ch) return [];
    return ch.notes.filter(n => {
      const y = prMidiToY(n.midi); if (y < 0) return false;
      const nx0 = prBeatToX(n.startBeat), nx1 = prBeatToX(n.startBeat + n.dur);
      return rectsOverlap(x0,y0,x1,y1, nx0, y, nx1, y + PR_ROWH);
    });
  }
```

- [ ] **Step 5: Dibujo — resaltado de selección + recuadro** (en `prDraw`, en el bucle de notas y al final)

En el bucle de notas (donde dibuja cada `n`), tras `prCtx.fillRect(...)`/`strokeRect(...)`, añadir el
resaltado si está seleccionada:
```javascript
      if (prSel.has(n)) { prCtx.strokeStyle = '#fff'; prCtx.lineWidth = 2; prCtx.strokeRect(x + 1, y + 1.5, w - 1, PR_ROWH - 3); prCtx.lineWidth = 1; }
```
Y al final de `prDraw` (antes de cerrar la función), dibujar el recuadro:
```javascript
    if (prMarquee) {
      const x = Math.min(prMarquee.x0, prMarquee.x1), w = Math.abs(prMarquee.x1 - prMarquee.x0);
      const yy = Math.min(prMarquee.y0, prMarquee.y1), hh = Math.abs(prMarquee.y1 - prMarquee.y0);
      prCtx.fillStyle = 'rgba(159,208,240,0.12)'; prCtx.fillRect(x, yy, w, hh);
      prCtx.strokeStyle = 'rgba(159,208,240,0.7)'; prCtx.lineWidth = 1; prCtx.strokeRect(x + 0.5, yy + 0.5, w, hh);
    }
```

- [ ] **Step 6: Verificar sintaxis**
Run: (verificación) → `SINTAXIS_OK`.

- [ ] **Step 7: Commit**
```bash
git add pianova.html
git commit -m "Piano-roll: estado de selección + deshacer/rehacer + dibujo de selección y recuadro"
```

---

### Task 3: Ratón — recuadro, selección y mover en grupo

**Files:**
- Modify: `pianova.html` — reescribir los manejadores `pointerdown`/`pointermove`/`prEditUp` de
  `#prCanvas` (≈3321-3358) y el clic-derecho/doble-clic (que ahora también empujan deshacer).

**Interfaces:**
- Consumes: `prSel`, `prMarquee`, `prDrag`, `prPushUndo`, `prNotesInRect`, `prNoteAt`, `prXToBeat`,
  `prYToMidi`, `prSnap`, `prPos`, `prRowsCache`, `lpLoopBeats`, `saveLooper`, `prDraw`.
- Produces: selección por recuadro/clic/Shift y arrastre de grupo funcionando.

- [ ] **Step 1: Reescribir `pointerdown`** (≈3321-3338)
```javascript
  prCanvas.addEventListener('pointerdown', ev => {
    if (prState.ch < 0) return;
    const { px, py } = prPos(ev); if (px < PR_KEYS_W) return;   // zona de teclas
    const ch = lp.channels[prState.ch]; const hit = prNoteAt(px, py);
    if (ev.button === 2) {   // clic derecho = borrar esa nota
      if (hit) { prPushUndo(); const n = ch.notes[hit.k]; prSel.delete(n); ch.notes.splice(hit.k, 1); saveLooper(); prDraw(); }
      return;
    }
    if (hit) {
      const n = ch.notes[hit.k];
      if (ev.shiftKey) { if (prSel.has(n)) prSel.delete(n); else prSel.add(n); prDraw(); return; }  // Shift+clic = alternar
      if (!prSel.has(n)) prSel = new Set([n]);
      if (hit.edge) { prPushUndo(); prDrag = { mode: 'resize', note: n }; }   // redimensionar solo esa
      else {                                                                  // mover el grupo
        prPushUndo();
        const downB = prSnap(prXToBeat(px)), downM = prYToMidi(py);
        const orig = new Map(); prSel.forEach(s => orig.set(s, { startBeat: s.startBeat, midi: s.midi }));
        prDrag = { mode: 'move', downB, downM, orig };
      }
      prCanvas.setPointerCapture(ev.pointerId); prDraw();
    } else {   // zona vacía → empezar recuadro (al soltar se decide: seleccionar / crear / deseleccionar)
      prMarquee = { x0: px, y0: py, x1: px, y1: py, add: ev.shiftKey, moved: false };
      prCanvas.setPointerCapture(ev.pointerId);
    }
  });
```

- [ ] **Step 2: Reescribir `pointermove`** (≈3339-3355)
```javascript
  prCanvas.addEventListener('pointermove', ev => {
    if (prState.ch < 0) return;
    const { px, py } = prPos(ev);
    if (prMarquee) { prMarquee.x1 = px; prMarquee.y1 = py; prMarquee.moved = true; prDraw(); return; }
    if (!prDrag) return;
    const total = lpLoopBeats(); const sn = b => ev.altKey ? b : prSnap(b);
    if (prDrag.mode === 'move') {
      const dB = sn(prXToBeat(px)) - prDrag.downB;
      const dM = prYToMidi(py) - prDrag.downM;
      prDrag.orig.forEach((o, s) => {
        s.startBeat = Math.max(0, Math.min(total - s.dur, o.startBeat + dB));
        s.midi = Math.max(21, Math.min(108, o.midi + dM));
      });
    } else {   // resize una nota
      const n = prDrag.note; if (n) { const minDur = prState.grid > 0 ? prState.grid : 0.05;
        n.dur = Math.max(minDur, Math.min(total - n.startBeat, sn(prXToBeat(px)) - n.startBeat)); }
    }
    prDraw();
  });
```

- [ ] **Step 3: Reescribir `prEditUp`** (≈3356) para resolver recuadro / clic en vacío

```javascript
  function prEditUp(ev) {
    if (prMarquee) {
      if (prMarquee.moved) {                      // recuadro → seleccionar lo que toca
        const sel = prNotesInRect(prMarquee.x0, prMarquee.y0, prMarquee.x1, prMarquee.y1);
        if (!prMarquee.add) prSel = new Set();
        sel.forEach(n => prSel.add(n));
      } else if (prSel.size) {                    // clic simple en vacío con selección → deseleccionar
        prSel = new Set();
      } else {                                     // clic simple en vacío sin selección → crear nota
        prPushUndo(); const ch = lp.channels[prState.ch];
        const newDur = prState.grid > 0 ? prState.grid : 0.25;
        const b = Math.max(0, Math.min(lpLoopBeats() - newDur, prSnap(prXToBeat(prMarquee.x0))));
        const n = { midi: prYToMidi(prMarquee.y0), startBeat: b, dur: newDur, vel: 0.8 };
        ch.notes.push(n); prSel = new Set([n]); saveLooper();
      }
      prMarquee = null; prDraw(); return;
    }
    if (prDrag) { prDrag = null; saveLooper(); prDraw(); }
  }
  prCanvas.addEventListener('pointerup', prEditUp);
  prCanvas.addEventListener('pointercancel', prEditUp);
```
(Sustituye la versión anterior de `prEditUp` y sus dos `addEventListener`.)

- [ ] **Step 4: Doble-clic = borrar (con deshacer)** (≈3359)
```javascript
  prCanvas.addEventListener('dblclick', ev => {
    if (prState.ch < 0) return; const { px, py } = prPos(ev); const hit = prNoteAt(px, py);
    if (hit) { prPushUndo(); const n = lp.channels[prState.ch].notes[hit.k]; prSel.delete(n);
      lp.channels[prState.ch].notes.splice(hit.k, 1); saveLooper(); prDraw(); }
  });
```

- [ ] **Step 5: Verificar sintaxis y prueba manual**
Run: (verificación) → `SINTAXIS_OK`.
Manual: arrastrar en vacío dibuja un recuadro y selecciona; Shift+arrastre añade; Shift+clic en nota
alterna; arrastrar una nota seleccionada mueve **todo el grupo** con snap; clic simple en vacío crea
nota (o deselecciona si había selección); clic derecho/doble-clic borran; resize sigue por nota.

- [ ] **Step 6: Commit**
```bash
git add pianova.html
git commit -m "Piano-roll: recuadro de selección + Shift-clic + mover en grupo"
```

---

### Task 4: Atajos de teclado (Ctrl+A/C/V/D/Z/Y, Supr)

**Files:**
- Modify: `pianova.html` — funciones de comandos + bloque en el listener `keydown` (≈1724, tras la
  línea de `Escape`).

**Interfaces:**
- Consumes: `prSel`, `prClip`, `prPushUndo`, `prDoUndo`, `prDoRedo`, `prRelClip`, `prSpan`,
  `lp.channels`, `lpLoopBeats`, `lp.beat`/`lp.playing`, `saveLooper`, `prDraw`.
- Produces: `prSelectAll`, `prCopySel`, `prPaste`, `prDuplicate`, `prDeleteSel` + el cableado de teclas.

- [ ] **Step 1: Funciones de comandos** (en la sección del piano-roll)
```javascript
  function prSelectAll(){ if (prState.ch < 0) return; prSel = new Set(lp.channels[prState.ch].notes); prDraw(); }
  function prCopySel(){ if (prSel.size) prClip = prRelClip([...prSel]); }
  function prDeleteSel(){ if (prState.ch < 0 || !prSel.size) return; prPushUndo();
    const a = lp.channels[prState.ch].notes;
    for (let i = a.length - 1; i >= 0; i--) if (prSel.has(a[i])) a.splice(i, 1);
    prSel = new Set(); saveLooper(); prDraw(); }
  function prPaste(){ if (prState.ch < 0 || !prClip.length) return; prPushUndo();
    const ch = lp.channels[prState.ch], total = lpLoopBeats();
    const at = (lp.playing ? (lp.beat % total) : 0); const added = [];
    prClip.forEach(c => { const n = { midi: c.midi, startBeat: Math.max(0, Math.min(total - c.dur, at + c.startBeat)), dur: c.dur, vel: c.vel };
      ch.notes.push(n); added.push(n); });
    prSel = new Set(added); saveLooper(); prDraw(); }
  function prDuplicate(){ if (prState.ch < 0 || !prSel.size) return; prPushUndo();
    const ch = lp.channels[prState.ch], total = lpLoopBeats(); const sel = [...prSel]; const span = prSpan(sel); const added = [];
    sel.forEach(n => { const nn = { midi: n.midi, startBeat: Math.min(total - n.dur, n.startBeat + span), dur: n.dur, vel: n.vel };
      ch.notes.push(nn); added.push(nn); });
    prSel = new Set(added); saveLooper(); prDraw(); }
```

- [ ] **Step 2: Cablear teclas** — en el listener `keydown` (≈1724), JUSTO DESPUÉS de la línea
`if (ev.key === 'Escape' && !$('pianoroll').hidden) { prClose(); return; }`, añadir:
```javascript
    if (!$('pianoroll').hidden) {
      const ctrl = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase();
      if (ctrl && k === 'a') { prSelectAll(); ev.preventDefault(); return; }
      if (ctrl && k === 'c') { prCopySel(); ev.preventDefault(); return; }
      if (ctrl && k === 'v') { prPaste(); ev.preventDefault(); return; }
      if (ctrl && k === 'd') { prDuplicate(); ev.preventDefault(); return; }
      if (ctrl && k === 'z' && !ev.shiftKey) { prDoUndo(); ev.preventDefault(); return; }
      if (ctrl && (k === 'y' || (k === 'z' && ev.shiftKey))) { prDoRedo(); ev.preventDefault(); return; }
      if (k === 'delete' || k === 'backspace') { prDeleteSel(); ev.preventDefault(); return; }
    }
```
(Las teclas SIN Ctrl que no sean Supr/Backspace siguen su curso normal — p. ej. tocar notas con el
teclado del ordenador para auditar; este bloque solo intercepta Ctrl+… y Supr/Backspace.)

- [ ] **Step 3: Verificar sintaxis y prueba manual**
Run: (verificación) → `SINTAXIS_OK`.
Manual: con el piano-roll abierto: **Ctrl+A** selecciona todo; **Supr** borra la selección; **Ctrl+C**
+ **Ctrl+V** pega en el cabezal (parado = inicio); **Ctrl+D** duplica detrás; **Ctrl+Z**/**Ctrl+Y**
deshacen/rehacen varias acciones; pega en OTRO canal (abre otro y Ctrl+V); el navegador no roba los
atajos; tocar letras sin Ctrl sigue sonando.

- [ ] **Step 4: Commit**
```bash
git add pianova.html
git commit -m "Piano-roll: atajos Ctrl+A/C/V/D/Z/Y y Supr (portapapeles + deshacer/rehacer)"
```

---

### Task 5: Documentación + versión

**Files:**
- Modify: `pianova.html` (`const VERSION`), `CLAUDE.md`, `HANDOFF.md`.

- [ ] **Step 1: Subir versión** — `grep -n "VERSION = 'v1\." pianova.html` y subir (de `v1.21` a `v1.22`).
- [ ] **Step 2: `CLAUDE.md`** — en la sección del piano-roll, añadir: **edición avanzada** — `prSel`
  (selección por recuadro `prNotesInRect`/Shift/Ctrl+A), mover en grupo, `prClip` (portapapeles
  relativo, pegar en el cabezal), `prDuplicate`, y deshacer/rehacer multinivel `prUndo`/`prRedo`
  (`prPushUndo` antes de cada mutación); atajos en `keydown` solo con el overlay abierto.
- [ ] **Step 3: `HANDOFF.md`** — entrada de versión nueva.
- [ ] **Step 4: Verificar sintaxis** → `SINTAXIS_OK`.
- [ ] **Step 5: Commit** (sin publicar; el controlador fusiona/publica tras la revisión final)
```bash
git add pianova.html CLAUDE.md HANDOFF.md
git commit -m "Piano-roll edición avanzada: docs + versión vXY"
```

---

## Self-review (plan vs spec)
- Funciones puras (recuadro, copia relativa, span) + tests → Task 1. ✔
- Estado `prSel`/`prClip`/`prMarquee`, deshacer/rehacer multinivel, limpiar al abrir/cerrar, dibujo
  de selección y recuadro → Task 2. ✔
- Recuadro + Shift-clic + mover en grupo (reescritura de manejadores) → Task 3. ✔
- Ctrl+A/C/V/D/Z/Y + Supr, pegar en el cabezal, duplicar detrás, pegar en otro canal (prClip global)
  → Task 4. ✔
- Solo con overlay abierto + `preventDefault` → Tasks 3/4. ✔
- Opera sobre `lp.channels[prState.ch].notes` + `saveLooper` + persiste → todas. ✔
- Fuera de alcance (resize múltiple, arrastrar entre canales) → no se implementan. ✔
- Verificación node --check + tests puros + manual → cada tarea. ✔
```
