# Cabecera superior pro — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a la fila superior (`<header>`) el mismo aire pro que el resto de la app: pestañas segmentadas, Instrumento con etiqueta, chip de conexión con punto de color, Ayuda a icono, y móvil limpio.

**Architecture:** Solo HTML/CSS reutilizando las variables y patrones existentes (`--amber`, `--line`, `.tpLab`), más UN enganche JS mínimo: togglear una clase del chip de conexión según el estado real (`bindInputs`). Sin tocar la lógica de MIDI, instrumento ni pestañas.

**Tech Stack:** HTML/CSS/JS vanilla en un solo archivo `pianova.html` (IIFE `'use strict'`). Sin build. Verificación: `node --check` de cada `<script>` + balance de llaves CSS + prueba visual manual en Chrome/Edge (Live Server). No hay funciones puras nuevas → no hay tests unitarios.

## Global Constraints

- **Un solo archivo** `pianova.html`; sin librerías; sin build; textos/comentarios en **español**.
- **No empeorar el escritorio**; los retoques de tamaño van en media queries.
- Conservar `id`s y handlers: `#instrument`, `#device`, `#help`, `#connect`, `.tab[data-tab]`.
- Reutilizar la línea pro: variables `--amber`/`--line`/`--panel`/`--panel2`/`--ink`/`--muted` y la etiqueta en mayúsculas `.tpLab`.
- El único cambio JS permitido: togglear una clase de estado del chip (`connChip.classList.toggle('on', names.length>0)`) en `bindInputs`. El HTML nace en estado "desconectado".
- Tras implementar: subir `const VERSION` (de v1.30 a v1.31), actualizar `CLAUDE.md` y `HANDOFF.md`.
- Verificación base (correr antes de cada commit), desde `d:\PianoVa`:
  ```bash
  node -e "const fs=require('fs');const h=fs.readFileSync('pianova.html','utf8');const css=h.match(/<style>([\s\S]*?)<\/style>/)[1];let o=(css.match(/{/g)||[]).length,c=(css.match(/}/g)||[]).length;console.log('CSS',o,c,o===c?'OK':'MAL');const re=/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;let m,i=0;const cp=require('child_process');while((m=re.exec(h))){if(!m[1].trim())continue;const f=require('os').tmpdir()+'/pv'+i+'.js';fs.writeFileSync(f,m[1]);cp.execSync('node --check '+JSON.stringify(f));i++;}console.log('JS OK',i);"
  ```

## Estado actual (referencia)

HTML del `<header>` (≈ líneas 341-372):
```html
<header>
  <div class="brand"><b>Piano</b>va <span>aprende tocando</span></div>
  <div class="tabs" role="tablist">
    <button class="tab on" data-tab="learn">Aprender</button>
    <button class="tab" data-tab="looper">Looper</button>
  </div>
  <div class="grow"></div>
  <label class="fld">Instrumento
    <select id="instrument"> …optgroups/options… </select>
  </label>
  <span class="device" id="instInfo"></span>
  <div class="device" id="device">Sin conectar</div>
  <button id="help" title="Ver el tutorial">❔ Ayuda</button>
  <button class="primary" id="connect">Conectar teclado</button>
</header>
```
CSS relevante: `header{display:flex; align-items:center; gap:18px; flex-wrap:wrap; …}` (≈36); `.brand` (≈40); `.grow{flex:1}` (≈44); `.device{font-family:ui-monospace,monospace; font-size:12px; color:var(--muted); border:1px solid var(--line); border-radius:999px; padding:5px 12px; white-space:nowrap}` (≈45); `button{…}` (≈47); `.primary{…}` (≈54); `.tabs{display:flex; gap:6px}` (≈89); `.tab{border:1px solid var(--line); background:var(--panel); color:var(--muted)}` y `.tab.on{background:var(--amber); color:#1a1306; border-color:var(--amber)}` (≈90-94); `label.fld{display:flex; align-items:center; gap:9px; font-size:13px; color:var(--muted)}` (≈214); `@media (max-width:620px){ .brand span{display:none} .device{display:none} }` (≈234).

