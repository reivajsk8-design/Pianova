# Navegador de carpetas del sampler (S4 núcleo) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Navegar una carpeta del disco desde el Estudio, escuchar los audios y asignar uno a un canal (como slicer), recordando la carpeta entre sesiones.

**Architecture:** `audio/fileLibrary.ts` encapsula la lógica (helpers puros + una API con estado que escanea la carpeta con File System Access, lee audios bajo demanda y persiste el handle en IndexedDB). `ui/libraryPanel.ts` es el panel (importar/buscar/navegar/escuchar/asignar). `app/studioView.ts` lo monta en la pestaña SAMPLES y cablea escuchar (por el máster) y asignar (canal → slicer).

**Tech Stack:** Vite + TypeScript (strict) + Vitest. File System Access API (`showDirectoryPicker`) + respaldo `webkitdirectory`. IndexedDB. Web Audio.

## Global Constraints

- Todo el trabajo en `studio/` (NO tocar `pianova.html`). TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón `var(--pv-acc)`.
- Audios por extensión: **wav, mp3, ogg, flac, m4a, aac**. Sin `showDirectoryPicker` ⇒ solo respaldo
  `webkitdirectory` (sin reabrir automático). No cambia el motor ni el proyecto.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build` (desde `studio/`).
- Commits con trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Helpers puros de `audio/fileLibrary.ts` (+ tests)

**Files:**
- Create: `studio/src/audio/fileLibrary.ts`
- Create: `studio/src/audio/fileLibrary.test.ts`

**Interfaces:**
- Produces: `LibNode`; `AUDIO_EXT`; `fileExt`, `isAudioFile`, `sortNodes`, `filterFiles`, `buildTreeFromFiles`,
  `findNode`, `parentPath`.

- [ ] **Step 1: Escribe el test que falla (`studio/src/audio/fileLibrary.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { fileExt, isAudioFile, sortNodes, filterFiles, buildTreeFromFiles, findNode, parentPath, LibNode } from './fileLibrary';

describe('fileExt / isAudioFile', () => {
  it('extensión en minúsculas, sin punto', () => {
    expect(fileExt('Kick.WAV')).toBe('wav');
    expect(fileExt('loop.mp3')).toBe('mp3');
    expect(fileExt('sinext')).toBe('');
  });
  it('isAudioFile por extensión', () => {
    expect(isAudioFile('a.wav')).toBe(true);
    expect(isAudioFile('a.FLAC')).toBe(true);
    expect(isAudioFile('a.txt')).toBe(false);
    expect(isAudioFile('a')).toBe(false);
  });
});

describe('sortNodes', () => {
  it('carpetas antes que archivos, luego alfabético', () => {
    const ns: LibNode[] = [
      { name: 'z.wav', kind: 'file', path: 'z.wav' },
      { name: 'sub', kind: 'dir', path: 'sub', children: [] },
      { name: 'a.wav', kind: 'file', path: 'a.wav' },
      { name: 'abc', kind: 'dir', path: 'abc', children: [] }
    ];
    expect(sortNodes(ns).map(n => n.name)).toEqual(['abc', 'sub', 'a.wav', 'z.wav']);
  });
});

describe('filterFiles', () => {
  it('filtra por subcadena case-insensitive; vacío = todos', () => {
    const fs: LibNode[] = [
      { name: 'Kick.wav', kind: 'file', path: 'Kick.wav' },
      { name: 'snare.wav', kind: 'file', path: 'snare.wav' }
    ];
    expect(filterFiles(fs, 'kick').map(f => f.name)).toEqual(['Kick.wav']);
    expect(filterFiles(fs, '').length).toBe(2);
  });
});

describe('buildTreeFromFiles', () => {
  it('construye el árbol por rutas, ignora no-audios, ordena y puebla fileMap', () => {
    const { tree, fileMap } = buildTreeFromFiles([
      { name: 'x.wav', path: 'a/b/x.wav' },
      { name: 'y.mp3', path: 'a/y.mp3' },
      { name: 'z.txt', path: 'a/z.txt' }
    ], 'root');
    expect(tree.name).toBe('root');
    const a = tree.children!.find(c => c.name === 'a')!;
    expect(a.kind).toBe('dir');
    // dentro de 'a': carpeta 'b' antes que el archivo 'y.mp3'
    expect(a.children!.map(c => c.name)).toEqual(['b', 'y.mp3']);
    expect(a.children!.find(c => c.name === 'b')!.children!.map(c => c.name)).toEqual(['x.wav']);
    expect(Object.keys(fileMap).sort()).toEqual(['a/b/x.wav', 'a/y.mp3']);
  });
});

