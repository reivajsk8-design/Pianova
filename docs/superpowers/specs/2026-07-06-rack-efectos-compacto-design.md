# Rack de efectos compacto — Diseño

**Fecha:** 2026-07-06 · **Versión objetivo:** 0.35.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Que la cadena de efectos ocupe menos y se vea más pro (estilo LMMS/Ableton "device chain"): cada efecto muestra
una **cabecera fina** con **LED de bypass** y solo sus **2 knobs principales**; el resto de parámetros se
**despliega** con un botón ⚙ en la misma tarjeta. Reduce el ancho total de la cadena sin perder acceso.

## Decisiones tomadas (con el usuario)

- **2 knobs** visibles por efecto sin desplegar; el resto tras **⚙** (despliega/pliega en la misma tarjeta).
- Bypass como **LED** (puntito verde = activo, apagado = bypass) en vez de la casilla "Bypass" con texto.
- **Solo UI** (`ui/rack.ts` + CSS). Sin tocar el motor, los efectos ni el modelo. Es la segunda mejora visual
  (tras la densidad y las pestañas); la tercera será el mapeo MIDI de knobs.

## Arquitectura

Un único archivo de lógica: `ui/rack.ts` (`mountRack`). Se añade estado local de "desplegado" por efecto y se
recorta la lista de knobs visibles; el resto es CSS.

### `ui/rack.ts` (`mountRack`)

- Estado de la instancia: `const expanded = new Set<string>()` (ids de efectos desplegados). Se conserva entre
  re-render (el rack re-renderiza al cambiar). Se puede podar al quitar un efecto (opcional; un id huérfano es
  inofensivo).
- **Cabecera** de cada `.fxCard`: se sustituye `<label class="fxByp"><input checkbox> Bypass</label>` por un
  botón LED `<button class="fxLed${e.isBypassed() ? '' : ' on'}" data-byp="${e.id}" title="Activar/desactivar (bypass)"></button>`.
  Se mantienen ◀ ▶ ✕. Si el efecto tiene **> 2 parámetros**, se añade un botón
  `<button class="chBtn fxMore" data-exp="${e.id}" title="${isExp ? 'Plegar' : 'Más parámetros'}">${isExp ? '▴' : '⚙'}</button>`.
- **Cuerpo:** para efectos con `eq` → "✎ Editar EQ" (igual que ahora). Para el resto:
  `const all = e.getParams(); const shown = expanded.has(e.id) ? all : all.slice(0, 2);` — se renderizan los
  knobs de `shown` (mismo `.fxKnob` de ahora). Efectos con ≤ 2 parámetros muestran todos y **no** llevan ⚙.
- **Cableado:** el bypass pasa de `input change` a `button[data-byp] click` →
  `rack.bypass(id, !e.isBypassed()); onChange(); render();`. Nuevo `button[data-exp] click` →
  `expanded.has(id) ? expanded.delete(id) : expanded.add(id); render();` (sin `onChange`, es solo visual). El
  montaje de knobs (`.fxKnob .knob`) no cambia (solo se montan los renderizados).

### CSS (`ui/styles.css`)

- `.fxLed{width:12px;height:12px;border-radius:50%;border:1px solid #2b3324;background:#141a13;cursor:pointer;padding:0;flex:0 0 auto}`
  `.fxLed.on{background:var(--pv-acc);border-color:var(--pv-acc);box-shadow:0 0 6px var(--pv-acc-dim)}`
- `.rackList` gana `align-items:flex-start` para que **desplegar una tarjeta no estire** a las demás (cada una
  conserva su altura).
- La casilla `.fxByp` y su CSS quedan sin uso (inofensivos); no se eliminan para acotar el diff.

## Qué NO cambia

- El motor, los efectos, el modelo, la persistencia, el EQ gráfico (sigue con su overlay), el resto de la vista.
  El orden/borrado/añadir efectos y el bypass funcionan igual (solo cambia el control del bypass a LED).

## Bordes

- **Cuál es "principal":** se muestran los **2 primeros** parámetros de `getParams()` (orden de declaración del
  efecto). Suficiente como defecto; si algún efecto tuviera un 2º parámetro poco útil, se puede afinar más
  adelante marcando parámetros primarios (fuera de alcance ahora).
- **Estado desplegado:** vive en memoria de la sesión (no se persiste); al recargar, todos empiezan plegados.
- **EQ y efectos de ≤2 params:** sin botón ⚙ (no hay "resto" que desplegar).

## Pruebas

- **No unitarias** (es DOM/UI): `cd studio && npm run typecheck && npm run build` + **prueba visual en la URL**:
  añadir varios efectos a un canal y al máster, ver 2 knobs por efecto, desplegar/plegar con ⚙, alternar el LED
  de bypass, reordenar/quitar, y confirmar que el sonido responde igual.

## Restricciones globales

- Todo en `studio/`; no tocar `pianova.html`. TypeScript strict; sin dependencias nuevas.
- Comentarios/UI en español. Acento verde neón `var(--pv-acc)`.
- Verificación: `cd studio && npm run typecheck && npm run build`.
- Commits con trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
