# Navegador de librería de samples — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cargar carpetas de audio del disco y navegarlas estilo Ableton (buscar, previsualizar,
asignar a canal o como instrumento melódico), reutilizando el motor de `samples` existente.

**Architecture:** Todo en `pianova.html`. Un panel lateral acoplado a la izquierda del Looper
muestra un árbol de carpetas y resultados leídos por **File System Access API** (`showDirectoryPicker`,
con respaldo `webkitdirectory`). Los audios se **decodifican bajo demanda**. Asignar reutiliza
`samples`/`'sample:id'`; tocar melódico añade un nuevo `currentInstrument.type==='sample'`. El handle
de la carpeta se guarda en **IndexedDB**; el árbol/favoritos/recientes en `localStorage`.

**Tech Stack:** HTML+CSS+JS inline (IIFE `'use strict'`), Web Audio, File System Access API,
IndexedDB. Sin librerías de instalación. Verificación: `node --check` + tests Node de funciones
puras + prueba manual en Chrome/Edge.

## Global Constraints

- **Un solo archivo** `pianova.html`; sin frameworks ni build; `smplr` intacto.
- **Textos e interfaz en español.** **No empeorar el escritorio.**
- **Solo audio**: extensiones `.wav .aiff .aif .flac .mp3 .ogg .m4a`. Plugins (`.nki .vst .exs`) NO
  usables (gris/ocultos).
- **Importar carpeta = solo escritorio**; en móvil se mantiene la importación de archivos sueltos.
- Reutilizar el motor existente: `samples[id]={name,buffer,b64,trimStart,trimEnd,melodic,base}`,
  `playChannelSound` (`'sample:id'`), `saveSamples`, `decodePendingSamples`, `selectedChannel`.
- Verificación de sintaxis tras cada tarea:
  ```bash
  node -e "const fs=require('fs');const h=fs.readFileSync('pianova.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('pv_check.js',m.map(x=>x[1]).join('\n;\n'));" && node --check pv_check.js && echo SINTAXIS_OK && rm -f pv_check.js
  ```

## Mapa de archivos
- `pianova.html` — único archivo. Secciones nuevas, todas marcadas con comentarios
  `// ---------- Navegador de samples ----------`:
  - **Motor:** `addSample()` (refactor del import por canal), instrumento `type:'sample'` en
    `noteOn`/`silence`, `sampleVoices`.
  - **IndexedDB:** `idbSet`/`idbGet`.
  - **Importar+escaneo:** `isAudioFile`, `libImportFolder`, `scanDirHandle`, `libState`.
  - **UI:** HTML del panel `#libPanel`, CSS `.lib*`, `libRender*`, búsqueda, pestañas.
  - **Acciones:** `libPreview`, `libAssignChannel`, `libAssignInstrument`, favoritos/recientes,
    arrastrar-soltar.
  - **Persistencia:** `store.lib`, reapertura al iniciar.
- Tests temporales en el scratchpad (no se commitean).

---

### Task 1: Motor — instrumento global `type:'sample'` + `addSample()` (refactor DRY)

**Files:**
- Modify: `pianova.html` — `noteOn`/`silence` (≈742-754), añadir `sampleVoices`; nuevo `addSample`;
  refactor del handler `#lpSampleFile` (≈2602-2621) para usar `addSample`.

**Interfaces:**
- Produces:
  - `async function addSample(name, arrayBuffer) -> id` (registra en `samples`, persiste si ≤1,5 MB).
  - `currentInstrument = { type:'sample', id }` reproducible por `noteOn`/`silence`.
  - `pitchRate(midi, base) -> number`.

- [ ] **Step 1: Test Node de la fórmula de tono (función pura)**

Crear `scratchpad/lib_test.js`:
```js
function pitchRate(midi, base){ return Math.pow(2,(midi-base)/12); }
function isAudioFile(name){ return /\.(wav|aiff?|flac|mp3|ogg|m4a)$/i.test(name); }
// pitch
if (Math.abs(pitchRate(60,60)-1) > 1e-9) throw new Error('FALLO base');
if (Math.abs(pitchRate(72,60)-2) > 1e-9) throw new Error('FALLO octava');
// extensiones
['a.wav','b.MP3','c.flac','d.aif'].forEach(n=>{ if(!isAudioFile(n)) throw new Error('FALLO audio '+n); });
['x.nki','y.vst','z.txt','w.exs'].forEach(n=>{ if(isAudioFile(n)) throw new Error('FALLO no-audio '+n); });
console.log('TEST_OK pitch+ext');
```

- [ ] **Step 2: Ejecutar el test (debe pasar; valida la matemática y el filtro)**

Run: `node scratchpad/lib_test.js`
Expected: `TEST_OK pitch+ext`

- [ ] **Step 3: Añadir `sampleVoices`, `pitchRate` y `addSample` en `pianova.html`**

