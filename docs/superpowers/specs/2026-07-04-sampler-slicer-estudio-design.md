# Diseño — Estudio: Sampler / Simpler con slicing (canal `slicer`)

**Fecha:** 2026-07-04 · **Proyecto:** Estudio (`studio/`, rebuild pro) · **Estado:** diseño aprobado.
Segundo sub-proyecto de la cola de "mejoras de sonido" (tras el sinte editable y el rediseño PIANOVA
STUDIO; ver [[estudio-mejoras-sonido-cola]]). Rellena la **pestaña SAMPLES** (hoy un placeholder). Inspirado
en el **Ableton Simpler (modo Slice)**. No toca `pianova.html`.

## Objetivo

Añadir un **cuarto tipo de instrumento de canal**: `slicer`. Un audio importado se **trocea en slices**
(por transitorios o en N iguales); cada slice se **mapea a una nota** y el secuenciador dispara el slice de
la nota de cada paso. Con editor de forma de onda, ajuste manual de marcas, edición por slice (recorte,
ganancia, reverse, fade) y un navegador de carpetas del disco. Todo en la pestaña SAMPLES.

## Decisiones (del brainstorming)

- **Modo Slice** (slices → notas): slice 0 = nota `base`, slice 1 = base+1, etc. El secuenciador dispara el
  slice mapeado a la nota del paso; el teclado toca y graba slices.
- **Troceado:** por **transitorios** (detección de onsets por energía) y **en N iguales** (8/16/32); ambos
  generan las marcas, ajustables a mano.
- **Fase 1 = el Simpler casi entero**, entregado en 4 sub-tandas (S1–S4). El motor/modelo/persistencia del
  Estudio no se rompe: `slicer` es un `kind` más de instrumento.

## Alcance

**Dentro (toda la fase 1, en sub-tandas):**
1. **Almacén de samples** (`audio/sampleStore.ts`): importar/decodificar audio; persistir los pequeños en
   base64. *(Portado de `pianova.html`.)*
2. **DSP de slicing** (`daw/slicing.ts`, **puro**): `equalSlices` (N iguales) + `detectOnsets` (transitorios).
3. **Motor de reproducción** (`audio/slicer.ts`): reproducir un slice (inicio/fin, ganancia, reverse, fade)
   agendado (secuenciador) y en vivo (teclado).
4. **Modelo** (`daw/model.ts`): `InstrumentSpec` `slicer` con `sampleId`, `base`, `slices: SliceDef[]`.
5. **Editor** (`ui/sampleEditor.ts`, pestaña SAMPLES): forma de onda + marcas + troceado + edición por slice.
6. **Navegador de carpetas** (`ui/library.ts` + IndexedDB): explorar carpetas del disco, favoritos/recientes,
   arrastrar audios al canal. *(Portado de `pianova.html` v1.19.)*
7. **Integración** (canal + secuenciador + teclado) y **persistencia** (instrument + sampleStore).

**Sub-tandas de implementación (el spec cubre todo; el plan empieza por S1):**
- **S1 · Núcleo:** sampleStore + slicing (iguales + transitorios) + slicer engine + modelo `slicer` + editor
  básico (onda + marcas + botones de troceado + Probar) + integración secuenciador/teclado + persistencia.
  Importar por selector de archivo. → *ya se chopea y suena.*
- **S2 · Ajuste manual** de marcas (arrastrar / doble-clic añadir/borrar sobre la onda).
- **S3 · Edición por slice:** recorte inicio/fin + ganancia + reverse + fade in/out; ▶ Probar por slice.
- **S4 · Navegador de carpetas** del disco (File System Access + respaldo; favoritos/recientes; arrastrar).

**Fuera (YAGNI / futuro):** modo melódico (pitch por nota de un solo trozo), estiramiento temporal/warp,
grabación de audio desde el micro, exportar slices, automatización. No tocar `pianova.html`.

## Restricciones (heredadas)

- Todo en **`studio/`**; **Vite + TypeScript strict**; **Vitest**; **sin framework de UI**; textos/
  comentarios en **español**. No tocar `pianova.html`. Sin dependencias nuevas de instalación (el navegador
  de carpetas usa APIs del navegador: File System Access, IndexedDB).
- El audio arranca tras gesto (`ensureAudio`). `exponentialRampToValueAtTime` nunca a 0.
- **Lógica pura separada del audio/DOM** para testearla (slicing, modelo, base64).
- El disparo agendado sigue el contrato actual (`when` + destino del canal), como synth/drum/synthx.
- Verificación por sub-tanda: `npm run typecheck` + `npm test` + `npm run build`, y prueba por oído/vista.

## Arquitectura (unidades)

### 1. `audio/sampleStore.ts` — almacén de audios
- `samples: Record<string, {name, buffer:AudioBuffer, b64:string|null}>`.
- `importSample(name, arrayBuffer): Promise<string>` — `decodeAudioData`, genera id (`smp-N`), guarda b64 si
  `byteLength ≤ SAMPLE_MAX` (~1,5 MB). `getSample(id)`.
- `abToB64`/`b64ToAb` (puros, testeables) y `decodePending(store)` para redecodificar al abrir proyecto.
- Portado/adaptado de `pianova.html` (`samples`, `addSample`, base64).

### 2. `daw/slicing.ts` — DSP de troceado (puro, testeable)
- `equalSlices(durationSec: number, n: number): number[]` — n+1 marcas equiespaciadas [0..dur] (o n marcas
  de inicio; se fija en el plan). Pura.
