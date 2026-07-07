# Medidores de pico por canal (MIXER) — Diseño

**Fecha:** 2026-07-07 · **Versión objetivo:** 0.41.0 · **Ámbito:** `studio/` (no tocar `pianova.html`)

## Objetivo

Un **medidor de nivel vertical** en cada tira de canal del MIXER que se mueve con el sonido (post-fader),
estilo mezcladora. Feedback visual "pro" con muy poco coste.

## Decisiones tomadas (con el usuario)

- **Vertical** (estilo mezcladora), a un lado de los knobs Vol/Pan/Human.
- **Post-fader** (tras volumen/mute); escala en dB (rango útil ~−48…0 dB); **sube al instante, baja suave**
  (decaimiento); color **verde → ámbar → rojo** de abajo arriba.
- El bucle de refresco corre **solo con el MIXER abierto** y el audio activo (eficiente).
- Solo UI + un **tap** de audio (AnalyserNode, no afecta al sonido).

## Arquitectura

- **`audio/meter.ts` (nuevo):** helper puro `meterNorm(peak)` (pico lineal 0–1 → nivel 0–1 en dB). Testeable.
- **`daw/channel.ts`:** cada canal gana un `AnalyserNode` que toma la señal **tras el `gain`** (post-fader) y un
  método `getLevel(): number` (pico lineal 0–1).
- **`ui/channelstrip.ts`:** la tira gana un medidor vertical (`.chMeterV` + `.chMeterVFill`).
- **`app/studioView.ts`:** un bucle rAF `meterTick` (activo solo con `tab === 'mixer'` y canales de audio
  creados) lee `getLevel`, aplica `meterNorm` + decaimiento y fija la altura del relleno. + CSS.

### `audio/meter.ts`

```ts
// Pico lineal (0–1) → nivel 0–1 en dB para el medidor: 0 dB (pico 1) = 1, floorDb por debajo = 0.
export function meterNorm(peak: number, floorDb = 48): number {
  if (peak <= 0) return 0;
  const db = 20 * Math.log10(peak);
  return Math.max(0, Math.min(1, (db + floorDb) / floorDb));
}
```

### `daw/channel.ts`

- `Channel` gana `getLevel(): number;`.
- En `makeChannel`: `const analyser = actx.createAnalyser(); analyser.fftSize = 256; gain.connect(analyser);`
  (tap paralelo; el analyser no tiene salida conectada → no afecta al audio). Un buffer reutilizable
  `const meterBuf = new Float32Array(analyser.fftSize);`.
- `getLevel()`: `analyser.getFloatTimeDomainData(meterBuf as Float32Array<ArrayBuffer>);` recorre el buffer y
  devuelve el **pico** (`Math.max(Math.abs(...))`), 0–1.
- `dispose`: añade `analyser` a la lista de nodos que se desconectan.

### `ui/channelstrip.ts`

En `channelStripHTML`, como último hijo del `.chStrip` (tras `.chMix`):

```html
<div class="chMeterV" title="Nivel"><div class="chMeterVFill" data-meter="${ch.id}"></div></div>
```

### `app/studioView.ts`

```ts
const meterDisp = new Map<string, number>();   // nivel mostrado por canal (con decaimiento)
let meterRaf = 0;
function meterTick(): void {
  const active = tab === 'mixer' && channels.length > 0;
  if (active) {
    for (const a of channels) {
      const target = meterNorm(a.getLevel());
      const disp = Math.max(target, (meterDisp.get(a.id) ?? 0) - 0.05);   // sube al instante, baja suave
      meterDisp.set(a.id, disp);
      const el = root.querySelector(`.chMeterVFill[data-meter="${a.id}"]`) as HTMLElement | null;
      if (el) el.style.height = (disp * 100) + '%';
    }
  }
  meterRaf = active ? requestAnimationFrame(meterTick) : 0;
}
function startMeters(): void { if (!meterRaf && tab === 'mixer') meterRaf = requestAnimationFrame(meterTick); }
```

- `startMeters()` se llama al **entrar en el MIXER** (en el cambio de pestaña, cuando `t === 'mixer'`) y al final
  de `initAudio` (por si el MIXER ya está a la vista al arrancar el audio). El bucle **se auto-detiene** al salir
  del MIXER (`active` falso → `meterRaf = 0`).

### CSS (`ui/styles.css`)

```css
.chMeterV{position:relative;width:8px;height:44px;flex:0 0 auto;border-radius:2px;background:#0d1016;border:1px solid var(--pv-line);overflow:hidden}
.chMeterVFill{position:absolute;left:0;right:0;bottom:0;height:0;background:linear-gradient(to top,#2dff6a 0%,#f2a33c 78%,#e0533a 100%);background-size:100% 44px;background-position:0 bottom;background-repeat:no-repeat}
```

(`background-size` fijo a la altura del medidor → al crecer el relleno desde abajo, revela el degradado
verde→ámbar→rojo de abajo arriba, como un medidor real.)

## Persistencia y compatibilidad

- No hay estado que persistir (es visual en vivo). No afecta al proyecto, al motor ni al sonido.

## Qué NO cambia

- El grafo de audio de sonido (el analyser es un sink en paralelo), el modelo, el resto de la vista. El medidor
  es solo lectura.

## Bordes

- **Sin audio inicializado:** `channels` vacío → el bucle no hace nada; arranca al crear los canales (primer
  gesto). Fuera del MIXER, el bucle no corre.
- **Post-fader:** el medidor refleja volumen y mute (mute → `gain` 0 → nivel 0). El pan no cambia el nivel del
  tap (va antes del panner).
- **Coste:** un AnalyserNode por canal (barato) y un rAF solo mientras miras el MIXER.

## Pruebas

- **Unitarias (Vitest, `audio/meter.test.ts`):** `meterNorm`: `0 → 0`; `1 → 1` (0 dB); `0.5 ≈ 0.875` (−6 dB);
  pico muy bajo (`1e-3`, −60 dB) → `0` (recorta); floorDb configurable.
- **No unitarias (typecheck + build + a oído/vista):** en el MIXER, con sonido, cada canal muestra su nivel
  (sube/baja, verde→rojo en picos); mute lo apaga; fuera del MIXER no consume.

## Restricciones globales

- Todo en `studio/`; no tocar `pianova.html`. TypeScript strict; sin dependencias nuevas.
- Comentarios/UI en español. Acento verde neón (`#2dff6a` / `var(--pv-acc)`).
- Verificación por tarea: `cd studio && npm run typecheck && npm test && npm run build`.
- Commits con trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
