# LeetSage — Progress Tracking & Study Notes: Tasks

> **Status: ✅ Phases A/B/C COMPLETE (shipped); Phase D deferred.** This task list
> was **backfilled** to complete the spec trilogy. Phase A shipped in `758d868`;
> Phases B + C in `798228b`, with `538781c` and `f0b7c58` refining structured
> report production and honest attempt semantics. Tasks are annotated with the
> real files/symbols they produced, verified against the source. Requirements
> references (Rx) point at [requirements.md](./requirements.md).

---

## Phase A — single-problem report + copy *(shipped `758d868`)*

- [x] A1. `GENERATE_REPORT` action producing a Markdown study note *(R1.1)*
- [x] A2. Per-card **Copy** control (clipboard) on responses *(R1.2)*

## Phase B — persistent records + "My Progress" *(shipped `798228b`, refined `538781c`/`f0b7c58`)*

- [x] B1. Data model + types *(R2)*
  - `ProblemRecord`, `ProblemIndexEntry`, `Attempt`, `Complexity`,
    `ProblemPattern`, `PROBLEM_RECORD_SCHEMA_VERSION` in `src/types/`.
- [x] B2. Storage layer with the one-key-per-record + index layout *(R3)*
  - `src/services/progress-records.ts`: `getProgressIndex`, `getRecord`,
    `saveAttempt`, `deleteRecord`; `record_{slug}` + `progress_index` keys;
    `slugFromUrl`; promise-wrapped `chrome.storage.local` helpers; `toIndexEntry`
    projection.
- [x] B3. Save write-path with honest append-vs-replace *(R4)*
  - `saveAttempt` read-modify-write; the pure helpers `shouldReplaceLatest`,
    `sameCalendarDay`, `computeBestAttemptIndex`, `complexityRank`,
    `unionPatterns`. Attempt populated from structured session facts via
    `buildRecordProjection` (structured-output spec); stores achieved complexity,
    not optimal, unless `solvedOptimally`.
- [x] B4. Schema migration on read *(R5)*
  - `migrate()` — ordered, idempotent; no-op on current records; documented
    extension point for future versions.
- [x] B5. "My Progress" view *(R6)*
  - `src/components/ProgressView.tsx`: problem list (from the index) → record
    detail with attempts timeline, per-record copy/delete, and "Copy all".

## Phase C — cross-problem analytics *(shipped `798228b`)*

- [x] C1. Deterministic aggregation pipeline *(R7.1)*
  - `src/services/progress-analytics.ts`: `computeInsights` (group-by-pattern
    fan-out → stats → rank), `computeStruggleScore` (pure, documented weights),
    `PatternStat` / `RevisitItem` / `ProgressInsights`; weakest-link selection and
    the gave-up / high-hint / stale revisit list.
- [x] C2. Low-confidence / small-sample honesty *(R7.2, R8)*
  - `lowConfidence` when `problemCount < 3`; insights hidden below 3 problems;
    Low/Medium/High confidence surfaced; inferred "solved" not shown as verified.

## Verification *(R9)*

- [x] V1. Unit tests for the pure helpers (records + analytics) under Vitest,
  gated by CI (`npm.cmd run test`).

## Phase D — deferred (NOT built)

- [ ] D1. Detect an Accepted submission from the LeetCode result DOM (new
  content-script extraction) and auto-capture a *verified* attempt with runtime —
  the only reliable "solved + faster" signal. Deferred; documented as a non-goal
  for now.

---

## Deviations / re-scoping from the original `requirements.md` (documented)

- **"Phase C" was re-scoped** from the original "export/import + accounts/backend"
  idea to **cross-problem analytics**. The export/accounts/backend items were split
  out as explicit deferred non-goals (no-backend posture); "Copy all" is the manual
  export path for now.
- **Records populate from structured output**, not prose re-parsing — this
  depended on the structured-output layer shipping first (as the design required).