describe('findNode / parentPath', () => {
  it('findNode localiza por path; parentPath quita el último segmento', () => {
    const { tree } = buildTreeFromFiles([{ name: 'x.wav', path: 'a/b/x.wav' }], 'root');
    expect(findNode(tree, 'a/b/x.wav')!.name).toBe('x.wav');
    expect(findNode(tree, 'nope')).toBe(null);
    expect(parentPath('root/a/b')).toBe('root/a');
    expect(parentPath('root')).toBe('');
  });
});
```

- [ ] **Step 2: Ejecuta el test para verlo fallar**

Run: `cd studio && npm test -- fileLibrary`
Expected: FAIL (`fileLibrary` no existe).

- [ ] **Step 3: Crea `studio/src/audio/fileLibrary.ts` (solo la parte pura por ahora)**

```ts
// studio/src/audio/fileLibrary.ts
// Navegador de carpetas del disco. Parte PURA (testeable): tipos + detección de audios + construcción del árbol
// desde una lista de rutas (respaldo) + orden/filtro + búsqueda de nodos. La parte con estado (File System
// Access + IndexedDB) se añade después en el mismo archivo.
export interface LibNode { name: string; kind: 'dir' | 'file'; path: string; ext?: string; children?: LibNode[] }

export const AUDIO_EXT = ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac'];

export function fileExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}
export function isAudioFile(name: string): boolean {
  return AUDIO_EXT.includes(fileExt(name));
}
export function sortNodes(nodes: LibNode[]): LibNode[] {
  return nodes.slice().sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : (a.kind === 'dir' ? -1 : 1));
}
export function filterFiles(files: LibNode[], query: string): LibNode[] {
  const q = query.trim().toLowerCase();
  return q ? files.filter(f => f.name.toLowerCase().includes(q)) : files;
}
export function buildTreeFromFiles(
  files: { name: string; path: string }[], rootName: string
): { tree: LibNode; fileMap: Record<string, { name: string; path: string }> } {
  const tree: LibNode = { name: rootName, kind: 'dir', path: rootName, children: [] };
  const fileMap: Record<string, { name: string; path: string }> = {};
  for (const f of files) {
    if (!isAudioFile(f.name)) continue;
    const parts = f.path.split('/');
    let cur = tree, acc = rootName;
    for (let i = 0; i < parts.length - 1; i++) {
      acc += '/' + parts[i];
      let d = cur.children!.find(c => c.kind === 'dir' && c.name === parts[i]);
      if (!d) { d = { name: parts[i], kind: 'dir', path: acc, children: [] }; cur.children!.push(d); }
      cur = d;
    }
    cur.children!.push({ name: f.name, kind: 'file', path: f.path, ext: fileExt(f.name) });
    fileMap[f.path] = { name: f.name, path: f.path };
  }
  const sortRec = (n: LibNode): void => { if (n.children) { n.children = sortNodes(n.children); n.children.forEach(sortRec); } };
  sortRec(tree);
  return { tree, fileMap };
}
export function findNode(tree: LibNode | null, path: string): LibNode | null {
  if (!tree) return null;
  if (tree.path === path) return tree;
  for (const c of tree.children ?? []) { const r = findNode(c, path); if (r) return r; }
  return null;
}
export function parentPath(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(0, i) : '';
}
```

- [ ] **Step 4: Ejecuta el test para verlo pasar**

Run: `cd studio && npm test -- fileLibrary`
Expected: PASS.

- [ ] **Step 5: typecheck + build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add studio/src/audio/fileLibrary.ts studio/src/audio/fileLibrary.test.ts
git commit -m "Estudio librería: helpers puros de fileLibrary (árbol/orden/filtro/búsqueda) + tests"
```

---

### Task 2: API con estado de `fileLibrary` (File System Access + IndexedDB)

**Files:**
- Modify: `studio/src/audio/fileLibrary.ts`

**Interfaces:**
- Consumes: los helpers puros (Task 1); `ensureAudio` (`audio/context`).
- Produces: `FileLibrary`, `createFileLibrary(): FileLibrary`.

Sin test unitario nuevo (APIs de navegador) — verificado por typecheck + build.

- [ ] **Step 1: Añade la API con estado al final de `studio/src/audio/fileLibrary.ts`**

