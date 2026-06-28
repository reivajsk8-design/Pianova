# Diseño — Proyecto pro · Fase 2: Suite de efectos TAP completa

**Fecha:** 2026-06-28 · **Proyecto:** Estudio (`studio/`, rebuild pro) · **Estado:** diseño aprobado.
Fase 2 de la hoja de ruta (ver CLAUDE.md decisión 5 / [[pianova-audio-pendientes]]). Construye sobre
la Fase 1 (cadena maestra + synth + MIDI + teclado en la vista Estudio).

## Objetivo

Reimplementar en Web Audio la **suite completa de efectos TAP** (Tom's Audio Processing, ~19 efectos
del repo LMMS/tap-plugins) como un **módulo de efectos** del Estudio, montables en **racks de inserción**
reutilizables. Entregable: en el Estudio puedes añadir/quitar/reordenar efectos en un **rack del
instrumento** (sobre lo que tocas) y en un **rack maestro** (sobre la mezcla), oírlos en vivo, y
**guardar el proyecto a un archivo** (además del autoguardado en el navegador).

## Enfoque (decidido)

- **Fidelidad híbrida:** nodos **nativos** de Web Audio cuando el resultado es indistinguible del
  original (más ligero y rápido); **port exacto en AudioWorklet** solo para los efectos con carácter
  propio (Reverberator, Dynamics, DeEsser, TubeWarmth, Pitch Shifter, Pink/Fractal Noise).
- **Dos puntos de inserción** con el **mismo** componente de rack: rack del **instrumento** y rack
  **maestro**. En F3, cada canal montará otro rack igual sin rehacer nada.
- **Entrega por tandas de familia:** un solo diseño (esta spec) con los 19; luego planes/entregas por
  tandas, probando cada una en cuanto llega.

## Alcance

**Dentro:**
1. **Marco de efectos** (`fx/effect.ts`): interfaz `Effect` común + registro `EFFECTS` (los 19).
2. **Motor de rack** (`fx/rack.ts`): cadena ordenada de efectos entre una entrada y una salida;
   añadir/quitar/reordenar/bypass/serializar; paso seco cuando está vacía.
3. **UI del rack** (`ui/rack.ts`): tarjetas de efecto con bypass/reordenar/quitar y deslizadores de
   parámetros generados desde `getParams()`; botón "➕ Añadir efecto" agrupado por familia.
4. **Integración en la vista Estudio** (`app/studioView.ts`): rack del instrumento + rack maestro
   visibles, más botones **💾 Guardar proyecto** / **📂 Abrir proyecto**.
5. **Persistencia** (`app/store.ts`): autoguardado en `localStorage` (`estudio-v1`) + guardar/abrir
   proyecto a archivo `.json`. Misma `serialize()` para las dos capas.
6. **Los 19 efectos** (`fx/effects/<nombre>.ts`), nativos o AudioWorklet según el reparto de abajo.
7. **Tests Vitest:** funciones DSP puras, lógica del rack y serialización del proyecto.

**Fuera (fases posteriores, YAGNI ahora):** canales/looper/step-grid (F3), módulo Aprender (F4),
conmutación del sitio (F5), presets de efectos con nombre, exportar audio WAV (puede añadirse después;
no en F2). No tocar `pianova.html`.

## Restricciones (heredadas)

- Todo en **`studio/`**; **Vite + TypeScript strict**; **Vitest**; **sin framework de UI** (DOM a mano);
  textos/comentarios en **español**. No tocar `pianova.html`.
- Reusar la Fase 1: `ensureAudio`/`getAudioContext` (`audio/context.ts`), `setupMasterBus`/`masterDest`
  (`audio/masterBus.ts`), el motor `synth` (`audio/synth.ts`).
- El audio arranca tras gesto del usuario (`ensureAudio`). `exponentialRampToValueAtTime` nunca a 0.
- **Portar con fidelidad** (híbrido): los efectos en AudioWorklet copian el algoritmo del C original;
  los nativos replican el comportamiento audible con nodos de Web Audio.
