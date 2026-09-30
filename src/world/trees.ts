/**
 * Instanced conifers placed on forested imagery near the player. Trees are
 * generated deterministically per 400 m cell from the elevation and
 * land-cover colour, rebuilt as the player moves, and are solid: the flyer
 * can thread between them but hitting one ends the run.
 */
import * as THREE from 'three';
import type { TerrainManager } from './terrain/chunks';

const CELL = 400;
const CANDIDATES_PER_CELL = 700;
const VIEW_RADIUS = 1400;
const MAX_INSTANCES = 40000;

interface Tree {
  x: number;
  y: number;
  z: number;
  height: number;
  radius: number;
}

interface Cell {
  key: string;
  trees: Tree[];
  /** 8x8 buckets of tree indices for fast collision lookup. */
  buckets: Int32Array[];
  cx: number;
  cz: number;
  /** True when imagery was missing for some candidates; rebuilt later. */
  incomplete: boolean;
}

function hash(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Forest test on the satellite colour: green-dominant and not too bright. */
function isForest(rgb: [number, number, number]): boolean {
  const [r, g, b] = rgb;
  const brightness = (r + g + b) / 3;
  return g > r * 1.04 && g > b * 1.15 && brightness < 135 && brightness > 25;
}

export class TreeField {
  readonly mesh: THREE.InstancedMesh;
  private cells = new Map<string, Cell>();
  private lastCell = { x: NaN, z: NaN };
  private lastRetry = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  enabled = true;

  constructor(
    private readonly terrain: TerrainManager,
    shadows: boolean,
  ) {
    const geo = treeGeometry();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, vertexColors: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_INSTANCES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.castShadow = shadows;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'trees';
  }

  /** Regenerates cells around the player when they cross a cell boundary. */
  update(x: number, z: number): void {
    if (!this.enabled) {
      this.mesh.count = 0;
      return;
    }
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const now = performance.now();
    if (cx === this.lastCell.x && cz === this.lastCell.z) {
      // Imagery arrives progressively: retry incomplete cells every couple of seconds.
      if (now - this.lastRetry < 2000) return;
      this.lastRetry = now;
      let changed = false;
      for (const [key, cell] of this.cells) {
        if (cell.incomplete) {
          this.cells.set(key, this.buildCell(cell.cx, cell.cz));
          changed = true;
        }
      }
      if (changed) this.fillInstances();
      return;
    }
    this.lastCell = { x: cx, z: cz };
    const r = Math.ceil(VIEW_RADIUS / CELL);
    const wanted = new Set<string>();
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const key = `${cx + dx},${cz + dz}`;
        wanted.add(key);
        if (!this.cells.has(key)) this.cells.set(key, this.buildCell(cx + dx, cz + dz));
      }
    }
    for (const key of this.cells.keys()) if (!wanted.has(key)) this.cells.delete(key);
    this.fillInstances();
  }

  private buildCell(cx: number, cz: number): Cell {
    const trees: Tree[] = [];
    const buckets: Int32Array[] = [];
    const tmp: number[][] = Array.from({ length: 64 }, () => []);
    let incomplete = false;
    for (let i = 0; i < CANDIDATES_PER_CELL; i++) {
      const x = (cx + hash(cx, cz, i * 2)) * CELL;
      const z = (cz + hash(cx, cz, i * 2 + 1)) * CELL;
      const rgb = this.terrain.sampleImagery(x, z);
      if (!rgb) {
        incomplete = true;
        continue;
      }
      if (!isForest(rgb)) continue;
      const y = this.terrain.getHeight(x, z);
      if (y === null) continue;
      const n = this.terrain.getNormal(x, z);
      if (n.y < 0.72) continue; // slopes over ~44°
      const height = 8 + hash(cx, cz, i + 9000) * 10;
      const t: Tree = { x, y, z, height, radius: height * 0.18 };
      const idx = trees.push(t) - 1;
      const bx = Math.min(7, Math.floor(((x - cx * CELL) / CELL) * 8));
      const bz = Math.min(7, Math.floor(((z - cz * CELL) / CELL) * 8));
      tmp[bz * 8 + bx].push(idx);
    }
    for (let b = 0; b < 64; b++) buckets.push(Int32Array.from(tmp[b]));
    return { key: `${cx},${cz}`, trees, buckets, cx, cz, incomplete };
  }

  private fillInstances(): void {
    let n = 0;
    for (const cell of this.cells.values()) {
      for (const t of cell.trees) {
        if (n >= MAX_INSTANCES) break;
        this.dummy.position.set(t.x, t.y, t.z);
        this.dummy.rotation.set(0, hash(cell.cx, cell.cz, n) * Math.PI * 2, 0);
        this.dummy.scale.set(t.height / 12, t.height / 12, t.height / 12);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(n, this.dummy.matrix);
        const shade = 0.75 + hash(cell.cx, cell.cz, n + 500) * 0.35;
        // Linear-space colours: a deep conifer green with per-tree variation.
        this.color.setRGB(0.035 * shade, 0.11 * shade, 0.03 * shade);
        this.mesh.setColorAt(n, this.color);
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Returns the tree hit by a body at (x, y, z) with the given clearance, or null. */
  hit(x: number, y: number, z: number, clearance: number): Tree | null {
    if (!this.enabled) return null;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const cell = this.cells.get(`${cx},${cz}`);
    if (!cell) return null;
    const bx = Math.min(7, Math.floor(((x - cx * CELL) / CELL) * 8));
    const bz = Math.min(7, Math.floor(((z - cz * CELL) / CELL) * 8));
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ix = bx + dx;
        const iz = bz + dz;
        if (ix < 0 || ix > 7 || iz < 0 || iz > 7) continue;
        const bucket = cell.buckets[iz * 8 + ix];
        for (let k = 0; k < bucket.length; k++) {
          const t = cell.trees[bucket[k]];
          const top = t.y + t.height;
          if (y > top + clearance || y < t.y) continue;
          // Crown narrows toward the top; trunk zone below 25% height is thin.
          const frac = (y - t.y) / t.height;
          const r = frac < 0.25 ? 0.3 : t.radius * (1 - (frac - 0.25) / 0.75) + 0.2;
          const d = Math.hypot(x - t.x, z - t.z);
          if (d < r + clearance) return t;
        }
      }
    }
    return null;
  }
}

