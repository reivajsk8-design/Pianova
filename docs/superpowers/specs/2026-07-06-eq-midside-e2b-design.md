# EQ mid/side (E2b) — Diseño

**Fecha:** 2026-07-06 · **Versión objetivo:** 0.27.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Que el EQ gráfico pueda procesar **Mid** (centro/mono) y **Side** (lados/estéreo) por separado: un modo
**Estéreo** (como ahora, una cadena) y un modo **Mid/Side** (dos cadenas independientes, cada una con la EQ
estática + dinámica completa de E1/E2). Cierra el EQ pro estilo Waves F6.

**Decidido con el usuario:** modo Estéreo↔Mid/Side; ambas cadenas con la EQ **completa** (estática + dinámica).

## Arquitectura

Se **refactoriza** la cadena de una banda-set (8 biquads + detectores + bucle dinámico) en un helper
reutilizable `fx/eq-chain.ts`, y el efecto compone **1 cadena** (estéreo) o **2** (mid + side) con una matriz
de codificación/decodificación M/S. El editor gana un selector de modo/canal; el resto de su interfaz opera
sobre el **canal activo** (sin cambios en sus llamadas).

- **`fx/eq-chain.ts` (nuevo):** `makeEqChain(actx, bands): EqChain` — un canal de EQ. Encapsula 8 biquads
  (`input→…→output`), 8 detectores (paso-banda→analyser sobre `input`), envolvente y su `setInterval`.
  Expone `input/output/analyser/getBands/setBand/setDyn/reset/applyPreset/magResponse/getBandsRef/dispose`.
- **`fx/effects/eq-graphic.ts` (reescrito):** compone las cadenas + bypass seco/húmedo:
  - **Estéreo:** `input → chainA → wet`.
  - **Mid/Side:** `input → ChannelSplitter → (Mid=(L+R)/2, Side=(L−R)/2 con gains) → chainA(mid), chainB(side)
    → (L=Mid+Side, R=Mid−Side con gains) → ChannelMerger → wet`.
  - `setMode('stereo'|'ms')` **reconstruye** el enrutado (como la reverb reconstruye su buffer): crea/destruye
    `chainB` y las matrices. Estado: `chainA` (estéreo/mid, siempre) + `chainB` (lados, solo en M/S).
- **`fx/eq-core.ts`:** `bandsToParams`/`bandsFromParams` ganan un **prefijo** (por defecto `'b'`) para poder
  aplanar dos cadenas (`b*` para mid/estéreo, `s*` para lados). Sin cambios en su uso actual (prefijo por defecto).

**Persistencia:** `serialize()` = `{ type, params: { ...bandsToParams(bandsA,'b'), ...(ms? bandsToParams(bandsB,'s'):{}),
_ms: ms?1:0 }, bypassed }`. `create(actx, state)`: lee `_ms`, `bandsA` de `b*`, `bandsB` de `s*`; monta el modo
correspondiente. **Compat v0.26:** sin `_ms` → modo estéreo (mismo sonido).

## EqApi (lo que consume el editor)

Se **añade** (los métodos existentes pasan a operar sobre el **canal activo**):
- `mode(): 'stereo' | 'ms'` · `setMode(m: 'stereo' | 'ms'): void`
- `channelLabels(): string[]` (`['Estéreo']` o `['Mid','Lados']`)
- `activeChannel(): number` · `setActiveChannel(i: number): void`
- `analyser` se implementa como **getter** → analyser del canal activo (el editor lo lee cada frame, sin cambios).
- `getBands/setBand/setDyn/reset/applyPreset/magResponse` → **canal activo**.

## Editor (`ui/eqEditor.ts`)

- Barra superior gana **[Modo: Estéreo | Mid/Side]** y, en Mid/Side, un selector **[Mid | Lados]**. Cambiar
  llama `setMode`/`setActiveChannel`, re-lee bandas y re-dibuja. El resto (curva, espectro, arrastrar, rueda,
  panel de banda, presets) **no cambia** (opera sobre el canal activo).

## Qué NO cambia

- El motor de audio base ni el rack/overlay; el resto de la vista. Una banda/cadena sin dinámica se comporta
  como E1. Modo estéreo = comportamiento actual exacto.

## Bordes

- Cambiar de modo con audio sonando reconstruye el enrutado en un instante (aceptable). En M/S, cada cadena
  tiene su propio bucle dinámico (solo corre si esa cadena tiene dinámicas). `dispose` limpia ambas cadenas y
  las matrices. Proyectos v0.26 abren en estéreo.

## Pruebas

- **Unitarias (Vitest):** `bandsToParams`/`bandsFromParams` con **prefijo** (`'b'` y `'s'`, ida y vuelta e
  independencia entre prefijos).
- **No unitarias:** el helper de cadena, el enrutado M/S y el editor → typecheck + build + prueba a oído/vista
  en la URL (activar Mid/Side, ecualizar Mid vs Lados por separado, dinámica en cada uno, persistir; un
  proyecto v0.26 abre en estéreo).

## Restricciones globales

- Todo en `studio/`; no tocar `pianova.html`. TypeScript **strict**; sin dependencias nuevas.
- Comentarios/UI en español. Acento verde neón `var(--pv-acc)`.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
