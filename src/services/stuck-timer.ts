/**
 * Stuck Timer Service
 *
 * Detects when a user has been inactive on a problem and proactively
 * suggests a learning aid.
 *
 * How it works:
 * - Starts a timer when the problem page loads
 * - Resets the timer whenever the user clicks an action button
 * - After 5 minutes of inactivity, fires a suggestion callback
 * - Rate-limited to once every 10 minutes
 */

import type { ActionType, StuckSuggestion } from '../types';

const STUCK_DELAY_MS = 5 * 60 * 1000;   // 5 minutes
const COOLDOWN_MS   = 10 * 60 * 1000;   // 10 minutes

export class StuckTimer {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private lastSuggestionTime = 0;
  private onSuggestion: (suggestion: StuckSuggestion) => void;
  private enabled: boolean;

  constructor(
    onSuggestion: (suggestion: StuckSuggestion) => void,
    enabled = true
  ) {
    this.onSuggestion = onSuggestion;
    this.enabled = enabled;
  }

  /** Start (or restart) the inactivity timer */
  start(difficulty?: string): void {
    this.stop();
    if (!this.enabled) return;

    this.timerId = setTimeout(() => {
      const now = Date.now();
      if (now - this.lastSuggestionTime < COOLDOWN_MS) return;

      this.lastSuggestionTime = now;
      this.onSuggestion(this.buildSuggestion(difficulty));
    }, STUCK_DELAY_MS);
  }

  /** Stop the timer (call when user takes an action) */
  stop(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /** Enable or disable proactive suggestions */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  private buildSuggestion(difficulty?: string): StuckSuggestion {
    // Suggest hint for easy/medium, breakdown for hard
    const suggestedAction: ActionType =
      difficulty === 'Hard' ? 'BREAK_DOWN_PROBLEM' : 'GET_HINT';

    const messages: Record<ActionType, string> = {
      GET_HINT: "Feeling stuck? A hint might help get you unstuck 💡",
      BREAK_DOWN_PROBLEM: "Hard problem? Try breaking it into smaller pieces 🧩",
      GENERATE_EXAMPLES: "Try generating new examples to see the pattern 🔢",
      EXPLAIN_CONCEPT: "Want a concept explanation? 📚",
      CHECK_APPROACH: "Have an idea? Let me review your approach ✅",
      TIME_COMPLEXITY_HINT: "Wondering about the optimal complexity? ⏱️",
      PATTERN_RECOGNITION: "Try identifying the algorithmic pattern 🔍",
    };

    return {
      message: messages[suggestedAction],
      suggestedAction,
      canDismiss: true,
    };
  }
}
