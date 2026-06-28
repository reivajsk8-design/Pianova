# Looper estilo pistas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el Looper en una pila de filas de pista, con la cabecera (color + nombre +
sonido + volumen + controles) pegada y alineada a su carril de notas, estilo Ableton, sin perder
funciones ni empeorar el escritorio.

**Architecture:** Se sustituye el bloque "lienzo arriba / tarjetas abajo" por un contenedor flex
`.lpTracks` de dos columnas: a la izquierda `.lpHeads` (las 8 cabeceras, una por canal) y a la
derecha `.stage` con el `#lpCanvas` único de siempre. Cada cabecera tiene **altura fija**
(`--lprow`), así el alto de carril del lienzo (`lpH/8`) coincide exactamente con cada cabecera y
quedan alineadas. Se mantiene todo el JS de dibujo/edición y los manejadores de eventos (mismos
`id`/atributos `data-*`); solo cambia el HTML de `lpBuildChannelUI` (de tarjeta a cabecera de fila)
y el CSS.

**Tech Stack:** Un único `pianova.html` (HTML + CSS + JS inline, IIFE `'use strict'`). Sin build,
sin librerías de instalación. Verificación: `node --check` del `<script>` + prueba manual en
Chrome/Edge.

## Global Constraints

- **Un solo archivo** `pianova.html`; sin frameworks ni paso de compilación; `smplr` solo bajo
  demanda por CDN (no se toca aquí).
- **Textos e interfaz en español.**
- **No empeorar el escritorio**; el móvil (Chrome Android, ≤860px y apaisado) debe seguir usable.
- **No romper funciones**: grabar / silenciar / borrar / cuadrar / volumen / selector de sonido /
  aprender knob (🎛) / editar sample (✏️) / edición de notas en el lienzo (arrastrar/borrar).
- Reutilizar `id="lpChannels"` (referenciado por `lpChannelsEl`) y los atributos `data-rec`,
  `data-mute`, `data-clear`, `data-quant`, `data-vol`, `data-vollearn`, `data-sound`, `data-edit`.
- Verificación de sintaxis tras cada tarea (no hay tests automáticos):
  ```bash
  node -e "const fs=require('fs');const h=fs.readFileSync('pianova.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('pv_check.js',m.map(x=>x[1]).join('\n;\n'));" && node --check pv_check.js && echo SINTAXIS_OK && rm -f pv_check.js
  ```

---

### Task 1: Reestructurar el layout a filas de pista (HTML + CSS + `lpBuildChannelUI`)

**Files:**
- Modify: `pianova.html` — HTML del `#looperView > main` (≈líneas 371-373).
- Modify: `pianova.html` — CSS del Looper (bloque `.lpChannels` / `.lpCh`, ≈líneas 74-92).
- Modify: `pianova.html` — función `lpBuildChannelUI` (≈líneas 831-852).

**Interfaces:**
- Consumes: `LP_CHANNELS` (8), `LP_COLORS[i]`, `lp.channels[i].vol`, `lpChannelsEl` (= `$('lpChannels')`),
  `rebuildChannelSoundOptions()`, `lpUpdateSelected()`.
- Produces: el contenedor `#lpChannels` ahora tiene clase `.lpHeads` y contiene 8 `.lpHead`
  (en vez de `.lpCh`), conservando todos los `data-*`. Misma API para el resto del código.

- [ ] **Step 1: Cambiar el HTML del cuerpo del Looper**

Reemplaza (en `#looperView > main`):

```html
    <main>
      <div class="stage"><canvas id="lpCanvas"></canvas></div>
      <div class="lpChannels" id="lpChannels"></div>
```

por:

```html
    <main>
      <div class="lpTracks">
        <div class="lpHeads" id="lpChannels"></div>
        <div class="stage"><canvas id="lpCanvas"></canvas></div>
      </div>
```

(El resto de `<main>` —`.lpfx`, `.lpmidi`— y el cierre `</main>` se quedan igual.)

- [ ] **Step 2: Reemplazar el CSS de canales**

