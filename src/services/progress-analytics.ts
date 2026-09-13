import type { ProblemRecord, ProblemPattern } from '../types';

/**
 * Cross-problem analytics (Progress-Tracking Phase C).
 * See .kiro/specs/leetsage-progress-tracking/design.md §7.
 *
 * This is a DETERMINISTIC aggregation pipeline over the local records — no AI:
 *   load → group by pattern → score struggle → rank → present.
 * Keeping computation (pure, testable) separate from presentation (the view,
 * or an optional LLM narrative) is the clean architecture boundary the design
 * calls for. Everything here is pure input → output, so it's a prime unit-test
 * target.
 */

const DIFFICULTY_WEIGHT: Record<ProblemRecord['difficulty'], number> = {
  Easy: 1,
  Medium: 2,
  Hard: 3,
};

/** Days after which a solved problem is worth revisiting. */
const REVISIT_STALE_DAYS = 30;
/** hintsUsed at/above this counts as a "high-hint" struggle signal. */
const HIGH_HINT_THRESHOLD = 2;

export interface PatternStat {
  pattern: ProblemPattern;
  problemCount: number;      // distinct problems tagged with this pattern
  avgHintsUsed: number;      // averaged over those problems' best attempts
  avgAttempts: number;       // avg number of saved attempts per problem
  gaveUpCount: number;
  difficultyMix: { Easy: number; Medium: number; Hard: number };
  struggleScore: number;     // higher = more struggle (see computeStruggleScore)
  /** True when problemCount is too small to trust the ranking. */
  lowConfidence: boolean;
}

export interface RevisitItem {
  slug: string;
  title: string;
  reason: 'high-hints' | 'stale' | 'gave-up';
}

export interface ProgressInsights {
  totalProblems: number;
  totalAttempts: number;
  byPattern: PatternStat[];       // ranked, most-struggled first
  weakestLink: PatternStat | null;
  revisit: RevisitItem[];
}

/** Struggle score: more hints, more attempts, harder problems, and give-ups all raise it. */
export function computeStruggleScore(input: {
  avgHintsUsed: number;
  avgAttempts: number;
  gaveUpRate: number;
  avgDifficultyWeight: number;
}): number {
  const { avgHintsUsed, avgAttempts, gaveUpRate, avgDifficultyWeight } = input;
  // Weighted sum; scaled so the numbers stay in a readable range. The exact
  // weights are a judgement call — documented here so they're tunable, not magic.
  return (
    avgHintsUsed * 2 +
    Math.max(0, avgAttempts - 1) * 1.5 +   // 1 attempt is baseline; extra attempts = struggle
    gaveUpRate * 4 +
    avgDifficultyWeight * 0.5
  );
}

function bestAttempt(r: ProblemRecord) {
  return r.attempts[r.bestAttemptIndex] ?? r.attempts[r.attempts.length - 1];
}

/**
 * Aggregates records into per-pattern stats + a weakest-link + a revisit list.
 * A problem with N patterns fans out into all N pattern buckets.
 */
export function computeInsights(records: ProblemRecord[]): ProgressInsights {
  const totalAttempts = records.reduce((sum, r) => sum + r.attempts.length, 0);

  // Group problems by pattern (fan-out).
  const buckets = new Map<ProblemPattern, ProblemRecord[]>();
  for (const r of records) {
    for (const p of r.patterns) {
      const arr = buckets.get(p) ?? [];
      arr.push(r);
      buckets.set(p, arr);
    }
  }

  const byPattern: PatternStat[] = [];
  for (const [pattern, recs] of buckets) {
    const problemCount = recs.length;
    const bests = recs.map(bestAttempt).filter(Boolean);
    const avgHintsUsed = mean(bests.map(a => a.hintsUsed));
    const avgAttempts = mean(recs.map(r => r.attempts.length));
    const gaveUpCount = recs.filter(r => bestAttempt(r)?.outcome === 'gave-up').length;
    const gaveUpRate = problemCount > 0 ? gaveUpCount / problemCount : 0;
    const difficultyMix = { Easy: 0, Medium: 0, Hard: 0 };
    for (const r of recs) difficultyMix[r.difficulty]++;
    const avgDifficultyWeight = mean(recs.map(r => DIFFICULTY_WEIGHT[r.difficulty]));

    byPattern.push({
      pattern,
      problemCount,
      avgHintsUsed,
      avgAttempts,
      gaveUpCount,
      difficultyMix,
      struggleScore: computeStruggleScore({ avgHintsUsed, avgAttempts, gaveUpRate, avgDifficultyWeight }),
      lowConfidence: problemCount < 3,   // don't overclaim on tiny N (design §7)
    });
  }

  byPattern.sort((a, b) => b.struggleScore - a.struggleScore);

  // Weakest link: highest struggle among patterns we have *some* confidence in;
  // if everything is low-confidence, still surface the top one but flagged.
  const confident = byPattern.filter(p => !p.lowConfidence);
  const weakestLink = confident[0] ?? byPattern[0] ?? null;

  // Revisit list: gave-up, high-hint, or stale-since-last-touch.
  const now = Date.now();
  const staleMs = REVISIT_STALE_DAYS * 24 * 60 * 60 * 1000;
  const revisit: RevisitItem[] = [];
  for (const r of records) {
    const best = bestAttempt(r);
    if (best?.outcome === 'gave-up') revisit.push({ slug: r.slug, title: r.title, reason: 'gave-up' });
    else if ((best?.hintsUsed ?? 0) >= HIGH_HINT_THRESHOLD) revisit.push({ slug: r.slug, title: r.title, reason: 'high-hints' });
    else if (now - r.lastUpdatedAt > staleMs) revisit.push({ slug: r.slug, title: r.title, reason: 'stale' });
  }

  return {
    totalProblems: records.length,
    totalAttempts,
    byPattern,
    weakestLink,
    revisit,
  };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
