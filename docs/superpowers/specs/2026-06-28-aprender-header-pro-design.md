# Diseño — Cabecera "pro" de la pantalla Aprender (modos en desplegable)

**Fecha:** 2026-06-28 · **Proyecto:** Pianova (`pianova.html`) · **Estado:** el usuario delegó el
diseño y la ejecución ("decides tú todo, ejecuta y publica, mañana lo reviso"). Implementación
**inline** (sin subagentes), siguiendo la línea del Looper.

## Objetivo

Dar a la cabecera de **Aprender** el mismo aire pro que el transporte del Looper: los **modos de
aprendizaje** pasan de botones segmentados a un **desplegable**, y la fila de controles se reordena en
una barra limpia con **BPM grande editable**, grupos con etiqueta y separadores, y **▶ Empezar**.
Reutiliza toda la lógica existente (modo, tempo, canción, manos, acordes, bucle A–B).

## Alcance

**Dentro:**
- **Modo** → `<select id="mode">` (Practicar/Acompañar/Escuchar/Reto/Tocar libre). Su `change` ejecuta
  la MISMA lógica que hoy hace el clic en los botones `[data-mode]` (extraída a `setMode(m)`).
- Barra estilo transporte (reusa las clases del Looper `tpCol`/`tpLab`/`tpSep`/`tpBpm`/`tpPlay`):
  **Modo** · **▶ Empezar** + **↻ Reiniciar** · **Tempo (BPM grande editable** clic=prompt, arrastrar ↕,
  ligado al `#tempo` oculto) · **Canción** + **📂 .mid** · **Manos** · **Acordes** · **bucle A–B**.
- Mantiene `#tempo`/`#tempoVal` ocultos como fuente de verdad del tempo (lo usan `frame`/playback).

**Fuera:** cambiar la lógica de los modos/tempo/canción; tocar la fila superior (Aprender/Looper +
Instrumento + Conectar), que ya está bien.

## Restricciones (heredadas)

- **Un solo archivo** `pianova.html`; sin librerías; sin build; textos en español; no empeorar móvil.
- Reutiliza: `mode`, `tempoEl` (`#tempo`), `tempoVal`, `reset()`, `savePrefs`, `startReto`,
  `updateRetoHUD`, `store.progress`, `songKey`, la barra de bucle (`#loopStart`/`#loopEnd`/`#loopClear`).
- Actualizar las referencias a `[data-mode]`: el manejador de clic (→ `setMode` + `change` del select),
  la restauración de preferencias (`$('mode').value = mode`), y el **tutorial** (`TOUR` apunta a
  `[data-mode="practice"]` → cambiar a `#mode`).

## Componentes

1. **`setMode(m)`** — extrae la lógica actual del clic de modo (fija `mode`, oculta `#retoEnd`,
   `#retoBar` según reto, prepara Reto, `reset()`, `savePrefs`). El `<select id="mode">` la llama en
   `change`. La restauración pone `$('mode').value = mode`.
2. **BPM grande editable** (`#lnBpmNum` + `setLnBpm(v)`): clamp 40–160, escribe `#tempo`/`#tempoVal`/
   `#lnBpmNum`; doble-clic = `prompt`, arrastrar ↕ = ajustar. Sincronizado en el `input` de `#tempo` y
   al cargar canción (`tempoEl.value = s.bpm`).
3. **HTML** de `#learnView > .controls` reescrito a la barra `.lnBar` con grupos/separadores; ▶ Empezar
   (primario) y ↻ Reiniciar. Selects de Canción/Manos/Acordes con etiqueta. Barra de bucle al final.
4. **CSS**: reutiliza `.tpCol/.tpLab/.tpSep/.tpBpm/.tpPlay` del Looper; añade lo mínimo (`.lnBar`,
   `.lnBtn`). Responsive: la barra envuelve (wrap) en móvil.

## Verificación
- `node --check` del `<script>` + balance de llaves CSS. Prueba manual del autor: cambiar de modo por
  el desplegable hace lo mismo que antes (incluido Reto: muestra HUD); BPM clic/arrastrar cambia el
  tempo real; Empezar/Reiniciar, Canción, Manos, Acordes y bucle A–B funcionan; el tutorial resalta el
  desplegable de modo; persiste al recargar; móvil envuelve. El escritorio del resto no cambia.
- Subir versión (v1.23), `CLAUDE.md`/`HANDOFF.md`, y publicar.
