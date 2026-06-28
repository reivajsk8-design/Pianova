# Ganancia ajustable de los sonidos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir dar ganancia 0–300% (100% = normal) a cada canal del Looper y al instrumento global (este último por instrumento, guardado), para igualar intensidades de sonidos flojos y fuertes.

**Architecture:** En el Looper, la ganancia se aplica multiplicando el nivel por tipo (synth/sample suben del todo; sf/batería hasta su máximo de velocity). El instrumento global se enruta por un nodo `instGain` y guarda su ganancia por instrumento (`store.instGain[clave]`). El limitador + soft-clipper del bus maestro (v1.26) evita el clipping.

**Tech Stack:** HTML/CSS/JS vanilla en un solo archivo `pianova.html` (IIFE `'use strict'`), Web Audio API, `smplr` por CDN. Sin build. Verificación: `node --check` de cada `<script>` + balance de llaves CSS + un test Node de funciones puras (Task 1) + prueba manual en Chrome/Edge (Live Server).

## Global Constraints

- **Un solo archivo** `pianova.html`; sin librerías nuevas; sin build; textos/comentarios en **español**.
- **No empeorar** escritorio ni móvil; no tocar la pedagogía ni la dinámica musical (velocity).
- `GAIN_MAX = 3` (300%); unidad = `1`. El bus maestro (limitador + soft-clipper) NO se toca.
- Reutilizar: `makeFader`, `playChannelSound`, `synthNoteOn` (firma actual `(midi,vel,preset,gainMul,when)`), `noteOn`/`noteOnAt`, `sampleNoteOn`, `loadSoundfont`/`sfPlayer`, `setChannelVolFromCC`, `applyInstrument`, `masterDest`, `store`/`saveStore`/`loadStore`, `saveLooper`/`restoreLooper`.
- **Separación clave:** el reproductor `sf` del instrumento **global** es PROPIO (destino `instGain`); los canales del Looper siguen usando `sfCache[name] → masterDest` (compartido). No mezclar ambos.
- **Compatibilidad:** los `vol` de canal ya guardados se cargan tal cual; los canales nuevos nacen a `1` (100%). Sin ganancia guardada para un instrumento = `1`.
- Tras implementar: subir `const VERSION` (de v1.31 a v1.32), actualizar `CLAUDE.md` y `HANDOFF.md`. Avisos markdownlint preexistentes: ignorar.
- Verificación base (correr antes de cada commit), desde `d:\PianoVa`:
  ```bash
  node -e "const fs=require('fs');const h=fs.readFileSync('pianova.html','utf8');const css=h.match(/<style>([\s\S]*?)<\/style>/)[1];let o=(css.match(/{/g)||[]).length,c=(css.match(/}/g)||[]).length;console.log('CSS',o,c,o===c?'OK':'MAL');const re=/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;let m,i=0;const cp=require('child_process');while((m=re.exec(h))){if(!m[1].trim())continue;const f=require('os').tmpdir()+'/pv'+i+'.js';fs.writeFileSync(f,m[1]);cp.execSync('node --check '+JSON.stringify(f));i++;}console.log('JS OK',i);"
  ```

---

### Task 1: Ganancia de canal en el Looper (0–300%) + helpers puros

Ampliar el volumen de canal a ganancia 0–300% y aplicarla. Incluye un helper puro `clampGain` y la
nueva fórmula del knob CC, ambos con test Node.

**Files:**
- Create: `docs/superpowers/tests/gain.test.js`
- Modify: `pianova.html` — añadir `GAIN_MAX`/`clampGain` (cerca de los otros helpers de audio, p. ej.
  tras `durBeatsToSec`), el fader de canal (`lpBuildChannelUI`, donde se crea `makeFader({ key:'vol:'…})`),
  la rama `sample` de `playChannelSound`, y `setChannelVolFromCC`.

**Interfaces:**
- Produces: `GAIN_MAX = 3`; `clampGain(v)` → `number` (acota a `[0, GAIN_MAX]`).

