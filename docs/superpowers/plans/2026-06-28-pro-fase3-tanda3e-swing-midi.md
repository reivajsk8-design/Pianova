# Fase 3 · Sub-tanda 3E — Swing + grabación de pasos en vivo (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la F3 con **swing** (groove: retrasa los pasos impares) y **grabación de pasos en vivo** (tocando con el teclado del ordenador o MIDI se graban pasos en el canal seleccionado mientras suena).

**Architecture:** El swing se aplica al **agendar** cada paso (se suma un retardo a los pasos impares; función pura `swingOffset` testeable); `swing` se guarda en `DawState`. La grabación: con "Grabar" armado y el secuenciador en marcha, cada nota en vivo escribe un paso ON (con su nota) en la posición del cabezal del canal seleccionado, vía una op pura `setStep`. La barra de transporte gana un deslizador de swing y un botón de grabar.

**Tech Stack:** TypeScript strict, Vite, Vitest, Web Audio API. Proyecto en `studio/`.

**Alcance:** swing + grabación de pasos (teclado/MIDI). El **MIDI-learn** completo (mapear knobs/botones del controlador a transporte/volúmenes) queda como mejora opcional posterior; aquí el control MIDI es la grabación de pasos desde el teclado/controlador.

## Global Constraints

- Todo el código nuevo va en **`studio/`**; **TypeScript strict**; **Vitest** para lo puro; **sin framework de UI**; textos/comentarios en **español**. **No tocar `pianova.html`**.
- Reusar: modelo/store/UI de 3D, `makeSequencer`, `mountTransport`, el secuenciador y el cabezal de `studioView`.
- `swing` es un campo **aditivo** de `DawState` (por defecto 0); el proyecto **sigue en v3** (un proyecto sin `swing` se lee como swing 0; no hay cambio de versión).
- Swing aplicado al **tiempo de audio** del paso (no en `dueSteps`): pasos impares (1,3,5…) se retrasan `swing · segundos-por-paso`. La función `swingOffset` es **pura y testeable**.
- Grabación: solo escribe (paso ON) cuando **grabar está armado** y el secuenciador **está sonando**; cuantiza al paso más cercano (`Math.round`).
- Verificación por tarea desde `d:\PianoVa\studio`: `npm run typecheck` + `npm test` + `npm run build`. Prueba manual por oído.

---

### Task 1: Swing + `setStep` (modelo, store, secuenciador puro)

**Files:**
- Modify: `studio/src/daw/model.ts` (campo `swing` en `DawState`, `defaultDaw`, op `setStep`).
- Modify: `studio/src/app/store.ts` (leer/escribir `swing`, por defecto 0, en las migraciones).
- Modify: `studio/src/daw/sequencer.ts` (añadir `swingOffset` pura).
- Modify: `studio/src/daw/model.test.ts` (test de `setStep`), `studio/src/daw/sequencer.test.ts` (test de `swingOffset`).

**Interfaces:**
- Produces: `DawState` con `swing: number`; `setStep(daw, chId, i, step: Step): DawState`; `swingOffset(step: number, swing: number, secPerStep: number): number`.

- [ ] **Step 1: Añade los tests que fallan**

En `studio/src/daw/sequencer.test.ts`, añade al final:

```ts
import { swingOffset } from './sequencer';

describe('swingOffset', () => {
  it('los pasos pares no se retrasan', () => {
    expect(swingOffset(0, 0.5, 0.1)).toBe(0);
    expect(swingOffset(2, 0.5, 0.1)).toBe(0);
  });
  it('los pasos impares se retrasan swing·secPerStep', () => {
    expect(swingOffset(1, 0.5, 0.1)).toBeCloseTo(0.05, 6);
    expect(swingOffset(3, 0.6, 0.2)).toBeCloseTo(0.12, 6);
  });
  it('swing 0 no retrasa nada', () => {
    expect(swingOffset(1, 0, 0.1)).toBe(0);
  });
});
```

En `studio/src/daw/model.test.ts`, añade dentro del `describe`:

```ts
  it('setStep fija un paso (on + nota) en el patrón actual, inmutable', () => {
    const d = defaultDaw(); const id = d.channels[0].id;
    const d2 = setStep(d, id, 2, { on: true, note: 64 });
    expect(channelSteps(d2, id)[2]).toEqual({ on: true, note: 64 });
    expect(channelSteps(d, id)[2].on).toBe(false);
  });
  it('defaultDaw tiene swing 0', () => { expect(defaultDaw().swing).toBe(0); });
```

