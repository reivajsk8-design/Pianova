# Mapeo MIDI de knobs — Diseño

**Fecha:** 2026-07-06 · **Versión objetivo:** 0.39.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Poder **asignar un control MIDI (CC)** de un knob/fader físico a cualquier knob mapeable del Estudio
(Vol/Pan/Human por canal, Swing, y parámetros de efectos de canal y máster), para manejarlos en directo desde
un controlador (MiniLab / S49 / MPK). Modelo LMMS/pianova: clic derecho / pulsación larga → "Asignar MIDI" →
auto-detecta el CC al mover un mando → queda mapeado (recordando el puerto).

## Decisiones tomadas (con el usuario)

- **Mapeable:** Vol/Pan/Human de cada canal, Swing, y parámetros de efectos (rack de canal y de máster).
- **Aprendizaje:** clic derecho (o pulsación larga en táctil) sobre el knob → menú **"🎹 Asignar MIDI" /
  "Quitar (CC X)"**; "Asignar" arma y coge el **próximo CC** que llegue. **Esc** cancela.
- **Valor absoluto:** el CC (0–127) se mapea directo al rango del parámetro.
- **Mapa global** (localStorage, ligado a tu controlador; no por proyecto). Se guarda el **puerto** de origen.
- Feature de verdad → se ejecuta con el flujo completo (spec → plan → subagentes con revisión).

## Arquitectura

Cuatro piezas con límites claros:

- **`midi/input.ts`:** añade parseo de **CC** y un callback `onControl`.
- **`midi/learn.ts` (nuevo):** el mapa `targetId → {cc, puerto}`, el registro de setters de los knobs, el estado
  de "aprendiendo", el enrutado del CC entrante y la persistencia. Con **helpers puros** (testeados).
- **`ui/knob.ts`:** cada knob acepta un `midiId`; se registra, muestra el puntito de "mapeado" y abre el menú
  MIDI (clic derecho / long-press).
- **`ui/midiMenu.ts` (nuevo):** el menú flotante + el aviso ("Mueve un mando…") + Esc para cancelar.
- **Cableado** en `app/studioView.ts` (ids de los knobs + `onControl` al conectar) y en `ui/rack.ts` /
  `ui/transport.ts` (pasar el `midiId`).

### `midi/input.ts`

- `MidiParsed.type` gana `'cc'`. `parseMidiMessage` detecta CC (**`cmd === 0xB0`**) **antes** del filtro de
  canal 10 (un CC puede venir en cualquier canal, incluido el 10). Para CC: `{ type: 'cc', midi: controlador,
  vel: valor/127, channel }`.
- `MidiHandlers` gana `onControl?(cc: number, value01: number, channel: number, port: string): void`.
- En `connectMidi`, si `p.type === 'cc'` → `h.onControl?.(p.midi, p.vel, p.channel, inp.name ?? 'MIDI')` (el
  nombre de la entrada = puerto).

### `midi/learn.ts`

Tipos y **helpers puros** (testeables):

```ts
export interface MidiBinding { cc: number; port: string }
export type MidiMap = Record<string, MidiBinding>;
export function targetsForCC(map: MidiMap, cc: number, port: string): string[];   // ids con ese cc+puerto
export function serializeMap(map: MidiMap): string;                                // JSON
export function parseMap(json: string | null): MidiMap;                            // tolerante (→ {})
```

Singleton de módulo (estado compartido entre knob.ts y studioView):

```ts
export const midiLearn: {
  register(id: string, setFromMidi: (v01: number) => void): void;   // el knob registra su setter (re-mount lo sobrescribe)
  arm(id: string, onAssigned?: () => void): void;                    // arma el aprendizaje para ese knob
  cancel(): void;                                                     // desarma
  armedId(): string | null;
  handleCC(cc: number, value01: number, port: string): void;         // aprende (si armado) o enruta a los knobs mapeados
  getBinding(id: string): MidiBinding | undefined;
  hasBinding(id: string): boolean;
  clear(id: string): void;                                           // quita el mapeo (persiste)
};
```

- Estado interno: `map` (cargado de `localStorage['estudio-midimap']`), `setters: Map<id, fn>`, `pending`.
- `handleCC`: si hay `pending` → `map[pending.id] = {cc, port}`; guarda; llama `pending.onAssigned?.()`; desarma.
  Si no → para cada id de `targetsForCC(map, cc, port)` con setter registrado → `setter(value01)`.
- `clear`/asignación → guardan (`serializeMap` a localStorage).

### `ui/knob.ts`

