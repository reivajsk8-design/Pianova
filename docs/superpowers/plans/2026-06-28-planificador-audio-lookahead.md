# Reproducción fluida (reloj de audio + lookahead) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la reproducción de "Escuchar" y del Looper suene fluida y cuadrada, separando el reloj de audio del de imagen y agendando las notas con 100 ms de adelanto.

**Architecture:** Patrón "two clocks": un transporte (`makeTransport`) deriva la posición del reloj `actx.currentTime`; un agendador mira `LOOKAHEAD_SEC` adelante y dispara cada nota en su instante exacto de audio. El motor de sonido (`synthNoteOn`, `playChannelSound`, nuevo `noteOnAt`) acepta un instante `when`. El camino "en vivo" (MIDI/pads/grabar) no cambia.

**Tech Stack:** HTML/CSS/JS vanilla en un solo archivo `pianova.html` (IIFE `'use strict'`), Web Audio API, `smplr` por CDN bajo demanda. Sin build. Verificación: `node --check` de cada `<script>`, balance de llaves CSS, tests Node de funciones puras (en `docs/superpowers/tests/`), y prueba manual en Chrome/Edge (Live Server).

## Global Constraints

- **Un solo archivo** `pianova.html`; sin librerías nuevas; sin build; `smplr` solo bajo demanda por CDN.
- Comentarios y textos de interfaz **en español**.
- **No empeorar escritorio ni móvil**; esta mejora es **invisible** (sin botones ni opciones nuevas).
- **El camino en vivo es inmediato y NO cambia:** `noteOn`/`silence` desde MIDI/ratón, los pads, y `playChannelSound` con `durBeats == null` (sonido `live`) NO llevan `when` → suenan al instante.
- `LOOKAHEAD_SEC = 0.1`. Cambio de BPM en marcha = re-anclar sin saltos. Parar/seek = `silenceAll()` + reiniciar punteros.
- Tras implementar: subir `const VERSION`, actualizar `CLAUDE.md` y `HANDOFF.md`. Los avisos markdownlint son preexistentes: ignorar.
- Verificación base (correr siempre antes de commit), desde `d:\PianoVa`:
  ```bash
  node -e "const fs=require('fs');const h=fs.readFileSync('pianova.html','utf8');const css=h.match(/<style>([\s\S]*?)<\/style>/)[1];let o=(css.match(/{/g)||[]).length,c=(css.match(/}/g)||[]).length;console.log('CSS',o,c,o===c?'OK':'MAL');const re=/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;let m,i=0;const cp=require('child_process');while((m=re.exec(h))){if(!m[1].trim())continue;const f=require('os').tmpdir()+'/pv'+i+'.js';fs.writeFileSync(f,m[1]);cp.execSync('node --check '+JSON.stringify(f));i++;}console.log('JS OK',i);"
  ```

---

### Task 1: Helpers puros — transporte y conversión de duración

Funciones puras (sin Web Audio) que encapsulan la matemática del reloj. Se prueban en Node y luego
se pegan **idénticas** dentro del IIFE de `pianova.html`. El test vive en el repo para que sea
revisable y re-ejecutable; la función se duplica en el HTML porque vive dentro del IIFE (sin build,
no es importable) — el texto debe ser idéntico al del test.

**Files:**
- Create: `docs/superpowers/tests/transport.test.js`
- Modify: `pianova.html` — insertar las dos funciones justo después de `function masterDest()` (línea ~776), antes de `function setupMasterBus()`.

**Interfaces:**
- Produces:
  - `durBeatsToSec(durBeats, bpm)` → `number` (segundos).
  - `makeTransport()` → objeto `{ anchor(beat, bpm), beatNow(), timeForBeat(beat), setBpm(bpm), bpm }`,
    donde el "tiempo" lo da una función `nowFn` inyectable (por defecto `() => actx.currentTime`),
    para poder testear con un reloj falso. Firma real: `makeTransport(nowFn)`.

- [ ] **Step 1: Escribir el test que falla** — crea `docs/superpowers/tests/transport.test.js`:

