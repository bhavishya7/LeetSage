# LeetSage — Progress Tracking & Study Notes (PLANNED / HIGH PRIORITY IDEA)

> Status: **Idea, documented. The user's most important future feature.**
> Not started. Overlaps with the existing Phase 3 analytics spec
> (.kiro/specs/leetsage-phase3-analytics/) — these should likely be merged or
> cross-referenced when we build them.

## The vision (in the user's words)

A living record of the user's LeetCode journey that serves TWO purposes at once:
1. **Study notes** — refer back to how a problem was solved, why, and what the
   best solution is, when reviewing later.
2. **Progress report** — updates automatically as problems are solved, and
   updates AGAIN if the same problem is later solved a different or faster way.

For each solved problem, the user wants to capture:
- How they solved it (their approach / solution)
- How they arrived at the best solution
- What the best solution actually is
- What type/category of problem it was (pattern, topic)
- Updates over time: if re-solved better/faster, the record reflects the
  improvement.

## Why it matters

This is the payoff of the whole "learn deeply" philosophy — a personal,
growing knowledge base + measurable progress. It's the feature the user cares
about most.

## The hard part: persistence infrastructure

Real-time, durable, cross-session tracking needs somewhere to live. Options
(the user does NOT want to commit to implementation yet — just capturing them):

1. **Local file download** — a "generate report" / "export" that writes a
   file (markdown/JSON) to the user's machine. Simple, no backend, no accounts.
   Downside: manual, not truly "real-time synced".
2. **Accounts + backend** — real sync across devices, automatic updates.
   Downside: major infrastructure (auth, DB, hosting, cost) — conflicts with the
   current zero-backend, BYOK posture. Only if this becomes a real product.
3. **chrome.storage (local)** — automatic, no backend, persists across sessions
   on that browser. Already used for progress today. Downside: single-browser,
   not portable, storage limits.

## Pragmatic near-term MVP (the user's own suggestion)

Start simple to get value fast, defer the hard infrastructure:
- A **"Generate report" button** that produces a text/markdown report for the
  current problem (or session): problem name, type/pattern, the approach taken,
  how the best solution was reached, the best solution, complexity, notes.
- A **"Copy" button** on AI responses so any generated content (including the
  report) can be copied out.
- The user pastes it into a separate Kiro IDE window / their own notes file to
  track manually for now.
- This ships value immediately with almost no infrastructure, and validates the
  format before we invest in automatic persistence.

## Likely phased path (to discuss when we build)

- **Phase A (MVP):** Generate-report + copy-to-clipboard. Manual tracking.
- **Phase B:** Auto-store per-problem records in chrome.storage; a "My Progress"
  view listing solved problems with their notes; update-on-resolve logic.
- **Phase C (only if it becomes a real product):** export/import file for
  portability, and/or accounts + backend for true sync.

## Dependencies / connections to existing code

- Phase 3 analytics spec already covers adjacent data (hints used, time spent,
  submission success/failure, "problems to revisit"). Progress tracking and
  analytics share a per-problem record store — design them together.
- Detecting "solved" and "solved faster" reliably needs reading LeetCode's
  submission result (Accepted + runtime), which is new content-script extraction
  work (same challenge noted in the Phase 3 spec).
- The Monaco code extractor (already built) can capture the solution code for
  the record.

## Open questions

- What triggers a record update — a manual "save to notes" button, or auto on
  detected Accepted submission?
- Where does the canonical record live for v1 (chrome.storage vs exported file)?
- How do we represent "best solution so far" and detect an improvement
  (faster runtime? fewer lines? different pattern)?

## Immediate next step when we pick this up

Build the MVP: "Generate report" action + "Copy" button on responses. Low
effort, high value, and it de-risks the format before bigger infrastructure.
