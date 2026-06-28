# Proyecto pro · Fase 0 (cimientos) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Montar los cimientos del proyecto pro: una app Vite+TypeScript en `studio/` que compila, pasa tests y suena (tono de prueba), con esqueleto Estudio/Aprender, bus maestro mínimo y transporte portado.

**Architecture:** Proyecto Vite+TS modular por dominios (`src/audio/`, `src/app/`, `src/ui/`). El audio arranca tras un gesto (`ensureAudio` → `setupMasterBus`); el transporte (`makeTransport`) se porta tal cual con test Vitest. UI con DOM a mano, sin framework. La `pianova.html` actual no se toca.

**Tech Stack:** Vite, TypeScript (strict), Vitest, Web Audio API. Despliegue futuro: segundo sitio Netlify (base `studio`). Sin framework de UI; dependencias mínimas.

## Global Constraints

- Todo el código nuevo vive en **`studio/`**; **NO tocar** `pianova.html`, `_redirects`, `sw.js` ni el despliegue actual.
- **TypeScript strict**; **Vitest** para tests; **sin framework de UI** (DOM a mano). Textos/comentarios en **español**.
- `vite.config.ts` con **`base: './'`** (para abrir el `dist` en Live Server). No commitear `node_modules`/`dist` (gitignore).
- El transporte portado usa la **misma lógica** que `pianova.html` (`makeTransport`); el test lo garantiza.
- Comandos de verificación (desde `d:\PianoVa\studio`): `npm install` (una vez), `npm run typecheck`, `npm test`, `npm run build`. Si `npm` no está disponible o falla por red, reportar BLOCKED.

---

### Task 1: Scaffold del proyecto (Vite + TS + Vitest)

**Files:**
- Create: `studio/package.json`, `studio/vite.config.ts`, `studio/tsconfig.json`, `studio/.gitignore`,
  `studio/netlify.toml`, `studio/index.html`, `studio/src/main.ts` (stub).

**Interfaces:**
- Produces: un proyecto Vite+TS que compila y construye (app mínima).

- [ ] **Step 1: `studio/package.json`**

```json
{
  "name": "estudio",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
```

- [ ] **Step 2: `studio/vite.config.ts`**

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './'
});
```

- [ ] **Step 3: `studio/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: `studio/.gitignore`**

```
node_modules
dist
```

- [ ] **Step 5: `studio/netlify.toml`** (para el segundo sitio Netlify; base = `studio`)

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

- [ ] **Step 6: `studio/index.html`**

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Estudio — Pianova</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 7: `studio/src/main.ts`** (stub temporal; la Task 4 lo sustituye)

```ts
const app = document.getElementById('app');
if (app) app.textContent = 'Estudio — cimientos';
```

- [ ] **Step 7b: `studio/src/vite-env.d.ts`** (tipos de Vite: permite `import './x.css'` sin error de tsc)

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 8: Instalar y verificar**

Run (desde `d:\PianoVa\studio`): `npm install` luego `npm run typecheck` luego `npm run build`
Expected: `npm install` termina sin errores; `typecheck` sin errores; `build` genera `studio/dist/` sin errores.

- [ ] **Step 9: Commit**

```bash
git add studio/package.json studio/package-lock.json studio/vite.config.ts studio/tsconfig.json studio/.gitignore studio/netlify.toml studio/index.html studio/src/main.ts
git commit -m "Estudio (pro) Fase 0: scaffold Vite+TS+Vitest"
```

---

### Task 2: Transporte portado (TS) + test Vitest

**Files:**
- Create: `studio/src/audio/transport.ts`, `studio/src/audio/transport.test.ts`.

**Interfaces:**
- Produces: `interface Transport { anchor(beat,bpm); beatNow(); timeForBeat(beat); setBpm(bpm); readonly bpm }`
  y `makeTransport(now: () => number): Transport`.

