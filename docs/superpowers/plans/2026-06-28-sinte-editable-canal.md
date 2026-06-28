# Sintetizador editable por canal — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un nuevo sonido de canal "🎛️ Sinte editable" en el Looper con mezcla de osciladores, envolvente ADSR y filtro, ajustable en un panel y guardado por canal.

**Architecture:** Cada canal puede usar `sound:'synthx'` con parámetros propios `channel.synth`. Un motor de voz `synthVoiceAdj` construye 3 osciladores (seno/cuadrada/sierra) → ADSR → filtro biquad, reutilizando `voices`/`synthStopAt`/el agendado con `when`. Un overlay `#synthEd` edita los parámetros en vivo; se persiste en `store.looper` (`saveLooper`).

**Tech Stack:** HTML/CSS/JS vanilla en un solo archivo `pianova.html` (IIFE `'use strict'`), Web Audio (OscillatorNode, BiquadFilterNode). Sin build. Verificación: `node --check` + balance CSS + test Node de funciones puras (Task 1) + prueba manual (Chrome/Edge + móvil, Live Server).

## Global Constraints

- **Un solo archivo** `pianova.html`; sin librerías nuevas; sin build; textos/comentarios en **español**.
- **No romper** los 5 presets synth fijos, los demás sonidos de canal (sf/drum/sample), el agendado fluido (v1.30), la ganancia por canal (v1.32) ni el bus maestro/EQ.
- El sinte editable suena por `masterDest()` con la ganancia del canal por multiplicación (como el synth preset). Solo **canales del Looper** (no el instrumento global).
- Prefijo de ids del editor: **`sy*`** (para no chocar con el editor de samples que usa `se*`). Overlay `#synthEd`.
- `exponentialRampToValueAtTime` nunca a 0 (mínimo 0.0001). Reutilizar `voices`/`synthSilence`/`synthStopAt`.
- Tras implementar: subir `const VERSION` (de v1.35 a v1.36), actualizar `CLAUDE.md` y `HANDOFF.md`. Avisos markdownlint preexistentes: ignorar.
- Verificación base (correr antes de cada commit), desde `d:\PianoVa`:
  ```bash
  node -e "const fs=require('fs');const h=fs.readFileSync('pianova.html','utf8');const css=h.match(/<style>([\s\S]*?)<\/style>/)[1];let o=(css.match(/{/g)||[]).length,c=(css.match(/}/g)||[]).length;console.log('CSS',o,c,o===c?'OK':'MAL');const re=/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;let m,i=0;const cp=require('child_process');while((m=re.exec(h))){if(!m[1].trim())continue;const f=require('os').tmpdir()+'/pv'+i+'.js';fs.writeFileSync(f,m[1]);cp.execSync('node --check '+JSON.stringify(f));i++;}console.log('JS OK',i);"
  ```

---

### Task 1: Helpers puros + modelo + persistencia + opción de sonido

**Files:**
- Create: `docs/superpowers/tests/synth.test.js`
- Modify: `pianova.html` — añadir helpers/`synthDefault` (tras `clampGain`); `rebuildChannelSoundOptions`
  (opción `synthx`); el `change` handler del select (sembrar `channel.synth`); `saveLooper`/`restoreLooper`.

**Interfaces:**
- Produces: `clamp01(v)`, `clampHz(v)` (20–20000), `clampQ(v)` (0.3–20), `clampTime(v)` (0–3);
  `synthDefault()` → `{sine,square,saw,attack,decay,sustain,release,filterType,cutoff,resonance}`.

- [ ] **Step 1: Escribir el test que falla** — crea `docs/superpowers/tests/synth.test.js`:

```js
'use strict';
const assert = require('assert');

// ---- Copia EXACTA de lo que irá en pianova.html ----
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function clampHz(v) { return Math.max(20, Math.min(20000, v)); }
function clampQ(v) { return Math.max(0.3, Math.min(20, v)); }
function clampTime(v) { return Math.max(0, Math.min(3, v)); }
function synthDefault() { return { sine: 0.6, square: 0.0, saw: 0.4, attack: 0.01, decay: 0.3,
  sustain: 0.0, release: 0.2, filterType: 'lowpass', cutoff: 6000, resonance: 1 }; }
// ----------------------------------------------------

assert.strictEqual(clamp01(-1), 0); assert.strictEqual(clamp01(2), 1); assert.strictEqual(clamp01(0.5), 0.5);
assert.strictEqual(clampHz(0), 20); assert.strictEqual(clampHz(99999), 20000); assert.strictEqual(clampHz(440), 440);
assert.strictEqual(clampQ(0), 0.3); assert.strictEqual(clampQ(50), 20); assert.strictEqual(clampQ(2), 2);
assert.strictEqual(clampTime(-1), 0); assert.strictEqual(clampTime(9), 3); assert.strictEqual(clampTime(0.5), 0.5);
const d = synthDefault();
assert.deepStrictEqual(Object.keys(d).sort(), ['attack','cutoff','decay','filterType','resonance','release','saw','sine','square','sustain'].sort());
assert.ok(d.sine >= 0 && d.sine <= 1 && d.saw >= 0 && d.saw <= 1);
assert.strictEqual(d.filterType, 'lowpass');
assert.ok(clampHz(d.cutoff) === d.cutoff && clampQ(d.resonance) === d.resonance);

console.log('synth.test.js OK');
```

- [ ] **Step 2: Correr el test**

Run: `node docs/superpowers/tests/synth.test.js`
Expected: imprime `synth.test.js OK`, código 0.

- [ ] **Step 3: Pegar helpers en `pianova.html`** (tras `function clampGain(...)`), texto idéntico al del test:

```js
  // ---------- Sinte editable por canal (osc blend + ADSR + filtro) ----------
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function clampHz(v) { return Math.max(20, Math.min(20000, v)); }
  function clampQ(v) { return Math.max(0.3, Math.min(20, v)); }
  function clampTime(v) { return Math.max(0, Math.min(3, v)); }
  // Parámetros por defecto de un canal "Sinte editable" (un pluck brillante).
  function synthDefault() { return { sine: 0.6, square: 0.0, saw: 0.4, attack: 0.01, decay: 0.3,
    sustain: 0.0, release: 0.2, filterType: 'lowpass', cutoff: 6000, resonance: 1 }; }
```

- [ ] **Step 4: Opción "Sinte editable" en el selector.** En `rebuildChannelSoundOptions`, dentro del
  optgroup "Sintetizados", tras el `LP_SYNTHS.forEach(...)` y antes de cerrar ese optgroup, añade:
  `html += '<option value="synthx">🎛️ Sinte editable</option>';`

- [ ] **Step 5: Sembrar `channel.synth` al elegir `synthx`.** En el listener `change` de
  `lpChannelsEl` (rama `if (s != null)`), tras `lp.channels[+s].sound = val;` añade:
  `if (val === 'synthx' && !lp.channels[+s].synth) lp.channels[+s].synth = synthDefault();`

- [ ] **Step 6: Persistencia.**
  - En `saveLooper`, en el `.map(c => ({...}))`, añade el campo: `synth: c.synth || null`.
  - En `restoreLooper`, dentro del `L.channels.forEach((c, i) => {...})`, añade:
    `lp.channels[i].synth = c.synth || null;`

- [ ] **Step 7: Verificar** (test + sintaxis base). Expected: `synth.test.js OK`, `CSS .. OK`, `JS OK 2`.

- [ ] **Step 8: Commit**

```bash
git add pianova.html docs/superpowers/tests/synth.test.js
git commit -m "Sinte editable: helpers/synthDefault (con test) + opcion 'synthx' + persistencia"
```

---

### Task 2: Motor de voz `synthVoiceAdj` + integración en `playChannelSound`

**Files:**
- Modify: `pianova.html` — añadir `synthVoiceAdj` (tras `synthStopAt`); rama `synthx` en `playChannelSound`.

**Interfaces:**
- Consumes: `clamp01`/`clampHz`/`clampQ`/`clampTime`/`synthDefault` (Task 1), `voices`, `masterDest`,
  `synthStopAt`, `silence`, `durBeatsToSec`, `lpTempoEl`.
- Produces: `synthVoiceAdj(midi, vel, p, gainMul, when)` → `voices[midi]` (`{o,g,release}`).

- [ ] **Step 1: Añadir `synthVoiceAdj`** tras `function synthStopAt(...)`:

```js
  // Voz de "Sinte editable": 3 osciladores (seno/cuadrada/sierra) -> ADSR -> filtro -> masterDest.
  // Reutiliza voices/synthStopAt/synthSilence y el instante 'when' (agendado). p = channel.synth.
  function synthVoiceAdj(midi, vel, p, gainMul, when) {
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const t = (when == null ? actx.currentTime : when);
    const g = actx.createGain();
    const filt = actx.createBiquadFilter();
    filt.type = (p.filterType === 'bandpass') ? 'bandpass' : 'lowpass';
    filt.frequency.value = clampHz(p.cutoff); filt.Q.value = clampQ(p.resonance);
    g.connect(filt); filt.connect(masterDest());
    const oscs = [];
    [['sine', p.sine], ['square', p.square], ['sawtooth', p.saw]].forEach(pair => {
      if (!(pair[1] > 0)) return;
      const o = actx.createOscillator(); o.type = pair[0]; o.frequency.value = freq;
      const og = actx.createGain(); og.gain.value = clamp01(pair[1]); o.connect(og); og.connect(g);
      oscs.push(o);
    });
    const peak = Math.max(0.0002, (0.16 + 0.22 * vel) * (gainMul == null ? 1 : gainMul));
    const sus = Math.max(0.0001, peak * clamp01(p.sustain));
    const a = Math.max(0.001, clampTime(p.attack)), d = Math.max(0.001, clampTime(p.decay));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(sus, t + a + d);
    oscs.forEach(o => o.start(t));
    voices[midi] = { o: oscs, g, release: Math.max(0.02, clampTime(p.release)) };
    return voices[midi];
  }
```

- [ ] **Step 2: Rama `synthx` en `playChannelSound`.** Justo ANTES del comentario `// synth:<preset>`
  (la línea `const preset = SYNTH[...]`), añade:

```js
    if (sound === 'synthx') {
      const p = ch.synth || synthDefault();
      const voice = synthVoiceAdj(midi, (vel == null ? 0.8 : vel), p, vol, at);
      if (!live) {
        if (at != null) synthStopAt(voice, at + durBeatsToSec(durBeats, parseFloat(lpTempoEl.value)));
        else { const ms = Math.max(80, durBeats * (60 / parseFloat(lpTempoEl.value)) * 1000); setTimeout(() => silence(midi), ms); }
      }
      return;
    }
```

- [ ] **Step 3: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 4: Verificación manual** (Live Server, Looper): poner un canal en "🎛️ Sinte editable",
  grabar/dibujar notas → suenan (pluck por defecto). En consola, `lp.channels[0].synth.saw=0;
  lp.channels[0].synth.sine=1; lp.channels[0].synth.sustain=0.8` → la siguiente nota suena más suave y
  sostenida. Suena fluido (agendado) y sin clipping. Los demás sonidos siguen igual.

- [ ] **Step 5: Commit**

```bash
git add pianova.html
git commit -m "Sinte editable: motor de voz synthVoiceAdj (3 osc + ADSR + filtro) + rama synthx en playChannelSound"
```

---

### Task 3: Editor (overlay `#synthEd`) + botón ✏️ + sliders + probar

**Files:**
- Modify: `pianova.html` — HTML del overlay (junto a `#eqEditor`), CSS, JS (`openSynthEd`/`closeSynthEd`/
  sliders/probar), enrutar el botón `✏️` (`data-edit`) y la tecla Esc.

**Interfaces:**
- Consumes: `synthVoiceAdj`, `synthDefault`, `clamp01`/`clampHz`/`clampQ`/`clampTime`, `silence`,
  `ensureAudio`, `lp.channels`, `saveLooper`/`saveLooperDebounced`, `$`.
- Produces: `#synthEd` overlay, `openSynthEd(ch)`, `closeSynthEd()`, `synthEdCh`.

- [ ] **Step 1: HTML del overlay.** Junto a `<div id="eqEditor" hidden>…</div>` añade:

```html
  <div id="synthEd" hidden>
    <div class="synthEdPanel">
      <div class="synthEdHead">
        <b>Sinte · Canal <span id="synthEdChNum">1</span></b>
        <div class="grow"></div>
        <button id="synthEdTest">▶ Probar</button>
        <button id="synthEdClose" class="primary">✕ Cerrar</button>
      </div>
      <div class="synthEdBody">
        <div class="seGroup"><span class="eqEdLab">Osciladores</span>
          <label class="seRow">Seno <input type="range" id="sySine" min="0" max="1" step="0.01"></label>
          <label class="seRow">Cuadrada <input type="range" id="sySquare" min="0" max="1" step="0.01"></label>
          <label class="seRow">Sierra <input type="range" id="sySaw" min="0" max="1" step="0.01"></label>
        </div>
        <div class="seGroup"><span class="eqEdLab">Envolvente (ADSR)</span>
          <label class="seRow">Ataque <input type="range" id="syA" min="0" max="3" step="0.01"></label>
          <label class="seRow">Decay <input type="range" id="syD" min="0" max="3" step="0.01"></label>
          <label class="seRow">Sustain <input type="range" id="syS" min="0" max="1" step="0.01"></label>
          <label class="seRow">Release <input type="range" id="syR" min="0" max="3" step="0.01"></label>
        </div>
        <div class="seGroup"><span class="eqEdLab">Filtro</span>
          <label class="seRow">Tipo <select id="syFilter"><option value="lowpass">Paso bajo</option><option value="bandpass">Paso banda</option></select></label>
          <label class="seRow">Corte <input type="range" id="syCut" min="20" max="20000" step="1"></label>
          <label class="seRow">Resonancia <input type="range" id="syQ" min="0.3" max="20" step="0.1"></label>
        </div>
      </div>
    </div>
  </div>
```

- [ ] **Step 2: CSS.** Tras las reglas del editor de EQ (`#eqEditor{…}` etc.) añade:

```css
  #synthEd{position:fixed; inset:0; z-index:1200; background:rgba(8,10,14,.92); display:none}
  #synthEd:not([hidden]){display:flex}
  .synthEdPanel{margin:auto; width:min(720px,96vw); max-height:92vh; overflow:auto; background:var(--panel);
    border:1px solid var(--line); border-radius:16px; display:flex; flex-direction:column; padding:14px; gap:12px}
  .synthEdHead{display:flex; align-items:center; gap:10px; flex-wrap:wrap}
  .synthEdBody{display:flex; flex-direction:column; gap:14px}
  .seGroup{display:flex; flex-direction:column; gap:6px; border:1px solid var(--line); border-radius:12px; padding:10px}
  .seRow{display:flex; align-items:center; gap:10px; font-size:13px; color:var(--ink)}
  .seRow input[type=range]{flex:1}
```

- [ ] **Step 3: JS — abrir/cerrar/sliders/probar.** Añade cerca de `openSampleEditor` o del editor de EQ:

```js
  // ---------- Editor del sinte por canal ----------
  let synthEdCh = -1;
  function synthEdFill() {
    const p = lp.channels[synthEdCh] && lp.channels[synthEdCh].synth; if (!p) return;
    $('synthEdChNum').textContent = synthEdCh + 1;
    $('sySine').value = p.sine; $('sySquare').value = p.square; $('sySaw').value = p.saw;
    $('syA').value = p.attack; $('syD').value = p.decay; $('syS').value = p.sustain; $('syR').value = p.release;
    $('syFilter').value = p.filterType; $('syCut').value = p.cutoff; $('syQ').value = p.resonance;
  }
  function openSynthEd(ch) {
    if (!lp.channels[ch]) return;
    if (!lp.channels[ch].synth) lp.channels[ch].synth = synthDefault();
    synthEdCh = ch; synthEdFill(); $('synthEd').hidden = false;
  }
  function closeSynthEd() { $('synthEd').hidden = true; synthEdCh = -1; saveLooper(); }
  // Conectar cada slider/selector a channel.synth (en vivo, persistido debounced)
  (function () {
    const map = { sySine: ['sine', clamp01], sySquare: ['square', clamp01], sySaw: ['saw', clamp01],
      syA: ['attack', clampTime], syD: ['decay', clampTime], syS: ['sustain', clamp01], syR: ['release', clampTime],
      syCut: ['cutoff', clampHz], syQ: ['resonance', clampQ] };
    for (const id in map) {
      const el = $(id); if (!el) continue;
      el.addEventListener('input', () => {
        const p = lp.channels[synthEdCh] && lp.channels[synthEdCh].synth; if (!p) return;
        p[map[id][0]] = map[id][1](parseFloat(el.value)); saveLooperDebounced();
      });
    }
    const ft = $('syFilter'); if (ft) ft.addEventListener('change', () => {
      const p = lp.channels[synthEdCh] && lp.channels[synthEdCh].synth; if (!p) return;
      p.filterType = (ft.value === 'bandpass') ? 'bandpass' : 'lowpass'; saveLooperDebounced();
    });
    const tb = $('synthEdTest'); if (tb) tb.addEventListener('click', () => {
      ensureAudio(); const p = lp.channels[synthEdCh] && lp.channels[synthEdCh].synth; if (!p) return;
      synthVoiceAdj(60, 0.9, p, (lp.channels[synthEdCh].vol != null ? lp.channels[synthEdCh].vol : 1), null);
      setTimeout(() => silence(60), 600);
    });
    const cb = $('synthEdClose'); if (cb) cb.addEventListener('click', closeSynthEd);
  })();
```

