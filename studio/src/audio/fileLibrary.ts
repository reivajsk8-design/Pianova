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
