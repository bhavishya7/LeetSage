import type { ActionType } from '../../types';

/**
 * Chat Intent Routing — core types for the pure classify → resolveOverlap →
 * route pipeline. See .kiro/specs/leetsage-chat-intent-routing.
 *
 * The pipeline turns a free-form chat message into one of three outcomes:
 *   - route(action)  → dispatch the matching action (like a button press)
 *   - ask(action)    → surface a confirm ("Did you want X?") before dispatching
 *   - chat           → fall through to the existing free-form chat path
 *
 * Everything above `route()` is PURE (no side effects, no API), so the whole
 * decision surface is unit-testable against the labeled golden set (R10).
 */

/**
 * A single routable intent, defined as DATA (R6.1). The classifier iterates the
 * registry; the resolver sorts by weight/context; the router derives exemptness
 * from `isSolutionExemptAction(target)`. Adding a future intent = adding one
 * entry — no control-flow edits.
 *
 * NOTE: exemptness is DERIVED from `isSolutionExemptAction(target)`, never
 * stored here — one source of truth for the exempt set (design §2).
 */
export interface IntentDef {
  /** Stable id, e.g. "analyze-complexity", "get-hint". */
  id: string;
  /** The action to route to when this intent wins. */
  target: ActionType;
  /** Cheap match signals (keyword/phrase regexes) over the message. */
  patterns: RegExp[];
  /**
   * Precedence for overlap resolution — higher wins ties (specific beats
   * generic; essential actions outrank niche ones). See resolveOverlap.
   */
  weight: number;
  /**
   * When editor code is present, this intent is "sharpened" — a message about
   * *my* code (e.g. "complexity of my code" → Analyze) should beat a generic
   * candidate. Used as the first tiebreaker in resolveOverlap.
   */
  requiresCodeContext?: boolean;
}

/**
 * Context available to the pure pipeline. Deliberately tiny — the classifier is
 * local and text-first. `hasCode` lets context-sharpening kick in (R4.3).
 */
export interface RouterContext {
  /** True when the user's editor currently has non-empty code. */
  hasCode: boolean;
}

/**
 * One intent the message matched, with a confidence score in [0, 1]. `classify`
 * returns every match; `resolveOverlap` collapses them to a single decision.
 */
export interface Candidate {
  intent: IntentDef;
  /** Confidence in [0, 1] — how strongly the message matched this intent. */
  confidence: number;
  /** Number of distinct registry patterns that matched (drives confidence). */
  matchCount: number;
}

/** The three-way decision `resolveOverlap` returns (R4.1). */
export type Decision =
  | { kind: 'route'; action: ActionType }
  | { kind: 'ask'; action: ActionType }
  | { kind: 'chat' };

/** Convenience constructors so call sites read clearly. */
export const routeTo = (action: ActionType): Decision => ({ kind: 'route', action });
export const askAbout = (action: ActionType): Decision => ({ kind: 'ask', action });
export const chatFallthrough = (): Decision => ({ kind: 'chat' });
