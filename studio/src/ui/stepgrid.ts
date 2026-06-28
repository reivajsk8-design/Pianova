// Cuadrícula de pasos de una fila: celdas clicables (on/off) + resalte del paso en curso.
export interface StepGridUI { render(): void; setPlayhead(step: number): void }

export function mountStepGrid(
  root: HTMLElement,
  opts: { total: number; isOn: (i: number) => boolean; onToggle: (i: number) => void }
): StepGridUI {
  let cells: HTMLButtonElement[] = [];
  function render(): void {
    root.innerHTML = '<div class="stepRow"></div>';
    const row = root.querySelector('.stepRow') as HTMLElement;
    cells = [];
    for (let i = 0; i < opts.total; i++) {
      const c = document.createElement('button');
      c.className = 'stepCell' + (i % 4 === 0 ? ' beat' : '') + (opts.isOn(i) ? ' on' : '');
      c.addEventListener('click', () => { opts.onToggle(i); c.classList.toggle('on', opts.isOn(i)); });
      row.appendChild(c); cells.push(c);
    }
  }
  function setPlayhead(step: number): void {
    cells.forEach((c, i) => c.classList.toggle('play', i === step));
  }
  render();
  return { render, setPlayhead };
}