```js
'use strict';
const assert = require('assert');

// ---- Copia EXACTA de las funciones que irán en pianova.html (sin build, no son importables) ----
function durBeatsToSec(durBeats, bpm) { return Math.max(0.02, durBeats * (60 / bpm)); }
function makeTransport(nowFn) {
  let t0 = 0, b0 = 0, _bpm = 120;
  const now = nowFn || (() => 0);
  return {
    anchor(beat, bpm) { t0 = now(); b0 = beat; _bpm = bpm; },
    beatNow() { return b0 + (now() - t0) * (_bpm / 60); },
    timeForBeat(beat) { return t0 + (beat - b0) * (60 / _bpm); },
    setBpm(bpm) { const b = this.beatNow(); t0 = now(); b0 = b; _bpm = bpm; },
    get bpm() { return _bpm; }
  };
}
// ------------------------------------------------------------------------------------------------

// durBeatsToSec
assert.strictEqual(durBeatsToSec(1, 120), 0.5);
assert.strictEqual(durBeatsToSec(2, 60), 2);
assert.ok(durBeatsToSec(0, 120) >= 0.02, 'duración mínima 0.02s');

// transporte con reloj falso
let clock = 10;
const tr = makeTransport(() => clock);
tr.anchor(0, 120);                       // 120 bpm = 2 beats/seg
clock = 10;  assert.strictEqual(tr.beatNow(), 0);
clock = 11;  assert.strictEqual(tr.beatNow(), 2);          // 1 seg = 2 beats
assert.strictEqual(tr.timeForBeat(0), 10);
assert.strictEqual(tr.timeForBeat(2), 11);                 // inverso de beatNow
// timeForBeat es la inversa de beatNow
clock = 13.7; const b = tr.beatNow(); assert.ok(Math.abs(tr.timeForBeat(b) - 13.7) < 1e-9);

// setBpm re-ancla en la posición actual (sin salto)
clock = 12; const beatAntes = tr.beatNow();                // = 4
tr.setBpm(60);                                             // 60 bpm = 1 beat/seg
assert.ok(Math.abs(tr.beatNow() - beatAntes) < 1e-9, 'no salta al cambiar bpm');
clock = 13; assert.ok(Math.abs(tr.beatNow() - (beatAntes + 1)) < 1e-9, 'avanza al nuevo ritmo');

console.log('transport.test.js OK');
```

- [ ] **Step 2: Correr el test y ver que pasa el algoritmo** (aún no está en el HTML; el test es autocontenido):

Run: `node docs/superpowers/tests/transport.test.js`
Expected: imprime `transport.test.js OK` y sale con código 0. (Si falla, corrige la función EN EL TEST hasta que pase; ese texto es el que se pega en el HTML.)

- [ ] **Step 3: Pegar las funciones verificadas en `pianova.html`** justo después de `function masterDest() { ... }` (línea ~776). Usa EXACTAMENTE estas (idénticas al test, con `nowFn` por defecto al reloj de audio y un comentario en español):

```js
  // ---------- Transporte: reloj de audio + conversión de duración (reproducción fluida) ----------
  // Adelanto del agendador (segundos): se programan las notas ~100 ms antes de que suenen.
  const LOOKAHEAD_SEC = 0.1;
  // Duración en beats -> segundos al bpm dado (mínimo 0.02s para no crear notas de longitud nula).
  function durBeatsToSec(durBeats, bpm) { return Math.max(0.02, durBeats * (60 / bpm)); }
  // Reloj de transporte: la posición (en beats) se deriva de actx.currentTime contra un ancla,
  // así un tirón de imagen no mueve el ritmo. nowFn es inyectable para poder testear.
  function makeTransport(nowFn) {
    let t0 = 0, b0 = 0, _bpm = 120;
    const now = nowFn || (() => actx.currentTime);
    return {
      anchor(beat, bpm) { t0 = now(); b0 = beat; _bpm = bpm; },
      beatNow() { return b0 + (now() - t0) * (_bpm / 60); },
      timeForBeat(beat) { return t0 + (beat - b0) * (60 / _bpm); },
      setBpm(bpm) { const b = this.beatNow(); t0 = now(); b0 = b; _bpm = bpm; },
      get bpm() { return _bpm; }
    };
  }
```

- [ ] **Step 4: Verificar sintaxis** del archivo completo:

Run: el comando de "Verificación base" de Global Constraints.
Expected: `CSS <n> <n> OK` y `JS OK 2`.

- [ ] **Step 5: Commit**

```bash
git add pianova.html docs/superpowers/tests/transport.test.js
git commit -m "Transporte: reloj de audio + durBeatsToSec (helpers puros, con test)"
```

---

### Task 2: Helpers puros — selección de notas por ventana (lineal y con bucle)

