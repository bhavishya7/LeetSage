import type { LearningContent, AnalyzeData, UnderstandData, ReportData, ProblemPattern, ProgressState, Complexity, Attempt } from '../types';

/**
 * Builds a compact, FACTUAL session digest from the structured data blocks that
 * earlier actions stored on their metadata (see
 * .kiro/specs/leetsage-structured-output §5).
 *
 * Why deterministic (not another LLM call): the facts we need — what approach
 * the user tried, what complexity was found, which patterns, how many hints —
 * already exist as structured `data` on the content history. Re-summarizing the
 * prose with the model would be token-heavy and lossy (it would have to re-parse
 * its own earlier prose). Instead we assemble the digest at read time directly
 * from the structured fields, cheaply and reliably. This digest + the final code
 * is what the report LLM call receives, so the report reflects what the user
 * ACTUALLY did rather than a generic textbook writeup.
 *
 * Returns an empty string when there's nothing structured to report — the caller
 * then falls back to the plain (code-only) report prompt.
 */
export function buildSessionDigest(
  history: LearningContent[],
  progress: ProgressState | null,
): string {
  const lines: string[] = [];

  // Hint usage (tracked separately; the report reads it directly — §3.4).
  const hintLevel = progress?.hintLevel ?? 0;
  const hintEntries = history.filter(c => c.actionType === 'GET_HINT').length;
  if (hintEntries > 0 || hintLevel > 0) {
    const reached = hintLevel >= 3 ? ' (reached the deepest, implementation-level hint)'
      : hintLevel === 2 ? ' (reached the approach-level hint)'
      : hintLevel === 1 ? ' (used a conceptual hint)'
      : '';
    lines.push(`- Hints used: ${Math.max(hintEntries, hintLevel)}${reached}.`);
  }

  // CHECK_APPROACH analyses (may be several — the user iterated on their code).
  const analyses = history
    .map(c => c.metadata?.structured)
    .filter((d): d is AnalyzeData => !!d && 'approachDetected' in d);
  if (analyses.length > 0) {
    if (analyses.length === 1) {
      const a = analyses[0];
      lines.push(
        `- Analyzed their code once: approach was "${a.approachDetected}" at ` +
        `${fmt(a.currentComplexity)}; optimal is ${fmt(a.optimalComplexity)}` +
        `${a.onOptimalPath ? ' (they were on the optimal path)' : ' (not yet on the optimal path)'}.`,
      );
    } else {
      const first = analyses[0];
      const last = analyses[analyses.length - 1];
      lines.push(
        `- Analyzed their code ${analyses.length} times — first attempt "${first.approachDetected}" at ` +
        `${fmt(first.currentComplexity)}, latest "${last.approachDetected}" at ${fmt(last.currentComplexity)}; ` +
        `optimal is ${fmt(last.optimalComplexity)}.`,
      );
    }
    const issues = Array.from(new Set(analyses.flatMap(a => a.issues))).slice(0, 4);
    if (issues.length > 0) lines.push(`- Issues raised during analysis: ${issues.join('; ')}.`);
  }

  // UNDERSTAND_SOLUTION explanations (patterns + key insight + optimal cost).
  const understandings = history
    .map(c => c.metadata?.structured)
    .filter((d): d is UnderstandData => !!d && 'keyInsight' in d);
  if (understandings.length > 0) {
    const u = understandings[understandings.length - 1];
    if (u.patterns.length > 0) lines.push(`- Pattern(s): ${u.patterns.join(', ')}.`);
    if (u.keyInsight) lines.push(`- Key insight covered: ${u.keyInsight}`);
    lines.push(`- Optimal complexity discussed: ${fmt(u.optimalComplexity)}.`);
  }

  // Free-form chat questions the user asked (count only — content is prose).
  const questions = history.filter(c => c.metadata?.isUserQuery).length;
  if (questions > 0) lines.push(`- Asked ${questions} free-form question${questions === 1 ? '' : 's'} during the session.`);

  if (lines.length === 0) return '';

  return `SESSION ACTIVITY (what the developer actually did this session — ground the report in THIS, not a generic textbook writeup):\n${lines.join('\n')}`;
}

function fmt(c: { time: string; space: string }): string {
  return `${c.time} time / ${c.space} space`;
}