---

### Task 1: Pestañas segmentadas + grupo Instrumento + Ayuda icono

Restyle estático del header (sin JS). Las pestañas pasan a un control segmentado (una píldora con
dos segmentos pegados), Instrumento a grupo con etiqueta encima, y Ayuda a icono.

**Files:**
- Modify: `pianova.html` — HTML del `<header>` y CSS de cabecera.

**Interfaces:**
- Produces: clases CSS `.hdrCol`, `.hdrLab`, `.hdrIcon`; `.tabs`/`.tab` re-estilados como segmentado.
  La estructura del chip de conexión la añade la Task 2.

- [ ] **Step 1: HTML — pestañas, Instrumento y Ayuda.** En el `<header>`, reemplaza el bloque de
  `<label class="fld">Instrumento …</label>` por un grupo con etiqueta, y `#help` por un icono. Deja
  `<div class="tabs">…</div>` igual (solo cambia su CSS). Resultado del header (mantén `instInfo`,
  `#device` y `#connect` tal cual por ahora — el chip se hace en Task 2):

```html
  <header>
    <div class="brand"><b>Piano</b>va <span>aprende tocando</span></div>
    <div class="tabs" role="tablist">
      <button class="tab on" data-tab="learn">Aprender</button>
      <button class="tab" data-tab="looper">Looper</button>
    </div>
    <div class="grow"></div>
    <div class="hdrCol"><span class="hdrLab">Instrumento</span>
      <select id="instrument">
        <optgroup label="Sintetizados (offline)">
          <option value="synth:piano">🎹 Piano</option>
          <option value="synth:brillante">✨ Piano brillante</option>
          <option value="synth:organo">🎛️ Órgano</option>
          <option value="synth:campanas">🔔 Campanas</option>
          <option value="synth:cuerda">🎻 Cuerda sintética</option>
        </optgroup>
        <optgroup label="Reales (necesitan internet)">
          <option value="sf:acoustic_grand_piano">🎹 Piano de cola</option>
          <option value="sf:electric_piano_1">🎹 Piano eléctrico</option>
          <option value="sf:violin">🎻 Violín</option>
          <option value="sf:cello">🎻 Chelo</option>
          <option value="sf:flute">🪈 Flauta</option>
          <option value="sf:trumpet">🎺 Trompeta</option>
          <option value="sf:acoustic_guitar_nylon">🎸 Guitarra</option>
        </optgroup>
      </select>
    </div>
    <span class="device" id="instInfo"></span>
    <div class="device" id="device">Sin conectar</div>
    <button id="help" class="hdrIcon" title="Ver el tutorial">?</button>
    <button class="primary" id="connect">Conectar teclado</button>
  </header>
```

- [ ] **Step 2: CSS — control segmentado de pestañas.** Reemplaza las reglas `.tabs`/`.tab` actuales
  (≈ líneas 89-94) por un segmentado (píldora contenedora, segmentos pegados, activo en ámbar):

```css
  .tabs{display:inline-flex; gap:0; background:var(--panel); border:1px solid var(--line);
    border-radius:11px; padding:3px}
  .tab{border:0; background:transparent; color:var(--muted); padding:7px 16px; border-radius:8px;
    font-size:14px}
  .tab:hover{color:var(--ink)}
  .tab.on{background:var(--amber); color:#1a1306}
  .tab.on:hover{color:#1a1306}
```

- [ ] **Step 3: CSS — grupo Instrumento y Ayuda icono.** Añade estas reglas justo después de las de
  `.tabs`/`.tab` (las clases nuevas no chocan con nada existente):

```css
  /* Cabecera superior pro: grupo con etiqueta (estilo .tpCol/.tpLab) y botón icono */
  .hdrCol{display:flex; flex-direction:column; align-items:flex-start; gap:3px}
  .hdrLab{font-size:9px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted)}
  .hdrIcon{width:40px; height:40px; padding:0; border-radius:10px; font-size:16px; font-weight:700;
    display:inline-flex; align-items:center; justify-content:center; line-height:1}
```

