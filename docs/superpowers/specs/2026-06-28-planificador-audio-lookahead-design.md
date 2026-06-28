# Diseño — Reproducción fluida con reloj de audio + adelanto (lookahead)

**Fecha:** 2026-06-28 · **Proyecto:** Pianova (`pianova.html`) · **Estado:** diseño aprobado por el
usuario ("perfecto empecemos"). Implementación con **subagentes** (un implementador por tarea +
revisión entre tareas). Alcance elegido: **Escuchar + Looper**.

## Problema

Hoy el tiempo de reproducción se lleva con el **reloj de la imagen** (`requestAnimationFrame`):
- En **Escuchar**, `frame()` hace `songBeat += dt*(bpm/60)` y dispara notas con `playFullAt(prev,
  songBeat)` → `noteOn(...)` en `actx.currentTime`, con parada por `setTimeout`.
- En el **Looper**, `lpTick(dt)` hace `lp.beat += dt*(bpm/60)` y dispara con
  `lpPlayback(prev, lp.beat)` → `playChannelSound(...)` en `actx.currentTime`, parada por `setTimeout`.

Como las notas se disparan en el instante del fotograma, cualquier tirón de imagen (crear muchos
nodos de audio en el hilo principal en canciones densas) retrasa o agolpa el sonido → **clipping
percibido de timing, parpadeo y "no fluido"**, peor a tempos altos (drum and bass).

## Solución

Patrón estándar "A Tale of Two Clocks" (Chris Wilson): **separar el reloj de audio del de imagen** y
**agendar las notas con adelanto** en el reloj de audio.

1. **Posición desde el reloj de audio.** En vez de acumular beats por fotograma, la posición se
   calcula a partir de `actx.currentTime` contra un ancla `{audioTime, beat, bpm}`. Un tirón de
   imagen ya no mueve el ritmo (cada fotograma re-deriva la posición del reloj de audio).
2. **Adelanto (lookahead).** Un agendador mira `LOOKAHEAD_SEC = 0.1` s hacia delante y programa cada
   nota en su instante exacto de audio (`source.start(when)`, envolvente y parada en tiempos
   absolutos). El sonido entra en cola antes de ocurrir, así que un tirón no lo retrasa.

**Clave:** el *inicio sonoro* de cada nota es `audioTimeForBeat(startBeat)`, el MISMO instante en que
la posición visual (derivada del reloj de audio) cruza ese beat. Audio y dibujo quedan sincronizados;
el adelanto solo cambia *cuándo se lo decimos* a la tarjeta, no *cuándo suena*.

## Alcance

**Dentro:**
- Motor de sonido capaz de "tocar en el instante X" y "parar en el instante Y" (synth, samples,
  instrumentos reales `sf`, batería) — base reutilizable por Escuchar y Looper.
- **Escuchar** (`mode === 'listen'`): reproduce `fullNotes` con reloj de audio + adelanto.
- **Looper** (`lp.playing`): reproduce las notas de los canales con reloj de audio + adelanto,
  manejando el **bucle** (agendar también la(s) vuelta(s) siguiente(s) dentro de la ventana).

**Fuera (YAGNI / otro ciclo):**
- Reto y la mano automática de Acompañar (`playAutoAt`) — quedan como están (el usuario eligió
  Escuchar + Looper). El motor nuevo los deja preparados para migrarlos después sin tocar su lógica.
- Cambiar el aspecto, añadir botones u opciones. Es una mejora **invisible**.

## Restricciones (heredadas)

- **Un solo archivo** `pianova.html`; sin librerías nuevas; sin build; textos/comentarios en español;
  `smplr` solo bajo demanda por CDN. **No empeorar el escritorio ni el móvil.**
- **Tocar en vivo sigue siendo inmediato:** `noteOn`/`silence` desde MIDI o ratón, los pads y la
  grabación del Looper (`lpCapture`, sonidos `live` de `playChannelSound` con `durBeats == null`) NO
  pasan por el adelanto. El agendador solo afecta a la reproducción de secuencias.
- **Cambio de BPM en marcha:** re-anclar el reloj (sin saltos ni notas perdidas/dobladas).
- **Pausa/seek/cambio de canción o de compases:** reiniciar ancla y punteros del agendador.
- Reutiliza y respeta: `fullNotes`, `lp.channels[].notes` (`{midi,startBeat,dur,vel}`),
  `lpLoopBeats()`, `ch.muted`/`lp.recording`, `lpClickEl` (metrónomo), `saveLooper`, `masterDest()`,
  el bus maestro (el soft-clipper v1.26 sigue siendo la pared final).

## Arquitectura (unidades)

