export type RunPhase = 'menu' | 'loading' | 'flying' | 'landed' | 'crashed';
export type GameMode = 'distance' | 'target';

export interface RunState {
  phase: RunPhase;
  mode: GameMode;
  time: number;
  maxSpeed: number;
  peakG: number;
  outcome: string;
  score: number;
}

export function newRunState(mode: GameMode = 'distance'): RunState {
  return { phase: 'menu', mode, time: 0, maxSpeed: 0, peakG: 0, outcome: '', score: 0 };
}

/** Score for a target-mode landing: 1000 at the centre, 0 at 500 m or beyond. */
export function targetScore(distanceToCentre: number): number {
  return Math.max(0, Math.round(1000 * (1 - distanceToCentre / 500)));
}