```ts
import { ensureAudio } from './context';

export interface FileLibrary {
  supported(): boolean;
  hasFolder(): boolean;
  rootName(): string | null;
  tree(): LibNode | null;
  current(): LibNode | null;
  setCurrent(node: LibNode): void;
  pickFolder(): Promise<boolean>;
  loadFromFiles(files: File[]): void;
  restore(): Promise<boolean>;
  readArrayBuffer(node: LibNode): Promise<ArrayBuffer | null>;
  readBuffer(node: LibNode): Promise<AudioBuffer | null>;
}

// --- IndexedDB kv mínimo (base 'estudio', store 'kv') para recordar el handle de carpeta ---
function idbDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('estudio', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(key: string, val: unknown): Promise<void> {
  try { const db = await idbDB(); db.transaction('kv', 'readwrite').objectStore('kv').put(val, key); } catch { /* ignora */ }
}
async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await idbDB();
    return await new Promise<T | null>(res => {
      const q = db.transaction('kv').objectStore('kv').get(key);
      q.onsuccess = () => res((q.result as T) ?? null); q.onerror = () => res(null);
    });
  } catch { return null; }
}

interface FileRef { file?: File; handle?: FileSystemFileHandle }

export function createFileLibrary(): FileLibrary {
  let tree: LibNode | null = null;
  let cur: LibNode | null = null;
  let fileMap: Record<string, FileRef> = {};
  const bufCache: Record<string, AudioBuffer> = {};
  const win = window as unknown as { showDirectoryPicker?: (o: unknown) => Promise<FileSystemDirectoryHandle> };

  async function scan(handle: FileSystemDirectoryHandle, path: string): Promise<LibNode> {
    const node: LibNode = { name: handle.name, kind: 'dir', path: path || handle.name, children: [] };
    // entries() no está en la lib de TS para directory handles → cast puntual.
    for await (const [name, h] of (handle as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (h.kind === 'directory') node.children!.push(await scan(h as FileSystemDirectoryHandle, node.path + '/' + name));
      else if (isAudioFile(name)) {
        const p = node.path + '/' + name;
        node.children!.push({ name, kind: 'file', path: p, ext: fileExt(name) });
        fileMap[p] = { handle: h as FileSystemFileHandle };
      }
    }
    node.children = sortNodes(node.children!);
    return node;
  }

  async function readArrayBuffer(node: LibNode): Promise<ArrayBuffer | null> {
    const ref = fileMap[node.path]; if (!ref) return null;
    const file = ref.file ?? (ref.handle ? await ref.handle.getFile() : null);
    return file ? await file.arrayBuffer() : null;
  }

  return {
    supported: () => !!win.showDirectoryPicker,
    hasFolder: () => !!tree,
    rootName: () => tree ? tree.name : null,
    tree: () => tree,
    current: () => cur,
    setCurrent: (node) => { cur = node; },
    async pickFolder() {
      if (!win.showDirectoryPicker) return false;
      try {
        const handle = await win.showDirectoryPicker({ id: 'estudio-lib', mode: 'read' });
        fileMap = {}; tree = await scan(handle, handle.name); cur = tree;
        await idbSet('dir', handle);
        return true;
      } catch { return false; }   // AbortError (cancelar) incluido
    },
    loadFromFiles(files) {
      const audio = files.filter(f => isAudioFile(f.name));
      const built = buildTreeFromFiles(
        audio.map(f => ({ name: f.name, path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name })),
        'Mi carpeta'
      );
      fileMap = {};
      for (const f of audio) { const p = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name; fileMap[p] = { file: f }; }
      tree = built.tree; cur = tree;
    },
    async restore() {
      if (!win.showDirectoryPicker) return false;
      const handle = await idbGet<FileSystemDirectoryHandle>('dir'); if (!handle) return false;
      try {
        const h = handle as unknown as { queryPermission?: (o: unknown) => Promise<PermissionState> };
        const perm = h.queryPermission ? await h.queryPermission({ mode: 'read' }) : 'granted';
        if (perm !== 'granted') return false;
        fileMap = {}; tree = await scan(handle, handle.name); cur = tree;
        return true;
      } catch { return false; }
    },
    readArrayBuffer,
    async readBuffer(node) {
      if (bufCache[node.path]) return bufCache[node.path];
      const arr = await readArrayBuffer(node); if (!arr) return null;
      try { const buf = await ensureAudio().decodeAudioData(arr.slice(0)); bufCache[node.path] = buf; return buf; }
      catch { return null; }
    }
  };
}
```

