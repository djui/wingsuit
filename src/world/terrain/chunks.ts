/**
 * Streams terrain around the player. One chunk = one zoom-13 elevation tile,
 * built as a heightmap mesh with a skirt to hide LOD seams. Imagery is loaded
 * at low resolution first and refined near the player.
 */
import * as THREE from 'three';
import { GeoOrigin, tileKey, tileToLonLat, lonLatToTile } from '../geo';
import {
  ELEVATION_ZOOM,
  TILE_SIZE,
  loadElevationTile,
  loadImageryForTile,
  type ElevationTile,
} from './tiles';

const SKIRT_DEPTH = 120;

interface Chunk {
  key: string;
  tx: number;
  ty: number;
  mesh: THREE.Mesh | null;
  step: number;
  imageryZoom: number;
  imageryTarget: number;
  imageryAbort: AbortController | null;
  building: boolean;
  disposed: boolean;
  ready: Promise<void>;
}

export interface TerrainStats {
  chunks: number;
  built: number;
  pending: number;
}

export class TerrainManager {
  readonly group = new THREE.Group();
  private chunks = new Map<string, Chunk>();
  private tiles = new Map<string, ElevationTile>();
  private lastCenter = { tx: NaN, ty: NaN };
  private lastUpdate = 0;

  constructor(
    private readonly origin: GeoOrigin,
    private readonly loadRadius: number,
  ) {
    this.group.name = 'terrain';
  }

  /** Scene x/z -> zoom-13 tile coords. */
  private sceneToTile(x: number, z: number): { fx: number; fy: number } {
    const ll = this.origin.toLatLon(x, z);
    const t = lonLatToTile(ll.lon, ll.lat, ELEVATION_ZOOM);
    return { fx: t.x, fy: t.y };
  }

  /** Bilinear terrain height at scene x/z, or null if not loaded. */
  getHeight(x: number, z: number): number | null {
    const { fx, fy } = this.sceneToTile(x, z);
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    const px = (fx - tx) * TILE_SIZE;
    const py = (fy - ty) * TILE_SIZE;
    const i0 = Math.floor(px);
    const j0 = Math.floor(py);
    const u = px - i0;
    const v = py - j0;
    const h00 = this.sample(tx, ty, i0, j0);
    const h10 = this.sample(tx, ty, i0 + 1, j0);
    const h01 = this.sample(tx, ty, i0, j0 + 1);
    const h11 = this.sample(tx, ty, i0 + 1, j0 + 1);
    if (h00 === null || h10 === null || h01 === null || h11 === null) return null;
    return (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
  }

  /** Surface normal (approximate, from finite differences). */
  getNormal(x: number, z: number, target = new THREE.Vector3()): THREE.Vector3 {
    const d = 10;
    const hL = this.getHeight(x - d, z) ?? 0;
    const hR = this.getHeight(x + d, z) ?? 0;
    const hD = this.getHeight(x, z - d) ?? 0;
    const hU = this.getHeight(x, z + d) ?? 0;
    return target.set(hL - hR, 2 * d, hD - hU).normalize();
  }

  /** Height sample allowing px/py == TILE_SIZE to spill into the neighbour tile. */
  private sample(tx: number, ty: number, px: number, py: number): number | null {
    if (px >= TILE_SIZE) {
      tx += 1;
      px -= TILE_SIZE;
    }
    if (py >= TILE_SIZE) {
      ty += 1;
      py -= TILE_SIZE;
    }
    const tile = this.tiles.get(tileKey(ELEVATION_ZOOM, tx, ty));
    if (!tile) return null;
    return tile.heights[py * TILE_SIZE + px];
  }

  private sampleClamped(tx: number, ty: number, px: number, py: number): number {
    const h = this.sample(tx, ty, px, py);
    if (h !== null) return h;
    // Neighbour missing: clamp to the edge of the current tile.
    const tile = this.tiles.get(tileKey(ELEVATION_ZOOM, tx, ty))!;
    return tile.heights[Math.min(py, TILE_SIZE - 1) * TILE_SIZE + Math.min(px, TILE_SIZE - 1)];
  }

  /** Ensure terrain around (x, z) is loaded; call every frame. */
  update(x: number, z: number, now: number): void {
    if (now - this.lastUpdate < 250) return;
    this.lastUpdate = now;
    const { fx, fy } = this.sceneToTile(x, z);
    const ctx = Math.floor(fx);
    const cty = Math.floor(fy);
    const R = this.loadRadius;

    if (ctx !== this.lastCenter.tx || cty !== this.lastCenter.ty) {
      this.lastCenter = { tx: ctx, ty: cty };
      // Unload far chunks.
      for (const chunk of this.chunks.values()) {
        if (Math.max(Math.abs(chunk.tx - ctx), Math.abs(chunk.ty - cty)) > R + 1) {
          this.disposeChunk(chunk);
        }
      }
      // Load new ones, nearest first.
      const wanted: Array<{ tx: number; ty: number; d: number }> = [];
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          wanted.push({ tx: ctx + dx, ty: cty + dy, d: Math.max(Math.abs(dx), Math.abs(dy)) });
        }
      }
      wanted.sort((a, b) => a.d - b.d);
      for (const w of wanted) this.ensureChunk(w.tx, w.ty);
    }

