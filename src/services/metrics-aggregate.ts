import type { MetricsState, MetricsSummary } from '../types';

/**
 * Pure aggregation math for runtime metrics. No I/O, no chrome.* — everything
 * here is deterministic and unit-tested (see __tests__/metrics-aggregate.test.ts),
 * matching the project's "test the pure modules" approach.
 */

/**
 * The p-th percentile of a numeric sample set, using linear interpolation
 * between the two closest ranks (the common "R-7" / Excel PERCENTILE.INC method).
 *
 * @param values unsorted numbers (copied + sorted internally; input untouched)
 * @param p      percentile in [0, 100]
 * @returns the percentile value, or null for an empty set
 */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];

  const sorted = [...values].sort((a, b) => a - b);
  const clampedP = Math.min(100, Math.max(0, p));
  // Fractional rank in [0, n-1].
  const rank = (clampedP / 100) * (sorted.length - 1);
  const lowIdx = Math.floor(rank);
  const highIdx = Math.ceil(rank);
  if (lowIdx === highIdx) return sorted[lowIdx];
  const frac = rank - lowIdx;
  return sorted[lowIdx] + (sorted[highIdx] - sorted[lowIdx]) * frac;
}

/** Rounds to `dp` decimal places (avoids trailing float noise in the readout). */
function round(value: number, dp: number): number {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

/**
 * Collapse a MetricsState into a display-ready summary.
 *
 * Latency percentiles are computed over the rolling `samples` window (they need
 * the distribution). Token/cost averages use the LIFETIME running totals so they
 * stay truthful after window eviction, and they divide by
 * `tokensCapturedRequests` — NOT total requests — so the streaming-usage gap
 * (requests where the API didn't surface tokens) never silently deflates the
 * average.
 */
export function summarize(state: MetricsState): MetricsSummary {
  const latencies = state.samples.map((s) => s.latencyMs);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);

  const { lifetime } = state;
  const captured = lifetime.tokensCapturedRequests;
  const avgPromptTokens = captured > 0 ? round(lifetime.totalPromptTokens / captured, 0) : null;
  const avgCompletionTokens = captured > 0 ? round(lifetime.totalCompletionTokens / captured, 0) : null;
  const avgTokensPerRequest =
    captured > 0 ? round((lifetime.totalPromptTokens + lifetime.totalCompletionTokens) / captured, 0) : null;
  const avgEstCostUsd = captured > 0 ? lifetime.totalEstCostUsd / captured : null;

  return {
    totalRequests: lifetime.totalRequests,
    windowSize: state.samples.length,
    p50LatencyMs: p50 === null ? null : round(p50, 0),
    p95LatencyMs: p95 === null ? null : round(p95, 0),
    avgTokensPerRequest,
    avgPromptTokens,
    avgCompletionTokens,
    tokensCapturedRequests: captured,
    avgEstCostUsd,
    totalEstCostUsd: lifetime.totalEstCostUsd,
  };
}
