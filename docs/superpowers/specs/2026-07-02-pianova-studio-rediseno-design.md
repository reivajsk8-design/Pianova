# Diseño — Rediseño visual del Estudio: "PIANOVA STUDIO" (estilo STORM / Tempest)

**Fecha:** 2026-07-02 · **Proyecto:** Estudio (`studio/`, rebuild pro) · **Estado:** diseño aprobado.
Rediseño de la **vista** del Estudio (layout + tema) inspirado en STORM (Dave Smith Tempest): negro con
**verde neón**, rejilla de pads, pestañas PADS/SAMPLES/MIXER y panel de parámetros del pad seleccionado.
Validado con mockups (companion visual). No toca `pianova.html`.

## Objetivo

Reorganizar y re-estilizar la vista del Estudio para que se vea y se use como un groovebox estilo Tempest,
**sin cambiar el motor** (audio, secuenciador, sinte, batería, modelo y persistencia intactos). Renombrado a
**PIANOVA STUDIO**, tema **negro + verde neón `#2dff6a`**.

## Decisiones (del brainstorming)

- **Aspecto + disposición completa** (no solo un reskin): cabecera con transporte, pestañas, rejilla de
  pads, panel de pasos + parámetros.
- **Los "pads" son los canales actuales** (no 16 pads fijos): cada pad = un canal (synth preset, sinte
  editable o batería); se conserva añadir/quitar. Reutiliza el modelo y el motor existentes.
- **Nombre:** PIANOVA STUDIO. **Acento:** verde neón `#2dff6a` sobre negro.
- **Pestaña SAMPLES:** por ahora un placeholder "Próximamente"; la rellena el **sub-proyecto siguiente**
  (Simpler/sampler con slicing, ver [[estudio-mejoras-sonido-cola]]).
- **El motor no se toca.** Consecuencia asumida: el panel PARÁMETROS es rico para canales `synthx` (reusa
  el editor del sinte); para batería 808 y synth-preset no hay parámetros de síntesis editables aún, así que
  ahí el panel muestra lo básico o un aviso "sin parámetros de síntesis".

## Alcance

**Dentro:**
1. **Tema visual** (`ui/styles.css`): variables de color (negro + verde neón), estilos de cabecera,
   pestañas, rejilla de pads, pasos, knobs y panel de parámetros. Escritorio (la app es de escritorio).
2. **Reestructura de la vista** (`app/studioView.ts` + componentes en `ui/`): cabecera con transporte
   (BPM grande, ▶/⏹, pasos, swing) + info del canal seleccionado; **sistema de pestañas** PADS/SAMPLES/
   MIXER; **rejilla de pads** (canales) con selección y "+ Añadir"; bajo el pad: **PASOS** (secuenciador
   existente) + **PARÁMETROS** (editor del sinte para `synthx`; básico para el resto).
3. **Pestaña MIXER:** reubica los controles de mezcla existentes (vol/pan/mute/solo).
4. **Pestaña SAMPLES:** placeholder "Próximamente — Simpler con slicing".
5. **Renombrado** a PIANOVA STUDIO en la UI (título de cabecera; el `<title>`/marca donde aplique).

**Fuera (YAGNI / otros sub-proyectos):** el Simpler/sampler con slicing (siguiente sub-proyecto), añadir
parámetros de síntesis a la batería, cambios de motor/modelo/persistencia, responsive móvil (el Estudio es
de escritorio). No tocar `pianova.html`.

## Restricciones (heredadas)

- Todo en **`studio/`**; **Vite + TypeScript strict**; **Vitest**; **sin framework de UI**; textos/
  comentarios en **español**. No tocar `pianova.html`. Sin dependencias nuevas.
- **No cambiar el comportamiento funcional:** las mismas acciones (seleccionar canal, poner pasos, editar
  el sinte, mezclar, transporte, guardar/abrir) siguen existiendo; solo cambian su disposición y estilo.
- Los tests actuales (lógica pura) deben seguir verdes; la UI se verifica por typecheck + build + prueba
  por vista/oído.
- El audio arranca tras gesto (`ensureAudio`/`audioOn`).

## Arquitectura (unidades)

La vista actual (`studioView.ts`) monta: barra de transporte, tira de canales (`channelstrip.ts`), grid de
pasos, cajones de efectos y del sinte, teclado. El rediseño **reorganiza** ese montaje en el nuevo layout y
añade pestañas, reutilizando los componentes existentes donde sea posible.

### 1. Tema (`ui/styles.css`)
- Variables CSS raíz: `--bg:#0a0d0a`, `--panel:#10130f`, `--line:#23291f`, `--acc:#2dff6a`,
  `--acc-dim:rgba(45,255,106,.35)`, `--ink:#c9d2c9`, `--muted:#8a958a`. (Valores del mockup validado.)
