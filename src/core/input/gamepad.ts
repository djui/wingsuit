import type { Actions, InputSource, RawInput } from './types';

/**
 * Standard-mapping gamepad: left stick pitch/roll, bumpers yaw, right
 * trigger dive, A deploy, B flare/brake, Y camera, Start restart.
 */
export class GamepadInput implements InputSource {
  private prevButtons: boolean[] = [];
  private edges: Partial<Actions> = {};
  connected = false;

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  private dead(v: number): number {
    const d = 0.15;
    const a = Math.abs(v);
    return a < d ? 0 : Math.sign(v) * ((a - d) / (1 - d));
  }

  read(): RawInput {
    const p = this.pad();
    this.connected = !!p;
    if (!p) return { pitch: 0, roll: 0, yaw: 0, dive: 0, flare: 0, zoom: 0 };
    const b = (i: number) => p.buttons[i]?.pressed ?? false;
    const v = (i: number) => p.buttons[i]?.value ?? 0;
    // Edge detection for actions.
    const now = [b(0), b(1), b(3), b(9), b(8), b(2), b(14), b(15), b(12), b(13)];
    this.edges = {
      deploy: now[0] && !this.prevButtons[0],
      camera: now[2] && !this.prevButtons[2],
      restart: now[3] && !this.prevButtons[3],
      start: now[0] && !this.prevButtons[0],
      mute: now[4] && !this.prevButtons[4],
      rollLeft: now[6] && !this.prevButtons[6],
      rollRight: now[7] && !this.prevButtons[7],
      loop: now[8] && !this.prevButtons[8],
      frontFlip: now[9] && !this.prevButtons[9],
    };
    this.prevButtons = now;
    return {
      roll: this.dead(p.axes[0] ?? 0),
      pitch: this.dead(p.axes[1] ?? 0),
      yaw: (b(5) ? 1 : 0) - (b(4) ? 1 : 0),
      dive: v(7),
      flare: b(1) ? 1 : 0,
      zoom: this.dead(p.axes[3] ?? 0),
    };
  }

  actions(): Partial<Actions> {
    const e = this.edges;
    this.edges = {};
    return e;
  }
}
