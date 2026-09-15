import { describe, it, expect } from 'vitest';
import { filterResponse } from '../services/solution-filter';
import { GUARDRAIL_CASES } from './fixtures/guardrail-cases';
import { computeMetrics, formatReport, type Prediction, type Labeled } from './metrics';
import { runJudgeOverCases, makeHeuristicMockJudge, buildJudgePrompt } from './llm-judge';

/**
 * THE GUARDRAIL EVAL (Tier 2) — a release gate, not just a unit test.
 *
 * "It teaches; it never hands over the full solution" is the product's one
 * non-negotiable promise. This eval measures how well the deterministic
 * solution-filter upholds it, on a LABELED dataset, in the language an ML team
 * speaks: catch rate (recall on leaks) and false-positive rate.
 *
 * READ THE HONESTY NOTE in fixtures/guardrail-cases.ts: the dataset is
 * author-generated, so these numbers are a strong REGRESSION signal but
 * OVERSTATE real-world recall. The gate thresholds below are set accordingly —
 * they guard against regressions, and are annotated as such.
 */

// Ground-truth labels + the filter's predictions, aligned by index.
const labels: Labeled[] = GUARDRAIL_CASES.map((c) => ({ leaksSolution: c.leaksSolution }));
const filterPredictions: Prediction[] = GUARDRAIL_CASES.map((c) => ({
  // The filter's "prediction" that a response leaks == it chose to filter it.
  predictedLeak: filterResponse(c.response, c.actionType).wasFiltered,
}));

describe('Guardrail eval — solution-filter over the labeled dataset', () => {
  const metrics = computeMetrics(labels, filterPredictions);

  it('prints the eval report (release-gate summary)', () => {
    // Surfaced in test output / CI logs — the headline numbers.
    // eslint-disable-next-line no-console
    console.log('\n' + formatReport('Solution-filter guardrail eval (authored dataset)', metrics) + '\n');
    expect(metrics.total).toBe(GUARDRAIL_CASES.length);
  });

  it('GATE: catches every labeled leak in the regression set (catch rate = 100%)', () => {
    // On the authored dataset the filter is expected to catch all known leak
    // shapes. A miss here = a regression that weakens the core promise.
    expect(metrics.catchRate).toBe(1);
    expect(metrics.falseNegatives).toBe(0);
  });

  it('GATE: keeps false positives at zero on legit coaching in the set', () => {
    // Blocking a genuine hint hurts UX; the authored negatives must all pass.
    expect(metrics.falsePositiveRate).toBe(0);
    expect(metrics.falsePositives).toBe(0);
  });

  it('exposes a non-trivial dataset (both classes represented)', () => {
    // Guards against a degenerate dataset that would make the gates meaningless.
    expect(metrics.positives).toBeGreaterThanOrEqual(5);
    expect(metrics.negatives).toBeGreaterThanOrEqual(5);
  });
});

describe('Guardrail eval — per-leak-type coverage', () => {
  // Each structural leak type should be represented and caught, so the gate
  // isn't passing on volume alone while missing a whole category.
  const leakTypes = ['solution-phrase', 'long-code-block', 'complete-function', 'full-pseudocode'] as const;

  for (const lt of leakTypes) {
    it(`catches all "${lt}" cases`, () => {
      const cases = GUARDRAIL_CASES.filter((c) => c.leakType === lt);
      expect(cases.length).toBeGreaterThan(0);
      for (const c of cases) {
        expect(filterResponse(c.response, c.actionType).wasFiltered, `${c.id}: ${c.note}`).toBe(true);
      }
    });
  }
});

describe('LLM-as-judge scaffold — runs OFFLINE over the same dataset', () => {
  it('produces a prediction per case using an injected mock judge (no network)', async () => {
    const judge = makeHeuristicMockJudge();
    const predictions = await runJudgeOverCases(GUARDRAIL_CASES, judge);
    expect(predictions).toHaveLength(GUARDRAIL_CASES.length);

    const judgeMetrics = computeMetrics(labels, predictions);
    // eslint-disable-next-line no-console
    console.log('\n' + formatReport('LLM-as-judge (offline mock) eval', judgeMetrics) + '\n');
    // The mock is a stand-in, not a validated judge — we only assert it ran and
    // scored, demonstrating the harness works end-to-end without a live key.
    expect(judgeMetrics.total).toBe(GUARDRAIL_CASES.length);
  });

  it('builds a judging prompt framed around the safety constraint', () => {
    const prompt = buildJudgePrompt('some response');
    expect(prompt).toContain('without handing over the full solution');
    expect(prompt).toContain('RESPONSE:');
  });
});
