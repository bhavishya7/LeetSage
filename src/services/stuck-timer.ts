import type { ActionType, StuckSuggestion } from '../types';

const STUCK_DELAY_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 10 * 60 * 1000;

export class StuckTimer {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private lastSuggestionTime = 0;
  private onSuggestion: (suggestion: StuckSuggestion) => void;
  private enabled: boolean;

  constructor(onSuggestion: (suggestion: StuckSuggestion) => void, enabled = true) {
    this.onSuggestion = onSuggestion;
    this.enabled = enabled;
  }

  start(difficulty?: string): void {
    this.stop();
    if (!this.enabled) return;
    this.timerId = setTimeout(() => {
      const now = Date.now();
      if (now - this.lastSuggestionTime < COOLDOWN_MS) return;
      this.lastSuggestionTime = now;
      const suggestedAction: ActionType = difficulty === 'Hard' ? 'BREAK_DOWN_PROBLEM' : 'GET_HINT';
      this.onSuggestion({
        message: difficulty === 'Hard' ? "Hard problem? Try breaking it into smaller pieces 🧩" : "Feeling stuck? A hint might help 💡",
        suggestedAction, canDismiss: true,
      });
    }, STUCK_DELAY_MS);
  }

  stop(): void { if (this.timerId !== null) { clearTimeout(this.timerId); this.timerId = null; } }
  setEnabled(enabled: boolean): void { this.enabled = enabled; if (!enabled) this.stop(); }
}