Justo antes de `function noteOn` (≈línea 742) insertar:
```javascript
  const sampleVoices = {};   // midi -> {src,g} del instrumento global tipo 'sample'
  function pitchRate(midi, base) { return Math.pow(2, (midi - (base || 60)) / 12); }
  // Registra un audio (ArrayBuffer) en el motor de samples y devuelve su id. Persiste si es pequeño.
  async function addSample(name, arr) {
    ensureAudio();
    const buffer = await actx.decodeAudioData(arr.slice(0));
    const id = 'smp_' + (++sampleSeq);
    const b64 = (arr.byteLength <= 1500000) ? abToB64(arr) : null;
    samples[id] = { name: name.replace(/\.[^.]+$/, ''), buffer, b64,
                    trimStart: 0, trimEnd: 1, melodic: false, base: 60 };
    if (b64) saveSamples();
    return id;
  }
  function sampleNoteOn(midi, vel) {
    const inst = currentInstrument; const sm = samples[inst.id];
    if (!sm || !sm.buffer) return;
    const dur = sm.buffer.duration;
    const ts = (sm.trimStart || 0) * dur, te = (sm.trimEnd != null ? sm.trimEnd : 1) * dur;
    const src = actx.createBufferSource(); src.buffer = sm.buffer;
    src.playbackRate.value = pitchRate(midi, sm.base);   // melódico por tecla
    const g = actx.createGain(); g.gain.value = Math.max(0.0002, 0.9 * (vel == null ? 0.8 : vel));
    src.connect(g); g.connect(masterDest());
    src.start(0, Math.max(0, ts), Math.max(0.02, te - ts));
    sampleVoices[midi] = { src, g };
  }
  function sampleSilence(midi) {
    const v = sampleVoices[midi]; if (!v) return;
    try { v.src.stop(); } catch (e) {}
    delete sampleVoices[midi];
  }
```

- [ ] **Step 4: Despachar el nuevo tipo en `noteOn` y `silence`**

Reemplazar `noteOn` y `silence` (≈742-754) por:
```javascript
  function noteOn(midi, vel = 0.8) {
    ensureAudio();
    if (voices[midi] || sfStops[midi] || sampleVoices[midi]) silence(midi);
    if (currentInstrument.type === 'sample') {
      sampleNoteOn(midi, vel);
    } else if (currentInstrument.type === 'sf' && sfPlayer) {
      try { sfStops[midi] = sfPlayer.start({ note: midi, velocity: Math.round(vel * 127) }); } catch (e) {}
    } else {
      synthNoteOn(midi, vel, SYNTH[currentInstrument.preset] || SYNTH.piano);
    }
  }
  function silence(midi) {
    if (sfStops[midi]) { try { sfStops[midi](); } catch (e) {} delete sfStops[midi]; }
    if (sampleVoices[midi]) sampleSilence(midi);
    if (voices[midi]) synthSilence(midi);
  }
```
Y en `silenceAll` (≈755) añadir, antes del cierre `}`:
```javascript
    for (const m in sampleVoices) sampleSilence(+m);
```

- [ ] **Step 5: Refactor del handler `#lpSampleFile` para usar `addSample` (DRY)**

Reemplazar el cuerpo del `try` del handler (≈2607-2617) por:
```javascript
      const arr = await f.arrayBuffer();
      const big = arr.byteLength > 1500000;
      const id = await addSample(f.name, arr);
      lp.channels[ch].sound = 'sample:' + id;
      rebuildChannelSoundOptions();
      saveLooper();
      if (big) alert('Sonido cargado para esta sesión. Es grande (> 1,5 MB), así que no se guardará al recargar.');
```

- [ ] **Step 6: Verificar sintaxis y test**

Run:
```bash
node scratchpad/lib_test.js && node -e "const fs=require('fs');const h=fs.readFileSync('pianova.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('pv_check.js',m.map(x=>x[1]).join('\n;\n'));" && node --check pv_check.js && echo SINTAXIS_OK && rm -f pv_check.js
```
Expected: `TEST_OK pitch+ext` y `SINTAXIS_OK`.

- [ ] **Step 7: Commit**
```bash
git add pianova.html
git commit -m "Samples: instrumento global tipo 'sample' (melódico) + addSample() (DRY)"
```

---

### Task 2: Panel del navegador (shell visible) + botón "📁 Librería"

**Files:**
- Modify: `pianova.html` — HTML del `#looperView` (botón en `.controls` ≈350-369; panel dentro de
  `main`/`.lpTracks` ≈371-374), CSS nuevo, y JS de toggle.

**Interfaces:**
- Produces: `#libPanel` (oculto por defecto), `function libToggle()`, `libState` (estado en memoria),
  `function libRender()` (placeholder que pinta "sin librería").

- [ ] **Step 1: Añadir el botón en los controles del Looper**

Tras el botón `#lpExport` (≈368) añadir:
```html
      <button id="libBtn">📁 Librería</button>
```

- [ ] **Step 2: Añadir el panel acoplado dentro de `.lpTracks`**

