# Medidores de pico por canal (MIXER) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un medidor de nivel vertical por canal en el MIXER, post-fader, que sube al instante y baja suave.

**Architecture:** `audio/meter.ts` (helper puro `meterNorm`); `daw/channel.ts` gana un AnalyserNode post-fader + `getLevel()`; `ui/channelstrip.ts` añade la barra vertical; `app/studioView.ts` corre un rAF (solo con el MIXER abierto) que lee el nivel, aplica `meterNorm` + decaimiento y fija la altura.

**Tech Stack:** Vite + TypeScript (strict) + Vitest. Web Audio (AnalyserNode). DOM (rAF).

## Global Constraints

- Todo el trabajo en `studio/` (NO tocar `pianova.html`). TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón (`#2dff6a` / `var(--pv-acc)`).
- Post-fader (tras `gain`); escala dB (~−48…0); el analyser es un **sink** (no afecta al sonido). El bucle corre
  solo con `tab === 'mixer'`.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build` (desde `studio/`).
- Commits con trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `audio/meter.ts` (meterNorm) + `daw/channel.ts` (analyser + getLevel)

**Files:**
- Create: `studio/src/audio/meter.ts`
- Create: `studio/src/audio/meter.test.ts`
- Modify: `studio/src/daw/channel.ts`

**Interfaces:**
- Produces: `meterNorm(peak, floorDb?)`; `Channel.getLevel(): number`.

- [ ] **Step 1: Escribe el test que falla (`studio/src/audio/meter.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { meterNorm } from './meter';

describe('meterNorm', () => {
  it('0 → 0; 1 (0 dB) → 1; −6 dB (0.5) ≈ 0.875; muy bajo → 0 (recorta)', () => {
    expect(meterNorm(0)).toBe(0);
    expect(meterNorm(1)).toBe(1);
    expect(meterNorm(0.5)).toBeCloseTo(0.875, 2);
    expect(meterNorm(1e-3)).toBe(0);   // −60 dB < −48 floor
  });
  it('floorDb configurable', () => {
    expect(meterNorm(1, 60)).toBe(1);
    expect(meterNorm(0.5, 60)).toBeCloseTo((20 * Math.log10(0.5) + 60) / 60, 6);
  });
});
```

- [ ] **Step 2: Ejecuta el test para verlo fallar**

Run: `cd studio && npm test -- meter`
Expected: FAIL (`meter` no existe).

- [ ] **Step 3: Crea `studio/src/audio/meter.ts`**

```ts
// studio/src/audio/meter.ts
// Pico lineal (0–1) → nivel 0–1 en dB para el medidor de canal: 0 dB (pico 1) = 1; por debajo de floorDb = 0.
export function meterNorm(peak: number, floorDb = 48): number {
  if (peak <= 0) return 0;
  const db = 20 * Math.log10(peak);
  return Math.max(0, Math.min(1, (db + floorDb) / floorDb));
}
```

- [ ] **Step 4: Ejecuta el test para verlo pasar**

Run: `cd studio && npm test -- meter`
Expected: PASS.

- [ ] **Step 5: Añade el analyser + `getLevel` a `studio/src/daw/channel.ts`**

(a) En la interfaz `Channel`, añade el método (tras `trigger`):

```ts
  getLevel(): number;
```

(b) En `makeChannel`, tras `gain.connect(panner); panner.connect(masterIn);`, añade el tap y el buffer:

```ts
  const analyser = actx.createAnalyser(); analyser.fftSize = 256;
  gain.connect(analyser);   // tap post-fader (paralelo, sin salida → no afecta al sonido)
  const meterBuf = new Float32Array(analyser.fftSize);
```

(c) En el objeto devuelto, añade `getLevel` (junto a `serializeRack`):

```ts
    getLevel(): number {
      analyser.getFloatTimeDomainData(meterBuf as Float32Array<ArrayBuffer>);
      let peak = 0;
      for (let i = 0; i < meterBuf.length; i++) { const a = Math.abs(meterBuf[i]); if (a > peak) peak = a; }
      return peak;
    },
