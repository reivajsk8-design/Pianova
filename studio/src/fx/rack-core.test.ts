import { describe, it, expect } from 'vitest';
import { reorder, serializeRack } from './rack-core';

const mk = (id: string) => ({ id, serialize: () => ({ type: id, params: {}, bypassed: false }) });

describe('reorder', () => {
  it('mueve un elemento hacia abajo', () => {
    const l = [mk('a'), mk('b'), mk('c')];
    expect(reorder(l, 'a', 1).map(x => x.id)).toEqual(['b', 'a', 'c']);
  });
  it('mueve un elemento hacia arriba', () => {
    const l = [mk('a'), mk('b'), mk('c')];
    expect(reorder(l, 'c', -1).map(x => x.id)).toEqual(['a', 'c', 'b']);
  });
  it('no hace nada en los bordes', () => {
    const l = [mk('a'), mk('b')];
    expect(reorder(l, 'a', -1).map(x => x.id)).toEqual(['a', 'b']);
    expect(reorder(l, 'b', 1).map(x => x.id)).toEqual(['a', 'b']);
  });
  it('ignora un id inexistente', () => {
    const l = [mk('a'), mk('b')];
    expect(reorder(l, 'z', 1).map(x => x.id)).toEqual(['a', 'b']);
  });
});

describe('serializeRack', () => {
  it('serializa la lista en orden', () => {
    const l = [mk('a'), mk('b')];
    expect(serializeRack(l)).toEqual({ effects: [
      { type: 'a', params: {}, bypassed: false },
      { type: 'b', params: {}, bypassed: false }
    ] });
  });
});
