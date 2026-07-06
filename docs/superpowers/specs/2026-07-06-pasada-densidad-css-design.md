# Pasada de densidad del Estudio (look compacto/pro) — Diseño

**Fecha:** 2026-07-06 · **Versión objetivo:** 0.33.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Que el Estudio deje de verse "de app móvil / juguete" y pase a un **look compacto y pro** (tipo DAW/VST de
escritorio, estética Elektron/Tempest): apretar tamaños, radios, paddings, gaps y tipografía, siguiendo los
números estándar de interfaces de alta densidad. **Solo CSS**, sin tocar HTML, estructura ni motor.

## Decisiones tomadas (con el usuario)

- **Solo CSS** (`ui/styles.css`), clases del Estudio. Sin cambios de comportamiento; reversible.
- **Esquinas compactas: 4px** en controles/celdas/selects, 5px en paneles, 6px en el marco exterior (pro pero
  amable; el usuario descartó el 2px por frío). **Esta política de radios SUPERSEDE los "→ 2 / → 3" de las
  zonas de abajo:** donde ponga "radio → 2" léase 4px, y "radio → 3" léase 5px.
- Es la **primera** de varias mejoras visuales; las siguientes (rack de efectos compacto, mapeo MIDI de knobs)
  van aparte.

## Principios (de la investigación de DAW/VST pro)

- **Tipografía:** etiquetas y valores 10–11px; cabeceras de sección ≤ 13px; el título del Estudio 14px. **Valores
  numéricos en fuente monoespaciada** (BPM, dB, Hz, pasos, valores de knob) — señal de "instrumento de precisión".
- **Radios:** 4px en botones/celdas/selects, 5px en paneles, 6px en el marco exterior. Nada de 8–12px.
- **Espaciado:** padding 2–6px dentro de un módulo, 6–10px entre módulos; nada de gaps de 12–18px "de tarjeta".
- **Bordes/sombra:** 1px sólido; el glow verde se reserva para lo encendido/seleccionado (se quitan brillos
  decorativos de más).
- **Un solo acento** (el verde ya lo es); jerarquía por brillo de gris.

## Arquitectura

Un único archivo: `studio/src/ui/styles.css`. Se añade una variable de fuente monoespaciada y se ajustan los
valores de las reglas existentes por zonas. Sin nuevas clases estructurales (los cambios son de valores).

### Añadidos a `:root`/`.pvView`

- `--pv-mono: ui-monospace, 'JetBrains Mono', 'Roboto Mono', 'Consolas', monospace;`

### Ajustes por zona (actual → objetivo)

**Marco y cabecera**
- `.pvView` padding `14 → 10px`; radio `10 → 6px`.
- `.pvBar` gap `12 → 10`, padding-bottom `8 → 6`, margin-bottom `8 → 6`.
- `.pvTitle` `16 → 14px`.
- `.pvHdrBtns button` padding `5px 12px → 4px 9px`, radio `6 → 2`, font `12 → 11`.
- `.pvTop` gap `16 → 10`, margin-bottom `8 → 6`.
- `.pvInfo` padding `10px 14px → 6px 10px`, radio `8 → 3`, min-width `220 → 180`.
- `.pvInfo .pvIName` `12 → 11`; `.pvISub` `10 → 9`, margin-top `4 → 2`.
- `.pvWave` height `52 → 38px`, radio `4 → 2`.

**Pestañas / pads / pasos**
- `.pvTabs` gap `8 → 6`, margin-bottom `12 → 8`.
- `.pvTab` padding `6px 20px → 5px 14px`, radio `6 → 2`, font `12 → 11`.
- `.pvGrid` gap `8 → 6`, margin-bottom `8 → 6`.
- `.pvPad` min-height `56 → 44px`, radio `8 → 3`, font `12 → 11`, padding `6 → 5`.
- `.pvLbl` margin `0 0 6 → 0 0 4` (font 10px se mantiene).
- `.pvSteps` margin-bottom `10 → 8`; `.pvSteps .stepRow` gap `5 → 4`;
  `.pvSteps .stepCell` height `30 → 26`, radio `5 → 2`.
- `.pvParams` padding `8px 10px → 6px 9px`, radio `8 → 3`.
- `.pvSoundRow` gap `12 → 10`, margin-bottom `8 → 6`; su `select` padding `6px 10px → 5px 9px`, radio `6 → 2`.
- `.pvMixer` gap `8 → 6`.

**Efectos (solo densidad, sin reestructurar)**
- `.rack` radio `12 → 3`; en `.fxSection .rack` padding `8px 10px → 6px 8px`.
- `.fxCard` radio `10 → 2`, width `156 → 138`, padding `9px 11px → 6px 8px`.
- `.fxHead b` `12 → 11`.
- `.fxKnob` width `54 → 48`; `.fxKnobLab`/`.fxKnobVal` `10 → 9`; **`.fxKnobVal` en `--pv-mono`**.

**Patrones / barras**
- `.patBar` gap `6 → 5`, margin `10 → 8`.
- `.patBtn` `30×30 → 26×26`, radio `7 → 2`; `.patIcon` height `30 → 26`, radio `7 → 2`;
  `.songToggle` height `30 → 26`, radio `7 → 2`; `.songChip` radio `6 → 2`, **`--pv-mono`**.
- `.pvLenBtn`/`.pvPage`/`.pvLenSep` radios a 2px; **`.pvLenN` en `--pv-mono`**.

**Selects/botones varios (radio 6 → 2, sin cambiar tamaño de fuente)**
- `.pvScale select`, `.smpBtn`, `.smpBtn select`, `.smpBtn button`, `.libBtn`, `.libSearch`, `.libAct`,
  `.eqBar select`, `.eqBtn`, `.knobCell span` (a 9px).

**Piano-roll y sampler (retoque leve, ya son densos)**
- `.pr` radio `8 → 3`; `.smpWave` radio `8 → 3`, height `120 → 104`.

### `--pv-mono` se aplica a

`.fxKnobVal`, `.pvLenN`, `.songChip`, y cualquier campo de valor numérico ya existente que sea texto (no
inputs). No se tocan los `ui/*.ts` (si el BPM u otros valores viven en JS sin clase de valor, se dejan para una
pasada posterior; esta es solo CSS).

## Qué NO cambia

- HTML, estructura del rack de efectos, tamaños de knob fijados en JS (`mountKnob({size})`, ya están en rango
  pro 34px), el motor, el comportamiento. Solo valores de CSS.

## Bordes

- **Táctil/móvil:** al apretar alturas, mantener los objetivos de toque razonables (pads 44px, celdas 26px, pads
  y botones ≥ 22px) para que siga usable con el dedo. No bajar de ahí.
- **Legibilidad:** 10–11px es el mínimo cómodo; no bajar etiquetas por debajo de 9px salvo valores secundarios.
- **Iteración:** al ser CSS, tras verlo en la URL se pueden reafinar los números sin coste.

## Pruebas

- **No unitarias** (es CSS): `cd studio && npm run typecheck && npm run build` (el build empaqueta el CSS) +
  **prueba visual en la URL** (todas las pestañas: PADS, SAMPLES, MIXER; efectos; piano-roll; EQ; librería).
  Comprobar que nada se rompe/desborda y que se ve notablemente más compacto/pro.

## Restricciones globales

- Todo en `studio/`; no tocar `pianova.html`. Sin dependencias nuevas.
- Comentarios/UI en español. Acento verde neón `var(--pv-acc)`.
- Verificación: `cd studio && npm run typecheck && npm run build`.
- Commits con trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