- [ ] **Step 4: Enrutar el botón ✏️.** En el listener de clic de `lpChannelsEl`, la rama
  `} else if (ev.target.dataset.edit != null) {` contiene una sola línea:
  `openSampleEditor(+ev.target.dataset.edit);`. **Reemplaza solo esa línea** (sin tocar el `} else if (...) {`
  ni su `}`) por:

```js
      const i = +ev.target.dataset.edit;
      if (lp.channels[i] && lp.channels[i].sound === 'synthx') openSynthEd(i);
      else openSampleEditor(i);
```

- [ ] **Step 5: Esc cierra el overlay.** En el `keydown` que cierra `#eqEditor`/`#pianoroll`, añade antes:
  `if (ev.key === 'Escape' && !$('synthEd').hidden) { closeSynthEd(); return; }`

- [ ] **Step 6: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 7: Verificación manual** (Chrome/Edge + móvil, Live Server): canal en "🎛️ Sinte editable" →
  pulsar **✏️** abre el editor; mover **osc/ADSR/filtro** y pulsar **▶ Probar** → se oye el cambio;
  grabar notas y oír el sonido editado; **✕**/Esc cierra; **recargar** mantiene el sonido del canal.
  En móvil el panel envuelve/scrollea sin solapar. Los canales sample siguen abriendo su editor con ✏️.

- [ ] **Step 8: Commit**

```bash
git add pianova.html
git commit -m "Sinte editable: editor overlay #synthEd (osc/ADSR/filtro + probar) + enrutado ✏️ + Esc"
```

---

### Task 4: Versión y documentación

**Files:**
- Modify: `pianova.html` (`const VERSION`), `CLAUDE.md`, `HANDOFF.md`.

- [ ] **Step 1: Subir versión.** `const VERSION = 'v1.35';` → `const VERSION = 'v1.36';` con comentario
  `// sinte editable por canal (osc blend + ADSR + filtro) en el Looper`.

- [ ] **Step 2: `HANDOFF.md`.** Subir `**Versión:**` a v1.36 y añadir un bloque "**Sinte editable por
  canal (v1.36):**" explicando (español): sonido de canal `'synthx'` con `channel.synth` (osc blend
  seno/cuadrada/sierra, ADSR con nivel de sustain, filtro LP/BP + corte + resonancia); motor de voz
  `synthVoiceAdj` (3 osc → ADSR → biquad → masterDest) que reutiliza `voices`/`synthStopAt`/agendado;
  rama `synthx` en `playChannelSound`; editor overlay `#synthEd` (ids `sy*`, abierto con ✏️ en canales
  synthx, botón "▶ Probar"); persistido en `store.looper` (`saveLooper`). Inspirado en `RFullum/GrooveBox`.

- [ ] **Step 3: `CLAUDE.md`.** En la sección del Looper/Audio, añadir una frase: cada canal del Looper
  puede ser un **sinte editable** (`sound:'synthx'`, `channel.synth`: osc blend + ADSR + filtro;
  motor `synthVoiceAdj`; editor `#synthEd` con ✏️); los 5 presets synth fijos siguen disponibles.

- [ ] **Step 4: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 5: Commit**

```bash
git add pianova.html CLAUDE.md HANDOFF.md
git commit -m "Sinte editable por canal v1.36: version y docs"
```

---

## Notas de ejecución
- `synthVoiceAdj` reutiliza el contrato de `synthNoteOn` (`voices[midi]={o,g,release}`), así que
  `synthSilence`/`synthStopAt` y el agendado funcionan sin cambios.
- El editor usa prefijo `sy*` para no chocar con el editor de samples (`se*`). El botón ✏️ existente se
  enruta por tipo de sonido (`synthx` → sinte; resto → sample).
- Los helpers puros se duplican en `docs/superpowers/tests/synth.test.js` a propósito (sin build); texto
  idéntico al del HTML.
- Solo canales del Looper; el instrumento global de Aprender no cambia. Presets synth fijos intactos.
- Realces fuertes (resonancia alta) los contiene el limitador/soft-clipper/makeup del bus.
