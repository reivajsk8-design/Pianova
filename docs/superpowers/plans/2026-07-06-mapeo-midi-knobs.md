# Mapeo MIDI de knobs — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Asignar un CC MIDI (con su puerto) a cualquier knob mapeable del Estudio (Vol/Pan/Human, Swing, efectos) por clic derecho / long-press → "Asignar MIDI", y controlarlo desde un mando físico.

**Architecture:** `midi/input.ts` parsea CC y lo entrega por `onControl`. Un singleton `midi/learn.ts` guarda el mapa `id→{cc,puerto}` (localStorage), registra los setters de los knobs, arma el aprendizaje y enruta el CC. `ui/knob.ts` acepta un `midiId` (se registra, muestra puntito, abre el menú). `ui/midiMenu.ts` es el menú + aviso. `studioView`/`rack`/`transport` cablean los ids y el `onControl`.

**Tech Stack:** Vite + TypeScript (strict) + Vitest. Web MIDI (CC). DOM.

## Global Constraints

- Todo el trabajo en `studio/` (NO tocar `pianova.html`). TypeScript **strict**; sin dependencias nuevas.
- Comentarios y textos de interfaz **en español**. Acento verde neón (`#2dff6a` / `var(--pv-acc)`).
- Mapa **global** en `localStorage['estudio-midimap']`; CC **absoluto** (0–127 → rango del parámetro); se guarda
  el **puerto** de origen. Requiere MIDI conectado.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build` (desde `studio/`).
- Commits con trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `midi/input.ts` — parseo de CC + `onControl`

**Files:**
- Modify: `studio/src/midi/input.ts`
- Modify: `studio/src/midi/input.test.ts`

**Interfaces:**
- Produces: `MidiParsed.type` incluye `'cc'`; `MidiHandlers.onControl?(cc, value01, channel, port)`.

- [ ] **Step 1: Escribe los tests que fallan (añadir a `studio/src/midi/input.test.ts`)**

Dentro del `describe('parseMidiMessage', …)` (o al final del archivo en su propio bloque), añade:

```ts
  it('control change (0xB0) → type cc, controlador y valor', () => {
    const r = parseMidiMessage(new Uint8Array([0xB0, 21, 64]));
    expect(r.type).toBe('cc'); expect(r.midi).toBe(21); expect(r.vel).toBeCloseTo(64 / 127, 5); expect(r.channel).toBe(1);
  });
  it('un CC en canal 10 (0xB9) NO se filtra: sigue siendo cc', () => {
    const r = parseMidiMessage(new Uint8Array([0xB9, 7, 100]));
    expect(r.type).toBe('cc'); expect(r.midi).toBe(7); expect(r.channel).toBe(10);
  });
```

- [ ] **Step 2: Ejecuta los tests para verlos fallar**

Run: `cd studio && npm test -- input`
Expected: FAIL (hoy un CC devuelve `type:'other'`).

- [ ] **Step 3: Edita `studio/src/midi/input.ts`**

(a) Añade `'cc'` al tipo y detéctalo ANTES del filtro de canal 10:

```ts
export interface MidiParsed { type: 'on' | 'off' | 'cc' | 'other'; midi: number; vel: number; channel: number; }

export function parseMidiMessage(data: Uint8Array): MidiParsed {
  const status = data[0] ?? 0;
  const cmd = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  const midi = data[1] ?? 0;
  const raw = data[2] ?? 0;
  const vel = raw / 127;
  if (cmd === 0xb0) return { type: 'cc', midi, vel, channel };   // Control Change (cualquier canal, incl. 10)
  if (channel === 10) return { type: 'other', midi, vel, channel };
  if (cmd === 0x90 && raw > 0) return { type: 'on', midi, vel, channel };
  if (cmd === 0x80 || (cmd === 0x90 && raw === 0)) return { type: 'off', midi, vel: 0, channel };
  return { type: 'other', midi, vel, channel };
}
```

(b) Añade `onControl` a `MidiHandlers` y entrégalo en `connectMidi`:

```ts
export interface MidiHandlers {
  onNoteOn(midi: number, vel: number): void;
  onNoteOff(midi: number): void;
  onState(names: string[]): void;
  onControl?(cc: number, value01: number, channel: number, port: string): void;
}
```

En el `inp.onmidimessage` de `connectMidi`, tras las ramas on/off:

```ts
      inp.onmidimessage = (ev: any): void => {
        const p = parseMidiMessage(ev.data as Uint8Array);
        if (p.type === 'on') h.onNoteOn(p.midi, p.vel);
        else if (p.type === 'off') h.onNoteOff(p.midi);
        else if (p.type === 'cc') h.onControl?.(p.midi, p.vel, p.channel, inp.name ?? 'MIDI');
      };
