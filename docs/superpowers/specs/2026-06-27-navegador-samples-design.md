# Diseño — Navegador de librería de samples (estilo Ableton)

**Fecha:** 2026-06-27 · **Proyecto:** Pianova (`pianova.html`) · **Estado:** aprobado por el usuario
(diseño). Pendiente: revisión del spec → plan de implementación.

> Sub-proyecto 1 de 2. El sub-proyecto 2 (**editor de piano-roll + rejilla "pro"**) se diseñará
> aparte, después de implementar y publicar este.

## Objetivo

Permitir **cargar carpetas de samples del disco** del usuario y **navegarlas estilo Ableton**
(buscar, previsualizar, asignar), para subir la **calidad de los sonidos** usando sus propias
grabaciones/packs. Se usa **en el Looper** (un sample por canal) y como **instrumento melódico**
(tócable por todo el teclado en Aprender/Reto). Reutiliza el motor de `samples` ya existente.

## Restricciones y alcance realista (importante)

- **Solo audio**: `.wav .aiff .flac .mp3 .ogg`. El navegador **no puede** abrir instrumentos de
  plugin (`.nki` Kontakt/Komplete, `.vst`, `.exs`). Esos se **muestran en gris (no usables)** o se
  ocultan. (Coincide con la decisión del proyecto: el sonido de Komplete va por Ableton, aparte.)
- **Importar carpeta = solo escritorio** (Chrome/Edge, donde está el disco C). En **móvil** se
  mantiene la importación de **archivos sueltos** que ya existe (no hay acceso a carpetas).
- **Un solo archivo** `pianova.html`; sin librerías de instalación; textos en español; **no empeorar
  el escritorio**; `smplr` no se toca.

## Arquitectura (unidades y su responsabilidad)

### 1. Importación de carpeta (`libImport`)
- Botón **"📁 Importar librería…"** (en la cabecera del Looper, junto a los controles).
- **Preferente:** File System Access API → `window.showDirectoryPicker()`. Se obtiene un
  `FileSystemDirectoryHandle`. Se **persiste el handle** en **IndexedDB** (clave `pianova-lib`)
  para reabrir la librería en la siguiente sesión (pidiendo permiso con `handle.requestPermission`).
- **Respaldo** si no hay soporte: `<input type="file" webkitdirectory>` (sin persistencia de handle;
  re-elegir cada sesión).
- **Escaneo perezoso del árbol:** recorrer el directorio (recursivo) listando **solo** subcarpetas y
  archivos con extensión de audio admitida. Se construye un **árbol ligero** `{name, kind, path,
  children}` SIN leer el contenido de los audios. Guardado del árbol + metadatos en `localStorage`
  (`store.lib`), audios **no**.

### 2. Lectura/decodifico bajo demanda (`libLoadSample`)
- Al **previsualizar** o **asignar** un archivo: `fileHandle.getFile()` → `arrayBuffer` →
  `actx.decodeAudioData` → `AudioBuffer`. Cachear en memoria de sesión (`libCache[path]`).
- En el respaldo `webkitdirectory`, el `File` ya está en memoria; mismo decodificado.
- Errores (archivo movido, permiso revocado, formato no decodificable): se captura y se muestra un
  aviso suave ("No pude leer X"); no rompe la app.

### 3. Panel navegador (`libPanel`) — UI
- **Disposición:** **panel lateral acoplado a la izquierda** del cuerpo del Looper, dentro de
  `.lpTracks` o como columna previa. Se **muestra/oculta** con el botón **"📁 Librería"** (toggle).
- **Interior apilado (A1):**
  1. Cabecera `📁 Librería` con acciones `⤢` (ancho) y `✕` (cerrar).
  2. Pestañas: **📁 Carpetas · ⭐ Favoritos · 🕘 Recientes**.
  3. **Búsqueda** (filtra por nombre en la carpeta actual / en toda la librería).
  4. **Árbol de carpetas** colapsable (pestaña Carpetas).
  5. **Lista de resultados**: cada fila = `♪ nombre` + acciones **▶ ✚ 🎹**.
- **Responsive:** en pantallas estrechas el panel pasa a ocupar ancho completo temporal (overlay) o
  se oculta; el escritorio manda. (Importar carpeta no existe en móvil; el panel muestra ahí la
  importación de archivos sueltos.)

