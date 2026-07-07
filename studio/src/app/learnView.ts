// studio/src/app/learnView.ts
// Vista Aprender (F4a): notas que caen (Synthesia) + teclado, modos Practicar (espera a que toques) y Escuchar.
import { mountKeyboard } from '../ui/keyboard';
import { connectMidi } from '../midi/input';
import { ensureAudio, getAudioContext } from '../audio/context';
import { masterDest } from '../audio/masterBus';
import { noteOn, noteOff, allNotesOff, setPreset, setSynthOut, triggerPreset } from '../audio/synth';
import { noteName } from '../daw/scales';
import { SONGS, songRange, type LearnSong } from '../learn/song';
import { makePractice, targetNote, judge, type PracticeState } from '../learn/practice';
import { keyLayout, keyGeomFor, type KeyGeom } from '../learn/geometry';

const LOOKAHEAD = 4;   // beats visibles por encima de la línea de impacto

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function mountLearnView(root: HTMLElement): void {
  let song: LearnSong = SONGS[0];
  let mode: 'practice' | 'listen' = 'practice';
  let running = false;
  let songBeat = 0;
  let prevBeat = -1;              // último beat procesado en Escuchar (para no saltarse la nota del beat 0)
  const lightTimers: number[] = [];   // timeouts de apagar el resaltado de tecla en Escuchar
  let practice: PracticeState = makePractice(song.notes);
  let lastTs = 0;
  let layout: KeyGeom[] = [];
  let range = songRange(song);
  let midiReady = false;

  root.innerHTML = `
    <div class="lnWrap">
      <div class="lnBar">
        <label class="fld">Modo <select id="lnMode"><option value="practice">Practicar</option><option value="listen">Escuchar</option></select></label>
        <label class="fld">Canción <select id="lnSong">${SONGS.map((s, i) => `<option value="${i}">${s.name}</option>`).join('')}</select></label>
        <button id="lnStart">▶ Empezar</button>
        <button id="lnReset">↻ Reiniciar</button>
        <span class="lnConn" id="lnConn">MIDI: —</span>
      </div>
      <div class="lnStage">
        <canvas id="lnLane" class="lnLane"></canvas>
        <div id="lnKb" class="lnKb"></div>
      </div>
    </div>`;

  const canvas = root.querySelector('#lnLane') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const kbHost = root.querySelector('#lnKb') as HTMLElement;
  const connEl = root.querySelector('#lnConn') as HTMLElement;

  let kbCleanup: (() => void) | null = null;
  function buildKeyboard(): void {
    kbCleanup?.();
    kbCleanup = mountKeyboard(kbHost, {
      lowMidi: range.low, highMidi: range.high, baseMidi: range.low,
      onNoteOn: (m, v) => { if (root.hidden) return; handlePlay(m, v); },
      onNoteOff: (m) => handleRelease(m),
    });
  }
  function litKey(m: number, on: boolean): void {
    (kbHost.querySelector(`[data-midi="${m}"]`) as HTMLElement | null)?.classList.toggle('on', on);
  }
  function targetKey(m: number | undefined): void {
    kbHost.querySelectorAll('.kb-key.target').forEach(el => el.classList.remove('target'));
    if (m != null) (kbHost.querySelector(`[data-midi="${m}"]`) as HTMLElement | null)?.classList.add('target');
  }

  function handlePlay(m: number, v: number): void {
    noteOn(m, v); litKey(m, true);
    if (mode === 'practice' && running) {
      const r = judge(practice, m);
      if (r.advanced) { targetKey(targetNote(practice)?.midi); if (r.done) running = false; }
    }
  }
  function handleRelease(m: number): void { noteOff(m); litKey(m, false); }

  function resize(): void {
    const w = kbHost.clientWidth || canvas.clientWidth || 720;
    canvas.width = w;
    canvas.height = canvas.clientHeight || 240;
    layout = keyLayout(range.low, range.high, w);
  }

  function draw(): void {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, W, H);
    const impactY = H - 3;
    const pxPerBeat = H / LOOKAHEAD;
    ctx.strokeStyle = '#2dff6a'; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(0, impactY); ctx.lineTo(W, impactY); ctx.stroke();
    ctx.globalAlpha = 1;
    const tgt = mode === 'practice' ? targetNote(practice) : undefined;
    for (const n of song.notes) {
      const g = keyGeomFor(layout, n.midi); if (!g) continue;
      const bottom = impactY - (n.startBeat - songBeat) * pxPerBeat;
      const h = Math.max(8, n.dur * pxPerBeat);
      const top = bottom - h;
      if (bottom < 0 || top > H) continue;
      const isTarget = tgt === n;
      ctx.fillStyle = isTarget ? '#2dff6a' : (g.black ? '#3a6ea5' : '#4f86c6');
      roundRect(ctx, g.x + 1, top, Math.max(2, g.w - 2), h, 4); ctx.fill();
      ctx.fillStyle = isTarget ? '#04120a' : '#e7ecff';
      ctx.font = '11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(noteName(n.midi).replace(/-?\d+$/, ''), g.x + g.w / 2, bottom - 5);
    }
  }

  function frame(ts: number): void {
    if (root.hidden) { lastTs = 0; requestAnimationFrame(frame); return; }
    const dt = lastTs ? (ts - lastTs) / 1000 : 0; lastTs = ts;
    if (running) {
      const bps = song.bpm / 60;
      if (mode === 'practice') {
        const t = targetNote(practice);
        if (!t) running = false;
        else if (songBeat < t.startBeat) {
          songBeat = Math.min(t.startBeat, songBeat + dt * bps);
          if (songBeat >= t.startBeat) targetKey(t.midi);
        }
      } else {
        const prev = prevBeat;
        songBeat += dt * bps;
        prevBeat = songBeat;
        const actx = getAudioContext();
        for (const n of song.notes) {
          if (n.startBeat > prev && n.startBeat <= songBeat) {
            triggerPreset('piano', n.midi, 0.85, actx ? actx.currentTime : 0, n.dur / bps, masterDest());
            litKey(n.midi, true);
            lightTimers.push(window.setTimeout(() => litKey(n.midi, false), (n.dur / bps) * 1000));
          }
        }
        const end = song.notes.reduce((mx, n) => Math.max(mx, n.startBeat + n.dur), 0);
        if (songBeat > end + 0.5) running = false;
      }
    }
    draw();
    requestAnimationFrame(frame);
  }

  function reset(): void {
    while (lightTimers.length) clearTimeout(lightTimers.pop());
    allNotesOff();
    kbHost.querySelectorAll('.kb-key.on').forEach(el => el.classList.remove('on'));
    songBeat = 0; prevBeat = -1; practice = makePractice(song.notes); running = false;
    targetKey(undefined); draw();
  }
  function start(): void {
    ensureAudio(); setPreset('piano'); setSynthOut(masterDest());
    if (!midiReady) {
      midiReady = true;
      connectMidi({
        onNoteOn: (m, v) => { if (root.hidden) return; handlePlay(m, v); },
        onNoteOff: (m) => handleRelease(m),
        onState: (names) => { connEl.textContent = 'MIDI: ' + (names.length ? names.join(', ') : '—'); },
      }).catch(() => { connEl.textContent = 'MIDI: no disponible'; });
    }
    reset(); running = true; lastTs = 0;
    if (mode === 'practice') targetKey(targetNote(practice)?.midi);
  }

  (root.querySelector('#lnMode') as HTMLSelectElement).addEventListener('change', e => {
    mode = (e.target as HTMLSelectElement).value === 'listen' ? 'listen' : 'practice'; reset();
  });
  (root.querySelector('#lnSong') as HTMLSelectElement).addEventListener('change', e => {
    song = SONGS[+(e.target as HTMLSelectElement).value] ?? SONGS[0];
    range = songRange(song); buildKeyboard(); resize(); reset();
  });
  (root.querySelector('#lnStart') as HTMLButtonElement).addEventListener('click', start);
  (root.querySelector('#lnReset') as HTMLButtonElement).addEventListener('click', reset);
  window.addEventListener('resize', () => { resize(); draw(); });

  buildKeyboard(); resize(); draw();
  requestAnimationFrame(frame);
}
