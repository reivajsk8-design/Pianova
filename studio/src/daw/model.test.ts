import { describe, it, expect } from 'vitest';
import {
  emptySteps, defaultChannel, defaultDaw, addChannel, removeChannel, updateChannel,
  toggleStep, audibleIds, findChannel, channelSteps, addPattern, removePattern, setCurrentPattern, setSong, setStep,
  defaultSynthxInstrument, defaultSlicerInstrument, newChannelId, syncChannelIdSeed,
  channelLen, addStepsPage, removeStepsPage, effectiveLen, paintNote, duplicatePattern
} from './model';
import { SYNTHX_DEFAULT } from '../audio/synthx-dsp';

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
  it('setStep fija un paso (on + nota) en el patrón actual, inmutable', () => {
    const d = defaultDaw(); const id = d.channels[0].id;
    const d2 = setStep(d, id, 2, { on: true, note: 64 });
    expect(channelSteps(d2, id)[2]).toEqual({ on: true, note: 64 });
    expect(channelSteps(d, id)[2].on).toBe(false);
  });
  it('defaultDaw tiene swing 0', () => { expect(defaultDaw().swing).toBe(0); });
  it('defaultDaw trae escala por defecto (Do cromática)', () => {
    const d = defaultDaw();
    expect(d.scaleRoot).toBe(0);
    expect(d.scaleType).toBe('chromatic');
  });
});

describe('newChannelId + syncChannelIdSeed (evita canales con id duplicado tras recargar)', () => {
  // Semillas ascendentes muy altas para que las pruebas sean robustas al estado del contador
  // (otras pruebas de este archivo crean canales y suben _cid; syncChannelIdSeed solo sube, nunca baja).
  it('tras sincronizar con los canales existentes, el próximo id supera al mayor ch-N', () => {
    syncChannelIdSeed([{ id: 'ch-3' }, { id: 'ch-700001' }, { id: 'ch-2' }]);
    expect(newChannelId()).toBe('ch-700002');
  });
  it('genera ids únicos consecutivos', () => {
    syncChannelIdSeed([{ id: 'ch-800000' }]);
    const a = newChannelId(), b = newChannelId();
    expect(a).toBe('ch-800001');
    expect(b).toBe('ch-800002');
    expect(a).not.toBe(b);
  });
  it('ignora ids que no siguen el patrón ch-N (no baja el contador)', () => {
    syncChannelIdSeed([{ id: 'ch-900000' }]);
    syncChannelIdSeed([{ id: 'foo' }, { id: 'bar-9' }]);   // nada válido → contador intacto
    expect(newChannelId()).toBe('ch-900001');
  });
});

describe('instrumento synthx', () => {
  it('defaultSynthxInstrument crea un synthx con los params por defecto (copia)', () => {
    const inst = defaultSynthxInstrument();
    expect(inst.kind).toBe('synthx');
    if (inst.kind === 'synthx') {
      expect(inst.params).toEqual(SYNTHX_DEFAULT);
      expect(inst.params).not.toBe(SYNTHX_DEFAULT);   // es copia, no la referencia compartida
    }
  });
});

describe('instrumento slicer', () => {
  it('defaultSlicerInstrument crea un slicer con base 60 y sin slices', () => {
    const inst = defaultSlicerInstrument('smp-1');
    expect(inst.kind).toBe('slicer');
    if (inst.kind === 'slicer') {
      expect(inst.sampleId).toBe('smp-1');
      expect(inst.base).toBe(60);
      expect(inst.slices).toEqual([]);
    }
  });
});

describe('longitud de pasos por canal', () => {
  it('channelLen devuelve la longitud del canal en el patrón actual (16 por defecto)', () => {
    const d = defaultDaw();
    expect(channelLen(d, d.channels[0].id)).toBe(16);
  });
  it('addStepsPage añade 16 pasos (apagados) al canal, inmutable', () => {
    const d = defaultDaw(); const id = d.channels[0].id;
    const d2 = addStepsPage(d, id);
    expect(channelLen(d2, id)).toBe(32);
    expect(channelLen(d, id)).toBe(16);                    // original intacto
    expect(channelSteps(d2, id).slice(16).every(s => s.on === false)).toBe(true);
  });
  it('removeStepsPage quita 16, con mínimo de una página', () => {
    const id = defaultDaw().channels[0].id;
    let e = addStepsPage(defaultDaw(), id);                // 32
    e = removeStepsPage(e, id);                            // 16
    expect(channelLen(e, id)).toBe(16);
    const e2 = removeStepsPage(e, id);                     // ya en 16 → se queda en 16
    expect(channelLen(e2, id)).toBe(16);
  });
});

describe('longitud de nota', () => {
  it('effectiveLen: len ausente = 1, respeta len válido y recorta al final', () => {
    const s = emptySteps(8);
    expect(effectiveLen(s, 3)).toBe(1);                 // sin len → 1
    s[2] = { on: true, note: 60, len: 3 };
    expect(effectiveLen(s, 2)).toBe(3);                 // len válido
    s[6] = { on: true, note: 60, len: 5 };
    expect(effectiveLen(s, 6)).toBe(2);                 // recorta a steps.length - i = 8 - 6
  });
  it('paintNote coloca con len, limpia lo cubierto, recorta al final y es inmutable', () => {
    const d0 = defaultDaw();                            // 1 canal, 16 pasos
    const id = d0.channels[0].id;
    const d1 = paintNote(d0, id, 2, 4, 64);
    const steps = d1.patterns[0].steps[id];
    expect(steps[2]).toEqual({ on: true, note: 64, len: 4 });
    expect(steps[3].on).toBe(false);                    // cubierto → limpio
    expect(steps[5].on).toBe(false);
    expect(steps[6].on).toBe(false);                    // fuera del span, seguía apagado
    expect(d0.patterns[0].steps[id][2].on).toBe(false); // original intacto (inmutable)
    const d2 = paintNote(d0, id, 14, 8, 60);            // len 8 desde el paso 14 → recorta a 2
    expect(d2.patterns[0].steps[id][14].len).toBe(2);
  });
});

describe('duplicatePattern', () => {
  it('inserta tras el índice, copia profunda independiente y deja current en el nuevo', () => {
    const d0 = defaultDaw();
    const id = d0.channels[0].id;
    const dP = paintNote(d0, id, 0, 2, 60);             // patrón 0 con una nota
    const dup = duplicatePattern(dP, 0);
    expect(dup.patterns.length).toBe(2);
    expect(dup.current).toBe(1);                        // encima del nuevo
    expect(dup.patterns[1].steps[id][0]).toEqual({ on: true, note: 60, len: 2 });
    dup.patterns[1].steps[id][0].note = 72;            // mutar la copia…
    expect(dup.patterns[0].steps[id][0].note).toBe(60); // …no afecta al original (copia profunda)
  });
  it('reindexa la canción y no hace nada si el índice está fuera de rango', () => {
    let d = addPattern(defaultDaw());                   // 2 patrones (0,1)
    d = setSong(d, [0, 1]);
    const dup = duplicatePattern(d, 0);                 // inserta en pos 1 → el antiguo 1 pasa a 2
    expect(dup.song).toEqual([0, 2]);
    expect(duplicatePattern(d, 9)).toBe(d);             // fuera de rango → mismo objeto
  });
});
