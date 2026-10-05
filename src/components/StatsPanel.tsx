import React, { useEffect, useState } from 'react';
import type { MetricsSummary } from '../types';
import { getMetricsSummary } from '../services/metrics-store';
import { getUsageToday } from '../services/rate-limiter';

/**
 * A small, read-only runtime-metrics readout. Everything shown is computed
 * locally from chrome.storage.local (no backend) — p50/p95 latency, average
 * tokens/request, request count, and an ESTIMATED cost (what the free-tier usage
 * would cost on the paid tier — cost-awareness, not a bill).
 *
 * Honest by design: when token usage wasn't captured for streamed responses
 * (the endpoint may not honor `stream_options.include_usage`), the token/cost
 * rows say so instead of showing a fabricated number.
 */
const StatsPanel: React.FC<{ maxRequestsPerDay?: number }> = ({ maxRequestsPerDay }) => {
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  // E9: the exact daily usage count moved here from the header (R11.3). The
  // header now shows only an obscured reservoir glyph; the precise number lives
  // in Settings for anyone who wants it.
  const [usageToday, setUsageToday] = useState<number | null>(null);

  useEffect(() => {
    getMetricsSummary().then(setSummary).catch(() => setSummary(null));
    getUsageToday().then(u => setUsageToday(u.count)).catch(() => setUsageToday(null));
  }, []);

  // The exact "requests today" line — shown regardless of metrics state (R11.3).
  const usageLine =
    usageToday !== null && maxRequestsPerDay ? (
      <div className="flex items-center justify-between py-0.5 text-[11px]">
        <span className="text-neutral-500 dark:text-neutral-400">Requests today</span>
        <span className="font-mono">{usageToday} / {maxRequestsPerDay} <span className="text-neutral-400">(resets at midnight)</span></span>
      </div>
    ) : null;

  if (!summary) {
    return (
      <div className="mt-2 space-y-0.5">
        {usageLine}
        <p className="text-[11px] text-neutral-400">Loading stats…</p>
      </div>
    );
  }

  if (summary.totalRequests === 0) {
    return (
      <div className="mt-2 space-y-0.5">
        {usageLine}
        <p className="text-[11px] text-neutral-400">No requests recorded yet — run a coaching action to start collecting metrics.</p>
      </div>
    );
  }

  const ms = (v: number | null) => (v === null ? '—' : `${v} ms`);
  const tokens = (v: number | null) => (v === null ? 'not captured' : `${v}`);
  const cost = (v: number | null) =>
    v === null ? 'not captured' : v < 0.01 ? `$${v.toFixed(6)}` : `$${v.toFixed(4)}`;

  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );

  const tokensMissing = summary.tokensCapturedRequests === 0 && summary.totalRequests > 0;

  return (
    <div className="mt-3 text-[11px] space-y-0.5">
      {usageLine}
      {row('Requests recorded', `${summary.totalRequests}`)}
      {row('Latency p50', ms(summary.p50LatencyMs))}
      {row('Latency p95', ms(summary.p95LatencyMs))}
      {row('Avg tokens / request', tokens(summary.avgTokensPerRequest))}
      {row('Est. cost / request', cost(summary.avgEstCostUsd))}
      {row('Total est. cost', cost(summary.totalEstCostUsd))}
      {tokensMissing && (
        <p className="text-neutral-400 text-[10px] mt-1 leading-snug">
          Token counts weren't returned for streamed responses, so token &amp; cost
          figures are unavailable. Latency is always measured.
        </p>
      )}
      <p className="text-neutral-400 text-[10px] mt-1 leading-snug">
        Local only. Cost is an estimate from public per-token pricing (see
        metrics-pricing.ts) — you run on your own free quota.
      </p>
    </div>
  );
};

export default StatsPanel;
