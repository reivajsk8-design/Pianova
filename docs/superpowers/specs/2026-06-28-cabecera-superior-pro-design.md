# Diseño — Cabecera superior "pro" (fila de marca / pestañas / instrumento / conexión)

**Fecha:** 2026-06-28 · **Proyecto:** Pianova (`pianova.html`) · **Estado:** diseño aprobado por el
usuario ("me gusta"). Implementación con **subagentes**. Es la continuación del lavado de cara pro:
la única fila que quedaba con estilo "viejo".

## Objetivo

Dar a la **fila superior** (`<header>`) el mismo aire pro que el resto de la app (cabecera de Aprender
y transporte del Looper): pestañas como **control segmentado**, **Instrumento** como grupo con
etiqueta, **estado de conexión como chip con punto de color**, **Ayuda** a icono, y un móvil que
envuelve limpio. Es **solo HTML/CSS** + un pequeño enganche del chip al estado de conexión que ya
existe. **Sin cambios de lógica** (MIDI, audio, instrumento, tabs).

## Alcance

**Dentro** — el `<header>` (líneas ~341-372) y su CSS/responsive:
1. **Pestañas Aprender/Looper → segmentado:** `.tabs` pasa a una "píldora" contenedora con dos
   segmentos; el activo en ámbar. La lógica de cambio de pestaña (`.tab` `data-tab`, el `click` que
   togglea `.on`, `setTab`) **no cambia**: solo CSS.
2. **Instrumento → grupo con etiqueta:** reestructurar `<label class="fld">Instrumento <select
   id="instrument">…</label>` a un grupo con etiqueta pequeña en mayúsculas ("INSTRUMENTO") encima
   del desplegable, al estilo `.tpCol`/`.tpLab`. El `<select id="instrument">` y sus `<optgroup>`/
   `<option>` se conservan intactos (mismo `id`, mismos valores).
3. **Estado de conexión → chip con punto:** envolver `#device` en un chip (`.connChip`) con un punto
   (`.dot`) + el texto. **Rojo "Sin conectar"** por defecto; **verde + nombre(s) del teclado** cuando
   conecta; ámbar/gris "Ningún dispositivo" si no detecta. Se engancha al estado existente: en
   `bindInputs` (y al inicio) se togglea una clase del chip según `midiConnected`/`names.length`.
   `deviceEl.textContent` sigue mostrando el texto como hoy.
4. **Ayuda → icono:** `#help` pasa de "❔ Ayuda" a un icono (`?` o `❔`) redondo/cuadrado con
   `title="Ver el tutorial"` (tooltip conserva el texto). Mismo `id` y handler.
5. **Conectar teclado:** se queda como **botón principal ámbar con texto** (acción importante, más
   clara con palabra). Un punto más pulido si encaja, pero sin cambiar su `id`/handler. El chip verde
   confirma el estado de conexión.
6. **Móvil (`@media`):** la cabecera envuelve limpio. Hoy <620px oculta `.brand span` y `.device`;
   ahora el chip sustituye a `.device` plano: en <620px se muestra el chip **solo con el punto** (sin
   texto, `.connChip .txt{display:none}`) para conservar el indicador de estado sin saturar; pestañas
   y botón Conectar siguen siendo objetivos táctiles cómodos. El **escritorio** mantiene todo, solo
   más ordenado.

**Fuera (YAGNI):** cambiar la lógica de MIDI/instrumento/tabs; tocar el resto de la app; el Looper en
móvil (es el siguiente candidato, otro ciclo).

## Restricciones (heredadas)

- **Un solo archivo** `pianova.html`; sin librerías; sin build; textos/comentarios en **español**.
- **No empeorar el escritorio**; los retoques de tamaño van en las media queries.
- Seguir la **línea pro** existente: reutilizar variables (`--amber`, `--line`, `--panel`, `--ink`,
  `--muted`) y el patrón etiqueta-en-mayúsculas (`.tpLab`).
- Conservar `id`s y handlers: `#instrument`, `#device`, `#help`, `#connect`, `.tab[data-tab]`.
- El chip refleja el estado **real**: el único punto de enganche JS es togglear una clase de estado
  (p. ej. `connChip.classList.toggle('on', midiConnected)`) en `bindInputs` y un estado inicial
  "desconectado" en el HTML.

## Componentes (unidades)

1. **CSS de pestañas segmentadas** (`.tabs` contenedor + `.tab` segmentos): píldora con borde y fondo
   `--panel`; segmento activo `.tab.on` en ámbar; sin huecos entre segmentos (un solo control).
2. **Grupo Instrumento** (`.hdrCol` o reutilizar `.tpCol` + `.tpLab`): etiqueta "INSTRUMENTO" encima
   del `<select id="instrument">`. Estilo del select coherente con los demás.
3. **Chip de conexión** (`.connChip` + `.dot`): contenedor redondeado con borde; `.dot` 8px círculo;
   estado por clase: desconectado = punto rojo, conectado = punto verde. Texto = `#device`.
   Enganche JS mínimo en `bindInputs`.
4. **Botón Ayuda icono** (`.hdrIcon` o reutilizar `.lnIcon`): `?`/`❔` con `title`.
5. **Responsive del header**: media queries para envolver y compactar (chip solo-punto o reducido en
   <620px; pestañas y Conectar táctiles).

## Riesgos / notas

- **Estado inicial del chip:** el HTML debe nacer en "desconectado" (punto rojo, "Sin conectar"); al
  conectar, `bindInputs` lo pone verde. Cuidar que un re-render o `onstatechange` (conectar/desconectar
  en caliente) actualice el chip en ambos sentidos.
- **No romper el layout actual:** `.grow` (espaciador flexible) separa marca/pestañas de los controles
  de la derecha; mantenerlo para que el header respire igual en escritorio.
- **Móvil:** evitar que el chip con texto largo (nombre de teclado) desborde; recortar o mostrar solo
  el punto en pantallas estrechas.
- **Accesibilidad mínima:** el icono de Ayuda mantiene `title`; el chip no debe depender solo del
  color (el texto "Sin conectar"/nombre acompaña al punto).

## Verificación

- `node --check` de cada `<script>` (2) + balance de llaves CSS.
- **Prueba manual (Chrome/Edge, Live Server):** el header se ve pro y ordenado; las pestañas cambian
  de vista igual que antes; el selector de Instrumento funciona y cambia el sonido; al pulsar
  **Conectar teclado**, el chip pasa a **verde con el nombre** (y a rojo "Sin conectar" si se
  desconecta en caliente); Ayuda abre el tutorial; en móvil la cabecera envuelve limpio sin
  solapamientos. El escritorio del resto no cambia.
- Subir versión, actualizar `CLAUDE.md` y `HANDOFF.md`.
