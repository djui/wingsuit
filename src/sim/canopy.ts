/**
 * Parachute model: deployment sequence and canopy aerodynamics. The canopy
 * produces a world-frame force that the FlyerBody integrates alongside the
 * (fading) wingsuit forces, and owns heading/bank while open.
 */
import * as THREE from 'three';
import { airDensity, FlyerBody, G } from './wingsuit';

export type CanopyPhase = 'stowed' | 'deploying' | 'open';

export interface CanopyControls {
  /** Left toggle 0..1 */
  left: number;
  /** Right toggle 0..1 */
  right: number;
}

export interface CanopyConfig {
  area: number;
  /** Angle of attack the canopy seeks (rad); pendulum pitch stability drives it there. */
  alphaTrim: number;
  /** Pitch response rate toward trim (1/s). */
  pitchGain: number;
  /** Immediate lift increase at full brakes (trailing-edge deflection). */
  clBrake: number;
  cl0: number;
  clAlpha: number;
  alphaStall: number;
  cd0: number;
  kInduced: number;
  cdBrake: number;
  cdTurn: number;
  /** Drag of the partially inflated canopy during opening. */
  cdInflate: number;
  /** Seconds from pitch to fully open. */
  openTime: number;
  /** Direct yaw rate at full toggle differential (rad/s). */
  yawRate: number;
  /** Bank at full toggle differential (rad). */
  bankMax: number;
  /** Opening shock (g) above which the canopy malfunctions. */
  hardOpeningG: number;
}

/** ~24 m² seven-cell BASE canopy. */
export const BASE_CANOPY: CanopyConfig = {
  area: 24,
  alphaTrim: THREE.MathUtils.degToRad(8),
  pitchGain: 2.5,
  clBrake: 0.75,
  cl0: 0.3,
  clAlpha: 3.0,
  alphaStall: THREE.MathUtils.degToRad(18),
  cd0: 0.18,
  kInduced: 0.15,
  cdBrake: 0.35,
  cdTurn: 0.15,
  cdInflate: 0.8,
  openTime: 3.0,
  yawRate: 0.5,
  bankMax: THREE.MathUtils.degToRad(25),
  hardOpeningG: 7,
};