Y añade `setStep` al import de `./model` en `model.test.ts`.

- [ ] **Step 2: Ejecuta los tests y comprueba que fallan**

Run: `npm test`
Expected: FAIL (`swingOffset`/`setStep` no existen; `defaultDaw().swing` undefined).

- [ ] **Step 3: Implementa los cambios**

En `studio/src/daw/model.ts`:

(a) Añade `swing: number;` a la interfaz `DawState`:

```ts
export interface DawState { channels: ChannelState[]; patterns: PatternState[]; current: number; song: number[]; bpm: number; steps: number; swing: number }
```

(b) En `defaultDaw`, añade `swing: 0`:

```ts
export function defaultDaw(): DawState {
  const ch = defaultChannel('piano');
  return { channels: [ch], patterns: [emptyPattern([ch], DEFAULT_STEPS)], current: 0, song: [], bpm: 120, steps: DEFAULT_STEPS, swing: 0 };
}
```

(c) Añade la op `setStep` (junto a `toggleStep`):

```ts
// Fija el paso `i` (objeto Step completo) del canal en el patrón actual (para grabar en vivo). Inmutable.
export function setStep(daw: DawState, chId: string, i: number, step: Step): DawState {
  return {
    ...daw,
    patterns: daw.patterns.map((p, idx) => {
      if (idx !== daw.current) return p;
      const cur = p.steps[chId] ?? emptySteps(daw.steps);
      const steps = cur.slice();
      steps[i] = step;
      return { steps: { ...p.steps, [chId]: steps } };
    })
  };
}
```

En `studio/src/app/store.ts`, en `dawV3` añade `swing` con defecto, y en `dawV2toV3` y la rama v1 añade `swing: 0`. Concretamente:

- En `dawV3`, añade al objeto devuelto: `swing: typeof o.swing === 'number' ? o.swing : 0`.
- En `dawV2toV3`, añade al objeto devuelto: `swing: 0`.
- En la rama v1/desconocido de `migrate`, añade al `daw`: `swing: 0`.

En `studio/src/daw/sequencer.ts`, añade al final (función pura):

```ts
// Retardo de swing (segundos) para un paso: los pasos impares (la "contra") se retrasan swing·secPerStep.
export function swingOffset(step: number, swing: number, secPerStep: number): number {
  return step % 2 === 1 ? swing * secPerStep : 0;
}
```

- [ ] **Step 4: Ejecuta los tests y comprueba que pasan**

Run: `npm test`
Expected: PASS (los tests nuevos + previos). **Nota:** el typecheck global fallará por `studioView`/`store` hasta cerrar la Task 2 (el `DawState` lleva `swing` y studioView crea estados sin él). Verifica con `npm test`.

- [ ] **Step 5: Commit**

```bash
git add studio/src/daw/model.ts studio/src/daw/model.test.ts studio/src/app/store.ts studio/src/daw/sequencer.ts studio/src/daw/sequencer.test.ts
git commit -m "Estudio F3: swing (swingOffset puro) + setStep + campo swing en el proyecto (v3) + tests"
```

---

### Task 2: Barra con swing + grabar, y grabación en vivo (`ui/transport.ts`, `app/studioView.ts`, CSS)

**Files:**
- Modify: `studio/src/ui/transport.ts` (deslizador de swing + botón Grabar).
- Modify: `studio/src/app/studioView.ts` (swing en `onStep`, armado de grabación, escribir paso en vivo, handlers de swing/grabar).
- Modify: `studio/src/ui/styles.css` (estilo del botón grabar/swing).

**Interfaces:**
- Produces: `TransportUI { setPlaying(on): void; setRecording(on): void }`; `mountTransport(root, { getBpm, getSwing, onPlay, onStop, onBpm, onSwing, onRecord })`.

- [ ] **Step 1: Reescribe `ui/transport.ts`**

