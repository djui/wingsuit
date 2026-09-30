import * as SunCalc from 'suncalc';

export interface CelestialPosition {
  /** Degrees above the horizon. */
  elevation: number;
  /** Compass degrees, 0 = north, clockwise. */
  azimuth: number;
}

// suncalc 2.x returns degrees, with azimuth as compass bearing (0 = north).
export function sunPosition(date: Date, lat: number, lon: number): CelestialPosition {
  const p = SunCalc.getPosition(date, lat, lon);
  return { elevation: p.altitude, azimuth: (p.azimuth + 360) % 360 };
}

export function moonPosition(date: Date, lat: number, lon: number): CelestialPosition & { fraction: number } {
  const p = SunCalc.getMoonPosition(date, lat, lon);
  const illum = SunCalc.getMoonIllumination(date);
  return { elevation: p.altitude, azimuth: (p.azimuth + 360) % 360, fraction: illum.fraction };
}

export type TimePreset = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'sunset' | 'night' | 'custom' | 'live';

/**
 * Resolves a preset to an absolute date for the location, using today's
 * sunrise/solar-noon/sunset so presets look right at any latitude and season.
 * `hour` is local solar time (12 = solar noon) for the custom preset.
 */
export function timeForPreset(preset: TimePreset, hour: number, lat: number, lon: number, now = new Date()): Date {
  if (preset === 'live') return now;
  const t = SunCalc.getTimes(now, lat, lon);
  const noon = t.solarNoon.getTime();
  const h = 3600 * 1000;
  // Polar day/night: SunCalc returns invalid dates; fall back to ±6 h.
  const valid = (d: Date | null | undefined) => d && !Number.isNaN(d.getTime());
  const sunrise = valid(t.sunrise) ? t.sunrise!.getTime() : noon - 6 * h;
  const sunset = valid(t.sunset) ? t.sunset!.getTime() : noon + 6 * h;
  switch (preset) {
    case 'dawn':
      return new Date(sunrise + 0.25 * h);
    case 'morning':
      return new Date(sunrise + 2.5 * h);
    case 'noon':
      return new Date(noon);
    case 'afternoon':
      return new Date(noon + 3.5 * h);
    case 'sunset':
      return new Date(sunset - 0.3 * h);
    case 'night':
      return new Date(noon + 11 * h);
    case 'custom':
    default:
      return new Date(noon + (hour - 12) * h);
  }
}
