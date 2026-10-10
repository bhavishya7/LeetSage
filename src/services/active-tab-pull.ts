/**
 * Active-tab pull decision logic — the pure "what do I do next?" brain behind
 * App.tsx's `pullFromActiveTab`. Extracted so the stale-tab injection flow is
 * unit-testable without a DOM / React / live chrome.* harness.
 *
 * BACKGROUND (bug B21). The side panel pulls the current problem from the
 * active tab's content script (`REQUEST_PROBLEM_DATA`). On a LeetCode tab that
 * was opened BEFORE the extension was (re)installed there is NO auto-injected
 * content script, so the first message fails with "Receiving end does not
 * exist." The panel must then inject `content.js` via `chrome.scripting` and
 * retry. The original code only allowed that inject on `attempt === 0` and used
 * a short retry window, so an already-rendered problem page (whose DOM scrape
 * races the retry chain) often needed a MANUAL reload. This brain fixes that:
 *
 *   - It may inject on ANY attempt while the receiver is still missing, as long
 *     as we haven't already injected (a one-shot guard prevents inject loops).
 *   - After a "no receiver → inject" it keeps retrying across a WIDER window so
 *     a page that's already rendered gets scraped without a manual reload.
 *
 * It stays faithful to the pull-based architecture (design: the panel asks; the
 * worker may be asleep) — this only hardens the inject fallback + retry.
 */

/** Result of a single `REQUEST_PROBLEM_DATA` round-trip. */
export type PullOutcome =
  /** Got usable problem data back. */
  | 'ok'
  /** "Receiving end does not exist" — no content script on this tab (stale tab). */
  | 'no-receiver'
  /** Receiver exists but no data yet (content script still extracting). */
  | 'not-ready';

/** What the caller should do next. */
export type PullAction =
  /** Apply the data we just received and stop. */
  | 'apply'
  /** Inject content.js, then re-pull after a short grace. */
  | 'inject'
  /** Wait DELAY_MS and pull again (same tab, receiver present). */
  | 'retry'
  /** Out of attempts — stop. */
  | 'giveup';

/** State carried across attempts within one pull cycle. */
export interface PullState {
  /** 0-based attempt counter. */
  attempt: number;
  /** Whether we've already injected content.js this cycle (one-shot). */
  hasInjected: boolean;
}

/**
 * Max message attempts before giving up. Widened from the original 6 so an
 * already-rendered stale tab has enough post-inject retries to be scraped
 * (B21). At DELAY_MS spacing this spans ~7s, comfortably over the content
 * script's own extraction retry/backoff.
 */
export const MAX_ATTEMPTS = 10;
/** Spacing between ordinary retries. */
export const DELAY_MS = 700;
/** Grace after a manual inject before the first re-pull (let the script boot). */
export const POST_INJECT_DELAY_MS = 400;

/**
 * Pure decision: given the current attempt state and the outcome of the latest
 * message, decide the next action. This is the whole B21 behavior change,
 * isolated for testing.
 *
 * Rules:
 *   - `ok`              → 'apply'.
 *   - `no-receiver`     → 'inject' IF we haven't injected yet AND attempts
 *                         remain (one-shot: a second no-receiver after injecting
 *                         means the inject didn't help — fall through to retry/
 *                         giveup rather than inject-looping).
 *   - otherwise (`not-ready`, or a repeat `no-receiver` after injecting)
 *                       → 'retry' while attempts remain, else 'giveup'.
 */
export function decidePullAction(outcome: PullOutcome, state: PullState): PullAction {
  if (outcome === 'ok') return 'apply';

  const attemptsRemain = state.attempt < MAX_ATTEMPTS;

  if (outcome === 'no-receiver' && !state.hasInjected && attemptsRemain) {
    return 'inject';
  }

  return attemptsRemain ? 'retry' : 'giveup';
}

/**
 * Classifies a `chrome.tabs.sendMessage` result into a PullOutcome. `response`
 * is whatever the content script sent back; `lastErrorMessage` is
 * `chrome.runtime.lastError?.message` (undefined when there was no error).
 */
export function classifyPullResult(
  response: { success?: boolean; data?: unknown } | undefined,
  lastErrorMessage: string | undefined,
): PullOutcome {
  if (lastErrorMessage) {
    return lastErrorMessage.includes('Receiving end does not exist')
      ? 'no-receiver'
      : 'not-ready';
  }
  if (response?.success && response.data) return 'ok';
  return 'not-ready';
}