- [ ] **Step 1: Escribir el test que falla** — `studio/src/audio/transport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeTransport } from './transport';

describe('makeTransport', () => {
  it('deriva la posición del reloj y es inversa de timeForBeat', () => {
    let clock = 10;
    const tr = makeTransport(() => clock);
    tr.anchor(0, 120);                 // 120 bpm = 2 beats/seg
    clock = 10; expect(tr.beatNow()).toBe(0);
    clock = 11; expect(tr.beatNow()).toBe(2);   // 1 seg = 2 beats
    expect(tr.timeForBeat(0)).toBe(10);
    expect(tr.timeForBeat(2)).toBe(11);
    clock = 13.7; const b = tr.beatNow();
    expect(Math.abs(tr.timeForBeat(b) - 13.7)).toBeLessThan(1e-9);
  });
  it('setBpm re-ancla sin salto y avanza al nuevo ritmo', () => {
    let clock = 10;
    const tr = makeTransport(() => clock);
    tr.anchor(0, 120);
    clock = 12; const before = tr.beatNow();    // 4
    tr.setBpm(60);                               // 60 bpm = 1 beat/seg
    expect(Math.abs(tr.beatNow() - before)).toBeLessThan(1e-9);
    clock = 13; expect(Math.abs(tr.beatNow() - (before + 1))).toBeLessThan(1e-9);
  });
});
```

- [ ] **Step 2: Correr el test (falla: módulo no existe)**

Run: `npm test`
Expected: FALLA (no encuentra `./transport` / `makeTransport`).

- [ ] **Step 3: Implementar `studio/src/audio/transport.ts`**

```ts
// Reloj de transporte: la posición (en beats) se deriva de un reloj inyectable (el de audio),
// así un tirón de imagen no mueve el ritmo. Portado de pianova.html (misma lógica, ahora tipado).
export interface Transport {
  anchor(beat: number, bpm: number): void;
  beatNow(): number;
  timeForBeat(beat: number): number;
  setBpm(bpm: number): void;
  readonly bpm: number;
}

export function makeTransport(now: () => number): Transport {
  let t0 = 0, b0 = 0, _bpm = 120;
  return {
    anchor(beat, bpm) { t0 = now(); b0 = beat; _bpm = bpm; },
    beatNow() { return b0 + (now() - t0) * (_bpm / 60); },
    timeForBeat(beat) { return t0 + (beat - b0) * (60 / _bpm); },
    setBpm(bpm) { const b = this.beatNow(); t0 = now(); b0 = b; _bpm = bpm; },
    get bpm() { return _bpm; }
  };
}
```

- [ ] **Step 4: Correr el test (pasa) + typecheck**

Run: `npm test` luego `npm run typecheck`
Expected: tests PASAN (2 passing); typecheck sin errores.

- [ ] **Step 5: Commit**

```bash
git add studio/src/audio/transport.ts studio/src/audio/transport.test.ts
git commit -m "Estudio: transporte (reloj de audio) portado a TS + test Vitest"
```

---

### Task 3: Audio — context + bus maestro mínimo + tono de prueba

**Files:**
- Create: `studio/src/audio/masterBus.ts`, `studio/src/audio/context.ts`.

**Interfaces:**
- Produces: `setupMasterBus(actx)`, `masterDest(): AudioNode`, `testTone()`; `ensureAudio(): AudioContext`,
  `getAudioContext(): AudioContext | null`.

- [ ] **Step 1: `studio/src/audio/masterBus.ts`** (bus mínimo extensible + tono de prueba)

```ts
// Bus maestro mínimo: masterIn (entrada) -> destino. Aquí se colgarán EQ/efectos/limitador en fases
// siguientes (misma forma que en pianova.html: masterIn / masterDest).
let masterIn: GainNode | null = null;

export function setupMasterBus(actx: AudioContext): void {
  masterIn = actx.createGain();
  masterIn.connect(actx.destination);
}

export function masterDest(): AudioNode {
  if (!masterIn) throw new Error('Bus maestro no inicializado (llama a ensureAudio primero).');
  return masterIn;
}

// Tono de prueba (440 Hz, 0.4 s) para verificar que el audio suena por el bus.
export function testTone(): void {
  const dest = masterDest();
  const actx = dest.context as AudioContext;
  const osc = actx.createOscillator();
  const g = actx.createGain();
  osc.type = 'sine'; osc.frequency.value = 440; g.gain.value = 0.2;
  osc.connect(g); g.connect(dest);
  const t = actx.currentTime;
  osc.start(t); osc.stop(t + 0.4);
}
```

