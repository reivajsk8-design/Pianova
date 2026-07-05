# Arreglos: patrones en vivo + suavizado de knobs + botón Nuevo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arreglar que el patrón seleccionado suene en vivo, quitar el ruido/zipper al mover knobs de efectos (suavizando los parámetros), y añadir un botón "Nuevo" para empezar de cero.

**Architecture:** (A) `onStep` reproduce `daw.current` fuera de modo canción → el patrón seleccionado suena en vivo. (B) helper `ramp(param, value, actx, tc)` con `setTargetAtTime`; cada efecto sustituye `AudioParam.value = x` (dentro de su `apply`) por `ramp(...)`. (C) botón `🆕 Nuevo` que, con confirmación, reinicia a `defaultDaw()` reutilizando el flujo de "abrir proyecto".

**Tech Stack:** Vite + TypeScript (strict) + Vitest. Web Audio.

## Global Constraints

- Todo el trabajo en `studio/` (NO tocar `pianova.html`). TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**.
- No cambiar el sonido de los efectos: solo suavizar CÓMO se aplican los parámetros (sin zipper).
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build` (desde `studio/`).

---

### Task 1: Helper de suavizado `ramp()` (`fx/param.ts`)

**Files:**
- Create: `studio/src/fx/param.ts`
- Create: `studio/src/fx/param.test.ts`

**Interfaces:**
- Produces: `ramp(param: AudioParam, value: number, actx: AudioContext, tc?: number): void` — suaviza el cambio con `param.setTargetAtTime(value, actx.currentTime, tc)` (`tc` por defecto `0.01`).

- [ ] **Step 1: Write the failing test (`fx/param.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { ramp } from './param';

