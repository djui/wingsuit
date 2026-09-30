import * as THREE from 'three';
import type { FlyerBody } from '../sim/wingsuit';

export type CameraMode = 'chase' | 'first';

const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _target = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Chase camera with lag and mouse-drag orbit; first-person helmet cam. */
export class CameraRig {
  mode: CameraMode = 'chase';
  private orbitYaw = 0;
  private orbitPitch = 0.18;
  private dragging = false;
  private returnTimer = 0;
  private initialised = false;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    canvas: HTMLElement,
  ) {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerup', () => {
      this.dragging = false;
      this.returnTimer = 2.5;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.orbitYaw -= e.movementX * 0.005;
      this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + e.movementY * 0.005, -0.6, 1.2);
    });
  }

  toggle(): void {
    this.mode = this.mode === 'chase' ? 'first' : 'chase';
    this.initialised = false;
  }

  reset(): void {
    this.initialised = false;
    this.orbitYaw = 0;
    this.orbitPitch = 0.18;
  }

  /**
   * @param canopy 0..1 openness; the chase camera backs off so the canopy
   * does not fill the frame.
   */
  update(body: FlyerBody, dt: number, canopy = 0): void {
    const cam = this.camera;
    body.forward(_fwd);
    _up.set(0, 1, 0).applyQuaternion(body.quaternion);
    const speed = body.velocity.length();

    if (this.mode === 'first') {
      cam.position.copy(body.position).addScaledVector(_fwd, 0.55).addScaledVector(_up, 0.12);
      cam.quaternion.copy(body.quaternion);
      cam.fov = 75 + Math.min(20, speed * 0.15);
      cam.updateProjectionMatrix();
      return;
    }

    // Auto-return the orbit to behind the flyer after a drag.
    if (!this.dragging) {
      if (this.returnTimer > 0) this.returnTimer -= dt;
      else {
        const k = 1 - Math.exp(-dt * 2);
        this.orbitYaw += (0 - this.orbitYaw) * k;
        this.orbitPitch += (0.18 - this.orbitPitch) * k;
      }
    }

    // Camera sits behind the velocity direction (feels right when diving/turning)
    const dir = speed > 3 ? _target.copy(body.velocity).normalize() : _target.copy(_fwd);
    _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.orbitYaw);
    dir.applyQuaternion(_q);
    const dist = 7.5 + 10 * canopy;
    _desired
      .copy(body.position)
      .addScaledVector(dir, -dist * Math.cos(this.orbitPitch))
      .add(new THREE.Vector3(0, dist * Math.sin(this.orbitPitch) + 1.0 + 3 * canopy, 0));

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
}
