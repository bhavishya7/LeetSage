import type { StuckSuggestion } from '../types';

// Less frequent than before (was 5min / 10min) to avoid nagging.
const STUCK_DELAY_MS = 8 * 60 * 1000;   // wait 8 min of inactivity
const COOLDOWN_MS = 20 * 60 * 1000;     // at most one suggestion per 20 min

/** Context the timer uses to pick a still-useful suggestion. */
export interface StuckContext {
  difficulty?: string;
  /** True when all 3 hints have already been used (don't suggest Hint). */
  hintsExhausted?: boolean;
}

export class StuckTimer {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private lastSuggestionTime = 0;
  private onSuggestion: (suggestion: StuckSuggestion) => void;
  private enabled: boolean;

  constructor(onSuggestion: (suggestion: StuckSuggestion) => void, enabled = true) {
    this.onSuggestion = onSuggestion;
    this.enabled = enabled;
  }

  start(ctx: StuckContext = {}): void {
    this.stop();
    if (!this.enabled) return;
    this.timerId = setTimeout(() => {
      const now = Date.now();
      if (now - this.lastSuggestionTime < COOLDOWN_MS) return;
      this.lastSuggestionTime = now;
      this.onSuggestion(this.pickSuggestion(ctx));
    }, STUCK_DELAY_MS);
  }

  private pickSuggestion(ctx: StuckContext): StuckSuggestion {
    // If hints are used up, never suggest Hint (that action is gone from the UI).
    if (ctx.hintsExhausted) {
      return ctx.difficulty === 'Hard'
        ? { message: 'Still stuck? Try breaking it into smaller pieces 🧩', suggestedAction: 'BREAK_DOWN_PROBLEM', canDismiss: true }
        : { message: 'Want me to look at your approach? 🔬', suggestedAction: 'CHECK_APPROACH', canDismiss: true };
    }
    return ctx.difficulty === 'Hard'
      ? { message: 'Hard problem? Try breaking it into smaller pieces 🧩', suggestedAction: 'BREAK_DOWN_PROBLEM', canDismiss: true }
      : { message: 'Feeling stuck? A hint might help 💡', suggestedAction: 'GET_HINT', canDismiss: true };
  }

  stop(): void { if (this.timerId !== null) { clearTimeout(this.timerId); this.timerId = null; } }
  setEnabled(enabled: boolean): void { this.enabled = enabled; if (!enabled) this.stop(); }
}
