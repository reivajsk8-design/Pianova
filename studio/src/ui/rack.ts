// UI del rack: tarjetas de efecto (bypass/reordenar/quitar + parámetros) y menú "Añadir efecto" por familia.
import { Rack } from '../fx/rack';
import { EFFECTS, Family } from '../fx/effect';

const FAMILY_LABEL: Record<Family, string> = {
  delay: 'Delays', mod: 'Modulación', dyn: 'Dinámica', color: 'Color/EQ', tone: 'Tono', util: 'Utilidad'
};

export function mountRack(root: HTMLElement, rack: Rack, title: string, onChange: () => void): void {
  function render(): void {
    const cards = rack.list().map(e => {
      const def = EFFECTS[e.type];
      const vals = e.getValues();
      const params = e.getParams().map(p => {
        const v = vals[p.name];
        return `<label class="fxParam">${p.label}
          <input type="range" data-id="${e.id}" data-p="${p.name}" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}">
          <span class="fxVal">${v}${p.unit ? ' ' + p.unit : ''}</span></label>`;
      }).join('');
      return `<div class="fxCard">
        <div class="fxHead">
          <b>${def ? def.label : e.type}</b>
          <label class="fxByp"><input type="checkbox" data-byp="${e.id}" ${e.isBypassed() ? 'checked' : ''}> Bypass</label>
          <button data-up="${e.id}" title="Subir">↑</button>
          <button data-down="${e.id}" title="Bajar">↓</button>
          <button data-del="${e.id}" title="Quitar">✕</button>
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

    (root.querySelector('.fxAdd') as HTMLSelectElement).addEventListener('change', ev => {
      const sel = ev.target as HTMLSelectElement; const type = sel.value; sel.value = '';
      if (type) { rack.add(type); onChange(); render(); }
    });
    root.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(inp => {
      inp.addEventListener('input', () => {
        const e = rack.list().find(x => x.id === inp.dataset.id); if (!e) return;
        const val = +inp.value; e.setParam(inp.dataset.p!, val);
        const p = e.getParams().find(pp => pp.name === inp.dataset.p);
        const span = inp.parentElement!.querySelector('.fxVal');
        if (span) span.textContent = val + (p?.unit ? ' ' + p.unit : '');
        onChange();
      });
    });
    root.querySelectorAll<HTMLInputElement>('input[data-byp]').forEach(cb => {
      cb.addEventListener('change', () => { rack.bypass(cb.dataset.byp!, cb.checked); onChange(); });
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
