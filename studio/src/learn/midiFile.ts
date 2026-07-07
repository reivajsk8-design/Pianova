// studio/src/learn/midiFile.ts
// Parser propio de Standard MIDI File + extracción de la melodía monofónica (portado de pianova.html a TS).
// Sin dependencias ni DOM. `parseMidiToMelody` devuelve la melodía normalizada a beats + el tempo.
import type { LearnNote } from './song';

interface RawEv { tick: number; type: 'on' | 'off'; midi: number; vel?: number }
interface Parsed { division: number; bpm: number; tracks: RawEv[][] }
interface RawNote { midi: number; startTick: number; durTick: number }

function parseMidi(buf: ArrayBuffer): Parsed {
  const dv = new DataView(buf);
  let p = 0;
  const u8 = (): number => dv.getUint8(p++);
  const u16 = (): number => { const v = dv.getUint16(p); p += 2; return v; };
  const u32 = (): number => { const v = dv.getUint32(p); p += 4; return v; };
  const str4 = (): string => { let s = ''; for (let i = 0; i < 4; i++) s += String.fromCharCode(dv.getUint8(p++)); return s; };
  const varlen = (): number => { let v = 0, b: number; do { b = u8(); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };

  if (str4() !== 'MThd') throw new Error('no es un archivo MIDI');
  const headLen = u32();
  u16();                        // formato (no se usa)
  const ntrks = u16();
  const division = u16();
  p = 8 + headLen;
  if (division & 0x8000) throw new Error('división SMPTE no soportada');

  let bpm = 120, tempoSet = false;
  const tracks: RawEv[][] = [];
  for (let t = 0; t < ntrks; t++) {
    if (p + 8 > dv.byteLength) break;
    const id = str4();
    const len = u32();
    const end = Math.min(p + len, dv.byteLength);
    if (id !== 'MTrk') { p = end; continue; }
    let tick = 0, status = 0;
    const ev: RawEv[] = [];
    while (p < end) {
      tick += varlen();
      let st = dv.getUint8(p);
      if (st & 0x80) { p++; if (st < 0xf0) status = st; } else { st = status; }   // running status
      const hi = st & 0xf0;
      if (st === 0xff) {                 // meta
        const type = u8();
        const mlen = varlen();
        if (type === 0x51 && mlen === 3 && !tempoSet) {
          const us = (dv.getUint8(p) << 16) | (dv.getUint8(p + 1) << 8) | dv.getUint8(p + 2);
          if (us > 0) { bpm = 60000000 / us; tempoSet = true; }
        }
        p += mlen;
      } else if (st === 0xf0 || st === 0xf7) {   // sysex
        p += varlen();
      } else if (hi === 0x90) {          // note on (vel 0 = off)
        const midi = u8(), vel = u8();
        ev.push({ tick, type: vel > 0 ? 'on' : 'off', midi, vel });
      } else if (hi === 0x80) {          // note off
        const midi = u8(); u8();
        ev.push({ tick, type: 'off', midi });
      } else if (hi === 0xc0 || hi === 0xd0) { p += 1; }
      else if (hi === 0xa0 || hi === 0xb0 || hi === 0xe0) { p += 2; }
      else break;                        // byte inesperado: cortar pista
    }
    p = end;
    tracks.push(ev);
  }
  return { division: division || 480, bpm, tracks };
}

// Empareja note on/off de una pista → notas con inicio y duración en ticks.
function pairTrack(ev: RawEv[]): RawNote[] {
  const s = ev.slice().sort((a, b) => a.tick - b.tick || (a.type === 'off' ? -1 : 1));
  const open: Record<number, { tick: number }[]> = {};
  const out: RawNote[] = [];
  for (const e of s) {
    if (e.type === 'on') { (open[e.midi] = open[e.midi] || []).push({ tick: e.tick }); }
    else {
      const arr = open[e.midi];
      if (arr && arr.length) { const o = arr.shift() as { tick: number }; out.push({ midi: e.midi, startTick: o.tick, durTick: Math.max(1, e.tick - o.tick) }); }
    }
  }
  return out;
}

// Melodía monofónica: pista con más note-on; en empate de inicio, la nota más aguda; recorta solapes.
function extractMelodyRaw(parsed: Parsed): RawNote[] {
  let best = -1, bestCount = -1;
  for (let i = 0; i < parsed.tracks.length; i++) {
    const c = parsed.tracks[i].reduce((sum, e) => sum + (e.type === 'on' ? 1 : 0), 0);
    if (c > bestCount) { bestCount = c; best = i; }
  }
  if (best < 0 || bestCount === 0) return [];
  const notes = pairTrack(parsed.tracks[best]);
  notes.sort((a, b) => a.startTick - b.startTick || b.midi - a.midi);
  const mono: RawNote[] = [];
  for (const n of notes) {
    const last = mono[mono.length - 1];
    if (last && n.startTick === last.startTick) continue;   // mismo inicio: la más aguda (ya ordenada)
    mono.push(n);
  }
  for (let i = 0; i < mono.length - 1; i++) {                // recortar solapes
    const maxDur = mono[i + 1].startTick - mono[i].startTick;
    if (maxDur > 0 && mono[i].durTick > maxDur) mono[i].durTick = maxDur;
  }
  return mono;
}

// Lee un .mid y devuelve la melodía monofónica normalizada a beats + el tempo (40..240). Lanza si no es válido.
export function parseMidiToMelody(buf: ArrayBuffer): { bpm: number; notes: LearnNote[] } {
  const parsed = parseMidi(buf);
  const mel = extractMelodyRaw(parsed);
  if (!mel.length) throw new Error('no encontré notas');
  const div = parsed.division;
  const offset = Math.min(...mel.map(n => n.startTick));
  const notes: LearnNote[] = mel.map(n => ({
    midi: n.midi,
    startBeat: (n.startTick - offset) / div,
    dur: Math.max(0.1, n.durTick / div),
  })).sort((a, b) => a.startBeat - b.startBeat);
  const bpm = Math.max(40, Math.min(240, Math.round(parsed.bpm || 120)));
  return { bpm, notes };
}
