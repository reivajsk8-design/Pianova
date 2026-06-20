# Mejoras del módulo de canales (Looper) — Plan por fases

> Archivo único `pianova.html`, sin build, sin tests automáticos. Cada fase se verifica con
> `node --check` (sintaxis) + prueba manual en Chrome/Edge. Se hace **una fase por vez**,
> guardando y actualizando docs entre cada una.

**Contexto:** el Looper ya tiene 8 canales, grabación/reproducción por canal, sonido por canal
(`'piano'` global o `'drum:<grupo>'` TR-808), persistencia del patrón y atajos MIDI.

## Fase 0 — Ayuda S49 (rápida)
- Nota en el panel de atajos: las flechas 4‑D del MK1 no mandan MIDI; usar **◀◀/▶▶** (rebobinar/
  avanzar) para Canal ◀/▶, y mapear Play por su nota real (el monitor la muestra).

## Fase 1 — Instrumento por canal + volumen
- `channel.sound` pasa a spec completa: `'synth:<preset>'` | `'sf:<nombre>'` | `'drum:<grupo>'`
  (por defecto `'synth:piano'`).
- Caché de soundfonts `sfCache = { nombre: player }` con `ensureSoundfont(nombre)` (carga perezosa,
  varios a la vez: violín + piano…). `loadSoundfont` global puede reutilizar la caché.
- Selector de sonido por canal ampliado: optgroups **Sintetizados**, **Reales** (se cargan al
  elegir), **Batería** (cuando esté cargada).
- `playChannelSound(ch, midi, vel, dur)` enruta por la spec; aplica **volumen del canal**
  (`channel.vol`, 0..1) escalando velocity (sf/drum) y el pico (synth, nuevo parámetro en
  `synthNoteOn`).
- UI: slider de **volumen** por canal. Persistir `sound` y `vol` en `saveLooper`; al restaurar,
  cargar los soundfonts necesarios.

## Fase 2 — Cuantizar
- Selector de **cuadrícula** en el transporte: Libre / ♪ corchea (0.5) / ♬ semicorchea (0.25).
- `quantize(notes, grid)`: `startBeat = round(startBeat/grid)*grid`. Si la cuadrícula está activa,
  cuadrar al terminar de grabar (`lpFinishRecording`). Botón **"Cuadrar"** por canal para
  cuadrar lo ya grabado. Guardar tras cuadrar.

## Fase 3 — Editor interactivo (piano-roll en `#lpCanvas`)
- Hit-test de los bloques de nota dibujados. **Clic** = seleccionar; **doble clic / botón borrar** =
  eliminar nota; **arrastrar** = mover en tiempo (x→beat) y altura (y→midi). Mapear coordenadas con
  la misma escala que `lpDraw`. Guardar tras editar. (Fase más grande; se hace al final.)

## Riesgos
- Polifonía del synth: `voices` está indexado por midi globalmente; dos canales synth con la misma
  nota a la vez pueden pisarse (aceptable de momento; los drums no se ven afectados).
- Varios soundfonts cargados = más memoria/red; aceptable para unos pocos.