Cambiar el contenedor `.lpTracks` (≈371-374) para que el panel vaya como **primera** columna:
```html
      <div class="lpTracks">
        <aside id="libPanel" class="libPanel" hidden>
          <div class="libHead">📁 Librería <span class="libHeadActs"><button id="libClose" title="Cerrar">✕</button></span></div>
          <div class="libTabs">
            <button class="libTab on" data-libtab="folders">📁 Carpetas</button>
            <button class="libTab" data-libtab="favs">⭐ Favoritos</button>
            <button class="libTab" data-libtab="recent">🕘 Recientes</button>
          </div>
          <input id="libSearch" class="libSearch" type="search" placeholder="🔎 Buscar sample…">
          <div id="libBody" class="libBody"></div>
          <div class="libFoot"><button id="libImport" class="primary">📁 Importar librería…</button></div>
        </aside>
        <div class="lpHeads" id="lpChannels"></div>
        <div class="stage"><canvas id="lpCanvas"></canvas></div>
      </div>
```

- [ ] **Step 3: Añadir el CSS del panel**

Tras el bloque CSS del looper (después de `.lpHead button.muted{...}`, ≈línea 92) añadir:
```css
  /* ---------- Navegador de samples ---------- */
  .libPanel{flex:0 0 240px; display:flex; flex-direction:column; background:#0f1218;
    border-right:1px solid var(--line); min-width:0}
  .libPanel[hidden]{display:none}
  .libHead{display:flex; align-items:center; padding:8px 10px; background:#12151d;
    border-bottom:1px solid var(--line); font-family:var(--disp); font-weight:600; font-size:13px}
  .libHeadActs{margin-left:auto}
  .libHeadActs button{padding:2px 7px; font-size:12px; line-height:1}
  .libTabs{display:flex; gap:2px; padding:6px; border-bottom:1px solid var(--line)}
  .libTab{flex:1; padding:5px 4px; font-size:11px; background:transparent; border:1px solid transparent}
  .libTab.on{background:#1d2733; color:#9fd0f0; border-color:#26384a}
  .libSearch{margin:8px; padding:6px 8px; font-size:12px; background:#161b24;
    border:1px solid var(--line); border-radius:7px; color:var(--ink)}
  .libBody{flex:1; overflow:auto; min-height:0}
  .libEmpty{padding:18px 12px; color:var(--muted); font-size:12px; text-align:center}
  .libSec{padding:6px 12px 3px; font-size:9px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted)}
  .libTreeItem{display:flex; gap:6px; align-items:center; padding:3px 10px; cursor:pointer; font-size:12px}
  .libTreeItem:hover{background:#141a23}
  .libTreeItem.on{background:#15202c; color:#9fd0f0; box-shadow:inset 2px 0 0 #4a90c2}
  .libRow{display:flex; align-items:center; gap:8px; padding:5px 10px; border-bottom:1px solid #151a22; font-size:12px}
  .libRow:hover{background:#141a23}
  .libRow.dragging{opacity:.5}
  .libRow .nm{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#cfd6e0}
  .libRow.disabled .nm{color:#5a616e}
  .libRow button{padding:2px 6px; font-size:12px; line-height:1; background:transparent; border:none}
  .libRow .play{color:var(--green)} .libRow .toCh{color:#ffce7a} .libRow .toInst{color:#9fd0f0}
  .libFoot{padding:8px; border-top:1px solid var(--line)}
  .libFoot .primary{width:100%; font-size:12px}
```

- [ ] **Step 4: Estado, toggle y render placeholder en JS**

En la sección de estado del looper (cerca de `let quantizeGrid = 0;`, ≈795) añadir:
```javascript
  // Navegador de samples
  const libState = { dirHandle: null, tree: null, current: null, tab: 'folders',
                     favs: [], recent: [], query: '' };
  let libFileMap = {};   // path -> {name, getFile()} para leer bajo demanda
```
Y en el cableado de eventos (junto a los listeners del looper, p. ej. tras el listener de `#lpExport`)
añadir:
```javascript
  function libToggle(show) {
    const p = $('libPanel');
    p.hidden = (show == null) ? !p.hidden : !show;
    if (!p.hidden) libRender();
  }
  function libRender() {
    const body = $('libBody');
    if (!libState.tree) { body.innerHTML = '<div class="libEmpty">Aún no has importado ninguna carpeta.<br>Pulsa “Importar librería…”.</div>'; return; }
    body.innerHTML = '<div class="libEmpty">Carpeta lista. (resultados en la siguiente fase)</div>';
  }
  $('libBtn').addEventListener('click', () => libToggle());
  $('libClose').addEventListener('click', () => libToggle(false));
  $('libImport').addEventListener('click', () => libImportFolder());
```
(`libImportFolder` se define en la Task 3; de momento añade un stub temporal para que no falle:
`function libImportFolder(){ alert('Importar: siguiente fase'); }` y se sustituye en la Task 3.)

- [ ] **Step 5: Verificar sintaxis**
Run: (comando de verificación de sintaxis del bloque "Global Constraints")
Expected: `SINTAXIS_OK`.

