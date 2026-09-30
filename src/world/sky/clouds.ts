import * as THREE from 'three';

/**
 * Single cloud layer: a large plane at cloud base with a procedural noise
 * alpha map. Cover 0..1 raises the alpha threshold. Cheap and readable from
 * below and from above (you can fly through it).
 */
export class CloudLayer {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly texture: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private readonly noise: Float32Array;
  private readonly size = 512;
  private cover = 0;
  private drift = new THREE.Vector2();

  constructor(extent = 80000) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.noise = makeFractalNoise(this.size, 6, 1234);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.repeat.set(extent / 12000, extent / 12000);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(extent, extent), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
    this.setCover(0);
  }

  setCover(cover: number): void {
    this.cover = THREE.MathUtils.clamp(cover, 0, 1);
    this.mesh.visible = this.cover > 0.08;
    if (!this.mesh.visible) return;
    const ctx = this.canvas.getContext('2d')!;
    const img = ctx.createImageData(this.size, this.size);
    const threshold = 0.72 - 0.62 * this.cover;
    const softness = 0.18;
    for (let i = 0; i < this.noise.length; i++) {
      const n = this.noise[i];
      const a = THREE.MathUtils.smoothstep(n, threshold, threshold + softness);
      // Slight shading: denser cloud is a touch darker.
      const shade = 255 - Math.round(50 * a * a);
      img.data[i * 4] = shade;
      img.data[i * 4 + 1] = shade;
      img.data[i * 4 + 2] = shade + 4;
      img.data[i * 4 + 3] = Math.round(255 * Math.min(1, a * (0.75 + 0.25 * this.cover)));
    }
    ctx.putImageData(img, 0, 0);
    this.texture.needsUpdate = true;
  }

  /** Tint by sun colour/intensity so overcast and dusk read correctly. */
  setLight(color: THREE.Color, intensity: number): void {
    this.material.color.copy(color).multiplyScalar(THREE.MathUtils.clamp(intensity, 0.08, 1));
  }

  setAltitude(y: number): void {
    this.mesh.position.y = y;
  }

  /** Follow the player horizontally and drift with the wind. */
  update(center: THREE.Vector3, wind: THREE.Vector3, dt: number): void {
    this.mesh.position.x = center.x;
    this.mesh.position.z = center.z;
    // Texture offset in tile units: extent/repeat metres per tile.
    const metresPerTile = 12000;
    this.drift.x += (wind.x * dt) / metresPerTile;
    this.drift.y -= (wind.z * dt) / metresPerTile;
    this.texture.offset.set((center.x / metresPerTile - this.drift.x) % 1, (-center.z / metresPerTile - this.drift.y) % 1);
  }
}

/** Value noise with several octaves, tileable, values 0..1. */
function makeFractalNoise(size: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amplitude = 1;
  let total = 0;
  let cells = 4;
  let rnd = seed;
  const random = () => {
    rnd = (rnd * 1664525 + 1013904223) >>> 0;
    return rnd / 4294967296;
  };
  for (let o = 0; o < octaves; o++) {
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) grid[i] = random();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cells;
      const y0 = Math.floor(fy);
      const ty = smooth(fy - y0);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const x0 = Math.floor(fx);
        const tx = smooth(fx - x0);
        const a = grid[(y0 % cells) * cells + (x0 % cells)];
        const b = grid[(y0 % cells) * cells + ((x0 + 1) % cells)];
        const c = grid[((y0 + 1) % cells) * cells + (x0 % cells)];
        const d = grid[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
        const v = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
        out[y * size + x] += v * amplitude;
      }
    }
    total += amplitude;
    amplitude *= 0.55;
    cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
