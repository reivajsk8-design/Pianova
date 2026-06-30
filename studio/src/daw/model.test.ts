import { describe, it, expect } from 'vitest';
import {
  emptySteps, defaultChannel, defaultDaw, addChannel, removeChannel, updateChannel,
  toggleStep, audibleIds, findChannel, channelSteps, addPattern, removePattern, setCurrentPattern, setSong
} from './model';

describe('modelo daw con patrones', () => {
  it('defaultDaw: 1 canal, 1 patrón, 16 pasos, sin canción', () => {
    const d = defaultDaw();
    expect(d.channels.length).toBe(1);
    expect(d.patterns.length).toBe(1);
    expect(d.current).toBe(0);
    expect(d.song).toEqual([]);
    expect(channelSteps(d, d.channels[0].id).length).toBe(16);
  });
  it('toggleStep alterna en el patrón actual y es inmutable', () => {
    const d = defaultDaw(); const id = d.channels[0].id;
    const d2 = toggleStep(d, id, 3);
    expect(channelSteps(d2, id)[3].on).toBe(true);
    expect(channelSteps(d, id)[3].on).toBe(false);
  });
  it('addChannel añade el canal y pasos vacíos en todos los patrones', () => {
    const d = addPattern(defaultDaw());           // 2 patrones
    const d2 = addChannel(d, defaultChannel('organo', 'b'));
    expect(d2.channels.length).toBe(2);
    expect(d2.patterns.every(p => Array.isArray(p.steps['b']))).toBe(true);
    expect(d.channels.length).toBe(1);            // original intacto
  });
  it('removeChannel quita el canal de todos los patrones', () => {
    const d = addChannel(addPattern(defaultDaw()), defaultChannel('o', 'b'));
    const d2 = removeChannel(d, 'b');
    expect(d2.channels.find(c => c.id === 'b')).toBeUndefined();
    expect(d2.patterns.every(p => p.steps['b'] === undefined)).toBe(true);
  });
  it('addPattern añade y selecciona el nuevo; tiene pasos para los canales', () => {
    const d = defaultDaw(); const d2 = addPattern(d);
    expect(d2.patterns.length).toBe(2);
    expect(d2.current).toBe(1);
    expect(Array.isArray(d2.patterns[1].steps[d.channels[0].id])).toBe(true);
  });
  it('removePattern mantiene ≥1 y reajusta current/canción', () => {
    let d = addPattern(addPattern(defaultDaw()));   // 3 patrones (0,1,2), current 2
    d = setSong(d, [0, 2, 1]);
    const d2 = removePattern(d, 1);                  // quita el patrón 1
    expect(d2.patterns.length).toBe(2);
    expect(d2.song).toEqual([0, 1]);                // el 2 baja a 1, el 1 desaparece
  });
  it('setCurrentPattern acota el índice', () => {
    const d = defaultDaw();
    expect(setCurrentPattern(d, 9).current).toBe(0);
    expect(setCurrentPattern(d, -3).current).toBe(0);
  });
  it('audibleIds: solo/mute', () => {
    const d = updateChannel(addChannel(defaultDaw(), defaultChannel('o', 'b')), 'b', { soloed: true });
    const a = audibleIds(d.channels);
    expect(a.has('b')).toBe(true);
    expect(a.has(d.channels[0].id)).toBe(false);
  });
  it('updateChannel no toca el original', () => {
    const d = addChannel(defaultDaw(), defaultChannel('o', 'b'));
    const d2 = updateChannel(d, 'b', { volume: 0.3 });
    expect(findChannel(d2, 'b')?.volume).toBe(0.3);
    expect(findChannel(d, 'b')?.volume).toBe(0.8);
  });
  it('emptySteps crea n pasos apagados', () => {
    expect(emptySteps(8).every(s => s.on === false)).toBe(true);
  });
});
