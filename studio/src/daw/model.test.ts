import { describe, it, expect } from 'vitest';
import {
  emptySteps, defaultChannel, defaultDaw, addChannel, removeChannel,
  updateChannel, toggleStep, audibleIds, findChannel
} from './model';

describe('modelo daw', () => {
  it('emptySteps crea n pasos apagados', () => {
    const s = emptySteps(4);
    expect(s.length).toBe(4);
    expect(s.every(x => x.on === false)).toBe(true);
  });
  it('defaultDaw tiene un canal y 16 pasos', () => {
    const d = defaultDaw();
    expect(d.channels.length).toBe(1);
    expect(d.steps).toBe(16);
    expect(d.channels[0].instrument).toEqual({ kind: 'synth', preset: 'piano' });
  });
  it('addChannel es inmutable y añade', () => {
    const d = defaultDaw();
    const d2 = addChannel(d, defaultChannel('organo', 16, 'ch-x'));
    expect(d.channels.length).toBe(1);     // original intacto
    expect(d2.channels.length).toBe(2);
    expect(d2.channels[1].id).toBe('ch-x');
  });
  it('removeChannel quita por id sin tocar el original', () => {
    const d = addChannel(defaultDaw(), defaultChannel('organo', 16, 'ch-x'));
    const d2 = removeChannel(d, 'ch-x');
    expect(d.channels.length).toBe(2);
    expect(d2.channels.length).toBe(1);
  });
  it('updateChannel aplica un patch a un canal', () => {
    const d = addChannel(defaultDaw(), defaultChannel('organo', 16, 'ch-x'));
    const d2 = updateChannel(d, 'ch-x', { volume: 0.5, muted: true });
    expect(findChannel(d2, 'ch-x')?.volume).toBe(0.5);
    expect(findChannel(d2, 'ch-x')?.muted).toBe(true);
    expect(findChannel(d, 'ch-x')?.volume).toBe(0.8);   // original intacto
  });
  it('toggleStep alterna un paso de un canal', () => {
    const d = defaultDaw();
    const id = d.channels[0].id;
    const d2 = toggleStep(d, id, 3);
    expect(findChannel(d2, id)?.steps[3].on).toBe(true);
    expect(findChannel(d, id)?.steps[3].on).toBe(false);
  });
  it('audibleIds: sin solo suenan los no muteados', () => {
    const d = updateChannel(addChannel(defaultDaw(), defaultChannel('o', 16, 'b')), 'b', { muted: true });
    const a = audibleIds(d.channels);
    expect(a.has(d.channels[0].id)).toBe(true);
    expect(a.has('b')).toBe(false);
  });
  it('audibleIds: con algún solo suenan solo los soloed', () => {
    const d = updateChannel(addChannel(defaultDaw(), defaultChannel('o', 16, 'b')), 'b', { soloed: true });
    const a = audibleIds(d.channels);
    expect(a.has('b')).toBe(true);
    expect(a.has(d.channels[0].id)).toBe(false);
  });
});
