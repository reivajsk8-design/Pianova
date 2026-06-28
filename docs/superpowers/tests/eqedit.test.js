'use strict';
const assert = require('assert');

// ---- Copia EXACTA de lo que irá en pianova.html ----
const EQ_FMIN = 20, EQ_FMAX = 20000, EQ_GAIN_RANGE = 15;
function freqToX(f, w) { return Math.log(f / EQ_FMIN) / Math.log(EQ_FMAX / EQ_FMIN) * w; }
function xToFreq(x, w) { return EQ_FMIN * Math.pow(EQ_FMAX / EQ_FMIN, x / w); }
function gainToY(g, h) { return h / 2 * (1 - g / EQ_GAIN_RANGE); }
function yToGain(y, h) { return EQ_GAIN_RANGE * (1 - 2 * y / h); }
function manualToBands(slots) {
  return slots.map(s => s.on ? { type: s.type, freq: s.freq, gain: s.gain, q: s.q }
                             : { type: 'peaking', freq: s.freq, gain: 0, q: 1 });
}
// ----------------------------------------------------

const W = 800, H = 400;
// extremos del eje X
assert.ok(Math.abs(freqToX(EQ_FMIN, W) - 0) < 1e-9);
assert.ok(Math.abs(freqToX(EQ_FMAX, W) - W) < 1e-9);
// inversa freq<->X
[50, 440, 1000, 5000].forEach(f => assert.ok(Math.abs(xToFreq(freqToX(f, W), W) - f) < 1e-6, 'inv freq ' + f));
// ganancia: 0 dB en el centro, +15 arriba (y=0), -15 abajo (y=H)
assert.ok(Math.abs(gainToY(0, H) - H / 2) < 1e-9);
assert.ok(Math.abs(gainToY(EQ_GAIN_RANGE, H) - 0) < 1e-9);
assert.ok(Math.abs(gainToY(-EQ_GAIN_RANGE, H) - H) < 1e-9);
[-12, -3, 0, 6, 12].forEach(g => assert.ok(Math.abs(yToGain(gainToY(g, H), H) - g) < 1e-9, 'inv gain ' + g));
// manualToBands: activa = sus valores; apagada = peaking gain 0 (transparente)
const slots = [{ on: true, type: 'lowshelf', freq: 120, gain: 4, q: 0.7 },
               { on: false, type: 'highpass', freq: 60, gain: 0, q: 0.7 }];
assert.deepStrictEqual(manualToBands(slots)[0], { type: 'lowshelf', freq: 120, gain: 4, q: 0.7 });
assert.deepStrictEqual(manualToBands(slots)[1], { type: 'peaking', freq: 60, gain: 0, q: 1 });

console.log('eqedit.test.js OK');
