import type { Candidate, IntentDef, RouterContext } from './types';
import { INTENT_REGISTRY } from './registry';

/**
 * classify(message, context) → Candidate[]  (R2.1, R6.2, design §1)
 *
 * PURE, LOCAL, ZERO API. Matches the message against every intent's patterns in
 * the registry and returns one Candidate per intent that matched, each scored
 * with a confidence in [0, 1]. No side effects, no network — sub-millisecond.
 *
 * Confidence model (deliberately simple — a heuristic, not a model):
 *   - Base from how many of the intent's patterns matched (more distinct
 *     signals ⇒ more confident it's really that intent).
 *   - A small context-sharpening bump when the intent `requiresCodeContext` and
 *     the user actually has code in the editor (R4.3). This is a nudge; the
 *     hard tiebreak lives in resolveOverlap.
 *
 * The scoring is intentionally monotonic and bounded so the golden-set test can
 * pin exact outcomes. If a future LLM classifier replaces this, it just has to
 * return the same Candidate[] shape — call sites don't change (R2.3, design §9).
 */

/**
 * Confidence model. A registry pattern is a fairly SPECIFIC signal (e.g. "give
 * me a hint", "break this down"), so a SINGLE match is already a confident read
 * of the intent — it clears the HIGH band and routes decisively. Additional
 * matches only push it toward the ceiling. The abstain (`ask`) band is therefore
 * driven mostly by the RESOLVER's near-tie detection between competing intents,
 * not by "only one weak keyword" — which is what the golden set showed we want
 * (a lone clear keyword should route, not ask).
 */
/** A single pattern match already clears the HIGH band (decisive route). */
const BASE_MATCH = 0.9;
/** Each ADDITIONAL matched pattern nudges confidence toward the ceiling. */
const EXTRA_MATCH = 0.05;
/** Bump applied when a requiresCodeContext intent matches and code is present. */
const CODE_CONTEXT_BONUS = 0.05;
/** Confidence is clamped to this ceiling so a match is never "certain". */
const MAX_CONFIDENCE = 0.99;

function countMatches(message: string, patterns: RegExp[]): number {
  let n = 0;
  for (const p of patterns) {
    // Defensive: registry patterns omit flags; test case-insensitively without
    // mutating the shared RegExp (avoids lastIndex state from the `g` flag).
    const re = new RegExp(p.source, p.flags.includes('i') ? p.flags : p.flags + 'i');
    if (re.test(message)) n++;
  }
  return n;
}

function scoreIntent(intent: IntentDef, matchCount: number, context: RouterContext): number {
  // 1 match → 0.9 (decisive); each extra match adds a little; clamped < 1.
  let confidence = Math.min(BASE_MATCH + (matchCount - 1) * EXTRA_MATCH, MAX_CONFIDENCE);
  if (intent.requiresCodeContext && context.hasCode) {
    confidence = Math.min(confidence + CODE_CONTEXT_BONUS, MAX_CONFIDENCE);
  }
  return confidence;
}

export function classify(message: string, context: RouterContext): Candidate[] {
  const normalized = message.toLowerCase().trim();
  if (!normalized) return [];

  const candidates: Candidate[] = [];
  for (const intent of INTENT_REGISTRY) {
    const matchCount = countMatches(normalized, intent.patterns);
    if (matchCount === 0) continue;
    candidates.push({ intent, matchCount, confidence: scoreIntent(intent, matchCount, context) });
  }

  // Highest confidence first; ties broken by weight so the ordering is stable
  // and deterministic (resolveOverlap relies on a defined order, never on
  // registry/match iteration order — design §4 lesson).
  candidates.sort((a, b) =>
    b.confidence - a.confidence || b.intent.weight - a.intent.weight,
  );
  return candidates;
}
