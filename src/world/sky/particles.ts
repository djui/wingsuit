import * as THREE from 'three';
import type { Precipitation } from '../environment';

const RAIN_COUNT = 2500;
const SNOW_COUNT = 2500;
const BOX = new THREE.Vector3(70, 45, 70);

/** Rain streaks and snowflakes in a box that follows the camera. */
export class Precipitation3D {
  readonly group = new THREE.Group();
  private readonly rain: THREE.LineSegments;
  private readonly snow: THREE.Points;
  private readonly rainPos: Float32Array;
  private readonly snowPos: Float32Array;
  private readonly snowPhase: Float32Array;
  private mode: Precipitation = 'none';
  private intensity = 0;

  constructor() {
    this.rainPos = new Float32Array(RAIN_COUNT * 3);
    const rainGeo = new THREE.BufferGeometry();
    const rainVerts = new Float32Array(RAIN_COUNT * 6);
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainVerts, 3));
    this.rain = new THREE.LineSegments(
      rainGeo,
      new THREE.LineBasicMaterial({ color: 0xbcc8d8, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.rain.frustumCulled = false;

    this.snowPos = new Float32Array(SNOW_COUNT * 3);
    this.snowPhase = new Float32Array(SNOW_COUNT);
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SNOW_COUNT * 3), 3));
    this.snow = new THREE.Points(
      snowGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.85, depthWrite: false, map: flakeTexture() }),
    );
    this.snow.frustumCulled = false;

    for (let i = 0; i < RAIN_COUNT; i++) this.scatter(this.rainPos, i);
    for (let i = 0; i < SNOW_COUNT; i++) {
      this.scatter(this.snowPos, i);
      this.snowPhase[i] = Math.random() * Math.PI * 2;
    }
    this.group.add(this.rain, this.snow);
    this.set('none', 0);
  }

  private scatter(arr: Float32Array, i: number): void {
    arr[i * 3] = (Math.random() - 0.5) * BOX.x;
    arr[i * 3 + 1] = (Math.random() - 0.5) * BOX.y;
    arr[i * 3 + 2] = (Math.random() - 0.5) * BOX.z;
  }

  set(mode: Precipitation, intensity: number): void {
    this.mode = mode;
    this.intensity = intensity;
    this.rain.visible = mode === 'rain' && intensity > 0;
    this.snow.visible = mode === 'snow' && intensity > 0;
  }

  update(camera: THREE.Vector3, wind: THREE.Vector3, dt: number, time: number): void {
    if (this.mode === 'none') return;
    this.group.position.copy(camera);
    const count = Math.floor((this.mode === 'rain' ? RAIN_COUNT : SNOW_COUNT) * this.intensity);
    if (this.mode === 'rain') {
      const verts = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = verts.array as Float32Array;
      const vy = -9;
      for (let i = 0; i < RAIN_COUNT; i++) {
        const p = this.rainPos;
        p[i * 3] += wind.x * dt;
        p[i * 3 + 1] += vy * dt;
        p[i * 3 + 2] += wind.z * dt;
        this.wrap(p, i);
        const visible = i < count;
        const x = p[i * 3];
        const y = p[i * 3 + 1];
        const z = p[i * 3 + 2];
        arr[i * 6] = x;
        arr[i * 6 + 1] = visible ? y : 1e6;
        arr[i * 6 + 2] = z;
        arr[i * 6 + 3] = x - wind.x * 0.04;
        arr[i * 6 + 4] = visible ? y - vy * 0.04 : 1e6;
        arr[i * 6 + 5] = z - wind.z * 0.04;
      }
      verts.needsUpdate = true;
    } else {
      const verts = this.snow.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = verts.array as Float32Array;
      for (let i = 0; i < SNOW_COUNT; i++) {
        const p = this.snowPos;
        const ph = this.snowPhase[i];
        p[i * 3] += (wind.x + 0.6 * Math.sin(time * 1.3 + ph)) * dt;
        p[i * 3 + 1] += -1.4 * dt;
        p[i * 3 + 2] += (wind.z + 0.6 * Math.cos(time * 1.1 + ph)) * dt;
        this.wrap(p, i);
        arr[i * 3] = p[i * 3];
        arr[i * 3 + 1] = i < count ? p[i * 3 + 1] : 1e6;
        arr[i * 3 + 2] = p[i * 3 + 2];
      }
      verts.needsUpdate = true;
    }
  }

  private wrap(p: Float32Array, i: number): void {
    const hx = BOX.x / 2;
    const hy = BOX.y / 2;
    const hz = BOX.z / 2;
    if (p[i * 3] > hx) p[i * 3] -= BOX.x;
    else if (p[i * 3] < -hx) p[i * 3] += BOX.x;
    if (p[i * 3 + 1] < -hy) p[i * 3 + 1] += BOX.y;
    else if (p[i * 3 + 1] > hy) p[i * 3 + 1] -= BOX.y;
    if (p[i * 3 + 2] > hz) p[i * 3 + 2] -= BOX.z;
    else if (p[i * 3 + 2] < -hz) p[i * 3 + 2] += BOX.z;
  }
}

function flakeTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