- `detectOnsets(pcm: Float32Array, sampleRate: number, opts?): number[]` — marcas (seg) donde la energía
  sube por encima de un umbral tras una ventana; con separación mínima entre marcas. Pura y testeable con un
  PCM fabricado (picos en posiciones conocidas).

### 3. `audio/slicer.ts` — motor de reproducción de slices
- `SliceDef = { start:number; end:number; gain:number; reverse:boolean; fadeIn:number; fadeOut:number }`
  (tiempos en segundos dentro del buffer; gain 0..~2; fades en seg).
- `playSlice(actx, dest, buffer, slice, when, vel): void` — `BufferSource` con `start(when, slice.start,
  dur)`; aplica ganancia (`gain*vel`), fade in/out (rampas), y **reverse** (buffer invertido cacheado por
  sample o `playbackRate` negativo no soportado → se invierte el sub-buffer). Agendado y en vivo.
- `noteToSlice(base, slices, midi): SliceDef | null` — índice = `midi - base`; fuera de rango → null.

### 4. `daw/model.ts` — modelo
- `InstrumentSpec` gana `{ kind:'slicer'; sampleId:string; base:number; slices: SliceDef[] }`.
- Helper `defaultSlicerInstrument(sampleId, base=60)`.

### 5. `daw/channel.ts` — disparo
- `trigger(note, vel, when)` rama `slicer` → `noteToSlice(base, slices, note)` → `playSlice(...,
  instrumentBus)` con el buffer de `getSample(sampleId)`.

### 6. `ui/sampleEditor.ts` — editor (pestaña SAMPLES)
- Al seleccionar un canal `slicer`: **forma de onda** (`<canvas>` dibuja el buffer) con marcas verticales;
  slice seleccionado resaltado; qué nota dispara cada slice.
- **Cargar:** botón "Importar…" (input file) + arrastrar desde el navegador.
- **Trocear:** "Por transitorios" y "En N iguales" (8/16/32).
- **S2 (manual):** arrastrar marca; doble-clic añadir/borrar.
- **S3 (por slice):** recorte inicio/fin, ganancia, reverse, fade in/out del slice seleccionado; ▶ Probar.

### 7. `ui/library.ts` (+ IndexedDB) — navegador de carpetas (S4)
- Explorar carpetas del disco (`showDirectoryPicker` + respaldo `webkitdirectory`/archivos sueltos),
  escaneo perezoso, pestañas Carpetas/Favoritos/Recientes, buscador; **arrastrar** un audio a un canal.
  Handle en IndexedDB (base `pianova-studio`). Portado de `pianova.html` v1.19.

### 8. Persistencia (`app/store.ts`)
- El `instrument` guarda `sampleId` + `base` + `slices`. El `sampleStore` guarda el buffer (b64 en el
  proyecto si es pequeño; grandes solo en sesión, con aviso). Al abrir, `decodePending` redecodifica.
  Tolerante: si falta el audio, el canal queda en silencio (no rompe). Sin cambio de versión de proyecto si
  el nuevo `kind` se añade de forma aditiva (parseo tolerante del instrument).

## Flujo de datos (resumen)
```
importar audio -> sampleStore.importSample -> id
trocear -> slicing (equalSlices | detectOnsets) -> marcas -> SliceDef[] (en el instrument del canal)
canal 'slicer' -> trigger(nota) -> noteToSlice -> playSlice(buffer, slice, when) -> instrumentBus -> ... salida
teclado/pads -> tocan slices (y graban en pasos)
editor (pestaña SAMPLES) -> onda + marcas + troceado + edición por slice -> actualiza el instrument + persist
navegador de carpetas -> arrastrar audio -> importSample -> asignar al canal
guardar/abrir: instrument (sampleId/base/slices) + sampleStore (b64) <-> proyecto (decodePending al abrir)
tests: equalSlices, detectOnsets (PCM fabricado), modelo slicer round-trip, base64 <-> audio
```

## Riesgos / notas
- **Detección de transitorios:** un onset-detector por energía es simple y suficiente para breaks; en audios
  suaves puede fallar (por eso el ajuste manual, S2, y el troceado igual como alternativa).
- **Reverse:** Web Audio no soporta `playbackRate` negativo; se invierte el sub-buffer (cacheado) para el
  slice en reverse. Coste de memoria acotado (solo slices en reverse).
- **Audios grandes:** los > ~1,5 MB no se persisten (localStorage/JSON) — solo sesión, con aviso; el proyecto
  guarda el id/marcas pero el canal quedará mudo al recargar si el audio no se reimporta. Igual que pianova.
- **File System Access:** solo Chrome/Edge escritorio para elegir carpeta; respaldo de archivos sueltos.
- **Rendimiento del canvas:** dibujar la onda submuestreando (picos por columna), no muestra a muestra.

## Verificación
- `npm run typecheck` + `npm test` (slicing, modelo, base64) + `npm run build`.
- **Manual (Chrome/Edge):** por sub-tanda — S1: importar un break, trocear (iguales/transitorios), oír los
  slices, secuenciarlos; S2: mover/añadir/borrar marcas; S3: recorte/ganancia/reverse/fade por slice; S4:
  explorar carpetas y arrastrar. Guardar/abrir proyecto conserva slices (y audio si es pequeño).
  `pianova.html` sigue igual.
- Actualizar `HANDOFF.md`/`CLAUDE.md` y subir versión de `studio/package.json` por sub-tanda.
