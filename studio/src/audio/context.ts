import { setupMasterBus } from './masterBus';

let actx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null { return actx; }

// Crea/reanuda el AudioContext (debe llamarse tras un gesto del usuario) y monta el bus la 1ª vez.
export function ensureAudio(): AudioContext {
  if (!actx) {
    actx = new AudioContext();
    setupMasterBus(actx);
  }
  if (actx.state === 'suspended') void actx.resume();
  return actx;
}
