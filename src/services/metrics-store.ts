import type { GeminiModel, MetricsState, MetricsSummary, RequestMetricSample } from '../types';
import { estimateCostUsd } from './metrics-pricing';
import { summarize } from './metrics-aggregate';

/**
 * Runtime-metrics persistence. Mirrors the storage.ts / rate-limiter.ts pattern:
 * promise-wrapped chrome.storage.local under a single versioned key, defaults
 * backfilled on read. Everything is LOCAL — no backend, no telemetry egress
 * (ADR-001/003), same posture as the usage counter it sits beside.
 *
 * Bounded by design (no unbounded history): `samples` is a capped rolling window
 * used for latency percentiles; `lifetime` holds running aggregates that survive
 * eviction so totals stay truthful.
 */

const METRICS_KEY = 'metrics_v1';

/** Rolling-window cap. 200 recent samples is plenty for stable p50/p95. */
export const MAX_SAMPLES = 200;

function emptyState(): MetricsState {
  return {
    version: 1,
    samples: [],
    lifetime: {
      totalRequests: 0,
      tokensCapturedRequests: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalEstCostUsd: 0,
    },
  };
}

export async function getMetrics(): Promise<MetricsState> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(METRICS_KEY, (result) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else {
        const stored = result[METRICS_KEY] as MetricsState | undefined;
        // Backfill: unknown/old shape → start fresh rather than trust it.
        resolve(stored && stored.version === 1 ? stored : emptyState());
      }
    });
  });
}

export async function saveMetrics(state: MetricsState): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [METRICS_KEY]: state }, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

/** Input to recordMetric — the raw observation from the request path. */
export interface MetricObservation {
  model: GeminiModel;
  latencyMs: number;
  /** Token usage if the API surfaced it; omit when unavailable (honest). */
  usage?: { promptTokens: number; completionTokens: number };
}

/**
 * Fold a single request observation into the persisted state and save it.
 *
 * Best-effort by contract: callers wrap this in try/catch (or ignore the
 * returned promise's rejection) so a metrics write NEVER breaks the request
 * path or double-counts against the rate limiter (design R7). Returns the
 * updated state for convenience/testing.
 */
export async function recordMetric(obs: MetricObservation): Promise<MetricsState> {
  const state = await getMetrics();

  const tokensCaptured = !!obs.usage;
  const estCostUsd = obs.usage
    ? estimateCostUsd(obs.model, obs.usage.promptTokens, obs.usage.completionTokens)
    : undefined;

  const sample: RequestMetricSample = {
    ts: Date.now(),
    model: obs.model,
    latencyMs: obs.latencyMs,
    promptTokens: obs.usage?.promptTokens,
    completionTokens: obs.usage?.completionTokens,
    estCostUsd,
    tokensCaptured,
  };

  // Append + evict oldest beyond the cap (bounded window).
  const samples = [...state.samples, sample].slice(-MAX_SAMPLES);

  const lifetime = {
    totalRequests: state.lifetime.totalRequests + 1,
    tokensCapturedRequests: state.lifetime.tokensCapturedRequests + (tokensCaptured ? 1 : 0),
    totalPromptTokens: state.lifetime.totalPromptTokens + (obs.usage?.promptTokens ?? 0),
    totalCompletionTokens: state.lifetime.totalCompletionTokens + (obs.usage?.completionTokens ?? 0),
    totalEstCostUsd: state.lifetime.totalEstCostUsd + (estCostUsd ?? 0),
  };

  const updated: MetricsState = { version: 1, samples, lifetime };
  await saveMetrics(updated);
  return updated;
}

/** Convenience: read + summarize in one call for the UI. */
export async function getMetricsSummary(): Promise<MetricsSummary> {
  return summarize(await getMetrics());
}
