/**
 * Wingsuit flight model. SI units. Body frame: +x right, +y up, -z forward.
 * Lift/drag from angle of attack and airspeed, quadratic drag polar with
 * stall, sideforce from sideslip, weathervane stability, rate-based control.
 */
import * as THREE from 'three';

export interface Controls {
  /** -1 nose down .. +1 nose up */
  pitch: number;
  /** -1 roll left .. +1 roll right */
  roll: number;
  /** -1 yaw left .. +1 yaw right */
  yaw: number;
  /** 0 full wing .. 1 collapsed (dive) */
  dive: number;
}

export const G = 9.80665;

export interface AeroConfig {
  mass: number;
  area: number;
  cl0: number;
  clAlpha: number;
  alphaStall: number;
  alphaTrim: number;
  cd0: number;
  kInduced: number;
  cyBeta: number;
  pitchRate: number;
  rollRate: number;
  yawRate: number;
}

export const WINGSUIT: AeroConfig = {
  mass: 90,
  area: 1.2,
  cl0: 0.2,
  clAlpha: 2.8,
  alphaStall: THREE.MathUtils.degToRad(16),
  alphaTrim: THREE.MathUtils.degToRad(11),
  cd0: 0.1,
  kInduced: 0.3,
  cyBeta: 0.6,
  pitchRate: 1.4,
  rollRate: 1.6,
  yawRate: 0.8,
};

/** ISA air density (kg/m³) vs altitude (m). */
export function airDensity(altitude: number): number {
  const T0 = 288.15;
  const L = 0.0065;
  const p0 = 101325;
  const R = 287.05;
  const T = T0 - L * altitude;
  const p = p0 * Math.pow(T / T0, G / (R * L));
  return p / (R * T);
}

export interface AeroState {
  airspeed: number;
  alpha: number;
  beta: number;
  cl: number;
  cd: number;
  stalled: boolean;
  gForce: number;
}

const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();
const _qInv = new THREE.Quaternion();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _liftDir = new THREE.Vector3();
const _sideDir = new THREE.Vector3();
const _force = new THREE.Vector3();
const _dq = new THREE.Quaternion();
const _euler = new THREE.Euler();

export class FlyerBody {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  /** Body-frame angular rates (rad/s): x = pitch, y = yaw, z = roll. */
  readonly rates = new THREE.Vector3();
  readonly aero: AeroState = { airspeed: 0, alpha: 0, beta: 0, cl: 0, cd: 0, stalled: false, gForce: 1 };
  config: AeroConfig = WINGSUIT;

  /** Place at position with a compass heading (deg) and pitch (deg, + nose up). */
  reset(position: THREE.Vector3, headingDeg: number, pitchDeg: number, speed: number): void {
    this.position.copy(position);
    const yaw = -THREE.MathUtils.degToRad(headingDeg);
    _euler.set(THREE.MathUtils.degToRad(pitchDeg), yaw, 0, 'YXZ');
    this.quaternion.setFromEuler(_euler);
    this.velocity.set(0, 0, -speed).applyQuaternion(this.quaternion);
    this.rates.set(0, 0, 0);
  }

  forward(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(0, 0, -1).applyQuaternion(this.quaternion);
  }