/** Low-poly conifer: trunk plus two cone tiers, ~60 triangles, 12 m tall at scale 1. */
function treeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.25, 0.4, 3.2, 6, 1);
  trunk.translate(0, 1.6, 0);
  colorize(trunk, 0.6, 0.35, 0.18);
  parts.push(trunk);
  const lower = new THREE.ConeGeometry(2.6, 5.5, 7, 1);
  lower.translate(0, 5.2, 0);
  colorize(lower, 1, 1, 1);
  parts.push(lower);
  const upper = new THREE.ConeGeometry(1.8, 5.5, 7, 1);
  upper.translate(0, 8.9, 0);
  colorize(upper, 1, 1, 1);
  parts.push(upper);
  return mergeGeometries(parts);
}

function colorize(geo: THREE.BufferGeometry, r: number, g: number, b: number): void {
  const n = geo.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = r;
    c[i * 3 + 1] = g;
    c[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
}

/** Minimal non-indexed merge (all parts share position/normal/uv/color attributes). */
function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'uv', 'color'];
  const arrays: Record<string, number[]> = { position: [], normal: [], uv: [], color: [] };
  for (const p of parts) {
    const g = p.toNonIndexed();
    for (const name of names) {
      const attr = g.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (attr) arrays[name].push(...(attr.array as Float32Array));
    }
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(arrays.position, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normal, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(arrays.uv, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(arrays.color, 3));
  return out;
}