- [ ] **Step 2: typecheck + test + build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: PASS (los tests de Task 1 + los previos; la API nueva no se usa aún).

- [ ] **Step 3: Commit**

```bash
git add studio/src/audio/fileLibrary.ts
git commit -m "Estudio librería: API con estado (File System Access + IndexedDB + lectura bajo demanda)"
```

---

### Task 3: Panel de UI `ui/libraryPanel.ts` (+ CSS)

**Files:**
- Create: `studio/src/ui/libraryPanel.ts`
- Modify: `studio/src/ui/styles.css`

**Interfaces:**
- Consumes: `FileLibrary`, `LibNode`, `filterFiles`, `findNode`, `parentPath` (`audio/fileLibrary`).
- Produces: `LibraryPanelHandle`, `mountLibraryPanel(root, lib, opts)`.

Sin test unitario nuevo (DOM) — verificado por typecheck + build.

- [ ] **Step 1: Crea `studio/src/ui/libraryPanel.ts`**

```ts
// studio/src/ui/libraryPanel.ts
// Panel del navegador de carpetas (pestaña SAMPLES): importar carpeta, buscar, navegar subcarpetas, y por cada
// audio ▶ escuchar / asignar. Sin lógica de archivos: usa la API FileLibrary y callbacks de studioView.
import { FileLibrary, LibNode, filterFiles, findNode, parentPath } from '../audio/fileLibrary';

export interface LibraryPanelHandle { refresh(): void }

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

export function mountLibraryPanel(
  root: HTMLElement, lib: FileLibrary,
  opts: { onImportFolder: () => void; onPreview: (node: LibNode) => void; onAssign: (node: LibNode) => void }
): LibraryPanelHandle {
  let query = '';

  function render(): void {
    const tree = lib.tree(), cur = lib.current();
    const canUp = !!(tree && cur && cur.path !== tree.path);
    const header = `<div class="libBar">
      <button class="libBtn" id="libImport">📁 Importar carpeta</button>
      ${canUp ? '<button class="libBtn" id="libUp" title="Carpeta anterior">⟵</button>' : ''}
      <span class="libRoot">${cur ? esc(cur.name) : 'Sin carpeta'}</span>
      <input id="libSearch" class="libSearch" type="search" placeholder="Buscar…" value="${esc(query)}">
    </div>`;
    let body: string;
    if (!tree || !cur) {
      body = `<div class="libEmpty">Importa una carpeta para explorar tus sonidos.</div>`;
    } else {
      const dirs = (cur.children ?? []).filter(c => c.kind === 'dir');
      const files = filterFiles((cur.children ?? []).filter(c => c.kind === 'file'), query);
      const rows = [
        ...dirs.map(d => `<div class="libRow libDir" data-dir="${esc(d.path)}"><span class="libIco">📁</span><span class="libName">${esc(d.name)}</span></div>`),
        ...files.map(f => `<div class="libRow"><span class="libIco">🎵</span><span class="libName" title="${esc(f.name)}">${esc(f.name)}</span><button class="libAct" data-prev="${esc(f.path)}" title="Escuchar">▶</button><button class="libAct libAssign" data-assign="${esc(f.path)}">asignar</button></div>`)
      ].join('');
      body = `<div class="libList">${rows || '<div class="libEmpty">Esta carpeta no tiene audios.</div>'}</div>`;
    }
    root.innerHTML = `<div class="libPanel">${header}${body}</div>`;

    (root.querySelector('#libImport') as HTMLButtonElement).addEventListener('click', opts.onImportFolder);
    const up = root.querySelector('#libUp') as HTMLButtonElement | null;
    if (up) up.addEventListener('click', () => {
      const t = lib.tree(), c = lib.current(); if (!t || !c) return;
      const parent = findNode(t, parentPath(c.path)); if (parent) { lib.setCurrent(parent); query = ''; render(); }
    });
    (root.querySelector('#libSearch') as HTMLInputElement).addEventListener('input', e => {
      query = (e.target as HTMLInputElement).value; render();
    });
    root.querySelectorAll<HTMLElement>('[data-dir]').forEach(el => el.addEventListener('click', () => {
      const node = findNode(lib.tree(), el.dataset.dir ?? ''); if (node) { lib.setCurrent(node); query = ''; render(); }
    }));
    root.querySelectorAll<HTMLElement>('[data-prev]').forEach(el => el.addEventListener('click', () => {
      const node = findNode(lib.tree(), el.dataset.prev ?? ''); if (node) opts.onPreview(node);
    }));
    root.querySelectorAll<HTMLElement>('[data-assign]').forEach(el => el.addEventListener('click', () => {
      const node = findNode(lib.tree(), el.dataset.assign ?? ''); if (node) opts.onAssign(node);
    }));
  }

  render();
  return { refresh: render };
}
```

