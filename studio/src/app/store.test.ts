import { describe, it, expect } from 'vitest';
import { defaultProject, serializeProject, parseProject, PROJECT_VERSION } from './store';

describe('proyecto v3', () => {
  it('defaultProject es v3 con 1 canal y 1 patrón', () => {
    const p = defaultProject();
    expect(p.version).toBe(3);
    expect(PROJECT_VERSION).toBe(3);
    expect(p.daw.channels.length).toBe(1);
    expect(p.daw.patterns.length).toBe(1);
  });
  it('round-trip conserva el estado', () => {
    const p = defaultProject(); p.daw.bpm = 100;
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
  it('migra v2 (canales con steps) a v3 (steps en el patrón 0)', () => {
    const v2 = JSON.stringify({
      version: 2,
      daw: { channels: [{ id: 'c1', name: 'Canal', instrument: { kind: 'synth', preset: 'organo' },
        steps: [{ on: true }, { on: false }], volume: 0.8, pan: 0, muted: false, soloed: false, rack: { effects: [] } }],
        bpm: 90, steps: 16 },
      masterRack: { effects: [] }
    });
    const p = parseProject(v2);
    expect(p.version).toBe(3);
    expect(p.daw.channels[0].id).toBe('c1');
    expect((p.daw.channels[0] as Record<string, unknown>).steps).toBeUndefined();   // ya no en el canal
    expect(p.daw.patterns[0].steps['c1'][0].on).toBe(true);
    expect(p.daw.bpm).toBe(90);
  });
  it('migra v1 a v3 (canal 0 + patrón 0)', () => {
    const v1 = JSON.stringify({ version: 1, instrument: 'organo', instrumentRack: { effects: [] }, masterRack: { effects: [] } });
    const p = parseProject(v1);
    expect(p.version).toBe(3);
    expect(p.daw.channels[0].instrument).toEqual({ kind: 'synth', preset: 'organo' });
    expect(p.daw.patterns.length).toBe(1);
  });
  it('tolera basura → v3 por defecto; lanza con JSON inválido', () => {
    expect(parseProject('{"x":1}').version).toBe(3);
    expect(() => parseProject('no-json')).toThrow();
  });
});