- [ ] **Step 2: `studio/src/audio/context.ts`** (arranque del AudioContext tras gesto)

```ts
import { setupMasterBus } from './masterBus';

let actx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null { return actx; }

// Crea/reanuda el AudioContext (debe llamarse tras un gesto del usuario) y monta el bus la 1ª vez.
export function ensureAudio(): AudioContext {
  if (!actx) {
    actx = new AudioContext();
    setupMasterBus(actx);
  }
  if (actx.state === 'suspended') void actx.resume();
  return actx;
}
```

- [ ] **Step 3: Verificar typecheck + build**

Run: `npm run typecheck` luego `npm run build`
Expected: sin errores (los módulos compilan; aún no se usan desde la UI — eso es la Task 4).

- [ ] **Step 4: Commit**

```bash
git add studio/src/audio/masterBus.ts studio/src/audio/context.ts
git commit -m "Estudio: bus maestro minimo (masterIn/masterDest) + testTone + ensureAudio"
```

---

### Task 4: Esqueleto de la app (shell + estilos + cableado)

**Files:**
- Create: `studio/src/app/shell.ts`, `studio/src/ui/styles.css`.
- Modify: `studio/src/main.ts` (sustituir el stub).

**Interfaces:**
- Consumes: `ensureAudio` (context.ts), `testTone` (masterBus.ts).
- Produces: `mountShell(root: HTMLElement): void`.

- [ ] **Step 1: `studio/src/ui/styles.css`** (tema oscuro mínimo)

```css
:root { --bg:#0b0d12; --panel:#12151c; --line:#262b38; --ink:#e7e9ee; --muted:#8a909e; --amber:#f2a33c; }
* { box-sizing: border-box; }
body { margin:0; font-family: system-ui, sans-serif; background:var(--bg); color:var(--ink); }
.topbar { display:flex; align-items:center; gap:14px; padding:12px 18px; border-bottom:1px solid var(--line); flex-wrap:wrap; }
.brand { font-weight:700; font-size:18px; } .brand span { color:var(--muted); font-weight:500; font-size:12px; }
.tabs { display:inline-flex; gap:0; background:var(--panel); border:1px solid var(--line); border-radius:11px; padding:3px; }
.tab { border:0; background:transparent; color:var(--muted); padding:7px 16px; border-radius:8px; font:inherit; cursor:pointer; }
.tab.on { background:var(--amber); color:#1a1306; }
.grow { flex:1; }
button { font:inherit; cursor:pointer; border:1px solid var(--line); background:var(--panel); color:var(--ink); border-radius:10px; padding:8px 14px; }
button:hover { border-color:#3a4153; }
main { padding:24px 18px; }
.view { color:var(--muted); font-size:15px; }
```

- [ ] **Step 2: `studio/src/app/shell.ts`**

```ts
import { ensureAudio } from '../audio/context';
import { testTone } from '../audio/masterBus';

// Monta la barra superior (Estudio / Aprender) + arranque de audio. Vistas vacías por ahora.
export function mountShell(root: HTMLElement): void {
  root.innerHTML = `
    <header class="topbar">
      <div class="brand">Estudio <span>· Pianova pro</span></div>
      <nav class="tabs">
        <button class="tab on" data-view="studio">Estudio</button>
        <button class="tab" data-view="learn">Aprender</button>
      </nav>
      <div class="grow"></div>
      <button id="btnAudio">Iniciar audio</button>
      <button id="btnTone">Probar sonido</button>
    </header>
    <main>
      <section id="viewStudio" class="view">DAW / groovebox — próximamente.</section>
      <section id="viewLearn" class="view" hidden>Aprender instrumentos — próximamente.</section>
    </main>`;
  const studio = root.querySelector('#viewStudio') as HTMLElement;
  const learn = root.querySelector('#viewLearn') as HTMLElement;
  root.querySelectorAll<HTMLButtonElement>('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b === btn));
      const v = btn.dataset.view;
      studio.hidden = v !== 'studio';
      learn.hidden = v !== 'learn';
    });
  });
  (root.querySelector('#btnAudio') as HTMLButtonElement).addEventListener('click', () => { ensureAudio(); });
  (root.querySelector('#btnTone') as HTMLButtonElement).addEventListener('click', () => { ensureAudio(); testTone(); });
}
```

