import type { ScoreEntry } from '../core/scores';
import type { GameMode } from '../core/state';
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
  private scores = el('menu-scores');
  private modeInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="mode"]'));

  constructor(
    private readonly onStart: () => void,
    private readonly onMode: (mode: GameMode) => void,
  ) {
    this.button.addEventListener('click', () => this.onStart());
    for (const input of this.modeInputs) {
      input.addEventListener('change', () => {
        if (input.checked) this.onMode(input.value as GameMode);
      });
    }
  }

  get mode(): GameMode {
    return (this.modeInputs.find((i) => i.checked)?.value as GameMode) ?? 'distance';
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

  showResult(text: string, success: boolean): void {
    this.result.textContent = text;
    this.result.classList.toggle('success', success);
    this.result.classList.toggle('fail', !success);
    this.root.classList.remove('hidden');
    this.button.textContent = 'Jump again  (Enter)';
    this.button.disabled = false;
  }

  setScores(entries: ScoreEntry[], highlightRank = 0): void {
    if (entries.length === 0) {
      this.scores.innerHTML = '<p class="muted">No landings yet.</p>';
      return;
    }
    const rows = entries
      .map(
        (e, i) =>
          `<tr class="${i + 1 === highlightRank ? 'new' : ''}"><td>${i + 1}</td><td>${e.score.toLocaleString()}</td><td>${e.detail}</td><td>${e.date}</td></tr>`,
      )
      .join('');
    this.scores.innerHTML = `<table><thead><tr><th>#</th><th>Score</th><th>Run</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  hide(): void {
    this.root.classList.add('hidden');
    // Otherwise Space/Enter would re-trigger the focused button mid-flight.
    this.button.blur();
  }
}
