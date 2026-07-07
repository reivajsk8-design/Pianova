// studio/src/learn/geometry.ts
// Geometría horizontal de las teclas, compartida por las notas que caen y el teclado DOM (ui/keyboard.ts + CSS).
// Blancas repartidas por igual; negras encima con el mismo desfase que su CSS.

export interface KeyGeom {
  midi: number;
  x: number;
  w: number;
  black: boolean;
}

const WHITE = [0, 2, 4, 5, 7, 9, 11]; // semitonos de teclas blancas dentro de la octava

function isBlack(midi: number): boolean {
  return !WHITE.includes(((midi % 12) + 12) % 12);
}

// Disposición de teclas para [low,high] en `width` px. whiteW = width / nBlancas.
export function keyLayout(low: number, high: number, width: number): KeyGeom[] {
  const whites: number[] = [];
  for (let m = low; m <= high; m++) {
    if (!isBlack(m)) whites.push(m);
  }

  const whiteW = whites.length ? width / whites.length : width;
  const out: KeyGeom[] = [];

  for (let m = low; m <= high; m++) {
    if (isBlack(m)) {
      const leftWhites = whites.filter((w) => w < m).length;
      out.push({
        midi: m,
        x: leftWhites * whiteW - whiteW * 0.3,
        w: whiteW * 0.6,
        black: true,
      });
    } else {
      const i = whites.indexOf(m);
      out.push({
        midi: m,
        x: i * whiteW,
        w: whiteW,
        black: false,
      });
    }
  }

  return out;
}

export function keyGeomFor(layout: KeyGeom[], midi: number): KeyGeom | undefined {
  return layout.find((k) => k.midi === midi);
}