  step(dt: number, controls: Controls, wind: THREE.Vector3): void {
    const c = this.config;
    // Relative airflow (velocity through the air mass)
    _va.copy(this.velocity).sub(wind);
    const V = _va.length();
    _qInv.copy(this.quaternion).invert();
    _vb.copy(_va).applyQuaternion(_qInv);
    const u = -_vb.z; // forward
    const w = _vb.y; // up
    const s = _vb.x; // right
    const alpha = V > 1 ? Math.atan2(-w, Math.max(u, 0.1)) : 0;
    const beta = V > 1 ? Math.atan2(s, Math.max(u, 0.1)) : 0;

    // Coefficients
    const wingFactor = 1 - 0.6 * controls.dive;
    const areaFactor = 1 - 0.5 * controls.dive;
    let cl = (c.cl0 + c.clAlpha * alpha) * wingFactor;
    let cd = c.cd0 + c.kInduced * cl * cl + 0.3 * controls.dive;
    let stalled = false;
    if (alpha > c.alphaStall) {
      stalled = true;
      // Blend from the attached-flow polar into a flat-plate model
      // (normal force ~ 1.4 sin(alpha)) over ~10 degrees past the stall.
      const clMax = (c.cl0 + c.clAlpha * c.alphaStall) * wingFactor;
      const cn = 1.4 * Math.sin(alpha) * (0.6 + 0.4 * wingFactor);
      const blend = THREE.MathUtils.clamp((alpha - c.alphaStall) / 0.17, 0, 1);
      cl = clMax * (1 - blend) + cn * Math.cos(alpha) * blend;
      const cdStall = c.cd0 + c.kInduced * clMax * clMax;
      cd = cdStall * (1 - blend) + (c.cd0 + cn * Math.sin(alpha)) * blend + 0.3 * controls.dive;
    } else if (alpha < -c.alphaStall * 0.5) {
      // Negative AoA: the suit cannot generate much downforce.
      cl = Math.max(-0.3, cl);
      cd += 0.5 * (1 - Math.cos(alpha));
    }
    const cy = -c.cyBeta * beta;

    const rho = airDensity(this.position.y);
    const q = 0.5 * rho * V * V * c.area * areaFactor;

    _up.set(0, 1, 0).applyQuaternion(this.quaternion);
    _right.set(1, 0, 0).applyQuaternion(this.quaternion);
    _force.set(0, -c.mass * G, 0);
    if (V > 0.5) {
      const vHat = _va.clone().divideScalar(V);
      // Lift: perpendicular to airflow, in the plane of airflow and body up.
      _liftDir.copy(_up).addScaledVector(vHat, -_up.dot(vHat));
      if (_liftDir.lengthSq() > 1e-6) _liftDir.normalize();
      _sideDir.copy(_right).addScaledVector(vHat, -_right.dot(vHat));
      if (_sideDir.lengthSq() > 1e-6) _sideDir.normalize();
      _force.addScaledVector(_liftDir, q * cl);
      _force.addScaledVector(_sideDir, q * cy);
      _force.addScaledVector(vHat, -q * cd);
    }
    // Integrate translation (semi-implicit Euler)
    const ax = _force.x / c.mass;
    const ay = _force.y / c.mass;
    const az = _force.z / c.mass;
    this.velocity.x += ax * dt;
    this.velocity.y += ay * dt;
    this.velocity.z += az * dt;
    this.position.addScaledVector(this.velocity, dt);

    // Rotation: rate control blended with aerodynamic stability.
    const airFactor = Math.min(1, (V * V) / (35 * 35));
    const targetPitch = controls.pitch * c.pitchRate + THREE.MathUtils.clamp((c.alphaTrim - alpha) * 3.0, -2.5, 2.5) * airFactor;
    const targetYaw = -controls.yaw * c.yawRate + THREE.MathUtils.clamp(-beta * 3.0, -2, 2) * airFactor;
    // Positive rotation about body +z lifts the right wing (roll left), so
    // roll-right input is a negative rate. Pendulum/dihedral stability: body
    // right.y is the sine of the bank angle (negative when banked right), and
    // levelling from a right bank needs a positive (roll-left) rate.
    const targetRoll = -controls.roll * c.rollRate - 1.2 * _right.y * airFactor;
    const k = 1 - Math.exp(-dt * 6);
    this.rates.x += (targetPitch - this.rates.x) * k;
    this.rates.y += (targetYaw - this.rates.y) * k;
    this.rates.z += (targetRoll - this.rates.z) * k;
    // Mild roll damping so the flyer does not spin forever without input.
    if (Math.abs(controls.roll) < 0.05) this.rates.z *= Math.exp(-dt * 2.5);

    _euler.set(this.rates.x * dt, this.rates.y * dt, this.rates.z * dt, 'XYZ');
    _dq.setFromEuler(_euler);
    this.quaternion.multiply(_dq).normalize();

    // Telemetry
    const a = this.aero;
    a.airspeed = V;
    a.alpha = alpha;
    a.beta = beta;
    a.cl = cl;
    a.cd = cd;
    a.stalled = stalled;
    a.gForce = Math.hypot(ax, ay + G, az) / G;
  }
}
