// Bus maestro: masterIn -> limitador -> makeup/pre -> soft-clipper (tanh) -> final -> destino.
// Portado de pianova.html (misma pared anti-clipping con potencia). Aquí se colgarán EQ/efectos luego.
let masterIn: GainNode | null = null;

const SOFTCLIP_DRIVE = 2.5;
const MASTER_MAKEUP = 2.5;

// Curva tanh(drive·x) sobre [-1,1]: satura suave y la salida nunca pasa de ~tanh(drive) (<1).
export function makeSoftClipCurve(n: number, drive: number): Float32Array {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(drive * x); }
  return c;
}

export function setupMasterBus(actx: AudioContext): void {
  masterIn = actx.createGain();
  const limiter = actx.createDynamicsCompressor();
  limiter.threshold.value = -6; limiter.knee.value = 0; limiter.ratio.value = 20;
  limiter.attack.value = 0.003; limiter.release.value = 0.25;
  const clipPre = actx.createGain();
  clipPre.gain.value = MASTER_MAKEUP / SOFTCLIP_DRIVE;   // makeup + drive antes del shaper
  const clip = actx.createWaveShaper();
  clip.curve = makeSoftClipCurve(2048, SOFTCLIP_DRIVE) as Float32Array<ArrayBuffer>;
  clip.oversample = '4x';
  const final = actx.createGain();
  masterIn.connect(limiter);
  limiter.connect(clipPre);
  clipPre.connect(clip);
  clip.connect(final);
  final.connect(actx.destination);
}

export function masterDest(): AudioNode {
  if (!masterIn) throw new Error('Bus maestro no inicializado (llama a ensureAudio primero).');
  return masterIn;
}

// Tono de prueba (440 Hz, 0.4 s) para verificar que el audio suena por el bus.
export function testTone(): void {
  const dest = masterDest();
  const actx = dest.context as AudioContext;
  const osc = actx.createOscillator();
  const g = actx.createGain();
  osc.type = 'sine'; osc.frequency.value = 440; g.gain.value = 0.2;
  osc.connect(g); g.connect(dest);
  const t = actx.currentTime;
  osc.start(t); osc.stop(t + 0.4);
}
