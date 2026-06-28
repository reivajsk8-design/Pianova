# Diseño — Ecualizador maestro (presets musicales + importar perfil Equalizer APO)

**Fecha:** 2026-06-28 · **Proyecto:** Pianova (`pianova.html`) · **Estado:** diseño aprobado por el
usuario ("excelente": A+B, en "Mezcla maestra", los 5 presets). Implementación con **subagentes**.
Inspirado en el formato del repo `Tal0na/Equalizer-Profiles` (perfiles Equalizer APO).

## Objetivo

Dar **cuerpo y potencia** al sonido y permitir **corrección por auriculares**: un ecualizador en el
bus maestro con (A) **presets musicales** (Plano/Más cuerpo/Cálido/Brillante/Loudness) y (B) **importar
un perfil Equalizer APO** (.txt) — el formato de ese repo (594 perfiles) — que se parsea a filtros
Web Audio. Afecta a todo (Aprender, Escuchar, Looper).

## Alcance

**Dentro:**
1. **Etapa de EQ en el bus maestro:** una cadena de `BiquadFilterNode` (peaking/low-shelf/high-shelf)
   + un preamp, insertada entre `masterIn` y `fxHP` (antes del limitador/soft-clipper/makeup, que
   siguen como pared anti-clipping). Modelo común: `{ preamp:<dB>, bands:[{type,freq,gain,q}] }`.
   `buildEq(spec)` (re)construye la cadena y la reconecta.
2. **Presets musicales (A):** objeto `EQ_PRESETS` con 5 entradas. **Plano** = sin bandas (preamp 0).
   **Más cuerpo**, **Cálido**, **Brillante**, **Loudness** = pocas bandas shelf/peak con valores fijos.
3. **Importar perfil Equalizer APO (B):** parser puro `parseApoEq(text)` que lee `Preamp: X dB` y
   `Filter N: ON PK|LS|HS Fc <f> Hz Gain <g> dB Q <q>` y devuelve el spec común. Maneja **decimales
   con coma** (europeo: `-1,3`), líneas en blanco/comentarios, y filtros `OFF` (se ignoran). `PK`→
   `peaking`, `LS`→`lowshelf`, `HS`→`highshelf`. Botón de importar (.txt) + nombre del perfil.
4. **UI** en la sección **"Mezcla maestra"** (`#lpfx`) del Looper: un desplegable de EQ (los 5 presets
   + la entrada del perfil importado si lo hay) y un botón **"📂 Importar perfil EQ"**. Es global.
5. **Persistencia:** `store.eq = { preset:<clave>, custom:{name,preamp,bands} | null }` en
   `localStorage`; se restaura y se aplica al cargar.

**Fuera (YAGNI):**
- EQ gráfico interactivo (arrastrar bandas), análisis de espectro, EQ por canal. (Solo presets +
  import + un desplegable.)
- Empaquetar los 594 perfiles dentro de la app (licencia/peso; el usuario importa el suyo).
- Tocar el filtro de 1 perilla actual (grave↔agudo) ni los efectos delay/reverb: se quedan igual.

## Restricciones (heredadas)

- **Un solo archivo** `pianova.html`; sin librerías nuevas; sin build; textos/comentarios en **español**.
- **No empeorar** escritorio ni móvil; no romper los efectos actuales (filtro/delay/reverb) ni el
  limitador/soft-clipper/makeup (v1.26/v1.33).
- Reutilizar: `setupMasterBus`/`masterIn`/`fxHP`, `makeFader`/el rack `#lpfxRack` (estilo), `store`/
  `saveStore`/`loadStore`, el patrón de `#lpSampleFile` para el input de archivo, `masterDest`.
- El EQ va **antes** del limitador para que sus realces no produzcan clipping (la pared los contiene).

## Arquitectura (unidades)

### 1. Modelo y construcción de la cadena (`buildEq`)
- Spec común: `{ preamp:Number(dB), bands:[{ type:'peaking'|'lowshelf'|'highshelf', freq, gain, q }] }`.
- `eqInput` = GainNode (preamp, lineal = `10^(preamp/20)`). `eqBands` = array de biquads en serie.
- `buildEq(spec)`: desconecta `masterIn` de su destino actual; crea `eqInput` + biquads; conecta
  `masterIn → eqInput → band1 → … → bandN → fxHP`. Si `bands` vacío, `masterIn → eqInput → fxHP`.
  Se llama en `setupMasterBus` (con el spec activo) y al cambiar preset/importar.
