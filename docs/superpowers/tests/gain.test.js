'use strict';
const assert = require('assert');

// ---- Copia EXACTA de lo que irá en pianova.html ----
const GAIN_MAX = 3;
function clampGain(v) { return Math.max(0, Math.min(GAIN_MAX, v)); }
function ccToGain(ccVal) { return clampGain((ccVal / 127) * GAIN_MAX); }   // 0..127 -> 0..3
// ----------------------------------------------------

assert.strictEqual(clampGain(-1), 0);
assert.strictEqual(clampGain(0), 0);
assert.strictEqual(clampGain(1), 1);
assert.strictEqual(clampGain(2.5), 2.5);
assert.strictEqual(clampGain(5), 3);            // se acota al máximo
assert.strictEqual(ccToGain(0), 0);
assert.strictEqual(ccToGain(127), 3);           // tope del knob = 300%
assert.ok(Math.abs(ccToGain(64) - 1.512) < 0.01);   // ~mitad

console.log('gain.test.js OK');
