# LeetSage Phase 3 — Learning Analytics (PLANNED, DISTANT / NOT STARTED)

> Status: **Planned, distant.** The user described this as "a very distant
> enhancement" because it's the most complex and depends on data we don't yet
> capture (e.g. submission results). Captured here so the intent isn't lost.

## Purpose

Track the user's learning over time so LeetSage shows growth, not just one-off
help. This reinforces the "learning tool, not answer machine" identity and is
something Ask Leet doesn't do for the individual learner.

## What to track (as the user described)

1. **Which hints were used** per problem (already partially tracked via
   `ProgressState.usedActions` / `hintLevel` in Phase 1).
2. **Whether the user revealed / looked at the full solution** (a "I gave up /
   saw the solution" signal). Requires a way to record this — likely a manual
   "I looked it up" button, since we won't scrape LeetCode's solution tab.
3. **Time spent** per problem.
4. **Submission success vs failure counts** — how many attempts before solving.
   NOTE: capturing submission results means detecting LeetCode's Accepted/Wrong
   Answer state from the page DOM (new content-script extraction work).
5. **Flagship feature — "problems to revisit":** flag problems the user
   struggled with (needed many hints, multiple failed submissions, or revealed
   the solution) so they can come back and re-attempt them later. This was the
   feature the user was most excited about.

## Why this is Phase 3 (dependencies / complexity)

- Submission success/failure tracking requires new DOM extraction of LeetCode's
  result state — non-trivial and DOM-fragile.
- "Time spent" needs reliable session start/stop tracking per problem.
- A cross-problem analytics view needs a new UI surface (dashboard / list),
  which is bigger than the current single-panel layout.
- All of it needs a persistent per-problem history store beyond the current
  per-problem progress (which Phase 1 already writes to chrome.storage).

## Requirements (rough, to refine when we get here)

1. Persist a per-problem learning record: hints used, hint levels reached,
   solution-revealed flag, time spent, attempts (success/fail), last-visited.
2. A "flag to revisit" mechanism (auto-suggested when struggle is detected,
   and/or manually toggled by the user).
3. A review surface listing flagged/struggled problems with quick links back.
4. Optional: topic/pattern breakdown ("you lean on hints most for DP / graphs").

## Notes for when we build this

- Build on Phase 1's existing `ProgressState` + `chrome.storage` progress
  persistence rather than a new store if possible.
- Consider storage growth / cleanup (Phase 1 storage service has patterns for
  per-problem keys; may need periodic pruning).
- Keep it local-only (no backend) to stay consistent with the BYOK, zero-cost
  posture — unless the managed-backend question is revisited first.
