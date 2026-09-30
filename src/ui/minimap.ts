/**
 * Results minimap: hill-shaded elevation around the flight with the exit,
 * landing zone, scoring ring and the flown path (wingsuit vs canopy).
 */
import type { TerrainManager } from '../world/terrain/chunks';

export interface MinimapInput {
  terrain: TerrainManager;
  /** Flight path as [t, x, y, z, ...]. */
  path: number[];
  /** Path sample index where the canopy was deployed, or -1. */
  deployIndex: number;
  exit: { x: number; z: number };
  landing: { x: number; z: number; radius: number };
}

export function drawMinimap(canvas: HTMLCanvasElement, input: MinimapInput): void {
  const size = canvas.width;
  const ctx = canvas.getContext('2d')!;
  const pts: Array<[number, number]> = [[input.exit.x, input.exit.z], [input.landing.x, input.landing.z]];
  for (let i = 0; i < input.path.length; i += 4) pts.push([input.path[i + 1], input.path[i + 3]]);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const span = Math.max(maxX - minX, maxZ - minZ, 1500) * 1.3;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const x0 = cx - span / 2;
  const z0 = cz - span / 2;
  const toPx = (x: number, z: number): [number, number] => [((x - x0) / span) * size, ((z - z0) / span) * size];

  // Hill-shaded, hypsometrically tinted terrain.
  const N = 160;
  const heights = new Float32Array(N * N);
  let hMin = Infinity;
  let hMax = -Infinity;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const h = input.terrain.getHeight(x0 + ((i + 0.5) / N) * span, z0 + ((j + 0.5) / N) * span) ?? 0;
      heights[j * N + i] = h;
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
  }
  const img = ctx.createImageData(N, N);
  const cellM = span / N;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const h = heights[j * N + i];
      const hl = heights[j * N + Math.max(0, i - 1)];
      const hr = heights[j * N + Math.min(N - 1, i + 1)];
      const hu = heights[Math.max(0, j - 1) * N + i];
      const hd = heights[Math.min(N - 1, j + 1) * N + i];
      const dx = (hr - hl) / (2 * cellM);
      const dz = (hd - hu) / (2 * cellM);
      // Light from the north-west.
      const shade = Math.max(0, Math.min(1, 0.55 + 0.9 * (-dx * 0.6 - dz * -0.6) / Math.hypot(dx, dz, 1)));
      const t = (h - hMin) / Math.max(1, hMax - hMin);
      const r = 70 + 150 * t;
      const g = 120 + 90 * t;
      const b = 60 + 150 * t;
      const k = (j * N + i) * 4;
      img.data[k] = r * shade;
      img.data[k + 1] = g * shade;
      img.data[k + 2] = b * shade;
      img.data[k + 3] = 255;
    }
  }
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = N;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(tmp, 0, 0, size, size);

  // Scoring ring and landing zone.
  const [lx, lz] = toPx(input.landing.x, input.landing.z);
  ctx.strokeStyle = 'rgba(255,180,84,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(lx, lz, (500 / span) * size, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(lx, lz, Math.max(4, (input.landing.radius / span) * size), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Flight path.
  if (input.path.length >= 8) {
    const drawSegment = (from: number, to: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let s = from; s < to; s++) {
        const [px, pz] = toPx(input.path[s * 4 + 1], input.path[s * 4 + 3]);
        if (s === from) ctx.moveTo(px, pz);
        else ctx.lineTo(px, pz);
      }
      ctx.stroke();
    };
    const total = input.path.length / 4;
    const split = input.deployIndex >= 0 ? Math.min(total, input.deployIndex + 1) : total;
    drawSegment(0, split, '#ffb454');
    if (split < total) drawSegment(split - 1, total, '#5ad2ff');
    const [ex, ez] = toPx(input.path[total * 4 - 3], input.path[total * 4 - 1]);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ez, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Exit marker.
  const [sx, sz] = toPx(input.exit.x, input.exit.z);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(sx, sz - 6);
  ctx.lineTo(sx + 5, sz + 4);
  ctx.lineTo(sx - 5, sz + 4);
  ctx.closePath();
  ctx.fill();

  // Scale bar (1 km) and north arrow.
  const km = (1000 / span) * size;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(8, size - 22, km + 12, 16);
  ctx.fillStyle = '#fff';
  ctx.fillRect(14, size - 13, km, 3);
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('1 km', 14, size - 15);
  ctx.fillText('N', size - 16, 14);
  ctx.beginPath();
  ctx.moveTo(size - 12, 18);
  ctx.lineTo(size - 8, 26);
  ctx.lineTo(size - 16, 26);
  ctx.closePath();
  ctx.fill();
}
