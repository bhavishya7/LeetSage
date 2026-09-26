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
 * state; the "Try:" prefix marks the rest as suggestions.
 */
export const PLACEHOLDER_EXAMPLES: string[] = [
  'Ask a question…',
  'Try: what pattern is this?',
  'Try: give me another example',
  'Try: break this down into steps',
  'Try: what is the time complexity?',
  'Try: explain the key concept',
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
