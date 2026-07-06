# Humanizar por canal — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un mando **Human** por canal que, al reproducir, desvía un poco el tiempo y la intensidad de cada nota (no destructivo, reversible) para que no suene tan robótico.

**Architecture:** `ChannelState` gana `humanize` (0–1). Un helper puro `daw/humanize.ts` calcula los desvíos `{dt,dvel}` a partir de la cantidad y una fuente de aleatoriedad inyectable. En `onStep`, cada canal con `humanize>0` suma esos desvíos a `at`/`vel` en cada disparo (con `Math.random`). La UI añade un knob en la tira del canal del MIXER.

**Tech Stack:** Vite + TypeScript (strict) + Vitest. Web Audio (agendado por adelanto). DOM knobs (`ui/knob.ts`).

## Global Constraints

- Todo el trabajo en `studio/` (NO tocar `pianova.html`). TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón `var(--pv-acc)`.
- **No destructivo**: no se tocan las notas guardadas; a 0 % suena exacto. `humanize` ausente ⇒ 0 (compat v0.28).
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build` (ejecutar desde `studio/`).
- Commits con trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Modelo + helper puro `humanizeHit` (+ tests)

**Files:**
- Create: `studio/src/daw/humanize.ts`
- Create: `studio/src/daw/humanize.test.ts`
- Modify: `studio/src/daw/model.ts` (`ChannelState.humanize` + `defaultChannel`)

**Interfaces:**
- Produces:
  - `HUMANIZE_MAX_SHIFT = 0.02`, `HUMANIZE_MAX_VEL = 0.25` (constantes).
  - `humanizeHit(amount: number, rnd: () => number): { dt: number; dvel: number }`.
  - `ChannelState` gana `humanize?: number` (0–1; ausente ⇒ 0); `defaultChannel` lo pone a 0.

- [ ] **Step 1: Escribe el test que falla (`studio/src/daw/humanize.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { humanizeHit, HUMANIZE_MAX_SHIFT, HUMANIZE_MAX_VEL } from './humanize';

describe('humanizeHit', () => {
  it('cantidad 0 ⇒ sin desvío (con cualquier rnd)', () => {
    expect(humanizeHit(0, () => 0)).toEqual({ dt: 0, dvel: 0 });
    expect(humanizeHit(0, () => 1)).toEqual({ dt: 0, dvel: 0 });
  });
  it('rnd = 0.5 ⇒ centro (sin desvío)', () => {
    expect(humanizeHit(1, () => 0.5)).toEqual({ dt: 0, dvel: 0 });
  });
  it('extremos de rnd escalan por la cantidad', () => {
    expect(humanizeHit(1, () => 1)).toEqual({ dt: HUMANIZE_MAX_SHIFT, dvel: HUMANIZE_MAX_VEL });
    expect(humanizeHit(1, () => 0)).toEqual({ dt: -HUMANIZE_MAX_SHIFT, dvel: -HUMANIZE_MAX_VEL });
    const half = humanizeHit(0.5, () => 1);
    expect(half.dt).toBeCloseTo(HUMANIZE_MAX_SHIFT / 2, 9);
    expect(half.dvel).toBeCloseTo(HUMANIZE_MAX_VEL / 2, 9);
  });
  it('recorta la cantidad a [0,1]', () => {
    expect(humanizeHit(5, () => 1)).toEqual({ dt: HUMANIZE_MAX_SHIFT, dvel: HUMANIZE_MAX_VEL });
    expect(humanizeHit(-3, () => 1)).toEqual({ dt: 0, dvel: 0 });
  });
});
```

- [ ] **Step 2: Ejecuta el test para verlo fallar**

Run: `cd studio && npm test -- humanize`
Expected: FAIL (`humanize` no existe).

- [ ] **Step 3: Crea `studio/src/daw/humanize.ts`**

```ts
// studio/src/daw/humanize.ts
// Humanizar: desvío por disparo (no destructivo). A partir de una cantidad 0–1 y una fuente de aleatoriedad
// inyectable (Math.random en el motor; fija en los tests), devuelve un desvío de tiempo (dt, segundos) y de
// intensidad (dvel), ambos centrados en 0. Topes pequeños para que suene natural, no un desastre.
export const HUMANIZE_MAX_SHIFT = 0.02;   // ± segundos de desvío de tiempo a cantidad 1
export const HUMANIZE_MAX_VEL = 0.25;     // ± de velocity a cantidad 1

