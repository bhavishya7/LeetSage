import { describe, it, expect } from 'vitest';
import { estimateCostUsd, GEMINI_PRICING_USD_PER_1M } from '../metrics-pricing';

/**
 * Unit tests for the pure cost-estimation math. The dollar figures depend on the
 * cited price table (metrics-pricing.ts) — if a rate there changes, expected
 * values here derive from GEMINI_PRICING_USD_PER_1M so the two stay in sync.
 */

describe('estimateCostUsd', () => {
  it('returns 0 for zero tokens', () => {
    expect(estimateCostUsd('gemini-3.5-flash-lite', 0, 0)).toBe(0);
  });

  it('computes cost from the flash-lite rate', () => {
    const rate = GEMINI_PRICING_USD_PER_1M['gemini-3.5-flash-lite'];
    // 1,000,000 input + 1,000,000 output should equal input + output rate exactly.
    expect(estimateCostUsd('gemini-3.5-flash-lite', 1_000_000, 1_000_000)).toBeCloseTo(
      rate.input + rate.output,
      10,
    );
  });

  it('computes cost from the flash rate (different output multiplier)', () => {
    const rate = GEMINI_PRICING_USD_PER_1M['gemini-3.5-flash'];
    // 1000 in + 500 out
    const expected = (1000 / 1_000_000) * rate.input + (500 / 1_000_000) * rate.output;
    expect(estimateCostUsd('gemini-3.5-flash', 1000, 500)).toBeCloseTo(expected, 12);
  });

  it('scales linearly with token counts', () => {
    const single = estimateCostUsd('gemini-3.5-flash-lite', 100, 50);
    const triple = estimateCostUsd('gemini-3.5-flash-lite', 300, 150);
    expect(triple).toBeCloseTo(single * 3, 12);
  });

  it('flash is more expensive than flash-lite for the same tokens', () => {
    const lite = estimateCostUsd('gemini-3.5-flash-lite', 1000, 1000);
    const flash = estimateCostUsd('gemini-3.5-flash', 1000, 1000);
    expect(flash).toBeGreaterThan(lite);
  });
});
