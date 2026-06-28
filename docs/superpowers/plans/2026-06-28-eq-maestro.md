# Ecualizador maestro — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un ecualizador al bus maestro con presets musicales (cuerpo/potencia) y la posibilidad de importar un perfil Equalizer APO (.txt), aplicado antes del limitador.

**Architecture:** Una etapa de EQ (preamp + cadena de `BiquadFilterNode`) entre `masterIn` y `fxHP`. Un spec común `{preamp, bands:[{type,freq,gain,q}]}` lo producen tanto los presets (`EQ_PRESETS`) como el parser puro `parseApoEq`. `buildEq(spec)` reconstruye y reconecta la cadena. UI (desplegable + importar) en "Mezcla maestra"; persistido en `store.eq`.

**Tech Stack:** HTML/CSS/JS vanilla en un solo archivo `pianova.html` (IIFE `'use strict'`), Web Audio API. Sin build. Verificación: `node --check` de cada `<script>` + balance de llaves CSS + un test Node del parser (Task 1) + prueba manual en Chrome/Edge (Live Server).

## Global Constraints

- **Un solo archivo** `pianova.html`; sin librerías nuevas; sin build; textos/comentarios en **español**.
- **No empeorar** escritorio ni móvil; **no romper** los efectos actuales (filtro/delay/reverb) ni el limitador/soft-clipper/makeup (v1.26/v1.33).
- El EQ va **antes** del limitador (`masterIn → eqInput → bandas → fxHP`), para que sus realces no produzcan clipping (la pared los contiene).
- Spec común del EQ: `{ preamp:Number(dB), bands:[{ type:'peaking'|'lowshelf'|'highshelf', freq, gain, q }] }`.
- El parser `parseApoEq` se duplica en `docs/superpowers/tests/eq.test.js` a propósito (sin build, no importable); texto idéntico al del HTML.
- Tras implementar: subir `const VERSION` (de v1.33 a v1.34), actualizar `CLAUDE.md` y `HANDOFF.md`. Avisos markdownlint preexistentes: ignorar.
- Verificación base (correr antes de cada commit), desde `d:\PianoVa`:
  ```bash
  node -e "const fs=require('fs');const h=fs.readFileSync('pianova.html','utf8');const css=h.match(/<style>([\s\S]*?)<\/style>/)[1];let o=(css.match(/{/g)||[]).length,c=(css.match(/}/g)||[]).length;console.log('CSS',o,c,o===c?'OK':'MAL');const re=/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;let m,i=0;const cp=require('child_process');while((m=re.exec(h))){if(!m[1].trim())continue;const f=require('os').tmpdir()+'/pv'+i+'.js';fs.writeFileSync(f,m[1]);cp.execSync('node --check '+JSON.stringify(f));i++;}console.log('JS OK',i);"
  ```

---

### Task 1: Parser de perfiles Equalizer APO (`parseApoEq`) — puro, con test

**Files:**
- Create: `docs/superpowers/tests/eq.test.js`
- Modify: `pianova.html` — añadir `parseApoEq` cerca de los otros helpers de audio (p. ej. tras `clampGain`).

**Interfaces:**
- Produces: `parseApoEq(text)` → `{ preamp:Number, bands:[{type,freq,gain,q}] }`.

- [ ] **Step 1: Escribir el test que falla** — crea `docs/superpowers/tests/eq.test.js`:

```js
'use strict';
const assert = require('assert');

// ---- Copia EXACTA de lo que irá en pianova.html ----
function parseApoEq(text) {
  const out = { preamp: 0, bands: [] };
  const num = s => parseFloat(String(s).replace(',', '.'));
  const TYPE = { PK: 'peaking', LS: 'lowshelf', HS: 'highshelf' };
  String(text).split(/\r?\n/).forEach(line => {
    const pre = line.match(/^\s*Preamp:\s*(-?[\d.,]+)\s*dB/i);
    if (pre) { out.preamp = num(pre[1]); return; }
    const f = line.match(/^\s*Filter\s+\d+:\s*ON\s+(PK|LS|HS)\s+Fc\s+([\d.,]+)\s*Hz\s+Gain\s+(-?[\d.,]+)\s*dB\s+Q\s+([\d.,]+)/i);
    if (f) out.bands.push({ type: TYPE[f[1].toUpperCase()], freq: num(f[2]), gain: num(f[3]), q: num(f[4]) });
  });
  return out;
}
// ----------------------------------------------------

const sample = [
  'Preamp: -1,3 dB',
  'Filter 1: ON PK Fc 300 Hz Gain -5,8 dB Q 0,6',
  'Filter 2: OFF PK Fc 600 Hz Gain -1,2 dB Q 1,4',   // OFF -> se ignora
  '',                                                  // línea vacía
  'Filter 3: ON LS Fc 105 Hz Gain 3,0 dB Q 0,7',
  'Filter 7: ON HS Fc 9000 Hz Gain -4,0 dB Q 0,7'
].join('\n');

const r = parseApoEq(sample);
assert.strictEqual(r.preamp, -1.3, 'preamp con coma');
assert.strictEqual(r.bands.length, 3, 'ignora OFF y vacías');
assert.deepStrictEqual(r.bands[0], { type: 'peaking', freq: 300, gain: -5.8, q: 0.6 });
assert.deepStrictEqual(r.bands[1], { type: 'lowshelf', freq: 105, gain: 3.0, q: 0.7 });
assert.deepStrictEqual(r.bands[2], { type: 'highshelf', freq: 9000, gain: -4.0, q: 0.7 });
// texto vacío / basura -> spec neutro
assert.deepStrictEqual(parseApoEq(''), { preamp: 0, bands: [] });
assert.deepStrictEqual(parseApoEq('hola\nmundo'), { preamp: 0, bands: [] });

console.log('eq.test.js OK');
```

- [ ] **Step 2: Correr el test**

Run: `node docs/superpowers/tests/eq.test.js`
Expected: imprime `eq.test.js OK`, código 0.

- [ ] **Step 3: Pegar `parseApoEq` en `pianova.html`** (tras `function clampGain(...)`), con un comentario
  en español. Usa el MISMO texto que el test:

```js
  // Parser de perfiles Equalizer APO (.txt del repo Tal0na/Equalizer-Profiles):
  // 'Preamp: X dB' + 'Filter N: ON PK|LS|HS Fc f Hz Gain g dB Q q'. Decimales con coma. Ignora OFF y
  // tipos no soportados. Devuelve el spec común del EQ.
  function parseApoEq(text) {
    const out = { preamp: 0, bands: [] };
    const num = s => parseFloat(String(s).replace(',', '.'));
    const TYPE = { PK: 'peaking', LS: 'lowshelf', HS: 'highshelf' };
    String(text).split(/\r?\n/).forEach(line => {
      const pre = line.match(/^\s*Preamp:\s*(-?[\d.,]+)\s*dB/i);
      if (pre) { out.preamp = num(pre[1]); return; }
      const f = line.match(/^\s*Filter\s+\d+:\s*ON\s+(PK|LS|HS)\s+Fc\s+([\d.,]+)\s*Hz\s+Gain\s+(-?[\d.,]+)\s*dB\s+Q\s+([\d.,]+)/i);
      if (f) out.bands.push({ type: TYPE[f[1].toUpperCase()], freq: num(f[2]), gain: num(f[3]), q: num(f[4]) });
    });
    return out;
  }
```

- [ ] **Step 4: Verificar** (test + sintaxis base). Expected: `eq.test.js OK`, `CSS .. OK`, `JS OK 2`.

- [ ] **Step 5: Commit**

```bash
git add pianova.html docs/superpowers/tests/eq.test.js
git commit -m "Parser de perfiles Equalizer APO (parseApoEq) puro, con test"
```

