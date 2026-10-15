import { describe, it, expect } from 'vitest';
import { decideRecovery, resolveRegenerated } from '../filter-recovery';
import type { FilterResult } from '../../types';

/**
 * Coaching-logic-overhaul R6b — the recovery decision tree, pure + unit-tested
 * (design §4.9 d1/e1/f1/g1). These cover the branches the App orchestrator
 * dispatches on so the "regenerate only in the would-be-blank case, hard-capped
 * at one, budget-gated" policy can't drift.
 */

const fr = (wasFiltered: boolean, redactionMode?: FilterResult['redactionMode']): Pick<FilterResult, 'wasFiltered' | 'redactionMode'> =>
  ({ wasFiltered, redactionMode });

describe('decideRecovery (R6b)', () => {
  it('not filtered → show-clean', () => {
    expect(decideRecovery(fr(false, 'none'), { budgetAllowed: true })).toBe('show-clean');
  });

  it('(d1) partial → show-partial, regardless of budget (NO regenerate — R6.8.3)', () => {
    expect(decideRecovery(fr(true, 'partial'), { budgetAllowed: true })).toBe('show-partial');
    expect(decideRecovery(fr(true, 'partial'), { budgetAllowed: false })).toBe('show-partial');
  });

  it('(e1) full + budget allowed → regenerate', () => {
    expect(decideRecovery(fr(true, 'full'), { budgetAllowed: true })).toBe('regenerate');
  });

  it('(g1) full + budget disallowed → show-full (skip regenerate — R6.9.2)', () => {
    expect(decideRecovery(fr(true, 'full'), { budgetAllowed: false })).toBe('show-full');
  });

  it('filtered with unspecified mode is treated as full (safe default)', () => {
    expect(decideRecovery(fr(true, undefined), { budgetAllowed: true })).toBe('regenerate');
    expect(decideRecovery(fr(true, undefined), { budgetAllowed: false })).toBe('show-full');
  });
});

describe('resolveRegenerated (R6.8.1/R6.8.2 — bounded, re-filtered)', () => {
  const FULL_MSG = 'coaching-level fallback message';

  it('(e1) a clean regenerated answer is shown', () => {
    const out = resolveRegenerated('A good coaching answer.', { wasFiltered: false, filteredContent: 'A good coaching answer.' }, FULL_MSG);
    expect(out).toBe('A good coaching answer.');
  });

  it('(f1) a regenerate that STILL leaks falls back to the full message (no 2nd regen)', () => {
    const out = resolveRegenerated('here is the complete solution again', { wasFiltered: true, filteredContent: FULL_MSG }, FULL_MSG);
    expect(out).toBe(FULL_MSG);
  });
});