```

(d) En `dispose`, incluye el analyser en la lista de nodos:

```ts
      for (const n of [instrumentBus, gain, panner, analyser]) { try { n.disconnect(); } catch { /* ya */ } }
```

- [ ] **Step 6: typecheck + test + build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add studio/src/audio/meter.ts studio/src/audio/meter.test.ts studio/src/daw/channel.ts
git commit -m "Estudio medidor: meterNorm (puro) + AnalyserNode post-fader + Channel.getLevel"
```

---

### Task 2: Barra en la tira (`channelstrip`) + bucle rAF (`studioView`) + CSS

**Files:**
- Modify: `studio/src/ui/channelstrip.ts`
- Modify: `studio/src/app/studioView.ts`
- Modify: `studio/src/ui/styles.css`

**Interfaces:**
- Consumes: `meterNorm` (`audio/meter`), `Channel.getLevel` (Task 1).

Sin test unitario nuevo (DOM/audio) — verificado por typecheck + build + prueba manual.

- [ ] **Step 1: Barra vertical en `studio/src/ui/channelstrip.ts`**

En `channelStripHTML`, como último hijo del `.chStrip` (después del `<div class="chMix">…</div>`), añade:

```html
    <div class="chMeterV" title="Nivel"><div class="chMeterVFill" data-meter="${ch.id}"></div></div>
```

(Es decir, el `.chStrip` queda: `.chMain` … `.chMix` … `.chMeterV`.)

- [ ] **Step 2: Bucle rAF en `studio/src/app/studioView.ts`**

(a) Importa `meterNorm` (junto a otros de `../audio/…`):

```ts
import { meterNorm } from '../audio/meter';
```

(b) Añade el estado y el bucle (cerca de `visualTick`/`meterRaf`; junto a otras variables de la vista):

```ts
  const meterDisp = new Map<string, number>();   // nivel mostrado por canal (con decaimiento)
  let meterRaf = 0;
  function meterTick(): void {
    const active = tab === 'mixer' && channels.length > 0;
    if (active) {
      for (const a of channels) {
        const target = meterNorm(a.getLevel());
        const disp = Math.max(target, (meterDisp.get(a.id) ?? 0) - 0.05);   // sube al instante, baja suave
        meterDisp.set(a.id, disp);
        const el = root.querySelector(`.chMeterVFill[data-meter="${a.id}"]`) as HTMLElement | null;
        if (el) el.style.height = (disp * 100) + '%';
      }
    }
    meterRaf = active ? requestAnimationFrame(meterTick) : 0;
  }
  function startMeters(): void { if (!meterRaf && tab === 'mixer') meterRaf = requestAnimationFrame(meterTick); }
```

(c) Arranca el bucle al entrar en el MIXER. En el manejador del cambio de pestaña (donde hace
`if (t) { tab = t; renderTabs(); showPane(); }`), déjalo:

```ts
    if (t) { tab = t; renderTabs(); showPane(); if (t === 'mixer') startMeters(); }
```

(d) Y al final de `initAudio` (tras `renderAll();`, dentro del `audioReady = (async () => { … })()`), añade
`startMeters();` (por si el MIXER ya está a la vista cuando arranca el audio).

- [ ] **Step 3: CSS del medidor (`studio/src/ui/styles.css`)**

Tras las reglas de `.chMix`, añade:

```css
/* Medidor de nivel vertical por canal (MIXER): degradado verde→ámbar→rojo revelado de abajo arriba */
.chMeterV{position:relative;width:8px;height:44px;flex:0 0 auto;border-radius:2px;background:#0d1016;border:1px solid var(--pv-line);overflow:hidden}
.chMeterVFill{position:absolute;left:0;right:0;bottom:0;height:0;background:linear-gradient(to top,#2dff6a 0%,#f2a33c 78%,#e0533a 100%);background-size:100% 44px;background-position:0 bottom;background-repeat:no-repeat}
```