---

### Task 2: Motor del EQ (presets + `buildEq` + insertar en el bus + persistencia)

**Files:**
- Modify: `pianova.html` — añadir `EQ_PRESETS`/estado/`buildEq`/`eqApply`/`eqSpecFromStore` (cerca de
  `setupMasterBus`), cambiar la conexión `masterIn.connect(fxHP)` en `setupMasterBus` por `buildEq`,
  y `loadStore`/el `let store = {…}` init (persistir `store.eq`).

**Interfaces:**
- Consumes: `parseApoEq` (Task 1, indirecto), `masterIn`, `fxHP`, `actx`, `store`/`saveStore`.
- Produces: `EQ_PRESETS` (objeto clave→`{label,preamp,bands}`), `currentEq`, `buildEq(spec)`,
  `eqApply(spec)`, `eqSpecFromStore()`, `store.eq = { preset, custom }`.

- [ ] **Step 1: Declarar presets y estado.** Tras `function masterDest()` (o junto a los helpers de
  audio), añade:

```js
  // Presets musicales del EQ maestro (spec común: preamp dB + bandas biquad).
  const EQ_PRESETS = {
    plano:     { label: 'Plano',      preamp: 0, bands: [] },
    cuerpo:    { label: 'Más cuerpo', preamp: 0, bands: [
      { type: 'lowshelf', freq: 120, gain: 4, q: 0.7 }, { type: 'peaking', freq: 2500, gain: 2, q: 1 } ] },
    calido:    { label: 'Cálido',     preamp: 0, bands: [
      { type: 'lowshelf', freq: 120, gain: 3, q: 0.7 }, { type: 'highshelf', freq: 8000, gain: -2.5, q: 0.7 } ] },
    brillante: { label: 'Brillante',  preamp: 0, bands: [
      { type: 'highshelf', freq: 8000, gain: 4, q: 0.7 }, { type: 'peaking', freq: 4000, gain: 1.5, q: 1 } ] },
    loudness:  { label: 'Loudness',   preamp: 0, bands: [
      { type: 'lowshelf', freq: 100, gain: 5, q: 0.7 }, { type: 'highshelf', freq: 9000, gain: 3, q: 0.7 } ] }
  };
  let eqInput = null, eqNodes = [], currentEq = EQ_PRESETS.plano;
```

- [ ] **Step 2: `buildEq` y `eqApply`.** Añade tras lo anterior:

```js
  // (Re)construye la cadena de EQ: masterIn -> eqInput(preamp) -> bandas -> fxHP. Antes del limitador.
  function buildEq(spec) {
    if (!masterIn || !fxHP || !actx) return;
    try { masterIn.disconnect(); } catch (e) {}           // su única salida es la cadena EQ->fxHP
    eqNodes.forEach(n => { try { n.disconnect(); } catch (e) {} });
    eqNodes = [];
    eqInput = actx.createGain();
    eqInput.gain.value = Math.pow(10, (spec.preamp || 0) / 20);
    let last = eqInput;
    (spec.bands || []).forEach(b => {
      const f = actx.createBiquadFilter();
      f.type = b.type; f.frequency.value = b.freq; f.gain.value = b.gain; f.Q.value = b.q;
      last.connect(f); last = f; eqNodes.push(f);
    });
    eqNodes.unshift(eqInput);
    masterIn.connect(eqInput);
    last.connect(fxHP);
  }
  function eqApply(spec) { currentEq = spec || EQ_PRESETS.plano; buildEq(currentEq); }
  // Resuelve el spec activo a partir de store.eq (preset o perfil importado).
  function eqSpecFromStore() {
    const e = (store && store.eq) || {};
    if (e.preset === 'custom' && e.custom) return e.custom;
    return EQ_PRESETS[e.preset] || EQ_PRESETS.plano;
  }
```

