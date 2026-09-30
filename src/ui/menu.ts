import type { Location } from '../world/locations';

function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e;
}

export class Menu {
  private root = el('menu');
  private title = el('menu-title');
  private sub = el('menu-sub');
  private progress = el('menu-progress');
  private button = el('menu-start') as HTMLButtonElement;
  private result = el('menu-result');

  constructor(private readonly onStart: () => void) {
    this.button.addEventListener('click', () => this.onStart());
  }

  showLocation(loc: Location): void {
    this.title.textContent = loc.name;
    this.sub.textContent = `${loc.country} · exit ${loc.exit.lat.toFixed(4)}, ${loc.exit.lon.toFixed(4)}`;
    this.result.textContent = '';
    this.root.classList.remove('hidden');
  }

  setLoading(text: string, ready: boolean): void {
    this.progress.textContent = text;
    this.button.disabled = !ready;
    this.button.textContent = ready ? 'Jump  (Enter)' : 'Loading…';
  }

  showResult(text: string): void {
    this.result.textContent = text;
    this.root.classList.remove('hidden');
    this.button.textContent = 'Jump again  (Enter)';
    this.button.disabled = false;
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