export function humanizeHit(amount: number, rnd: () => number): { dt: number; dvel: number } {
  const a = Math.max(0, Math.min(1, amount));
  if (a === 0) return { dt: 0, dvel: 0 };
  return {
    dt: (rnd() * 2 - 1) * HUMANIZE_MAX_SHIFT * a,
    dvel: (rnd() * 2 - 1) * HUMANIZE_MAX_VEL * a
  };
}
```

- [ ] **Step 4: Ejecuta el test para verlo pasar**

Run: `cd studio && npm test -- humanize`
Expected: PASS.

- [ ] **Step 5: Añade `humanize` al modelo (`studio/src/daw/model.ts`)**

(a) En `ChannelState`, añade el campo:

```ts
export interface ChannelState {
  id: string; name: string; instrument: InstrumentSpec;
  volume: number; pan: number; muted: boolean; soloed: boolean; rack: RackState; humanize?: number;
}
```

(b) En `defaultChannel`, inicialízalo a 0:

```ts
export function defaultChannel(preset = 'piano', id?: string): ChannelState {
  return {
    id: id ?? newChannelId(), name: 'Canal', instrument: { kind: 'synth', preset },
    volume: 0.8, pan: 0, muted: false, soloed: false, rack: { effects: [] }, humanize: 0
  };
}
```

- [ ] **Step 6: typecheck + test + build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: PASS (los previos + los nuevos de humanize).

- [ ] **Step 7: Commit**

```bash
git add studio/src/daw/humanize.ts studio/src/daw/humanize.test.ts studio/src/daw/model.ts
git commit -m "Estudio humanizar: helper puro humanizeHit + ChannelState.humanize + tests"
```

---

### Task 2: Aplicar el desvío en `onStep`

**Files:**
- Modify: `studio/src/app/studioView.ts`

**Interfaces:**
- Consumes: `humanizeHit` (Task 1); `ChannelState.humanize` (Task 1).

Sin test unitario nuevo (Web Audio) — verificado por typecheck + build.

- [ ] **Step 1: Importa `humanizeHit`**

En `studio/src/app/studioView.ts`, añade el import (junto a los otros de `../daw/…`):

```ts
import { humanizeHit } from '../daw/humanize';
```

- [ ] **Step 2: Aplica el desvío en `onStep`**

En el cuerpo del `for` de `onStep`, hoy el bloque del disparo es (tras el cálculo de `secPerStep`):

```ts
        const vel = st.vel ?? SEQ_VEL;
        const at = when + swingOffset(i, daw.swing, secPerStep);
        const gate = c.instrument.kind === 'drum' ? undefined : effectiveLen(arr, j) * secPerStep;
        if (audio) audio.trigger(st.note ?? 60, vel, at, gate);
        padHits.set(c.id, { t: at, vel });                  // destello del pad, sincronizado al sonido
```

Cámbialo por (mismo cálculo + desvío de humanizar antes de disparar):

```ts
        let vel = st.vel ?? SEQ_VEL;
        let at = when + swingOffset(i, daw.swing, secPerStep);
        const hz = c.humanize ?? 0;
        if (hz > 0) { const h = humanizeHit(hz, Math.random); at += h.dt; vel = Math.max(0.05, Math.min(1, vel + h.dvel)); }
        const gate = c.instrument.kind === 'drum' ? undefined : effectiveLen(arr, j) * secPerStep;
        if (audio) audio.trigger(st.note ?? 60, vel, at, gate);
        padHits.set(c.id, { t: at, vel });                  // destello del pad, sincronizado al sonido (ya humanizado)
```

(Lo único que cambia: `vel`/`at` pasan de `const` a `let` y se aplica `humanizeHit` cuando `hz>0`. El resto del
cuerpo del `for` —el bloque del slicer con `st.note`— no cambia.)

- [ ] **Step 3: typecheck + test + build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add studio/src/app/studioView.ts
git commit -m "Estudio humanizar: onStep desvía tiempo+velocity por canal (Math.random)"
```

---

### Task 3: Mando Human en la tira del canal + docs y versión

