import type { Actions, InputSource, RawInput } from './types';

/**
 * Mouse steering: cursor offset from the screen centre maps to roll (x) and
 * pitch (y) like a flight-sim joystick. Left button = dive, wheel click or
 * middle button = deploy. Disabled unless enabled from the menu.
 */
export class MouseInput implements InputSource {
  enabled = false;
  private x = 0;
  private y = 0;
  private buttons = 0;
  private deployQueued = false;

  constructor(target: HTMLElement) {
    target.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.y = (e.clientY / window.innerHeight) * 2 - 1;
    });
    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      this.buttons |= 1 << e.button;
      if (this.enabled && e.button === 1) {
        this.deployQueued = true;
        e.preventDefault();
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      this.buttons &= ~(1 << e.button);
    });
    window.addEventListener('blur', () => (this.buttons = 0));
  }

  read(): RawInput {
    if (!this.enabled) return { pitch: 0, roll: 0, yaw: 0, dive: 0, flare: 0, zoom: 0 };
    const dead = 0.06;
    const shape = (v: number) => {
      const a = Math.abs(v);
      if (a < dead) return 0;
      const s = Math.min(1, (a - dead) / (0.55 - dead));
      return Math.sign(v) * s * s;
    };
    return {
      roll: shape(this.x),
      // Mouse forward (up) = nose down, like pushing a stick.
      pitch: shape(this.y),
      yaw: 0,
      dive: this.buttons & 1 ? 1 : 0,
      flare: this.buttons & 1 ? 1 : 0,
      zoom: 0,
    };
  }

  actions(): Partial<Actions> {
    const deploy = this.deployQueued;
    this.deployQueued = false;
    return { deploy };
  }
}