- `currentEq` guarda el spec activo; `eqApply(spec)` = `currentEq = spec; buildEq(spec)`.

### 2. Presets (`EQ_PRESETS`)
- `plano`: `{preamp:0, bands:[]}`.
- `cuerpo`: low-shelf +4 dB @120Hz, peaking +2 dB @2.5kHz (Q1). 
- `calido`: low-shelf +3 dB @120Hz, high-shelf −2.5 dB @8kHz.
- `brillante`: high-shelf +4 dB @8kHz, peaking +1.5 dB @4kHz (Q1).
- `loudness`: low-shelf +5 dB @100Hz, high-shelf +3 dB @9kHz.
  (Valores exactos se fijan en el plan; preamp 0 — el makeup/limitador contienen el realce.)

### 3. Parser Equalizer APO (`parseApoEq`) — puro, testeable
- Entrada: texto del .txt. Salida: spec común (o `{preamp:0,bands:[]}` si no hay nada válido).
- `Preamp:` → número (coma→punto). Cada `Filter k: ON <PK|LS|HS> Fc <f> Hz Gain <g> dB Q <q>` →
  banda; `OFF` o tipos no soportados → ignorar. Tolerante a espacios/comas/líneas vacías.
- Es **pura** (sin Web Audio) → test Node con un perfil de ejemplo del repo.

### 4. UI (en `#lpfx` "Mezcla maestra")
- Un grupo "EQ" con `<select id="eqPreset">` (Plano/Más cuerpo/Cálido/Brillante/Loudness + "Perfil: …"
  si hay importado) y un botón `#eqImport` ("📂 Importar perfil EQ") + input `#eqFile` (.txt, hidden).
- `change` del select → `eqApply(EQ_PRESETS[v] | store.eq.custom)`, persistir. Import → leer archivo,
  `parseApoEq`, guardar como `store.eq.custom` (con `name`=nombre de archivo), añadir/seleccionar su
  opción, aplicar, persistir.

### 5. Persistencia
- `store.eq = { preset, custom }`. `loadStore` lo lee; tras crear el bus se aplica el EQ guardado
  (`eqApply`). `saveStore` ya serializa `store`.

## Flujo de datos (resumen)
```
sources/instGain -> masterIn -> [eqInput(preamp) -> bandas biquad] -> fxHP -> ... -> limiter -> makeup -> dest
preset/select -> eqApply(spec) -> buildEq -> reconecta cadena ; store.eq.preset
importar .txt -> parseApoEq -> store.eq.custom -> eqApply -> buildEq
recargar -> loadStore -> (tras setupMasterBus) eqApply(spec guardado)
```

## Riesgos / notas
- **Reconexión:** `buildEq` debe desconectar limpio `masterIn` de la cadena previa antes de reconstruir
  (guardar referencias a los nodos viejos para `disconnect()`), sin cortar el resto del bus.
- **Realce → clipping:** lo contienen limitador + soft-clipper + makeup; los perfiles traen `Preamp`
  (suele negativo) para headroom. No añadir protección extra salvo que la prueba lo pida.
- **Formato APO:** decimales con coma, `Hz`/`dB`/`Q` con espacios variables, filtros `OFF`, tipos
  raros (`LSC`/`HSC`/`NO`): parsear lo soportado (PK/LS/HS) y **ignorar** el resto sin romper.
- **Orden de biquads:** en serie da igual el orden para la respuesta combinada; encadenar según
  aparecen.
- **Móvil:** el desplegable + botón en "Mezcla maestra" deben envolver sin solapar.

## Verificación
- `node --check` de cada `<script>` + balance de llaves CSS + **test Node** del parser
  (`parseApoEq`) con un perfil real del repo (p. ej. el de ejemplo con `Preamp` + PK + HS).
- **Prueba manual (Chrome/Edge, Live Server):** elegir "Más cuerpo"/"Loudness" → el sonido gana
  graves/cuerpo de forma audible; "Plano" lo deja neutro. Importar un .txt Equalizer APO → aparece y
  se aplica; recargar mantiene la selección. No hay clipping al realzar. Los efectos existentes
  (filtro/delay/reverb) siguen funcionando.
- Subir versión, actualizar `CLAUDE.md` y `HANDOFF.md`.
