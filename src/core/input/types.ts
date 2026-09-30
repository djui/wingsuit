import type { Controls } from '../../sim/wingsuit';

/** Edge-triggered actions (true for one frame). */
export interface Actions {
  deploy: boolean;
  camera: boolean;
  restart: boolean;
  start: boolean;
  mute: boolean;
  rollLeft: boolean;
  rollRight: boolean;
  loop: boolean;
  frontFlip: boolean;
}

export interface InputFrame {
  controls: Controls;
  /** Held flare/brake input 0..1 (in addition to pitch-up). */
  flare: number;
  /** Camera zoom axis: -1 closer .. +1 further. */
  zoom: number;
  actions: Actions;
}

export interface RawInput extends Controls {
  flare: number;
  zoom: number;
}

export interface InputSource {
  /** Read the raw axes for this frame (unsmoothed, -1..1). */
  read(): RawInput;
  /** Consume edge-triggered actions since the last call. */
  actions(): Partial<Actions>;
}

export const NO_ACTIONS: Actions = {
  deploy: false,
  camera: false,
  restart: false,
  start: false,
  mute: false,
  rollLeft: false,
  rollRight: false,
  loop: false,
  frontFlip: false,
};