- [ ] **Step 2: CSS del panel (`studio/src/ui/styles.css`)**

Añade al final del archivo:

```css
/* ---------- Navegador de carpetas (librería) ---------- */
.libPanel{border:1px solid var(--pv-line);border-radius:8px;background:#0c110b;margin-bottom:8px;overflow:hidden}
.libBar{display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--pv-line);flex-wrap:wrap}
.libBtn{background:#141a13;border:1px solid #2b3324;color:var(--pv-ink);border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px}
.libBtn:hover{border-color:var(--pv-acc)}
.libRoot{font-size:11px;color:var(--pv-muted);max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.libSearch{margin-left:auto;background:#141a13;border:1px solid #2b3324;color:var(--pv-ink);border-radius:6px;padding:4px 8px;font-size:11px}
.libList{max-height:220px;overflow:auto}
.libRow{display:flex;align-items:center;gap:8px;padding:4px 8px;border-bottom:1px solid #141a12;font-size:12px}
.libDir{cursor:pointer}
.libDir:hover{background:rgba(45,255,106,.06)}
.libIco{flex:0 0 auto}
.libName{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--pv-ink)}
.libAct{background:#141a13;border:1px solid #2b3324;color:var(--pv-muted);border-radius:5px;padding:2px 8px;cursor:pointer;font-size:11px}
.libAct:hover{border-color:var(--pv-acc);color:#fff}
.libAssign{color:var(--pv-acc)}
.libEmpty{padding:14px;text-align:center;color:var(--pv-muted);font-size:12px}
```

- [ ] **Step 3: typecheck + build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS (el panel no se usa aún).

- [ ] **Step 4: Commit**

```bash
git add studio/src/ui/libraryPanel.ts studio/src/ui/styles.css
git commit -m "Estudio librería: panel de UI (importar/buscar/navegar/escuchar/asignar) + CSS"
```

---

### Task 4: Cableado en `studioView` (montar, importar, escuchar, asignar, reabrir)

**Files:**
- Modify: `studio/src/app/studioView.ts`

**Interfaces:**
- Consumes: `createFileLibrary`, `LibNode` (`audio/fileLibrary`); `mountLibraryPanel` (`ui/libraryPanel`);
  `importSample` (ya importado), `masterDest`, `ensureAudio` (ya usados), `defaultSlicerInstrument`,
  `updateChannel` (ya importados).

Sin test unitario nuevo (DOM/APIs) — verificado por typecheck + build + prueba manual.

- [ ] **Step 1: Imports**

Añade a `studio/src/app/studioView.ts`:

```ts
import { createFileLibrary, LibNode } from '../audio/fileLibrary';
import { mountLibraryPanel } from '../ui/libraryPanel';
```

- [ ] **Step 2: HTML — panel + input de respaldo en `#paneSamples`**

Sustituye el bloque de `#paneSamples` (hoy solo `#sampleEditorHost`) por:

```ts
      <div id="paneSamples" class="pvPanel">
        <div id="libHost"></div>
        <input id="libFolderInput" type="file" webkitdirectory hidden>
        <div id="sampleEditorHost"></div>
      </div>
```

- [ ] **Step 3: Refactor de la importación a un canal (aceptar `name + ArrayBuffer`)**

Sustituye `importAudioToChannel` por estas dos funciones (extrae la lógica común):

```ts
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
```

- [ ] **Step 4: Librería — montaje, escuchar y asignar**

Tras la definición de `importAudioToChannel`/`importArrayBufferToChannel` (dentro de `mountStudioView`), añade:

```ts
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
```

- [ ] **Step 5: typecheck + build + prueba manual**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS. En la URL (`npm run dev`), pestaña **SAMPLES**:
1. **📁 Importar carpeta** → elige una con audios; aparecen subcarpetas y archivos.
2. Clic en una subcarpeta entra; **⟵** vuelve; el buscador filtra.
3. **▶** en un audio → suena por el máster.
4. **asignar** → el canal seleccionado pasa a **slicer** con ese audio (aparece el editor de slicer debajo).
5. Recarga la página → la carpeta se reabre sola (Chromium de escritorio; en móvil hay que reimportar).