- [ ] **Step 3: Insertar el EQ en `setupMasterBus`.** Busca en `setupMasterBus` la línea
  `masterIn.connect(fxHP);` y **reemplázala** por la construcción del EQ con el spec guardado:

```js
    currentEq = eqSpecFromStore();
    buildEq(currentEq);                         // masterIn -> eqInput -> bandas -> fxHP
```
  (El resto de `setupMasterBus` no cambia: `fxHP.connect(fxLP)` etc. siguen igual.)

- [ ] **Step 4: Persistencia de `store.eq`.**
  - En `let store = { songs: {}, prefs: {}, progress: {}, instGain: {} };` añade `eq: { preset: 'plano', custom: null }`:
    `let store = { songs: {}, prefs: {}, progress: {}, instGain: {}, eq: { preset: 'plano', custom: null } };`
  - En `loadStore`, dentro del `if (raw) { … }`, añade: `store.eq = o.eq || { preset: 'plano', custom: null };`
  - `saveStore` ya serializa `store` (no tocar).

- [ ] **Step 5: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 6: Verificación manual** (Live Server, consola): tras crear audio (tocar una nota), en
  consola `eqApply(EQ_PRESETS.loudness)` → el sonido gana graves/agudos de forma audible;
  `eqApply(EQ_PRESETS.plano)` → vuelve a neutro. Los efectos (filtro/delay/reverb) siguen funcionando.
  No hay clipping al realzar. (La UI llega en la Task 3.)

- [ ] **Step 7: Commit**

```bash
git add pianova.html
git commit -m "Motor del EQ maestro: presets + buildEq insertado antes del limitador + persistencia"
```

---

### Task 3: UI del EQ en "Mezcla maestra" (desplegable + importar perfil)

**Files:**
- Modify: `pianova.html` — HTML de la sección `#lpfx`, CSS mínimo, y JS (`refreshEqUI`, handlers del
  desplegable y del import).

**Interfaces:**
- Consumes: `EQ_PRESETS`, `eqApply`, `eqSpecFromStore`, `parseApoEq`, `store`/`saveStore`.
- Produces: `#eqPreset` (select), `#eqImport`/`#eqFile`, `refreshEqUI()`.

- [ ] **Step 1: HTML del control.** En la sección `<div class="lpfx" id="lpfx">` (después del
  `<div id="lpfxRack" …></div>`), añade el grupo de EQ:

```html
        <div class="eqCtl">
          <span class="lpmidiLabel">EQ:</span>
          <select id="eqPreset" aria-label="Ecualizador maestro"></select>
          <button id="eqImport" title="Importar un perfil Equalizer APO (.txt)">📂 Importar perfil EQ</button>
          <input type="file" id="eqFile" accept=".txt,text/plain" hidden>
        </div>
```

- [ ] **Step 2: CSS mínimo.** Tras la regla `.lpfx{…}` añade:

```css
  .eqCtl{display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:10px}
```

- [ ] **Step 3: JS — `refreshEqUI` y handlers.** Cerca del handler de `#lpSampleFile` (o tras
  `buildFxRack`), añade:

```js
  // Rellena el desplegable de EQ (presets + perfil importado) y selecciona el activo.
  function refreshEqUI() {
    const sel = $('eqPreset'); if (!sel) return;
    let html = '';
    for (const k in EQ_PRESETS) html += '<option value="' + k + '">' + EQ_PRESETS[k].label + '</option>';
    const cust = store.eq && store.eq.custom;
    if (cust) html += '<option value="custom">Perfil: ' + (cust.name || 'importado') + '</option>';
    sel.innerHTML = html;
    sel.value = (store.eq && store.eq.preset) || 'plano';
  }
  $('eqPreset').addEventListener('change', e => {
    store.eq.preset = e.target.value; saveStore();
    eqApply(eqSpecFromStore());
  });
  $('eqImport').addEventListener('click', () => $('eqFile').click());
  $('eqFile').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const spec = parseApoEq(await f.text());
      spec.name = f.name.replace(/\.txt$/i, '');
      store.eq.custom = spec; store.eq.preset = 'custom'; saveStore();
      refreshEqUI(); eqApply(eqSpecFromStore());
      status('Perfil EQ cargado: ' + spec.name + ' (' + spec.bands.length + ' bandas).');
    } catch (err) { status('No pude leer el perfil EQ.'); }
  });
```

