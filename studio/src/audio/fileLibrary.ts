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