- [ ] **Step 3: `studio/src/main.ts`** (sustituir el stub)

```ts
import './ui/styles.css';
import { mountShell } from './app/shell';

const app = document.getElementById('app');
if (app) mountShell(app);
```

- [ ] **Step 4: Verificar typecheck + build + test**

Run: `npm run typecheck` luego `npm test` luego `npm run build`
Expected: typecheck sin errores; tests PASAN; build genera `studio/dist/` (con el CSS empaquetado).

- [ ] **Step 5: Verificación manual** (`npm run dev`, o abrir `studio/dist/index.html` en Live Server):
  se ve la barra **Estudio / Aprender** + botones; alternar pestañas cambia el texto; **Iniciar audio**
  no da error; **Probar sonido** suena (440 Hz). `pianova.html` sigue igual.

- [ ] **Step 6: Commit**

```bash
git add studio/src/app/shell.ts studio/src/ui/styles.css studio/src/main.ts
git commit -m "Estudio: esqueleto (barra Estudio/Aprender) + arranque de audio + tono de prueba"
```

---

### Task 5: Documentación

**Files:**
- Modify: `HANDOFF.md`, `CLAUDE.md`. (No tocar `pianova.html`.)

- [ ] **Step 1: `HANDOFF.md`.** Añadir cerca de la cabecera un bloque "**Proyecto pro `studio/` (Fase 0):**"
  explicando (español): se inició la reescritura pro (DAW/groovebox + aprendizaje como módulo) en
  `studio/` con **Vite + TypeScript + Vitest**; Fase 0 = scaffold + esqueleto Estudio/Aprender + bus
  maestro mínimo (`masterIn`/`masterDest`) + transporte portado (`makeTransport`, con test) + tono de
  prueba. Comandos: `cd studio && npm install`, `npm run dev` / `npm test` / `npm run build`
  (`base:'./'`, el `dist` se abre en Live Server). Despliegue futuro: **crear un 2º sitio Netlify con
  base = `studio`** (no automático). `pianova.html` (v1.36) sigue siendo la app publicada hasta la
  Fase 5 (conmutación). Roadmap: F1 instrumentos, F2 suite TAP completa, F3 DAW/groovebox, F4 Aprender, F5 cambio.

- [ ] **Step 2: `CLAUDE.md`.** Añadir una nota al principio de la arquitectura: existe un **proyecto pro
  en `studio/`** (Vite+TS, reescritura modular DAW/groovebox; aprendizaje como módulo) que portará los
  motores de `pianova.html` por fases; `pianova.html` sigue vivo hasta la conmutación (Fase 5).

- [ ] **Step 3: Verificar** que `studio` sigue construyendo: `cd studio && npm run build` (sin errores).

- [ ] **Step 4: Commit**

```bash
git add HANDOFF.md CLAUDE.md
git commit -m "Docs: proyecto pro studio/ (Fase 0 cimientos) + roadmap"
```

---

## Notas de ejecución
- Verificación de este proyecto = scripts npm (`typecheck`/`test`/`build`), NO el `node --check` de
  `pianova.html`. Correr siempre desde `d:\PianoVa\studio`.
- Commitear `package-lock.json` (reproducibilidad); NO commitear `node_modules`/`dist` (gitignore).
- Si `npm install` falla por red/entorno, reportar BLOCKED (no inventar).
- `makeTransport` es idéntico en lógica al de `pianova.html`; el test Vitest cubre la matemática.
- No tocar `pianova.html` ni el despliegue actual en ninguna tarea.
