import { describe, it, expect, vi } from 'vitest';
import { makeEffect } from './effect';

// AudioContext mínimo de prueba: nodos con gain.value/connect/disconnect.
function fakeCtx(): AudioContext {
  const mk = () => ({ gain: { value: 1 }, connect() { /* no-op */ }, disconnect() { /* no-op */ } });
  return { createGain: mk } as unknown as AudioContext;
}

describe('makeEffect teardown', () => {
  it('llama a teardown al hacer dispose cuando build devuelve {apply,teardown}', () => {
    const teardown = vi.fn();
    const fx = makeEffect(fakeCtx(), 'test', [], () => ({ apply: () => { /* no-op */ }, teardown }));
    fx.dispose();
    expect(teardown).toHaveBeenCalledTimes(1);
  });
  it('sigue funcionando cuando build devuelve solo la función apply', () => {
    const fx = makeEffect(fakeCtx(), 'test', [], () => () => { /* no-op */ });
    expect(() => fx.dispose()).not.toThrow();
  });
});
