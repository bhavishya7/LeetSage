# LeetSage — Progress Export / Import: Design

> **Status: 📐 Planned — not yet built.** Design for [requirements.md](./requirements.md).
> Teaching format: **DESIGN** + **📚 SYSTEM-DESIGN LESSON**. Grounds against
> `ProgressView.tsx` (`buildAllNotesMarkdown`, Copy all), `progress-records.ts`
> (`getProgressIndex` / `getRecord` / `saveAttempt` / `migrate` / `record_{slug}` +
> `progress_index`), `progress-analytics.ts` (`computeInsights`), `types/models.ts`
> (`ProblemRecord`, `Attempt`, `PROBLEM_RECORD_SCHEMA_VERSION`).

---

## 1. Shape of the work: export is easy, import is the real design

Export is a pure serialize-then-download. Import ingests an **untrusted file** into
persistent storage, so it carries validation + migration + merge — that's where the
rigor goes. Put the logic in a dedicated, mostly-pure module
(`src/services/progress-io.ts`) so it's testable without the DOM/chrome APIs; keep
the actual file download / file-picker (the impure edges) thin in the UI.

> 📚 **SYSTEM-DESIGN LESSON — the dangerous direction is IN.** Reading data out is
> low-risk; writing external data into your system is where corruption, injection,
> and schema drift enter. Spend the design budget on the ingress path (validate,
> migrate, merge) and keep the egress path boring.

## 2. Markdown export (combined report) *(R1)*

One document = **insights summary** (from `computeInsights`) + **full per-problem
detail** (extend the existing `buildAllNotesMarkdown` to also emit each record's
attempts timeline, not just the note). Structure:

```
# LeetSage Progress — <date>
## Summary
- Problems tracked: N
- Weakest link: <pattern> (<confidence>, based on K problems)
- Patterns: Hash Map ×4, Two Pointers ×3, …
- Worth revisiting: <title> (reason), …
---
# <Problem title> (<Difficulty>)
_Patterns: … · N attempts_
### History
1. solved · best — O(N) time / O(1) space · 2 hints · python — <approach>
2. …
### Note
<the saved report markdown>
---
（next problem…）
```

Reuse `computeInsights` (already powers the Insights panel) for the summary so the
report and the UI never disagree.

> 📚 **SYSTEM-DESIGN LESSON — one source of truth for a computed view.** The report's
> summary is generated from the same `computeInsights` the UI uses, not a parallel
> re-computation. Two code paths computing "the same" numbers is how a doc and a UI
> drift apart.

## 3. JSON export (portable backup) *(R2)*

A versioned envelope, records as the payload:

```ts
interface ProgressExport {
  format: 'leetsage-progress';
  formatVersion: 1;            // the EXPORT file format version
  schemaVersion: number;       // PROBLEM_RECORD_SCHEMA_VERSION at export time
  exportedAt: number;          // epoch ms
  records: ProblemRecord[];    // the source of truth
}
```

The `progress_index` is **not** exported — it's a derived projection, rebuilt from
records on import (R2.2). Envelope carries both a *file-format* version and the
*record schema* version so import can reason about compatibility independently.

> 📚 **SYSTEM-DESIGN LESSON — version the envelope AND the payload, and never
> serialize derived data.** The file format and the record schema evolve on
> different clocks, so version them separately. And exporting the index (a
> projection) would let it drift from the records; export only the source of truth
> and rebuild projections on load — the same reason you don't back up a cache.

## 4. Import pipeline — reconstruct, don't validate-in-place *(R3, R5)*

Import ingests an untrusted file into privileged, persistent storage. The whole
pipeline lives in `progress-io.ts` as pure functions (except the final write), and
the governing rule is **reconstruct, don't validate-in-place**: never store the
parsed objects — build fresh trusted records, copying only known fields through
sanitizers. Stages, fail-closed:

1. **Size gate (hard fail).** Reject before parsing if the raw text exceeds the max
   file size (a few MB, well under the ~10MB quota). Prevents DoS via a giant file.
2. **Parse (hard fail).** `JSON.parse` in try/catch → malformed ⇒ reject, touch
   nothing. Never `eval`/`Function`.
3. **Envelope gate (hard fail).** `format === 'leetsage-progress'`, sane
   `formatVersion`, `records` is an array, count under the max-records cap. Not ours
   or too big ⇒ reject entirely.
4. **Reconstruct each record (per-record skip).** For each entry, build a NEW record
   via `sanitizeRecord(raw)`:
   - Copy ONLY known fields by explicit assignment into a fresh object (never spread
     the untrusted object). Reject/strip `__proto__`/`constructor`/`prototype` keys.
   - `slug` → `^[a-z0-9-]+$`, length-capped, else skip the record.
   - `title`/`notes`/`approachSummary`/`solutionSummary` → coerce to string,
     **neutralize HTML** (strip/escape), length-cap each (§5 XSS + DoS).
   - `difficulty`/`outcome` → must be exactly in the enum (else skip or default).
   - `patterns` → filter to the known `ProblemPattern` vocabulary.
   - numbers (`date`, `firstSolvedAt`, `lastUpdatedAt`, `hintsUsed`) → `Number` +
     finite + sane-range; reject `NaN`/`Infinity`/negatives.
   - `attempts` → cap count, reconstruct each attempt the same way.
   - `bestAttemptIndex` → **ignore the file's value; recompute** via
     `computeBestAttemptIndex(attempts)`.
   - Unsanitizable record ⇒ skip + count (never write it); never aborts the batch.
