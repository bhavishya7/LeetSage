import React from 'react';

/**
 * The B1 pre-display "working" state (see .kiro/specs/leetsage-guardrail-hardening).
 *
 * For NON-EXEMPT actions we do not stream the model's tokens into the card —
 * the guardrail (filterResponse) must run BEFORE anything is shown, so a leak is
 * never briefly visible. While the response accumulates in memory, the card
 * shows THIS instead: a calm, pulsing three-dot indicator plus a short,
 * action-aware label (see thinking-labels.ts) so it reads as actively working,
 * never a frozen blank card.
 *
 * The animation is presentation-only; it does not touch the gate logic. The
 * staggered dot pulse is a CSS keyframe (`leetsage-dot-pulse`) defined in
 * index.css so the three dots fade in sequence.
 */
const ThinkingIndicator: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-2 py-1.5" role="status" aria-live="polite" aria-label={label}>
    <span className="flex items-center gap-1" aria-hidden="true">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 leetsage-dot" style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 leetsage-dot" style={{ animationDelay: '160ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 leetsage-dot" style={{ animationDelay: '320ms' }} />
    </span>
    <span className="text-[13px] text-neutral-500 dark:text-neutral-400 italic">{label}</span>
  </div>
);

export default ThinkingIndicator;
