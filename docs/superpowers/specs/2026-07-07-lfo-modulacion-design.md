# LFOs asignables (modulación de knobs) — Diseño

**Fecha:** 2026-07-07 · **Versión objetivo:** 0.43.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Un **banco de 4 LFOs** (osciladores de baja frecuencia) compartidos que se pueden **asignar a cualquier knob**
para que el parámetro se mueva solo, en bucle. Da vida a los sonidos (filtros que respiran, panorámicas que se
balancean, volúmenes que laten). El LFO **modula alrededor** del valor que dejas en el knob: mueve el audio y el
indicador del mando, pero **no sobrescribe** el valor base guardado.

## Decisiones tomadas (con el usuario)

- **Banco compartido de 4 LFOs**, cada uno asignable a varios knobs a la vez (varios parámetros en sincronía).
- **Velocidad sincro y libre**, conmutable por LFO: sincronizada al tempo (figuras) o libre en Hz.
- **Asignación por knob** vía su menú (clic derecho / long-press), como el MIDI-learn ya existente.
- **Modular solo el audio**, sin tocar el valor base ni persistir cada frame.
- **Persistencia en el proyecto** (se guarda con la canción), campo opcional tolerante, sin migración.
- **Destinos iniciales:** knobs con parámetro de audio en vivo — Volumen, Paneo y knobs de efectos. (El synth
  editable y el EQ se pueden sumar luego con el mismo seam; Human/Swing quedan fuera por leerse por paso.)
- **Panel del banco** plegable, junto al rack maestro.

## Arquitectura

Módulos, de más interno a más externo:

1. **`mod/lfo.ts` (puro):** formas de onda y cálculo de periodo/valor. Testeable, sin estado ni DOM.
2. **`mod/modEngine.ts` (motor, singleton):** el banco de LFOs, las asignaciones, el registro de destinos y el
   `tick()` que aplica la modulación. La app posee el bucle rAF que llama a `tick()`.
3. **`ui/knob.ts`:** el "seam" — `onModulate?` opcional; los knobs modulables se registran en el motor.
4. **`ui/knobMenu.ts`:** entrada "Modular (LFO)" que abre el asignador (elegir LFO + profundidad).
5. **`ui/lfoPanel.ts` (nuevo):** editor compacto del banco (por LFO: on/off, onda, Sincro/Hz, velocidad).
6. **`app/studioView.ts`:** cablea `onModulate` (Vol/Pan/efectos), monta el panel, alimenta BPM y el bucle rAF,
   y carga/guarda el estado en el proyecto.
7. **`app/store.ts`:** campo opcional `mod` en el proyecto (serializa/parsea, tolerante).

### 1. `mod/lfo.ts`

```ts
export type LfoWave = 'sine' | 'tri' | 'sawUp' | 'sawDown' | 'square' | 'random';

// Pseudoaleatorio determinista en [0,1) a partir de un entero (para el Sample & Hold; sin Math.random → puro).
export function hash01(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// Valor del LFO en [-1,1]. `t` = tiempo/periodo (parte entera = ciclo, fracción = fase).
export function lfoValue(wave: LfoWave, t: number): number {
  const p = t - Math.floor(t);                 // fase 0..1
  switch (wave) {
    case 'sine':    return Math.sin(2 * Math.PI * p);
    case 'tri':     return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;  // empieza en 0
    case 'sawUp':   return 2 * p - 1;
    case 'sawDown': return 1 - 2 * p;
    case 'square':  return p < 0.5 ? 1 : -1;
    case 'random':  return hash01(Math.floor(t)) * 2 - 1;   // estable dentro de cada ciclo (S&H)
    default:        return 0;                                // salida segura (TS strict: switch exhaustivo)
  }
}

// Figuras de sincronización (en negras/beats).
export interface RateFigure { key: string; label: string; beats: number }
export const RATE_FIGURES: RateFigure[] = [
  { key: '2c',   label: '2 comp', beats: 8 },
  { key: '1c',   label: '1 comp', beats: 4 },
  { key: '1/2',  label: '1/2',    beats: 2 },
  { key: '1/4',  label: '1/4',    beats: 1 },
  { key: '1/8',  label: '1/8',    beats: 0.5 },
  { key: '1/16', label: '1/16',   beats: 0.25 },
  { key: '1/4T', label: '1/4T',   beats: 2 / 3 },
  { key: '1/8T', label: '1/8T',   beats: 1 / 3 },
];

// Periodo en segundos. sync: figura·(60/bpm). free: 1/Hz. Con guardas (bpm/hz ≤ 0 → valor seguro).
export function periodSeconds(mode: 'sync' | 'free', rateKey: string, hz: number, bpm: number): number {
  if (mode === 'free') return hz > 0 ? 1 / hz : 1;
  const fig = RATE_FIGURES.find(f => f.key === rateKey);
  const beats = fig ? fig.beats : 1;
  return beats * (60 / Math.max(1, bpm));
}
```

