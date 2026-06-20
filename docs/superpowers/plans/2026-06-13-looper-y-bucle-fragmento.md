# Bucle de fragmento + Looper — Plan de implementación

> **Para quien ejecute:** plan pensado para `pianova.html` (archivo único, sin build, sin
> tests automáticos, sin git). Cada tarea se verifica **a mano en Chrome/Edge** (ideal con
> Live Server). Marca cada paso `- [ ]` al completarlo.

**Objetivo:** añadir (1) un bucle de fragmento al modo Practicar y (2) una pestaña Looper
tipo loop-station sencilla, manteniendo el archivo único y legible.

**Arquitectura:** todo dentro del IIFE existente en `pianova.html`. Se añaden dos pestañas
(Aprender / Looper) que muestran/ocultan zonas y comparten teclado, audio (`noteOn`/`silence`)
y entrada MIDI. El looper tiene su propio reloj en beats, estado de canales y render en un
segundo `<canvas>`.

**Stack:** HTML + CSS + JS vanilla, Web Audio, Web MIDI. Sin dependencias.

**Spec:** `docs/superpowers/specs/2026-06-13-looper-y-bucle-fragmento-design.md`

---

## Estructura de archivos

Solo se toca `pianova.html`. Orden de bloques dentro del `<script>`:
- Nuevo estado de **bucle de fragmento** junto al estado de Practicar.
- Nuevo bloque **Looper**: estado, audio del metrónomo, grabación, reproducción, render.
- HTML: barra de pestañas + controles de fragmento + sección Looper (oculta por defecto).
- CSS: estilos de pestañas, controles y canales.

Convención: cada bloque nuevo separado con `// ---------- ... ----------`, comentarios en español.

---

# PARTE A — Bucle de fragmento (modo Practicar)

### Tarea A1: Controles de fragmento en el HTML

**Archivos:** Modificar `pianova.html` (barra `.controls`, tras el botón Reiniciar).

- [ ] **Paso 1:** Añadir dentro de `.controls`, después de `<button id="reset">Reiniciar</button>`:

```html
    <div class="loopbar" id="loopbar">
      <button id="loopStart">Inicio aquí</button>
      <button id="loopEnd" disabled>Fin aquí</button>
      <button id="loopClear" disabled>Quitar bucle</button>
      <span class="loopinfo" id="loopInfo"></span>
    </div>
```

- [ ] **Paso 2:** Añadir CSS en `<style>` (junto a `.seg`):

```css
  .loopbar{display:flex; align-items:center; gap:8px}
  .loopinfo{font-family:ui-monospace,monospace; font-size:12px; color:var(--muted)}
  button:disabled{opacity:.4; cursor:not-allowed}
```

- [ ] **Paso 3 (probar):** Abrir en Chrome/Edge. Se ven los 3 botones; "Fin aquí" y
  "Quitar bucle" salen atenuados (disabled). No hacen nada todavía: correcto.

---

### Tarea A2: Estado del fragmento y cableado de botones

**Archivos:** Modificar `pianova.html` (`<script>`).

- [ ] **Paso 1:** En la sección `// ---------- Estado ----------`, añadir:

```js
  // Bucle de fragmento (modo Practicar)
  let loopStart = null, loopEnd = null, loopOn = false, loopRounds = 0;
```

- [ ] **Paso 2:** En `// ---------- DOM ----------`, añadir referencias:

```js
  const loopStartBtn = $('loopStart');
  const loopEndBtn = $('loopEnd');
  const loopClearBtn = $('loopClear');
  const loopInfo = $('loopInfo');
```

- [ ] **Paso 3:** Añadir helper que refresca los botones/etiqueta del fragmento:

```js
  function refreshLoopUI() {
    const has = loopStart != null;
    loopEndBtn.disabled = !has;
    loopClearBtn.disabled = !(loopStart != null || loopEnd != null);
    if (loopOn && loopStart != null && loopEnd != null) {
      loopInfo.textContent = 'Bucle ' + solfege(notes[loopStart].midi) + '→' +
        solfege(notes[loopEnd].midi) + ' · vueltas ' + loopRounds;
    } else if (loopStart != null) {
      loopInfo.textContent = 'Inicio marcado (' + solfege(notes[loopStart].midi) + ')';
    } else {
      loopInfo.textContent = '';
    }
  }
```

- [ ] **Paso 4:** En `// ---------- Conexiones UI ----------`, cablear los botones:

```js
  loopStartBtn.addEventListener('click', () => {
    if (mode !== 'practice' || !notes.length) return;
    loopStart = Math.min(idx, notes.length - 1);
    loopEnd = null; loopOn = false; loopRounds = 0;
    refreshLoopUI();
  });
  loopEndBtn.addEventListener('click', () => {
    if (loopStart == null) return;
    loopEnd = Math.min(idx, notes.length - 1);
    if (loopEnd < loopStart) { const t = loopStart; loopStart = loopEnd; loopEnd = t; }
    loopOn = true; loopRounds = 0;
    refreshLoopUI();
  });
  loopClearBtn.addEventListener('click', () => {
    loopStart = loopEnd = null; loopOn = false; loopRounds = 0;
    refreshLoopUI();
  });
```

- [ ] **Paso 5:** En `reset()`, limpiar el fragmento (añadir al final de la función, antes
  de los `status(...)`):

```js
    loopStart = loopEnd = null; loopOn = false; loopRounds = 0;
    refreshLoopUI();
```

- [ ] **Paso 6 (probar):** En modo Practicar, pulsar Empezar y tocar una nota para avanzar
  `idx`. Pulsar "Inicio aquí": la etiqueta muestra "Inicio marcado (...)" y "Fin aquí" se
  habilita. Avanzar otra nota y pulsar "Fin aquí": muestra "Bucle X→Y · vueltas 0".
  "Quitar bucle" lo borra. Cambiar de canción o pulsar Reiniciar también lo borra.

---

### Tarea A3: Lógica del bucle al acertar

**Archivos:** Modificar `pianova.html` — función `judge()`, rama `mode === 'practice'`.

- [ ] **Paso 1:** Sustituir el bloque de acierto en `judge()`:

  Buscar:
```js
      if (waiting && notes[idx] && notes[idx].midi === midi) {
        notes[idx].state = 'hit';
        idx++; waiting = false; hits++; flash('ok');
        if (idx >= notes.length) finish();
      } else {
```
  Reemplazar por:
```js
      if (waiting && notes[idx] && notes[idx].midi === midi) {
        notes[idx].state = 'hit';
        hits++; flash('ok');
        if (loopOn && loopStart != null && loopEnd != null && idx === loopEnd) {
          // Cerrar la vuelta: volver al inicio del fragmento.
          loopRounds++;
          for (let i = loopStart; i <= loopEnd; i++) notes[i].state = 'idle';
          idx = loopStart;
          songBeat = notes[idx].startBeat;
          waiting = false;
          refreshLoopUI();
        } else {
          idx++; waiting = false;
          if (idx >= notes.length) finish();
        }
      } else {
```

- [ ] **Paso 2 (probar):** Marca un fragmento de 2-3 notas (Inicio/Fin). Al acertar la nota
  *fin*, el juego vuelve a la nota *inicio* (la tecla iluminada salta atrás), las notas del
  fragmento se "descolorean" para repetir, y "vueltas" sube. Se repite indefinidamente hasta
  pulsar "Quitar bucle".

---

### Tarea A4: Banda translúcida del fragmento en el carril

**Archivos:** Modificar `pianova.html` — función `draw()`, justo después de pintar el fondo
del carril y antes de las "guías verticales".

- [ ] **Paso 1:** Insertar tras `ctx.fillRect(0, 0, W, hitY);` del fondo:

```js
    // banda del fragmento en bucle
    if (mode === 'practice' && loopStart != null) {
      const e = (loopEnd != null) ? loopEnd : loopStart;
      const aBeat = notes[loopStart].startBeat;
      const bBeat = notes[e].startBeat + notes[e].dur;
      const yA = hitY - (aBeat - songBeat) * pps;
      const yB = hitY - (bBeat - songBeat) * pps;
      const top = Math.max(0, Math.min(yA, yB));
      const bot = Math.min(hitY, Math.max(yA, yB));
      if (bot > 0 && top < hitY) {
        ctx.fillStyle = loopOn ? 'rgba(70,211,154,0.10)' : 'rgba(159,208,240,0.08)';
        ctx.fillRect(0, top, W, bot - top);
        ctx.fillStyle = loopOn ? 'rgba(70,211,154,0.5)' : 'rgba(159,208,240,0.4)';
        ctx.fillRect(0, top, W, 1.5);
        ctx.fillRect(0, bot - 1.5, W, 1.5);
      }
    }
```

- [ ] **Paso 2 (probar):** Con un fragmento marcado, se ve una banda translúcida sobre el
  carril que cubre justo esas notas; cambia de azul (solo inicio) a verde (bucle activo).

---

# PARTE B — Pestañas (Aprender / Looper)

### Tarea B1: Barra de pestañas y contenedores

**Archivos:** Modificar `pianova.html` (HTML + CSS + JS de cambio de pestaña).

- [ ] **Paso 1:** En `<header>`, antes de `<div class="grow">`, añadir las pestañas:

```html
    <div class="tabs" role="tablist">
      <button class="tab on" data-tab="learn">Aprender</button>
      <button class="tab" data-tab="looper">Looper</button>
    </div>
```

- [ ] **Paso 2:** Envolver el contenido actual de aprender. Poner `id="learnView"` en el
  `<div class="controls">` de Practicar y en su `<main>` y `<p class="hint">`, o más simple:
  envolver `.controls` + `<main>` + `.hint` en un único contenedor:

```html
  <div id="learnView">
    <!-- .controls, <main>, <p class="hint"> existentes van AQUÍ DENTRO -->
  </div>
  <div id="looperView" hidden></div>
```

- [ ] **Paso 3:** CSS de pestañas (junto a `.seg`):

```css
  .tabs{display:flex; gap:6px}
  .tab{border:1px solid var(--line); background:var(--panel); color:var(--muted)}
  .tab.on{background:var(--amber); color:#1a1306; border-color:var(--amber)}
  #looperView{flex:1; display:flex; flex-direction:column}
  #looperView[hidden]{display:none}
```

- [ ] **Paso 4:** En `// ---------- Estado ----------`:

```js
  let tab = 'learn';   // 'learn' | 'looper'
```

- [ ] **Paso 5:** En `// ---------- Conexiones UI ----------`, cambio de pestaña:

```js
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      tab = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b === btn));
      $('learnView').hidden = (tab !== 'learn');
      $('looperView').hidden = (tab !== 'looper');
      if (tab === 'looper') looperResize();
    });
  });
```

  (Define un `looperResize()` vacío de momento: `function looperResize(){}` — se completa en C.)

- [ ] **Paso 6 (probar):** Aparecen dos pestañas arriba. "Aprender" muestra todo lo de antes;
  "Looper" muestra una zona vacía. Alternar funciona y la pestaña activa se resalta en ámbar.

---

# PARTE C — Looper

### Tarea C1: HTML y CSS de la pestaña Looper

**Archivos:** Modificar `pianova.html` — contenido de `<div id="looperView">`.

- [ ] **Paso 1:** Rellenar `#looperView`:

```html
    <div class="controls">
      <button class="primary" id="lpPlay">Reproducir</button>
      <label class="fld">Tempo
        <input type="range" id="lpTempo" min="50" max="160" value="90">
        <span class="tempoval"><span id="lpTempoVal">90</span> BPM</span>
      </label>
      <label class="fld">Compases
        <select id="lpBars"><option>1</option><option selected>2</option><option>4</option></select>
      </label>
      <label class="fld"><input type="checkbox" id="lpClick" checked> Metrónomo</label>
    </div>
    <main>
      <div class="stage"><canvas id="lpCanvas"></canvas></div>
      <div class="lpChannels" id="lpChannels"></div>
    </main>
    <p class="hint">Da a Reproducir, pulsa Grabar en un canal, espera la cuenta de entrada
      (un compás de clics) y toca tu frase. Se repetirá sola. Graba en otro canal para apilar.</p>
```

- [ ] **Paso 2:** CSS para los canales:

```css
  .lpChannels{display:flex; gap:10px; margin-top:12px; flex-wrap:wrap}
  .lpCh{flex:1; min-width:150px; border:1px solid var(--line); border-radius:12px;
    padding:10px; background:var(--panel)}
  .lpCh h4{margin:0 0 8px; font-family:var(--disp); font-size:13px}
  .lpCh .row{display:flex; gap:6px}
  .lpCh button{padding:6px 10px; font-size:12px; flex:1}
  .lpCh button.rec{background:#e8746b; color:#1a0606; border-color:#e8746b}
  .lpCh button.muted{opacity:.5}
```

- [ ] **Paso 3 (probar):** En la pestaña Looper se ve la barra (Reproducir, Tempo, Compases,
  Metrónomo) y un canvas. Aún no hay canales (se generan por JS en C2).

---

### Tarea C2: Estado del looper y generación de canales

**Archivos:** Modificar `pianova.html` (`<script>`), nuevo bloque
`// ---------- Looper: estado ----------`.

- [ ] **Paso 1:** Añadir estado:

```js
  const LP_CHANNELS = 4;
  const LP_COLORS = ['#f2a33c', '#46d39a', '#9fd0f0', '#c79bf0'];
  const lp = {
    playing: false,
    beat: 0,            // posición dentro del bucle, en beats
    bars: 2,
    recording: -1,      // índice de canal grabando, o -1
    countIn: 0,         // beats de cuenta de entrada restantes (>0 = contando)
    lastClickBeat: -1,  // último beat entero en el que sonó el clic
    channels: []        // { notes:[{midi,startBeat,dur,vel}], open:{}, muted, fired:Set }
  };
  function lpLoopBeats() { return lp.bars * 4; }
  function lpInitChannels() {
    lp.channels = [];
    for (let i = 0; i < LP_CHANNELS; i++)
      lp.channels.push({ notes: [], open: {}, muted: false });
  }
```

- [ ] **Paso 2:** DOM y construcción de la UI de canales:

```js
  const lpPlayBtn = $('lpPlay'), lpTempoEl = $('lpTempo'), lpTempoVal = $('lpTempoVal');
  const lpBarsEl = $('lpBars'), lpClickEl = $('lpClick'), lpChannelsEl = $('lpChannels');
  const lpCanvas = $('lpCanvas'), lpCtx = lpCanvas.getContext('2d');

  function lpBuildChannelUI() {
    lpChannelsEl.innerHTML = '';
    for (let i = 0; i < LP_CHANNELS; i++) {
      const el = document.createElement('div');
      el.className = 'lpCh';
      el.innerHTML =
        '<h4 style="color:' + LP_COLORS[i] + '">Canal ' + (i + 1) + '</h4>' +
        '<div class="row">' +
        '<button data-rec="' + i + '">Grabar</button>' +
        '<button data-mute="' + i + '">Silenciar</button>' +
        '<button data-clear="' + i + '">Borrar</button></div>';
      lpChannelsEl.appendChild(el);
    }
  }
```

- [ ] **Paso 3:** En `// ---------- Init ----------`, inicializar:

```js
  lpInitChannels();
  lpBuildChannelUI();
```

- [ ] **Paso 4 (probar):** En la pestaña Looper aparecen 4 tarjetas "Canal 1..4", cada una
  con Grabar / Silenciar / Borrar y su color. Los botones aún no hacen nada.

---

### Tarea C3: Metrónomo (clic sintetizado)

**Archivos:** Modificar `pianova.html` (`<script>`), junto al bloque de Audio.

- [ ] **Paso 1:** Añadir función de clic:

```js
  function lpClickSound(accent) {
    ensureAudio();
    const t = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square';
    o.frequency.value = accent ? 1600 : 1000;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent ? 0.20 : 0.12, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + 0.08);
  }
```

- [ ] **Paso 2 (probar):** No hay UI aún; se prueba en C5 cuando el reloj llame al clic.

---

### Tarea C4: Transporte (Reproducir/Parar, tempo, compases, metrónomo)

**Archivos:** Modificar `pianova.html` — conexiones UI.

- [ ] **Paso 1:** Cablear el transporte:

```js
  lpTempoEl.addEventListener('input', () => { lpTempoVal.textContent = lpTempoEl.value; });
  lpBarsEl.addEventListener('change', () => {
    const hasContent = lp.channels.some(c => c.notes.length);
    if (hasContent && !confirm('Cambiar la longitud vaciará los canales. ¿Seguir?')) {
      lpBarsEl.value = lp.bars; return;
    }
    lp.bars = parseInt(lpBarsEl.value, 10);
    lpInitChannels();
  });
  lpPlayBtn.addEventListener('click', () => {
    ensureAudio();
    lp.playing = !lp.playing;
    lpPlayBtn.textContent = lp.playing ? 'Parar' : 'Reproducir';
    if (lp.playing) { lp.beat = 0; lp.lastClickBeat = -1; lp.channels.forEach(c => c.fired = new Set()); }
    else { lpStopRecording(); for (const m in voices) silence(+m); }
  });
```

- [ ] **Paso 2:** Stub para que no falle (la grabación se completa en C6):

```js
  function lpStopRecording() {
    if (lp.recording < 0) return;
    const ch = lp.channels[lp.recording];
    for (const m in ch.open) { ch.notes.push(ch.open[m]); }
    ch.open = {};
    document.querySelector('[data-rec="' + lp.recording + '"]').classList.remove('rec');
    lp.recording = -1; lp.countIn = 0;
  }
```

- [ ] **Paso 3 (probar):** El botón alterna Reproducir/Parar. Cambiar "Compases" con canales
  vacíos no pide confirmación; el tempo actualiza su número. (El metrónomo se oye en C5.)

---

### Tarea C5: Reloj del looper + metrónomo en el bucle principal

**Archivos:** Modificar `pianova.html` — función `frame()` y bloque de reproducción.

- [ ] **Paso 1:** Crear la función de avance del looper (nuevo bloque
  `// ---------- Looper: reloj y reproducción ----------`):

```js
  function lpTick(dt) {
    if (!lp.playing) return;
    const bpm = parseFloat(lpTempoEl.value);
    const adv = dt * (bpm / 60);
    const total = lpLoopBeats();

    // cuenta de entrada antes de grabar
    if (lp.countIn > 0) {
      const before = lp.countIn;
      lp.countIn -= adv;
      // clic en cada tiempo entero de la cuenta de entrada
      if (Math.floor(before) !== Math.floor(lp.countIn) && lpClickEl.checked) lpClickSound(false);
      if (lp.countIn <= 0) { lp.countIn = 0; lp.beat = 0; lpBeginCapture(); }
      else return;  // aún contando, no avanzar el bucle
    }

    const prev = lp.beat;
    lp.beat += adv;

    // metrónomo en cada tiempo entero
    const beatNow = Math.floor(lp.beat % total);
    if (lpClickEl.checked && beatNow !== lp.lastClickBeat) {
      lp.lastClickBeat = beatNow;
      lpClickSound(beatNow % 4 === 0);
    }

    // ¿cruzamos el final del bucle?
    if (lp.beat >= total) {
      lp.beat -= total;
      lp.channels.forEach(c => c.fired = new Set());
      if (lp.recording >= 0) lpFinishRecording();  // definido en C6
    }
    lpPlayback(prev % total, lp.beat);  // definido en C7
  }
```

