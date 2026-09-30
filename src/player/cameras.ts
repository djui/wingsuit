import * as THREE from 'three';
import type { FlyerBody } from '../sim/wingsuit';
import type { TerrainManager } from '../world/terrain/chunks';

export type CameraMode = 'chase' | 'first' | 'cinematic';
const MODES: CameraMode[] = ['chase', 'first', 'cinematic'];

const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _target = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _headQ = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _shake = new THREE.Vector3();

/**
 * Chase camera with lag and drag-to-orbit, first-person helmet cam with
 * head-look and wind shake, and a cinematic ground camera that tracks the
 * flyer with a long lens and hops ahead along the flight path.
 */
export class CameraRig {
  mode: CameraMode = 'chase';
  /** When true the left mouse button steers, so orbit/look uses the right button. */
  mouseSteering = false;
  private orbitYaw = 0;
  private orbitPitch = 0.18;
  private lookYaw = 0;
  private lookPitch = 0;
  private dragging = false;
  private returnTimer = 0;
  private initialised = false;
  private cinePos = new THREE.Vector3();
  /** Chase distance in metres (wheel / zoom axis). */
  chaseDistance = 7.5;
  private cineValid = false;
  private shakeTime = 0;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    canvas: HTMLElement,
  ) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener(
      'wheel',
      (e) => {
        // Ignore wheel over the menu card so its lists can scroll.
        if ((e.target as HTMLElement | null)?.closest('#menu')) return;
        e.preventDefault();
        this.zoomBy(Math.sign(e.deltaY) * 0.12);
      },
      { passive: false },
    );
    try {
      const saved = Number(localStorage.getItem('wingsuit.zoom'));
      if (saved > 0) this.chaseDistance = saved;
    } catch {
      /* ignore */
    }
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      const orbitButton = this.mouseSteering ? 2 : 0;
      if (e.button !== orbitButton) return;
      this.dragging = true;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerup', () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.returnTimer = 2.5;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      if (this.mode === 'first') {
        this.lookYaw = THREE.MathUtils.clamp(this.lookYaw - e.movementX * 0.004, -1.6, 1.6);
        this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - e.movementY * 0.004, -1.0, 1.0);
      } else {
        this.orbitYaw -= e.movementX * 0.005;
        this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + e.movementY * 0.005, -0.6, 1.2);
      }
    });
  }

  /** Multiplicative zoom: positive = further away. */
  zoomBy(amount: number): void {
    this.chaseDistance = THREE.MathUtils.clamp(this.chaseDistance * Math.exp(amount), 2.5, 60);
    try {
      localStorage.setItem('wingsuit.zoom', this.chaseDistance.toFixed(2));
    } catch {
      /* ignore */
    }
  }

  toggle(): void {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    this.initialised = false;
    this.cineValid = false;
  }

  reset(): void {
    this.initialised = false;
    this.cineValid = false;
    this.orbitYaw = 0;
    this.orbitPitch = 0.18;
    this.lookYaw = 0;
    this.lookPitch = 0;
  }

  /**
   * @param canopy 0..1 openness; the chase camera backs off so the canopy
   * does not fill the frame.
   */
  update(body: FlyerBody, dt: number, canopy = 0, terrain?: TerrainManager): void {
    const cam = this.camera;
    body.forward(_fwd);
    _up.set(0, 1, 0).applyQuaternion(body.quaternion);
    const speed = body.velocity.length();
    this.shakeTime += dt;

    // Auto-return look/orbit after a drag.
    if (!this.dragging) {
      if (this.returnTimer > 0) this.returnTimer -= dt;
      else {
        const k = 1 - Math.exp(-dt * 2);
        this.orbitYaw += (0 - this.orbitYaw) * k;
        this.orbitPitch += (0.18 - this.orbitPitch) * k;
        this.lookYaw += (0 - this.lookYaw) * k;
        this.lookPitch += (0 - this.lookPitch) * k;
      }
    }

    if (this.mode === 'first') {
      cam.position.copy(body.position).addScaledVector(_fwd, 0.55).addScaledVector(_up, 0.12 + 0.3 * canopy);
      _euler.set(this.lookPitch, this.lookYaw, 0, 'YXZ');
      _headQ.setFromEuler(_euler);
      cam.quaternion.copy(body.quaternion).multiply(_headQ);
      // Wind buffet: small rotational shake growing with airspeed.
      const amp = 0.0025 * Math.min(1, (speed * speed) / (60 * 60)) * (1 - 0.7 * canopy);
      _shake.set(
        Math.sin(this.shakeTime * 23.1) + 0.5 * Math.sin(this.shakeTime * 47.3),
        Math.sin(this.shakeTime * 19.7 + 1) + 0.5 * Math.sin(this.shakeTime * 41.1),
        Math.sin(this.shakeTime * 13.3 + 2),
      ).multiplyScalar(amp);
      _euler.set(_shake.x, _shake.y, _shake.z, 'XYZ');
      cam.quaternion.multiply(_q.setFromEuler(_euler));
      cam.fov = 78 + Math.min(18, speed * 0.14);
      cam.updateProjectionMatrix();
      return;
    }

    if (this.mode === 'cinematic') {
      this.updateCinematic(body, speed, terrain);
      return;
    }

    // Chase: camera sits behind the velocity direction (feels right when diving/turning)
    const dir = speed > 3 ? _target.copy(body.velocity).normalize() : _target.copy(_fwd);
    _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.orbitYaw);
    dir.applyQuaternion(_q);
    const dist = this.chaseDistance * (1 + 1.3 * canopy);
    _desired
      .copy(body.position)
      .addScaledVector(dir, -dist * Math.cos(this.orbitPitch))
      .add(new THREE.Vector3(0, dist * Math.sin(this.orbitPitch) + 0.13 * dist + 3 * canopy, 0));

    if (!this.initialised) {
      cam.position.copy(_desired);
      this.initialised = true;
    } else {
      const k = 1 - Math.exp(-dt * 8);
      cam.position.lerp(_desired, k);
    }
    _look.copy(body.position).addScaledVector(dir, 6).add(new THREE.Vector3(0, 2.5 * canopy, 0));
    cam.up.set(0, 1, 0);
    cam.lookAt(_look);
    cam.fov = 65 + Math.min(15, speed * 0.1);
    cam.updateProjectionMatrix();
  }

  private updateCinematic(body: FlyerBody, speed: number, terrain?: TerrainManager): void {
    const cam = this.camera;
    const dist = this.cineValid ? cam.position.distanceTo(body.position) : Infinity;
    const passed = this.cineValid && body.velocity.dot(_target.copy(body.position).sub(this.cinePos)) > 0 && dist > 250;
    if (!this.cineValid || dist > 1800 || passed) {
      // Hop to a spot ahead of the flyer, off to one side, on the ground.
      const ahead = speed > 3 ? _target.copy(body.velocity).normalize() : body.forward(_target);
      const side = new THREE.Vector3(-ahead.z, 0, ahead.x).normalize().multiplyScalar((Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * 200));
      const range = 250 + Math.min(500, speed * 6);
      this.cinePos.copy(body.position).addScaledVector(ahead, range).add(side.multiplyScalar(0.5));
      const ground = terrain?.getHeight(this.cinePos.x, this.cinePos.z);
      // Ground camera when the terrain is near the flight path, otherwise an air cam.
      const groundY = ground !== null && ground !== undefined ? ground + 2 : -Infinity;
      this.cinePos.y = groundY > body.position.y - 350 ? groundY : body.position.y - 60 + Math.random() * 120;
      this.cineValid = true;
      cam.position.copy(this.cinePos);
    }
    cam.up.set(0, 1, 0);
    cam.lookAt(body.position);
    // Long lens: keep the flyer a similar size on screen.
    const d = cam.position.distanceTo(body.position);
    cam.fov = THREE.MathUtils.clamp(1500 / Math.max(d, 30), 3, 60);
    cam.updateProjectionMatrix();
  }
}
