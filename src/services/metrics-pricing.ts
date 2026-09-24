import type { GeminiModel } from '../types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  GEMINI PER-TOKEN PRICING — single source of truth for cost estimation.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Values are USD per 1,000,000 tokens, split into input (prompt) and output
 * (completion).
 *
 * SOURCE: Google Gemini API pricing (https://ai.google.dev/gemini-api/docs/pricing)
 *   and corroborating public trackers, retrieved 2026-09-23.
 *
 * ⚠️ CAVEAT — READ BEFORE QUOTING THESE NUMBERS:
 *   LeetSage's model IDs are `gemini-3.5-*` (see .kiro/steering/tech.md), but at
 *   retrieval time the cleanly-corroborated public per-token rates were for the
 *   `gemini-2.5-*` tier ($0.10 / $0.40 for flash-lite; $0.30 / $2.50 for flash).
 *   The exact `3.5` rates were NOT consistently confirmed across sources. We
 *   therefore treat this table as an ESTIMATE BASIS and keep it trivially
 *   updatable (one edit per row). When the exact 3.5 rates are confirmed,
 *   update the numbers below and refresh the source note.
 *
 *   Because the user runs on their own FREE Gemini quota (BYOK, no backend), the
 *   derived cost is a "what this would cost on the paid tier" figure — it
 *   demonstrates cost-awareness, it is not a bill.
 */
export const GEMINI_PRICING_USD_PER_1M: Record<GeminiModel, { input: number; output: number }> = {
  'gemini-3.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-3.5-flash': { input: 0.3, output: 2.5 },
};

const TOKENS_PER_UNIT = 1_000_000;

/**
 * Estimate the USD cost of a single request from its token counts.
 *
 * Pure function (no I/O) so it's unit-testable. Returns 0 for zero tokens.
 * Falls back to the flash-lite rate for an unknown model id (defensive; the
 * type system should prevent it, but stored samples may outlive a model list).
 */
export function estimateCostUsd(model: GeminiModel, promptTokens: number, completionTokens: number): number {
  const rate = GEMINI_PRICING_USD_PER_1M[model] ?? GEMINI_PRICING_USD_PER_1M['gemini-3.5-flash-lite'];
  const inputCost = (promptTokens / TOKENS_PER_UNIT) * rate.input;
  const outputCost = (completionTokens / TOKENS_PER_UNIT) * rate.output;
  return inputCost + outputCost;
}