- `KnobOpts` gana `midiId?: string`. Cuando existe:
  - Registra `midiLearn.register(midiId, v01 => { value = clamp(min + v01*range); apply(); onChange(value); })`.
  - Si `midiLearn.hasBinding(midiId)` → clase `.mapped` (puntito). 
  - `contextmenu` (clic derecho) y **long-press** (táctil, ~500 ms sin arrastrar) → `openMidiMenu(midiId, x, y,
    refreshDot)` de `ui/midiMenu.ts`. Evita el menú del navegador (`preventDefault`).
  - `refreshDot` recalcula la clase `.mapped` tras asignar/quitar.

### `ui/midiMenu.ts`

- `openMidiMenu(id, x, y, onChanged)`: menú flotante (div en `body`, posicionado en x/y) con:
  - **"🎹 Asignar MIDI"** → `midiLearn.arm(id, () => { showToast('✓ Asignado a CC ' + cc); onChanged(); })` +
    `showToast('Mueve un mando MIDI…  ·  Esc cancela')`.
  - **"Quitar (CC X)"** (solo si `hasBinding`) → `midiLearn.clear(id); onChanged()`.
- Cierre del menú al hacer clic fuera. **Esc**: si `armedId()` → `cancel()` + oculta el aviso; si no, cierra el
  menú. Aviso = un `#midiToast` fijo (abajo-centro), se autooculta.

### `app/studioView.ts` / `ui/rack.ts` / `ui/transport.ts`

- **Cableado del CC:** en la llamada a `connectMidi` (botón "Conectar teclado") añade
  `onControl: (cc, v01, _ch, port) => midiLearn.handleCC(cc, v01, port)`.
- **Ids de knobs:**
  - Mixer (`renderMixer`): `vol:<chId>`, `pan:<chId>`, `human:<chId>`.
  - Transporte (`ui/transport.ts`): el knob de Swing → `midiId: 'swing'`.
  - Efectos (`ui/rack.ts`): `mountRack` gana un parámetro `midiPrefix`; cada knob de parámetro →
    `fx:<midiPrefix>:<posición>:<nombreParam>`. En studioView: rack de canal → `midiPrefix = selectedId`;
    rack maestro → `midiPrefix = 'master'`.

## Persistencia y compatibilidad

- El mapa vive en `localStorage['estudio-midimap']` (global, no en el proyecto). No afecta a proyectos ni a
  nada existente; si no hay mapa, todo funciona como hasta ahora (sin mapeos).

## Qué NO cambia

- El motor, el modelo del proyecto, la entrada de notas (sigue igual; el canal 10 se ignora **solo para
  notas**, no para CC), el resto de la vista. Los knobs sin `midiId` (synthx, EQ) no son mapeables por ahora.

## Bordes

- **Requiere MIDI conectado:** el CC solo llega tras "Conectar teclado". Si no hay Web MIDI, no hay mapeo (los
  knobs siguen a ratón/táctil).
- **Efectos por posición:** `fx:<prefix>:<slot>:<param>` apunta a la posición en la cadena; si reordenas o
  quitas efectos, el mapeo apunta a otro efecto (aceptado, como en LMMS).
- **Re-montaje de knobs:** el registro es por `id`; un re-mount sobrescribe el setter (gana el knob visible).
  Un id huérfano (efecto quitado) no molesta.
- **Puerto:** se guarda el nombre de la entrada; dos controladores con el mismo nº de CC no se pisan.
- **Absoluto:** knobs de encoders en modo *relativo* no encajan (hay que ponerlos en *absoluto* en el
  controlador) — igual que en `pianova.html`.

## Pruebas

- **Unitarias (Vitest):**
  - `midi/input.test.ts`: `parseMidiMessage` de un CC (`0xB0`) → `type:'cc'`, controlador y valor correctos,
    incluido en canal 10 (no se filtra).
  - `midi/learn.test.ts`: `targetsForCC` (empareja por cc+puerto, ignora otros), `serializeMap`/`parseMap`
    (ida y vuelta, tolerante a JSON inválido → `{}`).
- **No unitarias (typecheck + build + a oído/mano en la URL):** clic derecho en Vol/Pan/Human/Swing/efecto →
  Asignar → mover un mando físico → mapea (puntito); girar el mando mueve el knob y aplica; Quitar; persiste al
  recargar; long-press en táctil.

## Restricciones globales

- Todo en `studio/`; no tocar `pianova.html`. TypeScript **strict**; sin dependencias nuevas.
- Comentarios/UI en español. Acento verde neón `var(--pv-acc)`.
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