Dos funciones puras que, dada una ventana de beats, devuelven qué notas agendar y en qué beat
**absoluto**. La lineal sirve a "Escuchar" (notas con beat absoluto, sin envolver); la de bucle sirve
al Looper (posiciones envueltas en `[0,total)` que se repiten cada vuelta).

**Files:**
- Create: `docs/superpowers/tests/duenotes.test.js`
- Modify: `pianova.html` — insertar las dos funciones justo después de las de la Task 1.

**Interfaces:**
- Consumes: nada (puras).
- Produces:
  - `dueLinear(notes, fromBeat, toBeat, startIdx)` → `{ entries: [{ note, beat }], nextIdx }`.
    `notes` está ordenado por `startBeat`. Agenda las de `startBeat` en `(fromBeat, toBeat]` empezando
    en `startIdx`; `beat` = `note.startBeat` (absoluto). `nextIdx` = índice de la primera no agendada.
  - `dueLoop(notes, fromAbs, toAbs, total)` → `[{ note, beat }]`. `notes` con `startBeat` en `[0,total)`.
    Devuelve las que caen en `(fromAbs, toAbs]` en beats **absolutos** (cada vuelta v añade `v*total`),
    con `beat` = posición absoluta. `fromAbs`/`toAbs` son beats absolutos monótonos.

- [ ] **Step 1: Escribir el test que falla** — crea `docs/superpowers/tests/duenotes.test.js`:

```js
'use strict';
const assert = require('assert');

// ---- Copia EXACTA de lo que irá en pianova.html ----
function dueLinear(notes, fromBeat, toBeat, startIdx) {
  const entries = []; let i = startIdx;
  while (i < notes.length && notes[i].startBeat <= toBeat) {
    if (notes[i].startBeat > fromBeat) entries.push({ note: notes[i], beat: notes[i].startBeat });
    i++;
  }
  return { entries, nextIdx: i };
}
function dueLoop(notes, fromAbs, toAbs, total) {
  const out = [];
  if (total <= 0 || toAbs <= fromAbs) return out;
  const vFrom = Math.floor(fromAbs / total), vTo = Math.floor(toAbs / total);
  for (let v = vFrom; v <= vTo; v++) {
    for (const n of notes) {
      const abs = v * total + n.startBeat;
      if (abs > fromAbs && abs <= toAbs) out.push({ note: n, beat: abs });
    }
  }
  out.sort((a, b) => a.beat - b.beat);
  return out;
}
// ----------------------------------------------------

// dueLinear
const notes = [{ startBeat: 0 }, { startBeat: 1 }, { startBeat: 2 }, { startBeat: 4 }];
let r = dueLinear(notes, -1, 1.5, 0);
assert.deepStrictEqual(r.entries.map(e => e.beat), [0, 1]);
assert.strictEqual(r.nextIdx, 2);
r = dueLinear(notes, 1.5, 4, r.nextIdx);                 // continúa desde nextIdx
assert.deepStrictEqual(r.entries.map(e => e.beat), [2, 4]);
assert.strictEqual(r.nextIdx, 4);
// borde: estrictamente > from y <= to (no re-dispara el borde inferior)
r = dueLinear(notes, 1, 2, 0);
assert.deepStrictEqual(r.entries.map(e => e.beat), [2]);

// dueLoop (total=4): patrón en 0 y 2, dos vueltas
const ln = [{ startBeat: 0 }, { startBeat: 2 }];
let e = dueLoop(ln, -0.5, 4.5, 4);                        // abs: 0,2,4 (no 4.5+)
assert.deepStrictEqual(e.map(x => x.beat), [0, 2, 4]);
e = dueLoop(ln, 4.5, 8, 4);                               // abs: 6,8
assert.deepStrictEqual(e.map(x => x.beat), [6, 8]);
e = dueLoop(ln, 0, 0, 4);                                 // ventana vacía
assert.deepStrictEqual(e, []);

console.log('duenotes.test.js OK');
```

- [ ] **Step 2: Correr el test**

Run: `node docs/superpowers/tests/duenotes.test.js`
Expected: imprime `duenotes.test.js OK`, código 0.

- [ ] **Step 3: Pegar en `pianova.html`** justo tras los helpers de la Task 1 (mismo texto, con comentarios en español):

