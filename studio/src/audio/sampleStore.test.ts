import { describe, it, expect } from 'vitest';
import { abToB64, b64ToAb } from './sampleStore';

describe('sampleStore base64', () => {
  it('round-trip ArrayBuffer <-> base64 sin pérdida', () => {
    const src = new Uint8Array([0, 1, 2, 250, 255, 128, 64, 7]);
    const b64 = abToB64(src.buffer);
    const back = new Uint8Array(b64ToAb(b64));
    expect(Array.from(back)).toEqual(Array.from(src));
  });
  it('cadena base64 es ASCII', () => {
    const b64 = abToB64(new Uint8Array([200, 201, 202]).buffer);
    expect(/^[A-Za-z0-9+/=]+$/.test(b64)).toBe(true);
  });
});