- [ ] **Step 6: Commit**

```bash
git add studio/src/app/studioView.ts
git commit -m "Estudio librería: monta el navegador en SAMPLES (importar/escuchar/asignar/reabrir)"
```

---

### Task 5: Docs y versión

**Files:**
- Modify: `studio/package.json` (version → `0.31.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.31.0"`.

- [ ] **Step 2: HANDOFF.md**

Añade en la zona de estado del Estudio (junto a las últimas entradas):

```markdown
**Estudio · navegador de carpetas del sampler S4 núcleo (v0.31.0):** panel **📁 Librería** en la pestaña SAMPLES
para explorar una carpeta del disco (File System Access `showDirectoryPicker`, con respaldo `webkitdirectory` en
móvil), navegar subcarpetas, buscar, **escuchar** (▶, por el máster) y **asignar** un audio al canal (lo vuelve
slicer, vía `importSample`). Escaneo perezoso (solo metadatos; decodifica bajo demanda con caché); el handle de
carpeta se guarda en **IndexedDB** (base `estudio`) y se reabre si el permiso sigue concedido. `audio/fileLibrary.ts`
(helpers puros testeados + API con estado) + `ui/libraryPanel.ts` + cableado en `app/studioView.ts`. Sin
favoritos/recientes/arrastrar (posible ampliación). No cambia el motor ni el proyecto.
```

- [ ] **Step 3: CLAUDE.md**

En la sección del Estudio (decisión 5), tras la entrada de la rejilla por canal, añade: **navegador de carpetas
del sampler S4 núcleo (v0.31.0): panel Librería en SAMPLES para explorar una carpeta del disco (File System
Access + respaldo webkitdirectory), buscar, escuchar y asignar un audio al canal (slicer); handle en IndexedDB,
reapertura automática** (`audio/fileLibrary.ts` + `ui/libraryPanel.ts` + `app/studioView.ts`; sin cambios de
motor).

- [ ] **Step 4: Verifica y commitea**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio librería: docs (HANDOFF/CLAUDE) y versión 0.31.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- Helpers puros (`fileExt`/`isAudioFile`/`sortNodes`/`filterFiles`/`buildTreeFromFiles`/`findNode`/`parentPath`)
  + tests → Task 1 ✅
- API con estado (`createFileLibrary`: pickFolder/loadFromFiles/restore/readArrayBuffer/readBuffer + escaneo
  perezoso + IndexedDB) → Task 2 ✅
- Panel de UI (importar/buscar/navegar/escuchar/asignar) + CSS → Task 3 ✅
- Montaje en SAMPLES + importar (FS Access y respaldo) + escuchar por el máster + asignar (canal→slicer) +
  reabrir al arrancar → Task 4 ✅
- Persistencia (IndexedDB, base `estudio`) + compat (no toca proyecto) → Tasks 2 y 4 ✅
- Docs/versión → Task 5 ✅

**Placeholders:** ninguno; el código va completo (helpers, API, panel, wiring).

**Consistencia de tipos:** `LibNode` (Task 1) lo usan la API (Task 2), el panel (Task 3) y studioView (Task 4).
`FileLibrary`/`createFileLibrary` (Task 2) los consume el panel (Task 3) y studioView (Task 4). `findNode`/
`parentPath`/`filterFiles` (Task 1) los usa el panel (Task 3). `mountLibraryPanel(root, lib, {onImportFolder,
onPreview,onAssign})` (Task 3) se llama con esa forma en studioView (Task 4). `readArrayBuffer`/`readBuffer`
(Task 2) los usan `previewLibNode`/`assignLibNode` (Task 4). Nombres coherentes.

**Estado intermedio válido:** Task 1 (puro) compila y testea solo; Task 2 añade la API en el mismo archivo (no
usada aún) → compila; Task 3 crea el panel (no montado aún) → compila; Task 4 lo cablea; Task 5 docs. Cada tarea
deja el build verde.

**Decisión consciente:** los casts puntuales a tipos de File System Access (`entries()`, `queryPermission`,
`showDirectoryPicker`) son necesarios porque la lib de TS no los tipa por completo; se acotan a `fileLibrary.ts`.
El escaneo es perezoso (solo metadatos) y la decodificación se cachea por `path` en memoria de sesión (no infla
el proyecto). `restore` no re-pide permiso sin gesto (solo re-escanea si ya está concedido).