describe('ramp', () => {
  it('llama a setTargetAtTime con el valor, el reloj de audio y el time constant por defecto', () => {
    const calls: [number, number, number][] = [];
    const param = { setTargetAtTime: (v: number, t: number, tc: number) => { calls.push([v, t, tc]); } } as unknown as AudioParam;
    const actx = { currentTime: 5 } as AudioContext;
    ramp(param, 0.7, actx);
    expect(calls).toEqual([[0.7, 5, 0.01]]);
  });
  it('acepta un time constant personalizado', () => {
    const calls: [number, number, number][] = [];
    const param = { setTargetAtTime: (v: number, t: number, tc: number) => { calls.push([v, t, tc]); } } as unknown as AudioParam;
    const actx = { currentTime: 2 } as AudioContext;
    ramp(param, 1, actx, 0.05);
    expect(calls).toEqual([[1, 2, 0.05]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd studio && npm test -- param`
Expected: FAIL (no existe `./param`).

- [ ] **Step 3: Create the implementation (`fx/param.ts`)**

```ts
// studio/src/fx/param.ts
// Suaviza el cambio de un AudioParam para evitar el "zipper noise" (rasgueo/clic) al arrastrar un knob.
// setTargetAtTime hace una transición exponencial suave hacia `value` (constante de tiempo `tc`).
export function ramp(param: AudioParam, value: number, actx: AudioContext, tc = 0.01): void {
  param.setTargetAtTime(value, actx.currentTime, tc);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd studio && npm test -- param`
Expected: PASS.

- [ ] **Step 5: Full check + commit**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS.

```bash
git add studio/src/fx/param.ts studio/src/fx/param.test.ts
git commit -m "Estudio efectos: helper ramp() (setTargetAtTime) para suavizar parámetros + tests"
```

---

### Task 2: Suavizar los parámetros en todos los efectos (`fx/effects/*.ts`)

**Files:**
- Modify: cada efecto con `AudioParam.value =` en su `apply`: `studio/src/fx/effects/` →
  `autopanner.ts, chorus.ts, deesser.ts, dynamics.ts, echo.ts, equalizer.ts, equalizer-bw.ts,
  fractal-doubler.ts, gain.ts, limiter.ts, pitch.ts, pink-noise.ts, reflector.ts, reverb.ts, rotary.ts,
  sigmoid.ts, stereo-echo.ts, tremolo.ts, tubewarmth.ts` (revisa cada uno; algunos quizá no tengan ninguno).

**Interfaces:**
- Consumes: `ramp(param, value, actx)` (Task 1).

**Regla del cambio (mecánico):** en el **manejador `apply(name, value)`** que devuelve cada efecto (la función
`(name, value) => { … }`), sustituir cada asignación directa a un **AudioParam**
`ALGUNNODO.suParamAudio.value = EXPR;` por `ramp(ALGUNNODO.suParamAudio, EXPR, actx);`.
El `actx` ya está en el ámbito de ese `apply` (es el primer argumento del callback de `makeEffect`).

**NO tocar:** reconstrucciones de buffer (p. ej. reverb `size`/`decay` → `scheduleRebuild`), `.type`, `.curve`,
osciladores/enum, y las inicializaciones de construcción (las `.value =` que están **fuera** del `apply`, al
crear los nodos). Solo se suavizan las `.value =` de AudioParams **dentro** del `apply`.

- [ ] **Step 1: Añade el import de `ramp` a cada efecto que vayas a tocar**

En cada fichero de la lista, junto a sus imports:

```ts
import { ramp } from '../param';
```

- [ ] **Step 2: Convierte las asignaciones (3 ejemplos guía; aplica la MISMA regla a todos)**

Ejemplo A — `reverb.ts` (`apply` actual):
```ts
    return (name, value) => {
      if (name === 'size') { size = value; scheduleRebuild(); }
      else if (name === 'decay') { decay = value; scheduleRebuild(); }
      else if (name === 'tone') tone.frequency.value = value;
      else if (name === 'mix') { wetMix.gain.value = value; dryMix.gain.value = 1 - value; }
    };
```
queda:
```ts
    return (name, value) => {
      if (name === 'size') { size = value; scheduleRebuild(); }            // rebuild: NO se suaviza
      else if (name === 'decay') { decay = value; scheduleRebuild(); }     // rebuild: NO se suaviza
      else if (name === 'tone') ramp(tone.frequency, value, actx);
      else if (name === 'mix') { ramp(wetMix.gain, value, actx); ramp(dryMix.gain, 1 - value, actx); }
    };
```

Ejemplo B — `dynamics.ts` (`apply` actual):
```ts
    if (name === 'threshold') comp.threshold.value = value;
    else if (name === 'ratio') comp.ratio.value = value;
    else if (name === 'knee') comp.knee.value = value;
    else if (name === 'attack') comp.attack.value = value;
    else if (name === 'release') comp.release.value = value;
    else if (name === 'makeup') makeup.gain.value = dbToLin(value);
```
queda:
```ts
    if (name === 'threshold') ramp(comp.threshold, value, actx);
    else if (name === 'ratio') ramp(comp.ratio, value, actx);
    else if (name === 'knee') ramp(comp.knee, value, actx);
    else if (name === 'attack') ramp(comp.attack, value, actx);
    else if (name === 'release') ramp(comp.release, value, actx);
    else if (name === 'makeup') ramp(makeup.gain, dbToLin(value), actx);
```

Ejemplo C — `equalizer.ts` (`apply` actual):
```ts
      if (name === 'low') lo.gain.value = value;
      else if (name === 'mid') mid.gain.value = value;
      else if (name === 'midFreq') mid.frequency.value = value;
      else if (name === 'high') hi.gain.value = value;
```
queda:
```ts
      if (name === 'low') ramp(lo.gain, value, actx);
      else if (name === 'mid') ramp(mid.gain, value, actx);
      else if (name === 'midFreq') ramp(mid.frequency, value, actx);
      else if (name === 'high') ramp(hi.gain, value, actx);
```

Aplica exactamente esta transformación en el `apply` de **cada** efecto de la lista (chorus: rate/depth/base/
feedback/mix; echo: time/feedback/tone/mix; autopanner: rate/depth; deesser: freq/threshold/amount;
equalizer-bw: freq/gain/bw; gain: gain; tremolo/rotary/reflector/stereo-echo/fractal-doubler/pitch/limiter/
tubewarmth/sigmoid/pink-noise: sus AudioParams). Si un efecto no tiene ninguna `.value =` de AudioParam en su
`apply` (p. ej. solo `.curve`/buffer), déjalo igual (quita el import de `ramp` que no uses).

- [ ] **Step 3: Verify typecheck, tests and build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS (el `tsc` señala si `ramp` recibe algo que no es `AudioParam`, lo que evita convertir por
error un `.type`/buffer).

- [ ] **Step 4: Commit**

```bash
git add studio/src/fx/effects
git commit -m "Estudio efectos: suaviza los parámetros con ramp() (adiós al zipper/clic al mover knobs)"
```

---

### Task 3: El patrón seleccionado suena en vivo (`app/studioView.ts`)

**Files:**
- Modify: `studio/src/app/studioView.ts` (dentro de `onStep` del secuenciador)

**Interfaces:**
- Produce: fuera de modo canción, `onStep` reproduce `daw.current` (el patrón seleccionado), no un índice fijo.

- [ ] **Step 1: Usa `daw.current` fuera de modo canción**

En `onStep`, localiza la línea que obtiene el patrón a reproducir:

```ts
      const pat = daw.patterns[playPattern]; if (!pat) return;
```

y sustitúyela por (elige el índice según el modo):

```ts
      const idx = (songMode && daw.song.length) ? playPattern : daw.current;
      const pat = daw.patterns[idx]; if (!pat) return;
```

(El avance en modo canción —`songPos`/`playPattern` en `i===0`— no cambia. Ahora, seleccionar o crear un
patrón mientras suena salta a él en vivo, porque `data-pat`/`addPattern` ya actualizan `daw.current`.)

- [ ] **Step 2: Verify typecheck, tests and build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS.

- [ ] **Step 3: Commit**

```bash
git add studio/src/app/studioView.ts
git commit -m "Estudio patrones: el patrón seleccionado suena en vivo (fuera de modo canción)"
```

---

### Task 4: Botón "Nuevo" (reset con confirmación) (`app/studioView.ts`)

**Files:**
- Modify: `studio/src/app/studioView.ts`

**Interfaces:**
- Consumes: `defaultDaw` (de `../daw/model`), `clearSamples` (de `../audio/sampleStore`), `makeChannel`,
  `masterDest`, `ensureAudio`, `initAudio`, `saveStore`, `renderAll`, `applyAudible`, `routeKeyboardToSelected`,
  `seq`, `masterRack`, `project`, `prLow` (todos ya en `mountStudioView`).

- [ ] **Step 1: Importa `defaultDaw` y `clearSamples`**

(a) Añade `defaultDaw` a la lista de imports de `'../daw/model'` (la que acaba en `} from '../daw/model';`):

```ts
  addPattern, removePattern, setCurrentPattern, setSong, defaultSynthxInstrument, defaultSlicerInstrument,
  syncChannelIdSeed, defaultDaw
} from '../daw/model';
```

(b) Añade `clearSamples` al import de `'../audio/sampleStore'`:

```ts
import { importSample, getSample, decodePending, clearSamples } from '../audio/sampleStore';
```

- [ ] **Step 2: Botón en la cabecera**

En el `root.innerHTML`, dentro de `<span class="pvHdrBtns">`, añade el botón **antes** de `#stSave`:

```ts
          <button id="stNew">🆕 Nuevo</button>
          <button id="stSave">💾 Guardar</button>
```

- [ ] **Step 3: Handler de reset (junto a los de guardar/abrir)**

Debajo del listener de `#stOpen` (o del bloque de `#stFile`), añade:

```ts
  (root.querySelector('#stNew') as HTMLButtonElement).addEventListener('click', async () => {
    if (!window.confirm('¿Empezar de cero? Se borrará el proyecto actual (patrones, canciones, samples y efectos).')) return;
    await initAudio();
    channels.forEach(a => a.dispose()); channels = [];
    daw = defaultDaw();
    clearSamples();
    const actx = ensureAudio();
    channels = daw.channels.map(c => makeChannel(actx, c, masterDest()));
    project.masterRack = { effects: [] };
    if (masterRack) masterRack.restore(project.masterRack);
    selectedId = daw.channels[0]?.id ?? '';
    songMode = false; playPattern = daw.current; songPos = -1; prLow = 48; recording = false;
    applyAudible(); routeKeyboardToSelected();
    seq.setBpm(daw.bpm);
    const bpmEl = root.querySelector('#tbBpm') as HTMLInputElement | null;
    if (bpmEl) bpmEl.value = String(daw.bpm);
    renderAll(); saveStore({ version: 3, daw, masterRack: project.masterRack });
  });
```

(Reutiliza el mismo patrón que abrir un proyecto: descarta canales, estado a `defaultDaw()`, limpia samples,
recrea canales, rack maestro vacío, guarda y re-renderiza.)

- [ ] **Step 4: Verify typecheck, tests and build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: TODO PASS.

- [ ] **Step 5: Manual smoke test (prueba por vista/oído)**

Run: `cd studio && npm run dev` y abre la URL:
1. **Mover knobs** de un efecto ya no rasguea/clipea (suave).
2. Con 2 patrones, **seleccionar** el 2º mientras suena → salta a él en vivo; **🔗 Canción** encadena.
3. **🆕 Nuevo** pide confirmación y deja el Estudio de cero (1 canal, sin patrones/samples/efectos), y persiste.

- [ ] **Step 6: Commit**

```bash
git add studio/src/app/studioView.ts
git commit -m "Estudio: botón Nuevo (reset con confirmación) para empezar de cero"
```

---

### Task 5: Docs y versión

**Files:**
- Modify: `studio/package.json` (subir `version` a `0.22.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.22.0"`.

- [ ] **Step 2: Update HANDOFF.md**

Añade en la zona de estado del Estudio:

```markdown
**Estudio · Arreglos patrones/knobs + botón Nuevo (v0.22.0):** (1) el **patrón seleccionado suena en vivo**
— `onStep` reproduce `daw.current` fuera de modo canción (antes se quedaba fijo con el patrón de al pulsar
Play); el encadenado sigue en 🔗 Canción. (2) **Suavizado de parámetros de efectos**: helper `ramp()`
(`fx/param.ts`, `setTargetAtTime`) reemplaza las asignaciones directas `AudioParam.value =` en el `apply` de
cada efecto → se acabó el "zipper noise"/clic/clipeo al arrastrar knobs (no se tocan reconstrucciones de
buffer ni `.type`/`.curve`). (3) botón **🆕 Nuevo**: reinicia a `defaultDaw()` con confirmación (reutiliza el
flujo de abrir proyecto; limpia samples y rack maestro).
```

- [ ] **Step 3: Update CLAUDE.md**

En la sección del Estudio (decisión 5), tras la mención del piano-roll, añade: **arreglos (v0.22.0): patrón
seleccionado en vivo, suavizado de parámetros de efectos (`fx/param.ts` `ramp()`, sin zipper) y botón 🆕 Nuevo
(reset con confirmación)**.

- [ ] **Step 4: Verify and commit**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio: docs (HANDOFF/CLAUDE) y versión 0.22.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- (A) patrón seleccionado en vivo → Task 3 ✅
- (B) suavizado de knobs → Task 1 (helper) + Task 2 (sweep) ✅
- (C) botón Nuevo → Task 4 ✅
- Docs/versión → Task 5 ✅

**Placeholders:** el sweep (Task 2) da la regla exacta + 3 ejemplos completos + la lista de ficheros; es una
transformación mecánica bien especificada (no un "TODO"). El resto va con código completo.

**Consistencia de tipos:** `ramp(param: AudioParam, value: number, actx: AudioContext, tc?)` (Task 1) coincide
con su uso en Task 2. `defaultDaw()`/`clearSamples()` (Task 4) existen y se importan. `project.masterRack`,
`masterRack.restore`, `makeChannel`, `masterDest`, `initAudio`, `ensureAudio`, `seq.setBpm`, `prLow`,
`recording`, `songMode`, `playPattern`, `songPos`, `selectedId` ya están en `mountStudioView`. El `#tbBpm` es
el input del BPM (igual que en abrir proyecto). El índice de patrón `idx` (Task 3) usa `songMode`/`daw.song`/
`playPattern`/`daw.current`, todos en ámbito.

**Estado intermedio válido:** Task 1 (helper) no altera nada aún; Task 2 lo usa; Tasks 3 y 4 son
independientes. Cada tarea compila por separado.