Sustituye el bloque actual (≈líneas 74-92), desde `.lpChannels{...}` hasta
`.lpCh.sel{...}` inclusive, por:

```css
  /* ---------- Looper: filas de pista (cabecera + carril alineados) ---------- */
  .lpTracks{display:flex; min-height:380px; border:1px solid var(--line); border-radius:16px;
    overflow:hidden; background:#0c0e13; box-shadow:0 18px 55px rgba(6,10,20,.55); margin-top:0}
  .lpTracks .stage{flex:1; border:none; border-radius:0; box-shadow:none; min-height:0}
  .lpHeads{flex:0 0 224px; display:flex; flex-direction:column; background:var(--panel);
    border-right:1px solid var(--line)}
  .lpHead{height:var(--lprow,86px); box-sizing:border-box; display:flex; flex-direction:column;
    justify-content:center; gap:6px; padding:7px 9px; border-bottom:1px solid var(--line);
    border-left:4px solid var(--chcolor,#888); transition:background .2s ease}
  .lpHead:last-child{border-bottom:none}
  .lpHead.sel{background:rgba(255,206,122,0.07); box-shadow:inset 3px 0 0 var(--amber)}
  .lpHeadTop{display:flex; align-items:center; gap:6px}
  .lpName{font-family:var(--disp); font-size:12px; font-weight:600; white-space:nowrap; flex:0 0 auto}
  .lpHeadMid{display:flex; align-items:center; gap:6px}
  .lpHeadBot{display:flex; align-items:center; gap:5px}
  .lpSound{flex:1; min-width:0; font-size:11px; padding:4px 22px 4px 7px;
    background:var(--panel2); color:var(--ink); border:1px solid var(--line); border-radius:7px}
  .lpVol{flex:1 1 40px; width:auto; min-width:0; accent-color:var(--amber)}
  .lpHead button{padding:4px 7px; font-size:12px; line-height:1; flex:0 0 auto}
  .lpHead .lpHeadBot button{flex:1 1 auto}
  .lpHead button.rec{background:#e8746b; color:#1a0606; border-color:#e8746b; font-weight:700}
  .lpHead button.muted{opacity:.5}
  .lpVolLearn.assigned{border-color:var(--green); color:var(--green)}
  .lpVolLearn.learning{background:var(--amber); color:#1a1306; border-color:var(--amber)}
```

- [ ] **Step 3: Reescribir `lpBuildChannelUI` (markup de tarjeta → cabecera de fila)**

Reemplaza el cuerpo del bucle de `lpBuildChannelUI` por:

```javascript
  function lpBuildChannelUI() {
    lpChannelsEl.innerHTML = '';
    for (let i = 0; i < LP_CHANNELS; i++) {
      const el = document.createElement('div');
      el.className = 'lpHead'; el.dataset.ch = i;
      el.style.setProperty('--chcolor', LP_COLORS[i]);
      const vol = (lp.channels[i] && lp.channels[i].vol != null) ? lp.channels[i].vol : 0.85;
      el.innerHTML =
        '<div class="lpHeadTop">' +
          '<span class="lpName" style="color:' + LP_COLORS[i] + '">Canal ' + (i + 1) + '</span>' +
          '<select class="lpSound" data-sound="' + i + '"></select>' +
          '<button class="lpEdit" data-edit="' + i + '" title="Editar el sonido importado">✏️</button>' +
        '</div>' +
        '<div class="lpHeadMid">' +
          '<input class="lpVol" type="range" min="0" max="1" step="0.05" value="' + vol + '" data-vol="' + i + '" title="Volumen">' +
          '<button class="lpVolLearn" data-vollearn="' + i + '" title="Asignar un knob a este volumen">🎛</button>' +
        '</div>' +
        '<div class="lpHeadBot">' +
          '<button class="rec" data-rec="' + i + '" title="Grabar en este canal">● Grabar</button>' +
          '<button data-mute="' + i + '" title="Silenciar">🔇</button>' +
          '<button data-clear="' + i + '" title="Borrar lo grabado">🗑</button>' +
          '<button data-quant="' + i + '" title="Cuadrar al pulso">⊞</button>' +
        '</div>';
      lpChannelsEl.appendChild(el);
    }
    rebuildChannelSoundOptions();
    lpUpdateSelected();
  }
```

