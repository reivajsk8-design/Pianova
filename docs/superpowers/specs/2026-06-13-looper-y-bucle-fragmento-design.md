# Diseño — Bucle de fragmento + Looper

**Fecha:** 2026-06-13
**Proyecto:** Pianova (`pianova.html`, archivo único, sin dependencias)
**Estado:** aprobado por el usuario para implementar.

Dos mejoras que se diseñan y entregan juntas, pero se mantienen como dos piezas
de código separadas y legibles:

1. **Bucle de fragmento** — dentro de la app de aprender, modo *Practicar*.
2. **Looper** — pestaña nueva tipo DAW sencillo.

El objetivo del proyecto sigue siendo la **pedagogía**; el looper es una zona aparte
que no debe complicar ni poner en riesgo la experiencia de aprender.

---

## 1. Bucle de fragmento (modo Practicar)

**Idea:** mientras practicas, marcas el principio y el final de la parte difícil
tocando, y la app la repite en bucle hasta dominarla.

### Flujo de uso
1. Pulsas **Empezar** y practicas normal.
2. Al llegar a la primera nota difícil, pulsas **"Inicio aquí"** → marca esa nota
   (la nota objetivo actual, `idx`) como inicio del fragmento.
3. Sigues tocando hasta la última nota difícil y pulsas **"Fin aquí"** → marca el final.
4. El bucle se activa: al acertar la nota *fin*, en vez de seguir, `idx` vuelve a la
   nota *inicio* y se repite el fragmento. Un contador de **vueltas** sube cada repetición.
5. **"Quitar bucle"** borra la selección y vuelve a la canción completa.

### UI nueva (barra de controles, solo visible/útil en modo Practicar)
- Botones: `Inicio aquí` · `Fin aquí` · `Quitar bucle`
  (Fin y Quitar desactivados hasta que tengan sentido).
- Pequeño contador de **vueltas**.
- **Banda translúcida** sobre el carril de notas que cubre los beats del fragmento.

### Comportamiento / decisiones
- **Solo en modo Practicar** en esta versión (en *Acompañar* se podrá añadir luego).
- Si *Fin* < *Inicio*, se intercambian automáticamente.
- Los **aciertos siguen sumando** durante el bucle; no se "completa" la canción
  mientras se repite.
- Marcar funciona **mientras juegas**: "Inicio/Fin aquí" usan la nota objetivo actual.
- Al **quitar el bucle**, el fragmento se reinicia (idx vuelve al inicio del fragmento
  o, si se quita del todo, se sigue la canción).

### Estado nuevo (variables)
- `loopStart` (índice de nota | null), `loopEnd` (índice | null), `loopOn` (bool),
  `loopRounds` (entero).

### Fuera de alcance
Compases, selección por clic/arrastre, persistencia entre sesiones.

---

## 2. Looper (pestaña nueva)

**Idea:** una zona aparte donde grabas frases cortas tocando, se repiten solas, y
apilas canales para montar una base. Estilo "loop station" / vista de sesión sencilla.

### Navegación
- Dos pestañas arriba: **Aprender** (todo lo actual) y **Looper** (lo nuevo).
- Cambiar de pestaña muestra/oculta cada zona. El **teclado, el audio (`noteOn`/`silence`)
  y la entrada MIDI se comparten** entre ambas; al cambiar de pestaña se enruta la
  entrada al destino correcto (juzgar notas en Aprender / grabar en Looper).

### Transporte global
- **Reproducir / Parar** (un botón que alterna).
- **Tempo** (BPM) compartido con un campo propio del looper.
- Selector de **longitud**: 1 / 2 / 4 compases (4 tiempos por compás). Por defecto **2**.
- **Metrónomo** (clic) on/off; **activado por defecto** (necesario para grabar a tiempo).

### Canales
- **4 canales**. Cada uno: **Grabar**, **Silenciar**, **Borrar**, nombre/color propio.
- Todos usan el **mismo piano sintetizado** actual; el color solo identifica visualmente.
- **Rejilla visual** por canal: las notas grabadas como bloques dentro del bucle, con una
  **línea de reproducción** que recorre el bucle al ritmo.

### Cómo se graba (flujo)
1. Ajustas tempo y longitud; das a **Reproducir** (suena metrónomo + canales con contenido).
2. Pulsas **Grabar** en un canal → **cuenta de entrada de 1 compás** (clics) → grabas la
   frase **tal cual** durante la longitud elegida.
3. Al completar el bucle, el canal pasa a **repetir** solo. Grabas en otro canal y se apilan.
4. **Silenciar** apaga sin borrar; **Borrar** vacía el canal.

### Modelo de datos
- Reloj propio del looper en **beats** (`loopBeat` que avanza con `dt * bpm/60`, módulo
  longitud-total-en-beats), independiente del reloj de la canción de Aprender.
- Cada canal: `{ notes: [{midi, startBeat, dur, vel}], muted, recording, color, name }`.
  Las notas se guardan con su beat **relativo al inicio del bucle** (timing real).
- Grabación: al pulsar nota se registra `noteOn` con su `startBeat`; al soltar se cierra
  `dur`. Notas que no se sueltan antes de fin de bucle se cierran al límite.

### Programación de reproducción
- En cada frame, por cada canal no silenciado, disparar las notas cuyo `startBeat` cruza
  la posición del reloj en esta vuelta (con manejo del salto al reiniciar el bucle).
- Reutiliza `noteOn(midi, vel)` / `silence(midi)`. Las notas del looper y las del usuario
  comparten el sintetizador (polifonía en `voices`).

### Decisiones / simplificaciones
- **Timing real** (sin cuantización).
- **Solo en memoria**: recargar la página vacía todo.
- La **longitud se fija antes de la primera grabación**; cambiarla con canales grabados
  pide confirmación y **vacía** los canales (evita pistas de distinta duración).
- Metrónomo: clic sintetizado corto (oscilador), acento en el tiempo 1.

### Fuera de alcance (primera versión)
Cuantización, exportar audio/MIDI, volumen por pista, sonidos distintos por canal,
persistencia entre sesiones, número de canales configurable.

---

## Riesgos / cuidado
- **Geometría compartida** del teclado: no romper el alineado notas/teclado en Aprender.
- **AudioContext** sigue creándose/reanudándose tras gesto del usuario (`ensureAudio()`).
- Mantener el archivo legible: secciones separadas por comentarios; el looper en su propio
  bloque de estado/lógica/render, sin enredarse con la lógica de `judge`/canción.
- Web MIDI: enrutar la entrada según la pestaña activa sin perder note-off en transiciones.
