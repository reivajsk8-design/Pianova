# Humanizar por canal — Diseño

**Fecha:** 2026-07-06 · **Versión objetivo:** 0.29.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Que las melodías/ritmos no suenen tan cuadriculados: un mando **Humanizar** por canal que añade micro-desvíos
de **tiempo** y de **intensidad (velocity)** a cada nota al reproducir. No destructivo y reversible.

## Decisiones tomadas (con el usuario)

- **Por canal** (cada canal su propia cantidad; p. ej. batería apretada, melodía más suelta).
- **Mando de cantidad reversible** (no destructivo): 0–100 %; a 0 % suena exacto. Se aplica al reproducir sin
  tocar las notas guardadas.
- El mando mueve **tiempo e intensidad** a la vez (topes pequeños). La batería también se humaniza.
- Es el primero de dos sub-proyectos; el segundo (rejilla más fina: 1/8, 1/16, 1/32, tresillos) va aparte.

## Arquitectura

Cambio pequeño y aditivo en 4 puntos, con un helper puro para la parte testeable:

- **Modelo (`daw/model.ts`):** `ChannelState` gana `humanize?: number` (0–1; ausente ⇒ 0). `defaultChannel`
  lo inicializa a 0. Se persiste con el canal (serialización JSON verbatim; `normalizeChannel` lo conserva).
- **Helper puro (`daw/humanize.ts`, nuevo, testeable):** `humanizeHit(amount, rnd)` calcula los desvíos.
- **Motor (`app/studioView.ts` `onStep`):** por cada canal con `humanize > 0`, en cada disparo suma `dt` al
  tiempo y `dvel` a la velocity (recortada). `Math.random` como fuente de aleatoriedad. El destello del pad
  (`padHits`) usa el mismo `at`/`vel` desviados.
- **UI (`ui/channelstrip.ts` + `renderMixer`):** un mando **Human** en la tira del canal (MIXER), junto a
  Vol/Pan.

### `daw/humanize.ts` (contrato)

```ts
export const HUMANIZE_MAX_SHIFT = 0.02;   // ± segundos de desvío de tiempo a cantidad 1
export const HUMANIZE_MAX_VEL = 0.25;     // ± de velocity a cantidad 1

export function humanizeHit(amount: number, rnd: () => number): { dt: number; dvel: number };
```

- `a = clamp(amount, 0, 1)`.
- `dt = (rnd() * 2 - 1) * HUMANIZE_MAX_SHIFT * a` (segundos; centrado en 0).
- `dvel = (rnd() * 2 - 1) * HUMANIZE_MAX_VEL * a`.
- Con `amount = 0` ⇒ `{ dt: 0, dvel: 0 }` (independiente de `rnd`). Con `rnd() = 0.5` ⇒ `{ 0, 0 }`.

### `onStep` (aplicación)

Donde hoy calcula `at`/`vel` y llama a `trigger`:

```ts
let at = when + swingOffset(i, daw.swing, secPerStep);
let vel = st.vel ?? SEQ_VEL;
const hz = c.humanize ?? 0;
if (hz > 0) { const h = humanizeHit(hz, Math.random); at += h.dt; vel = Math.max(0.05, Math.min(1, vel + h.dvel)); }
const gate = c.instrument.kind === 'drum' ? undefined : effectiveLen(arr, j) * secPerStep;
if (audio) audio.trigger(st.note ?? 60, vel, at, gate);
padHits.set(c.id, { t: at, vel });
```

(`at`/`vel` pasan de `const` a `let`; el resto del cuerpo del `for` no cambia.)

### UI (mando Human)

En `channelStripHTML`, dentro de `.chMix`, tras Vol y Pan:

```html
<div class="knobCell" title="Humanizar (arrastra ↕ · doble-clic a 0): desvía un poco tiempo e intensidad">
  <div class="knob" data-hum="${ch.id}"></div><span>Human</span></div>
```

En `renderMixer`, junto a los knobs de Vol/Pan:

```ts
const humEl = host.querySelector(`[data-hum="${c.id}"]`) as HTMLElement;
if (humEl) mountKnob(humEl, { min: 0, max: 1, value: c.humanize ?? 0, default: 0, size: 34, onChange: v => {
  daw = updateChannel(daw, c.id, { humanize: v }); persist();
} });
```

(No hay nodo de audio que actualizar: el motor lee `c.humanize` en vivo en `onStep`.)

## Persistencia y compatibilidad

- `humanize` viaja dentro del canal en el proyecto (JSON; `normalizeChannel` conserva el campo). **Sin
  migración:** canal sin `humanize` ⇒ `undefined` ⇒ tratado como 0 en `onStep`. Proyectos v0.28 abren igual.

## Qué NO cambia

- La rejilla/resolución ni el tempo, el swing, las notas guardadas, el resto del motor y de la vista. Es
  aditivo y reversible (a 0 % suena clavado).

## Bordes

- **Tope de tiempo:** `dt ∈ [−20, +20] ms` a cantidad 1. Menor que el adelanto del planificador
  (`LOOKAHEAD_SEC = 0.1`), así que un `at` desviado sigue siendo futuro; en el peor caso un desvío negativo lo
  deja ~ahora (Web Audio lo dispara al instante, sin fallo).
- **Velocity:** recortada a `[0.05, 1]` tras el desvío (nunca 0 ni saturada).
- **Aleatoriedad por disparo:** cada paso recalcula su desvío (cada vuelta del loop varía). Consciente: es más
  humano; no es determinista entre vueltas.
- **Batería/slicer/synth:** todos se humanizan igual (el desvío es de tiempo+velocity, común a todos); el `gate`
  del slicer/synth se calcula igual que antes (la longitud no cambia).

## Pruebas

- **Unitarias (Vitest, `daw/humanize.test.ts`):** `humanizeHit`:
  - `amount = 0` ⇒ `{ dt: 0, dvel: 0 }` (con cualquier `rnd`).
  - `rnd = () => 0.5` ⇒ `{ 0, 0 }` (centro).
  - `rnd = () => 1, amount = 1` ⇒ `{ +0.02, +0.25 }`; `rnd = () => 0, amount = 1` ⇒ `{ −0.02, −0.25 }`.
  - `amount` fuera de rango se recorta a `[0, 1]`.
- **No unitarias (typecheck + build + a oído):** el mando Human en el MIXER, el desvío al reproducir (subir el
  mando → suena más suelto; a 0 → clavado), persistencia.

## Restricciones globales

- Todo en `studio/`; no tocar `pianova.html`. TypeScript **strict**; sin dependencias nuevas.
- Comentarios/UI en español. Acento verde neón `var(--pv-acc)`.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
