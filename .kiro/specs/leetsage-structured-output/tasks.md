# LeetSage — Structured Output: Tasks

> **Status: ✅ COMPLETE (shipped).** This task list was **backfilled** to complete
> the spec trilogy; the feature shipped in commit `affc683` (structured-output
> layer + report session digest). Tasks are marked done and annotated with the
> real files/symbols they produced, verified against the source. Requirements
> references (Rx) point at [requirements.md](./requirements.md).

---

- [x] 1. Define the data contract and per-action schemas *(R1, R2, R5.2, R5.3)*
  - `StructuredResponse<T>` / `StructuredData` union and the per-action types
    `AnalyzeData`, `UnderstandData`, `ReportData`, plus `Complexity` and the
    closed `ProblemPattern` vocabulary — in `src/types/`.

- [x] 2. Add the prompt contract for structured actions *(R3)*
  - `structuredDataRules(schema, example)` in `src/services/prompts.ts` instructs
    the model to append a `leetsage-data` fenced JSON block after the prose, with
    a schema + worked example, for `CHECK_APPROACH`, `UNDERSTAND_SOLUTION`, and
    `GENERATE_REPORT`.

- [x] 3. Build the tolerant parser *(R1.1, R2, R4, R5)*
  - `src/services/structured-parser.ts`: `isStructuredAction`,
    `parseStructuredResponse` (never throws), `extractDataBlock` (tagged fence →
    ```` ```json ```` fallback → none), per-action `validate*`, and the
    `toPatterns` / `toComplexity` / `toStr*` normalizers. Malformed/absent/invalid
    data degrades to prose-only with the raw block stripped.

- [x] 4. Handle streaming coexistence *(R6)*
  - `stripDataBlockForDisplay` hides the partial/complete data fence from prose
    shown mid-stream; the authoritative split runs once via
    `parseStructuredResponse` when the stream completes. Wired through the
    streaming path in `src/services/llm-service.ts` / the side panel.

- [x] 5. Persist the structured data *(R7)*
  - Store the finalized `data` on `ContentMetadata.structured` so it rides along
    with `ProgressState.contentHistory`.

- [x] 6. Make GENERATE_REPORT a structured producer + build the session digest *(R8, R9)*
  - `src/services/session-digest.ts`: `buildSessionDigest` assembles a factual
    digest from the session's structured data for the report prompt;
    `extractSessionFacts` + `buildRecordProjection` project those facts into a
    progress-record `Attempt` (report authoritative over stale session facts;
    achieved-vs-optimal complexity honesty). *(Report-as-producer was an evolution
    from the design, where the report was framed as consumer-only.)*
    Commit `538781c` also stopped model-written dates.

- [x] 7. Verify with tests *(R10)*
  - Vitest coverage for the parser (valid / malformed / absent / fallback) and the
    digest/projection logic; part of the suite gated by CI.

---

## Deviations from `design.md` (documented, not silent)

- **`GENERATE_REPORT` became a structured *producer*** (emitting `ReportData`),
  not just a consumer as the design framed it — this made records populate reliably
  even when the user never ran `UNDERSTAND_SOLUTION`.
- **Fenced-block approach chosen** over a provider-native JSON mode (design §6.1
  Option A) — the tolerant `leetsage-data` fence + fallback (Option B) was
  implemented as the primary path.
- **Prompt/data consistency** (design §6.3) is enforced by instruction only;
  rendering prose from data was **not** built (left as a future hardening).