```

- [ ] **Step 4: Ejecuta los tests para verlos pasar**

Run: `cd studio && npm test -- input`
Expected: PASS (los nuevos + los previos).

- [ ] **Step 5: typecheck + build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add studio/src/midi/input.ts studio/src/midi/input.test.ts
git commit -m "Estudio MIDI: parseo de CC + onControl en la entrada MIDI + tests"
```

---

### Task 2: `midi/learn.ts` — mapa, aprendizaje y enrutado (+ tests)

**Files:**
- Create: `studio/src/midi/learn.ts`
- Create: `studio/src/midi/learn.test.ts`

**Interfaces:**
- Produces: `MidiBinding`, `MidiMap`, `targetsForCC`, `serializeMap`, `parseMap`, y el singleton `midiLearn`
  (`register`/`arm`/`cancel`/`armedId`/`handleCC`/`getBinding`/`hasBinding`/`clear`).

- [ ] **Step 1: Escribe los tests que fallan (`studio/src/midi/learn.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { targetsForCC, serializeMap, parseMap, MidiMap } from './learn';

describe('targetsForCC', () => {
  it('empareja por cc y puerto, ignora el resto', () => {
    const map: MidiMap = {
      'vol:ch-1': { cc: 21, port: 'MiniLab' }, 'pan:ch-1': { cc: 22, port: 'MiniLab' }, 'swing': { cc: 21, port: 'S49' }
    };
    expect(targetsForCC(map, 21, 'MiniLab')).toEqual(['vol:ch-1']);
    expect(targetsForCC(map, 21, 'S49')).toEqual(['swing']);
    expect(targetsForCC(map, 99, 'MiniLab')).toEqual([]);
  });
});
describe('serializeMap / parseMap', () => {
  it('ida y vuelta', () => {
    const map: MidiMap = { 'vol:ch-1': { cc: 21, port: 'X' } };
    expect(parseMap(serializeMap(map))).toEqual(map);
  });
  it('tolerante: null / json inválido / binding mal formado → {}', () => {
    expect(parseMap(null)).toEqual({});
    expect(parseMap('no-json')).toEqual({});
    expect(parseMap('{"a":{"cc":"x","port":"y"}}')).toEqual({});   // cc no numérico → descarta
  });
});
```

- [ ] **Step 2: Ejecuta los tests para verlos fallar**

Run: `cd studio && npm test -- learn`
Expected: FAIL (`learn` no existe).

- [ ] **Step 3: Crea `studio/src/midi/learn.ts`**

```ts
// studio/src/midi/learn.ts
// Aprendizaje/mapeo MIDI: asocia un CC físico (nº + puerto) a un knob del Estudio (por id). Helpers puros
// (emparejado/serialización) + un singleton de módulo con el estado (mapa persistido en localStorage, setters
// de los knobs, aprendizaje en curso y enrutado del CC entrante).

export interface MidiBinding { cc: number; port: string }
export type MidiMap = Record<string, MidiBinding>;

// Ids con ese cc+puerto (para enrutar un CC entrante a los knobs mapeados). Puro.
export function targetsForCC(map: MidiMap, cc: number, port: string): string[] {
  return Object.keys(map).filter(id => map[id].cc === cc && map[id].port === port);
}
export function serializeMap(map: MidiMap): string { return JSON.stringify(map); }
export function parseMap(json: string | null): MidiMap {
  if (!json) return {};
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    const out: MidiMap = {};
    for (const id of Object.keys(o)) {
      const b = o[id] as { cc?: unknown; port?: unknown };
      if (b && typeof b.cc === 'number' && typeof b.port === 'string') out[id] = { cc: b.cc, port: b.port };
    }
    return out;
  } catch { return {}; }
}

const KEY = 'estudio-midimap';
function safeGet(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } }

let map: MidiMap = parseMap(safeGet());
const setters = new Map<string, (v01: number) => void>();
let pending: { id: string; onAssigned?: () => void } | null = null;

function save(): void { try { localStorage.setItem(KEY, serializeMap(map)); } catch { /* ignora */ } }

export const midiLearn = {
  register(id: string, setFromMidi: (v01: number) => void): void { setters.set(id, setFromMidi); },
  arm(id: string, onAssigned?: () => void): void { pending = { id, onAssigned }; },
  cancel(): void { pending = null; },
  armedId(): string | null { return pending ? pending.id : null; },
  handleCC(cc: number, value01: number, port: string): void {
    if (pending) {
      map[pending.id] = { cc, port }; save();
      const cb = pending.onAssigned; pending = null; cb?.();
      return;
    }
    for (const id of targetsForCC(map, cc, port)) setters.get(id)?.(value01);
  },
  getBinding(id: string): MidiBinding | undefined { return map[id]; },
  hasBinding(id: string): boolean { return !!map[id]; },
  clear(id: string): void { delete map[id]; save(); }
};
```

- [ ] **Step 4: Ejecuta los tests para verlos pasar**

Run: `cd studio && npm test -- learn`
Expected: PASS.

- [ ] **Step 5: typecheck + build**

Run: `cd studio && npm run typecheck && npm run build`
Expected: PASS (el singleton no se usa aún).

- [ ] **Step 6: Commit**

```bash
git add studio/src/midi/learn.ts studio/src/midi/learn.test.ts
git commit -m "Estudio MIDI: learn (mapa id→CC+puerto, aprendizaje, enrutado) + tests"
```

---

### Task 3: `ui/knob.ts` (midiId) + `ui/midiMenu.ts` + CSS

**Files:**
- Modify: `studio/src/ui/knob.ts`
- Create: `studio/src/ui/midiMenu.ts`
- Modify: `studio/src/ui/styles.css`

**Interfaces:**
- Consumes: `midiLearn` (`midi/learn`).
- Produces: `KnobOpts.midiId?: string`; `openMidiMenu(id, x, y, onChanged)` (`ui/midiMenu`).

Sin test unitario nuevo (DOM/eventos) — verificado por typecheck + build.

- [ ] **Step 1: Crea `studio/src/ui/midiMenu.ts`**

```ts
// studio/src/ui/midiMenu.ts
// Menú flotante para asignar/quitar un CC MIDI a un knob (clic derecho / long-press) + aviso "Mueve un mando…".
import { midiLearn } from '../midi/learn';

let menuEl: HTMLElement | null = null;
let toastEl: HTMLElement | null = null;

function closeMenu(): void { menuEl?.remove(); menuEl = null; }
function toast(msg: string, ms = 0): void {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'midiToast'; document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.classList.add('on');
  if (ms > 0) window.setTimeout(hideToast, ms);
}
function hideToast(): void { toastEl?.classList.remove('on'); }

export function openMidiMenu(id: string, x: number, y: number, onChanged: () => void): void {
  closeMenu();
  const b = midiLearn.getBinding(id);
  const el = document.createElement('div'); el.className = 'midiMenu';
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.innerHTML = `<button data-a="learn">🎹 Asignar MIDI</button>` +
    (b ? `<button data-a="clear">Quitar (CC ${b.cc})</button>` : '');
  document.body.appendChild(el); menuEl = el;
  (el.querySelector('[data-a="learn"]') as HTMLButtonElement).addEventListener('click', () => {
    closeMenu();
    midiLearn.arm(id, () => { const nb = midiLearn.getBinding(id); toast('✓ Asignado a CC ' + (nb ? nb.cc : '?'), 1600); onChanged(); });
    toast('Mueve un mando MIDI…  ·  Esc cancela');
  });
  (el.querySelector('[data-a="clear"]') as HTMLButtonElement | null)?.addEventListener('click', () => {
    midiLearn.clear(id); closeMenu(); onChanged();
  });
}

// Cierra el menú al pulsar fuera; Esc cancela el aprendizaje (si lo hay) y cierra el menú.
document.addEventListener('pointerdown', e => { if (menuEl && !menuEl.contains(e.target as Node)) closeMenu(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (midiLearn.armedId()) { midiLearn.cancel(); hideToast(); }
  closeMenu();
});
```

- [ ] **Step 2: Añade `midiId` a `studio/src/ui/knob.ts`**

(a) Imports (arriba):

```ts
import { midiLearn } from '../midi/learn';
import { openMidiMenu } from './midiMenu';
```

(b) `KnobOpts` gana el campo:

```ts
export interface KnobOpts {
  min: number; max: number; value: number; default?: number; size?: number; midiId?: string;
  onChange: (v: number) => void;
}
```

(c) Al final de `mountKnob`, ANTES de `return { setValue };`, añade el bloque de mapeo:

```ts
  if (opts.midiId) {
    const id = opts.midiId;
    // El mando físico mueve el knob y aplica el valor (absoluto 0–127 → rango del parámetro).
    midiLearn.register(id, (v01) => { value = clamp(opts.min + v01 * range); apply(); opts.onChange(value); });
    const refreshDot = (): void => { root.classList.toggle('mapped', midiLearn.hasBinding(id)); };
    refreshDot();
    root.addEventListener('contextmenu', e => { e.preventDefault(); openMidiMenu(id, e.clientX, e.clientY, refreshDot); });
    // Long-press en táctil: abre el menú si mantienes sin arrastrar ~500 ms.
    let lpTimer: number | null = null;
    const cancelLp = (): void => { if (lpTimer != null) { clearTimeout(lpTimer); lpTimer = null; } };
    root.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      lpTimer = window.setTimeout(() => { dragging = false; openMidiMenu(id, e.clientX, e.clientY, refreshDot); }, 500);
    });
    root.addEventListener('pointermove', cancelLp);
    root.addEventListener('pointerup', cancelLp);
    root.addEventListener('pointercancel', cancelLp);
  }
```

(`dragging`, `clamp`, `range`, `value`, `apply` ya están declarados en `mountKnob`; el bloque va dentro del
cierre, así que los ve.)

- [ ] **Step 3: CSS (`studio/src/ui/styles.css`)**

Tras las reglas de `.knob` (busca `.knobCell span`), añade:

```css
/* Knob mapeado a MIDI: puntito verde arriba-derecha; resalte al estar aprendiendo */
.knob.mapped::after{content:'';position:absolute;top:1px;right:1px;width:6px;height:6px;border-radius:50%;background:#2dff6a;box-shadow:0 0 5px rgba(45,255,106,.6)}
/* Menú MIDI + aviso (fuera de .pvView → colores literales) */
.midiMenu{position:fixed;z-index:80;background:#10130f;border:1px solid #2b3324;border-radius:5px;box-shadow:0 8px 24px rgba(0,0,0,.6);display:flex;flex-direction:column;min-width:150px;overflow:hidden}
.midiMenu button{background:none;border:0;color:#c9d2c9;text-align:left;padding:8px 12px;font-size:12px;cursor:pointer}
.midiMenu button:hover{background:rgba(45,255,106,.12)}
.midiToast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:90;background:#10130f;border:1px solid #2dff6a;color:#c9d2c9;border-radius:5px;padding:8px 14px;font-size:12px;opacity:0;pointer-events:none;transition:opacity .15s}
.midiToast.on{opacity:1}
```

- [ ] **Step 4: typecheck + test + build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: PASS (los tests previos siguen verdes; el knob/menú no se usan con `midiId` aún).

- [ ] **Step 5: Commit**

```bash
git add studio/src/ui/knob.ts studio/src/ui/midiMenu.ts studio/src/ui/styles.css
git commit -m "Estudio MIDI: knob mapeable (midiId + puntito + menú clic derecho/long-press) + midiMenu + CSS"
```

---

### Task 4: Cableado — `onControl` + ids de knobs (studioView, rack, transport)

**Files:**
- Modify: `studio/src/app/studioView.ts`
- Modify: `studio/src/ui/rack.ts`
- Modify: `studio/src/ui/transport.ts`

**Interfaces:**
- Consumes: `midiLearn` (`midi/learn`); `KnobOpts.midiId` (Task 3); `MidiHandlers.onControl` (Task 1).
- Produces: `mountRack(root, rack, title, onChange, onEdit?, midiPrefix?)` (parámetro nuevo al final).

Sin test unitario nuevo (integración/DOM) — verificado por typecheck + build + prueba manual.

- [ ] **Step 1: `studio/src/ui/rack.ts` — `midiPrefix` y `midiId` en los knobs de parámetro**

(a) Firma de `mountRack`:

```ts
export function mountRack(root: HTMLElement, rack: Rack, title: string, onChange: () => void, onEdit?: (effect: Effect) => void, midiPrefix?: string): void {
```

(b) En el montaje de cada knob de parámetro (dentro de `root.querySelectorAll<HTMLElement>('.fxKnob .knob').forEach(...)`),
añade `midiId` a las opciones de `mountKnob` (id por POSICIÓN del efecto en la cadena):

```ts
      mountKnob(el, { min: p.min, max: p.max, value: e.getValues()[p.name], default: p.default, size: 32,
        midiId: midiPrefix ? `fx:${midiPrefix}:${rack.list().findIndex(x => x.id === id)}:${p.name}` : undefined,
        onChange: (v) => {
          const q = Math.round(v / p.step) * p.step;
          e.setParam(p.name, q);
          valSpan.textContent = fmtVal(q, p.unit, p.step);
          onChange();
        } });
```

- [ ] **Step 2: `studio/src/ui/transport.ts` — `midiId` en el knob de Swing**

En la llamada a `mountKnob` del Swing, añade `midiId: 'swing'`:

```ts
  mountKnob(root.querySelector('#tbSwing') as HTMLElement, {
    min: 0, max: 0.7, value: opts.getSwing(), default: 0, size: 34, midiId: 'swing', onChange: opts.onSwing
  });
```

- [ ] **Step 3: `studio/src/app/studioView.ts` — importar `midiLearn` y cablear el CC**

(a) Import (junto a los otros de `../midi`):

```ts
import { midiLearn } from '../midi/learn';
```

(b) En la llamada a `connectMidi` (dentro del manejador de `#stConnect`), añade el `onControl`:

```ts
    connectMidi({
      onNoteOn: (m, v) => playLive(m, v),
      onNoteOff: (m) => stopLive(m),
      onControl: (cc, v01, _ch, port) => midiLearn.handleCC(cc, v01, port),
      onState: (names) => {
        st.classList.toggle('on', names.length > 0);
        st.textContent = names.length ? names.join(' · ') : 'Ningún teclado';
      }
    }).catch(err => {
```

- [ ] **Step 4: `studio/src/app/studioView.ts` — `midiId` en los knobs del mixer**

En `renderMixer`, añade `midiId` a los tres `mountKnob`:

```ts
      if (volEl) mountKnob(volEl, { min: 0, max: 1.2, value: c.volume, default: 0.8, size: 34, midiId: `vol:${c.id}`, onChange: v => {
        daw = updateChannel(daw, c.id, { volume: v }); channels.find(a => a.id === c.id)?.setVolume(v); persist();
      } });
      if (panEl) mountKnob(panEl, { min: -1, max: 1, value: c.pan, default: 0, size: 34, midiId: `pan:${c.id}`, onChange: v => {
        daw = updateChannel(daw, c.id, { pan: v }); channels.find(a => a.id === c.id)?.setPan(v); persist();
      } });
      const humEl = host.querySelector(`[data-hum="${c.id}"]`) as HTMLElement;
      if (humEl) mountKnob(humEl, { min: 0, max: 1, value: c.humanize ?? 0, default: 0, size: 34, midiId: `human:${c.id}`, onChange: v => {
        daw = updateChannel(daw, c.id, { humanize: v }); persist();
      } });
```

- [ ] **Step 5: `studio/src/app/studioView.ts` — `midiPrefix` en los racks**

- Rack maestro (en `initAudio`, la línea `mountRack(root.querySelector('#masterRack') …)`):

```ts
      mountRack(root.querySelector('#masterRack') as HTMLElement, masterRack, 'Maestro', persist, openEqEditor, 'master');
```

- Rack de canal (en `renderSelectedRack`):

```ts
    if (audio && ch) mountRack(host, audio.rack, 'Canal ' + n, persist, openEqEditor, selectedId);
```

- [ ] **Step 6: typecheck + test + build**

Run: `cd studio && npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 7: Prueba manual (a mano en la URL)**

Run: `cd studio && npm run dev` y abre la URL:
1. Pulsa **Conectar teclado** (con un controlador MIDI).
2. **Clic derecho** en el knob de **Volumen** de un canal → **Asignar MIDI** → aparece el aviso; **gira un knob**
   físico → se mapea (aparece el **puntito**). Girar ese mando mueve el Volumen y se oye.
3. Igual con **Pan**, **Human**, **Swing** y un **parámetro de un efecto** (canal y máster).
4. **Clic derecho** de nuevo → **Quitar (CC X)** → desaparece el puntito.
5. Recarga → los mapeos persisten (mismo controlador). **Long-press** en móvil abre el menú.

- [ ] **Step 8: Commit**

```bash
git add studio/src/app/studioView.ts studio/src/ui/rack.ts studio/src/ui/transport.ts
git commit -m "Estudio MIDI: cablea onControl + midiId en mixer/efectos/swing (Vol/Pan/Human/Swing/FX)"
```

---

### Task 5: Docs y versión

**Files:**
- Modify: `studio/package.json` (version → `0.39.0`)
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version** — en `studio/package.json`, `"version"` → `"0.39.0"`.

- [ ] **Step 2: HANDOFF.md** — añade en la zona de estado del Estudio:

```markdown
**Estudio · mapeo MIDI de knobs (v0.39.0):** clic derecho / long-press en un knob mapeable → **"🎹 Asignar
MIDI"** → mueve un mando físico → queda mapeado a ese **CC** (con su **puerto**); **puntito** en los mapeados;
girar el mando mueve el knob y aplica (absoluto 0–127→rango). Mapeable: **Vol/Pan/Human** por canal, **Swing**,
y **parámetros de efectos** (canal y máster, por posición `fx:<prefix>:<slot>:<param>`). `midi/input.ts` parsea
CC + `onControl`; `midi/learn.ts` (mapa `id→{cc,puerto}` en `localStorage['estudio-midimap']`, aprendizaje y
enrutado, helpers puros testeados); `ui/knob.ts` `midiId` + `ui/midiMenu.ts` (menú + aviso + Esc). Mapa global;
requiere MIDI conectado; efectos por posición. Sin cambios de motor.
```

- [ ] **Step 3: CLAUDE.md** — en la sección del Estudio (decisión 5), tras el pulido del menú de arriba, añade:
**mapeo MIDI de knobs (v0.39.0): clic derecho / long-press → Asignar MIDI (coge el próximo CC + puerto);
mapeable Vol/Pan/Human/Swing/efectos; mapa global en localStorage** (`midi/input.ts` CC + `midi/learn.ts` +
`ui/knob.ts` `midiId` + `ui/midiMenu.ts`; sin cambios de motor).

- [ ] **Step 4: Verifica y commitea**

Run: `cd studio && npm test && npm run build`
Expected: PASS.

```bash
git add studio/package.json HANDOFF.md CLAUDE.md
git commit -m "Estudio MIDI: docs (HANDOFF/CLAUDE) y versión 0.39.0"
```

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- `midi/input.ts` CC + `onControl` + tests → Task 1 ✅
- `midi/learn.ts` (mapa/aprendizaje/enrutado/persistencia + helpers puros testeados) → Task 2 ✅
- `ui/knob.ts` `midiId` (register + puntito + menú clic derecho/long-press) + `ui/midiMenu.ts` + CSS → Task 3 ✅
- Cableado: `onControl` en `connectMidi`; ids Vol/Pan/Human, Swing, efectos (canal+máster por posición);
  `mountRack` `midiPrefix` → Task 4 ✅
- Persistencia global (`localStorage['estudio-midimap']`) → Task 2 (singleton) ✅
- Docs/versión → Task 5 ✅

**Placeholders:** ninguno; el código va completo (input, learn, knob, menú, cableado).

**Consistencia de tipos:** `MidiParsed.type:'cc'` + `onControl(cc,value01,channel,port)` (Task 1) los usa el
cableado (Task 4). `midiLearn` (Task 2) lo consumen `ui/knob.ts`/`ui/midiMenu.ts` (Task 3) y studioView (Task 4:
`handleCC`). `KnobOpts.midiId` (Task 3) lo pasan mixer/rack/transport (Task 4). `mountRack(...,midiPrefix?)`
(Task 4) coincide con su uso (canal=`selectedId`, máster=`'master'`). `openMidiMenu(id,x,y,onChanged)` (Task 3)
lo llama el knob (Task 3). Nombres coherentes.

**Estado intermedio válido:** Task 1 (input, `onControl` opcional → no rompe callers) compila/testea; Task 2
(learn, sin usar) compila/testea; Task 3 (knob+menú, `midiId` opcional → knobs sin id igual que antes) compila;
Task 4 cablea; Task 5 docs. Cada tarea deja el build verde.

**Decisión consciente:** el registro de setters es por `id`; un re-mount del knob (renderMixer/renderSelectedRack)
sobrescribe el setter (gana el visible), y un id huérfano de un efecto quitado no molesta. El menú/aviso viven en
`body` (fuera de `.pvView`), por eso usan colores literales. CC absoluto; encoders relativos requieren modo
absoluto en el controlador (igual que `pianova.html`).
