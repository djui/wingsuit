import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { EnvironmentState } from '../environment';

const _dir = new THREE.Vector3();

function directionFrom(elevationDeg: number, azimuthDeg: number, target: THREE.Vector3): THREE.Vector3 {
  const el = THREE.MathUtils.degToRad(elevationDeg);
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  // Scene: +x east, -z north. Azimuth measured clockwise from north.
  return target.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
}

export interface SkyOutput {
  /** Overall exposure for the renderer's tone mapping. */
  exposure: number;
  /** Fog colour matching the horizon. */
  fogColor: THREE.Color;
  /** 0 = deep night, 1 = full day. */
  daylight: number;
  /** Sun light colour for tinting clouds etc. */
  sunColor: THREE.Color;
  sunIntensity: number;
}

/** Sky dome, sun, moon, stars and the lights that go with them. */
export class SkyDome {
  readonly sky = new Sky();
  readonly sun = new THREE.DirectionalLight(0xffffff, 2.5);
  readonly moon = new THREE.DirectionalLight(0x9fb4ff, 0);
  readonly hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a4030, 0.6);
  readonly stars: THREE.Points;
  readonly moonDisc: THREE.Mesh;
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  readonly moonDir = new THREE.Vector3(0, 1, 0);
  readonly output: SkyOutput = {
    exposure: 0.55,
    fogColor: new THREE.Color(0xc8d6e6),
    daylight: 1,
    sunColor: new THREE.Color(0xffffff),
    sunIntensity: 1,
  };

  constructor(scene: THREE.Scene) {
    this.sky.scale.setScalar(450000);
    scene.add(this.sky, this.sun, this.moon, this.hemi);

    // Stars: random points on a sphere, rendered without size attenuation.
    const n = 2500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = 100000;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(phi));
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }),
    );
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.moonDisc = new THREE.Mesh(
      new THREE.SphereGeometry(900, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xf4f1e6, fog: false, transparent: true, opacity: 0 }),
    );
    scene.add(this.moonDisc);
  }

  apply(env: EnvironmentState): void {
    directionFrom(env.sunElevation, env.sunAzimuth, this.sunDir);
    directionFrom(env.moonElevation, env.moonAzimuth, this.moonDir);
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    const cloud = env.cloudCover;
    u.turbidity.value = 3 + 9 * cloud;
    u.rayleigh.value = 1.5 + 1.5 * cloud;
    u.mieCoefficient.value = 0.004 + 0.012 * cloud;
    u.mieDirectionalG.value = 0.8;

    // Daylight factor from sun elevation: full above 10°, zero below -8°.
    const daylight = THREE.MathUtils.smoothstep(env.sunElevation, -8, 10);
    const sunUp = THREE.MathUtils.smoothstep(env.sunElevation, -2, 6);
    const low = 1 - THREE.MathUtils.smoothstep(env.sunElevation, 2, 25); // reddening near the horizon
    const sunColor = new THREE.Color().setHSL(0.09 - 0.03 * low, 0.55 * low + 0.1, 0.72 - 0.15 * low);
    const cloudDim = 1 - 0.85 * cloud;
    this.sun.color.copy(sunColor);
    this.sun.intensity = 2.8 * sunUp * cloudDim;
    this.hemi.intensity = 0.55 + 0.25 * daylight * (1 - 0.4 * cloud);
    this.hemi.color.setHSL(0.62, 0.5, 0.5 + 0.3 * daylight * (1 - 0.5 * cloud));
    this.hemi.groundColor.setHSL(0.1, 0.3, 0.12 + 0.18 * daylight);

    // Moon: only matters at night, scaled by phase.
    const moonUp = THREE.MathUtils.smoothstep(env.moonElevation, -2, 8);
    const night = 1 - daylight;
    this.moon.intensity = 0.6 * moonUp * env.moonFraction * night * (1 - 0.8 * cloud);
    (this.moonDisc.material as THREE.MeshBasicMaterial).opacity = moonUp * (0.4 + 0.6 * night) * (1 - 0.9 * cloud);
    (this.stars.material as THREE.PointsMaterial).opacity = night * (1 - cloud) * 0.9;

    // Exposure and fog colour.
    const exposure = 0.3 + 0.25 * daylight;
    const dayFog = new THREE.Color(0xc8d6e6).lerp(new THREE.Color(0x9aa4ae), cloud);
    const duskFog = new THREE.Color(0x6b5a6e).lerp(new THREE.Color(0x4a4a52), cloud);
    const nightFog = new THREE.Color(0x070a12);
    const fog = nightFog.clone().lerp(duskFog, THREE.MathUtils.smoothstep(env.sunElevation, -10, -2)).lerp(dayFog, sunUp);
    this.output.exposure = exposure;
    this.output.fogColor.copy(fog);
    this.output.daylight = daylight;
    this.output.sunColor.copy(sunColor);
    this.output.sunIntensity = sunUp * cloudDim;
  }

  /** Keep lights and sky bodies centred on the player. */
  follow(p: THREE.Vector3): void {
    this.sun.position.copy(p).addScaledVector(this.sunDir, 10000);
    this.sun.target.position.copy(p);
    this.sun.target.updateMatrixWorld();
    this.moon.position.copy(p).addScaledVector(this.moonDir, 10000);
    this.moon.target.position.copy(p);
    this.moon.target.updateMatrixWorld();
    this.stars.position.copy(p);
    this.moonDisc.position.copy(p).addScaledVector(this.moonDir, 90000);
    _dir.copy(p);
  }
}
