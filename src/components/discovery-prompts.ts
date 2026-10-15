/**
 * Discovery affordances data (R8, design §8). Because the five niche actions
 * lost their buttons (action-streamlining), chat has to TEACH that those
 * intents still exist. These example asks power a rotating placeholder and a
 * small row of "Try asking…" chips.
 *
 * Purely presentational data — nothing here triggers an API call (R8.2). Each
 * example is phrased so the intent router will actually route it, so tapping a
 * chip demonstrates the routing (it fills the input; the user still sends it).
 */

/**
 * Rotating placeholder examples cycled in the chat input so users discover the
 * intents that lost their buttons. The leading "Ask a question…" is the resting
 * state; the rest are bare example questions.
 *
 * B11 (chat-polish): these deliberately carry NO "Try: " prefix. The "Try asking:"
 * framing lives on the chip row (`TRY_ASKING_CHIPS` below), so prefixing the
 * placeholder too made the user see "Try" twice on an empty chat (exactly when
 * both surfaces show). One "Try", on the chips — the placeholder just shows the
 * example question. See .kiro/specs/leetsage-chat-polish (B11).
 */
export const PLACEHOLDER_EXAMPLES: string[] = [
  'Ask a question…',
  'what pattern is this?',
  'give me another example',
  'break this down into steps',
  'what is the time complexity?',
  'explain the key concept',
];

/**
 * "Try asking…" chips shown above the input. Kept short (fits a narrow side
 * panel) and mapped to the dereferenced intents so users rediscover them.
 */
export const TRY_ASKING_CHIPS: string[] = [
  'What pattern is this?',
  'Give me another example',
  'Break this down into steps',
  "What's the time complexity?",
];

/**
 * B12 — resolve the text a chat submission should send.
 *
 * An explicit `text` argument (e.g. a tapped "Try asking…" chip) takes
 * precedence over the live input-box state. This is the race-free part of the
 * B12 fix: calling `setChatInput(chip)` and then reading `chatInput` in the same
 * tick would still see the OLD value (React batches state), so a chip tap must
 * carry its own text through to the submit path rather than round-tripping
 * through state. The input bar's Send/Enter pass `undefined` and fall back to
 * the current input. Pure + trimmed so it can be unit-tested without the
 * component. See .kiro/specs/leetsage-chat-polish (B12).
 */
export function resolveSubmitText(explicit: string | undefined, inputValue: string): string {
  return (explicit ?? inputValue).trim();
}

/**
 * B24 — the chat input placeholder must reflect the SPECIFIC reason the input is
 * disabled, never collapse every disabled state into the no-key copy.
 *
 * The bug: App derived the placeholder from `canInteract = apiKeyConfigured &&
 * !!problemContext && !isLoading` — one boolean overloaded for both "is the input
 * usable?" (correct) AND "which placeholder copy?" (wrong). The instant a request
 * started, `isLoading` flipped `canInteract` false and the key-fine user was told
 * to "Configure your API key first" mid-stream. This helper separates the copy
 * decision from the enable/disable gate (App keeps using `canInteract` for the
 * actual `disabled=` wiring).
 *
 * Priority order (first match wins):
 *   1. no key   — the only state the user must ACT on; keep the genuine no-key copy.
 *   2. off-page — NOT on a coachable problem page (URL-based signal, R4). The
 *                 inputs are hard-disabled here; this copy explains why.
 *   3. loading  — on a problem page but the problem context is still being pulled
 *                 (the MV3 pull/retry window). Distinct from off-page so a real
 *                 page mid-load never reads as "no problem" (R4.4).
 *   4. busy     — a request is in flight: a neutral "Thinking…".
 *   5. healthy  — the normal rotating example.
 *
 * Coaching-logic-overhaul (R4) note: `onProblemPage` is the URL-based signal
 * (the active tab is a /problems/ page), which is load-INDEPENDENT and so safe
 * to hard-gate on. `hasProblem` means the problem CONTEXT has finished loading.
 * Separating them is what lets the off-page copy be truthful without ever
 * mislabeling a real page that's still loading as "off-page".
 *
 * Pure + DOM-free so it unit-tests under this repo's `node` vitest env.
 */
export interface PlaceholderState {
  /** A Gemini API key is configured. */
  apiKeyConfigured: boolean;
  /**
   * The active tab is a coachable LeetCode problem page (URL-based, R4). When
   * omitted, defaults to `hasProblem` for backward compatibility with callers
   * that only track loaded context.
   */
  onProblemPage?: boolean;
  /** The problem CONTEXT has finished loading (problemContext is non-null). */
  hasProblem: boolean;
  /** A request is in flight. */
  isLoading: boolean;
  /** The current rotating example (PLACEHOLDER_EXAMPLES[placeholderIdx]). */
  rotatingExample: string;
}

export function chatPlaceholder(s: PlaceholderState): string {
  const onPage = s.onProblemPage ?? s.hasProblem;
  if (!s.apiKeyConfigured) return 'Configure your API key first';
  if (!onPage) return 'Open a LeetCode problem to use the coaching tools';
  if (!s.hasProblem) return 'Reading this problem…';
  if (s.isLoading) return 'Thinking…';
  return s.rotatingExample;
}
