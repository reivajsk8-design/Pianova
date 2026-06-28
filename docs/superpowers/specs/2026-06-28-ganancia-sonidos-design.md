# Diseño — Ganancia ajustable de los sonidos (subir por encima de 100%)

**Fecha:** 2026-06-28 · **Proyecto:** Pianova (`pianova.html`) · **Estado:** diseño aprobado por el
usuario (alcance: Looper + instrumento global; margen **hasta 300%**; la ganancia del instrumento
global se guarda **por instrumento**). Implementación con **subagentes**.

## Problema

El volumen de canal del Looper es un fader **0–100%** (`makeFader … min:0 max:1`) y al disparar cada
sonido el nivel se **recorta** por tipo: samples a 1.0, batería e instrumentos reales (`sf`) a velocity
127. Por eso un sonido inherentemente flojo **no se puede subir** por encima de su nivel base — solo
se pueden **bajar** los demás. El instrumento global de Aprender/Escuchar **no tiene ningún control de
volumen**. El usuario quiere **dar ganancia** (subir por encima de 100%) para **igualar intensidades**.

## Solución

Permitir ganancia **0–300% (100% = normal/unidad)** tanto en cada canal del Looper como en el
instrumento global, y aplicarla de verdad según el tipo de sonido. El limitador + soft-clipper del bus
maestro (v1.26) ya evita el clipping al subir.

## Alcance

**Dentro:**
1. **Canales del Looper — volumen → ganancia 0–300%** (unidad 100%, por defecto 100%):
   - **synth** y **sample**: ganancia **completa** hasta 300% (ya multiplican; ampliar el rango del
     fader y **quitar el recorte a 1.0** del sample).
   - **instrumentos reales (`sf`)** y **batería**: la ganancia **escala la intensidad hasta su máximo**
     (velocity → 127). No pueden pasar de su nivel más fuerte porque el reproductor `sf` se comparte
     (`sfCache[name] → masterDest`); el aumento real por encima del máximo llegará con
     **"instrumento por canal"** (siguiente ciclo), que desacopla el reproductor por canal.
   - El **knob CC** asignado al volumen (`setChannelVolFromCC`) mapea 0–127 → 0–300%.
2. **Instrumento global — ganancia por instrumento 0–300%:**
   - Cada instrumento (piano, violín, flauta…) **recuerda su propia ganancia** (`store.instGain[clave]`,
     por defecto 100%), persistida en `localStorage`.
   - Se aplica enrutando el instrumento global por un **nodo de ganancia** `instGain` (GainNode) →
     `masterDest`: synth/sample/`sf` del instrumento global pasan por `instGain`, así el aumento es
     **completo para todos los tipos** (es un único reproductor, no compartido con los canales).
   - **Control de UI** compacto junto al selector `#instrument` en la cabecera. Al cambiar de
     instrumento, el control carga la ganancia guardada de ese instrumento y ajusta `instGain.gain`;
     al moverlo, actualiza `store.instGain[clave]` y `instGain.gain`.

**Fuera (YAGNI / otro ciclo):**
- Ganancia real por encima del máximo para `sf`/batería **en los canales del Looper** (requiere
  desacoplar el reproductor por canal → entra con "instrumento por canal").
- Compresor/normalización automática; medidores de nivel. (Solo ganancia manual.)

## Restricciones (heredadas)

- **Un solo archivo** `pianova.html`; sin librerías nuevas; sin build; textos/comentarios en **español**.
- **No empeorar** escritorio ni móvil; no tocar la pedagogía ni la lógica musical (velocity = dinámica).
- Reutilizar: `makeFader` (faders), `playChannelSound`, `synthNoteOn`, `noteOn`/`noteOnAt`,
  `sampleNoteOn`, `loadSoundfont`/`sfPlayer`, `setChannelVolFromCC`/`volMap`, `masterDest`,
  `store`/`saveStore`, `saveLooper`/`restoreLooper`.
- El bus maestro (limitador + soft-clipper v1.26) es la pared anti-clipping; no se toca.
- **Compatibilidad:** patrones del Looper ya guardados conservan su `vol` (se cargan tal cual; los
  nuevos canales nacen a 100%). El instrumento global sin ganancia guardada = 100%.

## Arquitectura (unidades)

### 1. Constantes y helper de ganancia
- `GAIN_MAX = 3` (300%). Unidad = `1`.
- El fader de canal pasa a `min:0, max:GAIN_MAX, def:1, step:0.05, fmt: v=>Math.round(v*100)` y se ve
  la marca/valor de 100%.

### 2. Looper — aplicar ganancia por tipo (en `playChannelSound`)
- `vol` (canal) ahora 0..3. `v = vel * vol`.
  - **sample:** `g.gain.value = Math.max(0, v)` (quitar el `Math.min(1, …)`).
  - **synth:** `synthNoteOn(midi, vel, preset, vol)` (ya escala `peak*vol`; con vol hasta 3 sube).
  - **sf:** `velocity: Math.max(1, Math.round(v*127))` (ya lo hace; el `round` se satura a 127 → sube
    hasta el máximo). Sin cambios de enrutado.
  - **drumkit/drum:** igual, `velocity: round(v*127)` (hasta 127).
