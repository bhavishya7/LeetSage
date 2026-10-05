/**
 * Chat Enhancement (E9) — pure usage-band math for the obscured usage indicator
 * (design §6, R11). Split out of UsageReservoir.tsx so the component file only
 * exports a component (the react-refresh/only-export-components lint rule — a
 * component module must not also export plain functions/constants). Same pattern
 * the codebase uses elsewhere (e.g. complexity-parse.ts beside ContentDisplay).
 *
 * These are unit-tested in __tests__/usage-reservoir.test.ts.
 */

export type UsageBand = 'low' | 'moderate' | 'high';

/** Amber at ≥70% used, red at ≥90% used. */
export function usageBand(used: number, max: number): UsageBand {
  if (max <= 0) return 'low';
  const frac = used / max;
  if (frac >= 0.9) return 'high';
  if (frac >= 0.7) return 'moderate';
  return 'low';
}

/** Fraction of the reserve REMAINING (1 = full, 0 = empty), clamped to [0,1]. */
export function fillFraction(used: number, max: number): number {
  if (max <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - used / max));
}

/** Water tint per band — calm → amber → red as the reserve drains. */
export const BAND_COLOR: Record<UsageBand, string> = {
  low: '#38bdf8',      // sky-400 — calm water, plenty left
  moderate: '#f59e0b', // amber-500 — getting low
  high: '#ef4444',     // red-500 — almost out
};

/** Accessible label per band (R11.5) — the obscuring is visual, not a data loss. */
export const BAND_LABEL: Record<UsageBand, string> = {
  low: 'Daily usage: low',
  moderate: 'Daily usage: moderate',
  high: 'Daily usage: high — approaching the limit',
};
