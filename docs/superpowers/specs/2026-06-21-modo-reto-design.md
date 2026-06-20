# Diseño — Modo "Reto" (juego de progresión por tempo)

**Fecha:** 2026-06-21 · **Proyecto:** Pianova (`pianova.html`) · **Estado:** aprobado (usuario delegó
decisiones e implementación; revisará mañana).

## Objetivo
Un 5º modo **Reto** donde la melodía suena **a tempo** y el usuario toca las notas **a tiempo**
según caen. Superar un umbral de precisión **sube el tempo (nivel)** → "te superas a ti mismo".
Reutiliza el render de notas, el audio y el `store.progress` existentes.

## Mecánica
- Usa `notes` (melodía). `songBeat` avanza en tiempo real al **tempo del nivel** (no espera).
- **Acierto:** tocar la nota correcta dentro de una ventana ±0.34 de pulso al cruzar la línea.
  Nota que pasa sin tocarse (`startBeat < songBeat - WINDOW`) → fallo (rompe combo).
- **Puntuación:** por acierto `100 + bonus de timing (0..50) + combo*5 (tope 100)`. Combo en vivo.
- **Estrellas** por precisión final: ≥95%→★★★, ≥80%→★★, ≥60%→★.
- **Subir de nivel:** precisión ≥ **85%** y nivel < máx → nivel+1.

## Niveles por tempo
- `levelTempo(L) = clamp(round(baseBpm * (0.5 + 0.1*L)), 30, baseBpm*1.5)` con L = 1..8.
  L1≈60%, L5=100%, L8≈130% del tempo natural de la canción (`songBaseBpm`).
- Se empieza en el **mejor nivel guardado** de la canción (o 1). HUD muestra "Nivel X · YY BPM".

## UI
- Botón de modo **"Reto · supérate"** en `.seg`.
- **HUD** `#retoBar` (visible solo en Reto): Nivel · BPM · Puntos · Combo · Récord.
- **Pantalla de resultados** `#retoEnd` (overlay) al terminar: estrellas, precisión, combo máx,
  puntuación, avisos ("¡Nuevo récord!", "¡Subes a Nivel X!") y botones **Reintentar** /
  **Siguiente nivel** / **Cerrar**.

## Estado y persistencia
- Vars: `retoLevel, retoScore, retoCombo, retoMaxCombo, retoHits, retoMiss`, `songBaseBpm`.
- `store.progress[songKey]` se amplía con `bestLevel` y `bestScore` (junto a best/last/plays).
- `setSong` carga `bestLevel` → nivel inicial; muestra récord.

## Lógica (en las funciones existentes)
- `frame()`: rama `reto` — avanza `songBeat` al tempo del nivel; marca fallos de notas pasadas;
  termina en `songBeat > lastBeat + 2` → `retoFinish()`.
- `judge(midi)`: rama `reto` — casa el midi con una nota no juzgada dentro de la ventana → acierto
  (combo++, score+=…) o fallo (combo=0).
- `start()`: rama `reto` — fija nivel/tempo, resetea marcadores, `playing=true`.
- `draw()`: en Reto cae `notes`, coloreadas por estado (acierto verde / fallo gris).

## Fuera de alcance (siguiente ciclo)
Reto por acordes (Acompañar), patrones del looper con nombre. Valores (umbral/step/estrellas)
fáciles de ajustar mañana.
