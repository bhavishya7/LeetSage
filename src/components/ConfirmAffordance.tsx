import React from 'react';
import type { ActionType } from '../types';

/**
 * ONE affordance, three jobs (design §6): the exempt-action guardrail, the
 * borderline `ask` outcome, AND transparency. Reused for both an exempt match
 * and a borderline non-exempt match — the copy + emphasis adapt to `reason`.
 *
 * Controlled + presentational: it renders the prompt + two buttons and calls
 * back. It fires NO API calls itself — the parent decides what "Yes" (→
 * handleActionClick) and "Just answer" (→ chat) do.
 *
 * Layout: a VERTICAL card (heading row, then a full-width two-button row) so it
 * reads cleanly in the narrow side panel and never overflows the right edge.
 * The `exempt` reason gets a louder treatment (amber "heads-up" accent + ring +
 * shadow) because it's about to reveal the full solution — the one thing
 * LeetSage normally withholds — so the pause is meaningful, not noise.
 */

type ConfirmReason = 'exempt' | 'borderline';

interface ConfirmAffordanceProps {
  /** Which situation raised this — drives the copy + emphasis. */
  reason: ConfirmReason;
  /** The action a "Yes" tap would dispatch. */
  action: ActionType;
  /** Yes → run the matched action (identical to a button press). */
  onConfirm: () => void;
  /** Just answer → fall through to free-form chat. */
  onDismiss: () => void;
}

/** Verb-phrase labels for the confirm button ("Yes, <label>"). */
const CONFIRM_LABELS: Record<ActionType, string> = {
  GET_HINT: 'give me a hint',
  GENERATE_EXAMPLES: 'generate examples',
  BREAK_DOWN_PROBLEM: 'break it down',
  EXPLAIN_CONCEPT: 'explain the concept',
  CHECK_APPROACH: 'analyze my code',
  TIME_COMPLEXITY_HINT: 'give a complexity hint',
  PATTERN_RECOGNITION: 'identify the pattern',
  UNDERSTAND_SOLUTION: 'walk me through the full solution',
  GENERATE_REPORT: 'generate a report',
};

/**
 * The heading + explanatory line. For an exempt action the copy conveys the
 * STAKES (this reveals the full worked solution — normally withheld) so the
 * user makes a deliberate choice, rather than restating the obvious ("you want
 * X"). For a borderline match it frames the genuine ambiguity.
 */
function copyFor(reason: ConfirmReason, action: ActionType): { icon: string; heading: string; body: string } {
  if (reason === 'exempt') {
    if (action === 'UNDERSTAND_SOLUTION') {
      return {
        icon: '🔓',
        heading: 'Reveal the full solution?',
        body: "This walks through the complete optimal solution — the thing LeetSage usually holds back so you can crack it yourself. Sure you don't want a hint first?",
      };
    }
    if (action === 'CHECK_APPROACH') {
      return {
        icon: '🔬',
        heading: 'Analyze your code in full?',
        body: 'This reviews your actual editor code in depth (approach, efficiency, style) rather than nudging you toward the answer.',
      };
    }
    // GENERATE_REPORT and any future exempt action.
    return {
      icon: '📝',
      heading: 'Generate the full write-up?',
      body: 'This produces a complete study note for this problem, including the solution — more than a coaching nudge.',
    };
  }
  // Borderline / ambiguous.
  return {
    icon: '🤔',
    heading: 'Run this as a coaching action?',
    body: `That looked like a request to ${CONFIRM_LABELS[action]}. Want the structured coaching card, or just a direct answer?`,
  };
}

const ConfirmAffordance: React.FC<ConfirmAffordanceProps> = ({ reason, action, onConfirm, onDismiss }) => {
  const { icon, heading, body } = copyFor(reason, action);
  const loud = reason === 'exempt';

  return (
    <div
      role="alertdialog"
      aria-label={heading}
      className={`mx-3 mb-2 shrink-0 rounded-lg p-3 leetsage-pop-in
        ${loud
          ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-400/60 dark:border-amber-500/50 ring-1 ring-amber-400/40 shadow-lg shadow-amber-900/10'
          : 'bg-purple-50 dark:bg-purple-950/40 border border-purple-400/60 dark:border-purple-500/50 ring-1 ring-purple-400/40 shadow-md'}`}
    >
      {/* Heading row — the icon sits inline with the HEADING only, so the body
          text below aligns flush-left with the card edge (not indented under
          the emoji). */}
      <p className={`text-[13px] font-semibold flex items-center gap-1.5 ${loud ? 'text-amber-800 dark:text-amber-200' : 'text-purple-800 dark:text-purple-200'}`}>
        <span className="text-base leading-none shrink-0" aria-hidden>{icon}</span>
        {heading}
      </p>
      <p className="text-[11px] mt-1 mb-2 text-neutral-600 dark:text-neutral-300 leading-snug">
        {body}
      </p>

      {/* Full-width action row — both buttons flex to fill, so nothing overflows
          and the layout stays balanced (no left-text / right-buttons mismatch). */}
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className={`flex-1 px-2.5 py-1.5 rounded-md text-[12px] font-semibold transition-colors
            ${loud
              ? 'bg-amber-400 hover:bg-amber-500 text-amber-950'
              : 'bg-purple-500 hover:bg-purple-600 text-white'}`}
        >
          Yes, {CONFIRM_LABELS[action]}
        </button>
        <button
          onClick={onDismiss}
          className="flex-1 px-2.5 py-1.5 rounded-md text-[12px] font-medium border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 bg-white/60 dark:bg-neutral-800/60 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
        >
          Just answer my question
        </button>
      </div>
    </div>
  );
};

export default ConfirmAffordance;