- `setChannelVolFromCC(ch, ccVal)` mapea `ccVal/127*GAIN_MAX` (0–127 → 0–3).
- El fader de canal: `max:GAIN_MAX, def:1`. `restoreLooper`/`saveLooper` ya guardan `vol` (sin tope
  artificial).

### 3. Instrumento global — nodo `instGain` + ganancia por instrumento
- `instGain = actx.createGain()` (en `ensureAudio`/`setupMasterBus`), `instGain.connect(masterDest())`.
  (Va al **input** del bus maestro, así pasa por filtros/efectos/limitador como todo lo demás.)
- El instrumento global se enruta por `instGain` en vez de `masterDest()` directo:
  - `synthNoteOn`/sample del global → destino `instGain` (añadir un parámetro de destino opcional a
    `synthNoteOn`/`sampleNoteOn`, por defecto `masterDest()`; el global pasa `instGain`).
  - `loadSoundfont(name)` crea el reproductor del global con `destination: instGain` (reproductor
    **propio** del global, no el de `sfCache` compartido con los canales).
- **Clave de ganancia por instrumento:** el `value` del `<select id="instrument">` (p. ej.
  `'sf:violin'`, `'synth:piano'`, o `'sample:<id>'`). `store.instGain[clave]` (0..3, por defecto 1).
- **Aplicar:** `applyInstGain()` pone `instGain.gain.value = store.instGain[claveActual] ?? 1`.
  Se llama al cambiar de instrumento (handler de `#instrument`, y al asignar sample/instrumento desde
  la librería) y al mover el control.

### 4. UI del control de ganancia global
- Grupo `.hdrCol` con etiqueta "GANANCIA" junto a `#instrument` en la cabecera, con un **widget de %
  compacto arrastrable** (mismo patrón que el BPM grande: un `<b>` que muestra "100%", **arrastrar ↕**
  para cambiar y **doble-clic** = escribir/volver a 100%). Reutiliza el patrón de `lnBpmWrap`/`setLnBpm`
  (pointerdown + window pointermove/up; clamp 0–300%; sin disparar bucles).
- Helper `setInstGain(v)`: clamp 0–`GAIN_MAX`, actualiza el número, `store.instGain[clave]=v`,
  `saveStore()` (debounced si conviene) y `applyInstGain()`.
- Al cambiar `#instrument` (y al asignar sample/instrumento desde la librería): cargar
  `store.instGain[clave] ?? 1` en el número y `applyInstGain()`.

### 5. Persistencia
- `store.instGain` (objeto clave→ganancia) se guarda en `saveStore`/`loadStore` (junto a `prefs`,
  `fx`, etc.). El `vol` por canal del Looper ya se persiste en `store.looper`.

## Flujo de datos (resumen)
```
Looper: fader canal (0–300%) -> channel.vol -> playChannelSound:
  synth peak*vol | sample gain=vel*vol | sf/drum velocity=round(vel*vol*127) (máx 127)
  knob CC -> setChannelVolFromCC -> vol (0–3)
Global: #instrument -> clave; control ganancia -> store.instGain[clave] -> applyInstGain()
  -> instGain.gain ; synth/sample/sf del global enrutados por instGain -> masterDest (bus)
persistencia: store.instGain (saveStore) ; channel.vol (saveLooper)
```

## Riesgos / notas

- **sf/batería en el Looper no superan su máximo** (reproductor compartido). Es una limitación
  consciente de este ciclo; se documenta y se resuelve con "instrumento por canal". El usuario lo
  aprobó como alcance.
- **Clipping:** subir a 300% puede saturar; el limitador + soft-clipper (v1.26) lo contiene sin
  distorsión dura. No añadir nada extra salvo que la prueba lo exija.
- **Cambiar el destino del global a `instGain`** no debe afectar a los canales del Looper (que siguen
  usando `sfCache`/`masterDest`). Verificar que el reproductor del global es independiente.
- **Default 100% vs 85%:** los canales nuevos nacen a 100% (unidad); los patrones guardados conservan
  su `vol`. La marca de 100% del fader ayuda a encontrar la unidad.
- **Móvil:** el control de ganancia global en la cabecera debe envolver/compactar sin solapar (seguir
  la línea de la cabecera pro v1.31).

## Verificación

- `node --check` de cada `<script>` (2) + balance de llaves CSS.
- **Prueba manual (Chrome/Edge, Live Server):**
  - Looper: poner un canal synth o sample flojo y subir su fader por encima de 100% → se oye más
    fuerte; bajar otro por debajo → se equilibra. Recargar mantiene los niveles.
  - Instrumento global: elegir violín (real), subir su ganancia → suena más fuerte en Escuchar/
    Aprender; cambiar a piano (su ganancia propia) y volver al violín → recuerda cada uno. Recargar
    mantiene la ganancia por instrumento.
  - Subir a 300% no produce clipping duro (satura suave).
- Subir versión, actualizar `CLAUDE.md` y `HANDOFF.md`.
