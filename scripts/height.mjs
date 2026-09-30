// Prints DEM height and local slope for a list of lat,lon points.
import { PNG } from 'pngjs';
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
for (const arg of process.argv.slice(2)) {
  const [lat, lon] = arg.split(',').map(Number);
  const mLat = 111320, mLon = 111320 * Math.cos((lat * Math.PI) / 180), s = 30;
  const z = await height(lat, lon);
  const zN = await height(lat + s / mLat, lon), zS = await height(lat - s / mLat, lon);
  const zE = await height(lat, lon + s / mLon), zW = await height(lat, lon - s / mLon);
  const slope = (Math.atan(Math.hypot((zN - zS) / (2 * s), (zE - zW) / (2 * s))) * 180) / Math.PI;
  console.log(`${arg}\t${z.toFixed(0)} m\tslope ${slope.toFixed(0)}°`);
}
