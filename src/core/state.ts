export type RunPhase = 'menu' | 'loading' | 'ready' | 'flying' | 'landed' | 'crashed';
export type GameMode = 'distance' | 'target' | 'proximity';

export interface RunState {
  phase: RunPhase;
  mode: GameMode;
  time: number;
  maxSpeed: number;
  peakG: number;
  outcome: string;
  score: number;
  /** Proximity points accumulated by flying close to the terrain at speed. */
  proximity: number;
  /** Flight path samples for the results minimap: t, x, y, z. */
  path: number[];
  /** Path sample index at deployment, -1 if the canopy was not used. */
  deployIndex: number;
}

export function newRunState(mode: GameMode = 'distance'): RunState {
  return { phase: 'menu', mode, time: 0, maxSpeed: 0, peakG: 0, outcome: '', score: 0, proximity: 0, path: [], deployIndex: -1 };
}

/**
 * Proximity points per second: full points below 10 m above ground, fading
 * to nothing at 60 m, only at wingsuit speeds.
 */
export function proximityRate(agl: number, airspeed: number): number {
  if (airspeed < 25) return 0;
  const closeness = Math.max(0, Math.min(1, (60 - agl) / 50));
  return 100 * closeness * closeness;
}

/** Score for a target-mode landing: 1000 at the centre, 0 at 500 m or beyond. */
export function targetScore(distanceToCentre: number): number {
  return Math.max(0, Math.round(1000 * (1 - distanceToCentre / 500)));
}
