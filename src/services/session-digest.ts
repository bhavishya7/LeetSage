import type { LearningContent, AnalyzeData, UnderstandData, ProgressState } from '../types';

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
