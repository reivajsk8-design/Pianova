import { describe, it, expect } from 'vitest';
import { defaultProject, serializeProject, parseProject, PROJECT_VERSION } from './store';

describe('proyecto (de)serializa', () => {
  it('defaultProject tiene la forma esperada', () => {
    const p = defaultProject();
    expect(p).toEqual({ version: PROJECT_VERSION, instrument: 'piano',
      instrumentRack: { effects: [] }, masterRack: { effects: [] } });
  });
  it('round-trip conserva el estado', () => {
    const p = defaultProject();
    p.instrument = 'organo';
    p.masterRack = { effects: [{ type: 'gain', params: { gain: 6 }, bypassed: false }] };
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
  it('tolera campos ausentes o basura', () => {
    const p = parseProject('{"instrument":123}');
    expect(p.instrument).toBe('piano');
    expect(p.instrumentRack).toEqual({ effects: [] });
    expect(p.masterRack).toEqual({ effects: [] });
  });
  it('lanza con JSON inválido', () => {
    expect(() => parseProject('no-json')).toThrow();
  });
});