```js
  // Notas a agendar en (fromBeat, toBeat] para una secuencia lineal (Escuchar). startIdx evita
  // recorrer desde el principio cada vez. Devuelve las entradas y el índice de la primera no agendada.
  function dueLinear(notes, fromBeat, toBeat, startIdx) {
    const entries = []; let i = startIdx;
    while (i < notes.length && notes[i].startBeat <= toBeat) {
      if (notes[i].startBeat > fromBeat) entries.push({ note: notes[i], beat: notes[i].startBeat });
      i++;
    }
    return { entries, nextIdx: i };
  }
  // Notas a agendar en (fromAbs, toAbs] para un bucle de 'total' beats (Looper). Las posiciones de
  // nota están en [0,total); se convierten a beats ABSOLUTOS sumando vuelta*total, así nunca se
  // re-disparan y se ordenan por instante.
  function dueLoop(notes, fromAbs, toAbs, total) {
    const out = [];
    if (total <= 0 || toAbs <= fromAbs) return out;
    const vFrom = Math.floor(fromAbs / total), vTo = Math.floor(toAbs / total);
    for (let v = vFrom; v <= vTo; v++) {
      for (const n of notes) {
        const abs = v * total + n.startBeat;
        if (abs > fromAbs && abs <= toAbs) out.push({ note: n, beat: abs });
      }
    }
    out.sort((a, b) => a.beat - b.beat);
    return out;
  }
```

- [ ] **Step 4: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 5: Commit**

```bash
git add pianova.html docs/superpowers/tests/duenotes.test.js
git commit -m "Seleccion de notas por ventana: dueLinear + dueLoop (puros, con test)"
```

---

### Task 3: Motor de sonido con instante explícito (`when`)

Hacer que synth, samples, instrumentos reales y batería puedan **empezar y parar en un instante de
audio dado**. Es plomería de Web Audio (no testeable en Node); se verifica con `node --check` y, al
final del plan, a oído. El comportamiento **en vivo** (sin `when`) queda idéntico.

**Files:**
- Modify: `pianova.html` — `synthNoteOn` (líneas ~865-898), `playChannelSound` (~1401-1447), y añadir
  `synthStopAt` y `noteOnAt` cerca de `noteOn`/`silence` (~946-961).

**Interfaces:**
- Consumes: `durBeatsToSec` (Task 1), `SYNTH`, `voices`, `masterDest`, `sfCache`, `sfPlayer`,
  `currentInstrument`, `samples`, `drumKit`, `synthNoteOn`.
- Produces:
  - `synthNoteOn(midi, vel, preset, gainMul, when)` → devuelve el objeto `voice` creado.
  - `synthStopAt(voice, when)` → agenda el release de ESE voice en el instante `when`.
  - `playChannelSound(ch, midi, vel, durBeats, when)` → si `when != null` agenda inicio (y parada por
    `durBeats`) en ese instante; si `when == null`, idéntico a hoy (live).
  - `noteOnAt(midi, vel, when, durSec)` → toca el instrumento **global** (`currentInstrument`)
    empezando en `when` y agendando su parada en `when + durSec` (synth/sf/sample).

- [ ] **Step 1: `synthNoteOn` acepta `when` y devuelve el voice.** Reemplaza la cabecera y la línea
  `const t = actx.currentTime;` y el `return`/final. Concretamente:
  - Cambia la firma a `function synthNoteOn(midi, vel, preset, gainMul, when) {`.
  - Cambia `const t = actx.currentTime;` por `const t = (when == null ? actx.currentTime : when);`.
  - Al final de la función, tras `voices[midi] = { o: oscs, g, release: preset.release || 0.18 };`,
    añade `return voices[midi];`.
  (El resto de la función ya usa `t` para `start`, envolvente y filtro, así que queda agendado.)

- [ ] **Step 2: Añadir `synthStopAt`** justo después de `synthSilence` (~línea 912). Para un voice
  concreto (capturado al agendar, NO releído de `voices[midi]`, que puede haber sido pisado):

```js
  // Agenda el apagado de un voice concreto en el instante 'when' (para secuencias con adelanto).
  function synthStopAt(voice, when) {
    if (!voice) return;
    const rel = voice.release || 0.18;
    try {
      voice.g.gain.cancelScheduledValues(when);
      voice.g.gain.setValueAtTime(Math.max(0.0001, voice.g.gain.value), when);
      voice.g.gain.exponentialRampToValueAtTime(0.0001, when + rel);
    } catch (e) {}
    voice.o.forEach(x => { try { x.stop(when + rel + 0.02); } catch (e) {} });
  }
```

