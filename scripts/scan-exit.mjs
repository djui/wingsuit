// Scans a grid around a point for the steepest initial drop along a heading.
import { PNG } from 'pngjs';
const [lat0, lon0, heading = 0, span = 400] = process.argv.slice(2).map(Number);
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
  const n = 2 ** Z, fx = ((lon + 180) / 360) * n, r = lat * Math.PI / 180;
  const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const tx = Math.floor(fx), ty = Math.floor(fy), png = await tile(tx, ty);
  const px = Math.min(255, Math.floor((fx - tx) * 256)), py = Math.min(255, Math.floor((fy - ty) * 256));
  const i = (py * 256 + px) * 4, d = png.data;
  return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
}
const mLat = 111320, mLon = 111320 * Math.cos(lat0 * Math.PI / 180), h = heading * Math.PI / 180;
const results = [];
for (let dn = -span; dn <= span; dn += 25) for (let de = -span; de <= span; de += 25) {
  const lat = lat0 + dn / mLat, lon = lon0 + de / mLon;
  const z0 = await height(lat, lon);
  const z60 = await height(lat + 60 * Math.cos(h) / mLat, lon + 60 * Math.sin(h) / mLon);
  const z200 = await height(lat + 200 * Math.cos(h) / mLat, lon + 200 * Math.sin(h) / mLon);
  results.push({ lat: lat.toFixed(5), lon: lon.toFixed(5), z0: z0.toFixed(0), drop60: (z0 - z60).toFixed(0), drop200: (z0 - z200).toFixed(0) });
}
results.sort((a, b) => b.drop60 - a.drop60); const hi = results.filter(r => +r.z0 > 3400); console.table(hi.slice(0, 8));
console.table(results.slice(0, 12));
