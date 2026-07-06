import { describe, it, expect } from 'vitest';
import { targetsForCC, serializeMap, parseMap, MidiMap } from './learn';

describe('targetsForCC', () => {
  it('empareja por cc y puerto, ignora el resto', () => {
    const map: MidiMap = {
      'vol:ch-1': { cc: 21, port: 'MiniLab' }, 'pan:ch-1': { cc: 22, port: 'MiniLab' }, 'swing': { cc: 21, port: 'S49' }
    };
    expect(targetsForCC(map, 21, 'MiniLab')).toEqual(['vol:ch-1']);
    expect(targetsForCC(map, 21, 'S49')).toEqual(['swing']);
    expect(targetsForCC(map, 99, 'MiniLab')).toEqual([]);
  });
});
describe('serializeMap / parseMap', () => {
  it('ida y vuelta', () => {
    const map: MidiMap = { 'vol:ch-1': { cc: 21, port: 'X' } };
    expect(parseMap(serializeMap(map))).toEqual(map);
  });
  it('tolerante: null / json inválido / binding mal formado → {}', () => {
    expect(parseMap(null)).toEqual({});
    expect(parseMap('no-json')).toEqual({});
    expect(parseMap('{"a":{"cc":"x","port":"y"}}')).toEqual({});   // cc no numérico → descarta
  });
});
