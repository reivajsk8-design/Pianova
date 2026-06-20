# Diseño — Importar archivos .mid (melodía)

**Fecha:** 2026-06-13
**Proyecto:** Pianova (`pianova.html`, archivo único, sin dependencias, offline)
**Estado:** aprobado por el usuario.

## Objetivo
Botón para abrir un `.mid` del disco, extraer su **melodía monofónica** y añadirlo como una
canción más para practicar, sin romper la regla de "un archivo / sin dependencias / offline".

## Decisiones tomadas
- **Melodía a una nota** ahora (acordes/dos manos, después).
- **Parser propio ligero** dentro de `pianova.html` (sin librerías).
- **Teclado adaptativo:** el rango dibujado se calcula según las notas de la canción
  (ajustado a octavas completas, mínimo 2 octavas). Las canciones a mano actuales siguen
  cabiendo en Do4–Do6.

## Parser (Standard MIDI File)
- Leer el archivo como `ArrayBuffer` (`file.arrayBuffer()`), recorrer con `DataView`.
- Cabecera `MThd`: formato, nº de pistas, **división** (ticks por negra). Si la división es
  SMPTE (bit alto a 1) → mensaje de no soportado (rarísimo en música).
- Cada pista `MTrk`: eventos con **delta-time de longitud variable** y **running status**.
  - Canal: `0x8` note off, `0x9` note on (velocity 0 = off), `0xA/0xB/0xE` (2 datos),
    `0xC/0xD` (1 dato).
  - Meta `0xFF`: tempo `0x51` (primero que aparezca), fin de pista `0x2F`; resto se salta.
  - Sysex `0xF0/0xF7`: se salta por longitud.
  - Tick absoluto = suma de deltas.

## Extraer melodía
- Pista de melodía = la que tiene **más note-on**.
- Emparejar on/off por altura (FIFO) → notas `{midi, startTick, durTick}`.
- Hacer monofónica: por cada inicio simultáneo, quedarse con la **nota más aguda**; recortar
  la duración hasta el siguiente inicio para que no se solapen dos notas.
- Convertir ticks→beats (`/división`), normalizar para que la primera nota empiece en 0.
- Sin cuantización (timing del archivo). Estructura final: `{ midi, startBeat, dur }`.

## Rango del teclado
- `LOW`/`HIGH` pasan de constantes a variables. `setSong()` los calcula desde las notas:
  `low = floor(min/12)*12`, `high = ceil((max+1)/12)*12`, garantizando `high-low ≥ 24`.
- `geometry()`, render y hit-test ya leen `LOW`/`HIGH`, así que se reajustan juntos.

## Tempo
- `bpm = 60000000 / microsegundos_por_negra` (primer tempo), por defecto 120, **limitado a
  40–160** para el deslizador.

## UI
- Botón **"Abrir .mid"** + `<input type="file" accept=".mid,.midi" hidden>` en los controles
  de Aprender.
- Al cargar: parsear → crear objeto canción (nombre = nombre del archivo) → añadir `<option>`
  al selector → seleccionarla → `setSong()`.
- Errores (no es MIDI / sin notas / SMPTE): `status(...)` claro, sin romper el estado actual.

## Fuera de alcance
Acordes/dos manos, elegir pista a mano, tempos cambiantes (se usa el primero), persistencia
entre sesiones, audio (MP3/WAV) → MIDI.

## Nota sobre audio → MIDI (aparcado)
Transcripción de audio a notas: factible solo para melodías monofónicas limpias (detector de
tono propio); para canciones completas en MP3 requiere modelos de IA (p.ej. Spotify Basic
Pitch), que rompen "sin dependencias / offline" y dan resultados sucios. Se deja como
experimento opcional futuro, no en este alcance.
