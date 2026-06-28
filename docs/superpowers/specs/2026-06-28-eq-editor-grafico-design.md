# Diseño — EQ gráfico editable estilo Ableton EQ Eight (8 bandas + espectro)

**Fecha:** 2026-06-28 · **Proyecto:** Pianova (`pianova.html`) · **Estado:** diseño aprobado por el
usuario ("8 fijas como Ableton" + curva editable + **espectro en tiempo real**). Implementación con
**subagentes**. Construye **sobre** el EQ maestro v1.34 (`buildEq`/`eqApply`/`store.eq`).

## Objetivo

Un **editor visual de EQ** estilo Ableton **EQ Eight**: un panel con **8 bandas fijas** (activar/
desactivar, tipo, arrastrar nodos de frecuencia/ganancia/Q), una **curva de respuesta** y el
**analizador de espectro** en tiempo real de fondo. Permite ajustar el sonido por oído para cualquier
salida (auriculares, **amplificador**, altavoces) sin depender de perfiles por modelo.

## Alcance

**Dentro:**
1. **Modelo de 8 bandas fijas** (`store.eq.manual`): `{ preamp, slots:[8 × {on,type,freq,gain,q}] }`.
   `type ∈ peaking|lowshelf|highshelf|highpass|lowpass`. Por defecto las 8 **apagadas** (= plano)
   con frecuencias/tipos repartidos (HP, low-shelf, 4 campanas, high-shelf, LP).
2. **Integración con el motor v1.34:** un nuevo valor de preset `'manual'`. `eqSpecFromStore()` para
   `'manual'` devuelve `{ preamp, bands: 8 bandas }`, donde una banda **apagada** se mapea a
   `peaking gain 0` (transparente) → así la cadena tiene **siempre 8 biquads** y el índice de slot
   `i` ↔ `eqNodes[i+1]` es **estable** (clave para editar en vivo sin reconstruir).
3. **Analizador de espectro:** un `AnalyserNode` que toma la salida (`masterFinal`) en `setupMasterBus`;
   el editor lo lee con `getByteFrequencyData` mientras está abierto.
4. **Panel editor a pantalla completa** (`#eqEditor`, overlay como `#pianoroll`), abierto con un botón
   **"✎ Editar EQ"** en "Mezcla maestra". Contiene: lienzo (espectro + curva + nodos), los **8
   toggles de banda** con su selector de tipo, una barra **Q** de la banda seleccionada y el **preamp**.
5. **Interacción:** arrastrar un nodo = **frecuencia** (X, log) + **ganancia** (Y); **rueda** sobre el
   nodo = **Q** (escritorio); **barra Q** de la banda seleccionada (táctil). Toggle on/off por banda.
   Cada edición **actualiza el filtro en vivo** (`eqNodes[i+1]`) y persiste (`saveStore` debounced).
6. **Persistencia:** `store.eq.manual` se guarda y restaura; al abrir el editor se selecciona el preset
   `'manual'` y se aplica.

**Fuera (YAGNI):** automatización, M/S, análisis pre/post conmutable, más de 8 bandas, fase, espectros
de referencia. (Un EQ paramétrico de 8 bandas con espectro, nada más.)

## Restricciones (heredadas)

- **Un solo archivo** `pianova.html`; sin librerías nuevas; sin build; textos/comentarios en **español**.
- **No empeorar** escritorio ni móvil; **no romper** el EQ v1.34 (presets/importar), los efectos ni el
  limitador/soft-clipper/makeup. El EQ sigue **antes** del limitador.
- Reutilizar: `buildEq`/`eqApply`/`eqSpecFromStore`/`EQ_PRESETS`/`store.eq` (v1.34), `masterFinal`,
  el patrón de overlay del piano-roll (`#pianoroll`, abrir/cerrar, Esc, rAF), `makeFader`/`$`/`status`.
- **Táctil:** funciona con el dedo (arrastrar nodos, barra Q). `touch-action:none` en el lienzo.

## Arquitectura (unidades)

### 1. Modelo de bandas (`EQ_MANUAL_DEFAULT`, `store.eq.manual`)
- `EQ_MANUAL_DEFAULT`: 8 slots con tipos/frecuencias por defecto, todas `on:false`, `gain:0`.
- `eqManual()` = `store.eq.manual` (o el default, sembrado en `store`/`loadStore`).
- `eqSpecFromStore()` se amplía: si `preset==='manual'` → `{ preamp: m.preamp, bands: m.slots.map(s =>
  s.on ? {type:s.type,freq:s.freq,gain:s.gain,q:s.q} : {type:'peaking',freq:s.freq,gain:0,q:1}) }`
  (8 bandas siempre; apagada = transparente).

### 2. Edición en vivo (`eqUpdateSlot`)
- Con `preset==='manual'`, `eqNodes[i+1]` es el biquad del slot `i` (mapeo estable por las 8 bandas).
- `eqUpdateSlot(i)`: lee `slot[i]` y aplica a `eqNodes[i+1]` (`type`, `frequency`, `gain`, `Q` con
  `setTargetAtTime` para suavidad; apagada → `type='peaking', gain=0`). Sin reconstruir la cadena.
