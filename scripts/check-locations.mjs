// Validates every launch site against the DEM: exit height, landing-zone
// height, distance and required glide ratio, and minimum clearance of a
// straight-line 2.5:1 glide from the exit to the landing zone.
import { PNG } from 'pngjs';
import { LOCATIONS } from '../src/world/locations.ts';

const Z = 13, cache = new Map();
async function tile(x, y) {
  const k = `${x}/${y}`;
  if (!cache.has(k)) {
    const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`);
    cache.set(k, PNG.sync.read(Buffer.from(await res.arrayBuffer())));
  }
  return cache.get(k);
}
async function height(lat, lon) {
  const n = 2 ** Z, fx = ((lon + 180) / 360) * n, r = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const tx = Math.floor(fx), ty = Math.floor(fy), png = await tile(tx, ty);
  const px = Math.min(255, Math.floor((fx - tx) * 256)), py = Math.min(255, Math.floor((fy - ty) * 256));
  const i = (py * 256 + px) * 4, d = png.data;
  return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
}
const rows = [];
for (const loc of LOCATIONS) {
  const mLat = 111320, mLon = 111320 * Math.cos((loc.exit.lat * Math.PI) / 180);
  const h = (loc.heading * Math.PI) / 180;
  const ridge = await height(loc.exit.lat, loc.exit.lon);
  const exitAlt = (loc.exit.altitude ?? ridge) + 1.8;
  const exLat = loc.exit.lat + (loc.exitOffset * Math.cos(h)) / mLat;
  const exLon = loc.exit.lon + (loc.exitOffset * Math.sin(h)) / mLon;
  const lzAlt = await height(loc.landing.lat, loc.landing.lon);
  const dN = (loc.landing.lat - exLat) * mLat, dE = (loc.landing.lon - exLon) * mLon;
  const dist = Math.hypot(dN, dE);
  const bearing = ((Math.atan2(dE, dN) * 180) / Math.PI + 360) % 360;
  const drop = exitAlt - lzAlt;
  // Straight-line 2.5:1 glide clearance sampled every 50 m; skip the first 150 m (start arc).
  let minClear = Infinity, minAt = 0;
  for (let d = 150; d < dist; d += 50) {
    const lat = exLat + (d * dN) / dist / mLat, lon = exLon + (d * dE) / dist / mLon;
    const ground = await height(lat, lon);
    const alt = exitAlt - 120 - d / 2.5; // ~120 m lost in the start arc
    const clear = alt - ground;
    if (clear < minClear) { minClear = clear; minAt = d; }
  }
  // Slope at the landing zone
  const s = 30;
  const zN = await height(loc.landing.lat + s / mLat, loc.landing.lon), zS = await height(loc.landing.lat - s / mLat, loc.landing.lon);
  const zE = await height(loc.landing.lat, loc.landing.lon + s / mLon), zW = await height(loc.landing.lat, loc.landing.lon - s / mLon);
  const slope = (Math.atan(Math.hypot((zN - zS) / (2 * s), (zE - zW) / (2 * s))) * 180) / Math.PI;
  const face60 = ridge - (await height(loc.exit.lat + (60 * Math.cos(h)) / mLat, loc.exit.lon + (60 * Math.sin(h)) / mLon));
  rows.push({ id: loc.id, exit: exitAlt.toFixed(0), face60: face60.toFixed(0), lz: lzAlt.toFixed(0), lzSlope: slope.toFixed(0), dist: (dist / 1000).toFixed(2), bearing: bearing.toFixed(0), hdg: loc.heading, glide: (dist / drop).toFixed(2), minClear: minClear.toFixed(0), at: minAt });
}
console.table(rows);