### 1. Motor de sonido con tiempo explícito (`when`)
Añadir un parámetro de **instante de audio** a las funciones de disparo (por defecto
`actx.currentTime`, así el comportamiento en vivo no cambia):
- `synthNoteOn(midi, vel, preset, gainMul, when)` — `t = when ?? actx.currentTime`; `osc.start(t)`,
  envolvente y filtro relativos a `t`. Guardar en `voices[midi]` como hoy.
- **Parada programada del synth:** helper `synthStopAt(midi/voice, when)` que agenda el release en un
  instante absoluto (`cancelScheduledValues(when)`, rampa a 0.0001 en `when+release`, `osc.stop` tras
  el release). Para secuencias se usa esto en vez del `setTimeout` + `silence`.
- `playChannelSound(ch, midi, vel, durBeats, when)` — propaga `when`:
  - `sample:` → `src.start(when ?? 0/actualtime, ts, dur)` (BufferSource acepta `when`).
  - `drum:`/`drumkit` → `drumKit.start({ ..., time: when })` (smplr acepta `time`).
  - `sf:` → `player.start({ note, velocity, time: when, duration: durSec })` (smplr agenda inicio y
    duración; **sin `setTimeout`** para las secuencias).
  - `synth:` → `synthNoteOn(..., when)` + `synthStopAt(..., when + durSec)`.
  - Si `when == null` (en vivo) → comportamiento idéntico al actual.
- Para **Escuchar**, exponer un equivalente con instante: `noteOnAt(midi, vel, when, durSec)` que use
  el instrumento global (`currentInstrument`) y agende inicio + parada (reutiliza la misma lógica por
  tipo synth/sf/sample que `noteOn`).

### 2. Reloj de transporte (helper reutilizable)
Una función fábrica `makeTransport()` que encapsula el ancla y las conversiones, para no duplicar la
matemática entre Escuchar y Looper:
- Estado: `{ audioTime0, beat0, bpm }`.
- `anchor(beat, bpm)` → fija `audioTime0 = actx.currentTime`, `beat0 = beat`, `bpm`.
- `beatNow()` → `beat0 + (actx.currentTime - audioTime0) * (bpm/60)`.
- `timeForBeat(b)` → `audioTime0 + (b - beat0) * (60/bpm)`.
- `setBpm(newBpm)` → re-ancla en la posición actual (`anchor(beatNow(), newBpm)`).
Constante global `LOOKAHEAD_SEC = 0.1`.

### 3. Agendador de "Escuchar" (`listenScheduler`)
- Precondición: `fullNotes` ordenado por `startBeat` (ya lo está) y un puntero `listenSchedIdx`.
- Al **empezar** Escuchar (`start()` rama listen): `transport.anchor(songBeatInicial, bpm)`,
  `listenSchedIdx = 0` (o el primero ≥ posición de inicio si hay seek).
- En cada `frame()` (rama listen): 
  1. `horizon = transport.beatNow() + LOOKAHEAD_SEC*(bpm/60)`.
  2. Mientras `listenSchedIdx < fullNotes.length` y `fullNotes[listenSchedIdx].startBeat ≤ horizon`:
     agendar esa nota en `transport.timeForBeat(startBeat)` con `noteOnAt(midi, vel, when, durSec)`;
     `listenSchedIdx++`.
  3. `songBeat = transport.beatNow()` (para el dibujo y el cabezal); fin cuando
     `songBeat > lastFull + 2`.
- **Iluminar teclas** (`pressed`): en vez de pintar al disparar, marcar/desmarcar según `beatNow`
  cruce `startBeat`/`startBeat+dur` (visual sigue al reloj de audio → coincide con el sonido).
- **Cambio de BPM:** el `input` de `#tempo` llama a `transport.setBpm(...)` cuando Escuchar está
  activo (las notas ya agendadas mantienen su instante; las futuras se recalculan).

### 4. Agendador del Looper (`looperScheduler`)
El Looper es cíclico; se agenda en **beats absolutos** (sin envolver) y se convierten las posiciones
de nota (envueltas en `[0,total)`) a absolutas sumando `vuelta*total`.
- Estado: `transport` propio + `lpSchedBeat` (frontera absoluta ya agendada).
- Al **arrancar** (`lpTogglePlay` → play) o tras cuenta de entrada: `transport.anchor(0, bpm)`,
  `lpSchedBeat = 0`, limpiar marcas.
