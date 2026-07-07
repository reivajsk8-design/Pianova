// Parseo de mensajes MIDI (puro). status 0x90 vel>0 = note on; 0x80 o 0x90 vel0 = note off; 0xB0 = CC.
// Los CC se detectan ANTES del filtro de canal 10 (los CC son válidos en cualquier canal).
// Ignora el canal 10 (percusión) en notas -> 'other'. Portado de pianova.html.
export interface MidiParsed { type: 'on' | 'off' | 'cc' | 'other'; midi: number; vel: number; channel: number; }

export function parseMidiMessage(data: Uint8Array): MidiParsed {
  const status = data[0] ?? 0;
  const cmd = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  const midi = data[1] ?? 0;
  const raw = data[2] ?? 0;
  const vel = raw / 127;
  if (cmd === 0xb0) return { type: 'cc', midi, vel, channel };   // Control Change (cualquier canal, incl. 10)
  if (channel === 10) return { type: 'other', midi, vel, channel };
  if (cmd === 0x90 && raw > 0) return { type: 'on', midi, vel, channel };
  if (cmd === 0x80 || (cmd === 0x90 && raw === 0)) return { type: 'off', midi, vel: 0, channel };
  return { type: 'other', midi, vel, channel };
}

export interface MidiHandlers {
  onNoteOn(midi: number, vel: number): void;
  onNoteOff(midi: number): void;
  onState(names: string[]): void;
  onControl?(cc: number, value01: number, channel: number, port: string): void;
}

const subs = new Set<MidiHandlers>();
let bound = false;
let lastNames: string[] = [];

function fanOut(p: MidiParsed, port: string): void {
  for (const h of subs) {
    if (p.type === 'on') h.onNoteOn(p.midi, p.vel);
    else if (p.type === 'off') h.onNoteOff(p.midi);
    else if (p.type === 'cc') h.onControl?.(p.midi, p.vel, p.channel, port);
  }
}

// Suscribe un juego de manejadores a TODAS las entradas MIDI. La primera llamada abre Web MIDI; las siguientes
// se suman al reparto. Devuelve una función para darse de baja. (Varias vistas pueden escuchar a la vez.)
export async function connectMidi(h: MidiHandlers): Promise<() => void> {
  subs.add(h);
  const unsub = (): void => { subs.delete(h); };
  if (bound) { h.onState(lastNames); return unsub; }
  const req = (navigator as unknown as { requestMIDIAccess?: (o?: { sysex?: boolean }) => Promise<any> }).requestMIDIAccess;
  if (!req) { h.onState([]); throw new Error('Este navegador no soporta Web MIDI (usa Chrome/Edge y HTTPS).'); }
  const access: any = await req.call(navigator, { sysex: false });
  const bind = (): void => {
    lastNames = [];
    access.inputs.forEach((inp: any) => {
      inp.onmidimessage = (ev: any): void => fanOut(parseMidiMessage(ev.data as Uint8Array), inp.name ?? 'MIDI');
      lastNames.push(inp.name ?? 'MIDI');
    });
    for (const s of subs) s.onState(lastNames);
  };
  access.onstatechange = bind;
  bind();
  bound = true;
  return unsub;
}
