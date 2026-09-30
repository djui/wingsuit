export type RunPhase = 'menu' | 'loading' | 'flying' | 'crashed';

export interface RunState {
  phase: RunPhase;
  time: number;
  maxSpeed: number;
  maxDistance: number;
}

export function newRunState(): RunState {
  return { phase: 'menu', time: 0, maxSpeed: 0, maxDistance: 0 };
}