- [ ] **Step 6: Prueba manual**
Abrir el Looper → pulsar **📁 Librería** → aparece el panel a la izquierda con pestañas, búsqueda,
mensaje "Aún no has importado…" y botón Importar; **✕** lo cierra. Las cabeceras de canal se ven a su
derecha sin romperse.

- [ ] **Step 7: Commit**
```bash
git add pianova.html
git commit -m "Navegador de samples: panel lateral (shell) + botón Librería"
```

---

### Task 3: Importar carpeta + escaneo perezoso del árbol (FS Access + fallback)

**Files:**
- Modify: `pianova.html` — sustituir el stub `libImportFolder`; añadir `isAudioFile`,
  `scanDirHandle`, fallback `webkitdirectory`, y render real del árbol+resultados.
- Modify: `pianova.html` — añadir un `<input type="file" id="libFolderInput" webkitdirectory hidden>`
  junto a `#lpSampleFile` (≈385).

**Interfaces:**
- Consumes: `libState`, `libFileMap`, `addSample` (Task 1), `isAudioFile`/`pitchRate` (Task 1 test).
- Produces:
  - `function isAudioFile(name)->bool`.
  - `async function scanDirHandle(handle, path)->treeNode` con
    `{name, kind:'dir'|'file', path, ext?, children?}`.
  - `function libCurrentFiles()->[fileNode]` (archivos de la carpeta seleccionada, filtrados por búsqueda).
  - `libRender()` real: árbol + resultados.

- [ ] **Step 1: Añadir `isAudioFile` y el input de respaldo**

En JS (junto a `pitchRate`, Task 1) añadir:
```javascript
  const AUDIO_EXT = /\.(wav|aiff?|flac|mp3|ogg|m4a)$/i;
  function isAudioFile(name) { return AUDIO_EXT.test(name); }
  function fileExt(name) { const m = name.match(/\.([^.]+)$/); return m ? m[1].toLowerCase() : ''; }
```
En HTML, tras `#lpSampleFile` (≈385) añadir:
```html
      <input type="file" id="libFolderInput" webkitdirectory hidden>
```

- [ ] **Step 2: Escaneo del árbol (File System Access API)**

Añadir:
```javascript
  // Recorre un FileSystemDirectoryHandle y devuelve un árbol ligero (sin leer audios).
  async function scanDirHandle(handle, path) {
    const node = { name: handle.name, kind: 'dir', path: path || handle.name, children: [] };
    for await (const [name, h] of handle.entries()) {
      if (h.kind === 'directory') {
        node.children.push(await scanDirHandle(h, node.path + '/' + name));
      } else if (isAudioFile(name)) {
        const p = node.path + '/' + name;
        node.children.push({ name, kind: 'file', path: p, ext: fileExt(name) });
        libFileMap[p] = { name, handle: h };
      }
    }
    node.children.sort((a, b) => (a.kind === b.kind) ? a.name.localeCompare(b.name) : (a.kind === 'dir' ? -1 : 1));
    return node;
  }
```

- [ ] **Step 3: `libImportFolder` (con respaldo) — sustituir el stub**

```javascript
  async function libImportFolder() {
    ensureAudio();
    libFileMap = {};
    if (window.showDirectoryPicker) {
      try {
        const handle = await window.showDirectoryPicker({ id: 'pianova-lib', mode: 'read' });
        libState.dirHandle = handle;
        $('libBody').innerHTML = '<div class="libEmpty">Escaneando…</div>';
        libState.tree = await scanDirHandle(handle, handle.name);
        libState.current = libState.tree;
        await idbSet('dir', handle);        // Task 6 (persistencia); si no existe aún, no rompe
        libSave(); libRender();
      } catch (e) { if (e && e.name !== 'AbortError') alert('No pude abrir la carpeta.'); }
    } else {
      $('libFolderInput').click();          // respaldo webkitdirectory
    }
  }
  // Respaldo: construir árbol desde una lista de File (webkitRelativePath)
  $('libFolderInput').addEventListener('change', e => {
    ensureAudio();
    const files = [...e.target.files].filter(f => isAudioFile(f.name)); e.target.value = '';
    if (!files.length) { alert('Esa carpeta no tiene audios (.wav/.mp3…).'); return; }
    libFileMap = {}; const root = { name: 'Mi carpeta', kind: 'dir', path: 'Mi carpeta', children: [] };
    for (const f of files) {
      const parts = (f.webkitRelativePath || f.name).split('/'); let cur = root, acc = root.path;
      for (let i = 1; i < parts.length - 1; i++) {
        acc += '/' + parts[i]; let d = cur.children.find(c => c.kind === 'dir' && c.name === parts[i]);
        if (!d) { d = { name: parts[i], kind: 'dir', path: acc, children: [] }; cur.children.push(d); }
        cur = d;
      }
      const p = (f.webkitRelativePath || f.name); cur.children.push({ name: f.name, kind: 'file', path: p, ext: fileExt(f.name) });
      libFileMap[p] = { name: f.name, file: f };
    }
    libState.dirHandle = null; libState.tree = root; libState.current = root;
    libSave(); libRender();
  });
```
(`idbSet`/`libSave` se definen en la Task 6; añade stubs temporales
`async function idbSet(){} function libSave(){}` y se sustituyen en la Task 6.)

