/**
 * Tile providers. Elevation: AWS Terrain Tiles (Terrarium encoding, public S3
 * bucket, no key). Imagery: ESRI World Imagery (free with attribution).
 */
import { tileKey } from '../geo';

export const ELEVATION_ZOOM = 13;
export const TILE_SIZE = 256;

export const ATTRIBUTION =
  'Elevation: Mapzen/AWS Terrain Tiles (SRTM, EU-DEM et al.) · Imagery: Esri, Maxar, Earthstar Geographics';

export function elevationUrl(z: number, x: number, y: number): string {
  return `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
}

export function imageryUrl(z: number, x: number, y: number): string {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

/** Simple concurrency limiter so we do not fire hundreds of requests at once. */
class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;
  constructor(private readonly limit: number) {}
  async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active++;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve(() => this.release());
      });
    });
  }
  private release() {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

const elevationSem = new Semaphore(8);
const imagerySem = new Semaphore(12);

async function fetchBitmap(url: string, sem: Semaphore): Promise<ImageBitmap> {
  const release = await sem.acquire();
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const blob = await res.blob();
    return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  } finally {
    release();
  }
}

/** Decoded elevation tile: row-major metres, TILE_SIZE x TILE_SIZE. */
export interface ElevationTile {
  z: number;
  x: number;
  y: number;
  heights: Float32Array;
  min: number;
  max: number;
}

const elevationCache = new Map<string, Promise<ElevationTile>>();

export function loadElevationTile(z: number, x: number, y: number): Promise<ElevationTile> {
  const key = tileKey(z, x, y);
  let p = elevationCache.get(key);
  if (!p) {
    p = (async () => {
      const bmp = await fetchBitmap(elevationUrl(z, x, y), elevationSem);
      const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      const data = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
      const heights = new Float32Array(TILE_SIZE * TILE_SIZE);
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0, j = 0; i < heights.length; i++, j += 4) {
        // Terrarium: h = R*256 + G + B/256 - 32768
        const h = data[j] * 256 + data[j + 1] + data[j + 2] / 256 - 32768;
        heights[i] = h;
        if (h < min) min = h;
        if (h > max) max = h;
      }
      return { z, x, y, heights, min, max };
    })();
    elevationCache.set(key, p);
    p.catch(() => elevationCache.delete(key));
  }
  return p;
}

/**
 * Builds a square canvas covering elevation tile (tx, ty) at zoom
 * ELEVATION_ZOOM using imagery from zoom `imageryZoom` (>= ELEVATION_ZOOM).
 * Missing sub-tiles are left dark rather than failing the whole texture.
 */
export async function loadImageryForTile(
  tx: number,
  ty: number,
  imageryZoom: number,
  signal?: AbortSignal,
): Promise<HTMLCanvasElement> {
  const k = imageryZoom - ELEVATION_ZOOM;
  const n = 2 ** k;
  const size = TILE_SIZE * n;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#20241c';
  ctx.fillRect(0, 0, size, size);
  const jobs: Promise<void>[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const sx = tx * n + i;
      const sy = ty * n + j;
      jobs.push(
        fetchBitmap(imageryUrl(imageryZoom, sx, sy), imagerySem)
          .then((bmp) => {
            if (signal?.aborted) {
              bmp.close();
              return;
            }
            ctx.drawImage(bmp, i * TILE_SIZE, j * TILE_SIZE);
            bmp.close();
          })
          .catch(() => {
            /* leave placeholder */
          }),
      );
    }
  }
  await Promise.all(jobs);
  return canvas;
}