- [ ] **Step 4: Verificar sintaxis** (comando base de Global Constraints).
  Expected: `CSS <n> <n> OK` y `JS OK 2`.

- [ ] **Step 5: Verificación visual manual** (Live Server): el header muestra las pestañas como un
  segmentado (Aprender activo en ámbar), Instrumento con su etiqueta "INSTRUMENTO" encima del
  desplegable, y Ayuda como icono "?" cuadrado. Cambiar de pestaña Aprender/Looper sigue funcionando
  (la lógica no se tocó). El selector de instrumento cambia el sonido como siempre.

- [ ] **Step 6: Commit**

```bash
git add pianova.html
git commit -m "Cabecera pro: pestañas segmentadas + Instrumento con etiqueta + Ayuda icono"
```

---

### Task 2: Chip de conexión con punto de color

Convertir el estado de conexión en un chip con punto: rojo "Sin conectar" por defecto, verde +
nombre del teclado al conectar. Único cambio JS del plan: togglear la clase del chip en `bindInputs`.

**Files:**
- Modify: `pianova.html` — HTML del `#device` (envolver en chip), CSS del chip, y `bindInputs` (JS).

**Interfaces:**
- Consumes: `bindInputs` (existe), `deviceEl` (`$('device')`), `names` (array de nombres en `bindInputs`).
- Produces: `#connChip` (contenedor del chip) y su clase de estado `.on` (conectado).

- [ ] **Step 1: HTML — envolver `#device` en el chip.** Sustituye la línea
  `<div class="device" id="device">Sin conectar</div>` por:

```html
    <div class="connChip" id="connChip"><span class="dot"></span><span class="device" id="device">Sin conectar</span></div>
```
  (El elemento `#device` conserva su `id` y clase `.device`, así `deviceEl.textContent` sigue igual.
  El chip nace SIN la clase `.on` → estado desconectado, punto rojo.)

- [ ] **Step 2: CSS — chip y punto.** Añade tras las reglas de la Task 1. El chip aporta la píldora;
  dentro, neutraliza el borde/padding heredado de `.device` para no duplicar la píldora:

```css
  /* Chip de estado de conexión: punto rojo (desconectado) / verde (conectado) */
  .connChip{display:inline-flex; align-items:center; gap:7px; border:1px solid var(--line);
    border-radius:999px; padding:5px 12px; background:var(--panel)}
  .connChip .device{border:0; padding:0; border-radius:0; white-space:nowrap}
  .connChip .dot{width:8px; height:8px; border-radius:50%; background:#e0564f;
    box-shadow:0 0 0 3px rgba(224,86,79,.18); flex:0 0 auto}
  .connChip.on .dot{background:#54c08a; box-shadow:0 0 0 3px rgba(84,192,138,.18)}
```

- [ ] **Step 3: JS — enganchar el chip al estado real.** En `bindInputs` (busca
  `midiConnected = names.length > 0;`), añade justo después la línea que togglea la clase del chip:

```js
    midiConnected = names.length > 0;
    { const cc = document.getElementById('connChip'); if (cc) cc.classList.toggle('on', names.length > 0); }
```
  (Esto cubre conectar y desconectar en caliente, porque `access.onstatechange` vuelve a llamar a
  `bindInputs`.)

- [ ] **Step 4: Verificar sintaxis** (comando base). Expected: `CSS <n> <n> OK` y `JS OK 2`.

- [ ] **Step 5: Verificación visual manual** (Live Server): al cargar, el chip muestra un punto
  **rojo** y "Sin conectar". Al pulsar **Conectar teclado** con un teclado MIDI (o, sin teclado, se
  queda en "Ningún dispositivo detectado" con el punto rojo): si hay teclado, el chip pasa a **verde**
  con el/los nombre(s). Desconectar en caliente vuelve a rojo. (Sin teclado físico, al menos confirmar
  el estado rojo inicial y que no rompe nada.)

- [ ] **Step 6: Commit**

```bash
git add pianova.html
git commit -m "Cabecera pro: chip de conexion con punto de color (rojo/verde)"
```

---

