'use strict';
const assert = require('assert');

// ---- Copia EXACTA de lo que irá en pianova.html ----
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function clampHz(v) { return Math.max(20, Math.min(20000, v)); }
function clampQ(v) { return Math.max(0.3, Math.min(20, v)); }
function clampTime(v) { return Math.max(0, Math.min(3, v)); }
function synthDefault() { return { sine: 0.6, square: 0.0, saw: 0.4, attack: 0.01, decay: 0.3,
  sustain: 0.0, release: 0.2, filterType: 'lowpass', cutoff: 6000, resonance: 1 }; }
// ----------------------------------------------------

assert.strictEqual(clamp01(-1), 0); assert.strictEqual(clamp01(2), 1); assert.strictEqual(clamp01(0.5), 0.5);
assert.strictEqual(clampHz(0), 20); assert.strictEqual(clampHz(99999), 20000); assert.strictEqual(clampHz(440), 440);
assert.strictEqual(clampQ(0), 0.3); assert.strictEqual(clampQ(50), 20); assert.strictEqual(clampQ(2), 2);
assert.strictEqual(clampTime(-1), 0); assert.strictEqual(clampTime(9), 3); assert.strictEqual(clampTime(0.5), 0.5);
const d = synthDefault();
assert.deepStrictEqual(Object.keys(d).sort(), ['attack','cutoff','decay','filterType','resonance','release','saw','sine','square','sustain'].sort());
assert.ok(d.sine >= 0 && d.sine <= 1 && d.saw >= 0 && d.saw <= 1);
assert.strictEqual(d.filterType, 'lowpass');
assert.ok(clampHz(d.cutoff) === d.cutoff && clampQ(d.resonance) === d.resonance);

console.log('synth.test.js OK');
