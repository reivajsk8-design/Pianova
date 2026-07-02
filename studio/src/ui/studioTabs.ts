// studio/src/ui/studioTabs.ts
// Pestañas del rediseño: PADS / SAMPLES / MIXER.
export type StudioTab = 'pads' | 'samples' | 'mixer';

export function studioTabsHTML(active: StudioTab): string {
  const tab = (id: StudioTab, label: string) =>
    `<button class="pvTab${active === id ? ' on' : ''}" data-tab="${id}">${label}</button>`;
  return `<div class="pvTabs">${tab('pads', 'PADS')}${tab('samples', 'SAMPLES')}${tab('mixer', 'MIXER')}</div>`;
}
