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