(Nota: los botones de `.lpHeadBot` llevan el icono como **texto** del propio `<button>`, así el
`click` cae en el botón y `ev.target.dataset.rec/mute/clear/quant` sigue funcionando sin tocar la
delegación de eventos.)

- [ ] **Step 4: Verificar sintaxis**

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('pianova.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('pv_check.js',m.map(x=>x[1]).join('\n;\n'));" && node --check pv_check.js && echo SINTAXIS_OK && rm -f pv_check.js
```
Expected: imprime `SINTAXIS_OK`.

- [ ] **Step 5: Prueba manual en navegador (Chrome/Edge, idealmente Live Server)**

Abre la pestaña **Looper** y comprueba:
- Cada **cabecera** (Canal 1…8) queda **alineada con su carril** del lienzo a la misma altura.
- La **raya de color** de la cabecera coincide con el color de las notas de su carril.
- Funcionan: **● Grabar** (graba ese canal y resalta su cabecera), **🔇 Silenciar**, **🗑 Borrar**,
  **⊞ Cuadrar**, el **slider de volumen**, **🎛** (aprender knob), el **selector de sonido**
  (incluido "📥 Importar sonido…") y **✏️** en un canal con sample.
- La **edición de notas** en el lienzo (arrastrar/borrar con doble clic) cae en el carril correcto.
- El **cabezal** de reproducción cruza todos los carriles.

- [ ] **Step 6: Commit**

```bash
git add pianova.html
git commit -m "Looper: filas de pista (cabecera alineada al carril) — layout base"
```

---

### Task 2: Pulido visual (emil-design-eng + redesign-skill) y responsive móvil

**Files:**
- Modify: `pianova.html` — CSS del Looper (afinar `.lpHead*`) y media queries (≈líneas 135-162).

**Interfaces:**
- Consumes: las clases creadas en Task 1 (`.lpTracks`, `.lpHeads`, `.lpHead`, `.lpHeadTop/Mid/Bot`,
  `.lpName`, `.lpSound`, `.lpVol`, `.rec`).
- Produces: ninguna interfaz nueva; solo estilos.

- [ ] **Step 1: Invocar las skills de diseño para el acabado**

Usa `emil-design-eng` (craft: jerarquía, espaciado, estados hover/active, microinteracción del
botón Grabar) y `redesign-skill` (calidad premium sin romper funcionalidad) como guía para afinar
el bloque CSS `.lpHead*`. Cambios permitidos: tipografía/tamaños, paddings, radios, sombras sutiles,
estado **hover** de la fila, realce de la fila **grabando** (p.ej. borde rojo o pulso suave),
contraste de los botones icono. **Prohibido** cambiar el HTML/JS de Task 1 ni los `data-*`.

- [ ] **Step 2: Añadir reglas responsive del nuevo layout**

Dentro del media query `@media (max-width:860px){ ... }` añade:

```css
    .lpHeads{ flex-basis:150px }
    .lpHead{ --lprow:96px; padding:7px }
    .lpName{ font-size:13px }
    .lpHead .lpHeadBot button{ min-height:34px; font-size:13px }
    .lpHead button.rec{ font-size:12px }
```

Dentro del media query apaisado `@media (max-height:560px) and (orientation:landscape){ ... }` añade:

```css
    .lpHead{ --lprow:64px; gap:4px; padding:5px 7px }
    .lpHeads{ flex-basis:140px }
```

- [ ] **Step 3: Verificar sintaxis**

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('pianova.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('pv_check.js',m.map(x=>x[1]).join('\n;\n'));" && node --check pv_check.js && echo SINTAXIS_OK && rm -f pv_check.js
```
Expected: `SINTAXIS_OK`. (El JS no cambia; este check confirma que no se rompió ningún `<script>`.)

- [ ] **Step 4: Prueba manual escritorio + móvil**

- **Escritorio:** la vista se ve igual o mejor que antes; nada solapado; hover de fila correcto;
  la fila que graba se distingue. Verifica que el resto de la app (modo Aprender) **no cambió**.
- **Móvil/estrecho (DevTools, 360px y apaisado):** cabeceras legibles, controles tocables, carril
  visible; cabecera↔carril siguen alineados; sin desbordes horizontales.

- [ ] **Step 5: Commit**

```bash
git add pianova.html
git commit -m "Looper: pulido visual de las filas de pista + responsive móvil"
```

---

### Task 3: Documentación, versión y publicación

**Files:**
- Modify: `pianova.html` — número de versión visible (buscar el texto de versión actual, p.ej.
  `v1.18`/`v1.19`, y subir a la siguiente).
- Modify: `CLAUDE.md` — sección del Looper (describir el layout de filas de pista) y, si procede,
  la nota del bus maestro (limitador, si se publica junto).
- Modify: `HANDOFF.md` — añadir entrada de versión con el rediseño del Looper (y el limitador).

**Interfaces:**
- Consumes: el trabajo de Task 1 y Task 2 ya verificado.
- Produces: docs al día + commit publicado.

- [ ] **Step 1: Subir el número de versión en `pianova.html`**

Localiza la cadena de versión:
```bash
grep -n "v1\.[0-9]" pianova.html | head
```
Y súbela al siguiente número (p.ej. de `v1.18`/`v1.19` a la siguiente `v1.20`), manteniendo el
formato exacto del texto existente.

- [ ] **Step 2: Actualizar `CLAUDE.md`**

En la sección **Looper / caja de ritmos**, añade una frase indicando que la UI es ahora una pila de
**filas de pista**: cabecera (color, nombre "Canal N", selector de sonido, volumen + 🎛, botones
Grabar/Silenciar/Borrar/Cuadrar, ✏️ sample) a la izquierda, **alineada** con su carril del
`#lpCanvas` a la derecha (`.lpTracks` = `.lpHeads` + `.stage`; alto de fila `--lprow`). Si el
limitador del bus maestro se publica en este mismo empujón, actualiza también esa línea
(`masterOut → 🛡️ limitador → masterFinal → destination`).

- [ ] **Step 3: Actualizar `HANDOFF.md`**

Añade una entrada de versión nueva (la siguiente vXY) describiendo: (a) **rediseño del Looper a
filas de pista** alineadas estilo Ableton (cabecera+carril juntos); (b) si aplica, el **limitador
del bus maestro** que arregla la distorsión al grabar.

- [ ] **Step 4: Verificar sintaxis (por el cambio de versión en el HTML)**

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('pianova.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];fs.writeFileSync('pv_check.js',m.map(x=>x[1]).join('\n;\n'));" && node --check pv_check.js && echo SINTAXIS_OK && rm -f pv_check.js
```
Expected: `SINTAXIS_OK`.

- [ ] **Step 5: Commit y publicar (push a Netlify)**

```bash
git add pianova.html CLAUDE.md HANDOFF.md
git commit -m "Looper estilo pistas: versión vXY + docs (CLAUDE/HANDOFF)"
git push origin main
```
(El push a `main` dispara el auto-deploy de Netlify. Confirmar con el usuario antes de publicar si
prefiere revisarlo en local primero.)

---

## Notas de verificación final (contra el spec)
- Cabecera pegada y **alineada** a su carril → Task 1 (CSS `--lprow` + `.lpTracks`).
- Controles mudados a la cabecera **sin perder funciones** → Task 1 Step 3 (todos los `data-*`).
- **Color carril = color pista** → ya en `lpDraw` (`LP_COLORS[i]`), verificado en Task 1 Step 5.
- **No empeorar escritorio / móvil usable** → Task 2 (pulido + media queries).
- **Renombrar pistas y scroll horizontal**: fuera de alcance (no se implementan).
