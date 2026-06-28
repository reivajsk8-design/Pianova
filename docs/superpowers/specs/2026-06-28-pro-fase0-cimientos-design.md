# Diseño — Proyecto pro (DAW/groovebox) · Fase 0: Cimientos

**Fecha:** 2026-06-28 · **Proyecto:** Pianova → **Estudio** (reescritura pro modular) · **Estado:**
rumbo aprobado por el usuario ("proyecto pro nuevo, portar"; lenguaje "tú decides" → **TypeScript+Vite**;
"implementar toda la suite TAP"). Esta es la **Fase 0** de una hoja de ruta por fases (cada fase = su
propio ciclo diseño→plan→subagentes). Ver [[pianova-audio-pendientes]].

## Contexto y objetivo

La app actual (`pianova.html`, un solo archivo, v1.36, publicada) se queda corta para lo que se quiere
(DAW/groovebox completo + suite de efectos TAP + módulo de aprendizaje). Se reconstruye como un
**proyecto modular pro** enfocado a **DAW/groovebox**, con el **aprendizaje como un módulo más**,
**portando los motores ya probados** (no reescribir a ciegas). 

La **Fase 0** monta los **cimientos**: el proyecto (Vite + TypeScript), el **esqueleto** de la app
(barra superior con vistas **Estudio** / **Aprender**, arranque de audio) y los **dos primeros motores
portados** (bus maestro mínimo + transporte con test). Entregable: una app pro que **compila, pasa
tests, y suena** (un tono de prueba), lista para colgarle todo lo demás en las fases siguientes.

## Alcance

**Dentro:**
1. **Carpeta nueva `studio/`** en el mismo repo, proyecto **Vite + TypeScript** (no toca `pianova.html`).
2. **Configuración:** `package.json` (scripts `dev`/`build`/`test`/`typecheck`), `vite.config.ts`
   (con `base: './'` para que el `dist` se abra desde cualquier ruta / Live Server), `tsconfig.json`
   (strict), **Vitest** para tests, `.gitignore` (node_modules, dist), `netlify.toml` listo para un
   **segundo sitio** Netlify (base `studio`, build `npm run build`, publish `studio/dist`).
3. **Estructura por dominios** (vacía pero creada): `src/audio/`, `src/ui/`, `src/app/`, `src/main.ts`,
   `index.html`. (Los dominios `daw/`, `midi/`, `learn/`, `store/` se crean cuando toque.)
4. **Esqueleto de la app (`src/app/shell.ts`):** barra superior con dos pestañas — **Estudio** y
   **Aprender** — que alternan dos contenedores (vacíos con un texto "Próximamente"), y un botón
   **"Iniciar audio"** (gesto de usuario → `ensureAudio`).
5. **Motores portados (TS):**
   - `src/audio/context.ts`: `ensureAudio()` (crea/reanuda el `AudioContext`, monta el bus) + acceso al `actx`.
   - `src/audio/masterBus.ts`: bus **mínimo extensible** — `masterIn` (GainNode) → `destination`.
     Expone `masterIn` y `masterDest()` (punto donde luego se cuelgan EQ/efectos/limitador). Un
     **tono de prueba** `testTone()` (oscilador 440 Hz, 0.4 s, por `masterDest()`) para verificar audio.
   - `src/audio/transport.ts`: **portar `makeTransport`** (reloj de audio + adelanto) a TS, con tipos;
     `src/audio/transport.test.ts`: portar el test (Vitest) con reloj inyectable.
6. **Cableado** en `src/main.ts`: monta el shell; el botón "Iniciar audio" llama `ensureAudio()`;
   un botón "Probar sonido" llama `testTone()`.
7. **Textos/comentarios en español.**

**Fuera (fases posteriores, YAGNI ahora):** instrumentos (synth/sampler/smplr), EQ, efectos TAP,
looper/secuenciador, MIDI, módulo Aprender, PWA, conmutar el sitio. **No** portar nada más que el bus
mínimo + transporte. **No** tocar `pianova.html` ni el despliegue actual.

## Restricciones

- **Vite + TypeScript (strict)** en `studio/`; **Vitest** para tests; **sin framework de UI** (DOM a
  mano, módulos por dominio). Dependencias mínimas (vite, typescript, vitest; `smplr` se añadirá en su
  fase). `base: './'` en Vite para abrir el `dist` en Live Server.
- **No tocar** `pianova.html` (sigue publicada y al día con v1.36). El proyecto nuevo es paralelo.
- Reusar **la lógica probada**: `makeTransport` se porta tal cual (misma matemática/test que en
  `pianova.html`). El bus se deja mínimo pero con la **misma forma** (`masterIn`/`masterDest`) para
  colgar después EQ/efectos/limitador como en la app actual.