- [ ] **Paso 2:** Stubs temporales para C6/C7 (añadir; se sustituyen al llegar a esas tareas):

```js
  function lpBeginCapture() {}
  function lpFinishRecording() { lpStopRecording(); }
  function lpPlayback() {}
```

- [ ] **Paso 3:** Llamar a `lpTick` desde `frame()`. En `frame(now)`, tras calcular `dt` y
  antes de `draw();`, añadir:

```js
    lpTick(dt);
    if (tab === 'looper') lpDraw();   // lpDraw definido en C8; define stub vacío si aún no existe
```
  (Si `lpDraw` no existe aún, añade `function lpDraw(){}` temporal.)

- [ ] **Paso 4 (probar):** En Looper, con Metrónomo marcado, pulsar Reproducir: se oye el
  clic en cada tiempo, con acento más agudo en el tiempo 1 (cada 4). Parar lo detiene.

---

### Tarea C6: Grabación (cuenta de entrada y captura de notas)

**Archivos:** Modificar `pianova.html` — entrada y conexiones de canal.

- [ ] **Paso 1:** Enrutar la entrada del usuario hacia el looper. En `handleNoteOn(midi, vel)`,
  al inicio (tras `pressed.add` / `noteOn` / actualizar `noteEl`), bifurcar por pestaña.
  Sustituir el cuerpo de `handleNoteOn` por:

```js
  function handleNoteOn(midi, vel) {
    pressed.add(midi);
    noteOn(midi, vel);
    noteEl.textContent = solfege(midi);
    if (tab === 'looper') { lpCapture(midi, vel, true); return; }
    judge(midi);
  }
```
  Y en `handleNoteOff(midi)` añadir, tras `pressed.delete(midi)`:

```js
    if (tab === 'looper') lpCapture(midi, 0, false);
```

- [ ] **Paso 2:** Implementar captura (reemplaza el stub `lpBeginCapture` y añade `lpCapture`):

```js
  function lpBeginCapture() {
    const ch = lp.channels[lp.recording];
    ch.notes = []; ch.open = {};   // grabar reemplaza el contenido del canal
  }
  function lpCapture(midi, vel, on) {
    if (lp.recording < 0 || lp.countIn > 0) return;   // solo durante la grabación real
    const ch = lp.channels[lp.recording];
    if (on) {
      ch.open[midi] = { midi, startBeat: lp.beat, dur: 0.25, vel };
    } else if (ch.open[midi]) {
      const n = ch.open[midi];
      n.dur = Math.max(0.05, lp.beat - n.startBeat);
      ch.notes.push(n); delete ch.open[midi];
    }
  }
```

- [ ] **Paso 3:** Implementar fin de grabación (reemplaza el stub `lpFinishRecording`):

```js
  function lpFinishRecording() {
    const ch = lp.channels[lp.recording];
    const total = lpLoopBeats();
    for (const m in ch.open) {   // cerrar notas que siguen pulsadas al acabar el bucle
      const n = ch.open[m];
      n.dur = Math.max(0.05, total - n.startBeat);
      ch.notes.push(n);
    }
    ch.open = {};
    document.querySelector('[data-rec="' + lp.recording + '"]').classList.remove('rec');
    lp.recording = -1;
  }
```

- [ ] **Paso 4:** Cablear botones de canal (Grabar/Silenciar/Borrar) por delegación:

```js
  lpChannelsEl.addEventListener('click', ev => {
    const rec = ev.target.dataset.rec, mut = ev.target.dataset.mute, clr = ev.target.dataset.clear;
    if (rec != null) {
      ensureAudio();
      const i = +rec;
      if (!lp.playing) { lp.playing = true; lpPlayBtn.textContent = 'Parar'; lp.beat = 0; lp.lastClickBeat = -1; }
      lpStopRecording();
      lp.recording = i; lp.countIn = 4;   // un compás de cuenta de entrada
      ev.target.classList.add('rec');
    } else if (mut != null) {
      const c = lp.channels[+mut]; c.muted = !c.muted;
      ev.target.classList.toggle('muted', c.muted);
    } else if (clr != null) {
      const c = lp.channels[+clr]; c.notes = []; c.open = {};
      if (lp.recording === +clr) lpStopRecording();
    }
  });
```

- [ ] **Paso 5 (probar):** En Looper, pulsar "Grabar" en Canal 1: empieza a reproducir, suena
  un compás de cuenta de entrada (4 clics) y el botón se pone rojo. Toca notas con el teclado
  del ordenador (A S D F...) durante el bucle; al completar la vuelta, el botón se apaga.
  Aún no se vuelven a oír (eso es C7), pero "Borrar" vacía y "Silenciar" marca el canal.

---

### Tarea C7: Reproducción de los canales grabados

**Archivos:** Modificar `pianova.html` — reemplazar el stub `lpPlayback`.

- [ ] **Paso 1:** Implementar el disparo de notas por canal cada frame:

```js
  function lpPlayback(fromBeat, toBeat) {
    for (let i = 0; i < lp.channels.length; i++) {
      const ch = lp.channels[i];
      if (ch.muted || i === lp.recording) continue;
      if (!ch.fired) ch.fired = new Set();
      for (let k = 0; k < ch.notes.length; k++) {
        const n = ch.notes[k];
        // disparar si su inicio está en (fromBeat, toBeat], sin repetir en esta vuelta
        const crossed = (fromBeat <= toBeat)
          ? (n.startBeat > fromBeat && n.startBeat <= toBeat)
          : (n.startBeat > fromBeat || n.startBeat <= toBeat);   // por si el frame cruza el loop
        if (crossed && !ch.fired.has(k)) {
          ch.fired.add(k);
          noteOn(n.midi, n.vel);
          const durMs = Math.max(80, n.dur * (60 / parseFloat(lpTempoEl.value)) * 1000);
          setTimeout(() => silence(n.midi), durMs);
        }
      }
    }
  }
```

- [ ] **Paso 2 (probar):** Graba una frase corta en Canal 1. Tras la vuelta, debe **repetirse
  sola** en bucle. Pulsa "Grabar" en Canal 2 y toca encima: ambos canales suenan apilados.
  "Silenciar" calla un canal sin borrarlo; "Borrar" lo vacía. Cambiar "Compases" pide
  confirmación si hay contenido y, al aceptar, vacía los canales.

---

### Tarea C8: Render del looper (rejilla + cabezal)

**Archivos:** Modificar `pianova.html` — reemplazar el stub `lpDraw`, definir `looperResize`.

- [ ] **Paso 1:** Implementar el tamaño del canvas del looper:

```js
  let lpW = 0, lpH = 0;
  function looperResize() {
    const rect = lpCanvas.getBoundingClientRect();
    lpW = rect.width; lpH = rect.height;
    lpCanvas.width = Math.round(lpW * dpr);
    lpCanvas.height = Math.round(lpH * dpr);
    lpCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
```
  Y en el listener global de `resize`, añadir: `if (tab === 'looper') looperResize();`

- [ ] **Paso 2:** Implementar el dibujo (filas = canales; ancho = una vuelta del bucle):