5. **Migrate.** Run each reconstructed record through the existing per-record
   `migrate()`.
6. **Merge (newer-wins per slug).** Pure `mergeRecords(existing, incoming)`: add if
   new; if the slug exists, keep the later `lastUpdatedAt`. Idempotent. Returns
   merged set + `{added, updated, skipped}`.
7. **Quota check + atomic write.** If the merged set would exceed a safe storage
   budget ⇒ fail closed. Else write all `record_{slug}` and **rebuild
   `progress_index`** from the merged set — construct the full result in memory
   first so a failure can't half-update storage (R3.5).

Stages 1–6 are pure → unit-testable against good / malformed / oversized /
XSS-payload / prototype-pollution / out-of-bounds fixtures.

> 📚 **SYSTEM-DESIGN LESSON — reconstruct beats validate-in-place.** "Check the
> object then store it" leaves every field you forgot to check as an attack vector.
> Building a fresh object from only known, sanitized fields means anything you
> didn't explicitly allow simply doesn't survive — unknown-field injection,
> prototype pollution, and type confusion die by construction. It's an allowlist,
> not a denylist.

> 📚 **SYSTEM-DESIGN LESSON — the file is an untrusted client; the store is
> privileged.** Treat import exactly like an unauthenticated API request writing to
> your database: size-limit, schema-validate, sanitize rendered strings, reject
> dangerous keys, recompute derived values, fail closed. Same discipline as the
> prompt-injection work, applied to a file. The extra teeth here (XSS, prototype
> pollution, quota) exist because the write target is persistent + privileged.

> 📚 **SYSTEM-DESIGN LESSON — idempotent, last-writer-wins merge.** Newer-wins by
> `lastUpdatedAt` per key makes import idempotent (re-import = no-op) and
> order-independent — standard conflict resolution for offline/eventually-consistent
> data (CRDT-lite). v1 merges whole records; per-attempt union is deferred.

### 4a. Stored-XSS: verify the renderer (R5.1.2)

The importer sanitizing strings is defense-in-depth; the *primary* defense depends
on the render path. **Build MUST verify** how the app's Markdown renderer treats raw
HTML in `notes`/content (it currently renders `notes` in a `<pre>` in
`RecordDetail`, which is text-safe — but the same note markdown may render elsewhere
via the app's markdown component). If the renderer escapes/strips HTML → good,
importer sanitization backs it up. If it renders raw HTML → that's a pre-existing
latent stored-XSS hole (a hostile note could execute regardless of import); **fix it
here** (escape HTML / disallow raw HTML in the renderer), because import turns a
latent hole into a live one.

> 📚 **SYSTEM-DESIGN LESSON — a feature can weaponize a latent flaw.** The renderer
> may have quietly rendered HTML "safely" only because all content came from the LLM
> (itself filtered). Import introduces attacker-authored content, converting a
> dormant issue into an exploitable one. New ingress paths demand re-checking old
> assumptions about where data comes from.

## 5. The download/upload mechanics (the impure edges) *(R4)*

- **Download:** build the string → `Blob` → `URL.createObjectURL` → a temporary
  `<a download=filename>` click → revoke the URL. **VERIFY at build time** whether
  this anchor approach works in the MV3 side-panel context or whether the
  `chrome.downloads` API (and a `"downloads"` manifest permission) is required —
  do not assume; test it. If `chrome.downloads` is needed, note the added
  permission (relevant to the scope-permissions work — keep it minimal).
- **Upload:** a hidden `<input type="file" accept="application/json,.json">`;
  read via `FileReader`/`text()`, hand the string to the pure import pipeline.

> 📚 **SYSTEM-DESIGN LESSON — keep effects at the edges, logic in the middle.** The
> Blob/anchor/FileReader/chrome APIs are thin impure shells; all the reasoning
> (serialize, validate, migrate, merge) is pure and tested. This is the same
> classify→resolve→route shape as the routing spec: effects only at the boundary.

## 6. UI *(R6)*

In the My Progress header, beside "Copy all": a small **Download ▾** (Markdown /
JSON) and an **Import** action. Import shows a result toast/line
("Imported: 3 added, 1 updated, 0 skipped" or a specific rejection reason).
UI change → eyeball before commit.

## 7. What would change this design

- **Per-attempt merge** (union attempt timelines instead of newer-record-wins) —
  deferred; would replace §4 step 5's whole-record policy.
- **Auto-generated/continuously-saved report** — the future enhancement the user
  named; would add a background writer, out of scope here.
- **Markdown re-import** — not supported (Markdown is lossy vs. the JSON source of
  truth); JSON is the round-trip format.

## 8. Cohesion check

- Reuses `computeInsights` (report summary = UI insights, no drift), `migrate`
  (same per-record migration as normal reads), the `record_{slug}` + `progress_index`
  storage contract, and extends `buildAllNotesMarkdown` rather than forking it.
- The JSON round-trip directly de-risks the **scope-permissions** data wipe (export
  before, import after) and addresses the single-browser limitation from the
  progress-tracking design.
- Untrusted-file validation fits the pre-launch **security/vuln-scan** mindset.
