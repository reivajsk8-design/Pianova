'use strict';
const assert = require('assert');

// ---- Copia EXACTA de lo que irá en pianova.html ----
function dueLinear(notes, fromBeat, toBeat, startIdx) {
  const entries = []; let i = startIdx;
  while (i < notes.length && notes[i].startBeat <= toBeat) {
    if (notes[i].startBeat > fromBeat) entries.push({ note: notes[i], beat: notes[i].startBeat });
    i++;
  }
  return { entries, nextIdx: i };
}
function dueLoop(notes, fromAbs, toAbs, total) {
  const out = [];
  if (total <= 0 || toAbs <= fromAbs) return out;
  const vFrom = Math.floor(fromAbs / total), vTo = Math.floor(toAbs / total);
  for (let v = vFrom; v <= vTo; v++) {
    for (const n of notes) {
      const abs = v * total + n.startBeat;
      if (abs > fromAbs && abs <= toAbs) out.push({ note: n, beat: abs });
    }
  }
  out.sort((a, b) => a.beat - b.beat);
  return out;
}
// ----------------------------------------------------

// dueLinear
const notes = [{ startBeat: 0 }, { startBeat: 1 }, { startBeat: 2 }, { startBeat: 4 }];
let r = dueLinear(notes, -1, 1.5, 0);
assert.deepStrictEqual(r.entries.map(e => e.beat), [0, 1]);
assert.strictEqual(r.nextIdx, 2);
r = dueLinear(notes, 1.5, 4, r.nextIdx);                 // continúa desde nextIdx
assert.deepStrictEqual(r.entries.map(e => e.beat), [2, 4]);
assert.strictEqual(r.nextIdx, 4);
// borde: estrictamente > from y <= to (no re-dispara el borde inferior)
r = dueLinear(notes, 1, 2, 0);
assert.deepStrictEqual(r.entries.map(e => e.beat), [2]);

// dueLoop (total=4): patrón en 0 y 2, dos vueltas
const ln = [{ startBeat: 0 }, { startBeat: 2 }];
let e = dueLoop(ln, -0.5, 4.5, 4);                        // abs: 0,2,4 (no 4.5+)
assert.deepStrictEqual(e.map(x => x.beat), [0, 2, 4]);
e = dueLoop(ln, 4.5, 8, 4);                               // abs: 6,8
assert.deepStrictEqual(e.map(x => x.beat), [6, 8]);
e = dueLoop(ln, 0, 0, 4);                                 // ventana vacía
assert.deepStrictEqual(e, []);

console.log('duenotes.test.js OK');
