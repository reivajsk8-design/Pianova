'use strict';
const assert = require('assert');

// ---- Copia EXACTA de las funciones que irán en pianova.html (sin build, no son importables) ----
function durBeatsToSec(durBeats, bpm) { return Math.max(0.02, durBeats * (60 / bpm)); }
function makeTransport(nowFn) {
  let t0 = 0, b0 = 0, _bpm = 120;
  const now = nowFn || (() => 0);
  return {
    anchor(beat, bpm) { t0 = now(); b0 = beat; _bpm = bpm; },
    beatNow() { return b0 + (now() - t0) * (_bpm / 60); },
    timeForBeat(beat) { return t0 + (beat - b0) * (60 / _bpm); },
    setBpm(bpm) { const b = this.beatNow(); t0 = now(); b0 = b; _bpm = bpm; },
    get bpm() { return _bpm; }
  };
}
// ------------------------------------------------------------------------------------------------

// durBeatsToSec
assert.strictEqual(durBeatsToSec(1, 120), 0.5);
assert.strictEqual(durBeatsToSec(2, 60), 2);
assert.ok(durBeatsToSec(0, 120) >= 0.02, 'duración mínima 0.02s');

// transporte con reloj falso
let clock = 10;
const tr = makeTransport(() => clock);
tr.anchor(0, 120);                       // 120 bpm = 2 beats/seg
clock = 10;  assert.strictEqual(tr.beatNow(), 0);
clock = 11;  assert.strictEqual(tr.beatNow(), 2);          // 1 seg = 2 beats
assert.strictEqual(tr.timeForBeat(0), 10);
assert.strictEqual(tr.timeForBeat(2), 11);                 // inverso de beatNow
// timeForBeat es la inversa de beatNow
clock = 13.7; const b = tr.beatNow(); assert.ok(Math.abs(tr.timeForBeat(b) - 13.7) < 1e-9);

// setBpm re-ancla en la posición actual (sin salto)
clock = 12; const beatAntes = tr.beatNow();                // = 4
tr.setBpm(60);                                             // 60 bpm = 1 beat/seg
assert.ok(Math.abs(tr.beatNow() - beatAntes) < 1e-9, 'no salta al cambiar bpm');
clock = 13; assert.ok(Math.abs(tr.beatNow() - (beatAntes + 1)) < 1e-9, 'avanza al nuevo ritmo');

console.log('transport.test.js OK');