- [ ] **Step 3: `playChannelSound` acepta `when`.** Cambia la firma a
  `function playChannelSound(ch, midi, vel, durBeats, when) {` y aplica el instante en cada rama.
  Reemplaza el cuerpo desde `const live = (durBeats == null);` para que use `when`:
  - Define al principio: `const at = (when == null ? undefined : when);` y
    `const startNow = (when == null ? actx.currentTime : when);`.
  - **sample:** `src.start(startNow, Math.max(0, ts), Math.max(0.02, te - ts));`
    (antes era `src.start(0, ts, dur)`; `0` = ahora, así que `startNow` lo sustituye bien).
  - **drumkit / drum:** añade `time` al objeto: `drumKit.start({ note: g, velocity: .., time: at })`
    y `drumKit.start({ note: sound.slice(5), velocity: .., time: at })` (smplr ignora `time:undefined`).
  - **sf:** programa inicio y duración con smplr:
    ```js
    const opts = { note: midi, velocity: Math.max(1, Math.round(v * 127)) };
    if (at != null) opts.time = at;
    if (!live) opts.duration = durBeatsToSec(durBeats, parseFloat(lpTempoEl.value));
    const stop = player.start(opts);
    if (live && stop) lpLiveStops[midi] = stop;
    else if (!live && at == null && stop) {      // respaldo solo si NO agendamos por audio
      const ms = Math.max(120, durBeats * (60 / parseFloat(lpTempoEl.value)) * 1000);
      setTimeout(() => { try { stop(); } catch (e) {} }, ms);
    }
    ```
  - **synth:** captura el voice y agenda su parada:
    ```js
    const voice = synthNoteOn(midi, (vel == null ? 0.8 : vel), preset, vol, at);
    if (!live) {
      if (at != null) synthStopAt(voice, at + durBeatsToSec(durBeats, parseFloat(lpTempoEl.value)));
      else { const ms = Math.max(80, durBeats * (60 / parseFloat(lpTempoEl.value)) * 1000);
             setTimeout(() => silence(midi), ms); }
    }
    ```

- [ ] **Step 4: Añadir `noteOnAt`** (instrumento global, para Escuchar) tras `silence` (~línea 961):

```js
  // Toca el instrumento GLOBAL empezando en 'when' y agendando su parada en when+durSec (Escuchar).
  function noteOnAt(midi, vel, when, durSec) {
    ensureAudio();
    if (currentInstrument.type === 'sf' && sfPlayer) {
      try { sfPlayer.start({ note: midi, velocity: Math.round((vel == null ? 0.8 : vel) * 127),
                             time: when, duration: durSec }); } catch (e) {}
    } else if (currentInstrument.type === 'sample') {
      const sm = samples[currentInstrument.id];
      if (sm && sm.buffer) {
        const src = actx.createBufferSource(); src.buffer = sm.buffer;
        src.playbackRate.value = Math.pow(2, (midi - (sm.base || 60)) / 12);
        const g = actx.createGain(); g.gain.value = Math.max(0.0002, 0.9 * (vel == null ? 0.8 : vel));
        src.connect(g); g.connect(masterDest());
        src.start(when); try { src.stop(when + Math.max(0.05, durSec)); } catch (e) {}
      }
    } else {
      const voice = synthNoteOn(midi, (vel == null ? 0.8 : vel),
                                SYNTH[currentInstrument.preset] || SYNTH.piano, null, when);
      synthStopAt(voice, when + Math.max(0.05, durSec));
    }
  }
```

- [ ] **Step 5: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 6: Verificación manual rápida de no-regresión en vivo** (Chrome/Edge, Live Server):
  conectar el ratón/teclado de ordenador y comprobar que tocar notas (Aprender, modo libre) y los
  pads/sonidos del Looper en vivo **suenan igual que antes** (inmediatos). No debe haber cambios.

- [ ] **Step 7: Commit**

```bash
git add pianova.html
git commit -m "Motor de sonido con instante explicito (when): synthNoteOn/synthStopAt/playChannelSound/noteOnAt"
```

---

### Task 4: Agendador de "Escuchar"

Reproducir `fullNotes` con el transporte + adelanto en el modo `listen`. La posición visible y las
teclas iluminadas se derivan del reloj de audio.

**Files:**
- Modify: `pianova.html` — declarar estado (~línea 632, junto a `firedFull`), `start()` (~2084),
  la rama `listen` de `frame()` (~2796-2814), `reset()` (~2068), el `input` de `#tempo` (~3043),
  y `seekToBeat`/`markFullFiredBefore` (~1866) para fijar el puntero al saltar.