Comportamiento esperado (para tests): `lfoValue('sine',0)=0`; `lfoValue('tri',0)=0`, `('tri',0.25)=1`,
`('tri',0.5)=0`, `('tri',0.75)=-1`; `sawUp(0)=-1`, `sawUp(0.5)=0`; `square(0.25)=1`, `square(0.75)=-1`;
`random` constante para `t` dentro de `[k,k+1)` y (con alta probabilidad) distinto entre ciclos. `periodSeconds`:
sync `'1/4'` a 120 bpm = 0.5 s; free 2 Hz = 0.5 s; guardas con bpm 0 y hz 0.

### 2. `mod/modEngine.ts`

```ts
import { lfoValue, periodSeconds, type LfoWave } from './lfo';

export interface LfoConfig { on: boolean; wave: LfoWave; mode: 'sync' | 'free'; rateKey: string; hz: number }
export interface Assignment { lfo: number; depth: number }         // depth 0..1 (fracción bipolar del rango)
export interface ModState { lfos: LfoConfig[]; assign: Record<string, Assignment> }

// Destino runtime que registra cada knob modulable (NO se persiste).
export interface ModTarget {
  min: number; max: number;
  getBase: () => number;                 // valor base actual del knob (lo que el usuario dejó)
  applyAudio: (v: number) => void;       // aplica al audio SIN guardar
  setVisual?: (v: number) => void;       // mueve el indicador del mando (opcional)
}

export const LFO_COUNT = 4;
export function defaultLfos(n = LFO_COUNT): LfoConfig[];   // {on:false, wave:'sine', mode:'sync', rateKey:'1/4', hz:1}
export function defaultModState(): ModState;               // { lfos: defaultLfos(), assign: {} }
```

Singleton `modEngine` (mismo patrón que `midiLearn`):

- `register(id, target)` / `unregister(id)` — registro runtime de destinos por id (el mismo `midiId` del knob).
- `getState(): ModState` / `setState(s: ModState)` — para cargar/guardar en el proyecto; `setState` sanea
  (nº de LFOs, índices de asignación en rango, depth 0..1, valores de enum válidos).
- `assign(id, lfo, depth)` / `unassign(id)` / `getAssign(id): Assignment | undefined`.
- `setLfo(i, patch: Partial<LfoConfig>)` / `getLfos(): LfoConfig[]`.
- `setBpm(bpm)` — la app la actualiza al cambiar el tempo.
- `isActive(): boolean` — hay algún LFO `on` con al menos una asignación a un destino registrado.
- `tick(timeSec: number)` — núcleo:
  - Para cada `id` con asignación cuyo `lfos[a.lfo].on` y con destino registrado (**activo**):
    `period = periodSeconds(lfo.mode, lfo.rateKey, lfo.hz, bpm)`; `w = lfoValue(lfo.wave, timeSec / period)`;
    `v = clamp(base + a.depth*(max-min)*w, min, max)`; `applyAudio(v)`; `setVisual?.(v)`.
  - Para destinos que **dejaron de estar activos** desde el último `tick` (LFO apagado o desasignado): restaurar
    una vez `applyAudio(getBase())` + `setVisual?.(getBase())`. (Se lleva un `Set` de ids activos previos.)

