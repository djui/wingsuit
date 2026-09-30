import * as THREE from 'three';
import type { TerrainManager } from './terrain/chunks';

const _normal = new THREE.Vector3();

/**
 * Wind field: base vector with time-varying gusts and direction wobble, plus
 * orographic lift where the wind blows up a slope (decays with height above
 * ground). Sampled per physics step.
 */
export class WindField {
  speed = 0;
  fromDeg = 0;
  gustiness = 0;
  private downdraft = 0;

  set(speed: number, fromDeg: number, gustiness: number, precipIntensity = 0): void {
    this.speed = speed;
    this.fromDeg = fromDeg;
    this.gustiness = gustiness;
    this.downdraft = precipIntensity * 0.6;
  }

  sample(position: THREE.Vector3, time: number, terrain: TerrainManager, target = new THREE.Vector3()): THREE.Vector3 {
    const g = this.gustiness;
    const gust = 1 + g * (0.35 * Math.sin(time * 0.6) + 0.2 * Math.sin(time * 1.7 + 1.3) + 0.12 * Math.sin(time * 4.1 + 2.1));
    const wobble = g * 12 * (0.6 * Math.sin(time * 0.35 + 0.7) + 0.4 * Math.sin(time * 1.1 + 2.9));
    const speed = Math.max(0, this.speed * gust);
    const to = THREE.MathUtils.degToRad(this.fromDeg + wobble + 180);
    target.set(Math.sin(to) * speed, 0, -Math.cos(to) * speed);

    const ground = terrain.getHeight(position.x, position.z);
    if (ground !== null && speed > 0.5) {
      const agl = Math.max(0, position.y - ground);
      terrain.getNormal(position.x, position.z, _normal);
      // Horizontal wind against the slope's horizontal normal: negative dot =
      // blowing uphill = rising air. Scale by proximity to the ground.
      const into = -(target.x * _normal.x + target.z * _normal.z);
      const k = Math.exp(-agl / 250);
      target.y += into * 1.3 * k;
    }
    target.y -= this.downdraft;
    return target;
  }
}
