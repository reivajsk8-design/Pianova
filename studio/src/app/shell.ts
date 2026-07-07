import { ensureAudio } from '../audio/context';
import { testTone } from '../audio/masterBus';
import { mountStudioView } from './studioView';
import { mountLearnView } from './learnView';

// Monta la barra superior (Estudio / Aprender) + arranque de audio. Vistas vacías por ahora.
export function mountShell(root: HTMLElement): void {
  root.innerHTML = `
    <header class="topbar">
      <div class="brand">Estudio <span>· Pianova pro</span></div>
      <nav class="tabs">
        <button class="tab on" data-view="studio">Estudio</button>
        <button class="tab" data-view="learn">Aprender</button>
      </nav>
      <div class="grow"></div>
      <button id="btnAudio">Iniciar audio</button>
      <button id="btnTone">Probar sonido</button>
    </header>
    <main>
      <section id="viewStudio" class="view">DAW / groovebox — próximamente.</section>
      <section id="viewLearn" class="view" hidden></section>
    </main>`;
  const studio = root.querySelector('#viewStudio') as HTMLElement;
  const learn = root.querySelector('#viewLearn') as HTMLElement;
  mountStudioView(studio);
  mountLearnView(learn);
  root.querySelectorAll<HTMLButtonElement>('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b === btn));
      const v = btn.dataset.view;
      studio.hidden = v !== 'studio';
      learn.hidden = v !== 'learn';
    });
  });
  (root.querySelector('#btnAudio') as HTMLButtonElement).addEventListener('click', () => { ensureAudio(); });
  (root.querySelector('#btnTone') as HTMLButtonElement).addEventListener('click', () => { ensureAudio(); testTone(); });
}
