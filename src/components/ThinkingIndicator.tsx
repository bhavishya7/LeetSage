import React, { useEffect, useState } from 'react';

/**
 * The B1 pre-display "working" state (see .kiro/specs/leetsage-guardrail-hardening).
 *
 * For NON-EXEMPT actions we do not stream the model's tokens into the card —
 * the guardrail (filterResponse) must run BEFORE anything is shown, so a leak is
 * never briefly visible. While the response accumulates in memory, the card
 * shows THIS instead: a calm, pulsing three-dot indicator plus a short,
 * action-aware label (see thinking-labels.ts).
 *
 * B5 — keep it from feeling FROZEN on slow actions. Because B1 withholds the
 * whole stream, the user now waits the full generation time (e.g. Concept can
 * take 5–6s) with no streamed tokens to signal progress. So after a short grace
 * period the indicator (a) rotates to a reassuring second-stage phrase and
 * (b) shows an elapsed-seconds counter — a lightweight "still working" signal,
 * not a real progress bar (we can't know how far along the model is). The dot
 * animation is presentation-only (CSS keyframe `leetsage-dot-pulse` in
 * index.css); this staged copy is the only added logic.
 */

/** After this long with no reveal, switch to the "still working" messaging. */
const STAGE_TWO_MS = 3000;

const ThinkingIndicator: React.FC<{ label: string }> = ({ label }) => {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    // Tick a few times a second — cheap, and the card unmounts on reveal/error.
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
    return () => clearInterval(id);
  }, []);

  const inStageTwo = elapsedMs >= STAGE_TWO_MS;
  // Stage one: the action-aware label as-is. Stage two: a calmer "still on it"
  // phrase so the text visibly changes (proof of life) without implying an error.
  const text = inStageTwo ? 'Still working on it…' : label;
  const seconds = Math.floor(elapsedMs / 1000);

  return (
    <div className="flex items-center gap-2 py-1.5" role="status" aria-live="polite" aria-label={label}>
      <span className="flex items-center gap-1" aria-hidden="true">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 leetsage-dot" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 leetsage-dot" style={{ animationDelay: '160ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 leetsage-dot" style={{ animationDelay: '320ms' }} />
      </span>
      <span className="text-[13px] text-neutral-500 dark:text-neutral-400 italic">{text}</span>
      {/* Elapsed-seconds hint appears only once we're in stage two, so quick
          responses (<3s) never flash a distracting counter. */}
      {inStageTwo && (
        <span className="text-[11px] text-neutral-400 dark:text-neutral-500 tabular-nums" aria-hidden="true">
          {seconds}s
        </span>
      )}
    </div>
  );
};

export default ThinkingIndicator;