- [ ] **Step 4: Inicializar la UI al arrancar.** Busca donde se llama `buildFxRack()` en la
  inicialización y añade justo después: `refreshEqUI();`

- [ ] **Step 5: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 6: Verificación manual** (Live Server, pestaña Looper, "Mezcla maestra"): el desplegable
  muestra Plano/Más cuerpo/Cálido/Brillante/Loudness; elegir "Más cuerpo"/"Loudness" cambia el sonido
  (más graves/cuerpo) de forma audible; "Plano" lo deja neutro. **Importar** un .txt Equalizer APO
  (hay perfiles de ejemplo en el repo) → aparece "Perfil: …", se aplica y se selecciona; recargar
  mantiene la selección. No hay clipping al realzar.

- [ ] **Step 7: Commit**

```bash
git add pianova.html
git commit -m "UI del EQ en Mezcla maestra: desplegable de presets + importar perfil APO"
```

---

### Task 4: Versión y documentación

**Files:**
- Modify: `pianova.html` (`const VERSION`), `CLAUDE.md`, `HANDOFF.md`.

- [ ] **Step 1: Subir versión.** `const VERSION = 'v1.33';` → `const VERSION = 'v1.34';` con comentario
  `// ecualizador maestro: presets + importar perfil Equalizer APO`.

- [ ] **Step 2: `HANDOFF.md`.** Subir la línea `**Versión:**` a v1.34 y añadir un bloque "**Ecualizador
  maestro (v1.34):**" explicando (español): etapa de EQ (`buildEq`: `masterIn → eqInput(preamp) →
  bandas biquad → fxHP`) **antes** del limitador; spec común `{preamp,bands}`; 5 presets (`EQ_PRESETS`:
  plano/cuerpo/calido/brillante/loudness); parser `parseApoEq` del formato Equalizer APO (decimales con
  coma, ignora OFF y tipos no soportados); UI en "Mezcla maestra" (`#eqPreset` + `#eqImport`/`#eqFile`,
  `refreshEqUI`); persistido en `store.eq`; el realce lo contiene el limitador/soft-clipper/makeup.

- [ ] **Step 3: `CLAUDE.md`.** En la sección de Audio/Bus maestro, añadir una frase: el bus tiene un
  **EQ maestro** antes del limitador (`buildEq`/`eqApply`, presets `EQ_PRESETS` + importar perfil
  Equalizer APO con `parseApoEq`, UI `#eqPreset` en "Mezcla maestra", persistido en `store.eq`).

- [ ] **Step 4: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 5: Commit**

```bash
git add pianova.html CLAUDE.md HANDOFF.md
git commit -m "EQ maestro v1.34: version y docs"
```

---

## Notas de ejecución
- `buildEq` desconecta `masterIn` (cuya única salida es la cadena EQ→fxHP) y reconstruye; no toca el
  resto del bus (`fxHP→fxLP→masterOut→limiter→makeup→dest`). El primer `buildEq` ocurre en
  `setupMasterBus` (sustituye a `masterIn.connect(fxHP)`).
- `parseApoEq` y su test se duplican a propósito (sin build); texto idéntico.
- Los realces del EQ pueden subir nivel; el limitador + soft-clipper + makeup (v1.26/v1.33) ya lo
  contienen sin clipping duro. Los perfiles APO traen su `Preamp` (suele negativo) para headroom.
- El filtro de 1 perilla (grave↔agudo) y delay/reverb NO se tocan; el EQ es una etapa nueva e
  independiente, anterior a ellos en la cadena.