- [ ] **Step 1: Escribir el test que falla** — crea `docs/superpowers/tests/gain.test.js`:

```js
'use strict';
const assert = require('assert');

// ---- Copia EXACTA de lo que irá en pianova.html ----
const GAIN_MAX = 3;
function clampGain(v) { return Math.max(0, Math.min(GAIN_MAX, v)); }
function ccToGain(ccVal) { return clampGain((ccVal / 127) * GAIN_MAX); }   // 0..127 -> 0..3
// ----------------------------------------------------

assert.strictEqual(clampGain(-1), 0);
assert.strictEqual(clampGain(0), 0);
assert.strictEqual(clampGain(1), 1);
assert.strictEqual(clampGain(2.5), 2.5);
assert.strictEqual(clampGain(5), 3);            // se acota al máximo
assert.strictEqual(ccToGain(0), 0);
assert.strictEqual(ccToGain(127), 3);           // tope del knob = 300%
assert.ok(Math.abs(ccToGain(64) - 1.512) < 0.01);   // ~mitad

console.log('gain.test.js OK');
```

- [ ] **Step 2: Correr el test**

Run: `node docs/superpowers/tests/gain.test.js`
Expected: imprime `gain.test.js OK`, código 0.

- [ ] **Step 3: Añadir `GAIN_MAX` y `clampGain` en `pianova.html`** (tras `function durBeatsToSec(...)`):

```js
  // Ganancia de sonidos: 1 = 100% (normal); hasta GAIN_MAX = 3 (300%) para subir flojos.
  const GAIN_MAX = 3;
  function clampGain(v) { return Math.max(0, Math.min(GAIN_MAX, v)); }
```

- [ ] **Step 4: Ampliar el fader de canal a 0–300%.** En `lpBuildChannelUI` (la llamada
  `makeFader({ key: 'vol:' + i, min: 0, max: 1, step: 0.05, def: 0.85, … })`), cambia `max` y `def`:

```js
      const f = makeFader({ key: 'vol:' + i, min: 0, max: GAIN_MAX, step: 0.05, def: 1, value: vol,
        color: LP_COLORS[i], fmt: v => Math.round(v * 100),
        onInput: v => { lp.channels[i].vol = v; saveLooperDebounced(); } });
```

- [ ] **Step 5: Quitar el recorte a 1.0 del sample** en `playChannelSound` (rama `sample:`). Sustituye
  `const g = actx.createGain(); g.gain.value = Math.max(0, Math.min(1, v));` por:

```js
        const g = actx.createGain(); g.gain.value = Math.max(0, v);   // permite ganancia > 100%
```

- [ ] **Step 6: Knob CC al rango 0–300%** en `setChannelVolFromCC`. Sustituye
  `const v = Math.max(0, Math.min(1, val / 127));` por:

```js
    const v = clampGain((val / 127) * GAIN_MAX);   // 0..127 -> 0..300%
```

- [ ] **Step 7: Verificar** (test + sintaxis base). Expected: `gain.test.js OK`, `CSS .. OK`, `JS OK 2`.

- [ ] **Step 8: Verificación manual** (Live Server, Looper): poner un canal **synth** y otro **sample**;
  subir su fader por encima de 100% → se oye más fuerte; bajar otro → se equilibra. Recargar mantiene
  los niveles. (Para canales `sf`/batería, el fader sube hasta su máximo; es lo esperado.)

- [ ] **Step 9: Commit**

```bash
git add pianova.html docs/superpowers/tests/gain.test.js
git commit -m "Ganancia de canal en el Looper 0-300% (synth/sample completo, sf/bateria al maximo) + helpers con test"
```

---

### Task 2: Motor de ganancia del instrumento global (nodo `instGain` + por instrumento)

Enrutar el instrumento global por un nodo `instGain` y aplicar su ganancia. La ganancia se guarda
**por instrumento** y se carga al cambiar de instrumento. (La UI del control va en la Task 3; aquí el
motor + persistencia, verificable poniendo `store.instGain` a mano.)

