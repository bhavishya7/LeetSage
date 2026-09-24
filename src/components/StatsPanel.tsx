import React, { useEffect, useState } from 'react';
import type { MetricsSummary } from '../types';
import { getMetricsSummary } from '../services/metrics-store';

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
const StatsPanel: React.FC = () => {
  const [summary, setSummary] = useState<MetricsSummary | null>(null);

  useEffect(() => {
    getMetricsSummary().then(setSummary).catch(() => setSummary(null));
  }, []);

  if (!summary) {
    return <p className="text-[11px] text-neutral-400 mt-2">Loading stats…</p>;
  }

  if (summary.totalRequests === 0) {
    return <p className="text-[11px] text-neutral-400 mt-2">No requests recorded yet — run a coaching action to start collecting metrics.</p>;
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