- En cada `lpTick` (sustituye al disparo directo de `lpPlayback`):
  1. `horizon = transport.beatNow() + LOOKAHEAD_SEC*(bpm/60)`.
  2. Para cada beat-de-nota absoluto en `(lpSchedBeat, horizon]`: para cada canal no muteado y que no
     sea el que se está grabando, agendar las notas cuyo `startBeat` (envuelto) caiga en ese tramo,
     en `transport.timeForBeat(beatAbsoluto)`, con `playChannelSound(ch, midi, vel, dur, when)`.
  3. `lpSchedBeat = horizon`.
  4. `lp.beat = transport.beatNow() % total` (para dibujo, cabezal y metrónomo).
- **Metrónomo:** agendar el clic en el instante de cada tiempo entero (también con adelanto), o
  mantener el clic por cruce de `beatNow` (aceptable; el clic va directo a `destination`). Decisión:
  agendarlo con `lpClickSound` admitiendo `when` para que también vaya fino.
- **Bucle:** al envolver, NO hace falta "resetear fired" porque el agendador trabaja en beats
  absolutos monótonos; cada posición de nota de cada vuelta se agenda una sola vez.
- **Grabación:** `lpCapture` sigue usando `lp.beat` (derivado del reloj de audio, más preciso). El
  canal en grabación no se agenda (se oye en vivo al tocarlo). Al cerrar el bucle, `lpFinishRecording`
  igual que hoy.
- **Editar notas en marcha** (piano-roll): el agendador solo mira 0.1 s adelante, así que los cambios
  se reflejan casi al instante en la siguiente vuelta/tramo. Aceptable.
- **Cambio de BPM/compases:** `setBpm` re-ancla; cambiar compases ya reinicia canales (`lpInitChannels`)
  → reiniciar `transport.anchor(0,bpm)` y `lpSchedBeat`.

### 5. Notas ya sonando al parar/seek
Al **parar** (`playing=false` / `lpTogglePlay` stop) o saltar (seek/cambio de canción): llamar a
`silenceAll()` (ya existe) para cortar voces vivas, y reiniciar punteros del agendador. Las notas
agendadas en el futuro inmediato (≤0.1 s) pueden sonar como "cola" mínima; si molesta, recortar
agendando solo lo imprescindible (no se considera bloqueante).

## Flujo de datos (resumen)
```
empezar (listen/looper): transport.anchor(beat0, bpm); puntero=inicio
frame/lpTick:
  horizon = beatNow() + LOOKAHEAD*(bpm/60)
  agendar notas con startBeat (abs) en (yaAgendado, horizon] -> *NoteOn*At(when=timeForBeat(beat))
  posición visual = beatNow()  (dibujo, cabezal, teclas iluminadas, metrónomo)
cambio bpm: transport.setBpm(nuevo)
parar/seek: silenceAll(); reiniciar ancla y punteros
en vivo (MIDI/pads/grabar): noteOn/silence/playChannelSound SIN when -> inmediato (sin cambios)
```

## Riesgos / notas
- **smplr `time`/`duration`:** confirmar en la práctica que `start({time, duration})` agenda bien
  inicio y parada para `sf:` y batería; si alguna versión no lo respeta, mantener `setTimeout` como
  respaldo solo para ese tipo (no para synth/sample, que sí controlamos al 100%).
- **Cola al parar:** ≤100 ms de notas ya agendadas; mitigable cortando con `silenceAll()` y, si hace
  falta, no agendando más allá de la posición de parada.
- **Doble disparo / saltos:** el agendador en beats absolutos monótonos evita re-disparos; cuidar
  re-anclar (no “saltar atrás”) en cambios de BPM (usar `beatNow()` como nuevo `beat0`).
- **Latencia percibida:** 100 ms de adelanto son invisibles en reproducción (no en vivo). No tocar el
  camino en vivo.
- **No romper lo que funciona:** el Looper ya graba/edita/persiste; el cambio se limita al *disparo
  de la reproducción*. Mantener `lp.beat`/`songBeat` como posición visible (ahora derivada del audio).

## Verificación
- `node --check` de cada `<script>` + balance de llaves CSS (no hay tests/build).
- **Tests Node de funciones puras:** la matemática del transporte (`beatNow`/`timeForBeat`
  inversas), la selección de notas en una ventana `(a, horizon]` incluyendo el cruce de bucle en
  beats absolutos, y el cálculo de `durSec` desde `durBeats`/bpm.
- **Prueba manual (Chrome/Edge, Live Server):** Escuchar de una canción densa (Pink Panther) suena
  fluido y cuadrado; el Looper a 170+ BPM con varios canales suena fino; cambiar BPM en marcha no
  descuadra; grabar, editar en el piano-roll y persistir siguen funcionando; tocar en vivo sigue
  siendo inmediato. Comparar antes/después.
- Subir versión, actualizar `CLAUDE.md` y `HANDOFF.md`.