```ts
// studio/src/ui/transport.ts
// Barra de transporte: Play/Stop, BPM, Swing y Grabar (armar grabación de pasos en vivo).
export interface TransportUI { setPlaying(on: boolean): void; setRecording(on: boolean): void }

export function mountTransport(
  root: HTMLElement,
  opts: {
    getBpm: () => number; getSwing: () => number;
    onPlay: () => void; onStop: () => void; onBpm: (bpm: number) => void;
    onSwing: (swing: number) => void; onRecord: () => void;
  }
): TransportUI {
  root.innerHTML = `<div class="tbar">
    <button id="tbPlay" class="tbPlay" title="Reproducir / Parar">▶</button>
    <button id="tbRec" class="tbRec" title="Grabar pasos en vivo">●</button>
    <label class="fld">BPM <input id="tbBpm" type="number" min="40" max="240" step="1" value="${opts.getBpm()}"></label>
    <label class="fld">Swing <input id="tbSwing" type="range" min="0" max="0.7" step="0.01" value="${opts.getSwing()}"></label>
  </div>`;
  const play = root.querySelector('#tbPlay') as HTMLButtonElement;
  const rec = root.querySelector('#tbRec') as HTMLButtonElement;
  let playing = false;
  const setPlaying = (on: boolean) => { playing = on; play.textContent = on ? '⏹' : '▶'; play.classList.toggle('on', on); };
  const setRecording = (on: boolean) => { rec.classList.toggle('on', on); };
  play.addEventListener('click', () => { if (playing) opts.onStop(); else opts.onPlay(); });
  rec.addEventListener('click', () => opts.onRecord());
  (root.querySelector('#tbBpm') as HTMLInputElement).addEventListener('change', e => {
    opts.onBpm(Math.max(40, Math.min(240, +(e.target as HTMLInputElement).value || 120)));
  });
  (root.querySelector('#tbSwing') as HTMLInputElement).addEventListener('input', e => {
    opts.onSwing(+(e.target as HTMLInputElement).value);
  });
  return { setPlaying, setRecording };
}
```

- [ ] **Step 2: Añade el estilo del botón Grabar al final de `styles.css`**

```css
.tbRec { width:44px; height:44px; border-radius:50%; font-size:16px; background:var(--panel); color:#e0533a; border:1px solid var(--line); }
.tbRec.on { background:#e0533a; color:#fff; border-color:#e0533a; }
```

- [ ] **Step 3: En `app/studioView.ts`, importa `setStep` y `swingOffset`**

Añade `setStep` a la lista de imports de `'../daw/model'` y `swingOffset` al import de `'../daw/sequencer'`:

```ts
import { makeSequencer, swingOffset } from '../daw/sequencer';
```
y en el import de `../daw/model` añade `setStep` a la lista.

- [ ] **Step 4: En `app/studioView.ts`, añade el estado y aplica el swing en `onStep`**

Junto a las variables de estado (`songMode`/`playPattern`/…), añade:

```ts
  let recording = false;
```

En la creación del secuenciador, dentro de `onStep`, cambia la línea del disparo para sumar el swing. Reemplaza:

```ts
        if (st && st.on) { const audio = channels.find(a => a.id === c.id); if (audio) audio.trigger(st.note ?? 60, st.vel ?? SEQ_VEL, when); }
```

por:

```ts
        if (st && st.on) {
          const audio = channels.find(a => a.id === c.id);
          const secPerStep = (60 / transport.bpm) / STEPS_PER_BEAT;
          if (audio) audio.trigger(st.note ?? 60, st.vel ?? SEQ_VEL, when + swingOffset(i, daw.swing, secPerStep));
        }
```

- [ ] **Step 5: En `app/studioView.ts`, graba el paso en vivo dentro de `playLive`**

Reemplaza la función `playLive` por esta versión (toca el sonido como antes y, si está grabando y sonando, escribe el paso):

```ts
  function playLive(m: number, v: number): void {
    const ch = findChannel(daw, selectedId);
    if (ch?.instrument.kind === 'drum') {
      const audio = channels.find(a => a.id === selectedId);
      const actx = getAudioContext();
      if (audio && actx) audio.trigger(m, v, actx.currentTime);
    } else { routeKeyboardToSelected(); synth.noteOn(m, v); }
    if (recording && seq.isPlaying()) recordStep(m, v);
  }

  // Escribe un paso ON (con la nota) en la posición del cabezal del canal seleccionado.
  function recordStep(m: number, v: number): void {
    const step = ((Math.round(transport.beatNow() * STEPS_PER_BEAT) % daw.steps) + daw.steps) % daw.steps;
    daw = setStep(daw, selectedId, step, { on: true, note: m, vel: v });
    persist(); renderChannels();
  }
```

- [ ] **Step 6: En `app/studioView.ts`, amplía el montaje del transporte** con swing y grabar

Reemplaza el bloque `const tUI = mountTransport(...)` por:

```ts
  const tUI = mountTransport(root.querySelector('#transport') as HTMLElement, {
    getBpm: () => transport.bpm,
    getSwing: () => daw.swing,
    onPlay: () => {
      audioOn();
      barStarted = false;
      if (songMode && daw.song.length) { songPos = 0; playPattern = daw.song[0]; } else { songPos = -1; playPattern = daw.current; }
      seq.play(); tUI.setPlaying(true); renderPatternBar(); phRaf = requestAnimationFrame(playhead);
    },
    onStop: () => { seq.stop(); tUI.setPlaying(false); cancelAnimationFrame(phRaf); grids.forEach(g => g.setPlayhead(-1)); songPos = -1; playPattern = daw.current; renderPatternBar(); },
    onBpm: (bpm) => { daw = { ...daw, bpm }; seq.setBpm(bpm); persist(); },
    onSwing: (swing) => { daw = { ...daw, swing }; persist(); },
    onRecord: () => { recording = !recording; tUI.setRecording(recording); }
  });
```

- [ ] **Step 7: Verifica typecheck + tests + build** (typecheck global vuelve a verde)

Run: `npm run typecheck` → sin errores. Run: `npm test` → verde. Run: `npm run build` → OK.

- [ ] **Step 8: Prueba manual (navegador)**

Run: `npm run dev`. En el Estudio:
- **Swing**: con un ritmo de charles a semicorcheas, sube el deslizador **Swing** → la contra se retrasa y aparece el "groove" (más marcado cuanto más swing).
- **Grabar**: selecciona un canal (p. ej. Bombo), pulsa **●** (se pone rojo), pulsa **▶**, y toca el bombo a tiempo con el teclado/MIDI → los pasos se **graban** en la cuadrícula en la posición del cabezal. Vuelve a pulsar **●** para desarmar. Funciona también con canales de synth (graba la nota tocada).
- Guardar/abrir conserva el swing.

- [ ] **Step 9: Commit**

```bash
git add studio/src/ui/transport.ts studio/src/app/studioView.ts studio/src/ui/styles.css
git commit -m "Estudio F3: swing en el transporte + grabacion de pasos en vivo (teclado/MIDI)"
```

---

### Task 3: Versión y documentación — ¡F3 completa!

**Files:**
- Modify: `studio/package.json` (version), `HANDOFF.md`, `CLAUDE.md`.

- [ ] **Step 1: Sube la versión.** En `studio/package.json` cambia `"version": "0.12.0"` a `"version": "0.13.0"`.

- [ ] **Step 2: `HANDOFF.md`.** Añade la **Sub-tanda 3E** y marca **F3 (DAW/groovebox) COMPLETA**: **swing** (`swingOffset` puro; los pasos impares se retrasan `swing·segundos-por-paso`; campo `swing` aditivo en el proyecto v3; deslizador en el transporte) y **grabación de pasos en vivo** (botón **●**; con grabar armado + sonando, las notas del teclado/MIDI escriben pasos ON —con su nota— en el canal seleccionado vía `setStep`, cuantizado al paso más cercano). El **MIDI-learn** de knobs/transporte queda como mejora opcional. Resumen F3: el Estudio es un **groovebox completo** (transporte, canales con instrumento/mezcla/rack, batería 808, patrones + song mode, swing, grabación en vivo). Próximo hito del proyecto: **F4 (módulo Aprender)** y **F5 (conmutar el sitio)**.

- [ ] **Step 3: `CLAUDE.md`.** En la decisión 5, marca **F3 COMPLETA** (DAW/groovebox: 3A–3E hechas); el siguiente hito es **F4 módulo Aprender**.

- [ ] **Step 4: Verifica** — `npm run build` (OK). Confirma `version` 0.13.0 y las docs.

- [ ] **Step 5: Commit**

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio F3 sub-tanda 3E (swing + grabacion) v0.13.0: F3 completa"
```

---

## Notas de ejecución
- Verificación = `npm run typecheck` / `npm test` / `npm run build` desde `d:\PianoVa\studio`. No commitear `node_modules`/`dist`.
- **Orden:** la Task 1 (campo `swing` en `DawState`) rompe el typecheck global por `studioView` hasta la Task 2; verifica con `npm test`.
- Swing al agendar (`when + swingOffset(...)`), no en `dueSteps` (el secuenciador puro no cambia). `secPerStep = (60/bpm)/stepsPerBeat`.
- Grabar: solo escribe con grabar armado **y** sonando; cuantiza con `Math.round`; guarda la nota tocada (para canales synth). Re-renderiza los canales tras grabar.
- `swing` es aditivo: el proyecto **no cambia de versión** (sigue v3); un proyecto sin `swing` se lee como 0.
- No tocar `pianova.html`. Textos/comentarios en español.
```