**Interfaces:**
- Consumes: `makeTransport`, `LOOKAHEAD_SEC`, `dueLinear`, `noteOnAt`, `durBeatsToSec`, `fullNotes`,
  `songBeat`, `pressed`, `lastFull`, `silenceAll`, `tempoEl`.
- Produces: variables `listenTr` (transport), `listenIdx` (puntero), y una función
  `listenSchedule()` llamada cada frame en modo listen.

- [ ] **Step 1: Declarar estado.** Cerca de `let firedFull = new Set();` (~línea 632) añade:

```js
  let listenTr = null;          // transporte (reloj de audio) del modo Escuchar
  let listenIdx = 0;            // índice de la próxima nota de fullNotes por agendar
```

- [ ] **Step 2: Inicializar al empezar Escuchar.** En `start()`, **después** de
  `if (loopOn && loopStart != null) seekToIndex(loopStart);` (~línea 2090, así `songBeat` ya está en
  su sitio; sin bucle vale `songBeat = -4`, la cuenta de entrada de 4 beats), añade (solo para listen):

```js
    if (mode === 'listen') {
      listenTr = makeTransport();
      listenTr.anchor(songBeat, parseFloat(tempoEl.value));
      // arranca el puntero en la primera nota cuyo startBeat sea > songBeat (respeta seek/bucle)
      listenIdx = 0;
      while (listenIdx < fullNotes.length && fullNotes[listenIdx].startBeat <= songBeat) listenIdx++;
    }
```

- [ ] **Step 3: Función `listenSchedule()`.** Añádela cerca de `playFullAt` (~línea 2151). Agenda con
  adelanto y deriva la posición visual + teclas del reloj de audio:

```js
  // Agenda fullNotes con adelanto y deriva la posición/teclas del reloj de audio (modo Escuchar).
  function listenSchedule() {
    const bpm = parseFloat(tempoEl.value);
    const horizon = listenTr.beatNow() + LOOKAHEAD_SEC * (bpm / 60);
    const r = dueLinear(fullNotes, listenTr.beatNow() - 1e-9, horizon, listenIdx);
    for (const e of r.entries) {
      noteOnAt(e.note.midi, e.note.vel != null ? e.note.vel : 0.8,
               listenTr.timeForBeat(e.beat), durBeatsToSec(e.note.dur, bpm));
    }
    listenIdx = r.nextIdx;
    songBeat = listenTr.beatNow();
    // teclas iluminadas = notas que están sonando ahora (no interfiere: en Escuchar no tocas tú)
    pressed.clear();
    for (const n of fullNotes) {
      if (n.startBeat <= songBeat && songBeat < n.startBeat + n.dur) pressed.add(n.midi);
    }
  }
```

- [ ] **Step 4: Usar `listenSchedule` en `frame()`.** Sustituye la rama `else if (mode === 'listen')`
  (líneas ~2796-2800) por:

```js
          } else if (mode === 'listen') {
            listenSchedule();
            if (songBeat > lastFull + 2) finish();
```
  (Elimina el viejo `const prev = songBeat; songBeat += dt*(bpm/60); playFullAt(prev, songBeat);`.)

- [ ] **Step 5: BPM en marcha.** En el listener `tempoEl.addEventListener('input', ...)` (~línea 3043),
  añade al final del cuerpo: `if (playing && mode === 'listen' && listenTr) listenTr.setBpm(parseFloat(tempoEl.value));`

- [ ] **Step 6: Parar/seek limpio.** En `reset()` (~2068) añade tras `firedFull = new Set();`:
  `listenIdx = 0; if (typeof silenceAll === 'function') silenceAll();`
  Y en `seekToBeat`/`markFullFiredBefore` (la función que fija `songBeat = Math.max(0,b)` en ~1891),
  tras fijar `songBeat`, añade: re-anclar y recolocar el puntero si estamos en listen:
```js
      if (mode === 'listen' && listenTr) {
        listenTr.anchor(songBeat, parseFloat(tempoEl.value));
        listenIdx = 0;
        while (listenIdx < fullNotes.length && fullNotes[listenIdx].startBeat <= songBeat) listenIdx++;
      }
```

- [ ] **Step 7: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 8: Verificación manual** (Live Server): en Aprender, modo **Escuchar**, cargar una
  canción densa (p. ej. importar Pink Panther o usar "Himno de la Alegría") y darle a ▶. Debe sonar
  **fluido y cuadrado**, con las teclas iluminándose al ritmo. Cambiar el BPM con el número grande en
  marcha: el ritmo cambia sin saltos. Pulsar la barra de progreso (seek): salta y sigue sonando.