// ---------------------------------------------------------------------------
// Projection into a progress-record Attempt (Progress-Tracking Phase B).
//
// Same principle as buildSessionDigest: read the structured `data` blocks off
// the session history instead of re-parsing prose or making another LLM call.
// This is what "records populate from structured output" (design §3.3 step 1)
// actually means in code.
// ---------------------------------------------------------------------------

/** The structured facts distilled from a session, ready to fill a record. */
export interface SessionFacts {
  patterns: ProblemPattern[];
  /** Best-known optimal complexity discussed (from UNDERSTAND_SOLUTION), else the latest analysis' optimal. */
  optimalComplexity: Complexity | null;
  /** The complexity the user's latest code actually achieved (from CHECK_APPROACH). */
  achievedComplexity: Complexity | null;
  /** Short description of the latest approach the user tried. */
  approachSummary: string;
  /** Whether the latest analysis put them on the optimal path. */
  onOptimalPath: boolean;
  hintsUsed: number;
}

function latest<T>(items: T[]): T | undefined {
  return items.length ? items[items.length - 1] : undefined;
}

/** Pulls the structured facts out of the session history + progress. */
export function extractSessionFacts(
  history: LearningContent[],
  progress: ProgressState | null,
): SessionFacts {
  const analyses = history
    .map(c => c.metadata?.structured)
    .filter((d): d is AnalyzeData => !!d && 'approachDetected' in d);
  const understandings = history
    .map(c => c.metadata?.structured)
    .filter((d): d is UnderstandData => !!d && 'keyInsight' in d);

  const lastAnalysis = latest(analyses);
  const lastUnderstand = latest(understandings);

  // Patterns are only emitted by UNDERSTAND_SOLUTION today; union across all of
  // them so re-explanations that name different patterns are captured.
  const patterns: ProblemPattern[] = [];
  for (const u of understandings) for (const p of u.patterns) if (!patterns.includes(p)) patterns.push(p);

  return {
    patterns,
    optimalComplexity: lastUnderstand?.optimalComplexity ?? lastAnalysis?.optimalComplexity ?? null,
    achievedComplexity: lastAnalysis?.currentComplexity ?? null,
    approachSummary: lastAnalysis?.approachDetected ?? '',
    onOptimalPath: lastAnalysis?.onOptimalPath ?? false,
    hintsUsed: progress?.hintLevel ?? 0,
  };
}

/**
 * What actually gets saved: the record's patterns + the Attempt. The report's
 * OWN structured data (ReportData) is the primary source when present — it's the
 * most authoritative and always available on a report, even when the user never
 * ran UNDERSTAND_SOLUTION. The session facts fill any gaps.
 */
export interface RecordProjection {
  patterns: ProblemPattern[];
  attempt: Attempt;
}

/**
 * Builds the record projection from the session facts, the report's own
 * structured data (if the model emitted it), the report markdown, and the
 * editor language.
 *
 * Precedence: report data > session facts. Patterns are the union of both so
 * nothing is lost. Complexity prefers the user's achieved complexity (from
 * analysis), then the report/understand optimal, then unknown.
 */
export function buildRecordProjection(
  facts: SessionFacts,
  reportData: ReportData | null,
  reportMarkdown: string,
  language?: string,
): RecordProjection {
  const patterns = unionPatterns(reportData?.patterns ?? [], facts.patterns);

  const complexity: Complexity =
    facts.achievedComplexity ??
    reportData?.optimalComplexity ??
    facts.optimalComplexity ??
    { time: 'O(?)', space: 'O(?)' };

  // "solved" is inferred (we can't verify a real submission — that's Phase D):
  // trust the report's own judgement first, else whether analysis put them on
  // the optimal path.
  const solved = reportData?.solvedOptimally ?? facts.onOptimalPath;

  const approachSummary =
    facts.approachSummary || reportData?.approachSummary || 'Approach not captured.';

  return {
    patterns,
    attempt: {
      date: Date.now(),
      outcome: solved ? 'solved' : 'attempted',
      approachSummary,
      solutionSummary: reportMarkdown,
      complexity,
      hintsUsed: facts.hintsUsed,
      language,
    },
  };
}

/** Union two pattern lists, preserving order, dropping duplicates. */
function unionPatterns(a: ProblemPattern[], b: ProblemPattern[]): ProblemPattern[] {
  const out: ProblemPattern[] = [...a];
  for (const p of b) if (!out.includes(p)) out.push(p);
  return out;
}