- Estilos para: `.pvBar` (cabecera), `.pvTabs/.pvTab` (pestañas), `.pvGrid/.pvPad` (rejilla de pads),
  pasos en verde, knobs con arco verde, `.pvParams` (secciones GENERATOR/FILTER/AMP). Los knobs
  (`ui/knob.ts`) toman el color de acento por variable.

### 2. Cabecera (`ui/studioHeader.ts` nuevo, o sección en `studioView`)
- Título **PIANOVA STUDIO**; transporte ▶/⏹, **BPM grande** editable (reusa el control de BPM actual),
  indicador de pasos (p. ej. "13/16") y swing; a la derecha, **info del canal seleccionado** (nombre +
  resumen de parámetros) y una **mini forma de onda** (indicador visual; simple/decorativo por ahora,
  sin análisis pesado). Reutiliza los handlers de transporte existentes.

### 3. Pestañas (`ui/tabs.ts` nuevo o lógica en `studioView`)
- Tres pestañas PADS / SAMPLES / MIXER; una activa a la vez (mostrar/ocultar secciones con una clase).
  Estado de pestaña en memoria de la vista (no requiere persistencia; opcional recordar la última).

### 4. Rejilla de pads (`ui/padGrid.ts` nuevo, sustituye la tira vertical)
- Un pad por canal (nombre + icono según tipo: synth/synthx/drum), el seleccionado resaltado; celda
  "+ Añadir" que crea un canal (reusa la acción actual de añadir canal). Clic en un pad = `selectChannel`.
  El botón de quitar/duplicar canal se mantiene (en el pad o en un menú). Reutiliza `daw`/canales tal cual.

### 5. Panel PADS inferior — PASOS + PARÁMETROS
- **PASOS:** el grid de pasos del canal seleccionado (componente existente), re-estilizado en verde.
- **PARÁMETROS:** si el canal es `synthx` → monta el **editor del sinte** (`ui/synthEditor.ts`) en las
  secciones GENERATOR/FILTER/AMP; si es batería/synth-preset → muestra un aviso "sin parámetros de
  síntesis" (o solo controles básicos). Sin cambios de motor.

### 6. Pestaña MIXER
- Reubica los controles de mezcla existentes (vol/pan/mute/solo por canal) en una vista de mezclador.
  Reutiliza los knobs y los handlers actuales; sin lógica nueva de audio.

### 7. Pestaña SAMPLES (placeholder)
- Un panel con un cartel "🎹 Próximamente: Simpler con slicing" (cargar sonidos de la PC + trocear en
  slices + editar la muestra + secuenciarla). Marca el punto de entrada del siguiente sub-proyecto.

## Flujo de datos (resumen)
```
studioView monta: cabecera(transporte+info) + pestañas + (PADS: rejilla + pasos + params) | MIXER | SAMPLES
seleccionar pad -> selectChannel(id) -> repinta info, pasos y params del canal (mismos datos y handlers)
editar knob del sinte (params) -> synthEditor.onChange -> updateChannel + audio.setInstrument + persist (ya existe)
transporte / pasos / mezcla / guardar-abrir -> sin cambios (misma lógica)
tema -> variables CSS; el motor y el modelo no cambian
```

## Riesgos / notas
- **Reescritura grande de `studioView.ts`:** es el cambio principal; se hace conservando todas las acciones
  y handlers actuales (seleccionar, pasos, editar sinte, mezcla, transporte, proyecto). Extraer piezas a
  componentes (`padGrid`, `tabs`, cabecera) mantiene los archivos enfocados.
- **Panel de parámetros no uniforme:** rico para `synthx`, básico para batería/preset (consecuencia
  asumida de no tocar el motor). Comunicado en la UI con un aviso claro.
- **Forma de onda de la cabecera:** indicador visual simple (no un analizador en tiempo real) para no
  añadir complejidad ni coste; se puede mejorar después.
- **Sin regresiones funcionales:** la lista de comprobación manual cubre cada acción que ya existía.

## Verificación
- `npm run typecheck` + `npm test` (los tests actuales siguen verdes; es UI) + `npm run build`.
- **Manual (Chrome/Edge):** cabecera y transporte funcionan (play/stop/BPM/swing); pestañas cambian;
  rejilla de pads selecciona/añade canales; PASOS edita el patrón; PARÁMETROS edita el sinte en canales
  `synthx`; MIXER ajusta vol/pan/mute/solo; SAMPLES muestra el placeholder; guardar/abrir proyecto sigue
  funcionando; el tema verde se aplica en todos los elementos. `pianova.html` sigue igual.
- Actualizar `HANDOFF.md`/`CLAUDE.md` y subir versión de `studio/package.json` al cerrar.
