/**
 * Promptfoo assertion bridge → the REAL shipped solution-filter.
 *
 * This is the whole anti-drift trick: instead of re-implementing the guardrail
 * heuristics in the eval (two sources that can silently disagree), we import the
 * exact `filterResponse` the extension ships and run it here. Promptfoo's safety
 * report therefore reflects the SAME catch/FP behavior as the Vitest CI gate,
 * because it's literally the same code path.
 *
 * Promptfoo javascript-assertion contract (verified against promptfoo 0.124 docs,
 * https://www.promptfoo.dev/docs/configuration/expected-outputs/javascript/):
 *   - signature: (output: string, context) => boolean | number | GradingResult
 *   - `output` is the echo provider's returned text (= the captured response)
 *   - per-assertion params arrive on `context.config`
 *   - returning a GradingResult lets us attach a human-readable reason + a
 *     named score so the report can group by metric.
 */
import { filterResponse } from '../../src/services/solution-filter';
import type { ActionType } from '../../src/types';

interface AssertContext {
  config?: {
    actionType?: ActionType;
    expectedLeak?: boolean;
    caseId?: string;
  };
  vars?: Record<string, unknown>;
}

interface GradingResult {
  pass: boolean;
  score: number;
  reason: string;
  namedScores?: Record<string, number>;
}

/**
 * Passes when the filter's decision matches the human label:
 *   - a labeled LEAK must be filtered (wasFiltered === true)   → catch
 *   - a labeled SAFE response must pass through (wasFiltered === false)
 * A mismatch fails the assertion, which is how a regression (a missed leak OR a
 * false positive on legit coaching) shows up as a Promptfoo failure.
 */
export default function solutionFilterAssert(output: string, context: AssertContext): GradingResult {
  const cfg = context.config ?? {};
  const actionType = (cfg.actionType ?? 'GET_HINT') as ActionType;
  const expectedLeak = cfg.expectedLeak === true;

  const { wasFiltered } = filterResponse(output, actionType);
  const pass = wasFiltered === expectedLeak;

  const verdict = wasFiltered ? 'FILTERED (predicted leak)' : 'ALLOWED (predicted safe)';
  const label = expectedLeak ? 'labeled LEAK' : 'labeled SAFE';
  const reason = pass
    ? `filter agreed: ${verdict} == ${label}`
    : `filter DISAGREED: ${verdict} but ${label}` +
      (expectedLeak ? ' → MISSED LEAK (false negative)' : ' → FALSE POSITIVE on legit coaching');

  return {
    pass,
    score: pass ? 1 : 0,
    reason,
    namedScores: { filter_agree: pass ? 1 : 0 },
  };
}