- [ ] **Step 4: Lectura de un nodo a AudioBuffer (bajo demanda) + cache**

```javascript
  const libBufCache = {};   // path -> AudioBuffer
  async function libNodeArrayBuffer(node) {
    const ref = libFileMap[node.path]; if (!ref) return null;
    const file = ref.file || (ref.handle ? await ref.handle.getFile() : null);
    return file ? await file.arrayBuffer() : null;
  }
  async function libNodeBuffer(node) {
    if (libBufCache[node.path]) return libBufCache[node.path];
    const arr = await libNodeArrayBuffer(node); if (!arr) return null;
    const buf = await actx.decodeAudioData(arr.slice(0)); libBufCache[node.path] = buf; return buf;
  }
```

- [ ] **Step 5: Render real (árbol + resultados)**

Sustituir `libRender` por:
```javascript
  function libCurrentFiles() {
    const dir = libState.current || libState.tree; if (!dir) return [];
    let files = dir.children.filter(c => c.kind === 'file');
    const q = libState.query.trim().toLowerCase();
    if (q) files = files.filter(f => f.name.toLowerCase().includes(q));
    return files;
  }
  function libRender() {
    const body = $('libBody');
    if (!libState.tree) { body.innerHTML = '<div class="libEmpty">Aún no has importado ninguna carpeta.<br>Pulsa “Importar librería…”.</div>'; return; }
    let html = '';
    if (libState.tab === 'folders') {
      html += '<div class="libSec">Carpetas</div>';
      const walk = (node, depth) => {
        if (node.kind !== 'dir') return;
        const on = (libState.current === node) ? ' on' : '';
        html += '<div class="libTreeItem' + on + '" data-dir="' + encodeURIComponent(node.path) + '" style="padding-left:' + (10 + depth * 12) + 'px">📁 ' + esc(node.name) + '</div>';
        node.children.forEach(c => walk(c, depth + 1));
      };
      walk(libState.tree, 0);
    }
    const files = (libState.tab === 'favs')
      ? Object.values(libFileMap).filter(r => libState.favs.includes(pathOf(r))).map(r => fileNodeOf(r))
      : (libState.tab === 'recent')
      ? libState.recent.map(p => ({ name: p.split('/').pop(), kind: 'file', path: p, ext: fileExt(p) }))
      : libCurrentFiles();
    html += '<div class="libSec">' + (libState.tab === 'favs' ? 'Favoritos' : libState.tab === 'recent' ? 'Recientes' : 'Resultados · ' + files.length) + '</div>';
    files.forEach(f => {
      const fav = libState.favs.includes(f.path) ? '★' : '☆';
      html += '<div class="libRow" draggable="true" data-file="' + encodeURIComponent(f.path) + '">' +
        '<span class="nm" title="' + esc(f.name) + '">♪ ' + esc(f.name) + '</span>' +
        '<button class="fav" title="Favorito" data-fav="' + encodeURIComponent(f.path) + '">' + fav + '</button>' +
        '<button class="play" title="Escuchar" data-play="' + encodeURIComponent(f.path) + '">▶</button>' +
        '<button class="toCh" title="A canal seleccionado" data-toch="' + encodeURIComponent(f.path) + '">✚</button>' +
        '<button class="toInst" title="Como instrumento" data-toinst="' + encodeURIComponent(f.path) + '">🎹</button>' +
        '</div>';
    });
    body.innerHTML = html;
  }
  function esc(s){ return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function nodeByPath(p){ // busca un fileNode por path en el árbol
    let found = null; const walk = n => { if (n.path === p && n.kind==='file') found = n; (n.children||[]).forEach(walk); };
    if (libState.tree) walk(libState.tree); return found || { name: p.split('/').pop(), kind:'file', path:p, ext:fileExt(p) };
  }
  function pathOf(ref){ for (const p in libFileMap){ if (libFileMap[p]===ref) return p; } return ''; }
  function fileNodeOf(ref){ const p = pathOf(ref); return { name: ref.name, kind:'file', path:p, ext:fileExt(ref.name) }; }
```

- [ ] **Step 6: Cableado de pestañas, búsqueda y clic en carpeta**

```javascript
  $('libSearch').addEventListener('input', e => { libState.query = e.target.value; libRender(); });
  document.querySelectorAll('.libTab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.libTab').forEach(x => x.classList.remove('on'));
    t.classList.add('on'); libState.tab = t.dataset.libtab; libRender();
  }));
  $('libBody').addEventListener('click', ev => {
    const dir = ev.target.closest('[data-dir]');
    if (dir) { const p = decodeURIComponent(dir.dataset.dir);
      const find = n => { if (n.path===p) return n; for (const c of (n.children||[])){ const r=find(c); if (r) return r; } return null; };
      libState.current = find(libState.tree) || libState.tree; libRender(); return; }
    // botones de fila → Task 4
    libRowAction(ev);
  });
```
(Definir `function libRowAction(ev){}` vacío aquí; se rellena en la Task 4.)

