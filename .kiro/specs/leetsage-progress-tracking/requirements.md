# LeetSage — Progress Tracking & Study Notes: Requirements

> **Status: ✅ Phases A, B & C SHIPPED.** Phase A (single-problem "Generate
> report" + copy). Phase B (persistent per-problem records + "My Progress" view).
> Phase C (cross-problem analytics / "weakest link" + revisit list). **Phase D
> (auto-save on a detected Accepted submission) is NOT built** — deferred.
> See [design.md](./design.md) (the system-design teaching doc) and
> [tasks.md](./tasks.md) (implementation breakdown).
>
> **Decisions locked in and honored in the build:**
> - Pattern source: **LLM classification into a fixed vocabulary** (the closed
>   `ProblemPattern` set, canonicalized) — LeetCode topic-tag scraping remains a
>   later upgrade.
> - Save trigger: **explicit "Save to my progress" button** — auto-save on a
>   detected Accepted submission is the deferred Phase D.
>
> Converges with the Phase 3 analytics spec
> (.kiro/specs/leetsage-phase3-analytics/): the Phase C analytics here *is* that
> convergence point.
>
> The **acceptance criteria** below (EARS-style) were **backfilled** from the
> shipped code (`src/services/progress-records.ts`, `progress-analytics.ts`,
> `session-digest.ts`, `src/components/ProgressView.tsx`, `src/types/`). The
> original **vision** (in the user's words) is preserved below them for context.

---

## Acceptance criteria (as-built)

### R1 — Phase A: single-problem report + copy *(shipped)*
- **R1.1** WHEN the user runs `GENERATE_REPORT`, THE SYSTEM SHALL produce a
  Markdown study note (problem, pattern, approach, best solution, complexity,
  notes).
- **R1.2** THE SYSTEM SHALL provide a per-card **Copy** control to copy any
  response (including the report) to the clipboard.

### R2 — Data model *(Phase B)*
- **R2.1** THE SYSTEM SHALL persist a `ProblemRecord` per problem, keyed by a
  stable `slug` derived from the normalized `/problems/{slug}/` URL.
- **R2.2** THE record SHALL carry a `schemaVersion`, a fixed-vocabulary
  `patterns[]`, an append-only `attempts[]` log, a denormalized `bestAttemptIndex`,
  `firstSolvedAt` / `lastUpdatedAt`, and `notes`.

### R3 — Storage layout *(Phase B)*
- **R3.1** THE SYSTEM SHALL store one key per record (`record_{slug}`) plus a
  lightweight `progress_index` projection (`ProblemIndexEntry[]`) — not one blob.
- **R3.2** WHEN saving one problem, THE SYSTEM SHALL write only that record's key
  and the index (not rewrite every record).
- **R3.3** THE "My Progress" list SHALL render from the index alone.

### R4 — Save write-path & honest attempts *(Phase B)*
- **R4.1** WHEN the user clicks "Save to my progress", THE SYSTEM SHALL
  read-modify-write the record: append or in-place-update the latest attempt,
  recompute `bestAttemptIndex`, union patterns, and bump `lastUpdatedAt`.
- **R4.2** THE SYSTEM SHALL append a genuinely new attempt only on a real re-solve
  (a different calendar day OR a changed approach/complexity); otherwise it SHALL
  replace the latest attempt in place — so re-saving the same solution does not
  inflate the log (`shouldReplaceLatest`).
- **R4.3** THE SYSTEM SHALL populate the attempt from the structured session facts
  (see structured-output spec), storing the complexity the user **achieved** — not
  the discussed optimal — unless the report marks it `solvedOptimally`.
- **R4.4** `bestAttemptIndex` SHALL prefer a solved attempt with the lowest
  complexity rank, tie-broken by fewest hints (`computeBestAttemptIndex`).

### R5 — Migration *(Phase B)*
- **R5.1** WHEN reading a record, THE SYSTEM SHALL run an ordered, idempotent
  `migrate()` bringing it to the current `schemaVersion` (no-op on current records).

### R6 — "My Progress" view *(Phase B)*
- **R6.1** THE SYSTEM SHALL present a problem list (from the index) → a record
  detail with the attempts timeline, per-record copy/delete, and "Copy all".

### R7 — Cross-problem analytics *(Phase C)*
- **R7.1** THE SYSTEM SHALL compute insights deterministically (no AI): group
  records by pattern (fan-out for multi-pattern problems), score struggle
  (`computeStruggleScore` over avg hints, extra attempts, give-up rate, difficulty),
  rank, and surface a **weakest link** + a **revisit list** (gave-up / high-hint /
  stale).
- **R7.2** THE SYSTEM SHALL mark a pattern `lowConfidence` when its problem count
  is `< 3`, and SHALL hide insights until there are ≥3 problems — refusing to
  overclaim on a tiny sample.

### R8 — Honesty as a design stance *(cross-cutting)*
- **R8.1** Because a real submission cannot be verified (that is Phase D), THE
  SYSTEM SHALL treat "solved" as *inferred* and SHALL NOT present inferred data as
  verified (e.g. the raw attempt count is de-emphasized; low-confidence analytics
  are labeled).

### R9 — Verification
- **R9.1** THE pure helpers (`shouldReplaceLatest`, `sameCalendarDay`,
  `computeBestAttemptIndex`, `complexityRank`, `unionPatterns`,
  `computeStruggleScore`, `computeInsights`, migration) SHALL be unit-tested
  (Vitest), gated by CI.

### Non-goals / deferred
- **Phase D** — auto-save on a detected Accepted submission (needs new
  submission-result extraction; the only reliable "solved + runtime" signal).
- Cross-device sync / accounts / backend — out of scope (no-backend posture).
- Export/import to a file for portability — not built ("Copy all" is the manual
  export path for now).

---

## The vision (in the user's words) — original context, preserved

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

## Phased path — AS BUILT (updated post-implementation)

- **Phase A (MVP) ✅ shipped:** Generate-report + copy-to-clipboard.
- **Phase B ✅ shipped:** per-problem records in `chrome.storage.local`
  (`record_{slug}` + `progress_index`), a "My Progress" view, and the
  save/append-vs-replace update logic. *(Note: the original "Phase C" idea of
  export/accounts/backend was re-scoped — see below.)*
- **Phase C ✅ shipped (re-scoped):** cross-problem **analytics** ("weakest link" +
  revisit list) — a deterministic aggregation over the local records. *(The
  export/import + accounts/backend that this bullet originally imagined were split
  out as deferred non-goals; analytics took the "Phase C" slot.)*
- **Phase D — deferred (not built):** auto-save on a detected Accepted submission
  (verified "solved" + runtime).

## Dependencies / connections to existing code

- Phase 3 analytics spec already covers adjacent data (hints used, time spent,
  submission success/failure, "problems to revisit"). Progress tracking and
  analytics share a per-problem record store — design them together.
- Detecting "solved" and "solved faster" reliably needs reading LeetCode's
  submission result (Accepted + runtime), which is new content-script extraction
  work (same challenge noted in the Phase 3 spec).
- The Monaco code extractor (already built) can capture the solution code for
  the record.

## Open questions — RESOLVED (answered by the build)

- *What triggers a record update?* → An explicit **"Save to my progress"** button
  (R4). Auto-on-Accepted is the deferred Phase D.
- *Where does the canonical record live for v1?* → **`chrome.storage.local`**,
  `record_{slug}` + a `progress_index` projection (R3).
- *How to represent "best so far" and detect improvement?* → A denormalized
  `bestAttemptIndex` (solved + lowest complexity rank, tie-broken by hints), with
  append-vs-replace deciding what counts as a new attempt (R4).
