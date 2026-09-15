import { describe, it, expect } from 'vitest';
import { computeStruggleScore, computeInsights } from '../progress-analytics';
import type { ProblemRecord, Attempt, ProblemPattern, AttemptOutcome, Complexity } from '../../types';

/**
 * Unit tests for the deterministic cross-problem analytics (Phase C).
 *
 * These are pure input->output aggregations: struggle scoring, per-pattern
 * fan-out, weakest-link selection with the <3-problems low-confidence gate,
 * and the revisit list. No AI, no storage.
 */

const DAY = 24 * 60 * 60 * 1000;

function attempt(o: AttemptOutcome, hintsUsed = 0, complexity: Complexity = { time: 'O(n)', space: 'O(n)' }): Attempt {
  return {
    date: Date.now(),
    outcome: o,
    approachSummary: 'x',
    solutionSummary: 'y',
    complexity,
    hintsUsed,
  };
}

let recSeq = 0;
function record(opts: {
  patterns: ProblemPattern[];
  difficulty?: ProblemRecord['difficulty'];
  attempts?: Attempt[];
  bestAttemptIndex?: number;
  lastUpdatedAt?: number;
}): ProblemRecord {
  const attempts = opts.attempts ?? [attempt('solved')];
  const slug = `p${recSeq++}`;
  return {
    schemaVersion: 1,
    slug,
    url: `https://leetcode.com/problems/${slug}/`,
    title: slug,
    difficulty: opts.difficulty ?? 'Medium',
    patterns: opts.patterns,
    attempts,
    bestAttemptIndex: opts.bestAttemptIndex ?? attempts.length - 1,
    firstSolvedAt: Date.now(),
    lastUpdatedAt: opts.lastUpdatedAt ?? Date.now(),
    notes: '',
  };
}

describe('computeStruggleScore', () => {
  it('rises with hints, extra attempts, give-ups, and difficulty', () => {
    const low = computeStruggleScore({ avgHintsUsed: 0, avgAttempts: 1, gaveUpRate: 0, avgDifficultyWeight: 1 });
    const high = computeStruggleScore({ avgHintsUsed: 3, avgAttempts: 3, gaveUpRate: 0.5, avgDifficultyWeight: 3 });
    expect(high).toBeGreaterThan(low);
  });

  it('treats a single attempt as the baseline (no attempt penalty)', () => {
    const one = computeStruggleScore({ avgHintsUsed: 0, avgAttempts: 1, gaveUpRate: 0, avgDifficultyWeight: 0 });
    const zero = computeStruggleScore({ avgHintsUsed: 0, avgAttempts: 0, gaveUpRate: 0, avgDifficultyWeight: 0 });
    // Math.max(0, avgAttempts - 1) means 0 and 1 attempts both add nothing.
    expect(one).toBe(0);
    expect(zero).toBe(0);
  });

  it('weights give-ups most heavily (coefficient 4)', () => {
    const gaveUp = computeStruggleScore({ avgHintsUsed: 0, avgAttempts: 1, gaveUpRate: 1, avgDifficultyWeight: 0 });
    expect(gaveUp).toBe(4);
  });
});

describe('computeInsights — totals and fan-out', () => {
  it('counts problems and attempts; a problem fans out into all its patterns', () => {
    const records = [
      record({ patterns: ['Hash Map', 'Two Pointers'], attempts: [attempt('solved'), attempt('solved')] }),
      record({ patterns: ['Hash Map'] }),
    ];
    const insights = computeInsights(records);
    expect(insights.totalProblems).toBe(2);
    expect(insights.totalAttempts).toBe(3);
    const hashMap = insights.byPattern.find(p => p.pattern === 'Hash Map');
    const twoPtr = insights.byPattern.find(p => p.pattern === 'Two Pointers');
    expect(hashMap?.problemCount).toBe(2);
    expect(twoPtr?.problemCount).toBe(1);
  });

  it('returns empty structures for no records', () => {
    const insights = computeInsights([]);
    expect(insights.totalProblems).toBe(0);
    expect(insights.byPattern).toEqual([]);
    expect(insights.weakestLink).toBeNull();
    expect(insights.revisit).toEqual([]);
  });
});

