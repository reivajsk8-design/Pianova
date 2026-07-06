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
