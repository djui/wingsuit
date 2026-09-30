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
  /** One-line flavour text shown in the menu. */
  blurb: string;
  /**
   * Exit point. Altitude is metres above sea level. If omitted the DEM height
   * + 2 m is used. City exits (tower roofs) set it explicitly because the
   * elevation data has no buildings.
   */
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
    blurb: 'The classic: 1,800 m north face down to Grindelwald.',
    exit: { lat: 46.57922, lon: 8.00606 },
    heading: 0,
    exitOffset: 25,
    landing: { lat: 46.6245, lon: 8.0395, radius: 60 },
    wind: { fromDeg: 270, speed: 3 },
    loadRadius: 3,
  },
  {
    id: 'lauterbrunnen',
    name: 'Lauterbrunnen High Nose',
    country: 'Switzerland',
    kind: 'mountain',
    blurb: 'Off the west wall above Mürren, straight into the valley of 72 waterfalls.',
    exit: { lat: 46.56247, lon: 7.89863 },
    heading: 90,
    exitOffset: 25,
    landing: { lat: 46.5700, lon: 7.9095, radius: 50 },
    wind: { fromDeg: 180, speed: 2 },
    loadRadius: 3,
  },
  {
    id: 'brevent',
    name: 'Brévent',
    country: 'France',
    kind: 'mountain',
    blurb: 'Chamonix below, Mont Blanc across the valley.',
    exit: { lat: 45.93338, lon: 6.84188 },
    heading: 130,
    exitOffset: 30,
    landing: { lat: 45.9237, lon: 6.8694, radius: 50 },
    wind: { fromDeg: 240, speed: 3 },
    loadRadius: 3,
  },
  {
    id: 'brento',
    name: 'Monte Brento',
    country: 'Italy',
    kind: 'mountain',
    blurb: 'Europe\'s busiest exit, off the big wall above the Sarca valley.',
    exit: { lat: 45.98022, lon: 10.91194 },
    heading: 76,
    exitOffset: 25,
    landing: { lat: 45.9825, lon: 10.9300, radius: 50 },
    wind: { fromDeg: 180, speed: 3 },
    loadRadius: 3,
  },
  {
    id: 'kjerag',
    name: 'Kjerag',
    country: 'Norway',
    kind: 'mountain',
    blurb: 'A sheer 1,000 m granite wall over the Lysefjord. Land at Lysebotn.',
    exit: { lat: 59.04184, lon: 6.62422 },
    heading: 30,
    exitOffset: 25,
    landing: { lat: 59.0535, lon: 6.6515, radius: 50 },
    wind: { fromDeg: 300, speed: 4 },
    loadRadius: 3,
  },
  {
    id: 'halfdome',
    name: 'Half Dome',
    country: 'United States',
    kind: 'mountain',
    blurb: 'The 600 m north-west face, then glide out over Yosemite Valley.',
    exit: { lat: 37.74433, lon: -119.53604 },
    heading: 320,
    exitOffset: 30,
    landing: { lat: 37.7445, lon: -119.5650, radius: 60 },
    wind: { fromDeg: 250, speed: 2 },
    loadRadius: 3,
  },
  {
    id: 'tablemountain',
    name: 'Table Mountain',
    country: 'South Africa',
    kind: 'mountain',
    blurb: 'Off the front table with Cape Town and the Atlantic ahead.',
    exit: { lat: -33.96168, lon: 18.41332 },
    heading: 0,
    exitOffset: 30,
    landing: { lat: -33.9425, lon: 18.4140, radius: 60 },
    wind: { fromDeg: 160, speed: 5 },
    loadRadius: 3,
  },
  {
    id: 'fuji',
    name: 'Mount Fuji',
    country: 'Japan',
    kind: 'mountain',
    blurb: 'Helicopter drop just above the summit rim, down the west flank.',
    exit: { lat: 35.36442, lon: 138.72547, altitude: 3700 },
    heading: 270,
    exitOffset: 40,
    landing: { lat: 35.3660, lon: 138.6760, radius: 80 },
    wind: { fromDeg: 270, speed: 4 },
    loadRadius: 3,
  },
  {
    id: 'burj',
    name: 'Burj Khalifa',
    country: 'United Arab Emirates',
    kind: 'city',
    blurb: 'From the spire of the tallest building on Earth, 828 m over Dubai.',
    exit: { lat: 25.19720, lon: 55.27440, altitude: 832 },
    heading: 230,
    exitOffset: 20,
    landing: { lat: 25.1880, lon: 55.2620, radius: 40 },
    wind: { fromDeg: 320, speed: 4 },
    loadRadius: 2,
  },
  {
    id: 'corcovado',
    name: 'Corcovado',
    country: 'Brazil',
    kind: 'city',
    blurb: 'From beneath Christ the Redeemer down the south face to Parque Lage, Rio.',
    exit: { lat: -22.95235, lon: -43.21221, altitude: 700 },
    heading: 180,
    exitOffset: 25,
    landing: { lat: -22.9620, lon: -43.2110, radius: 40 },
    wind: { fromDeg: 120, speed: 3 },
    loadRadius: 2,
  },
  {
    id: 'victoriapeak',
    name: 'Victoria Peak',
    country: 'Hong Kong',
    kind: 'city',
    blurb: 'Helicopter drop 270 m above the Peak, down to the harbour front.',
    exit: { lat: 22.27702, lon: 114.14380, altitude: 750 },
    heading: 355,
    exitOffset: 25,
    landing: { lat: 22.2870, lon: 114.1425, radius: 40 },
    wind: { fromDeg: 90, speed: 4 },
    loadRadius: 2,
  },
  {
    id: 'petronas',
    name: 'Petronas Towers',
    country: 'Malaysia',
    kind: 'city',
    blurb: 'From the twin towers\' pinnacle over Kuala Lumpur.',
    exit: { lat: 3.15785, lon: 101.71165, altitude: 512 },
    heading: 300,
    exitOffset: 20,
    landing: { lat: 3.1620, lon: 101.7050, radius: 40 },
    wind: { fromDeg: 200, speed: 2 },
    loadRadius: 2,
  },
];

export function getLocation(id: string): Location {
  const loc = LOCATIONS.find((l) => l.id === id);
  if (!loc) throw new Error(`Unknown location: ${id}`);
  return loc;
}