- [ ] **Step 4: typecheck + test + build + prueba manual**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: PASS. En la URL (`npm run dev`): pestaña **MIXER**, con sonido (reproducir o tocar), cada canal
muestra su nivel subiendo/bajando (verde→rojo en picos); **mute** lo apaga; al salir del MIXER el bucle para.

- [ ] **Step 5: Commit**

```bash
git add studio/src/ui/channelstrip.ts studio/src/app/studioView.ts studio/src/ui/styles.css
git commit -m "Estudio medidor: barra vertical por canal en el MIXER + bucle rAF (solo con el MIXER abierto)"
```

---

### Task 3: Docs y versión

**Files:**
- Modify: `studio/package.json` (version → `0.41.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version** — en `studio/package.json`, `"version"` → `"0.41.0"`.

- [ ] **Step 2: HANDOFF.md** — añade en la zona de estado del Estudio (junto a las últimas entradas):

```markdown
**Estudio · medidores de pico por canal (v0.41.0):** medidor de nivel **vertical** en cada tira del MIXER
(post-fader; verde→ámbar→rojo; sube al instante, baja suave). `audio/meter.ts` `meterNorm` (puro, testeado) +
`daw/channel.ts` gana un `AnalyserNode` (tap tras el `gain`, sink que no afecta al sonido) y `getLevel()`;
`ui/channelstrip.ts` la barra (`.chMeterV`); `app/studioView.ts` un rAF `meterTick` que corre **solo con el
MIXER abierto** (decaimiento + altura). Solo lectura; sin cambios del grafo de sonido.
```

- [ ] **Step 3: CLAUDE.md** — en la sección del Estudio (decisión 5), tras la entrada del knob mejorado (v0.40.0),
añade: **medidores de pico por canal (v0.41.0): medidor vertical post-fader en cada tira del MIXER (verde→rojo,
decaimiento)** (`audio/meter.ts` `meterNorm` + `AnalyserNode`/`getLevel` en `daw/channel.ts` + barra en
`ui/channelstrip.ts` + rAF en `app/studioView.ts`; sink, sin afectar al sonido).

- [ ] **Step 4: Verifica y commitea**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio medidor: docs (HANDOFF/CLAUDE) y versión 0.41.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- `meterNorm` puro + test → Task 1 ✅
- `AnalyserNode` post-fader + `getLevel` + dispose → Task 1 ✅
- Barra vertical en la tira (`.chMeterV`) + CSS degradado → Task 2 ✅
- Bucle rAF `meterTick` (solo MIXER, decaimiento, altura) + arranque (cambio de pestaña + fin de initAudio) →
  Task 2 ✅
- Docs/versión → Task 3 ✅

**Placeholders:** ninguno; el código va completo (meter, channel, strip, loop, CSS).

**Consistencia de tipos:** `meterNorm(peak, floorDb?)` (Task 1) lo usa `meterTick` (Task 2). `Channel.getLevel()`
(Task 1) lo llama el bucle (Task 2). `.chMeterVFill[data-meter="<chId>"]` (channelstrip, Task 2) lo consulta el
bucle (Task 2). Nombres coherentes.

**Estado intermedio válido:** Task 1 (meter puro + channel.getLevel, sin consumidor) compila y testea; Task 2
usa `getLevel`/`meterNorm` (ya existen) + añade la barra y el bucle; Task 3 docs. Cada tarea deja el build verde.

**Decisión consciente:** el analyser es un sink en paralelo (no afecta al sonido); el rAF solo corre con el
MIXER visible (eficiente) y se auto-detiene al salir. El tap es post-fader (refleja volumen/mute), antes del
panner (el pan no altera el nivel medido).
