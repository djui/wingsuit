import type { ScoreEntry } from '../core/scores';
import type { GameMode } from '../core/state';
import type { EnvironmentSettings, Precipitation, SkyPreset } from '../world/environment';
import type { Location } from '../world/locations';
import type { TimePreset } from '../world/sky/sun';
import { presetSwatch, SUIT_PRESETS, type SuitChoice } from '../player/textures';

export interface GameSettings {
  mouseSteering: boolean;
  touchControls: boolean;
  audio: boolean;
  googleTiles: boolean;
  googleKey: string;
}

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}

export interface MenuCallbacks {
  onStart: () => void;
  onMode: (mode: GameMode) => void;
  onEnvironment: (settings: EnvironmentSettings) => void;
  onLive: () => void;
  onLocation: (id: string) => void;
  onSuit: (choice: SuitChoice) => void;
  onSuitUpload: (file: File) => void;
  onSettings: (settings: GameSettings) => void;
}

export class Menu {
  private root = el('menu');
  private title = el('menu-title');
  private sub = el('menu-sub');
  private progress = el('menu-progress');
  private button = el<HTMLButtonElement>('menu-start');
  private result = el('menu-result');
  readonly map = el<HTMLCanvasElement>('menu-map');
  private scores = el('menu-scores');
  private locationList = el('menu-locations');
  private modeInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="mode"]'));
  private timeSelect = el<HTMLSelectElement>('env-time');
  private hourInput = el<HTMLInputElement>('env-hour');
  private hourLabel = el('env-hour-label');
  private skySelect = el<HTMLSelectElement>('env-sky');
  private precipSelect = el<HTMLSelectElement>('env-precip');
  private windSpeed = el<HTMLInputElement>('env-wind-speed');
  private windSpeedLabel = el('env-wind-speed-label');
  private windFrom = el<HTMLInputElement>('env-wind-from');
  private windFromLabel = el('env-wind-from-label');
  private liveButton = el<HTMLButtonElement>('env-live');
  private liveStatus = el('env-live-status');
  private suits = el('menu-suits');
  private suitUpload = el<HTMLInputElement>('suit-upload');
  private setMouse = el<HTMLInputElement>('set-mouse');
  private setTouch = el<HTMLInputElement>('set-touch');
  private setAudio = el<HTMLInputElement>('set-audio');
  private setGoogle = el<HTMLInputElement>('set-google');
  private setGoogleKey = el<HTMLInputElement>('set-google-key');
  private googleStatus = el('set-google-status');
  private gamepadStatus = el('set-gamepad');

  constructor(private readonly cb: MenuCallbacks) {
    this.button.addEventListener('click', () => this.cb.onStart());
    for (const input of this.modeInputs) {
      input.addEventListener('change', () => {
        if (input.checked) this.cb.onMode(input.value as GameMode);
      });
    }
    const onEnv = () => {
      this.hourInput.disabled = this.timeSelect.value !== 'custom';
      this.updateLabels();
      this.cb.onEnvironment(this.environment);
    };
    for (const c of [this.timeSelect, this.hourInput, this.skySelect, this.precipSelect, this.windSpeed, this.windFrom]) {
      c.addEventListener('input', onEnv);
    }
    this.liveButton.addEventListener('click', () => this.cb.onLive());
    this.suitUpload.addEventListener('change', () => {
      const f = this.suitUpload.files?.[0];
      if (f) this.cb.onSuitUpload(f);
    });
    for (const c of [this.setMouse, this.setTouch, this.setAudio, this.setGoogle, this.setGoogleKey]) {
      c.addEventListener('change', () => this.cb.onSettings(this.settings));
    }
  }

  get settings(): GameSettings {
    return {
      mouseSteering: this.setMouse.checked,
      touchControls: this.setTouch.checked,
      audio: this.setAudio.checked,
      googleTiles: this.setGoogle.checked,
      googleKey: this.setGoogleKey.value.trim(),
    };
  }

  setSettings(s: GameSettings): void {
    this.setMouse.checked = s.mouseSteering;
    this.setTouch.checked = s.touchControls;
    this.setAudio.checked = s.audio;
    this.setGoogle.checked = s.googleTiles;
    this.setGoogleKey.value = s.googleKey;
  }

  setGoogleStatus(text: string): void {
    this.googleStatus.textContent = text;
  }

  setGamepad(connected: boolean): void {
    this.gamepadStatus.textContent = connected ? 'Gamepad connected: left stick pitch/roll, bumpers yaw, RT dive, A chute, B flare, Y camera, Start restart' : 'No gamepad detected (press a button)';
  }

  setSuits(choice: SuitChoice): void {
    this.suits.innerHTML = '';
    for (const p of SUIT_PRESETS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `suit${choice.presetId === p.id ? ' current' : ''}`;
      b.title = p.name;
      b.appendChild(presetSwatch(p));
      b.addEventListener('click', () => this.cb.onSuit({ ...choice, presetId: p.id }));
      this.suits.appendChild(b);
    }
    if (choice.customImage) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `suit${choice.presetId === 'custom' ? ' current' : ''}`;
      b.title = 'Custom image';
      const img = document.createElement('img');
      img.src = choice.customImage;
      b.appendChild(img);
      b.addEventListener('click', () => this.cb.onSuit({ ...choice, presetId: 'custom' }));
      this.suits.appendChild(b);
    }
  }

  get mode(): GameMode {
    return (this.modeInputs.find((i) => i.checked)?.value as GameMode) ?? 'distance';
  }

  get environment(): EnvironmentSettings {
    return {
      time: this.timeSelect.value as TimePreset,
      hour: Number(this.hourInput.value),
      sky: this.skySelect.value as SkyPreset,
      precip: this.precipSelect.value as Precipitation,
      windSpeed: Number(this.windSpeed.value),
      windFrom: Number(this.windFrom.value),
    };
  }

  setEnvironment(s: EnvironmentSettings): void {
    this.timeSelect.value = s.time;
    this.hourInput.value = String(s.hour);
    this.skySelect.value = s.sky;
    this.precipSelect.value = s.precip;
    this.windSpeed.value = String(s.windSpeed);
    this.windFrom.value = String(s.windFrom);
    this.hourInput.disabled = s.time !== 'custom';
    this.updateLabels();
  }

  setLiveStatus(text: string, busy = false): void {
    this.liveStatus.textContent = text;
    this.liveButton.disabled = busy;
  }

  private updateLabels(): void {
    const h = Number(this.hourInput.value);
    this.hourLabel.textContent = `${Math.floor(h).toString().padStart(2, '0')}:${Math.round((h % 1) * 60)
      .toString()
      .padStart(2, '0')} solar`;
    this.windSpeedLabel.textContent = `${Number(this.windSpeed.value).toFixed(0)} m/s`;
    this.windFromLabel.textContent = `${Number(this.windFrom.value).toFixed(0)}°`;
  }

  setLocations(locations: Location[], currentId: string): void {
    this.locationList.innerHTML = '';
    for (const loc of locations) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `loc ${loc.kind}${loc.id === currentId ? ' current' : ''}`;
      b.innerHTML = `<span class="loc-name">${loc.name}</span><span class="loc-meta">${loc.country} · ${loc.kind}</span>`;
      b.title = loc.blurb;
      b.addEventListener('click', () => this.cb.onLocation(loc.id));
      this.locationList.appendChild(b);
    }
  }

  showLocation(loc: Location): void {
    this.title.textContent = loc.name;
    this.sub.textContent = `${loc.country} · ${loc.blurb}`;
    this.result.textContent = '';
    this.map.classList.add('hidden');
    this.root.classList.remove('hidden');
    document.body.classList.add('menu-open');
  }

  showMap(visible: boolean): void {
    this.map.classList.toggle('hidden', !visible);
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
    document.body.classList.add('menu-open');
    this.root.querySelector('.card')?.scrollTo({ top: 0 });
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
    document.body.classList.remove('menu-open');
    // Otherwise Space/Enter would re-trigger the focused button mid-flight.
    this.button.blur();
  }
}