### Task 3: Responsive móvil + versión + documentación

Asegurar que la cabecera nueva envuelve limpia en móvil (chip solo-punto en pantalla estrecha) y
cerrar con versión + docs.

**Files:**
- Modify: `pianova.html` (media queries + `const VERSION`), `CLAUDE.md`, `HANDOFF.md`.

**Interfaces:**
- Consumes: `.connChip`/`.device` (Task 2), `.hdrCol`/`.hdrIcon`/`.tabs` (Task 1).

- [ ] **Step 1: CSS móvil — chip solo-punto en <620px.** La regla actual
  `@media (max-width:620px){ .brand span{display:none} .device{display:none} }` ya oculta el texto
  `.device`; como ahora `.device` vive dentro de `.connChip`, eso deja el **punto** visible y oculta
  el texto (objetivo cumplido) y también `instInfo`. Sustitúyela por esta versión explícita (mismo
  efecto, más clara) para no depender de un efecto colateral:

```css
  @media (max-width:620px){ .brand span{display:none} #instInfo{display:none} .connChip .device{display:none} }
```

- [ ] **Step 2: CSS móvil — apretar la cabecera en <860px.** En el bloque `@media (max-width:860px)`
  (busca `header{ padding:10px 14px; gap:10px }` dentro de él), añade tras esa línea un ajuste para que
  el grupo Instrumento y el chip no fuercen desbordes:

```css
    .hdrCol{ gap:2px }
    #instrument{ max-width:46vw }
```

- [ ] **Step 3: Subir versión.** En `const VERSION = 'v1.30';` cámbialo a
  `const VERSION = 'v1.31';` con comentario `// cabecera superior pro (segmentado, chip de conexión)`.

- [ ] **Step 4: Verificar sintaxis** (comando base). Expected: `CSS <n> <n> OK` y `JS OK 2`.

- [ ] **Step 5: Verificación visual manual** (Live Server + DevTools responsive): en móvil estrecho
  (<620px) la cabecera envuelve limpia, el chip muestra solo el punto (sin texto), `instInfo` oculto;
  el selector de instrumento no desborda; pestañas y Conectar siguen táctiles. El escritorio queda
  igual que tras la Task 2.

- [ ] **Step 6: Documentación.** En `HANDOFF.md`, subir la línea `**Versión:**` a v1.31 y añadir un
  bloque "**Cabecera superior pro (v1.31):**" explicando (en español, como las otras entradas):
  pestañas Aprender/Looper como **segmentado** (`.tabs`/`.tab`, solo CSS), **Instrumento** como grupo
  con etiqueta (`.hdrCol`/`.hdrLab`), **chip de conexión** (`.connChip` + `.dot`, rojo/verde, toggle
  de clase `.on` en `bindInputs`), **Ayuda** a icono (`.hdrIcon`), y móvil (<620px chip solo-punto).
  En `CLAUDE.md`, en la sección de Publicación/Responsive o Arquitectura, añadir una frase: la cabecera
  superior sigue la línea pro (segmentado de pestañas, grupo Instrumento, chip de conexión `.connChip`
  con punto rojo/verde enganchado a `bindInputs`); solo HTML/CSS + el toggle de clase del chip.

- [ ] **Step 7: Verificar sintaxis** (comando base) tras editar (solo cambió `pianova.html` en versión;
  docs no afectan). Expected: `CSS <n> <n> OK` y `JS OK 2`.

- [ ] **Step 8: Commit**

```bash
git add pianova.html CLAUDE.md HANDOFF.md
git commit -m "Cabecera pro v1.31: responsive movil + version + docs"
```

---

## Notas de ejecución
- No hay funciones puras nuevas → no hay tests unitarios; la verificación es `node --check` + balance
  de llaves CSS + prueba visual. Es esperado para una tarea HTML/CSS.
- `instInfo` (texto "Instrumento: …") se conserva; solo se oculta en <620px. No es objetivo de este
  ciclo rediseñarlo.
- El botón **Conectar teclado** se mantiene con texto y su `id`/handler intactos (decisión de diseño).
