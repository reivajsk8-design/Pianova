// Ventana triangular para el crossfade granular del pitch shifter. Pura y testeable.
// triWindow(x) con x en [0,1]: 0 en los bordes, 1 en el centro. Dos ventanas a media unidad de
// desfase suman 1 (crossfade de amplitud constante).
export function triWindow(x: number): number {
  return 1 - Math.abs(2 * x - 1);
}