- [ ] **Step 7: Verificar sintaxis y prueba manual**
Run: (verificación de sintaxis)
Expected: `SINTAXIS_OK`.
Manual (Chrome/Edge): **Importar librería…** → elegir una carpeta con .wav/.mp3 → se ve el árbol de
carpetas; al clicar una carpeta, salen sus audios en Resultados; la búsqueda filtra por nombre.

- [ ] **Step 8: Commit**
```bash
git add pianova.html
git commit -m "Navegador de samples: importar carpeta + escaneo perezoso + árbol/resultados"
```

---

### Task 4: Acciones de fila — ▶ escuchar, ✚ a canal, 🎹 a instrumento, ⭐ favorito

**Files:**
- Modify: `pianova.html` — rellenar `libRowAction`; usar `addSample`, `libNodeBuffer`,
  `selectedChannel`, `applyInstrument`/`currentInstrument`, `instSel`.

**Interfaces:**
- Consumes: `libNodeBuffer`, `libNodeArrayBuffer`, `addSample`, `samples`, `rebuildChannelSoundOptions`,
  `saveLooper`, `selectedChannel`, `instSel`, `currentInstrument`, `silenceAll`.
- Produces: `function libRowAction(ev)`; `function libAddRecent(path)`.

- [ ] **Step 1: Previsualización one-shot (▶)**

```javascript
  let libPreviewSrc = null;
  async function libPreview(node) {
    ensureAudio();
    if (libPreviewSrc) { try { libPreviewSrc.stop(); } catch (e) {} libPreviewSrc = null; }
    const buf = await libNodeBuffer(node); if (!buf) { alert('No pude leer ese audio.'); return; }
    const src = actx.createBufferSource(); src.buffer = buf;
    src.connect(masterDest()); src.start(); libPreviewSrc = src;
    src.onended = () => { if (libPreviewSrc === src) libPreviewSrc = null; };
  }
```

- [ ] **Step 2: Asignar a canal (✚) y a instrumento (🎹)**

```javascript
  async function libRegister(node) {
    const arr = await libNodeArrayBuffer(node); if (!arr) { alert('No pude leer ese audio.'); return null; }
    const id = await addSample(node.name, arr);
    libAddRecent(node.path);
    return id;
  }
  async function libAssignChannel(node, chIndex) {
    const i = (chIndex == null) ? selectedChannel : chIndex;
    const id = await libRegister(node); if (!id) return;
    lp.channels[i].sound = 'sample:' + id;
    rebuildChannelSoundOptions(); saveLooper(); lpUpdateSelected();
  }
  async function libAssignInstrument(node) {
    const id = await libRegister(node); if (!id) return;
    if (actx) silenceAll();
    currentInstrument = { type: 'sample', id }; sfPlayer = null;
    // reflejar en el selector global con una opción dinámica
    let opt = instSel.querySelector('option[value="sample:' + id + '"]');
    if (!opt) { opt = document.createElement('option'); opt.value = 'sample:' + id; instSel.appendChild(opt); }
    opt.textContent = '🎙 ' + samples[id].name;
    instSel.value = 'sample:' + id;
    if (typeof instInfo !== 'undefined' && instInfo) instInfo.textContent = 'Instrumento: ' + samples[id].name + ' (melódico)';
    savePrefs();
  }
  function libAddRecent(path) {
    libState.recent = [path, ...libState.recent.filter(p => p !== path)].slice(0, 20);
    libSave();
  }
```

- [ ] **Step 3: Soportar `type:'sample'` en `applyInstrument` (al restaurar preferencia)**

En `applyInstrument` (≈2418) añadir, tras `const parts = value.split(':');`:
```javascript
    if (parts[0] === 'sample') {
      const sm = samples[parts[1]];
      if (sm) { currentInstrument = { type: 'sample', id: parts[1] }; sfPlayer = null; if (instInfo) instInfo.textContent = 'Instrumento: ' + sm.name + ' (melódico)'; }
      else { currentInstrument = { type: 'synth', preset: 'piano' }; instSel.value = 'synth:piano'; }
      return;
    }
```

- [ ] **Step 4: Rellenar `libRowAction`**

```javascript
  function libRowAction(ev) {
    const t = ev.target;
    if (t.dataset.play != null) { libPreview(nodeByPath(decodeURIComponent(t.dataset.play))); }
    else if (t.dataset.toch != null) { libAssignChannel(nodeByPath(decodeURIComponent(t.dataset.toch))); }
    else if (t.dataset.toinst != null) { libAssignInstrument(nodeByPath(decodeURIComponent(t.dataset.toinst))); }
    else if (t.dataset.fav != null) {
      const p = decodeURIComponent(t.dataset.fav);
      libState.favs = libState.favs.includes(p) ? libState.favs.filter(x => x !== p) : [...libState.favs, p];
      libSave(); libRender();
    }
  }
```

