'use strict';
const assert = require('assert');

// ---- Copia EXACTA de lo que irá en pianova.html ----
function parseApoEq(text) {
  const out = { preamp: 0, bands: [] };
  const num = s => parseFloat(String(s).replace(',', '.'));
  const TYPE = { PK: 'peaking', LS: 'lowshelf', HS: 'highshelf' };
  String(text).split(/\r?\n/).forEach(line => {
    const pre = line.match(/^\s*Preamp:\s*(-?[\d.,]+)\s*dB/i);
    if (pre) { out.preamp = num(pre[1]); return; }
    const f = line.match(/^\s*Filter\s+\d+:\s*ON\s+(PK|LS|HS)\s+Fc\s+([\d.,]+)\s*Hz\s+Gain\s+(-?[\d.,]+)\s*dB\s+Q\s+([\d.,]+)/i);
    if (f) out.bands.push({ type: TYPE[f[1].toUpperCase()], freq: num(f[2]), gain: num(f[3]), q: num(f[4]) });
  });
  return out;
}
// ----------------------------------------------------

const sample = [
  'Preamp: -1,3 dB',
  'Filter 1: ON PK Fc 300 Hz Gain -5,8 dB Q 0,6',
  'Filter 2: OFF PK Fc 600 Hz Gain -1,2 dB Q 1,4',   // OFF -> se ignora
  '',                                                  // línea vacía
  'Filter 3: ON LS Fc 105 Hz Gain 3,0 dB Q 0,7',
  'Filter 7: ON HS Fc 9000 Hz Gain -4,0 dB Q 0,7'
].join('\n');

const r = parseApoEq(sample);
assert.strictEqual(r.preamp, -1.3, 'preamp con coma');
assert.strictEqual(r.bands.length, 3, 'ignora OFF y vacías');
assert.deepStrictEqual(r.bands[0], { type: 'peaking', freq: 300, gain: -5.8, q: 0.6 });
assert.deepStrictEqual(r.bands[1], { type: 'lowshelf', freq: 105, gain: 3.0, q: 0.7 });
assert.deepStrictEqual(r.bands[2], { type: 'highshelf', freq: 9000, gain: -4.0, q: 0.7 });
// texto vacío / basura -> spec neutro
assert.deepStrictEqual(parseApoEq(''), { preamp: 0, bands: [] });
assert.deepStrictEqual(parseApoEq('hola\nmundo'), { preamp: 0, bands: [] });

console.log('eq.test.js OK');