- AudioWorklet: la **función de DSP por muestra se extrae a un módulo puro** (testeable en Vitest) que
  el `AudioWorkletProcessor` envuelve. El módulo del worklet se carga con `audioWorklet.addModule(url)`
  usando una URL de Vite (`new URL('...worklet.ts', import.meta.url)`).
- Verificación por tanda: `npm run typecheck` + `npm test` + `npm run build`, y prueba por oído.

## Arquitectura (unidades)

### 1. `fx/effect.ts` — interfaz y registro
- `ParamSpec = { name, label, min, max, step, default, unit? }` (describe un parámetro para la UI).
- `interface Effect { id; type; input: AudioNode; output: AudioNode; setParam(name, value): void;
  getParams(): ParamSpec[]; bypass(on: boolean): void; serialize(): EffectState; dispose(): void; }`.
- `EffectState = { type: string; params: Record<string, number>; bypassed: boolean }`.
- `type EffectFactory = (actx: AudioContext, state?: EffectState) => Effect`.
- `EFFECTS: Record<string, { label: string; family: Family; params: ParamSpec[]; create: EffectFactory }>`.
  `Family = 'delay' | 'mod' | 'dyn' | 'color' | 'tone'`.
- Helper `makeEffect(...)` para los efectos nativos: crea `input`/`output` (GainNodes), una ruta seca y
  una ruta procesada, y resuelve `bypass` conmutando entre ambas; cada efecto solo define su cadena
  interna y cómo aplica cada parámetro.

### 2. `fx/rack.ts` — motor de rack (insert chain)
- `createRack(actx, input: AudioNode, output: AudioNode): Rack`.
- `Rack`: `add(type): Effect`, `remove(id)`, `move(id, dir: -1|1)`, `list(): Effect[]`,
  `bypass(id, on)`, `serialize(): RackState`, `restore(state)`, `dispose()`.
- Reconexión: desconecta todo y reencadena `input → fx0 → fx1 → … → output`; con la lista vacía,
  `input → output` (seco). La lógica de orden/serialización es **pura y testeable** (un helper
  `reorder(list, id, dir)` y `serializeRack(list)` separados del grafo de audio).
- `RackState = { effects: EffectState[] }`.

### 3. `ui/rack.ts` — UI del rack
- `mountRack(root, rack, title): () => void`. Pinta el título, la lista de tarjetas y el botón
  "➕ Añadir efecto" (menú agrupado por `family`). Devuelve limpieza.
- Tarjeta: cabecera (nombre, Bypass, ↑, ↓, ✕) + deslizadores construidos desde `effect.getParams()`;
  `input`/`change` → `effect.setParam` + guardar. Reordenar/añadir/quitar → reconstruye la lista y
  guarda. Estilo CSS reutilizando el del Estudio (clases `.rack`, `.fxCard`, `.fxHead`, `.fxParam`).

### 4. Integración y routing (`app/studioView.ts`, `audio/`)
- **Rack del instrumento:** se crea un `instrumentBus` (GainNode). El synth deja de conectar las voces
  directamente a `masterDest()`; se añade `setSynthOut(node)` en `synth.ts` y se apunta a
  `instrumentBus`. El rack del instrumento va `instrumentBus → [rack] → masterDest()`.
- **Rack maestro:** se inserta en `masterBus.ts` un punto `masterFxIn → masterFxOut` antes del
  limitador: `masterIn → [rack maestro] → limitador → soft-clip → final → destination`. Se exponen
  `masterFxIn()`/`masterFxOut()` para anclar el rack.
- La vista Estudio monta los dos racks (UI) y los botones de proyecto.

### 5. `app/store.ts` — persistencia
- `loadStore()/saveStore()` sobre `localStorage` clave `estudio-v1`. Estado:
  `{ instrument: string; instrumentRack: RackState; masterRack: RackState }`.
