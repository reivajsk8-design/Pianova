import { describe, it, expect } from 'vitest';
import { defaultProject, serializeProject, parseProject, PROJECT_VERSION } from './store';
import { SYNTHX_DEFAULT } from '../audio/synthx-dsp';
import { restoreSamples } from '../audio/sampleStore';

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
    // serializeProject añade siempre el snapshot del almacén de samples (aquí vacío).
    expect(parseProject(serializeProject(p))).toEqual({ ...p, samples: {} });
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
    expect((p.daw.channels[0] as unknown as Record<string, unknown>).steps).toBeUndefined();   // ya no en el canal
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
  it('conserva un paso con acorde (extra) al serializar y parsear', () => {
    const chId = 'ch-1';
    const step = { on: true, note: 60, len: 1, extra: [{ note: 64 }, { note: 67 }] };
    const project = {
      version: 3,
      daw: {
        channels: [{ id: chId, name: 'Canal', instrument: { kind: 'synth', preset: 'piano' }, volume: 0.8, pan: 0, muted: false, soloed: false, rack: { effects: [] } }],
        patterns: [{ steps: { [chId]: [step] } }],
        current: 0, song: [], bpm: 120, steps: 16, swing: 0, scaleRoot: 0, scaleType: 'chromatic'
      },
      masterRack: { effects: [] }
    };
    const back = parseProject(serializeProject(project as never));
    expect(back.daw.patterns[0].steps[chId][0].extra).toEqual([{ note: 64 }, { note: 67 }]);
  });
});

describe('store · synthx tolerante', () => {
  it('normaliza los params de un canal synthx incompleto al abrir', () => {
    const proj = {
      version: 3,
      daw: {
        channels: [{ id: 'c1', name: 'Canal', instrument: { kind: 'synthx', params: { cutoff: 999999 } },
          volume: 0.8, pan: 0, muted: false, soloed: false, rack: { effects: [] } }],
        patterns: [{ steps: { c1: [] } }], current: 0, song: [], bpm: 120, steps: 16, swing: 0
      },
      masterRack: { effects: [] }
    };
    const p = parseProject(JSON.stringify(proj));
    const inst = p.daw.channels[0].instrument;
    expect(inst.kind).toBe('synthx');
    if (inst.kind === 'synthx') {
      expect(inst.params.cutoff).toBe(20000);              // acotado
      expect(inst.params.sine).toBe(SYNTHX_DEFAULT.sine);  // relleno por defecto
      expect(inst.params.lfoDest).toBe('off');
    }
  });

  it('no toca los canales synth/drum', () => {
    const proj = {
      version: 3,
      daw: {
        channels: [{ id: 'c1', name: 'C', instrument: { kind: 'synth', preset: 'organo' },
          volume: 0.8, pan: 0, muted: false, soloed: false, rack: { effects: [] } }],
        patterns: [{ steps: { c1: [] } }], current: 0, song: [], bpm: 120, steps: 16, swing: 0
      },
      masterRack: { effects: [] }
    };
    const p = parseProject(JSON.stringify(proj));
    expect(p.daw.channels[0].instrument).toEqual({ kind: 'synth', preset: 'organo' });
  });
});

describe('store · samples', () => {
  it('serializeProject incluye los samples del almacén (snapshot vivo)', () => {
    restoreSamples({ 'smp-1': { name: 'break', b64: 'AAAA' } });   // pobla el almacén (singleton)
    const back = parseProject(serializeProject(defaultProject()));
    expect(back.samples?.['smp-1']).toEqual({ name: 'break', b64: 'AAAA' });
  });
  it('proyecto sin bloque samples da samples vacío (tolerante)', () => {
    const back = parseProject('{"version":3,"daw":{"channels":[],"patterns":[]}}');
    expect(back.samples).toEqual({});
  });
});
