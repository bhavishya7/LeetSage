import { describe, it, expect } from 'vitest';
import { percentile, summarize } from '../metrics-aggregate';
import type { MetricsState, RequestMetricSample } from '../../types';

/**
 * Unit tests for the pure metrics aggregation math. No chrome.*, no I/O — these
 * are deterministic functions, tested the same way as the other pure modules.
 */

describe('percentile', () => {
  it('returns null for an empty set', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([], 95)).toBeNull();
  });

  it('returns the single value regardless of p', () => {
    expect(percentile([42], 0)).toBe(42);
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 100)).toBe(42);
  });

  it('computes p50 (median) on an odd-length set', () => {
    // sorted: [10, 20, 30] → median is the middle value
    expect(percentile([30, 10, 20], 50)).toBe(20);
  });

  it('interpolates p50 on an even-length set', () => {
    // sorted: [10, 20, 30, 40], rank = 0.5*(3) = 1.5 → between 20 and 30 → 25
    expect(percentile([40, 10, 30, 20], 50)).toBe(25);
  });

  it('computes p0 and p100 as min and max', () => {
    const vals = [5, 1, 9, 3, 7];
    expect(percentile(vals, 0)).toBe(1);
    expect(percentile(vals, 100)).toBe(9);
  });

  it('computes p95 with interpolation on a known set', () => {
    // 1..100, rank = 0.95*99 = 94.05 → between sorted[94]=95 and sorted[95]=96
    const vals = Array.from({ length: 100 }, (_, i) => i + 1);
    const p95 = percentile(vals, 95)!;
    expect(p95).toBeCloseTo(95.05, 2);
  });

  it('does not mutate the input array', () => {
    const vals = [3, 1, 2];
    percentile(vals, 50);
    expect(vals).toEqual([3, 1, 2]);
  });

  it('clamps out-of-range p into [0,100]', () => {
    const vals = [1, 2, 3, 4];
    expect(percentile(vals, -10)).toBe(percentile(vals, 0));
    expect(percentile(vals, 250)).toBe(percentile(vals, 100));
  });
});

// ---- summarize -------------------------------------------------------------

function sample(overrides: Partial<RequestMetricSample> = {}): RequestMetricSample {
  return {
    ts: 1,
    model: 'gemini-3.5-flash-lite',
    latencyMs: 100,
    tokensCaptured: false,
    ...overrides,
  };
}

function state(samples: RequestMetricSample[], lifetime: Partial<MetricsState['lifetime']> = {}): MetricsState {
  return {
    version: 1,
    samples,
    lifetime: {
      totalRequests: samples.length,
      tokensCapturedRequests: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalEstCostUsd: 0,
      ...lifetime,
    },
  };
}

describe('summarize', () => {
  it('reports nulls on an empty state', () => {
    const s = summarize(state([]));
    expect(s.totalRequests).toBe(0);
    expect(s.windowSize).toBe(0);
    expect(s.p50LatencyMs).toBeNull();
    expect(s.p95LatencyMs).toBeNull();
    expect(s.avgTokensPerRequest).toBeNull();
    expect(s.avgEstCostUsd).toBeNull();
    expect(s.totalEstCostUsd).toBe(0);
  });

  it('computes latency percentiles over the sample window', () => {
    const samples = [100, 200, 300].map((latencyMs) => sample({ latencyMs }));
    const s = summarize(state(samples));
    expect(s.p50LatencyMs).toBe(200);
    expect(s.windowSize).toBe(3);
  });

  it('divides token/cost averages by tokensCapturedRequests, not total requests', () => {
    // 3 requests total, but only 2 had captured tokens.
    const samples = [
      sample({ tokensCaptured: true, promptTokens: 100, completionTokens: 50, estCostUsd: 0.00003, latencyMs: 100 }),
      sample({ tokensCaptured: true, promptTokens: 200, completionTokens: 100, estCostUsd: 0.00006, latencyMs: 200 }),
      sample({ tokensCaptured: false, latencyMs: 300 }),
    ];
    const s = summarize(
      state(samples, {
        totalRequests: 3,
        tokensCapturedRequests: 2,
        totalPromptTokens: 300,
        totalCompletionTokens: 150,
        totalEstCostUsd: 0.00009,
      }),
    );
    // avg tokens = (300 + 150) / 2 = 225, NOT / 3 (=150)
    expect(s.avgTokensPerRequest).toBe(225);
    expect(s.avgPromptTokens).toBe(150);
    expect(s.avgCompletionTokens).toBe(75);
    expect(s.avgEstCostUsd).toBeCloseTo(0.000045, 8);
    expect(s.totalRequests).toBe(3);
    expect(s.tokensCapturedRequests).toBe(2);
  });

  it('leaves token averages null when no request ever captured tokens', () => {
    const samples = [sample({ latencyMs: 100 }), sample({ latencyMs: 200 })];
    const s = summarize(state(samples, { totalRequests: 2, tokensCapturedRequests: 0 }));
    expect(s.avgTokensPerRequest).toBeNull();
    expect(s.avgEstCostUsd).toBeNull();
    // Latency still works even with no token data.
    expect(s.p50LatencyMs).toBe(150);
  });

  it('uses lifetime totals (survive window eviction), not just the window', () => {
    // Window has 1 sample, but lifetime says 50 requests happened.
    const s = summarize(
      state([sample({ tokensCaptured: true, promptTokens: 10, completionTokens: 10, latencyMs: 100 })], {
        totalRequests: 50,
        tokensCapturedRequests: 50,
        totalPromptTokens: 5000,
        totalCompletionTokens: 2500,
        totalEstCostUsd: 0.01,
      }),
    );
    expect(s.totalRequests).toBe(50);
    expect(s.windowSize).toBe(1);
    expect(s.avgTokensPerRequest).toBe(150); // 7500 / 50
    expect(s.totalEstCostUsd).toBe(0.01);
  });
});