- Autoguardado: cada cambio (instrumento, racks) llama a `saveStore` (con debounce simple).
- **Proyecto a archivo:** `saveProject()` serializa el estado a JSON y lo descarga como
  `proyecto.estudio.json` (Blob + enlace). `openProject(file)` lee el archivo, valida el `version` y
  reconstruye instrumento + racks. Formato `{ version: 1, instrument, instrumentRack, masterRack }`.
- La (de)serialización del proyecto es **pura y testeable** (un helper que toma/produce el objeto de
  estado, sin tocar DOM ni audio).

## Los 19 efectos (reparto y familias = tandas de entrega)

Notación: **(W)** = AudioWorklet (DSP a medida); el resto, nodos nativos de Web Audio.

**Tanda 1 — Marco + rack** (sin efectos): unidades 1–5 de la arquitectura. Deliverable: rack vacío
funcional (paso seco), dos puntos de inserción, persistencia + guardar/abrir proyecto.

**Tanda 2 — Delays / Espacio** (`family: 'delay'`)
- **Echo** — `DelayNode` + realimentación (`gain`) + filtro paso-bajo en el lazo + wet/dry.
- **Stereo Echo** — dos líneas de delay (L/R) con tiempos/realimentación independientes + cruce.
- **Reflector** — delay con realimentación invertida (efecto "reflexión"); nativo.
- **Reverberator** — **(decisión 2026-06-28: nativo, no AudioWorklet)** `ConvolverNode` con impulso
  generado (ruido con caída exponencial, presets sala/hall/placa por tamaño/decay) + filtro de color +
  dry/wet. Suena muy bien y es ligero; la maquinaria AudioWorklet se introduce cuando un efecto la
  necesite de verdad (p. ej. Pitch Shifter o la curva de Dynamics). La generación del impulso es **pura
  y testeable** (muestras = ruido·envolvente, PRNG con semilla).

**Tanda 3 — Modulación** (`family: 'mod'`)
- **Tremolo** — `GainNode` modulado por LFO (`OscillatorNode`); profundidad, frecuencia, forma.
- **AutoPanner** — `StereoPannerNode` modulado por LFO; profundidad, frecuencia.
- **Chorus/Flanger** — `DelayNode` corto modulado por LFO + realimentación + wet/dry (un efecto con
  modo chorus/flanger según rango de delay).
- **Fractal Doubler** — varias líneas de delay corto con modulación pseudo-aleatoria (engrosa la voz).
- **Rotary Speaker** — simulación Leslie: rotor grave + agudo con LFO de velocidad (lenta/rápida),
  combinando modulación de amplitud, paneo y filtro; nativo.

**Tanda 4 — Dinámica** (`family: 'dyn'`) — **(decisión 2026-06-28: toda nativa; el `DynamicsCompressorNode`
da un compresor de calidad de DAW; AudioWorklet se reserva para el Pitch Shifter de la Tanda 6.)**
- **Scaling Limiter** — `DynamicsCompressorNode` con ratio alto + makeup (como el bus maestro).
- **Dynamics (estéreo)** — `DynamicsCompressorNode` con controles completos (umbral/ratio/ataque/release/
  knee) + makeup; detección estéreo enlazada (la nativa).
- **Dynamics (mono)** — igual, pero sumando a mono primero (`GainNode` con `channelCount=1`,
  `channelCountMode='explicit'`) → compresión/salida mono.
- **DeEsser** — de-esser por bandas: separa grave (`lowpass`) y agudo (`highpass`), comprime **solo** la
  banda aguda (`DynamicsCompressorNode`) y vuelve a sumar; al subir las sibilancias, esa banda se atenúa.

**Tanda 5 — Color / EQ** (`family: 'color'`) — **(decisión 2026-06-28: toda nativa.)**
- **TubeWarmth** — **(nativo, no AudioWorklet)** la saturación de válvula es una transferencia estática
  (memoryless) → `WaveShaper` con curva `tubeSample(x, drive, warmth)` (asimétrica = armónicos pares),
  regenerada con debounce al cambiar drive/warmth, `oversample='4x'` + dry/wet. La curva es **pura y
  testeable**.
