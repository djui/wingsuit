/**
 * Geographic helpers: WGS84 lat/lon <-> local ENU-ish scene frame, and Web
 * Mercator tile math shared by the elevation and imagery providers.
 *
 * Scene frame (three.js, right-handed, y up):
 *   +x = east, +y = up, +z = south  (so -z = north)
 */
export const EARTH_RADIUS = 6378137;
export const DEG = Math.PI / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Local tangent-plane origin. */
export class GeoOrigin {
  readonly lat: number;
  readonly lon: number;
  private readonly metersPerDegLat: number;
  private readonly metersPerDegLon: number;

  constructor(origin: LatLon) {
    this.lat = origin.lat;
    this.lon = origin.lon;
    this.metersPerDegLat = EARTH_RADIUS * DEG;
    this.metersPerDegLon = EARTH_RADIUS * DEG * Math.cos(origin.lat * DEG);
  }

  /** lat/lon -> scene x (east) / z (south) in metres. */
  toLocal(lat: number, lon: number): { x: number; z: number } {
    return {
      x: (lon - this.lon) * this.metersPerDegLon,
      z: -(lat - this.lat) * this.metersPerDegLat,
    };
  }

  /** scene x/z -> lat/lon. */
  toLatLon(x: number, z: number): LatLon {
    return {
      lat: this.lat - z / this.metersPerDegLat,
      lon: this.lon + x / this.metersPerDegLon,
    };
  }
}

/** Web Mercator tile coordinates (fractional). */
export function lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = ((lon + 180) / 360) * n;
  const latRad = lat * DEG;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

/** Tile corner (fractional tile coords) -> lon/lat. */
export function tileToLonLat(x: number, y: number, zoom: number): LatLon {
  const n = 2 ** zoom;
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lat: latRad / DEG, lon };
}

export function tileKey(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}

/** Horizontal distance between two scene points. */
export function horizontalDistance(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.hypot(dx, dz);
}
