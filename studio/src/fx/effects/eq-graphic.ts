// studio/src/fx/effects/eq-graphic.ts
// EQ gráfico de 8 bandas con dinámica y modo Estéreo / Mid-Side. En estéreo una sola cadena; en M/S codifica
// Mid=(L+R)/2 y Side=(L−R)/2, ecualiza cada uno con su cadena, y decodifica L=Mid+Side, R=Mid−Side. El editor
// opera sobre el canal activo (Estéreo, o Mid/Lados). Puerta seco/húmedo para el bypass.
import { registerEffect, Effect, EffectState } from '../effect';
import { EqApi, defaultBands, bandsFromParams, bandsToParams, presetNames } from '../eq-core';
import { makeEqChain, EqChain } from '../eq-chain';

let _idc = 0;

function createEqEffect(actx: AudioContext, state?: EffectState): Effect {
  const input = actx.createGain(), output = actx.createGain();
  const wet = actx.createGain(), dry = actx.createGain();
  wet.connect(output); input.connect(dry); dry.connect(output);
  let bypassed = false;
  const setBypass = (on: boolean): void => { bypassed = on; wet.gain.value = on ? 0 : 1; dry.gain.value = on ? 1 : 0; };

  const ms0 = !!(state && state.params['_ms'] === 1);
  const chainA = makeEqChain(actx, state ? bandsFromParams(state.params, 'b') : defaultBands());
  const bandsB0 = state ? bandsFromParams(state.params, 's') : defaultBands();
  let chainB: EqChain | null = null;
  let mode: 'stereo' | 'ms' = 'stereo';
  let active = 0;

  // Matriz M/S (se crea al primer paso a M/S y se reutiliza).
  let splitter: ChannelSplitterNode | null = null, merger: ChannelMergerNode | null = null;
  let gLm!: GainNode, gRm!: GainNode, midBus!: GainNode, gLs!: GainNode, gRs!: GainNode, sideBus!: GainNode, gSideR!: GainNode;
  function buildMatrix(): void {
    splitter = actx.createChannelSplitter(2); merger = actx.createChannelMerger(2);
    gLm = actx.createGain(); gLm.gain.value = 0.5; gRm = actx.createGain(); gRm.gain.value = 0.5; midBus = actx.createGain();
    gLs = actx.createGain(); gLs.gain.value = 0.5; gRs = actx.createGain(); gRs.gain.value = -0.5; sideBus = actx.createGain();
    gSideR = actx.createGain(); gSideR.gain.value = -1;
  }

  function rebuild(): void {
    // Desconecta todo lo reconfigurable (input.disconnect() quita también el seco → se re-conecta).
    try { input.disconnect(); } catch { /* ya */ }
    try { chainA.output.disconnect(); } catch { /* ya */ }
    if (chainB) { try { chainB.output.disconnect(); } catch { /* ya */ } }
    if (splitter) { try { splitter.disconnect(); } catch { /* ya */ } }
    for (const g of [gLm, gRm, midBus, gLs, gRs, sideBus, gSideR]) { if (g) { try { g.disconnect(); } catch { /* ya */ } } }
    if (merger) { try { merger.disconnect(); } catch { /* ya */ } }

    input.connect(dry);   // ruta seca del bypass
    if (mode === 'stereo') {
      input.connect(chainA.input); chainA.output.connect(wet);
    } else {
      if (!splitter) buildMatrix();
      if (!chainB) chainB = makeEqChain(actx, bandsB0);
      input.connect(splitter!);
      splitter!.connect(gLm, 0); splitter!.connect(gRm, 1); gLm.connect(midBus); gRm.connect(midBus); midBus.connect(chainA.input);   // Mid=(L+R)/2
      splitter!.connect(gLs, 0); splitter!.connect(gRs, 1); gLs.connect(sideBus); gRs.connect(sideBus); sideBus.connect(chainB.input); // Side=(L−R)/2
      chainA.output.connect(merger!, 0, 0); chainA.output.connect(merger!, 0, 1);   // Mid → L y R
      chainB.output.connect(merger!, 0, 0);                                          // Side → L (+)
      chainB.output.connect(gSideR); gSideR.connect(merger!, 0, 1);                  // Side → R (−)
      merger!.connect(wet);
    }
  }

  if (ms0) mode = 'ms';
  rebuild();
  setBypass(state ? !!state.bypassed : false);

  const activeChain = (): EqChain => (mode === 'ms' && active === 1 && chainB) ? chainB : chainA;

  const eq: EqApi = {
    getBands: () => activeChain().getBands(),
    setBand: (i, patch) => activeChain().setBand(i, patch),
    setDyn: (i, patch) => activeChain().setDyn(i, patch),
    reset: () => activeChain().reset(),
    applyPreset: (name) => activeChain().applyPreset(name),
    presetNames,
    get analyser() { return activeChain().analyser; },
    magResponse: (freqs) => activeChain().magResponse(freqs),
    mode: () => mode,
    setMode: (m) => { if (m !== mode) { mode = m; if (m === 'stereo') active = 0; rebuild(); } },
    channelLabels: () => mode === 'ms' ? ['Mid', 'Lados'] : ['Estéreo'],
    activeChannel: () => active,
    setActiveChannel: (i) => { active = i; }
  };

  const serializeParams = (): Record<string, number> => ({
    ...bandsToParams(chainA.snapshot(), 'b'),
    ...(chainB ? bandsToParams(chainB.snapshot(), 's') : {}),
    _ms: mode === 'ms' ? 1 : 0
  });

  return {
    id: 'eq-graphic-' + (++_idc), type: 'eq-graphic', input, output,
    setParam: () => { /* el EQ se edita por su editor gráfico */ },
    getParams: () => [],
    getValues: () => serializeParams(),
    isBypassed: () => bypassed,
    bypass: setBypass,
    serialize: () => ({ type: 'eq-graphic', params: serializeParams(), bypassed }),
    dispose: () => {
      chainA.dispose(); if (chainB) chainB.dispose();
      for (const n of [input, output, wet, dry, splitter, merger, gLm, gRm, midBus, gLs, gRs, sideBus, gSideR]) {
        if (n) { try { n.disconnect(); } catch { /* ya */ } }
      }
    },
    eq
  };
}

registerEffect('eq-graphic', { label: 'EQ gráfico', family: 'color', params: [], create: createEqEffect });
