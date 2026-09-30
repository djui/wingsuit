import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export interface SkySettings {
  /** Sun elevation above horizon in degrees. */
  elevation: number;
  /** Sun azimuth in degrees, 0 = north, 90 = east. */
  azimuth: number;
}

/** Sky dome + sun light + hemisphere fill. Phase 1: fixed afternoon preset. */
export class SkyDome {
  readonly sky = new Sky();
  readonly sun = new THREE.DirectionalLight(0xffffff, 2.5);
  readonly hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a4030, 0.6);
  readonly sunDir = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.sky.scale.setScalar(450000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    scene.add(this.sky, this.sun, this.hemi);
    this.set({ elevation: 38, azimuth: 215 });
  }

  set(s: SkySettings): void {
    const el = THREE.MathUtils.degToRad(s.elevation);
    const az = THREE.MathUtils.degToRad(s.azimuth);
    // Scene: +x east, -z north. Azimuth measured clockwise from north.
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    this.sun.position.copy(this.sunDir).multiplyScalar(10000);
    this.sun.target.position.set(0, 0, 0);
    this.sun.target.updateMatrixWorld();
  }

  /** Keep the sun light centred on the player so shadows/lighting stay local. */
  follow(p: THREE.Vector3): void {
    this.sun.position.copy(p).addScaledVector(this.sunDir, 10000);
    this.sun.target.position.copy(p);
    this.sun.target.updateMatrixWorld();
  }
}
