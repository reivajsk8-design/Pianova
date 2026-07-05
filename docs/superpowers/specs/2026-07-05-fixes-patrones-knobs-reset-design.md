# Arreglos: patrones en vivo + suavizado de knobs + botón Nuevo — Diseño

**Fecha:** 2026-07-05 · **Versión objetivo:** 0.22.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

Tres mejoras detectadas probando, con sus causas raíz ya investigadas:

## 1. Patrones: el seleccionado suena en vivo (Bug A)

**Causa raíz:** en reproducción, el índice del patrón que suena (`playPattern`) solo se actualiza en **modo
canción**; fuera de canción se queda fijo con el patrón que había al pulsar Play. Al crear/seleccionar otro
patrón cambia `daw.current` pero no lo que suena → "ni repite el primero ni salta al segundo".

**Decisión (con el usuario):** el **patrón seleccionado suena en vivo**; el **encadenado** (1→2→1→2) sigue en
**🔗 Canción** (que se hará más claro). **Fix:** en `onStep`, el índice a reproducir es
`(songMode && daw.song.length) ? playPattern : daw.current`. Así seleccionar/crear un patrón mientras suena
salta a él de inmediato; en modo canción se mantiene el avance por la lista.

## 2. Suavizado de parámetros de efectos (Bug B)

**Causa raíz:** todos los efectos aplican los parámetros con asignación directa `AudioParam.value = valor`
(p. ej. `band.gain.value`, `comp.threshold.value`, `delay.delayTime.value`, `wetMix.gain.value`…). Al
arrastrar un knob eso produce **saltos instantáneos** → "zipper noise" (rasgueo sucio) y clics/clipeo.

**Fix (patrón de `pianova.html`):** suavizar con `setTargetAtTime`. Helper `ramp(param, value, actx, tc=0.01)`
= `param.setTargetAtTime(value, actx.currentTime, tc)`. En el manejador `apply(name, value)` de **cada
efecto**, sustituir `NODO.paramAudio.value = EXPR` por `ramp(NODO.paramAudio, EXPR, actx)`. **No** se tocan:
reconstrucciones de buffer (reverb size/decay, con su debounce), `.type`, `.curve`, ni las inicializaciones de
construcción (fuera del `apply`). Efectos afectados (los ~19): autopanner, chorus, deesser, dynamics, echo,
equalizer, equalizer-bw, fractal-doubler, gain, limiter, pitch, pink-noise, reflector, reverb, rotary, sigmoid,
stereo-echo, tremolo, tubewarmth (solo los que tengan `AudioParam.value =` dentro de su `apply`).

## 3. Botón "Nuevo" (reset) (Feature C)

**Qué:** un botón **🆕 Nuevo** en la cabecera que, con **confirmación**, deja el Estudio de cero. Reutiliza el
flujo de "abrir proyecto": `confirm(...)` → descarta canales (`dispose`), `daw = defaultDaw()`, limpia samples
(`clearSamples()`), reinicia el rack maestro, `saveStore(...)`, recrea canales y `renderAll()`. Reinicia
`songMode/playPattern/songPos/selectedId/scale` a sus valores por defecto y el BPM del transporte.

## Qué NO cambia

- El motor de audio (solo se suaviza cómo se **aplican** los parámetros; el sonido es el mismo, sin zipper).
- La forma del modelo. El encadenado por canción. El resto de la vista.

## Pruebas

- **Unitaria (Vitest):** `ramp()` (llama a `setTargetAtTime(value, currentTime, tc)` en un `AudioParam` falso).
- **No unitarias:** patrones en vivo, suavizado de knobs y botón Nuevo → typecheck + build + prueba a
  oído/vista en la URL (mover knobs sin rasgueo; seleccionar patrón salta en vivo; Nuevo deja todo limpio).

## Restricciones globales

- Todo en `studio/`; no tocar `pianova.html`. TypeScript **strict**; sin dependencias nuevas.
- Comentarios/UI en español. Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
