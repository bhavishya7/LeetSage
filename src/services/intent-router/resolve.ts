import type { Candidate, Decision, RouterContext } from './types';
import { routeTo, askAbout, chatFallthrough } from './types';

/**
 * resolveOverlap(candidates, context) → Decision  (R4, R5, design §4/§5)
 *
 * PURE. Collapses the classifier's Candidate[] into ONE three-way decision:
 *   - route(action)  — a decisive winner (high confidence, clear precedence).
 *   - ask(action)    — a plausible winner the resolver can't make decisively
 *                      (the ABSTAIN band) → confirm with the user.
 *   - chat           — low/no confidence, OR genuine multi-intent → fall through
 *                      to free-form chat (one call answers a multi-part question).
 *
 * Precedence (design §4): context-sharpening → weight → confidence bands. The
 * ordering is explicit so ties are never resolved by accident (match/iteration
 * order). The abstain band is the honest "not sure" outcome a binary threshold
 * can't express (modeled on allow/deny/abstain classifiers).
 */

/** At/above this the winner is decisive → route. */
const HIGH_BAND = 0.9;
/** In [BORDERLINE_BAND, HIGH_BAND) the winner is plausible but not decisive → ask. */
const BORDERLINE_BAND = 0.45;
/** Below BORDERLINE_BAND → chat (chat answers a broad question directly anyway). */

/**
 * Two candidates are "near-tied" when their confidences are within this delta —
 * the resolver can't decisively pick one on confidence alone, so precedence
 * (context, then weight) must break it; if it still can't, that's an `ask`.
 */
const NEAR_TIE_DELTA = 0.15;

export function resolveOverlap(candidates: Candidate[], context: RouterContext): Decision {
  // No signal → just chat (R1.2: uncertainty defaults to chat, never a guess).
  if (candidates.length === 0) return chatFallthrough();

  // classify() already sorted by confidence desc, then weight desc.
  const [top, second] = candidates;

  // --- Genuine multi-intent → chat (R5, design §5) -------------------------
  // Multiple HIGH-confidence candidates from DIFFERENT intent families that
  // precedence can't collapse to one = the user asked for several distinct
  // things. Don't fire N actions or pick one arbitrarily; chat answers the
  // whole multi-part question in ONE call. We treat "uncollapsible" as: both
  // near the top confidence AND same weight tier AND neither sharpened by
  // context — i.e. no principled reason to prefer one.
  if (second && isGenuineMultiIntent(top, second, context)) {
    return chatFallthrough();
  }

  // --- Context sharpening (first tiebreaker, R4.3) -------------------------
  // If a requiresCodeContext candidate is present and code is available, and it
  // is at least near-tied with the top, it wins — "complexity of MY code"
  // (Analyze) beats generic Complexity when the editor has code.
  if (context.hasCode) {
    const sharpened = candidates.find(
      c => c.intent.requiresCodeContext && top.confidence - c.confidence <= NEAR_TIE_DELTA,
    );
    if (sharpened && sharpened !== top) {
      return decideForWinner(sharpened);
    }
  }

  // --- Weight tiebreak when the top two are near-tied (R4.2) ---------------
  // classify sorts weight-desc within equal confidence, so `top` already holds
  // the higher weight on an exact tie. If they're near-tied but a clear weight
  // gap exists, the higher-weight (more specific) intent is the winner.
  if (second && top.confidence - second.confidence <= NEAR_TIE_DELTA) {
    if (top.intent.weight === second.intent.weight) {
      // Same confidence tier AND same weight = truly ambiguous → ask about the
      // top (the confirm lets the user redirect to plain chat).
      return askAbout(top.intent.target);
    }
    // Different weights: the sort already put the heavier one first → it wins.
  }

  // --- Confidence bands (R4.4, R4.5) ---------------------------------------
  return decideForWinner(top);
}

/**
 * Map a single winning candidate to route/ask/chat by its confidence band.
 * (The exempt-vs-non-exempt guardrail is applied later, in `route()`, so this
 * stays purely about confidence — a high-confidence exempt match returns
 * `route` here and `route()` turns it into the confirm affordance.)
 */
function decideForWinner(winner: Candidate): Decision {
  if (winner.confidence >= HIGH_BAND) return routeTo(winner.intent.target);
  if (winner.confidence >= BORDERLINE_BAND) return askAbout(winner.intent.target);
  return chatFallthrough();
}

/**
 * Genuine multi-intent: two candidates that are both plausible, sit in the same
 * weight tier, and aren't disambiguated by code context — so there's no
 * principled single winner. Distinct targets is required (the same intent
 * matching twice isn't multi-intent).
 */
function isGenuineMultiIntent(top: Candidate, second: Candidate, context: RouterContext): boolean {
  if (top.intent.target === second.intent.target) return false;
  const bothPlausible = second.confidence >= BORDERLINE_BAND;
  const nearTied = top.confidence - second.confidence <= NEAR_TIE_DELTA;
  const sameTier = top.intent.weight === second.intent.weight;
  // If code context sharpens exactly one of them, precedence CAN collapse it —
  // so it isn't genuine multi-intent.
  const contextBreaksTie =
    context.hasCode &&
    Boolean(top.intent.requiresCodeContext) !== Boolean(second.intent.requiresCodeContext);
  return bothPlausible && nearTied && sameTier && !contextBreaksTie;
}