    // LOD and imagery refinement based on distance to the player.
    for (const chunk of this.chunks.values()) {
      const d = Math.max(Math.abs(chunk.tx - ctx), Math.abs(chunk.ty - cty));
      const step = d <= 1 ? 1 : d === 2 ? 2 : 4;
      const imageryZoom = d <= 1 ? ELEVATION_ZOOM + 2 : d === 2 ? ELEVATION_ZOOM + 1 : ELEVATION_ZOOM;
      if (chunk.mesh && chunk.step !== step && !chunk.building) {
        this.rebuild(chunk, step);
      }
      if (chunk.mesh && imageryZoom !== chunk.imageryTarget) {
        this.refineImagery(chunk, imageryZoom);
      }
    }
  }

  /** Resolves once the chunk under (x, z) and its neighbours are built. */
  async waitForArea(x: number, z: number, radius = 1): Promise<void> {
    const { fx, fy } = this.sceneToTile(x, z);
    const ctx = Math.floor(fx);
    const cty = Math.floor(fy);
    const jobs: Promise<void>[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        jobs.push(this.ensureChunk(ctx + dx, cty + dy));
      }
    }
    await Promise.all(jobs);
  }

  stats(): TerrainStats {
    let built = 0;
    for (const c of this.chunks.values()) if (c.mesh) built++;
    return { chunks: this.chunks.size, built, pending: this.chunks.size - built };
  }

  private ensureChunk(tx: number, ty: number): Promise<void> {
    const key = tileKey(ELEVATION_ZOOM, tx, ty);
    const existing = this.chunks.get(key);
    if (existing) return existing.ready;
    const chunk: Chunk = {
      key,
      tx,
      ty,
      mesh: null,
      step: 4,
      imageryZoom: 0,
      imageryTarget: 0,
      imageryAbort: null,
      building: true,
      disposed: false,
      ready: Promise.resolve(),
    };
    this.chunks.set(key, chunk);
    chunk.ready = this.buildChunk(chunk);
    return chunk.ready;
  }

  private async buildChunk(chunk: Chunk): Promise<void> {
    const { tx, ty } = chunk;
    try {
      // Own tile plus the east/south/south-east neighbours for seamless edges.
      const tiles = await Promise.all([
        loadElevationTile(ELEVATION_ZOOM, tx, ty),
        loadElevationTile(ELEVATION_ZOOM, tx + 1, ty).catch(() => null),
        loadElevationTile(ELEVATION_ZOOM, tx, ty + 1).catch(() => null),
        loadElevationTile(ELEVATION_ZOOM, tx + 1, ty + 1).catch(() => null),
      ]);
      if (chunk.disposed) return;
      for (const t of tiles) if (t) this.tiles.set(tileKey(t.z, t.x, t.y), t);

      const material = new THREE.MeshLambertMaterial({ color: 0x808080 });
      const mesh = new THREE.Mesh(this.buildGeometry(tx, ty, chunk.step), material);
      mesh.name = chunk.key;
      mesh.frustumCulled = true;
      chunk.mesh = mesh;
      chunk.building = false;
      this.group.add(mesh);
      this.refineImagery(chunk, ELEVATION_ZOOM);
    } catch (err) {
      console.warn('terrain chunk failed', chunk.key, err);
      this.chunks.delete(chunk.key);
    }
  }

  private rebuild(chunk: Chunk, step: number): void {
    if (!chunk.mesh) return;
    const old = chunk.mesh.geometry;
    chunk.mesh.geometry = this.buildGeometry(chunk.tx, chunk.ty, step);
    old.dispose();
    chunk.step = step;
  }

  private refineImagery(chunk: Chunk, zoom: number): void {
    chunk.imageryTarget = zoom;
    chunk.imageryAbort?.abort();
    const abort = new AbortController();
    chunk.imageryAbort = abort;
    loadImageryForTile(chunk.tx, chunk.ty, zoom, abort.signal)
      .then((canvas) => {
        if (abort.signal.aborted || chunk.disposed || !chunk.mesh) return;
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        const mat = chunk.mesh.material as THREE.MeshLambertMaterial;
        mat.map?.dispose();
        mat.map = tex;
        mat.color.set(0xffffff);
        mat.needsUpdate = true;
        chunk.imageryZoom = zoom;
      })
      .catch(() => {});
  }

  private buildGeometry(tx: number, ty: number, step: number): THREE.BufferGeometry {
    const n = TILE_SIZE / step; // segments
    const verts = (n + 1) * (n + 1);
    const skirtVerts = 4 * (n + 1);
    const positions = new Float32Array((verts + skirtVerts) * 3);
    const normals = new Float32Array((verts + skirtVerts) * 3);
    const uvs = new Float32Array((verts + skirtVerts) * 2);

    // Grid vertices
    const heightAt = (i: number, j: number) => this.sampleClamped(tx, ty, i * step, j * step);
    let p = 0;
    let t = 0;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const ll = tileToLonLat(tx + i / n, ty + j / n, ELEVATION_ZOOM);
        const loc = this.origin.toLocal(ll.lat, ll.lon);
        positions[p++] = loc.x;
        positions[p++] = heightAt(i, j);
        positions[p++] = loc.z;
        uvs[t++] = i / n;
        uvs[t++] = 1 - j / n;
      }
    }
    // Normals from central differences on the grid (in metres)
    const idx = (i: number, j: number) => j * (n + 1) + i;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const iL = Math.max(0, i - 1);
        const iR = Math.min(n, i + 1);
        const jU = Math.max(0, j - 1);
        const jD = Math.min(n, j + 1);
        const xL = positions[idx(iL, j) * 3];
        const xR = positions[idx(iR, j) * 3];
        const zU = positions[idx(i, jU) * 3 + 2];
        const zD = positions[idx(i, jD) * 3 + 2];
        const hL = positions[idx(iL, j) * 3 + 1];
        const hR = positions[idx(iR, j) * 3 + 1];
        const hU = positions[idx(i, jU) * 3 + 1];
        const hD = positions[idx(i, jD) * 3 + 1];
        const dx = (hR - hL) / Math.max(1e-3, xR - xL);
        const dz = (hD - hU) / Math.max(1e-3, zD - zU);
        const len = Math.hypot(dx, 1, dz);
        const k = idx(i, j) * 3;
        normals[k] = -dx / len;
        normals[k + 1] = 1 / len;
        normals[k + 2] = -dz / len;
      }
    }
    // Skirt vertices: copies of the border, dropped down.
    const border: number[] = [];
    for (let i = 0; i <= n; i++) border.push(idx(i, 0));
    for (let j = 1; j <= n; j++) border.push(idx(n, j));
    for (let i = n - 1; i >= 0; i--) border.push(idx(i, n));
    for (let j = n - 1; j >= 1; j--) border.push(idx(0, j));
    // border has 4n entries; pad to 4(n+1) by repeating the first.
    while (border.length < skirtVerts) border.push(border[0]);
    for (let s = 0; s < skirtVerts; s++) {
      const src = border[s];
      const dst = verts + s;
      positions[dst * 3] = positions[src * 3];
      positions[dst * 3 + 1] = positions[src * 3 + 1] - SKIRT_DEPTH;
      positions[dst * 3 + 2] = positions[src * 3 + 2];
      normals[dst * 3] = normals[src * 3];
      normals[dst * 3 + 1] = normals[src * 3 + 1];
      normals[dst * 3 + 2] = normals[src * 3 + 2];
      uvs[dst * 2] = uvs[src * 2];
      uvs[dst * 2 + 1] = uvs[src * 2 + 1];
    }

    // Indices
    const gridTris = n * n * 2;
    const skirtTris = 4 * n * 2;
    const indices = new Uint32Array((gridTris + skirtTris) * 3);
    let q = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = idx(i, j);
        const b = idx(i + 1, j);
        const c = idx(i, j + 1);
        const d = idx(i + 1, j + 1);
        // Counter-clockwise seen from above (+y): note +z is south.
        indices[q++] = a;
        indices[q++] = c;
        indices[q++] = b;
        indices[q++] = b;
        indices[q++] = c;
        indices[q++] = d;
      }
    }
    const ringLen = 4 * n;
    for (let s = 0; s < ringLen; s++) {
      const b0 = border[s];
      const b1 = border[(s + 1) % ringLen];
      const s0 = verts + s;
      const s1 = verts + ((s + 1) % ringLen);
      indices[q++] = b0;
      indices[q++] = b1;
      indices[q++] = s0;
      indices[q++] = b1;
      indices[q++] = s1;
      indices[q++] = s0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeBoundingSphere();
    return geo;
  }

  private disposeChunk(chunk: Chunk): void {
    chunk.disposed = true;
    chunk.imageryAbort?.abort();
    if (chunk.mesh) {
      this.group.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
      const mat = chunk.mesh.material as THREE.MeshLambertMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    this.chunks.delete(chunk.key);
  }
}
