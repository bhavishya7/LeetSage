import type { FilterResult } from '../types';

/**
 * Pure recovery decision for the graceful-filter flow
 * (.kiro/specs/leetsage-coaching-logic-overhaul §4.3, R6b).
 *
 * Given a `filterResponse` result and whether the budget allows another
 * request, decide what the App-level orchestrator should do. Kept pure (no
 * network, no React) so the whole branching tree is unit-testable without a
 * harness — the orchestrator in App.tsx is a thin shell around this.
 *
 * The tree:
 *   - not filtered            → 'show-clean'   (nothing to recover)
 *   - redactionMode 'partial' → 'show-partial' (teaching survived; DON'T spend a
 *                                               regenerate credit — R6.8.3)
 *   - redactionMode 'full' + budget allows → 'regenerate' (one bounded retry)
 *   - redactionMode 'full' + no budget     → 'show-full'  (skip regenerate — R6.9.2)
 */
export type RecoveryDecision = 'show-clean' | 'show-partial' | 'regenerate' | 'show-full';

export function decideRecovery(
  result: Pick<FilterResult, 'wasFiltered' | 'redactionMode'>,
  opts: { budgetAllowed: boolean },
): RecoveryDecision {
  if (!result.wasFiltered) return 'show-clean';
  if (result.redactionMode === 'partial') return 'show-partial';
  // redactionMode 'full' (or unspecified, treated as full for safety).
  return opts.budgetAllowed ? 'regenerate' : 'show-full';
}

/**
 * Pure resolution of what to SHOW after an attempted regenerate
 * (R6.8.1/R6.8.2). Given the regenerated text's own filter result, decide
 * whether to show it (clean) or fall back to the reworded full message. Never a
 * second regenerate — the loop is hard-capped at one.
 *
 * Returns the text to display: the regenerated content when clean, else the
 * provided full-message fallback.
 */
export function resolveRegenerated(
  regenerated: string,
  regeneratedFilter: Pick<FilterResult, 'wasFiltered' | 'filteredContent'>,
  fullMessage: string,
): string {
  return regeneratedFilter.wasFiltered ? fullMessage : regenerated;
}