- Verificación reproducible: `npm run typecheck` (tsc --noEmit), `npm run build` (vite), `npm test`
  (vitest) — todos sin errores; y arranque manual.

## Arquitectura (unidades)

### 1. Proyecto y build (`studio/`)
- `package.json`: `"dev":"vite"`, `"build":"vite build"`, `"preview":"vite preview"`,
  `"test":"vitest run"`, `"typecheck":"tsc --noEmit"`; devDeps: `vite`, `typescript`, `vitest`.
- `vite.config.ts`: `{ base: './' }`. `tsconfig.json`: `strict:true`, `moduleResolution:'bundler'`,
  `target:'ES2020'`, `lib:['ES2020','DOM']`, `noEmit:true` (Vite compila), `include:['src']`.
- `index.html`: contenedor `#app` + `<script type="module" src="/src/main.ts">`.

### 2. Audio (`src/audio/`)
- `context.ts`: `let actx; export function getAudioContext(); export function ensureAudio()` (crea
  `AudioContext` + `setupMasterBus()` la primera vez, `resume()` si suspendido).
- `masterBus.ts`: `let masterIn; export function setupMasterBus(actx)` (crea `masterIn` gain,
  `masterIn.connect(actx.destination)`); `export function masterDest()` (devuelve `masterIn`);
  `export function testTone()` (osc 440→gain 0.2→masterDest, start/stop 0.4 s).
- `transport.ts`: `export interface Transport { anchor(beat,bpm); beatNow(); timeForBeat(beat); setBpm(bpm); readonly bpm }`
  y `export function makeTransport(now: () => number): Transport` (misma lógica que en `pianova.html`).
- `transport.test.ts` (Vitest): reloj falso `let clock; makeTransport(()=>clock)`; asserts de
  `beatNow`/`timeForBeat` inversas y `setBpm` sin salto (los del test actual).

### 3. App shell (`src/app/shell.ts`, `src/main.ts`)
- `shell.ts`: `export function mountShell(root)` crea barra superior (logo "Estudio" + pestañas
  Estudio/Aprender) y dos `<section>` (`#viewStudio`, `#viewLearn`, una visible), con texto
  "Próximamente"; función para alternar vista. Botones "Iniciar audio" y "Probar sonido".
- `main.ts`: `mountShell(document.getElementById('app'))`; enlaza los botones a `ensureAudio()` y
  `testTone()`.
- CSS mínimo (un `src/ui/styles.css` importado) con el aire oscuro actual (variables de color).

## Flujo de datos (resumen)
```
npm run dev -> Vite sirve index.html -> main.ts -> mountShell
usuario pulsa "Iniciar audio" -> ensureAudio() -> AudioContext + setupMasterBus
usuario pulsa "Probar sonido" -> testTone() -> osc -> masterDest() -> destination (suena 440Hz)
pestañas Estudio/Aprender -> alterna #viewStudio/#viewLearn
tests: vitest -> transport.test.ts (puro)
```

## Riesgos / notas
- **npm/red:** instalar devDeps (`vite`/`typescript`/`vitest`) requiere internet la primera vez; es
  estándar. Si el entorno no tuviera npm, escalar.
- **Abrir el `dist` sin servidor:** `base:'./'` hace que el build use rutas relativas → se puede abrir
  `studio/dist/index.html` en Live Server (como ahora la app). El `npm run dev` es para desarrollo.
- **Despliegue paralelo:** el `netlify.toml` queda listo, pero **crear el segundo sitio Netlify** es un
  paso manual del usuario (se documenta en HANDOFF); no bloquea la Fase 0 (verificación local).
- **No romper lo actual:** todo va en `studio/`; `pianova.html`, `_redirects`, `sw.js`, etc. intactos.
- **Portabilidad del transporte:** la lógica de `makeTransport` es idéntica a la probada; el test lo
  garantiza.

## Verificación
- `cd studio && npm install` (una vez) → `npm run typecheck` (sin errores) → `npm test` (transport
  pasa) → `npm run build` (genera `studio/dist` sin errores).
- **Manual:** `npm run dev` (o abrir `studio/dist/index.html` en Live Server): se ve la barra con
  Estudio/Aprender; "Iniciar audio" no da error; "Probar sonido" suena (440 Hz); alternar pestañas
  muestra cada vista. `pianova.html` sigue funcionando igual.
- Documentar en `HANDOFF.md`/`CLAUDE.md` el nuevo proyecto `studio/` y cómo construir/probar.
