# Diseño — Estudio: motor de oscilador editable (sinte pro por canal)

**Fecha:** 2026-07-01 · **Proyecto:** Estudio (`studio/`, rebuild pro) · **Estado:** diseño aprobado.
Primer sub-proyecto de la tanda de "mejoras de sonido" (las otras dos, pendientes de su propio ciclo:
samples de librerías propias y EQ gráfico pro). Construye sobre el groovebox de canales de la Fase 3
(v0.13.0). No toca `pianova.html`.

## Objetivo

Añadir un **tercer tipo de instrumento de canal**: un **sinte editable** (`synthx`) que convive con los
5 presets de synth fijos y la batería 808. Da control de **diseño de sonido** por canal: mezcla de
osciladores + sub + unison, envolvente ADSR, filtro LP/BP con resonancia y un LFO. Se edita en un **cajón
inferior** con knobs (mismo patrón que el panel de efectos). Portado y ampliado del "sinte editable por
canal" de `pianova.html` (v1.36).

## Alcance

**Dentro:**
1. Tipo de instrumento `{ kind: 'synthx'; params: SynthxParams }` en el modelo (`daw/model.ts`), conviviendo
   con `synth`/`drum`. Sin migración de proyecto (los proyectos v3 existentes no lo usan y siguen válidos).
2. Motor de audio `audio/synthx.ts` (`triggerSynthx`) — disparo agendado (secuenciador, con gate) y en vivo
   (teclado, con release).
3. DSP puro y testeable `audio/synthx-dsp.ts` (clamps + cálculos de unison/sub).
4. Integración en el canal (`daw/channel.ts`): rama `synthx` en `trigger()`.
5. UI: opción "🎚️ Sinte editable" en el selector del canal + botón ✏️ + **editor en cajón inferior**
   (`#synthDrawer`) con knobs por secciones (OSC/FILTRO/ADSR/LFO), botón Probar y Cerrar.
6. Presets de fábrica del sinte (Bajo, Lead, Pluck, Pad) + el sonido por defecto.
7. Persistencia tolerante (los `params` viven en `instrument`, se guardan con el proyecto; rellena
   defaults si faltan). Tests Vitest de DSP y modelo.

**Fuera (YAGNI / otros sub-proyectos):** samples de librerías propias, EQ gráfico pro, automatización,
segundo LFO, matriz de modulación, más tipos de filtro. No tocar `pianova.html`.

## Restricciones (heredadas)

- Todo en **`studio/`**; **Vite + TypeScript strict**; **Vitest**; **sin framework de UI**; textos/
  comentarios en **español**. No tocar `pianova.html`. Sin dependencias nuevas de instalación.
- El audio arranca tras gesto (`ensureAudio`). `exponentialRampToValueAtTime` **nunca** a 0 (mín. 0.0001).
- Lógica pura (clamps, unison/sub, defaults) separada del audio/DOM y testeada.
- El motor sigue el contrato del synth actual: disparo agendado con `when`+gate `dur` hacia un `dest`
  concreto (el `instrumentBus` del canal), sin tocar el mapa global de voces del teclado.
- Verificación: `npm run typecheck` + `npm test` + `npm run build`, y prueba por oído.

## Arquitectura (unidades)

### 1. `audio/synthx-dsp.ts` — DSP puro (testeable)
- `clamp01(v)`, `clampHz(v)` (20–20000), `clampQ(v)` (0.3–20), `clampTime(v)` (0–3) — portados de pianova.
- `unisonDetunes(cents: number): number[]` — desafinados (en cents) de las voces de unison; `0` → `[0]`
  (una voz), `>0` → `[+cents, -cents]` (dos voces simétricas). Puro.
- `subFreqRatio(): number` — el sub-oscilador suena una octava por debajo (ratio `0.5`). (Constante pura,
  expuesta como función para testear la relación.)
- `SYNTHX_DEFAULT: SynthxParams` y `SYNTHX_PRESETS: Record<string, SynthxParams>` (bajo, lead, pluck, pad).
- `normalizeParams(p: Partial<SynthxParams>): SynthxParams` — rellena defaults y aplica clamps a un objeto
  posiblemente incompleto (usado al parsear proyectos). Puro.

`SynthxParams`:
```ts
export interface SynthxParams {
  sine: number; square: number; saw: number;   // 0..1 blend de las 3 ondas base
  sub: number;                                  // 0..1 nivel del sub-oscilador (seno, una octava abajo)
  detune: number;                               // 0..50 cents de unison (0 = sin unison)
  filterType: 'lowpass' | 'bandpass';
  cutoff: number;                               // 20..20000 Hz
  resonance: number;                            // 0.3..20 Q
  attack: number; decay: number; sustain: number; release: number;  // ADSR (sustain 0..1)
  lfoDest: 'off' | 'pitch' | 'filter';
  lfoRate: number;                              // Hz (p. ej. 0.1..20)
  lfoDepth: number;                             // 0..1
}
```

