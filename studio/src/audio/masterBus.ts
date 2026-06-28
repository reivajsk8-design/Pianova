// Bus maestro mínimo: masterIn (entrada) -> destino. Aquí se colgarán EQ/efectos/limitador en fases
// siguientes (misma forma que en pianova.html: masterIn / masterDest).
let masterIn: GainNode | null = null;

export function setupMasterBus(actx: AudioContext): void {
  masterIn = actx.createGain();
  masterIn.connect(actx.destination);
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
