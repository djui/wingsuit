/**
 * Optional Google Photorealistic 3D Tiles layer (needs the player's own
 * Google Maps Platform API key with the Map Tiles API enabled). Rendered
 * through 3d-tiles-renderer, re-oriented so the game's local frame
 * (+x east, +y up, -z north, y = metres above sea level) matches, and
 * vertically calibrated against the elevation data so physics and visuals
 * agree. Provides a ground-height raycast so buildings are solid.
 */
import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { GLTFExtensionsPlugin, GoogleCloudAuthPlugin, TileCompressionPlugin } from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { DEG, type GeoOrigin } from '../geo';

const _ray = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _hits: THREE.Intersection[] = [];

export class GoogleTiles {
  tiles: TilesRenderer | null = null;
  readonly group = new THREE.Group();
  /** Vertical shift applied so tile heights match the DEM (geoid + data differences). */
  calibration = 0;
  calibrated = false;
  attribution = '';
  error = '';
  private tint = new THREE.Color(1, 1, 1);
  private materials = new Set<THREE.MeshLambertMaterial>();
  private draco: DRACOLoader | null = null;

  constructor(
    private readonly origin: GeoOrigin,
    private readonly camera: THREE.Camera,
    private readonly renderer: THREE.WebGLRenderer,
  ) {
    this.group.name = 'google-3d-tiles';
  }

  get active(): boolean {
    return this.tiles !== null;
  }

  enable(apiKey: string): void {
    this.disable();
    this.error = '';
    const tiles = new TilesRenderer();
    this.draco = new DRACOLoader();
    this.draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
    tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: apiKey, autoRefreshToken: true }));
    tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: this.draco }));
    tiles.registerPlugin(new TileCompressionPlugin());
    tiles.setCamera(this.camera);
    tiles.setResolutionFromRenderer(this.camera, this.renderer);
    tiles.errorTarget = 12;
    tiles.lruCache.minSize = 600;
    tiles.lruCache.maxSize = 900;

    // Re-orient: ECEF -> local ENU at the origin -> game frame (north = -z).
    const enu = new THREE.Matrix4();
    tiles.ellipsoid.getEastNorthUpFrame(this.origin.lat * DEG, this.origin.lon * DEG, 0, enu);
    const toGame = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    const m = toGame.multiply(enu.invert());
    m.decompose(tiles.group.position, tiles.group.quaternion, tiles.group.scale);

    tiles.addEventListener('load-model', ({ scene }) => {
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const old = o.material as THREE.MeshStandardMaterial;
          const mat = new THREE.MeshLambertMaterial({ map: old.map ?? null, color: this.tint.clone() });
          old.dispose();
          o.material = mat;
          this.materials.add(mat);
        }
      });
    });
    tiles.addEventListener('dispose-model', ({ scene }) => {
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshLambertMaterial) {
          this.materials.delete(o.material);
          o.material.dispose();
        }
      });
    });
    tiles.addEventListener('load-error', ({ error }) => {
      this.error = error.message;
      console.warn('3D tiles', error);
    });
    this.group.add(tiles.group);
    this.tiles = tiles;
    this.calibrated = false;
    this.calibration = 0;
  }

  disable(): void {
    if (!this.tiles) return;
    this.group.remove(this.tiles.group);
    this.tiles.dispose();
    this.draco?.dispose();
    this.tiles = null;
    this.materials.clear();
    this.attribution = '';
  }

  /** Call every frame. */
  update(): void {
    if (!this.tiles) return;
    this.tiles.update();
    const attr = this.tiles.getAttributions().map((a) => String(a.value)).filter(Boolean);
    this.attribution = attr.length ? `Google · ${attr.join(', ')}` : 'Google';
  }

  /** Tint applied to tile materials (lighting comes from the scene lights too). */
  setTint(color: THREE.Color): void {
    this.tint.copy(color);
    for (const m of this.materials) m.color.copy(color);
  }

  /** Height of the tile surface at scene x/z (after calibration), or null. */
  groundHeight(x: number, z: number, from = 12000): number | null {
    if (!this.tiles) return null;
    _origin.set(x, from, z);
    _ray.set(_origin, _down);
    _ray.far = from + 1000;
    _hits.length = 0;
    _ray.intersectObject(this.tiles.group, true, _hits);
    if (_hits.length === 0) return null;
    _hits.sort((a, b) => a.distance - b.distance);
    return _hits[0].point.y;
  }

  /**
   * Shift the tiles vertically so their surface matches the DEM height at a
   * reference point. Returns true once done.
   */
  calibrate(x: number, z: number, demHeight: number): boolean {
    if (!this.tiles || this.calibrated) return this.calibrated;
    const h = this.groundHeight(x, z);
    if (h === null) return false;
    const diff = h - demHeight;
    this.group.position.y -= diff;
    this.calibration = -diff;
    this.calibrated = true;
    return true;
  }
}
