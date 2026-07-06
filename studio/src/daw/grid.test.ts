import { describe, it, expect } from 'vitest';
import { baseFactor, channelStepAt, channelSpan, BASE_SUBDIV } from './grid';

describe('baseFactor', () => {
  it('BASE_SUBDIV / subdiv para 2/4/8', () => {
    expect(BASE_SUBDIV).toBe(8);
    expect(baseFactor(2)).toBe(4);   // 1/8
    expect(baseFactor(4)).toBe(2);   // 1/16
    expect(baseFactor(8)).toBe(1);   // 1/32
  });
  it('subdiv no soportado se trata como 4', () => {
    expect(baseFactor(5)).toBe(2);
    expect(baseFactor(0)).toBe(2);
  });
});

describe('channelStepAt', () => {
  it('subdiv 4 (factor 2): ticks pares mapean a t/2, impares null; envuelve por len', () => {
    expect(channelStepAt(0, 4, 16)).toBe(0);
    expect(channelStepAt(2, 4, 16)).toBe(1);
    expect(channelStepAt(1, 4, 16)).toBe(null);
    expect(channelStepAt(3, 4, 16)).toBe(null);
    expect(channelStepAt(32, 4, 16)).toBe(0);     // 32/2=16, 16%16=0 (envuelve)
  });
  it('subdiv 8 (factor 1): cada tick mapea a t%len', () => {
    expect(channelStepAt(0, 8, 16)).toBe(0);
    expect(channelStepAt(1, 8, 16)).toBe(1);
    expect(channelStepAt(17, 8, 16)).toBe(1);
  });
  it('subdiv 2 (factor 4): solo múltiplos de 4', () => {
    expect(channelStepAt(4, 2, 8)).toBe(1);
    expect(channelStepAt(2, 2, 8)).toBe(null);
  });
});

describe('channelSpan', () => {
  it('len × baseFactor(subdiv)', () => {
    expect(channelSpan(16, 4)).toBe(32);
    expect(channelSpan(16, 8)).toBe(16);
    expect(channelSpan(16, 2)).toBe(64);
  });
});
