// UI del rack: tarjetas de efecto (bypass/reordenar/quitar + parámetros como knobs) y menú "Añadir efecto".
import { Rack } from '../fx/rack';
import { EFFECTS, Family } from '../fx/effect';
import { mountKnob } from './knob';

const FAMILY_LABEL: Record<Family, string> = {
  delay: 'Delays', mod: 'Modulación', dyn: 'Dinámica', color: 'Color/EQ', tone: 'Tono', util: 'Utilidad'
};

// Formatea el valor de un parámetro según su paso (decimales) + unidad.
function fmtVal(v: number, unit: string | undefined, step: number): string {
  const dec = step < 0.1 ? 2 : (step < 1 ? 1 : 0);
  return v.toFixed(dec) + (unit ? ' ' + unit : '');
}

export function mountRack(root: HTMLElement, rack: Rack, title: string, onChange: () => void): void {
  function render(): void {
    const cards = rack.list().map(e => {
      const def = EFFECTS[e.type];
      const vals = e.getValues();
      const params = e.getParams().map(p =>
        `<div class="fxKnob">
          <div class="knob" data-id="${e.id}" data-p="${p.name}" title="${p.label}"></div>
          <span class="fxKnobLab">${p.label}</span>
          <span class="fxKnobVal">${fmtVal(vals[p.name], p.unit, p.step)}</span>
        </div>`).join('');
      return `<div class="fxCard${e.isBypassed() ? ' byp' : ''}">
        <div class="fxHead">
          <b>${def ? def.label : e.type}</b>
          <span class="grow"></span>
          <label class="fxByp"><input type="checkbox" data-byp="${e.id}" ${e.isBypassed() ? 'checked' : ''}> Bypass</label>
          <button class="chBtn" data-up="${e.id}" title="Mover a la izquierda">◀</button>
          <button class="chBtn" data-down="${e.id}" title="Mover a la derecha">▶</button>
          <button class="chBtn" data-del="${e.id}" title="Quitar">✕</button>
        </div>
        <div class="fxParams">${params}</div>
      </div>`;
    }).join('');

    const groups: Partial<Record<Family, string[]>> = {};
    for (const [type, def] of Object.entries(EFFECTS)) {
      (groups[def.family] ??= []).push(`<option value="${type}">${def.label}</option>`);
    }
    const optgroups = (Object.keys(groups) as Family[])
      .map(f => `<optgroup label="${FAMILY_LABEL[f]}">${groups[f]!.join('')}</optgroup>`).join('');

    root.innerHTML = `<div class="rack">
      <div class="rackHead"><b>${title}</b>
        <select class="fxAdd"><option value="">➕ Añadir efecto…</option>${optgroups}</select>
      </div>
      <div class="rackList">${cards || '<p class="muted">Sin efectos.</p>'}</div>
    </div>`;

    // knobs de parámetros
    root.querySelectorAll<HTMLElement>('.fxKnob .knob').forEach(el => {
      const id = el.dataset.id!, pname = el.dataset.p!;
      const e = rack.list().find(x => x.id === id); if (!e) return;
      const p = e.getParams().find(pp => pp.name === pname); if (!p) return;
      const valSpan = el.parentElement!.querySelector('.fxKnobVal') as HTMLElement;
      mountKnob(el, { min: p.min, max: p.max, value: e.getValues()[p.name], default: p.default, size: 32,
        onChange: (v) => {
          const q = Math.round(v / p.step) * p.step;
          e.setParam(p.name, q);
          valSpan.textContent = fmtVal(q, p.unit, p.step);
          onChange();
        } });
    });

    (root.querySelector('.fxAdd') as HTMLSelectElement).addEventListener('change', ev => {
      const sel = ev.target as HTMLSelectElement; const type = sel.value; sel.value = '';
      if (type) { rack.add(type); onChange(); render(); }
    });
    root.querySelectorAll<HTMLInputElement>('input[data-byp]').forEach(cb => {
      cb.addEventListener('change', () => { rack.bypass(cb.dataset.byp!, cb.checked); onChange(); render(); });
    });
    root.querySelectorAll<HTMLButtonElement>('button[data-up]').forEach(b =>
      b.addEventListener('click', () => { rack.move(b.dataset.up!, -1); onChange(); render(); }));
    root.querySelectorAll<HTMLButtonElement>('button[data-down]').forEach(b =>
      b.addEventListener('click', () => { rack.move(b.dataset.down!, 1); onChange(); render(); }));
    root.querySelectorAll<HTMLButtonElement>('button[data-del]').forEach(b =>
      b.addEventListener('click', () => { rack.remove(b.dataset.del!); onChange(); render(); }));
  }

  rack.onChange(render);
  render();
}
