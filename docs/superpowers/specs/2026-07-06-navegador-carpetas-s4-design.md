# Navegador de carpetas del sampler (S4 núcleo) — Diseño

**Fecha:** 2026-07-06 · **Versión objetivo:** 0.31.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Poder **navegar una carpeta del disco** desde el Estudio, **escuchar** los audios y **asignar** uno a un canal
(como slicer) sin pasar por el selector de archivos del sistema cada vez. Portado del navegador de `pianova.html`
v1.19, recortado al núcleo.

## Decisiones tomadas (con el usuario)

- **Núcleo:** importar carpeta + árbol de subcarpetas + buscar + escuchar (▶) + asignar + recordar la carpeta
  (IndexedDB) y reabrirla. Sin favoritos/recientes/arrastrar (posible ampliación futura).
- **Asignar** carga el audio en el **canal seleccionado**, convirtiéndolo en **slicer** (igual que "Importar
  audio…"). Sin opción "＋ nuevo canal".
- El panel vive en la pestaña **SAMPLES**, encima del editor del slicer (siempre visible).
- Es el último de la cola de mejoras del Estudio.

## Arquitectura

Tres piezas con responsabilidades claras:

- **`audio/fileLibrary.ts` (nuevo):** toda la lógica. Escaneo perezoso de la carpeta (solo metadatos), lectura de
  un archivo a `ArrayBuffer`/`AudioBuffer` **bajo demanda** con caché, y persistencia del handle en **IndexedDB**.
  Expone helpers **puros** (testeables) + una API con estado.
- **`ui/libraryPanel.ts` (nuevo):** el panel de UI (botón importar, buscador, navegación, lista con ▶/asignar).
  Sin lógica de archivos: llama a la API de `fileLibrary` y a callbacks de `onPreview`/`onAssign`.
- **`app/studioView.ts`:** monta el panel en `#paneSamples`, cablea escuchar/asignar, y reabre la carpeta al
  arrancar.

### `audio/fileLibrary.ts`

Tipos y helpers puros:

```ts
export interface LibNode { name: string; kind: 'dir' | 'file'; path: string; ext?: string; children?: LibNode[] }

export const AUDIO_EXT = ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac'];
export function fileExt(name: string): string;                 // extensión en minúsculas, sin punto ('' si no hay)
export function isAudioFile(name: string): boolean;            // ext ∈ AUDIO_EXT
export function sortNodes(nodes: LibNode[]): LibNode[];        // carpetas antes que archivos, luego por nombre (localeCompare)
export function filterFiles(files: LibNode[], query: string): LibNode[];   // por nombre, case-insensitive; query vacía = todos
// Construye el árbol desde una lista de rutas (respaldo webkitdirectory: usa webkitRelativePath o name).
export function buildTreeFromFiles(files: { name: string; path: string }[], rootName: string): { tree: LibNode; fileMap: Record<string, { name: string; path: string }> };
```

API con estado (una instancia por vista):

```ts
export interface FileLibrary {
  supported(): boolean;                       // !!window.showDirectoryPicker
  hasFolder(): boolean;
  rootName(): string | null;
  tree(): LibNode | null;
  current(): LibNode | null;                  // carpeta activa (para listar)
  setCurrent(node: LibNode): void;
  pickFolder(): Promise<boolean>;             // showDirectoryPicker → escanea; false si cancela/no soporta
  loadFromFiles(files: File[]): void;         // respaldo webkitdirectory
  restore(): Promise<boolean>;                // reabre desde IndexedDB si el permiso sigue concedido
  readArrayBuffer(node: LibNode): Promise<ArrayBuffer | null>;
  readBuffer(node: LibNode): Promise<AudioBuffer | null>;      // decodifica (caché por path)
}
export function createFileLibrary(): FileLibrary;
```

- **Escaneo (`showDirectoryPicker`):** recorre `handle.entries()` recursivamente construyendo `LibNode`s; guarda
  `path -> { handle }` en un mapa interno para leer bajo demanda. Ordena con `sortNodes`.
- **Respaldo (`webkitdirectory`):** `loadFromFiles` usa `buildTreeFromFiles` (por `webkitRelativePath`), guardando
  `path -> { file }`.
- **Lectura:** `readArrayBuffer` obtiene el `File` (de `file` o `handle.getFile()`) y su `arrayBuffer()`;
  `readBuffer` decodifica con `ensureAudio().decodeAudioData` y cachea por `path`.
- **IndexedDB:** kv mínimo (base `estudio`, store `kv`): al elegir carpeta, `idbSet('dir', handle)`; en `restore`,
  `idbGet('dir')` + `queryPermission({mode:'read'})`; si `'granted'`, re-escanea (no se re-pide sin gesto).

### `ui/libraryPanel.ts`

```ts
export interface LibraryPanelHandle { refresh(): void }
export function mountLibraryPanel(root: HTMLElement, lib: FileLibrary, opts: {
  onImportFolder: () => void;                 // dispara pickFolder / input de respaldo (lo gestiona studioView)
  onPreview: (node: LibNode) => void;
  onAssign: (node: LibNode) => void;
}): LibraryPanelHandle;
```

- Cabecera: **📁 Importar carpeta** + nombre de la carpeta actual (o "Sin carpeta").
- Ruta/navegación: botón **⟵ volver** (a la carpeta padre) cuando `current` no es la raíz; buscador `#libSearch`.
- Lista: subcarpetas (clic → `setCurrent` + `refresh`) y archivos (nombre + **▶** `onPreview` + **asignar**
  `onAssign`). Filtro por el buscador (`filterFiles`).
- Sin carpeta: mensaje "Importa una carpeta para explorar tus sonidos".

### `app/studioView.ts`

- HTML: en `#paneSamples`, antes de `#sampleEditorHost`, añade `<div id="libHost"></div>`.
- `const lib = createFileLibrary();` y `const libUI = mountLibraryPanel(libHost, lib, {...})` en el arranque
  (o en `renderSamples`, montado una vez).
- **Importar:** en escritorio con soporte, `await lib.pickFolder()` → `libUI.refresh()`; sin soporte, dispara un
  `<input type="file" webkitdirectory>` cuyo `change` llama `lib.loadFromFiles([...files])` → `refresh()`.
- **Escuchar:** `const buf = await lib.readBuffer(node)` → reproduce un `BufferSource → masterDest()` (corta el
  preview anterior).
- **Asignar:** `const arr = await lib.readArrayBuffer(node)` → `importSample(node.name, arr)` → el canal
  seleccionado pasa a slicer (reutiliza la lógica de `importAudioToChannel`, extraída para aceptar `name+arr`).
- **Reabrir:** en el arranque (tras `initAudio`), `await lib.restore()` → si hubo carpeta, `libUI.refresh()`.

## Persistencia y compatibilidad

- El **handle** de carpeta se guarda en **IndexedDB** (base `estudio`, store `kv`, clave `dir`) y se reabre si el
  permiso sigue concedido. Nada nuevo en el proyecto/`localStorage`. No afecta a proyectos existentes.
- Sin `showDirectoryPicker` (móvil/Safari): solo el respaldo `webkitdirectory` (elige carpeta cada vez, sin
  reabrir automático). El botón detecta el soporte.

## Qué NO cambia

- El motor, el modelo del proyecto, el resto de la vista. El slicer (trocear, editar) sigue igual; el navegador
  solo **carga** el audio en el canal (como el botón "Importar audio…").

## Bordes

- **Permisos:** si el permiso caducó, `restore` no re-pide (sin gesto); el usuario vuelve a "Importar carpeta".
- **Decodificación:** un archivo corrupto/no decodificable → `readBuffer` devuelve null; el panel avisa y no
  rompe. Los audios grandes NO se persisten en el proyecto (igual que hoy, `SAMPLE_MAX`); el navegador solo
  lee del disco bajo demanda.
- **Caché:** `readBuffer` cachea por `path` en memoria (sesión); no infla el proyecto.
- **Carpetas grandes:** escaneo perezoso (solo metadatos al navegar); el audio se decodifica solo al escuchar o
  asignar.

## Pruebas

- **Unitarias (Vitest, `audio/fileLibrary.test.ts`):**
  - `fileExt`/`isAudioFile`: extensiones (mayús/minús, sin extensión, no-audio).
  - `buildTreeFromFiles`: lista de rutas (`a/b/x.wav`, `a/y.mp3`) → árbol con subcarpetas correctas y `fileMap`
    poblado; ignora no-audios.
  - `sortNodes`: carpetas antes que archivos, orden alfabético.
  - `filterFiles`: filtra por subcadena case-insensitive; query vacía = todos.
- **No unitarias (typecheck + build + a oído/vista):** importar carpeta (FS Access y respaldo), navegar,
  buscar, escuchar, asignar (canal → slicer), reabrir tras recargar.

## Restricciones globales

- Todo en `studio/`; no tocar `pianova.html`. TypeScript **strict**; sin dependencias nuevas.
- Comentarios/UI en español. Acento verde neón `var(--pv-acc)`.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
