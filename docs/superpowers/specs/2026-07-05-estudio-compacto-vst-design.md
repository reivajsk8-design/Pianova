# Estudio compacto estilo VST (efectos horizontales siempre visibles + densidad) — Diseño

**Fecha:** 2026-07-05 · **Versión objetivo:** 0.20.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Que PIANOVA STUDIO se vea **más pro y compacto** (menos "app de móvil"): menos aire entre secciones y,
sobre todo, la **cadena de efectos siempre visible y en horizontal** (estilo VST/pedalera), en vez de
oculta en un cajón que se despliega y con los efectos apilados en vertical (que obliga a bajar mucho).

## Decisiones tomadas (con el usuario)

1. **Rack de efectos horizontal y siempre visible** (adiós al cajón desplegable).
2. **Dos filas**: cadena del **canal seleccionado** y cadena del **máster**, cada una horizontal.
3. Efectos **antes del teclado** en el flujo de la vista.
4. Pasada global de **densidad** (menos márgenes/padding).

## Componentes

### 1. Sección de efectos siempre visible (`app/studioView.ts`)

- **Se elimina** el cajón inferior `#fxDrawer` (overlay `position:fixed` que se deslizaba) y el botón
  `#fxToggle` ("🎛 Efectos") de la cabecera, más su cableado (`open`/`close`).
- **Se añade** una sección `#fxSection` en el flujo normal de la vista, **después de los paneles
  (PADS/SAMPLES/MIXER) y antes del teclado** (`#stKeyboard`), **siempre visible** (no depende de la
  pestaña activa). Contiene dos racks:
  - Fila **Canal**: contenedor `#chRack` (rack del canal seleccionado).
  - Fila **Máster**: contenedor `#masterRack`.
- Los `mountRack(#chRack, …)` / `mountRack(#masterRack, …)` y el resto de su cableado **no cambian**;
  solo cambian de contenedor (de dentro del cajón a la sección fija). El título de la fila de canal
  sigue reflejando el canal seleccionado (lo pone `mountRack` con su `title`, ya existente).

### 2. Módulo de efecto compacto y cadena horizontal (`ui/rack.ts` + CSS)

- **Cadena horizontal:** `.rackList` pasa de `flex-direction:column` a **`row`** con `flex-wrap:nowrap`
  y **`overflow-x:auto`** (scroll horizontal con rueda/arrastre/swipe). Los `.fxCard` se colocan de
  izquierda a derecha.
- **Módulo compacto:** cada `.fxCard` es un módulo estrecho de **ancho fijo (~150px)**, `flex:0 0 auto`:
  - Cabecera: nombre del efecto + **power (bypass)** + reordenar **◀ ▶** + **✕**. En `rack.ts` los
    botones de mover cambian de **↑/↓ a ◀/▶** (mismo `rack.move(id, -1|+1)`, solo cambia la etiqueta y
    el `title` a "Izquierda"/"Derecha"). El bypass puede seguir siendo casilla, con estilo compacto.
  - Knobs: `.fxParams` en **rejilla compacta** (2 por fila) dentro del ancho del módulo; etiqueta y
    valor en fuente pequeña (ya son 9–10px). Los knobs y su `mountKnob` **no cambian**.
- **Cabecera de cada fila** (`.rackHead`): etiqueta (Canal/Máster) + selector **"➕ Añadir efecto…"**
  a la derecha (ya existe); se compacta el margen.

### 3. Pasada de densidad (`ui/styles.css`)

Reducir los espacios grandes (solo CSS, sin cambiar estructura). Valores objetivo:
- `.pvTop` margin-bottom **14→8**; `.pvGrid` margin-bottom **14→8**; `.pvSteps` margin-bottom **16→10**;
  `.pvSoundRow` margin-bottom **14→8**; `.pvParams` padding **12px 16px → 8px 10px**.
- `.pvBar` padding-bottom/margin-bottom **10/12 → 8/8**.
- `.racks`/sección de efectos gap **18→10**; `.rack` padding **12→8**.
- Teclado `.kb`: margin **18px 0 → 8px 0** y altura **160→140px**.
- Ajustes finos de etiquetas (`.pvLbl` margen) si hace falta para que respire lo justo.

Estos valores son un punto de partida; se afinan a ojo tras verlo en la URL desplegada.

## Qué NO cambia

- El **motor de audio**, el enrutado, y toda la lógica de efectos (añadir/bypass/mover/quitar, knobs,
  persistencia del rack) — es la **misma**. Solo cambia disposición (HTML de la vista), la plantilla del
  rack (`rack.ts`: ◀▶ y clases) y el CSS.
- Las pestañas PADS/SAMPLES/MIXER y su contenido; la iluminación reactiva; el sampler; el secuenciador.

## Móvil

El scroll horizontal de la cadena funciona con swipe. La sección de efectos siempre visible añade altura,
pero al ser horizontal no crece hacia abajo con cada efecto. En pantallas estrechas las dos filas siguen
siendo horizontales con su propio scroll. No se rehace el responsive; se comprueba que no desborde en ancho.

## Pruebas

- Es **CSS + plantilla + disposición**: sin tests unitarios nuevos. Verificación por
  `npm run typecheck && npm test && npm run build` (que la suite siga verde) + **prueba a ojo** en la URL
  desplegada (efectos visibles en dos filas horizontales, scroll horizontal, módulos compactos, ◀▶ mueven,
  bypass/quitar funcionan, todo más junto).

## Fuera de alcance (YAGNI)

- Rehacer el sistema de efectos o su persistencia.
- Drag-and-drop para reordenar (se mantiene ◀▶).
- Colapsar/expandir la sección de efectos (se queda siempre visible; se puede añadir después si estorba).
- Rediseño del responsive móvil más allá de que no desborde.

## Restricciones globales

- Todo en `studio/`; **no** tocar `pianova.html`. TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón `var(--pv-acc)`.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
