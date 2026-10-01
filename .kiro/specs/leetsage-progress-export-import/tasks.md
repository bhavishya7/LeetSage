# LeetSage — Progress Export / Import: Tasks

> **Status: ✅ Built (on branch `feature/progress-export-import`, local — awaiting
> review).** Implementation breakdown for [requirements.md](./requirements.md) /
> [design.md](./design.md). Built per `.kiro/steering/workflow.md` (explain-and-STOP
> before committing; UI eyeballed; CI/Husky gate lint+test+build). Rx refs →
> requirements.

---

## Core module — `src/services/progress-io.ts` (mostly pure)

- [x] 1. Markdown report builder *(R1)* — `buildProgressReportMarkdown` in
  `progress-io.ts`.
  - Extend/refactor the existing `buildAllNotesMarkdown` into a combined report:
    an **insights summary** header (from `computeInsights`) + per-problem detail
    (title, difficulty, patterns, **attempts timeline**, note). Pure function.

- [x] 2. JSON export serializer *(R2)* — `buildProgressExport` /
  `serializeProgressExport`.
  - Build the `ProgressExport` envelope (`format`, `formatVersion`, `schemaVersion`
    = `PROBLEM_RECORD_SCHEMA_VERSION`, `exportedAt`, `records`). Do NOT include the
    `progress_index` (derived). Pure.

- [x] 3. Import reconstructor/validator (security-critical) *(R3, R5)* —
  `parseImport` / `sanitizeRecord`.
  - Pure `parseImport(text)` → `{ records, added?, skipped, error? }` implementing
    the §4 pipeline: **size gate** → parse (try/catch) → **envelope gate**
    (`format`/`formatVersion`/array/max-records) → **`sanitizeRecord(raw)`** per
    entry.
  - `sanitizeRecord` RECONSTRUCTS a fresh record (never spreads the untrusted
    object): explicit field copy; strip `__proto__`/`constructor`/`prototype`;
    `slug` regex; **HTML-neutralize** `title`/`notes`/`approachSummary`/
    `solutionSummary`; enum-check `difficulty`/`outcome`; filter `patterns` to the
    vocabulary; finite/bounded numbers; cap `attempts`; **recompute
    `bestAttemptIndex`** (ignore file value). Unsanitizable record → skip + count.
  - Run survivors through `migrate()`. Never throw; hard-fail on size/parse/envelope.

- [x] 4. Merge logic *(R3.3)* — `mergeRecords`.
  - Pure `mergeRecords(existing, incoming)` → `{ merged, summary: {added, updated,
    skipped} }`: newer-wins per `slug` by `lastUpdatedAt` (add new; keep later;
    skip older). Idempotent.

- [x] 4b. Verify the Markdown renderer vs. raw HTML (security) *(R5.1.2)* —
  **verified: renderer is safe.** The app renders via React JSX
  (`ContentDisplay.renderContent` builds elements; `RecordDetail` shows `notes` in a
  `<pre>`); there is **no** `dangerouslySetInnerHTML` / `innerHTML` anywhere, so
  React escapes text children by default and raw HTML never executes. No latent
  stored-XSS hole to fix; importer HTML-neutralization (`neutralizeString`) is
  documented defense-in-depth.

## Storage wiring — `src/services/progress-records.ts`

- [x] 5. Write + index rebuild *(R3.5, R3.6)* — `writeImportedRecords` +
  `getAllRecords`.
  - Persist merged records (`record_{slug}`) and **rebuild `progress_index`** from
    them. Validate-all-then-write (assemble the full payload in memory, quota-check,
    then a **single atomic** `chrome.storage.local.set`) so a failure can't
    half-update storage; over-budget fails closed.

## UI — `src/components/ProgressView.tsx`

- [x] 6. Export controls *(R1.4, R2.3, R4.1, R6.1)*
  - A **Download ▾** (Markdown / JSON) near "Copy all"; build string → Blob →
    date-stamped download. **VERIFIED:** the `<a download>` blob anchor works in the
    side-panel DOM document (the createObjectURL limitation is specific to the
    DOM-less background service worker); **no `chrome.downloads` API or `"downloads"`
    permission added** — keeps the permission set minimal for the scope-permissions
    work.
- [x] 7. Import control + feedback *(R3.1, R4.2, R6.2)*
  - Hidden `<input type="file" accept=".json,application/json">` → read text → run
    the import pipeline → write → refresh the view. Shows
    "Imported: N added, M updated, K unchanged" or a specific rejection reason.
- [ ] 8. **UI change → get the user to eyeball the Download menu, Import flow, and
  feedback before committing.** ← pending the user's visual review.

## Tests *(R7)*

- [x] 9. Unit tests — functional + SECURITY *(R7)* — `progress-io.test.ts`
  (29 tests).
  - Functional: Markdown builder; JSON serializer; `parseImport` (accept good;
    reject malformed/wrong-envelope/oversized without throwing; migrate old schema);
    merge (add-new / newer-wins / skip-older / idempotent re-import).
  - **Security (required):** an `<img onerror>` / `<script>` / `javascript:` payload
    in a string field is neutralized (not executable); a `__proto__` /`constructor`
    payload does NOT pollute `Object.prototype`; oversized file / excess record count
    is rejected; an out-of-bounds `bestAttemptIndex` in the file is recomputed, not
    used; a malformed import leaves existing storage unchanged.

## Post-build security hardening (follow-up pass) — see design §4b

- [x] H1. **Clearer non-JSON rejection** *(R5.5.4)* — `parseImport` pre-check
  (`{`/`[`) + distinct parse-failure message. Test: a `.md` file → friendly error.
- [x] H2. **Global attempts cap** *(R5.2.1)* — `MAX_TOTAL_ATTEMPTS` (50k) counted
  across raw records before reconstruction. Test: 200×500 attempts → rejected.
- [x] H3. **Explicit manifest CSP** *(R5.6)* — `content_security_policy.
  extension_pages` = `script-src 'self'; object-src 'self'; base-uri 'self'` in
  `public/manifest.json`; `connect-src` left open for the Gemini endpoint.
  **Manifest/runtime change → reload the unpacked extension and confirm the side
  panel still opens, coaching works, and the console shows no CSP error.**
- [x] H5. **`url` validation** *(R5.4.3)* — `sanitizeUrl(value, slug)` enforces the
  LeetCode problem-URL shape keyed to the record's slug, else rebuilds from slug.
  Tests: `javascript:`/off-domain/http/slug-mismatch all rebuilt; legit sub-path
  kept. (Numbered H5 to match the review item #5.)
- [x] H-tests. 7 new unit tests added to `progress-io.test.ts` (functional +
  security). `npm.cmd run test` 239 → **246**.

## Verify + docs

- [x] 10. `npm.cmd run build` clean; `npm.cmd run test` passes (**246** total,
  lint 0 errors). Spec added to `.kiro/specs/README.md` and the top-level
  `README.md`; post-build hardening pass documented in requirements (R5.2.1,
  R5.4.3, R5.5.4, R5.6) + design §4b + here.
- [ ] 11. **Explain what was built and STOP for the user's review before
  committing.** ← current step. Commit in logical groups (io module / storage wiring
  / UI / tests); detailed messages via `git commit -F`; don't push/merge without
  being asked.

---

## Explicitly NOT in this session

- Auto-generated / continuously-saved report (future enhancement).
- Per-attempt merge (v1 is whole-record newer-wins).
- Markdown import (JSON is the round-trip format).
- Cloud sync / accounts / scheduled auto-export.