**Files:**
- Modify: `pianova.html` — `setupMasterBus` (crear `instGain`), variables de estado, `loadSoundfont`
  (reproductor global propio con destino `instGain`), `noteOn` y `noteOnAt` (synth/sample con
  `currentInstGain`), `applyInstrument` (cargar la ganancia del instrumento), `loadStore`/`saveStore`
  y la inicialización de `store` (persistir `store.instGain`).

**Interfaces:**
- Consumes: `clampGain` (Task 1), `masterDest`, `currentInstrument`, `SYNTH`, `samples`, `sfPlayer`.
- Produces: `instGain` (GainNode), `let currentInstGain` (number, 1 por defecto), `applyInstGain()`,
  `store.instGain` (objeto clave→ganancia). Clave = `value` del `<select id="instrument">`.

- [ ] **Step 1: Declarar estado.** Junto a `let sfPlayer = null;` (~línea 937) añade:

```js
  let instGain = null;          // nodo de ganancia del instrumento global (Aprender/Escuchar)
  let currentInstGain = 1;      // ganancia activa del instrumento global (1 = 100%)
  const globalSf = {};          // reproductores sf PROPIOS del global (destino instGain), por nombre
```

- [ ] **Step 2: Crear `instGain` y `applyInstGain`.** En `setupMasterBus`, tras crear `masterIn`
  (`masterIn = actx.createGain();`), añade la creación del nodo conectado al bus:

```js
    instGain = actx.createGain(); instGain.connect(masterIn);   // instrumento global -> bus maestro
```
  Y añade la función (cerca de `setupMasterBus`, fuera de ella):

```js
  // Aplica la ganancia activa del instrumento global a su nodo (afecta a sf; synth/sample multiplican).
  function applyInstGain() { if (instGain) instGain.gain.value = currentInstGain; }
```

- [ ] **Step 3: `loadSoundfont` crea reproductor global propio (destino `instGain`).** Sustituye en
  `loadSoundfont` la línea `const player = await ensureSoundfont(name);` por la carga dedicada:

```js
      ensureAudio();                        // asegura actx + bus (instGain creado en setupMasterBus)
      let player = globalSf[name];
      if (!player) {
        const { Soundfont } = await import('https://esm.sh/smplr@0.26.0');
        player = Soundfont(actx, { instrument: name, destination: instGain || masterDest() });
        await player.load;
        globalSf[name] = player;
      }
```
  (El reproductor del global va por `instGain`; los canales del Looper siguen con `sfCache`/`masterDest`.)

- [ ] **Step 4: Aplicar `currentInstGain` al synth y sample del global.**
  - En `noteOn`, rama synth, pasa la ganancia como `gainMul`:
    `synthNoteOn(midi, vel, SYNTH[currentInstrument.preset] || SYNTH.piano, currentInstGain);`
  - En `sampleNoteOn`, multiplica la ganancia del gain del buffer:
    `const g = actx.createGain(); g.gain.value = Math.max(0.0002, 0.9 * (vel == null ? 0.8 : vel) * currentInstGain);`
  - En `noteOnAt`, rama synth: `synthNoteOn(midi, (vel == null ? 0.8 : vel), SYNTH[currentInstrument.preset] || SYNTH.piano, currentInstGain, when);`
  - En `noteOnAt`, rama sample: `const g = actx.createGain(); g.gain.value = Math.max(0.0002, 0.9 * (vel == null ? 0.8 : vel) * currentInstGain);`
  - El **sf** del global no multiplica: su nivel lo da `instGain.gain` (paso 2/3).

- [ ] **Step 5: Cargar la ganancia por instrumento al cambiar de instrumento.** Al **principio** de
  `applyInstrument(value)` (tras `const parts = value.split(':');` o justo antes), añade:

```js
    currentInstGain = (store.instGain && store.instGain[value] != null) ? store.instGain[value] : 1;
    applyInstGain();
```

