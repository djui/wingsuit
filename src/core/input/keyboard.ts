import type { Controls } from '../../sim/wingsuit';
import type { Actions, InputSource } from './types';

/** Keyboard axes and one-shot actions. */
export class KeyboardInput implements InputSource {
  private keys = new Set<string>();
  private pressedOnce = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
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

  private consume(code: string): boolean {
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

  read(): Controls & { flare: number } {
    return {
      pitch: this.axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']),
      roll: this.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']),
      yaw: this.axis(['KeyQ'], ['KeyE']),
      dive: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 1 : 0,
      flare: 0,
    };
  }

  actions(): Partial<Actions> {
    return {
      deploy: this.consume('Space'),
      camera: this.consume('KeyC'),
      restart: this.consume('KeyR'),
      start: this.consume('Enter'),
      mute: this.consume('KeyM'),
    };
  }
}
