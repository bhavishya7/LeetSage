import type { ActionType } from '../types';

/**
 * Action-aware labels for the B1 pre-display "thinking" placeholder
 * (see .kiro/specs/leetsage-guardrail-hardening and ThinkingIndicator.tsx).
 *
 * Kept in its OWN non-component module so ThinkingIndicator.tsx can export only
 * the component (the react-refresh/only-export-components lint rule), while the
 * gate test and the component both import the label helper from here.
 *
 * Short, present-continuous labels so the card reads as actively working. Chat
 * (tagged EXPLAIN_CONCEPT internally) reads better as "Answering…"; anything
 * unmapped falls back to a neutral "Thinking…".
 */
const THINKING_LABELS: Partial<Record<ActionType, string>> = {
  GET_HINT: 'Thinking of a hint…',
  BREAK_DOWN_PROBLEM: 'Breaking it down…',
  EXPLAIN_CONCEPT: 'Explaining…',
  TIME_COMPLEXITY_HINT: 'Estimating complexity…',
  GENERATE_EXAMPLES: 'Coming up with examples…',
  PATTERN_RECOGNITION: 'Spotting the pattern…',
};

const NEUTRAL_LABEL = 'Thinking…';

/**
 * Picks the placeholder label. `isChat` overrides with "Answering…" (the
 * free-form chat response card is tagged EXPLAIN_CONCEPT internally, but reads
 * better as "Answering" in chat).
 */
export function thinkingLabel(actionType: ActionType, isChat = false): string {
  if (isChat) return 'Answering…';
  return THINKING_LABELS[actionType] ?? NEUTRAL_LABEL;
}