const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();
const _qInv = new THREE.Quaternion();
const _vHat = new THREE.Vector3();
const _up = new THREE.Vector3();
const _liftDir = new THREE.Vector3();
const _euler = new THREE.Euler();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class CanopySystem {
  phase: CanopyPhase = 'stowed';
  /** 0 = stowed, 1 = fully inflated. */
  openness = 0;
  /** Compass heading in radians (0 = north, clockwise). */
  heading = 0;
  /** Bank in radians, positive = right. */
  bank = 0;
  brake = 0;
  /** Chord pitch relative to the horizon (rad, negative = nose down). */
  pitch = 0;
  alpha = 0;
  stalled = false;
  peakOpeningG = 0;
  deployAltitude = 0;
  deploySpeed = 0;
  readonly force = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  private deployTime = 0;
  config: CanopyConfig = BASE_CANOPY;

  reset(): void {
    this.phase = 'stowed';
    this.openness = 0;
    this.bank = 0;
    this.brake = 0;
    this.pitch = 0;
    this.peakOpeningG = 0;
    this.deployTime = 0;
    this.force.set(0, 0, 0);
  }

  /** Pull the pilot chute. Returns false if already deployed. */
  deploy(body: FlyerBody): boolean {
    if (this.phase !== 'stowed') return false;
    this.phase = 'deploying';
    this.deployTime = 0;
    this.deployAltitude = body.position.y;
    this.deploySpeed = body.velocity.length();
    const fwd = body.forward();
    this.heading = Math.atan2(fwd.x, -fwd.z);
    this.bank = 0;
    // Start aligned with the flight path so the canopy trails in the airflow.
    this.pitch = Math.asin(THREE.MathUtils.clamp(body.velocity.clone().normalize().y, -1, 1)) + this.config.alphaTrim;
    return true;
  }

  /**
   * Advances the canopy and fills `force` (world N) for this step. Call before
   * body.step and pass `force` as extraForce with aeroScale = 1 - openness.
   * Returns true if a hard opening destroyed the canopy.
   */
  step(dt: number, body: FlyerBody, controls: CanopyControls, wind: THREE.Vector3): boolean {
    const c = this.config;
    this.force.set(0, 0, 0);
    if (this.phase === 'stowed') return false;

    if (this.phase === 'deploying') {
      this.deployTime += dt;
      const t = THREE.MathUtils.clamp(this.deployTime / c.openTime, 0, 1);
      // Snivel then snap: slow start, fast finish.
      this.openness = t * t * (3 - 2 * t);
      if (t >= 1) {
        this.phase = 'open';
        this.openness = 1;
      }
    }

    const left = THREE.MathUtils.clamp(controls.left, 0, 1);
    const right = THREE.MathUtils.clamp(controls.right, 0, 1);
    this.brake = Math.min(left, right);
    const turn = right - left;

    // Toggles only work once the canopy is mostly open.
    const authority = THREE.MathUtils.clamp((this.openness - 0.6) / 0.4, 0, 1);
    const targetBank = turn * c.bankMax * authority;
    this.bank += (targetBank - this.bank) * (1 - Math.exp(-dt * 3));

    _va.copy(body.velocity).sub(wind);
    const V = _va.length();

    // Heading: direct toggle yaw plus the coordinated turn from the bank.
    const coordinated = V > 1 ? (G * Math.tan(this.bank)) / Math.max(V, 4) : 0;
    this.heading += (turn * c.yawRate * authority * 0.4 + coordinated) * dt;

    // Canopy orientation: yaw, then pitch, then bank (right bank = -z rotation).
    _euler.set(this.pitch, -this.heading, -this.bank, 'YXZ');
    this.quaternion.setFromEuler(_euler);

    if (V > 0.5) {
      _vHat.copy(_va).divideScalar(V);
      _qInv.copy(this.quaternion).invert();
      _vb.copy(_va).applyQuaternion(_qInv);
      const alpha = Math.atan2(-_vb.y, Math.max(-_vb.z, 0.1));
      this.alpha = alpha;
      // Pendulum pitch stability: the suspended pilot swings the canopy back
      // toward its trim angle of attack (nose down in a stall, up in a dive).
      const pitchRate = THREE.MathUtils.clamp((c.alphaTrim - alpha) * c.pitchGain, -1.5, 1.5);
      this.pitch = THREE.MathUtils.clamp(this.pitch + pitchRate * dt, -1.2, 0.45);
      let cl = c.cl0 + c.clAlpha * alpha + c.clBrake * this.brake;
      let cd = c.cd0 + c.kInduced * cl * cl;
      this.stalled = alpha > c.alphaStall;
      if (this.stalled) {
        const clMax = c.cl0 + c.clAlpha * c.alphaStall;
        const cn = 1.4 * Math.sin(alpha);
        const blend = THREE.MathUtils.clamp((alpha - c.alphaStall) / 0.2, 0, 1);
        cl = clMax * (1 - blend) + cn * Math.cos(alpha) * blend;
        cd = (c.cd0 + c.kInduced * clMax * clMax) * (1 - blend) + (c.cd0 + cn * Math.sin(alpha)) * blend;
      } else if (alpha < 0) {
        cl = Math.max(-0.3, cl);
        cd += 0.6 * (1 - Math.cos(alpha));
      }
      cd += c.cdBrake * this.brake + c.cdTurn * Math.abs(turn) + c.cdInflate * (1 - this.openness);
      _up.set(0, 1, 0).applyQuaternion(this.quaternion);
      _liftDir.copy(_up).addScaledVector(_vHat, -_up.dot(_vHat));
      if (_liftDir.lengthSq() > 1e-6) _liftDir.normalize();
      const q = 0.5 * airDensity(body.position.y) * V * V * c.area * this.openness;
      // Lift needs a formed wing: scale by openness again. Drag comes first.
      this.force.addScaledVector(_liftDir, q * cl * this.openness).addScaledVector(_vHat, -q * cd);
      // Air-relative heading pulls the canopy into the relative wind a little
      // (keeps the canopy from flying sideways after opening in a turn).
      const airHdg = Math.atan2(_vHat.x, -_vHat.z);
      let diff = airHdg - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (this.phase === 'deploying') this.heading += diff * (1 - Math.exp(-dt * 2));
    }

    if (this.phase === 'deploying') {
      const g = this.force.length() / (body.config.mass * G);
      if (g > this.peakOpeningG) this.peakOpeningG = g;
      if (g > c.hardOpeningG) return true;
    }
    return false;
  }

  /** Rotates a vector by the canopy yaw only (helper for HUD arrows). */
  headingAxis(target = _axis): THREE.Vector3 {
    _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.heading);
    return target.set(0, 0, -1).applyQuaternion(_q);
  }
}