describe('computeInsights — low-confidence gate (<3 problems)', () => {
  it('flags a pattern with fewer than 3 problems as lowConfidence', () => {
    const records = [record({ patterns: ['Greedy'] }), record({ patterns: ['Greedy'] })];
    const insights = computeInsights(records);
    const greedy = insights.byPattern.find(p => p.pattern === 'Greedy');
    expect(greedy?.problemCount).toBe(2);
    expect(greedy?.lowConfidence).toBe(true);
  });

  it('does not flag a pattern with 3+ problems', () => {
    const records = [
      record({ patterns: ['DFS'] }),
      record({ patterns: ['DFS'] }),
      record({ patterns: ['DFS'] }),
    ];
    const insights = computeInsights(records);
    expect(insights.byPattern.find(p => p.pattern === 'DFS')?.lowConfidence).toBe(false);
  });

  it('prefers a confident pattern as weakest-link even if a low-confidence one scores higher', () => {
    // 'Backtracking' (1 problem, gave up) scores high but is low-confidence.
    // 'Dynamic Programming' (3 problems, high hints) is confident.
    const records = [
      record({ patterns: ['Backtracking'], attempts: [attempt('gave-up', 3)], bestAttemptIndex: 0, difficulty: 'Hard' }),
      record({ patterns: ['Dynamic Programming'], attempts: [attempt('solved', 3)], bestAttemptIndex: 0 }),
      record({ patterns: ['Dynamic Programming'], attempts: [attempt('solved', 3)], bestAttemptIndex: 0 }),
      record({ patterns: ['Dynamic Programming'], attempts: [attempt('solved', 2)], bestAttemptIndex: 0 }),
    ];
    const insights = computeInsights(records);
    expect(insights.weakestLink?.pattern).toBe('Dynamic Programming');
    expect(insights.weakestLink?.lowConfidence).toBe(false);
  });

  it('still surfaces a low-confidence weakest-link (flagged) when everything is low-confidence', () => {
    const records = [record({ patterns: ['Trie'], attempts: [attempt('gave-up', 2)], bestAttemptIndex: 0 })];
    const insights = computeInsights(records);
    expect(insights.weakestLink?.pattern).toBe('Trie');
    expect(insights.weakestLink?.lowConfidence).toBe(true);
  });
});

describe('computeInsights — ranking', () => {
  it('sorts byPattern most-struggled first', () => {
    const records = [
      record({ patterns: ['Hash Map'], attempts: [attempt('solved', 0)], bestAttemptIndex: 0, difficulty: 'Easy' }),
      record({ patterns: ['Graph'], attempts: [attempt('gave-up', 3)], bestAttemptIndex: 0, difficulty: 'Hard' }),
    ];
    const insights = computeInsights(records);
    expect(insights.byPattern[0].pattern).toBe('Graph'); // higher struggle first
  });
});

describe('computeInsights — revisit list', () => {
  it('lists a gave-up problem with reason gave-up', () => {
    const records = [record({ patterns: ['Stack'], attempts: [attempt('gave-up', 0)], bestAttemptIndex: 0 })];
    const revisit = computeInsights(records).revisit;
    expect(revisit).toHaveLength(1);
    expect(revisit[0].reason).toBe('gave-up');
  });

  it('lists a high-hint problem with reason high-hints', () => {
    const records = [record({ patterns: ['Stack'], attempts: [attempt('solved', 2)], bestAttemptIndex: 0 })];
    const revisit = computeInsights(records).revisit;
    expect(revisit[0].reason).toBe('high-hints');
  });

  it('lists a stale (>30 days) problem with reason stale', () => {
    const old = Date.now() - 40 * DAY;
    const records = [record({ patterns: ['Stack'], attempts: [attempt('solved', 0)], bestAttemptIndex: 0, lastUpdatedAt: old })];
    const revisit = computeInsights(records).revisit;
    expect(revisit[0].reason).toBe('stale');
  });

  it('does not list a fresh, low-hint, solved problem', () => {
    const records = [record({ patterns: ['Stack'], attempts: [attempt('solved', 0)], bestAttemptIndex: 0 })];
    expect(computeInsights(records).revisit).toEqual([]);
  });

  it('give-up takes precedence over high-hints / stale for the same problem', () => {
    const old = Date.now() - 40 * DAY;
    const records = [record({ patterns: ['Stack'], attempts: [attempt('gave-up', 3)], bestAttemptIndex: 0, lastUpdatedAt: old })];
    const revisit = computeInsights(records).revisit;
    expect(revisit).toHaveLength(1);
    expect(revisit[0].reason).toBe('gave-up');
  });
});
