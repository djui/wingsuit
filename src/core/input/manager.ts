import type { Controls } from '../../sim/wingsuit';
import { GamepadInput } from './gamepad';
import { KeyboardInput } from './keyboard';
import { MouseInput } from './mouse';
import { TouchInput } from './touch';
import { NO_ACTIONS, type Actions, type InputFrame } from './types';

/** Merges all input sources into one smoothed control frame per tick. */
export class InputManager {
  readonly keyboard = new KeyboardInput();
  readonly mouse: MouseInput;
  readonly gamepad = new GamepadInput();
  readonly touch = new TouchInput();
  private smoothed: Controls & { flare: number } = { pitch: 0, roll: 0, yaw: 0, dive: 0, flare: 0 };
  private zoom = 0;

  constructor(canvas: HTMLElement) {
    this.mouse = new MouseInput(canvas);
  }

  read(dt: number): InputFrame {
    const sources = [this.keyboard, this.mouse, this.gamepad, this.touch];
    const raw = { pitch: 0, roll: 0, yaw: 0, dive: 0, flare: 0, zoom: 0 };
    const actions: Actions = { ...NO_ACTIONS };
    for (const s of sources) {
      const r = s.read();
      raw.pitch += r.pitch;
      raw.roll += r.roll;
      raw.yaw += r.yaw;
      raw.dive = Math.max(raw.dive, r.dive);
      raw.flare = Math.max(raw.flare, r.flare);
      raw.zoom += r.zoom;
      const a = s.actions();
      for (const k of Object.keys(actions) as (keyof Actions)[]) if (a[k]) actions[k] = true;
    }
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const k = 1 - Math.exp(-dt * 10);
    const s = this.smoothed;
    s.pitch += (clamp(raw.pitch) - s.pitch) * k;
    s.roll += (clamp(raw.roll) - s.roll) * k;
    s.yaw += (clamp(raw.yaw) - s.yaw) * k;
    s.dive += (raw.dive - s.dive) * k;
    s.flare += (raw.flare - s.flare) * k;
    this.zoom = clamp(raw.zoom);
    return { controls: { pitch: s.pitch, roll: s.roll, yaw: s.yaw, dive: s.dive }, flare: s.flare, zoom: this.zoom, actions };
  }
}