El motor **no** posee el rAF: la app llama a `tick(actx.currentTime)` desde un bucle mientras `isActive()`. Así el
motor es testeable sin rAF ni reloj real (se le pasa el tiempo).

### 3. `ui/knob.ts` (seam)

`KnobOpts` gana `onModulate?: (v: number) => void` (aplica **solo al audio**, sin guardar). Si el knob tiene
`midiId` **y** `onModulate`, se registra en el motor:

```ts
if (midiId && opts.onModulate) {
  modEngine.register(midiId, {
    min: opts.min, max: opts.max,
    getBase: () => value,                                   // el valor base (persistido) del knob
    applyAudio: opts.onModulate,
    setVisual: (v) => { ind.style.transform = `rotate(${valueToAngle(v, opts.min, opts.max)}deg)`; },
  });
}
```

El valor base (`value`) solo cambia cuando el **usuario** mueve el knob (`onChange` de siempre). El motor mueve el
indicador y el audio de forma transitoria; al desasignar/apagar, restaura la posición base. Re-montar el knob (por
re-render) vuelve a registrar por el mismo id (sobrescribe, sin fugas). Al **borrar un canal** se llama
`modEngine.unregister` de sus ids para no dejar destinos muertos.

### 4. `ui/knobMenu.ts` (asignación por knob)

`openKnobMenu` gana `modId?: string` y `onModChanged?: () => void`. Si hay `modId`, el menú muestra **"Modular
(LFO)"**; al pulsarlo aparece un asignador pequeño: botones **Ninguno / LFO 1..4** (radio, marca el asignado) y un
deslizador **Profundidad** (0–100 %). Lee/escribe `modEngine.getAssign`/`assign`/`unassign(modId)`. El punto verde
"mapeado" del knob (clase CSS) se puede reutilizar para indicar "modulado" (o una clase propia `.modulated`).

### 5. `ui/lfoPanel.ts` (banco)

Panel compacto y **plegable** con los 4 LFOs. Por LFO: **LED on/off**, selector de **forma de onda**, interruptor
**Sincro/Hz**, y la **velocidad** (selector de figura si Sincro; campo numérico Hz si libre). Lee/escribe
`modEngine.getLfos`/`setLfo`. Estilo verde neón del tema, denso (como el resto de paneles). Se monta en un host
`#lfoPanel` en la vista, junto al rack maestro. Al cambiar cualquier LFO, persiste (callback `onChange`).

### 6. `app/studioView.ts` (cableado)

- **`onModulate` en Vol/Pan** (en `renderMixer`): `onModulate: v => channels.find(a=>a.id===c.id)?.setVolume(v)`
  (y `setPan(v)`), sin `updateChannel`/`persist`.
- **`onModulate` en efectos** (`ui/rack.ts`): `mountKnob` recibe `onModulate: v => e.setParam(p.name, q)` (aplicar
  al efecto sin llamar al `onChange` que persiste). Requiere pasar `onModulate` desde `mountRack`.
- **Panel:** montar `mountLfoPanel(host, { onChange: persist })`; `host` = nuevo `#lfoPanel`.
- **BPM:** al iniciar audio y al cambiar el BPM, `modEngine.setBpm(daw.bpm)`.
- **Bucle rAF:** un bucle propio (o reutilizar el visual) que, mientras `modEngine.isActive()`, llama a
  `modEngine.tick(getAudioContext()?.currentTime ?? 0)`; se auto-detiene cuando no hay LFOs activos. Arranca al
  encender un LFO / crear una asignación y al iniciar el audio.