- [ ] **Step 6: Persistencia de `store.instGain`.** 
  - En la inicialización `let store = { songs: {}, prefs: {}, progress: {} };` añade `instGain: {}`:
    `let store = { songs: {}, prefs: {}, progress: {}, instGain: {} };`
  - En `loadStore`, dentro del `if (raw) { … }`, añade: `store.instGain = o.instGain || {};`
  - `saveStore` ya hace `JSON.stringify(store)`, así que `store.instGain` se guarda solo. No tocar.

- [ ] **Step 7: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 8: Verificación manual** (Live Server, consola): elegir **Violín** (real) en el selector
  de Instrumento; en la consola del navegador, `store.instGain['sf:violin']=2.5` y volver a elegir
  Violín (o ejecutar `applyInstGain()` tras fijar `currentInstGain=2.5`) → en Escuchar/al tocar, el
  violín suena más fuerte. Elegir Piano sintetizado y subir `currentInstGain` también lo sube. Recargar
  conserva `store.instGain`. (La UI llega en la Task 3; aquí basta con la consola.)

- [ ] **Step 9: Commit**

```bash
git add pianova.html
git commit -m "Motor de ganancia del instrumento global: nodo instGain + ganancia por instrumento (persistida)"
```

---

### Task 3: Control de ganancia del instrumento global en la cabecera

Widget de % compacto y arrastrable junto al selector de Instrumento, que edita la ganancia del
instrumento activo (patrón del BPM grande).

**Files:**
- Modify: `pianova.html` — HTML del `<header>` (junto a `.hdrCol` de Instrumento), CSS mínimo, y JS
  (`setInstGain`, arrastre/doble-clic, y refresco al cambiar de instrumento en `applyInstrument`).

**Interfaces:**
- Consumes: `currentInstGain`, `applyInstGain`, `clampGain`, `store`/`saveStore`, `instSel` (el
  `<select id="instrument">`), `applyInstrument`.
- Produces: `#instGainNum` (número visible), `setInstGain(v)`, `refreshInstGainUI()`.

- [ ] **Step 1: HTML del control.** En el `<header>`, justo después del grupo de Instrumento
  (`<div class="hdrCol"><span class="hdrLab">Instrumento</span><select id="instrument">…</select></div>`),
  añade otro grupo:

```html
    <div class="hdrCol"><span class="hdrLab">Ganancia</span>
      <span class="tpBpm" id="instGainWrap" title="Doble-clic para escribir · arrastrar ↕ para cambiar"><b id="instGainNum">100</b>%</span>
    </div>
```

- [ ] **Step 2: CSS mínimo.** Tras las reglas `.hdrCol`/`.hdrLab`/`.hdrIcon` añade un tamaño menor para
  el número de ganancia (reutiliza `.tpBpm` pero más compacto en la cabecera):

```css
  #instGainWrap b{font-size:18px}
```

- [ ] **Step 3: JS — `setInstGain` y `refreshInstGainUI`.** Cerca del handler de `#instrument` (busca
  `applyInstrument`), añade:

```js
  // Ganancia del instrumento global: número arrastrable (patrón del BPM). v en 0..GAIN_MAX (×).
  const instGainWrap = $('instGainWrap');
  function refreshInstGainUI() { const n = $('instGainNum'); if (n) n.textContent = Math.round(currentInstGain * 100); }
  function setInstGain(v) {
    currentInstGain = clampGain(v);
    applyInstGain();
    refreshInstGainUI();
    if (instSel) { store.instGain[instSel.value] = currentInstGain; saveStore(); }
  }
  if (instGainWrap) {
    instGainWrap.addEventListener('dblclick', () => {
      const r = prompt('Ganancia (0-300%):', Math.round(currentInstGain * 100));
      if (r != null && !isNaN(parseFloat(r))) setInstGain(parseFloat(r) / 100);
    });
    let igDrag = null;
    instGainWrap.addEventListener('pointerdown', e => { igDrag = { y: e.clientY, v: currentInstGain }; e.preventDefault(); });
    window.addEventListener('pointermove', e => { if (igDrag) setInstGain(igDrag.v + (igDrag.y - e.clientY) * 0.01); });
    window.addEventListener('pointerup', () => igDrag = null);
  }
```
  (El factor `0.01` ≈ 1% por píxel; arrastrar arriba sube.)

