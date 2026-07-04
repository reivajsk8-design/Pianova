// Almacén de audios importados: id -> {name, buffer, b64}. base64 puro (testeado) + decodificación Web Audio.
import { ensureAudio } from './context';

export const SAMPLE_MAX = 1_500_000;   // bytes; por encima no se persiste (solo sesión)

export function abToB64(buf: ArrayBuffer): string {
  let bin = ''; const bytes = new Uint8Array(buf), chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  return btoa(bin);
}
export function b64ToAb(b64: string): ArrayBuffer {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

interface SampleEntry { name: string; buffer: AudioBuffer | null; b64: string | null; }
const samples: Record<string, SampleEntry> = {};
let _sid = 0;

export async function importSample(name: string, arr: ArrayBuffer): Promise<string> {
  const actx = ensureAudio();
  const buffer = await actx.decodeAudioData(arr.slice(0));
  const id = 'smp-' + (++_sid);
  const b64 = arr.byteLength <= SAMPLE_MAX ? abToB64(arr) : null;
  samples[id] = { name: name.replace(/\.[^.]+$/, ''), buffer, b64 };
  return id;
}

export function getSample(id: string): SampleEntry | undefined { return samples[id]; }

export function serializeSamples(): Record<string, { name: string; b64: string }> {
  const out: Record<string, { name: string; b64: string }> = {};
  for (const id in samples) { const s = samples[id]; if (s.b64) out[id] = { name: s.name, b64: s.b64 }; }
  return out;
}

export function restoreSamples(data: Record<string, { name: string; b64: string }>): void {
  if (!data) return;
  for (const id in data) {
    samples[id] = { name: data[id].name, buffer: null, b64: data[id].b64 };
    const n = parseInt(id.replace('smp-', ''), 10);
    if (Number.isFinite(n) && n > _sid) _sid = n;   // evita colisiones de id nuevos
  }
}

export async function decodePending(): Promise<void> {
  const actx = ensureAudio();
  for (const id in samples) {
    const s = samples[id];
    if (s.b64 && !s.buffer) { try { s.buffer = await actx.decodeAudioData(b64ToAb(s.b64)); } catch { /* audio inválido */ } }
  }
}