- [ ] **Step 9: Commit**

```bash
git add pianova.html
git commit -m "Agendador de Escuchar: reloj de audio + adelanto (reproduccion fluida)"
```

---

### Task 5: Agendador del Looper

Reproducir las notas de los canales con transporte + adelanto, manejando el bucle en beats absolutos.
`lp.beat` sigue siendo la posición visible, ahora derivada del reloj de audio.

**Files:**
- Modify: `pianova.html` — estado del Looper (cerca de `lpTick`/`lp`), `lpTogglePlay` (~1381),
  `lpTick` (~2655-2687) y el `input` de `#lpTempo` (~3127). El **metrónomo** se mantiene por cruce de
  la posición visible (es un clic corto que va directo a `destination`; no necesita adelanto).

**Interfaces:**
- Consumes: `makeTransport`, `LOOKAHEAD_SEC`, `dueLoop`, `playChannelSound`, `lpLoopBeats`,
  `lp` (`.playing`,`.beat`,`.channels`,`.recording`,`.countIn`,`.lastClickBeat`), `lpTempoEl`,
  `lpClickEl`, `lpClickSound`, `lpBeginCapture`, `lpFinishRecording`, `silenceAll`.
- Produces: variables `lpTr` (transport) y `lpSchedAbs` (frontera absoluta ya agendada).

- [ ] **Step 1: Declarar estado.** Junto a la definición de `lp` (busca `lp.beat = 0` en
  `lpTogglePlay`/`lpInitChannels`), añade a nivel de módulo:

```js
  let lpTr = null;             // transporte (reloj de audio) del Looper
  let lpSchedAbs = 0;          // último beat ABSOLUTO ya agendado
```

- [ ] **Step 2: Anclar al pulsar Play.** En `lpTogglePlay` (~1381-1385), donde al pasar a
  `lp.playing` se hace `lp.beat = 0; lp.lastClickBeat = -1; ...fired...`, añade tras ello:

```js
      lpTr = makeTransport(); lpTr.anchor(0, parseFloat(lpTempoEl.value)); lpSchedAbs = 0;
```
  Y al **parar** (rama que pone `lp.playing = false`), añade: `silenceAll();`.

- [ ] **Step 3: Reescribir `lpTick` para agendar con adelanto.** Sustituye el cuerpo de `lpTick`
  (líneas ~2655-2687) por esta versión (mantiene cuenta de entrada, metrónomo, cierre de bucle y
  fin de grabación, pero la posición la da el reloj de audio y las notas se agendan):

```js
  function lpTick(dt) {
    if (!lp.playing || !lpTr) return;
    const bpm = parseFloat(lpTempoEl.value);
    const total = lpLoopBeats();

    // cuenta de entrada antes de grabar (sigue por dt; aún no corre el bucle)
    if (lp.countIn > 0) {
      const before = lp.countIn;
      lp.countIn -= dt * (bpm / 60);
      if (Math.floor(before) !== Math.floor(lp.countIn) && lpClickEl.checked) lpClickSound(false);
      if (lp.countIn <= 0) {
        lp.countIn = 0; lp.lastClickBeat = -1; lpBeginCapture();
        lpTr.anchor(0, bpm); lpSchedAbs = 0;     // re-ancla al empezar el bucle de verdad
      }
      return;
    }

    const beatNow = lpTr.beatNow();              // posición absoluta (monótona)
    // agendar notas en (lpSchedAbs, horizon] de todos los canales audibles
    const horizon = beatNow + LOOKAHEAD_SEC * (bpm / 60);
    for (let i = 0; i < lp.channels.length; i++) {
      const ch = lp.channels[i];
      if (ch.muted || i === lp.recording || !ch.notes.length) continue;
      const due = dueLoop(ch.notes, lpSchedAbs, horizon, total);
      for (const e of due) playChannelSound(ch, e.note.midi, e.note.vel, e.note.dur, lpTr.timeForBeat(e.beat));
    }
    lpSchedAbs = horizon;

    // posición visible y cierre de grabación al cruzar vueltas
    const prevBeat = lp.beat;
    lp.beat = beatNow % total;
    if (lp.beat < prevBeat && lp.recording >= 0) lpFinishRecording();   // dimos una vuelta grabando

    // metrónomo en cada tiempo entero (por cruce de la posición visible)
    const ib = Math.floor(lp.beat);
    if (lpClickEl.checked && ib !== lp.lastClickBeat) { lp.lastClickBeat = ib; lpClickSound(ib % 4 === 0); }
  }
```
  Nota: ya **no** se usa `ch.fired` (el agendado en beats absolutos no re-dispara). No hace falta
  resetear `fired` por vuelta.