### 2. `audio/synthx.ts` — motor de audio
- `triggerSynthx(actx, params, midi, vel, when, dur, dest): { stop(at:number):void } | void` — construye la
  voz: por cada onda con blend > 0, un `OscillatorNode` (más su gemelo de unison si `detune>0`) a la
  frecuencia de la nota; el sub-oscilador a media frecuencia con nivel `sub`. Todos → `GainNode` (envolvente
  ADSR: ataque a pico, decay a nivel de sustain; release al gate/soltar) → `BiquadFilter` (LP/BP, `cutoff`,
  `Q`) → `dest`. Si `lfoDest !== 'off'`: un `OscillatorNode` LFO (`lfoRate`) con un `GainNode` de
  profundidad modula el `detune` de los osciladores (pitch) o el `frequency` del filtro. La voz se agenda en
  `when`, se detiene tras el release; el LFO se detiene con la voz (teardown). Reutiliza el patrón de
  `triggerVoice` de `synth.ts` (gate para el secuenciador; en vivo, gate largo + release al soltar).
- Contrato en vivo (teclado): `noteOnSynthx(params, midi, vel, dest)` / `noteOffSynthx(midi)` mantienen una
  voz sostenida con release, análogos a `synth.noteOn/noteOff` (para el canal seleccionado que toca el
  teclado). *(Si el enrutado de teclado del Estudio ya dispara por canal de otra forma, se adapta a ese
  mecanismo; la parte estable es `triggerSynthx` agendado.)*

### 3. `daw/model.ts` — modelo
- `InstrumentSpec` gana la variante `{ kind: 'synthx'; params: SynthxParams }`.
- Helper `defaultSynthxInstrument(): InstrumentSpec` (usa `SYNTHX_DEFAULT`).
- Las operaciones de canal existentes no cambian; el `instrument` se sustituye al elegir "Sinte editable".

### 4. `daw/channel.ts` — canal de audio
- En `trigger(note, vel, when)`: rama nueva `instrument.kind === 'synthx'` → `triggerSynthx(actx,
  instrument.params, note, vel, when, 0.12, instrumentBus)`. (Las ramas `drum`/`synth` intactas.)

### 5. UI — selector, botón y editor en cajón
- `ui/channelstrip.ts`: en el `<select class="chInst">`, un `optgroup` "Sinte editable" con la opción
  `value="synthx"`; y un botón `data-syned` (✏️) visible solo cuando `ch.instrument.kind === 'synthx'`.
- `ui/synthEditor.ts` (nuevo): `synthEditorHTML(params)` (los controles) + montaje de knobs (`ui/knob.ts`)
  y selectores (filtro, LFO dest, cargar preset). Secciones: **OSC** (seno/cuadrada/sierra/sub/detune),
  **FILTRO** (tipo + corte + resonancia), **ADSR** (a/d/s/r), **LFO** (dest + velocidad + profundidad).
  Botones **▶ Probar** (dispara `triggerSynthx` con una nota fija) y **✕ Cerrar**. Cada control, al cambiar,
  actualiza `params` del canal en el modelo y persiste con *debounce*; el sonido cambia en vivo.
- `app/studioView.ts`: cajón inferior `#synthDrawer` (mismo mecanismo `.open` que `#fxDrawer`), abierto por
  `data-syned`; delegación de eventos como el resto de la tira.

### 6. Persistencia (`app/store.ts`)
- Al parsear un proyecto, un canal con `instrument.kind === 'synthx'` pasa por `normalizeParams` para
  rellenar defaults/aplicar clamps (tolerante a datos incompletos o de versiones futuras).
- **Sin migración ni cambio de versión de proyecto**: los proyectos v3 sin `synthx` siguen válidos; un
  proyecto que ya use `synthx` se abre en cualquier build con el motor.

## Flujo de datos (resumen)
```
Canal 'synthx' -> trigger(note,vel,when) -> triggerSynthx(params,...) ->
  osc(blend+sub+unison) -> gain(ADSR) -> filtro(LP/BP,cutoff,Q) [-> LFO a pitch/filtro] -> instrumentBus
  instrumentBus -> [rack canal] -> vol/mute -> pan -> masterIn -> ... -> salida
Editor (cajón) -> mueve knob -> actualiza params del canal (modelo) -> persist(debounce) -> suena en vivo
Guardar/Abrir: params dentro de instrument del canal <-> proyecto (normalizeParams al abrir)
Tests: clamps, unisonDetunes, subFreqRatio, normalizeParams; modelo synthx (crear/round-trip/incompleto)
```

## Riesgos / notas
- **LFO y limpieza:** el `OscillatorNode` del LFO debe pararse cuando la voz termina (teardown) para no
  fugar nodos; se sigue el patrón de teardown ya usado en los efectos de modulación de la Fase 2.
- **Coste de CPU:** unison duplica osciladores; con muchas voces/canales sube. Aceptable para uso normal;
  el limitador maestro contiene picos. (Sin polifonía desbocada: una voz por nota, como el synth actual.)
- **Enrutado en vivo del teclado:** hay que enganchar `noteOnSynthx/noteOffSynthx` al mecanismo con el que
  el Estudio ya envía el teclado al canal seleccionado; se confirma en el plan leyendo ese enrutado.
- **Rampas nunca a 0** (usar 0.0001) y **sustain mínimo** > 0 para evitar excepciones (como en pianova).

## Verificación
- `npm run typecheck` + `npm test` (synthx-dsp + modelo) + `npm run build`.
- **Manual (Chrome/Edge):** poner un canal en "Sinte editable", abrir el editor, mover osciladores/ADSR/
  filtro/LFO y oír el cambio; Probar; cargar un preset; secuenciarlo; guardar y reabrir el proyecto.
  `pianova.html` sigue igual.
- Actualizar `HANDOFF.md`/`CLAUDE.md` y subir versión de `studio/package.json` al cerrar.
