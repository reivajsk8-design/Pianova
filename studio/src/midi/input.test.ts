import { describe, it, expect } from 'vitest';
import { parseMidiMessage } from './input';

describe('parseMidiMessage', () => {
  it('note on (0x90 vel>0)', () => {
    const r = parseMidiMessage(new Uint8Array([0x90, 60, 100]));
    expect(r.type).toBe('on'); expect(r.midi).toBe(60); expect(r.vel).toBeCloseTo(100 / 127, 5); expect(r.channel).toBe(1);
  });
  it('note off (0x80)', () => {
    const r = parseMidiMessage(new Uint8Array([0x80, 60, 64]));
    expect(r.type).toBe('off'); expect(r.midi).toBe(60);
  });
  it('note on con vel 0 = off', () => {
    expect(parseMidiMessage(new Uint8Array([0x90, 60, 0])).type).toBe('off');
  });
  it('canal 10 (percusión) se ignora', () => {
    const r = parseMidiMessage(new Uint8Array([0x99, 38, 100]));   // 0x90 | canal 9 (=canal 10)
    expect(r.type).toBe('other'); expect(r.channel).toBe(10);
  });
  it('CC es ahora cc (no other)', () => {
    expect(parseMidiMessage(new Uint8Array([0xB0, 7, 100])).type).toBe('cc');
  });
  it('control change (0xB0) → type cc, controlador y valor', () => {
    const r = parseMidiMessage(new Uint8Array([0xB0, 21, 64]));
    expect(r.type).toBe('cc'); expect(r.midi).toBe(21); expect(r.vel).toBeCloseTo(64 / 127, 5); expect(r.channel).toBe(1);
  });
  it('un CC en canal 10 (0xB9) NO se filtra: sigue siendo cc', () => {
    const r = parseMidiMessage(new Uint8Array([0xB9, 7, 100]));
    expect(r.type).toBe('cc'); expect(r.midi).toBe(7); expect(r.channel).toBe(10);
  });
});