- [ ] **Step 4: BPM en marcha en el Looper.** En el listener `lpTempoEl.addEventListener('input', ...)`
  (~línea 3127), añade al final del cuerpo:
  `if (lp.playing && lpTr) lpTr.setBpm(parseFloat(lpTempoEl.value));`

- [ ] **Step 5: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 6: Verificación manual** (Live Server, pestaña Looper):
  - Grabar un patrón simple en 1-2 canales (synth y/o batería si está cargada) y darle a Play:
    debe sonar **fino y en bucle** sin descuadres ni notas dobladas.
  - Subir el BPM a 174 (drum and bass): sigue cuadrado.
  - Mutear/desmutear un canal en marcha: responde.
  - Editar una nota en el piano-roll en marcha: el cambio se oye en la siguiente vuelta.
  - Grabar con cuenta de entrada: entra a tiempo y al cerrar la vuelta guarda.

- [ ] **Step 7: Commit**

```bash
git add pianova.html
git commit -m "Agendador del Looper: reloj de audio + adelanto, bucle en beats absolutos"
```

---

### Task 6: Versión y documentación

Subir versión y dejar `CLAUDE.md` y `HANDOFF.md` al día. Deliverable revisable: docs precisas.

**Files:**
- Modify: `pianova.html` (`const VERSION`), `CLAUDE.md`, `HANDOFF.md`.

- [ ] **Step 1: Subir versión.** En `const VERSION = 'vX.YZ';` poner la siguiente (la actual es
  `v1.29`; usar `v1.30`) y comentar: `// reproducción fluida (reloj de audio + adelanto) en Escuchar y Looper`.

- [ ] **Step 2: `HANDOFF.md`.** Añadir bajo la cabecera de versión un bloque "Reproducción fluida
  (v1.30)" que explique: transporte por reloj de audio (`makeTransport`, posición desde
  `actx.currentTime`), agendado con `LOOKAHEAD_SEC=0.1` (`dueLinear` para Escuchar, `dueLoop` en beats
  absolutos para el Looper), motor con instante `when` (`synthNoteOn`/`synthStopAt`/`playChannelSound`/
  `noteOnAt`), en vivo intacto, y tests puros en `docs/superpowers/tests/`. Subir el número de versión
  en la línea `**Versión:**`.

- [ ] **Step 3: `CLAUDE.md`.** En la sección de **Audio**/**Tiempo**, añadir una frase: el tiempo de
  reproducción de Escuchar y Looper va por **reloj de audio + adelanto** (`makeTransport`,
  `LOOKAHEAD_SEC`, `dueLinear`/`dueLoop`, `noteOnAt`/`synthStopAt`/`playChannelSound(...,when)`); el
  camino en vivo sigue siendo inmediato.

- [ ] **Step 4: Verificar sintaxis** (comando base). Expected: `CSS .. OK`, `JS OK 2`.

- [ ] **Step 5: Commit**

```bash
git add pianova.html CLAUDE.md HANDOFF.md
git commit -m "Reproduccion fluida (reloj de audio + adelanto) v1.30: version y docs"
```

---

## Notas de ejecución
- Tras la Task 5, el `playFullAt` viejo y el `lpPlayback` directo pueden quedar sin uso. `playAutoAt`
  (Acompañar) y `lpPlayback`/`playFullAt` siguen referenciados por otros modos (Acompañar usa
  `playAutoAt`; `playFullAt` ya no se llama). **No borrar `playFullAt` ni `lpPlayback` en este ciclo**
  salvo que la revisión confirme que no se usan; dejarlos no rompe nada (YAGNI de borrado).
- `silenceAll` ya existe (~línea 962) y apaga voces synth y `sfStops`. Si al parar quedara una cola
  ≤100 ms, es aceptable (ver spec). No añadir lógica extra salvo que la prueba manual lo exija.
- Riesgo smplr: si `sf:`/batería no respetan `time`/`duration` en la versión cargada, el inicio
  agendado puede sonar "a tiempo de frame". Si la prueba manual lo revela, anotarlo para la revisión
  final (no bloquea synth/sample, que controlamos al 100%).