- [ ] **Step 4: Refrescar el número al cambiar de instrumento.** Al final de `applyInstrument(value)`
  (que ya fija `currentInstGain` y llama `applyInstGain` por la Task 2), añade el refresco del número:
  `if (typeof refreshInstGainUI === 'function') refreshInstGainUI();`

- [ ] **Step 5: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 6: Verificación manual** (Live Server): junto a Instrumento aparece "GANANCIA 100%".
  Arrastrar ↕ sobre el número lo cambia (y se oye); doble-clic permite escribirlo. Cambiar de
  instrumento muestra la ganancia guardada de ese instrumento; volver al anterior la recuerda.
  Recargar mantiene cada ganancia. En móvil la cabecera no se solapa.

- [ ] **Step 7: Commit**

```bash
git add pianova.html
git commit -m "Control de ganancia del instrumento global en la cabecera (arrastrar/doble-clic, por instrumento)"
```

---

### Task 4: Versión y documentación

**Files:**
- Modify: `pianova.html` (`const VERSION`), `CLAUDE.md`, `HANDOFF.md`.

- [ ] **Step 1: Subir versión.** `const VERSION = 'v1.31';` → `const VERSION = 'v1.32';` con comentario
  `// ganancia ajustable de los sonidos (0-300%) por canal y por instrumento`.

- [ ] **Step 2: `HANDOFF.md`.** Subir la línea `**Versión:**` a v1.32 y añadir un bloque
  "**Ganancia de los sonidos (v1.32):**" explicando (español): canal del Looper 0–300%
  (`makeFader max:GAIN_MAX def:1`; synth/sample completo quitando el recorte del sample; sf/batería al
  máximo de velocity; knob CC 0–300%); instrumento global por nodo `instGain` con ganancia **por
  instrumento** (`store.instGain[clave]`, `currentInstGain`, `applyInstGain`; sf global con reproductor
  propio `globalSf` con destino `instGain`); control de % arrastrable en la cabecera (`#instGainWrap`/
  `setInstGain`); el clipping lo contiene el limitador v1.26. Pendiente conocido: sf/batería en el
  Looper no superan su máximo (reproductor compartido) → se resolverá con "instrumento por canal".

- [ ] **Step 3: `CLAUDE.md`.** En la sección de Audio/Arquitectura, añadir una frase: la ganancia de
  los sonidos es ajustable 0–300% — por canal en el Looper (synth/sample completo, sf/batería al máximo)
  y por instrumento en el global (`instGain`/`currentInstGain`/`store.instGain`, control `#instGainWrap`);
  el bus maestro (limitador + soft-clipper v1.26) evita el clipping.

- [ ] **Step 4: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 5: Commit**

```bash
git add pianova.html CLAUDE.md HANDOFF.md
git commit -m "Ganancia de los sonidos v1.32: version y docs"
```

---

## Notas de ejecución
- `synthNoteOn` ya escala por `gainMul` y `noteOnAt`/`sampleNoteOn` se modifican para multiplicar por
  `currentInstGain`: el instrumento global sube **del todo** para synth/sample por multiplicación y para
  `sf` por el nodo `instGain`. No hace falta añadir un parámetro de destino a `synthNoteOn`.
- El reproductor `sf` del **global** (`globalSf`, destino `instGain`) es independiente del `sfCache` de
  los **canales** del Looper (destino `masterDest`). No unificarlos en este ciclo.
- Subir a 300% puede saturar; lo contiene el limitador + soft-clipper del bus (v1.26). No añadir nada.
- `clampGain`/`GAIN_MAX` se duplican en `docs/superpowers/tests/gain.test.js` a propósito (sin build, no
  son importables); el texto del test debe ser idéntico al del HTML.
