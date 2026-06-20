# Diseño — Efectos maestros (filtro + delay)

**Fecha:** 2026-06-13 · **Proyecto:** Pianova (`pianova.html`) · **Estado:** aprobado.

## Objetivo
Sección de **efectos maestros** sobre toda la mezcla (synth + batería + instrumentos reales),
empezando por **filtro** y **delay**, controlables en pantalla y asignables a **knobs** (Komplete
Kontrol / MiniLab). Web Audio puro, sin librerías, offline. Por defecto **sin efecto** (no cambia
la práctica de piano).

## Arquitectura — bus maestro
`ensureAudio()` crea una vez el bus:
`masterIn → fxHP (highpass) → fxLP (lowpass) → [seco → masterOut] + [→ fxDelay → fxWet → masterOut;
fxDelay → fxFb → fxDelay] → masterOut → destination`.
- **synth** (`synthNoteOn`) conecta a `masterIn` (en vez de `actx.destination`).
- **smplr** (instrumentos reales y `DrumMachine`) se crean con `{ destination: masterIn }`.
- **Metrónomo** (`lpClickSound`) va directo a `destination` (no se ve afectado).

## Efectos (esta fase)
- **Filtro (1 knob, `fxParams.filter` 0..1, def 0.5 = sin efecto):** 0–0.5 cierra un **paso-bajo**
  (200→20000 Hz) = oscuro→normal; 0.5–1 abre un **paso-alto** (20→2000 Hz) = normal→brillante/fino.
  En 0.5 ambos abiertos → sin efecto.
- **Delay:** `fxParams.delayTime` (0–0.6 s) y `fxParams.delayAmount` (0..1, def 0) que escala
  `fxWet.gain` y `fxFb.gain` (cap 0.6 para no realimentar en exceso). Amount 0 = sin eco.

## Controles
- Sección **"Efectos"** en el Looper con 3 sliders (Filtro, Delay tiempo, Delay cantidad).
- Cada slider **asignable a un knob** con el patrón 🎛 (nuevo `fxMap` param→`{num,port}`, `fxLearn`),
  igual que el mezclador; valor absoluto 0–127; recuerda puerto.
- Persistencia en `localStorage` (`store.fx = { params, map }`).

## Fuera de alcance
Reverb (siguiente fase, con impulso generado por código) y efectos por canal (esto es global).

## Riesgo
Enrutar `smplr` por el bus: confirmado que admite opción `destination`. El resto es Web Audio
estándar (BiquadFilter, DelayNode, GainNode).
