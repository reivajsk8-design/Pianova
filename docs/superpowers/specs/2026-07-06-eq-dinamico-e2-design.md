# EQ dinámico por banda (E2) — Diseño

**Fecha:** 2026-07-06 · **Versión objetivo:** 0.26.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Añadir **dinámica por banda** al EQ gráfico (E1): cada banda puede **reaccionar al nivel** de su zona de
frecuencia (comprimir/expandir por frecuencia, estilo Waves F6) con **umbral / rango / ataque / liberación**.
El **mid/side** queda para un **E2b** aparte (decidido con el usuario).

## Enfoque técnico (control-rate, sin worklet ni dependencias)

Cada banda dinámica tiene un **detector** = filtro **paso-banda** (freq = banda, Q fijo ~2.5) alimentado desde
la **entrada** del EQ → un **AnalyserNode** (fftSize 256). Un bucle de control (`setInterval` ~60 Hz) mide el
nivel de esa banda (RMS→dB), calcula un **desplazamiento de ganancia** con umbral/rango/ataque/liberación y lo
aplica **sumado a la ganancia fija** del biquad de esa banda (con `ramp` corto). Es dinámica **musical y real**
(domar retumbes/durezas) aunque un pelín más suave que un compresor de audio-rate; migrable a AudioWorklet más
adelante si se quisiera "quirúrgico". El detector **no altera** la señal (solo la mide).

**Bucle:** corre mientras el efecto exista y **al menos una banda** tenga la dinámica activa; se arranca al
activar la primera y se para cuando no queda ninguna; se limpia en `dispose()`. Envolvente por banda:
`env += (target − env)·coef`, con `coef` de **ataque** al aumentar |offset| y de **liberación** al volver a 0.

## Modelo

Se extiende `EqBand` con dinámica (en `fx/eq-core.ts`):
```ts
export interface EqDyn { on: boolean; threshold: number; range: number; attack: number; release: number }
export interface EqBand { type: EqBandType; freq: number; gain: number; q: number; on: boolean; dyn: EqDyn }
```
`defaultDyn()` = `{ on:false, threshold:-24, range:-6, attack:20, release:150 }` (dB/ms; `range<0` = corta,
`range>0` = sube). `defaultBands()` incluye `dyn: defaultDyn()`. **Persistencia:** `bandsToParams`/
`bandsFromParams` aplanan también la dinámica (`b{i}_dyn_on`, `b{i}_thr`, `b{i}_range`, `b{i}_atk`, `b{i}_rel`);
compatibilidad hacia atrás: si faltan (proyectos v0.25), se rellenan con `defaultDyn()`.

**Helpers puros nuevos (testeables):**
- `dynTarget(levelDb, threshold, range, knee=18): number` — desplazamiento objetivo: 0 si `level≤threshold`,
  si no `range · min(1, (level−threshold)/knee)`.
- `envCoef(tauMs, dtMs): number` — `1 − exp(−dt/max(1,tau))` (coeficiente de envolvente por tick).

**`EqApi` gana** `setDyn(i: number, patch: Partial<EqDyn>): void`.

## Efecto (`fx/effects/eq-graphic.ts`)

- 8 **detectores** (bandpass→analyser) creados al montar, alimentados de `input`; la freq del detector sigue a
  `band.freq`. Un array `env[8]` (offset actual) y un `timer` (setInterval).
- `applyBand(i)`: pone freq/Q del biquad y del detector; la ganancia = `band.gain + env[i]` si `dyn.on`, o
  `band.gain` (u `0` si banda off) si no; también gestiona arrancar/parar el bucle según haya dinámicas.
- Bucle (`tick`): por cada banda con `dyn.on`, lee el nivel del analyser (RMS→dB), `target = dynTarget(...)`,
  `env[i] += (target−env[i])·coef` (coef de ataque/liberación), y `ramp(node.gain, band.gain+env[i], actx, 0.01)`.
- `eq.setDyn(i, patch)` mezcla en `bands[i].dyn`, re-aplica y arranca/para el bucle. `dispose()` limpia el
  `timer` y desconecta detectores. `magResponse` **no cambia** (lee la ganancia viva del biquad → la **curva se
  mueve** con la dinámica en el editor).

## Editor (`ui/eqEditor.ts`)

- Los **botones 1–8 pasan a SELECCIONAR** la banda (resaltada); el on/off de la banda se mueve al panel.
- **Panel de la banda seleccionada** (bajo el canvas): **☑ Activa** (banda on/off) · **☑ Dinámico** ·
  **Umbral**, **Rango**, **Ataque**, **Liberación** (knobs con `mountKnob`, como el panel de slice de S3). Al
  cambiar, llama `eq.setBand`/`eq.setDyn` + `onChange`. Arrastrar un nodo también selecciona su banda.
- La **curva** ya "respira" con la dinámica (via `magResponse`); el nodo se dibuja en la ganancia **fija**.

## Qué NO cambia

- El motor de audio base; la cadena de 8 biquads de E1; el resto de la vista. El **mid/side** (E2b).

## Bordes

- Al desactivar la dinámica de una banda, su offset vuelve a 0 (envolvente) y la ganancia queda en la fija.
  Varias instancias de EQ → cada una su propio bucle (solo si tiene dinámicas). Proyectos v0.25 cargan con
  `dyn` por defecto (dinámica apagada) → mismo sonido que antes.

## Pruebas

- **Unitarias (Vitest):** `dynTarget` (bajo umbral = 0, proporcional hasta `range`, knee), `envCoef` (rango
  0–1, más rápido con tau menor), `bandsToParams`/`bandsFromParams` con dinámica (ida y vuelta + defaults al
  faltar).
- **No unitarias:** el efecto (DSP, bucle) y el panel del editor → typecheck + build + prueba a oído/vista en la
  URL (activar dinámica en una banda, ver la curva reaccionar al nivel, ajustar umbral/rango/ataque/liberación).

## Restricciones globales

- Todo en `studio/`; no tocar `pianova.html`. TypeScript **strict**; sin dependencias nuevas.
- Comentarios/UI en español. Acento verde neón `var(--pv-acc)`.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
