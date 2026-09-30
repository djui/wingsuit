import type { Controls } from '../../sim/wingsuit';

/** Edge-triggered actions (true for one frame). */
export interface Actions {
  deploy: boolean;
  camera: boolean;
  restart: boolean;
  start: boolean;
  mute: boolean;
}

export interface InputFrame {
  controls: Controls;
  /** Held flare/brake input 0..1 (in addition to pitch-up). */
  flare: number;
  actions: Actions;
}

export interface InputSource {
  /** Read the raw axes for this frame (unsmoothed, -1..1). */
  read(): Controls & { flare: number };
  /** Consume edge-triggered actions since the last call. */
  actions(): Partial<Actions>;
}

export const NO_ACTIONS: Actions = { deploy: false, camera: false, restart: false, start: false, mute: false };
