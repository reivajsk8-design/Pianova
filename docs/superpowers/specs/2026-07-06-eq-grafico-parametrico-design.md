# EQ gráfico paramétrico (E1) — Diseño

**Fecha:** 2026-07-06 · **Versión objetivo:** 0.25.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Un **EQ gráfico paramétrico** estilo Waves F6: un **efecto de inserción** (en el rack de canal o del máster)
con un **editor gráfico** (curva interactiva de 8 bandas, espectro en tiempo real detrás, bandas arrastrables).
Es la **fase E1**; la parte **dinámica** (threshold/attack/release por banda) y **mid/side** quedan para E2.

**Decidido con el usuario:** efecto de inserción (canal + máster), **8 bandas**, con editor gráfico grande.

## Arquitectura

Se apoya en el sistema de efectos existente (`fx/effect.ts`, `fx/rack.ts`, `ui/rack.ts`). Novedad: un efecto
puede exponer una **API de EQ** para su editor a medida (el rack, en vez de knobs, muestra **✎ Editar EQ**).

- `fx/eq-core.ts` (nuevo, puro): tipos + bandas por defecto + presets + conversión bandas↔params + matemática
  del canvas. **Testeable.**
- `fx/effects/eq-graphic.ts` (nuevo): el efecto (cadena de 8 biquads) que implementa `Effect` + una `eq?: EqApi`
  opcional. Se registra en `EFFECTS`.
- `fx/effect.ts`: se añade el campo **opcional** `eq?: EqApi` a la interfaz `Effect` (los demás efectos lo dejan
  `undefined`).
- `ui/eqEditor.ts` (nuevo): `mountEqEditor(root, eq, onChange)` — canvas (espectro + curva + nodos).
- `ui/rack.ts`: para efectos con `e.eq`, la tarjeta muestra **✎ Editar** (sin knobs) + bypass/◀▶/✕; nuevo
  callback `onEdit?(effect)`.
- `app/studioView.ts`: overlay `#eqEditor` (modal nuevo) que se abre al pulsar ✎ y monta `mountEqEditor` para
  la `eq` de ese efecto; los dos `mountRack` (canal y máster) pasan `onEdit`.

## Motor (DSP)

Cadena en serie de **8 BiquadFilter**: índice 0 = `lowshelf`, 1–6 = `peaking`, 7 = `highshelf`.
Cada banda: `{ type, freq, gain, q, on }`. Por defecto **gain 0** (EQ transparente). Frecuencias por defecto
repartidas en log: 80 (LS) · 150 · 350 · 800 · 1800 · 4000 · 8000 (picos) · 12000 (HS); Q=1; on=true.
Los cambios se suavizan con `ramp()` (freq/gain/Q). Una banda `off` se puentea poniendo su `gain` a 0 (no se
reconstruye la cadena). El efecto crea un `AnalyserNode` (fftSize 2048) sobre su **entrada** para el espectro.

**`EqApi`** (lo que consume el editor):
- `getBands(): EqBand[]`
- `setBand(i: number, patch: Partial<EqBand>): void`  (mueve/ajusta una banda; suaviza y persiste vía onChange)
- `reset(): void` · `applyPreset(name: string): void` · `presetNames(): string[]`
- `analyser: AnalyserNode`

**Persistencia:** `serialize()` devuelve `{type:'eq-graphic', params, bypassed}` con las bandas **aplanadas** a
números (`b{i}_freq`, `b{i}_gain`, `b{i}_q`, `b{i}_on`); `create(actx, state)` las restaura. Encaja con el
guardado de proyecto actual (cada efecto serializa sus params).

## Editor gráfico (`ui/eqEditor.ts`)

Canvas estilo F6, con la matemática portada de `pianova.html`:
- Eje **X = frecuencia log** (FMIN=20 Hz, FMAX=20 kHz): `freqToX`/`xToFreq`. Eje **Y = ganancia** (±`GAIN_RANGE`
  dB, p. ej. 18): `gainToY`/`yToGain`. Rejilla de referencia (100/1k/10k; 0/±6/±12 dB).
- **Espectro** en tiempo real detrás (`analyser.getByteFrequencyData`, bucle `requestAnimationFrame`).
- **Curva de respuesta** combinando las 8 bandas (`biquad.getFrequencyResponse`, producto de magnitudes).
- **Nodos** de cada banda activa: arrastrar mueve **freq (X) + ganancia (Y)**; **rueda** cambia la **Q**;
  **clic** en un nodo lejano crea/activa; **doble-clic/clic derecho** desactiva la banda. (Interacción táctil:
  arrastre = mover.)
- **Presets** (desplegable) + botón **Plano** (reset). El editor llama `onChange` para persistir.
- Se cierra con ✕ o Esc. El bucle rAF se detiene al cerrar.

## Qué NO cambia

- El motor de audio base ni el enrutado; los demás efectos; el resto de la vista. Solo se **añade** el efecto,
  su editor y el gancho del rack.

## Fases (siguiente)

- **E2 (después):** dinámica por banda (threshold/attack/release) estilo F6, y **mid/side**. E1 es útil solo.

## Pruebas

- **Unitarias (Vitest):** `fx/eq-core.ts` — `defaultBands`, `bandsToParams`/`bandsFromParams` (ida y vuelta),
  `freqToX`/`xToFreq` (inversas), `gainToY`/`yToGain` (inversas), presets con claves válidas.
- **No unitarias:** el efecto (DSP), el editor (canvas) y el cableado → typecheck + build + prueba a oído/vista
  en la URL (añadir el EQ, abrir el editor, arrastrar bandas y oír el cambio, espectro/curva, presets, persistir).

## Restricciones globales

- Todo en `studio/`; no tocar `pianova.html`. TypeScript **strict**; sin dependencias nuevas.
- Comentarios/UI en español. Acento verde neón `var(--pv-acc)`.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