- **Sigmoid Booster** — `WaveShaper` con curva **sigmoide** (curva estática → nativo y exacto).
- **Equalizer** — cadena de `BiquadFilter` (3 bandas: low shelf / peaking medios con frecuencia /
  high shelf).
- **Equalizer/BW** — banda peaking paramétrica con control de **ancho de banda** (octavas → Q vía
  `bandwidthToQ`, pura y testeable).

**Tanda 6 — Tono / Generadores** (`family: 'tone'`)
- **Pitch Shifter (W)** — desplazamiento de tono granular/PSOLA; semitonos + mezcla.
- **Pink/Fractal Noise (W)** — generador de ruido rosa/fractal (fuente); nivel.

Resumen: **17 nativos** + **2 AudioWorklet** (decisiones 2026-06-28: Reverberator, toda la Dinámica y
TubeWarmth pasaron a nativos; AudioWorklet queda para Pitch Shifter y Pink/Fractal Noise). Total **19**.

## Flujo de datos (resumen)
```
synth -> instrumentBus -> [rack instrumento] -> masterDest()=masterIn
masterIn -> [rack maestro] -> limitador -> soft-clip -> final -> destination
UI: ➕ añadir/quitar/reordenar/bypass -> rack reconecta el grafo ; sliders -> setParam
guardar: estado -> serialize -> localStorage  y/o  archivo .json (descarga)
abrir: archivo .json -> validar version -> reconstruir instrumento + racks
tests: curvas/coeficientes/ruido/param-map (puros) ; reorder/serializeRack ; (de)serialize proyecto
```

## Pruebas (Vitest)
- **DSP puro** (un módulo por efecto W): curva sigmoide, curva de válvula, coeficientes peine/all-pass
  de la reverb, algoritmo de ruido rosa, curva de transferencia de Dynamics, mapeos de parámetros.
- **Rack:** `reorder`, `serializeRack`/restore (orden y parámetros se conservan).
- **Proyecto:** serializar→deserializar reconstruye el mismo estado (instrumento + ambos racks).
- Los AudioWorklet importan su función pura; el mismo código probado corre en el audio.
- Manual por oído (Chrome/Edge + móvil): añadir cada efecto y comprobar que suena y que bypass/orden
  funcionan; guardar proyecto, recargar, abrir el archivo y ver que vuelve igual.

## Riesgos / notas
- **AudioWorklet + Vite:** cargar el processor con `new URL('...worklet.ts', import.meta.url)` y
  `audioWorklet.addModule`. Verificar que el build de Vite emite el worklet como módulo aparte.
- **Reverberator/Pitch Shifter** son los más complejos; van al final de su tanda y se validan por oído
  además de por los tests de sus funciones puras.
- **Fidelidad híbrida:** los nativos no son copia matemática del C; el criterio es "indistinguible al
  oído" para ese efecto. Si alguno no convence, se puede promover a AudioWorklet más adelante.
- **Persistencia naciente:** `store.ts` es nuevo en `studio/`; el formato de proyecto lleva `version`
  para poder migrar cuando F3 añada canales.
- **Polifonía/CPU:** muchos efectos en cadena suman CPU; aceptable para uso normal. El limitador del
  maestro contiene picos.

## Verificación
- `npm run typecheck` (sin errores) + `npm test` (DSP puro + rack + proyecto) + `npm run build`.
- **Manual:** en el Estudio, añadir efectos a los dos racks, tocar y oírlos; bypass/reordenar/quitar;
  guardar proyecto a archivo, recargar la página (autoguardado), y abrir el archivo guardado.
- Actualizar `HANDOFF.md`/`CLAUDE.md` por tanda (y subir `studio/package.json` al cerrar la fase).
