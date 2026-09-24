# LeetSage — Structured Output: Requirements

> **Status: ✅ SHIPPED.** These requirements were **backfilled** (written after
> implementation) to complete the spec trilogy for a flagship feature — the
> `design.md` was written first and the feature was built from it; this document
> captures the acceptance criteria the shipped code actually satisfies, verified
> against the source. See [design.md](./design.md) for the *how/why* and
> [tasks.md](./tasks.md) for the implementation breakdown.
>
> Requirements use EARS-style phrasing ("WHEN … THE SYSTEM SHALL …"). Each maps to
> real code in `src/services/structured-parser.ts`, `src/services/session-digest.ts`,
> `src/services/prompts.ts`, and `src/types/`.

---

## Problem statement

Every action returned freeform Markdown prose only, so downstream consumers (the
study-note report, progress records, analytics, evals) had no reliable
machine-readable facts to consume — forcing prose re-parsing or an extra LLM call.
Structured output introduces a hybrid response: human prose **plus** a small,
schema-conforming `data` block, so the facts become a single source of truth.

## Scope

In scope: the three report-feeding actions — `CHECK_APPROACH`,
`UNDERSTAND_SOLUTION`, `GENERATE_REPORT`. Out of scope (intentionally prose-only):
`GET_HINT`, `GENERATE_EXAMPLES`, `EXPLAIN_CONCEPT`, `TIME_COMPLEXITY_HINT`,
`PATTERN_RECOGNITION`.

---

## Requirements

### R1 — Hybrid prose + data contract
- **R1.1** WHEN a structured action's response is finalized, THE SYSTEM SHALL
  separate it into human-readable `prose` and an optional machine-readable `data`
  object (`ParsedStructured { prose, data? }`).
- **R1.2** THE SYSTEM SHALL define per-action data schemas as TypeScript types:
  `AnalyzeData` (CHECK_APPROACH), `UnderstandData` (UNDERSTAND_SOLUTION), and
  `ReportData` (GENERATE_REPORT), unified as `StructuredData`.
- **R1.3** THE SYSTEM SHALL treat the `data` block as the source of truth for
  facts (complexity, patterns, approach), with prose as one rendering of it.

### R2 — Which actions are structured
- **R2.1** THE SYSTEM SHALL treat exactly `CHECK_APPROACH`, `UNDERSTAND_SOLUTION`,
  and `GENERATE_REPORT` as structured actions (`isStructuredAction`).
- **R2.2** WHEN any other action runs, THE SYSTEM SHALL treat its response as
  prose-only (no data block parsed).

### R3 — Prompt contract for the model
- **R3.1** WHEN building the prompt for a structured action, THE SYSTEM SHALL
  instruct the model to append the data as a single JSON object inside a fenced
  block tagged `leetsage-data`, after the prose, matching the action's schema.
- **R3.2** THE SYSTEM SHALL provide the model an explicit schema and example for
  that block (`structuredDataRules(schema, example)`).

### R4 — Tolerant parsing (never break the UI)
- **R4.1** THE `parseStructuredResponse` function SHALL never throw.
- **R4.2** WHEN the `leetsage-data` block is absent, THE SYSTEM SHALL return the
  full text as prose with `data` undefined (prose-only degradation).
- **R4.3** WHEN the block is present but contains malformed JSON, THE SYSTEM SHALL
  strip the raw block from the prose and degrade to prose-only (never surface the
  failed JSON to the user).
- **R4.4** WHEN the tagged fence is missing but a ```` ```json ```` fence contains
  an object with known keys, THE SYSTEM SHALL accept it as a looser fallback.
- **R4.5** WHEN parsed JSON fails schema validation, THE SYSTEM SHALL keep the
  (block-stripped) prose and drop `data`.

### R5 — Validation & normalization
- **R5.1** THE SYSTEM SHALL validate each action's data against its schema and
  return `null` (→ prose-only) if required fields are missing (e.g. a `Complexity`
  with neither time nor space).
- **R5.2** THE SYSTEM SHALL constrain `patterns[]` to a **closed vocabulary**
  (`ProblemPattern`, 23 values), canonicalizing free-text names and common aliases,
  mapping anything unrecognized to `'Other'`, and de-duplicating.
- **R5.3** THE SYSTEM SHALL normalize complexity to `{ time, space }` with an
  `'O(?)'` placeholder when a side is missing.

### R6 — Streaming coexistence
- **R6.1** WHILE a structured response is streaming, THE SYSTEM SHALL hide the
  (possibly partial) `leetsage-data` block from the displayed prose
  (`stripDataBlockForDisplay`), so the user never sees raw JSON flash by.
- **R6.2** WHEN the stream completes, THE SYSTEM SHALL perform the authoritative
  prose/data split once via `parseStructuredResponse`.

### R7 — Persistence of structured data
- **R7.1** THE SYSTEM SHALL store a finalized `data` block on
  `ContentMetadata.structured`, persisted with `ProgressState.contentHistory`.

### R8 — Report consumes structured data (the payoff)
- **R8.1** WHEN generating a report, THE SYSTEM SHALL build a deterministic
  **session digest** (`buildSessionDigest`) from the structured `data` on the
  session history — hints used, analyses (approach + measured complexity), patterns
  and key insight, and question count — WITHOUT an extra LLM summarization call.
- **R8.2** WHEN there is no structured activity, THE SYSTEM SHALL return an empty
  digest so the caller falls back to the plain code-only report prompt.

### R9 — Feeds progress records (forward dependency)
- **R9.1** THE SYSTEM SHALL expose `extractSessionFacts` / `buildRecordProjection`
  so Progress-Tracking Phase B can populate a `ProblemRecord` attempt from the same
  structured fields.
- **R9.2** WHEN both report data and (possibly stale) session facts are present,
  THE SYSTEM SHALL treat the report's own `ReportData` as authoritative for the
  final state.
- **R9.3** THE SYSTEM SHALL record the complexity the user *achieved* (not the
  discussed optimal) unless the report marks the problem `solvedOptimally` — so a
  brute-force attempt is not mislabeled with optimal Big-O (honesty on inferred data).

### R10 — Verification
- **R10.1** THE SYSTEM SHALL be covered by tests exercising valid/malformed/absent
  data blocks and the prose-only fallback (Vitest), gated by CI.

---

## Non-goals / explicitly deferred

- Structuring the other five actions (done only when a consumer needs them).
- A provider-native JSON/`response_format` mode (the fenced-block + tolerant-parse
  approach was chosen; provider JSON mode remains a possible future upgrade).
- Rendering prose *from* data client-side to guarantee consistency (design §6.3) —
  noted as a future hardening, not built.
