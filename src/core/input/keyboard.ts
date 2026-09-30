import type { Controls } from '../../sim/wingsuit';

/** Keyboard -> control axes, with smoothing so taps are not twitchy. */
export class KeyboardInput {
  private keys = new Set<string>();
  private smoothed: Controls = { pitch: 0, roll: 0, yaw: 0, dive: 0 };
  private pressedOnce = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedOnce.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** True once per key press. */
  consume(code: string): boolean {
    const had = this.pressedOnce.has(code);
    this.pressedOnce.delete(code);
    return had;
  }

  private axis(neg: string[], pos: string[]): number {
    let v = 0;
    if (neg.some((k) => this.keys.has(k))) v -= 1;
    if (pos.some((k) => this.keys.has(k))) v += 1;
    return v;
  }

  read(dt: number): Controls {
    const raw: Controls = {
      pitch: this.axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']),
      roll: this.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']),
      yaw: this.axis(['KeyQ'], ['KeyE']),
      dive: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 1 : 0,
    };
    const k = 1 - Math.exp(-dt * 10);
    const s = this.smoothed;
    s.pitch += (raw.pitch - s.pitch) * k;
    s.roll += (raw.roll - s.roll) * k;
    s.yaw += (raw.yaw - s.yaw) * k;
    s.dive += (raw.dive - s.dive) * k;
    return { ...s };
  }
}
