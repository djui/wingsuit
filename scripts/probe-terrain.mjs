// Prints a terrain profile from a lat/lon along a heading, using the same
// Terrarium tiles the game uses. Usage: npm run probe -- <lat> <lon> <headingDeg> [km]
import { PNG } from 'pngjs';

const [lat0, lon0, heading = 0, km = 8] = process.argv.slice(2).map(Number);
if (!Number.isFinite(lat0) || !Number.isFinite(lon0)) {
  console.error('usage: probe-terrain <lat> <lon> [headingDeg] [km]');
  process.exit(1);
}
const Z = 13;
const cache = new Map();

async function tile(x, y) {
  const k = `${x}/${y}`;
  if (!cache.has(k)) {
    const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`);
    const buf = Buffer.from(await res.arrayBuffer());
    cache.set(k, PNG.sync.read(buf));
  }
  return cache.get(k);
}

async function height(lat, lon) {
  const n = 2 ** Z;
  const fx = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const png = await tile(tx, ty);
  const px = Math.min(255, Math.floor((fx - tx) * 256));
  const py = Math.min(255, Math.floor((fy - ty) * 256));
  const i = (py * 256 + px) * 4;
  const d = png.data;
  return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
}

const mPerDegLat = 111320;
const mPerDegLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
const h = (heading * Math.PI) / 180;
console.log(`profile from ${lat0},${lon0} heading ${heading}° (${km} km)`);
for (let d = 0; d <= km * 1000; d += 10) {
  const lat = lat0 + (d * Math.cos(h)) / mPerDegLat;
  const lon = lon0 + (d * Math.sin(h)) / mPerDegLon;
  const z = await height(lat, lon);
  console.log(`${String(d).padStart(6)} m  ${z.toFixed(0).padStart(5)} m  ${'#'.repeat(Math.max(0, Math.round((z - 500) / 60)))}`);
}
