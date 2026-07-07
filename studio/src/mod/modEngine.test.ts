import { describe, it, expect, beforeEach } from 'vitest';
import { modEngine, defaultModState, defaultLfos, sanitizeModState, LFO_COUNT } from './modEngine';

beforeEach(() => { modEngine.setState(defaultModState()); });

describe('estado por defecto y saneo', () => {
  it('defaultLfos: N apagados, seno, sincro 1/4', () => {
    const l = defaultLfos();
    expect(l.length).toBe(LFO_COUNT);
    expect(l[0]).toEqual({ on: false, wave: 'sine', mode: 'sync', rateKey: '1/4', hz: 1 });
  });
  it('sanitizeModState acota índice, profundidad y enums', () => {
    const s = sanitizeModState({
      lfos: [{ on: true, wave: 'zzz', mode: 'x', rateKey: 5, hz: -2 }],
      assign: { a: { lfo: 99, depth: 5 }, b: { lfo: 1, depth: 0.3 } }
    });
    expect(s.lfos[0].wave).toBe('sine');
    expect(s.lfos[0].mode).toBe('sync');
    expect(s.lfos[0].hz).toBe(1);
    expect(s.assign.a).toBeUndefined();          // lfo 99 fuera de rango → descartado
    expect(s.assign.b).toEqual({ lfo: 1, depth: 0.3 });
  });
});

describe('asignación y tick', () => {
  it('tick aplica base + profundidad·rango·onda; restaura al apagar', () => {
    let applied = -1;
    modEngine.register('t', { min: 0, max: 1, getBase: () => 0.5, applyAudio: v => { applied = v; } });
    modEngine.setLfo(0, { on: true, wave: 'square', mode: 'free', hz: 1 });
    modEngine.assign('t', 0, 0.5);
    modEngine.setBpm(120);
    modEngine.tick(0.25);                          // square en fase 0.25 = +1
    expect(applied).toBeCloseTo(1);                // 0.5 + 0.5*1*1
    expect(modEngine.isActive()).toBe(true);
    modEngine.setLfo(0, { on: false });
    modEngine.tick(0.5);                            // dejó de estar activo → restaura base
    expect(applied).toBeCloseTo(0.5);
    expect(modEngine.isActive()).toBe(false);
  });
  it('unassign quita la modulación', () => {
    modEngine.register('t', { min: 0, max: 1, getBase: () => 0.2, applyAudio: () => {} });
    modEngine.setLfo(0, { on: true });
    modEngine.assign('t', 0, 0.5);
    expect(modEngine.getAssign('t')).toEqual({ lfo: 0, depth: 0.5 });
    modEngine.unassign('t');
    expect(modEngine.getAssign('t')).toBeUndefined();
    expect(modEngine.isActive()).toBe(false);
  });
  it('isActive es falso sin destino registrado aunque haya asignación', () => {
    modEngine.setLfo(0, { on: true });
    modEngine.assign('fantasma', 0, 0.5);
    expect(modEngine.isActive()).toBe(false);
  });
  it('getState/setState ida y vuelta', () => {
    modEngine.setLfo(2, { on: true, wave: 'tri', mode: 'free', hz: 3 });
    modEngine.assign('x', 2, 0.7);
    const s = modEngine.getState();
    modEngine.setState(defaultModState());
    expect(modEngine.getLfos()[2].on).toBe(false);
    modEngine.setState(s);
    expect(modEngine.getLfos()[2]).toEqual({ on: true, wave: 'tri', mode: 'free', rateKey: '1/4', hz: 3 });
    expect(modEngine.getAssign('x')).toEqual({ lfo: 2, depth: 0.7 });
  });
});
