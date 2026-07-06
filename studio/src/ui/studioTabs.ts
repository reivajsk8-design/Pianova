// studio/src/ui/studioTabs.ts
// Pestañas del rediseño: PADS / SAMPLES / MIXER.
export type StudioTab = 'pads' | 'samples' | 'mixer';

export function studioTabsHTML(active: StudioTab): string {
  const tab = (id: StudioTab, label: string, key: number) =>
    `<button class="pvTab${active === id ? ' on' : ''}" data-tab="${id}" title="Atajo: tecla ${key}">${label}</button>`;
  return `<div class="pvTabs">${tab('pads', 'PADS', 1)}${tab('samples', 'SAMPLES', 2)}${tab('mixer', 'MIXER', 3)}</div>`;
}
