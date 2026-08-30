# LeetSage Phase 2 — Struggle-First Flow (PLANNED, NOT STARTED)

> Status: **Planned.** Captured from planning discussion so the intent isn't
> lost. Do not implement until Phase 1 has been used and any adjustments made.

## Purpose

Phase 2 expresses LeetSage's core identity — the anti-cheating learning coach —
through interaction design, not just prompts. The spine is a **tiered "prove
engagement" gate**: deeper help requires the user to articulate their thinking.

This is what makes LeetSage genuinely different from LeetCode's "Ask Leet"
(a solve-for-you tool). Here, you earn the hint by showing you've engaged.

## The tiered gate (as decided)

Not a strict/punishing gate — a proof-of-engagement one. The guiding principle
the user chose: **"if the person can explain their reasoning in text, let them
have the deeper hints."**

- **Hint level 1** — free, no gate. A conceptual nudge.
- **Hint levels 2 & 3** — require the user to first state what they've tried or
  explain their current approach/reasoning in a text box. If they can articulate
  it, they've earned the deeper hint.
- Keep it **interactive and encouraging**, framed as coaching ("Tell me what
  you're thinking and I'll help you go deeper"), never as a punishment.

Explicitly rejected: a hard time-gate or a hard block with no path forward.
Explicitly rejected: making it so strict it becomes annoying for the primary
user (the developer themselves).

## Requirements (draft)

1. Hint level 1 is available immediately (current behavior).
2. Before serving hint level 2 or 3, prompt the user to describe their approach
   / what they've tried. The AI may use this text to tailor the deeper hint.
3. The gate should feel like a coach asking a question, not a lock.
4. Optionally: let the AI lightly assess whether the explanation shows genuine
   engagement, but err strongly toward being permissive (any real attempt
   passes). Do not gatekeep aggressively.
5. Consider a setting to soften/disable the gate (the developer may want to
   bypass it for their own quick use), though default leans toward the gate
   being on to preserve the identity.

## Notes / open questions for when we build this

- Where does the "explain your approach" input live — inline in the hint card,
  or reuse the existing CHECK_APPROACH free-form flow already built in Phase 1?
- Phase 1 already has: a CHECK_APPROACH action, hint-level tracking
  (`ProgressState.hintLevel`, max 3), and a free-form chat input. Phase 2 can
  likely build on these rather than adding new plumbing.
- Keep the solution filter and no-solutions philosophy intact throughout.