- [ ] **Step 5: Verificar sintaxis y prueba manual**
Run: (verificación de sintaxis) → `SINTAXIS_OK`.
Manual: ▶ suena el sample; selecciona un canal (clic en su cabecera) y ✚ → ese canal usa el sample y
suena en el bucle; 🎹 → el sample queda como instrumento y se toca afinado en Aprender; ⭐ marca/
desmarca favorito y aparece en la pestaña Favoritos; los usados aparecen en Recientes.

- [ ] **Step 6: Commit**
```bash
git add pianova.html
git commit -m "Navegador de samples: acciones ▶ escuchar, ✚ a canal, 🎹 a instrumento, ⭐ favoritos"
```

---

### Task 5: Arrastrar y soltar un sample sobre un canal (escritorio)

**Files:**
- Modify: `pianova.html` — `dragstart` en `.libRow`; `dragover`/`drop` en `.lpHead` (las cabeceras).

**Interfaces:**
- Consumes: `libAssignChannel(node, chIndex)` (Task 4), `nodeByPath`.
- Produces: arrastre funcional fila→cabecera.

- [ ] **Step 1: `dragstart` en las filas del navegador**

En el listener de `#libBody` (o aparte) añadir:
```javascript
  $('libBody').addEventListener('dragstart', ev => {
    const row = ev.target.closest('.libRow'); if (!row) return;
    ev.dataTransfer.setData('text/pianova-sample', decodeURIComponent(row.dataset.file));
    ev.dataTransfer.effectAllowed = 'copy'; row.classList.add('dragging');
  });
  $('libBody').addEventListener('dragend', ev => {
    const row = ev.target.closest('.libRow'); if (row) row.classList.remove('dragging');
  });
```

- [ ] **Step 2: `dragover`/`drop` en las cabeceras de canal**

En el cableado del looper añadir (delegado en `lpChannelsEl`):
```javascript
  lpChannelsEl.addEventListener('dragover', ev => {
    if ([...ev.dataTransfer.types].includes('text/pianova-sample')) {
      ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy';
      const h = ev.target.closest('.lpHead'); if (h) h.classList.add('sel');
    }
  });
  lpChannelsEl.addEventListener('drop', ev => {
    const path = ev.dataTransfer.getData('text/pianova-sample'); if (!path) return;
    ev.preventDefault();
    const h = ev.target.closest('.lpHead'); if (!h) return;
    const i = +h.dataset.ch; selectedChannel = i; lpUpdateSelected();
    libAssignChannel(nodeByPath(path), i);
  });
```

- [ ] **Step 3: Verificar sintaxis y prueba manual**
Run: (verificación) → `SINTAXIS_OK`.
Manual (escritorio): arrastra una fila del navegador y suéltala sobre la cabecera del Canal 3 → el
Canal 3 pasa a usar ese sample y suena al reproducir. El ✚ sigue funcionando igual.

- [ ] **Step 4: Commit**
```bash
git add pianova.html
git commit -m "Navegador de samples: arrastrar y soltar un sample sobre un canal"
```

---

### Task 6: Persistencia (IndexedDB del handle + store.lib) y reapertura al iniciar

**Files:**
- Modify: `pianova.html` — sustituir stubs `idbSet`/`libSave`; añadir `idbGet`, `libRestore`;
  ampliar `store.lib`; llamar a `libRestore()` al iniciar (cerca de `decodePendingSamples`/arranque).

**Interfaces:**
- Consumes: `libState`, `scanDirHandle`, `libRender`.
- Produces: `idbSet(key,val)`, `idbGet(key)`, `libSave()`, `async libRestore()`.

- [ ] **Step 1: Wrapper mínimo de IndexedDB**

```javascript
  function idbDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('pianova', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function idbSet(key, val) { try { const db = await idbDB(); db.transaction('kv', 'readwrite').objectStore('kv').put(val, key); } catch (e) {} }
  async function idbGet(key) { try { const db = await idbDB(); return await new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (e) { return null; } }
```

- [ ] **Step 2: Guardado ligero en localStorage**

```javascript
  function libSave() {
    store.lib = { favs: libState.favs, recent: libState.recent, hasFolder: !!libState.dirHandle,
                  rootName: libState.tree ? libState.tree.name : null };
    saveStoreDebounced();
  }
```

- [ ] **Step 3: Reapertura al iniciar (pide permiso, re-escanea)**

```javascript
  async function libRestore() {
    const s = store.lib || {}; libState.favs = s.favs || []; libState.recent = s.recent || [];
    if (!window.showDirectoryPicker) return;
    const handle = await idbGet('dir'); if (!handle) return;
    try {
      const perm = await handle.queryPermission ? await handle.queryPermission({ mode: 'read' }) : 'granted';
      // No re-pedimos permiso sin gesto del usuario: solo re-escaneamos si ya está concedido.
      if (perm === 'granted') {
        ensureAudio(); libFileMap = {}; libState.dirHandle = handle;
        libState.tree = await scanDirHandle(handle, handle.name); libState.current = libState.tree;
        if (!$('libPanel').hidden) libRender();
      }
    } catch (e) {}
  }
```
Y en `libImportFolder`, donde ya hay `await idbSet('dir', handle);`, queda válido (Task 3).
Si el permiso no está concedido al iniciar, el usuario vuelve a pulsar **Importar librería…** (un
gesto) y se reabre.

