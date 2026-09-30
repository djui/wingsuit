import type { TimePreset } from './sky/sun';

export type SkyPreset = 'clear' | 'partly' | 'overcast';
export type Precipitation = 'none' | 'rain' | 'snow';

/** What the player chooses in the menu (persisted). */
export interface EnvironmentSettings {
  time: TimePreset;
  /** Local solar hour for the custom preset. */
  hour: number;
  sky: SkyPreset;
  precip: Precipitation;
  /** m/s at 10 m. */
  windSpeed: number;
  /** Compass degrees the wind blows from. */
  windFrom: number;
}

/** Resolved physical state the renderer and simulation consume. */
export interface EnvironmentState {
  date: Date;
  sunElevation: number;
  sunAzimuth: number;
  moonElevation: number;
  moonAzimuth: number;
  moonFraction: number;
  /** 0..1 */
  cloudCover: number;
  precip: Precipitation;
  /** 0..1 */
  precipIntensity: number;
  /** Metres. */
  visibility: number;
  windSpeed: number;
  windFrom: number;
  /** Extra turbulence factor 0..1 from wind and weather. */
  gustiness: number;
}

export const DEFAULT_ENVIRONMENT: EnvironmentSettings = {
  time: 'afternoon',
  hour: 15,
  sky: 'clear',
  precip: 'none',
  windSpeed: 3,
  windFrom: 270,
};

const STORAGE_KEY = 'wingsuit.environment';

export function loadEnvironmentSettings(): EnvironmentSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_ENVIRONMENT, ...(JSON.parse(raw) as Partial<EnvironmentSettings>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_ENVIRONMENT };
}

export function saveEnvironmentSettings(s: EnvironmentSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