- Cambios estructurales (entrar al editor, cambiar de preset) → `eqApply(eqSpecFromStore())` (rebuild).

### 3. Analizador de espectro (en `setupMasterBus`)
- `eqAnalyser = actx.createAnalyser()` (`fftSize:2048`, `smoothingTimeConstant:0.8`);
  `masterFinal.connect(eqAnalyser)` (toma en paralelo; no altera la salida).

### 4. Render del lienzo (`eqDraw`)
- X = log(freq) 20–20000; Y = ganancia −15…+15 dB. Rejilla con marcas (100/1k/10k, ±6/±12 dB).
- **Espectro:** `getByteFrequencyData` → para cada x (bin mapeado a log-freq) una "montaña" gris
  semitransparente.
- **Curva:** respuesta combinada de las 8 bandas con `BiquadFilterNode.getFrequencyResponse` sobre los
  `eqNodes` vivos (multiplicar magnitudes → dB) → línea ámbar.
- **Nodos:** un punto por banda **activa** en `(x=freq, y=gain)`; el seleccionado resaltado. Las
  apagadas no se dibujan (o muy tenues).
- rAF solo mientras el overlay está abierto (`eqEditorOpen`).

### 5. Interacción (ratón + táctil sobre `#eqCanvas`)
- **pointerdown** sobre un nodo → seleccionar + iniciar arrastre. **pointermove** → `freq` por X (log),
  `gain` por Y (clamp ±15), `eqUpdateSlot(i)`, redibujar, persistir (debounced). **pointerup** → fin.
- **wheel** sobre un nodo → `q` (clamp p.ej. 0.3–8), `eqUpdateSlot`. **Doble-clic en hueco** → activar
  la primera banda libre en ese punto (o seleccionar la más cercana). 
- **8 toggles** (botones 1–8, estilo EQ Eight) → `slot.on`, `eqUpdateSlot`, redibujar. Cada toggle con
  un **selector de tipo**. **Barra Q** y campo **preamp** para la banda seleccionada (táctil).

### 6. Panel/overlay (`#eqEditor`) y apertura
- Overlay full-screen (clase como `#pianoroll`); cabecera con título, **✕** y Esc para cerrar.
- Botón **"✎ Editar EQ"** en "Mezcla maestra": fija `store.eq.preset='manual'`, `refreshEqUI()`,
  `eqApply(eqSpecFromStore())`, abre el overlay y arranca `eqDraw` (rAF). Cerrar detiene el rAF.
- El desplegable de EQ (`#eqPreset`) gana la opción **"Manual (editor)"** (`value='manual'`).

## Flujo de datos (resumen)
```
abrir editor -> preset='manual' -> eqApply(8 bandas) -> overlay + rAF(eqDraw)
arrastrar nodo i -> slot[i].freq/gain -> eqUpdateSlot(i) (eqNodes[i+1] en vivo) -> draw -> saveStore(debounce)
rueda/barra Q -> slot[i].q -> eqUpdateSlot(i) ; toggle -> slot[i].on -> eqUpdateSlot(i)
espectro: masterFinal -> eqAnalyser -> getByteFrequencyData (cada frame)
recargar -> loadStore -> store.eq.manual ; si preset='manual' se aplica
```

## Riesgos / notas
- **Mapeo estable:** mantener SIEMPRE 8 biquads en modo manual (apagada = peaking gain 0) es lo que
  permite editar en vivo sin reconstruir y sin clics. No filtrar las apagadas fuera del array.
- **`getFrequencyResponse`** requiere los nodos vivos (existen tras `ensureAudio`); si el editor se
  abre, el audio ya está creado (lo crea el primer gesto / el botón). Igualmente, guardar contra
  `eqNodes` vacío.
- **Rendimiento:** rAF solo con el overlay abierto; el espectro y la curva (≈200–300 puntos) son
  baratos. Cerrar el overlay corta el rAF.
- **Táctil:** sin rueda → la **barra Q** de la banda seleccionada cubre el ajuste de Q en móvil;
  `touch-action:none` en el lienzo para arrastrar sin hacer scroll.
- **Clipping:** los realces grandes los contiene el limitador/soft-clipper/makeup; el `preamp` del
  manual da margen si hace falta.
- **Compatibilidad:** `store.eq` ya existe (v1.34); se le añade `manual`. Presets e importar APO siguen
  igual; "manual" es un preset más.

## Verificación
- `node --check` + balance CSS + **test Node** de las funciones puras: `eqSpecFromStore` para `'manual'`
  (apagada→peaking gain 0; activa→sus valores) y el mapeo **x↔frecuencia log** (`freqToX`/`xToFreq`
  inversas) y **gain↔Y**.
- **Prueba manual (Chrome/Edge + móvil, Live Server):** abrir "✎ Editar EQ"; activar bandas, arrastrar
  nodos (se oye en vivo), cambiar tipo y Q (rueda en PC, barra en móvil), ver la curva y el espectro
  moverse con la música; cerrar y reabrir mantiene el ajuste; recargar lo conserva; "Plano"/otros
  presets siguen funcionando; no hay clipping. El escritorio y el resto de la app no cambian.
- Subir versión, actualizar `CLAUDE.md` y `HANDOFF.md`.