```js
  function lpDraw() {
    if (!lpW) looperResize();
    const total = lpLoopBeats();
    const rows = LP_CHANNELS;
    const rh = lpH / rows;
    lpCtx.clearRect(0, 0, lpW, lpH);
    // rejilla de compases
    lpCtx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let b = 0; b <= total; b++) {
      const x = (b / total) * lpW;
      lpCtx.lineWidth = (b % 4 === 0) ? 1.5 : 0.5;
      lpCtx.beginPath(); lpCtx.moveTo(x, 0); lpCtx.lineTo(x, lpH); lpCtx.stroke();
    }
    // notas por canal
    for (let i = 0; i < rows; i++) {
      const ch = lp.channels[i];
      const y0 = i * rh;
      lpCtx.fillStyle = 'rgba(255,255,255,0.03)';
      lpCtx.fillRect(0, y0, lpW, rh - 1);
      for (const n of ch.notes) {
        const x = (n.startBeat / total) * lpW;
        const w = Math.max(3, (n.dur / total) * lpW);
        const ny = y0 + rh - 6 - ((n.midi - LOW) / (HIGH - LOW)) * (rh - 12);
        lpCtx.fillStyle = ch.muted ? 'rgba(120,128,140,0.4)' : LP_COLORS[i];
        rrectLp(x, ny, w, 4, 2);
      }
    }
    // cabezal de reproducción
    if (lp.playing && lp.countIn <= 0) {
      const x = ((lp.beat % total) / total) * lpW;
      lpCtx.fillStyle = '#ffce7a';
      lpCtx.fillRect(x - 1, 0, 2, lpH);
    }
  }
  function rrectLp(x, y, w, h, r) {
    lpCtx.beginPath();
    if (lpCtx.roundRect) lpCtx.roundRect(x, y, w, h, r); else lpCtx.rect(x, y, w, h);
    lpCtx.fill();
  }
```

- [ ] **Paso 3 (probar):** Al grabar, las notas aparecen como bloques de color en la fila del
  canal, colocadas según su tiempo (eje X) y altura según su nota (eje Y). Una línea ámbar
  (cabezal) recorre el bucle de izquierda a derecha al ritmo del tempo. Canal silenciado se
  ve en gris.

---

## Auto-revisión (cobertura del spec)

- [ ] **Bucle de fragmento:** marcar inicio/fin tocando (A2), repetir al acertar fin (A3),
  banda visual (A4), intercambio si fin<inicio (A2 paso 4), contador de vueltas (A2/A3),
  solo en Practicar (A2/A3 condicionan por `mode`), limpiar en reset/cambio de canción (A2).
- [ ] **Pestañas:** Aprender/Looper, mostrar/ocultar, entrada enrutada por `tab` (B1, C6).
- [ ] **Looper transporte:** Reproducir/Parar (C4), tempo (C4), longitud 1/2/4 con aviso al
  cambiar con contenido (C4), metrónomo on/off con acento (C3/C5).
- [ ] **Looper canales:** 4 canales, Grabar/Silenciar/Borrar, color por canal (C2/C6).
- [ ] **Grabación:** cuenta de entrada de 1 compás (C5/C6), timing real (C6), cierre de notas
  colgando al fin de bucle (C6).
- [ ] **Reproducción apilada** y reutilizando `noteOn`/`silence` (C7).
- [ ] **Render** rejilla + notas + cabezal (C8).
- [ ] **Solo en memoria, mismo sintetizador, sin cuantización:** respetado (no se añade
  persistencia ni cuantización ni cadenas de audio por canal).

## Notas de prueba (todo manual, Chrome/Edge, ideal con Live Server)
- Probar sin teclado físico con `A S D F G H J K` (blancas) y `W E T Y U` (negras).
- El `AudioContext` arranca tras pulsar un botón (`ensureAudio()` ya lo cubre).
- Verificar que cambiar de pestaña no deja notas colgadas (al Parar se llama `silence`).
