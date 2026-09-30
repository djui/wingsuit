import type { LatLon } from './geo';

export interface LandingZone extends LatLon {
  /** Radius in metres that counts as a hit. */
  radius: number;
}

export interface Location {
  id: string;
  name: string;
  country: string;
  kind: 'mountain' | 'city';
  /** Exit point. Altitude is metres above sea level; if omitted the DEM height + 2 m is used. */
  exit: LatLon & { altitude?: number };
  /** Initial heading in degrees, 0 = north, 90 = east. */
  heading: number;
  /** Metres to step out from the exit point along the heading before dropping. */
  exitOffset: number;
  landing: LandingZone;
  /** Default wind: from-direction in degrees and speed in m/s. */
  wind: { fromDeg: number; speed: number };
  /** Tile radius (in zoom-13 tiles) to keep loaded around the player. */
  loadRadius: number;
}

export const LOCATIONS: Location[] = [
  {
    id: 'eiger',
    name: 'Eiger Mushroom',
    country: 'Switzerland',
    kind: 'mountain',
    exit: { lat: 46.57922, lon: 8.00606 },
    heading: 0,
    exitOffset: 25,
    landing: { lat: 46.6245, lon: 8.0395, radius: 60 },
    wind: { fromDeg: 270, speed: 3 },
    loadRadius: 3,
  },
];

export function getLocation(id: string): Location {
  const loc = LOCATIONS.find((l) => l.id === id);
  if (!loc) throw new Error(`Unknown location: ${id}`);
  return loc;
}
