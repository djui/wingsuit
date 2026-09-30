import { type EnvironmentSettings, type EnvironmentState, type Precipitation, type SkyPreset } from './environment';
import { moonPosition, sunPosition, timeForPreset } from './sky/sun';

const CLOUD_COVER: Record<SkyPreset, number> = { clear: 0.05, partly: 0.45, overcast: 0.95 };

/** Turns menu settings into a physical environment state for a location. */
export function resolveEnvironment(s: EnvironmentSettings, lat: number, lon: number, now = new Date()): EnvironmentState {
  const date = timeForPreset(s.time, s.hour, lat, lon, now);
  const sun = sunPosition(date, lat, lon);
  const moon = moonPosition(date, lat, lon);
  let cloudCover = CLOUD_COVER[s.sky];
  let visibility = s.sky === 'overcast' ? 25000 : s.sky === 'partly' ? 45000 : 70000;
  let precipIntensity = 0;
  if (s.precip !== 'none') {
    cloudCover = Math.max(cloudCover, 0.8);
    precipIntensity = 0.7;
    visibility = s.precip === 'rain' ? 9000 : 5000;
  }
  const gustiness = Math.min(1, s.windSpeed / 12) * 0.6 + (s.precip !== 'none' ? 0.2 : 0);
  return {
    date,
    sunElevation: sun.elevation,
    sunAzimuth: sun.azimuth,
    moonElevation: moon.elevation,
    moonAzimuth: moon.azimuth,
    moonFraction: moon.fraction,
    cloudCover,
    precip: s.precip,
    precipIntensity,
    visibility,
    windSpeed: s.windSpeed,
    windFrom: s.windFrom,
    gustiness,
  };
}

export interface LiveWeather {
  temperature: number;
  windSpeed: number;
  windFrom: number;
  cloudCover: number;
  rain: number;
  snowfall: number;
  weatherCode: number;
  description: string;
}

/** Fetches current conditions from Open-Meteo (free, no key). */
export async function fetchLiveWeather(lat: number, lon: number): Promise<LiveWeather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&current=temperature_2m,rain,snowfall,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code&wind_speed_unit=ms`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const json = (await res.json()) as {
    current: {
      temperature_2m: number;
      rain: number;
      snowfall: number;
      cloud_cover: number;
      wind_speed_10m: number;
      wind_direction_10m: number;
      weather_code: number;
    };
  };
  const c = json.current;
  return {
    temperature: c.temperature_2m,
    windSpeed: c.wind_speed_10m,
    windFrom: c.wind_direction_10m,
    cloudCover: c.cloud_cover / 100,
    rain: c.rain,
    snowfall: c.snowfall,
    weatherCode: c.weather_code,
    description: describeWeatherCode(c.weather_code),
  };
}

/** Maps live conditions onto the menu settings. */
export function settingsFromLive(live: LiveWeather, base: EnvironmentSettings): EnvironmentSettings {
  const code = live.weatherCode;
  let precip: Precipitation = 'none';
  if (live.snowfall > 0 || (code >= 71 && code <= 77) || code === 85 || code === 86) precip = 'snow';
  else if (live.rain > 0 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) precip = 'rain';
  const sky: SkyPreset = live.cloudCover > 0.75 ? 'overcast' : live.cloudCover > 0.3 ? 'partly' : 'clear';
  return {
    ...base,
    time: 'live',
    sky,
    precip,
    windSpeed: Math.round(live.windSpeed * 10) / 10,
    windFrom: Math.round(live.windFrom),
  };
}

function describeWeatherCode(code: number): string {
  if (code === 0) return 'clear sky';
  if (code <= 2) return 'partly cloudy';
  if (code === 3) return 'overcast';
  if (code <= 48) return 'fog';
  if (code <= 57) return 'drizzle';
  if (code <= 67) return 'rain';
  if (code <= 77) return 'snow';
  if (code <= 82) return 'rain showers';
  if (code <= 86) return 'snow showers';
  return 'thunderstorm';
}
