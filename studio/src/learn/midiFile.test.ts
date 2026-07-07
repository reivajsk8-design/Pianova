import { describe, it, expect } from 'vitest';
import { parseMidiToMelody } from './midiFile';

// Construye un ArrayBuffer de un Standard MIDI File mínimo (formato 0, 1 pista, división 96 ticks/negra).
function buildMidi(): ArrayBuffer {
  const track = [
    0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20,   // tempo 500000us = 120 bpm
    0x00, 0x90, 0x3C, 0x40,                       // t0: note on 60 vel 64
    0x00, 0x90, 0x43, 0x40,                       // t0: note on 67 (acorde: melodía se queda la más aguda)
    0x60, 0x80, 0x3C, 0x00,                       // +96: note off 60
    0x00, 0x80, 0x43, 0x00,                       // t96: note off 67
    0x00, 0x90, 0x3E, 0x40,                       // t96: note on 62
    0x60, 0x80, 0x3E, 0x00,                       // +96: note off 62 (t192)
    0x00, 0xFF, 0x2F, 0x00,                       // fin de pista
  ];
  const header = [
    0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,   // 'MThd' len 6
    0x00, 0x00, 0x00, 0x01, 0x00, 0x60,               // formato 0, 1 pista, división 96
  ];
  const len = track.length;
  const mtrk = [0x4D, 0x54, 0x72, 0x6B, (len >> 24) & 255, (len >> 16) & 255, (len >> 8) & 255, len & 255];
  return new Uint8Array([...header, ...mtrk, ...track]).buffer;
}

describe('parseMidiToMelody', () => {
  it('extrae melodía monofónica normalizada a beats + tempo', () => {
    const { bpm, notes } = parseMidiToMelody(buildMidi());
    expect(bpm).toBe(120);
    expect(notes.length).toBe(2);
    expect(notes[0].midi).toBe(67);          // acorde en t0 → la más aguda
    expect(notes[0].startBeat).toBeCloseTo(0);
    expect(notes[0].dur).toBeCloseTo(1);     // 96 ticks / división 96
    expect(notes[1].midi).toBe(62);
    expect(notes[1].startBeat).toBeCloseTo(1);
    expect(notes[1].dur).toBeCloseTo(1);
  });
  it('lanza con una cabecera que no es MIDI', () => {
    const bad = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
    expect(() => parseMidiToMelody(bad)).toThrow(/no es un archivo MIDI/);
  });
  it('lanza con división SMPTE', () => {
    const smpte = new Uint8Array([
      0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
      0x00, 0x00, 0x00, 0x01, 0xE7, 0x28,   // división con bit alto = SMPTE
    ]).buffer;
    expect(() => parseMidiToMelody(smpte)).toThrow(/SMPTE/);
  });
});