- **Menú del knob:** pasar `modId` (= el `midiId`) y `onModChanged: persist` a `openKnobMenu` desde `mountKnob`.
- **Carga/guardado:** al arrancar, `modEngine.setState(project.mod ?? defaultModState())`; en `persist`, incluir
  `mod: modEngine.getState()` en el objeto que se serializa.
- **Borrado de canal:** `modEngine.unregister(\`vol:${id}\`)`, `pan:${id}`, etc., y limpiar sus asignaciones.

### 7. `app/store.ts` (persistencia)

`ProjectState` gana `mod?: ModState`. `serializeProject` lo incluye si está; `parseProject` lo lee tolerante
(ausente → `defaultModState()` al cargar en el motor; el store puede dejarlo `undefined` y que la app aplique el
defecto). **Sin cambio de versión de proyecto** (sigue en 3). Los `saveStore`/`downloadProject` del `studioView`
añaden `mod: modEngine.getState()` al objeto.

## Flujo de datos

Usuario mueve knob → `onChange` (base + audio + persist). LFO on + asignación → `tick` cada frame:
`base(getBase) + depth·rango·onda` → `applyAudio` (audio) + `setVisual` (indicador). El base y lo guardado no
cambian. Apagar/desasignar → restaurar base una vez.

## Qué NO cambia

- El valor base de los knobs ni el estado guardado por la modulación (solo el audio en vivo y el indicador).
- El motor de audio, el secuenciador, los efectos, el mezclador, los medidores, los acordes.
- La versión del proyecto (3) — el campo `mod` es opcional y tolerante.

## Bordes

- **Sin destinos registrados / audio no iniciado:** `tick`/`isActive` no hacen nada hasta que se montan los knobs.
- **Base cerca de un extremo:** la modulación se recorta a `[min,max]` (asimétrica cerca del borde; aceptable).
- **BPM cambia:** el periodo se recalcula en el siguiente `tick` (sin discontinuidad audible relevante).
- **Transporte parado:** el LFO sigue corriendo (usa el reloj de audio), para diseñar sonido en cualquier momento.
- **Canal borrado:** se desregistran sus destinos y se limpian sus asignaciones para no modular ids muertos.
- **Proyecto viejo sin `mod`:** carga con el banco por defecto (todos los LFOs apagados, sin asignaciones).
- **`random` (S&H):** estable dentro de cada ciclo; salta en cada nuevo ciclo del periodo.

## Pruebas

- **`mod/lfo.test.ts`:** `lfoValue` en fases clave por onda (valores del bloque de arriba); `hash01` determinista y
  en [0,1); `random` estable dentro del ciclo y distinto entre ciclos elegidos; `periodSeconds` sync/free y guardas
  (bpm 0, hz 0); `RATE_FIGURES` con los beats correctos.
- **`mod/modEngine.test.ts`:** `defaultModState`/`defaultLfos`; `setState` sanea (índice fuera de rango, depth
  fuera de 0..1, enum inválido); `assign`/`unassign`/`getAssign`; `tick` con un destino falso aplica
  `base + depth·rango·onda` (comprobar el valor con una onda/tiempo concretos) y **restaura** el base al apagar el
  LFO o desasignar; `isActive` refleja LFO on + asignación con destino; `getState`/`setState` ida y vuelta.
- **`app/store.test.ts`:** un proyecto con `mod` sobrevive a `serializeProject`/`parseProject`.
- **No unitarias (typecheck + build + a oído/vista):** asignar un LFO a Volumen/Paneo/un efecto y oír/ver el
  parámetro moverse; conmutar Sincro/Hz y notar el cambio de velocidad; apagar el LFO y ver que el knob vuelve a su
  sitio; guardar y reabrir el proyecto conservando el banco y las asignaciones.

## Restricciones globales

- Todo en `studio/`; **no tocar `pianova.html`**. TypeScript strict; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón del tema.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con el trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