- [ ] **Step 4: Llamar a `libRestore` al arrancar**

Cerca del arranque (donde se llama a `restoreSongs()`/`decodePendingSamples()` o al final del IIFE)
añadir:
```javascript
  libRestore();
```
Y en `loadStore` (≈2314), asegurar `store.lib = store.lib || null;` tras leer `o` (junto a
`store.samples`).

- [ ] **Step 5: Quitar los stubs temporales**
Eliminar los stubs `async function idbSet(){}`, `function libSave(){}`, `function libImportFolder(){…}`
y `function libRowAction(){}` que se pusieron en tareas previas (ya están las versiones reales).

- [ ] **Step 6: Verificar sintaxis y prueba manual**
Run: (verificación) → `SINTAXIS_OK`.
Manual: importa una carpeta, marca un favorito, **recarga** la app y abre el panel: favoritos/
recientes siguen; si el navegador mantiene el permiso, el árbol reaparece; si no, al pulsar Importar
vuelve al instante a la misma carpeta. En **móvil** el botón Importar usa archivos sueltos sin romper.

- [ ] **Step 7: Commit**
```bash
git add pianova.html
git commit -m "Navegador de samples: persistencia (IndexedDB del handle + store.lib) y reapertura"
```

---

### Task 7: Responsive + documentación + versión + publicar

**Files:**
- Modify: `pianova.html` — media queries del panel; subir versión.
- Modify: `CLAUDE.md`, `HANDOFF.md`.

- [ ] **Step 1: Responsive del panel**

En `@media (max-width:860px){ … }` añadir:
```css
    .libPanel{ position:absolute; z-index:5; left:0; top:0; bottom:0; flex-basis:84%; max-width:340px;
      box-shadow:8px 0 30px rgba(0,0,0,.5) }
    #libImport{ min-height:42px }
```
(El panel pasa a overlay sobre el Looper en móvil; sigue togglable con 📁 Librería. La importación de
carpeta no existe en móvil; el botón Importar abrirá el selector de archivos sueltos como respaldo —
ya cubierto por `libImportFolder` cuando no hay `showDirectoryPicker`.)

- [ ] **Step 2: Verificar sintaxis**
Run: (verificación) → `SINTAXIS_OK`.

- [ ] **Step 3: Subir versión en `pianova.html`**
`grep -n "v1\.[0-9]" pianova.html | head` y subir la cadena visible a la siguiente versión,
respetando el formato exacto.

- [ ] **Step 4: Actualizar `CLAUDE.md`**
En la arquitectura del Looper/Sampler, añadir un párrafo: **Navegador de samples** — importa carpetas
del disco (File System Access API `showDirectoryPicker` + respaldo `webkitdirectory`), escaneo
perezoso del árbol (`scanDirHandle`/`libFileMap`), panel `#libPanel` (pestañas Carpetas/Favoritos/
Recientes, búsqueda, resultados ▶/✚/🎹), acciones `libPreview`/`libAssignChannel`/`libAssignInstrument`,
arrastrar a la cabecera del canal, instrumento global `type:'sample'` (melódico, `pitchRate`), y
persistencia (handle en IndexedDB `pianova`, `store.lib` para favoritos/recientes). Solo escritorio
para importar carpeta.

- [ ] **Step 5: Actualizar `HANDOFF.md`**
Añadir entrada de la versión nueva con el Navegador de samples (resumen de lo anterior).

- [ ] **Step 6: Commit y publicar**
```bash
git add pianova.html CLAUDE.md HANDOFF.md
git commit -m "Navegador de samples: responsive + docs + versión vXY"
git push origin main
```
(Confirmar con el usuario antes del push si prefiere revisarlo en local.)

---

## Self-review (plan vs spec)
- Importar carpeta (FS Access + fallback, filtro audio, plugins fuera) → Task 3. ✔
- Lectura/decodifico bajo demanda + cache → Task 3 (`libNodeBuffer`/`libBufCache`). ✔
- Panel apilado (cabecera, pestañas, búsqueda, árbol, resultados) → Tasks 2-3. ✔
- ▶ escuchar / ✚ a canal / 🎹 a instrumento / ⭐ favoritos / 🕘 recientes → Task 4. ✔
- Arrastrar y soltar → Task 5. ✔
- Instrumento global `type:'sample'` melódico (nota base) → Task 1 (+ `applyInstrument` Task 4). ✔
- Persistencia (handle IndexedDB + store.lib) + reapertura → Task 6. ✔
- Responsive / móvil (archivos sueltos) → Task 7 (+ fallback Task 3). ✔
- Reutiliza motor de samples / `playChannelSound` `'sample:id'` → Task 1/4. ✔
- Fuera de alcance (multisample, .sf2, piano-roll) → no se implementan. ✔
- Verificación `node --check` + tests de funciones puras + manual → en cada tarea. ✔
