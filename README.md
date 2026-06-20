# Pianova 🎹

App web para **aprender a tocar el piano tocando**, al estilo Synthesia / Guitar Hero:
las notas caen hacia un teclado en pantalla y tú las tocas en tu teclado MIDI.

Pensada con una prioridad por encima de todo: **que enseñe de verdad**.

---

## Qué hace

- Se conecta a un teclado MIDI por USB (probado con **Native Instruments Komplete Kontrol S49 MK1**).
- Dibuja un teclado de 2 octavas (Do4–Do6) y hace caer las notas de la canción.
- Tres modos:
  - **Practicar (espera a que toques):** la canción se detiene en cada nota y la tecla correcta se ilumina; no avanza hasta que la tocas. *Es el modo principal de aprendizaje.*
  - **Acompañar (a tempo):** la canción corre sola y mide aciertos y precisión.
  - **Tocar libre:** solo el teclado, sin canción.
- Etiquetas en **solfeo** (Do, Re, Mi…), tempo ajustable y estadísticas básicas.
- Si no hay teclado a mano: se puede tocar con el **ratón** o con la fila `A S D F G H J K` (negras: `W E T Y U`) del ordenador.

## Cómo abrirlo

Necesitas **Chrome** o **Edge** en un **ordenador** (Web MIDI no funciona en móvil ni en Safari).

1. Abre `pianova.html` en el navegador (doble clic suele bastar).
2. Pulsa **Conectar teclado** y acepta el permiso de MIDI.
3. Elige canción y dale a **Empezar**.

> 💡 **Recomendado al editar en VS Code:** instala la extensión **Live Server**, haz clic derecho en `pianova.html` → *Open with Live Server*. Así corre en `localhost`, que es más limpio para Web MIDI y para recargar mientras editas.

## Estructura

Ahora mismo todo vive en **un solo archivo** para que sea fácil de mover y editar:

```
pianova.html      ← HTML + CSS + JavaScript, todo dentro
README.md         ← este archivo
CLAUDE.md         ← contexto e instrucciones para Claude Code
HANDOFF.md        ← estado actual y próximos pasos
```

Si en algún momento crece, se puede separar en `index.html` + `style.css` + `app.js`. Para un proyecto de este tamaño, un solo archivo está bien.

## Tecnología

- **Web MIDI API** — leer las notas del teclado físico.
- **Web Audio API** — generar el sonido (piano sintetizado, sin librerías).
- **Canvas 2D** — dibujar las notas que caen y el teclado.
- **JavaScript puro**, sin framework ni paso de compilación.

## Estado

Prototipo funcional (v0.1). El sonido es un piano sintetizado sencillo; los sonidos buenos de Native Instruments llegarán por separado vía Ableton más adelante. Las canciones están escritas a mano como ejemplo. Ver `HANDOFF.md` para el detalle y la hoja de ruta.
