import type { GameMode } from './state';

export interface ScoreEntry {
  score: number;
  /** Secondary stats for display. */
  detail: string;
  date: string;
}

const MAX_ENTRIES = 10;

function key(locationId: string, mode: GameMode): string {
  return `wingsuit.scores.${locationId}.${mode}`;
}

export function loadScores(locationId: string, mode: GameMode): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(key(locationId, mode));
    return raw ? (JSON.parse(raw) as ScoreEntry[]) : [];
  } catch {
    return [];
  }
}

/** Inserts a score; returns its 1-based rank or 0 if it did not make the table. */
export function submitScore(locationId: string, mode: GameMode, entry: ScoreEntry): number {
  const list = loadScores(locationId, mode);
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const rank = list.indexOf(entry) + 1;
  list.length = Math.min(list.length, MAX_ENTRIES);
  try {
    localStorage.setItem(key(locationId, mode), JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
  return rank <= MAX_ENTRIES ? rank : 0;
}