### 4. Acciones por resultado
- **▶ Escuchar:** previsualización inmediata one-shot (`BufferSource → masterDest()`); botón vuelve a
  ▶■ para parar. Decodifica bajo demanda (unidad 2).
- **✚ A canal:** asigna al **canal seleccionado** (`selectedChannel`, ya se resalta al hacer clic en
  su cabecera). Registra el sample en el motor `samples` (`samples[id] = {name, buffer, b64?}`) y
  pone `lp.channels[selectedChannel].sound = 'sample:'+id`; refresca el selector del canal.
- **🎹 Como instrumento:** registra el sample y lo fija como **instrumento global melódico**
  (`currentInstrument = {type:'sample', id}` con `melodic:true`, `base` = nota base por defecto 60).
  Aparece en el **selector de instrumento** de la cabecera. Usable en Aprender/Reto/Looper-global.
  *(Limitación conocida: un único sample estirado suena bien ±1 octava de la nota base; lejos suena
  "ardilla". Nota base ajustable con el editor de samples existente.)*
- **Arrastrar y soltar (escritorio):** además de ✚, se puede arrastrar la fila del resultado y
  soltarla sobre la **cabecera/carril de un canal** → misma asignación que ✚ pero al canal soltado.

### 5. Integración con `playChannelSound` / instrumento global
- **Canal:** ya soporta `'sample:id'` (one-shot o melódico por el editor). No cambia el motor.
- **Instrumento global melódico:** `noteOn(midi,vel)` debe despachar el nuevo
  `currentInstrument.type === 'sample'` → `BufferSource` con `playbackRate = 2^((midi-base)/12)`
  hacia `masterDest()`, con parada en `silence(midi)`. (Extensión pequeña de `noteOn/silence`.)

### 6. Persistencia (`store.lib` + IndexedDB)
- **IndexedDB:** el `FileSystemDirectoryHandle` (no serializable a JSON; va en IndexedDB).
- **localStorage `store.lib`:** árbol ligero, **favoritos** (rutas), **recientes** (rutas), pestaña
  activa. Los **audios no se guardan** (se releen del disco). Offline OK (disco local).
- Samples ya **asignados a canales** siguen el guardado actual de samples (los pequeños en base64).

## Flujo de datos (resumen)
```
[📁 Importar] → showDirectoryPicker → handle (IndexedDB) → escaneo perezoso → árbol (store.lib)
   → panel: Carpetas/Favoritos/Recientes + búsqueda + resultados
       ▶  → getFile → decodeAudioData → BufferSource (preview)
       ✚  → samples[id]=buffer → canal.sound='sample:id'
       🎹 → samples[id]=buffer → currentInstrument={type:'sample',id,melodic,base}
       drag→ soltar en canal → como ✚ a ese canal
```

## Fuera de alcance (otros ciclos)
- **Multisample** (mapear varias muestras por rangos de teclas) — por ahora un sample melódico.
- **.sf2 (SoundFont)** local — caso aparte, más adelante.
- **Editor de piano-roll + rejilla "pro"** — sub-proyecto 2 (spec aparte).
- Importar carpeta en móvil (no hay API).

## Riesgos / notas
- File System Access API: soporte Chrome/Edge escritorio; permisos pueden requerir re-confirmación
  por sesión (`requestPermission`). Respaldo `webkitdirectory` cubre el resto en escritorio.
- Carpetas enormes: el escaneo lista nombres (ligero); decodificar es perezoso. Evitar decodificar
  todo de golpe.
- El panel lateral convive con las cabeceras de pista (que ya van a la izquierda): cuidar que no se
  amontonen; el panel es **togglable** y empuja/solapa el contenido del Looper, no lo rompe.
- `currentInstrument.type==='sample'` nuevo: revisar todos los sitios que asumen `'synth'|'sf'`
  (p. ej. `noteOn`, `silence`, guardado de preferencias) para no romperlos.

## Verificación
- `node --check` del `<script>` extraído tras cada fase.
- Prueba manual escritorio (Chrome/Edge): importar una carpeta con .wav/.mp3, ver el árbol, buscar,
  ▶ previsualizar, ✚ a un canal y oírlo en el bucle, arrastrar a otro canal, 🎹 como instrumento y
  tocarlo en Aprender; cerrar/reabrir la app y que la librería siga (handle persistido).
- Comprobar que el **móvil** no se rompe (sin importar carpeta; archivos sueltos siguen).
- Actualizar `CLAUDE.md` y `HANDOFF.md` (subir versión) tras implementar.
