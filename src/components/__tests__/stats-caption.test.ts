import { describe, it, expect } from 'vitest';
import { COST_CAPTION } from '../StatsPanel';

/**
 * B17 (see .kiro/specs/leetsage-e6-bug-hardening §4) — the stats-panel cost
 * caption must not leak an internal file name into user-facing UI, and must
 * frame the "cost" honestly: a free-tier user is NOT billed (a 429 rejects, it
 * never charges — DESIGN_DECISIONS ADR-007). The old copy said "Cost is an
 * estimate from public per-token pricing (see metrics-pricing.ts)".
 */
describe('COST_CAPTION (B17)', () => {
  it('does not leak the internal file name', () => {
    expect(COST_CAPTION).not.toContain('metrics-pricing');
    expect(COST_CAPTION).not.toMatch(/\.ts\b/);
  });

  it('states plainly that the user is NOT charged', () => {
    expect(COST_CAPTION.toLowerCase()).toContain('not charged');
    expect(COST_CAPTION.toLowerCase()).toContain('not a bill');
  });

  it('frames the figure as an estimate at public pay-as-you-go rates', () => {
    expect(COST_CAPTION.toLowerCase()).toContain('estimate');
    expect(COST_CAPTION.toLowerCase()).toContain('pay-as-you-go');
  });

  it('still notes it is local-only (no backend)', () => {
    expect(COST_CAPTION.toLowerCase()).toContain('local only');
  });
});
