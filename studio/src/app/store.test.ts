import { describe, it, expect } from 'vitest';
import { defaultProject, serializeProject, parseProject, PROJECT_VERSION } from './store';

describe('proyecto v2', () => {
  it('defaultProject es v2 con un canal y rack maestro vacío', () => {
    const p = defaultProject();
    expect(p.version).toBe(PROJECT_VERSION);
    expect(p.version).toBe(2);
    expect(p.daw.channels.length).toBe(1);
    expect(p.masterRack).toEqual({ effects: [] });
  });
  it('round-trip conserva el estado', () => {
    const p = defaultProject();
    p.daw.bpm = 90;
    p.masterRack = { effects: [{ type: 'gain', params: { gain: 6 }, bypassed: false }] };
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
  it('migra un proyecto v1 a un canal 0 con su instrumento y rack', () => {
    const v1 = JSON.stringify({
      version: 1, instrument: 'organo',
      instrumentRack: { effects: [{ type: 'echo', params: {}, bypassed: false }] },
      masterRack: { effects: [] }
    });
    const p = parseProject(v1);
    expect(p.version).toBe(2);
    expect(p.daw.channels.length).toBe(1);
    expect(p.daw.channels[0].instrument).toEqual({ kind: 'synth', preset: 'organo' });
    expect(p.daw.channels[0].rack.effects[0].type).toBe('echo');
    expect(p.masterRack).toEqual({ effects: [] });
  });
  it('tolera basura → proyecto por defecto v2', () => {
    const p = parseProject('{"loquesea":1}');
    expect(p.version).toBe(2);
    expect(p.daw.channels.length).toBe(1);
  });
  it('lanza con JSON inválido', () => {
    expect(() => parseProject('no-json')).toThrow();
  });
});