**Files:**
- Modify: `studio/src/ui/channelstrip.ts`
- Modify: `studio/src/app/studioView.ts` (`renderMixer`)
- Modify: `studio/package.json` (version → `0.29.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `mountKnob` (`ui/knob.ts`), `updateChannel` (modelo), `ChannelState.humanize` (Task 1).

Sin test unitario nuevo (DOM) — verificado por typecheck + build + prueba manual.

- [ ] **Step 1: Añade el knob al HTML de la tira (`studio/src/ui/channelstrip.ts`)**

En `channelStripHTML`, dentro del `<div class="chMix">`, tras las celdas de Vol y Pan, añade la de Human:

```ts
    <div class="chMix">
      <div class="knobCell" title="Volumen (arrastra ↕ · doble-clic resetea)"><div class="knob" data-vol="${ch.id}"></div><span>Vol</span></div>
      <div class="knobCell" title="Paneo (arrastra ↕ · doble-clic centra)"><div class="knob" data-pan="${ch.id}"></div><span>Pan</span></div>
      <div class="knobCell" title="Humanizar (arrastra ↕ · doble-clic a 0): desvía un poco tiempo e intensidad"><div class="knob" data-hum="${ch.id}"></div><span>Human</span></div>
    </div>
```

- [ ] **Step 2: Cablea el knob en `renderMixer` (`studio/src/app/studioView.ts`)**

En `renderMixer`, dentro del `for (const c of daw.channels)`, tras los `mountKnob` de Vol y Pan, añade:

```ts
      const humEl = host.querySelector(`[data-hum="${c.id}"]`) as HTMLElement;
      if (humEl) mountKnob(humEl, { min: 0, max: 1, value: c.humanize ?? 0, default: 0, size: 34, onChange: v => {
        daw = updateChannel(daw, c.id, { humanize: v }); persist();
      } });
```

(No hay nodo de audio que actualizar: `onStep` lee `c.humanize` en vivo.)

- [ ] **Step 3: typecheck + build + prueba manual**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS. En la URL (`npm run dev`): pestaña **MIXER** → cada canal tiene un mando **Human**; súbelo y
reproduce → el canal suena más suelto (tiempo e intensidad varían); a 0 → clavado. Persiste al recargar.

- [ ] **Step 4: Bump version**

En `studio/package.json`, cambia `"version"` a `"0.29.0"`.

- [ ] **Step 5: HANDOFF.md**

Añade en la zona de estado del Estudio (cerca de las últimas entradas):

```markdown
**Estudio · humanizar por canal (v0.29.0):** mando **Human** (0–100 %) en cada tira del MIXER que, al
reproducir, desvía un poco el **tiempo** (±20 ms) y la **intensidad/velocity** (±0,25) de cada nota, escalado por
la cantidad y recalculado por disparo (más humano). No destructivo (no toca las notas; a 0 suena exacto). Helper
puro `daw/humanize.ts` `humanizeHit(amount,rnd)`; `ChannelState.humanize` persistido; aplicado en `onStep` con
`Math.random`; knob en `ui/channelstrip.ts`. Compat v0.28 → `humanize` 0.
```

- [ ] **Step 6: CLAUDE.md**

En la sección del Estudio (decisión 5), tras la entrada de longitud de nota + duplicar patrón, añade: **humanizar
por canal (v0.29.0): mando Human por canal que desvía tiempo (±20 ms) e intensidad (±0,25) al reproducir, no
destructivo** (`daw/humanize.ts` `humanizeHit` + `ChannelState.humanize` + `onStep` + knob en
`ui/channelstrip.ts`; sin tocar las notas guardadas).

- [ ] **Step 7: Verifica y commitea**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/src/ui/channelstrip.ts studio/src/app/studioView.ts studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio humanizar: knob Human en la tira del canal + docs y versión 0.29.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- `ChannelState.humanize` + `defaultChannel` → Task 1 ✅
- Helper puro `humanizeHit` (topes, escala, clamp, rnd inyectable) + tests → Task 1 ✅
- Motor `onStep` (desvío tiempo+velocity, `Math.random`, clamp velocity, pad sincronizado) → Task 2 ✅
- UI knob Human en la tira del MIXER (persistencia vía `updateChannel`) → Task 3 ✅
- Persistencia sin migración (canal verbatim; ausente ⇒ 0) → cubierto por Task 1 (modelo) + serialización
  existente (`normalizeChannel` conserva el campo) ✅
- Docs/versión → Task 3 ✅

**Placeholders:** ninguno; el código va completo (helper, motor, knob).

**Consistencia de tipos:** `humanizeHit(amount, rnd) → {dt,dvel}` (Task 1) se llama en `onStep` con
`Math.random` (Task 2). `ChannelState.humanize?` (Task 1) lo leen `onStep` (`c.humanize ?? 0`, Task 2) y el knob
(`c.humanize ?? 0`, Task 3) y lo escribe `updateChannel(daw, c.id, { humanize: v })` (Task 3). Constantes
`HUMANIZE_MAX_SHIFT`/`HUMANIZE_MAX_VEL` compartidas por helper y tests. Nombres coherentes.

**Estado intermedio válido:** Task 1 (helper + modelo) compila y testea solo; Task 2 usa el helper (ya existe) y
el campo (ya existe) → compila aunque el knob aún no esté; Task 3 añade la UI. Cada tarea deja el build verde.

**Decisión consciente:** el desvío se recalcula por disparo (no se guarda), así que cada vuelta del loop varía —
es el comportamiento "humano" acordado, no determinista. El knob solo actualiza estado + persist (no hay nodo de
audio que refrescar porque `onStep` lee el valor en vivo).
