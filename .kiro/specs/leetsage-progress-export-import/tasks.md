# LeetSage — Progress Export / Import: Tasks

> **Status: 📐 Planned — not started.** Implementation breakdown for
> [requirements.md](./requirements.md) / [design.md](./design.md). Build in a fresh
> focused session per `.kiro/steering/workflow.md` (explain-and-STOP before
> committing; UI eyeballed; CI/Husky gate lint+test+build). Rx refs → requirements.

---

## Core module — `src/services/progress-io.ts` (mostly pure)

- [ ] 1. Markdown report builder *(R1)*
  - Extend/refactor the existing `buildAllNotesMarkdown` into a combined report:
    an **insights summary** header (from `computeInsights`) + per-problem detail
    (title, difficulty, patterns, **attempts timeline**, note). Pure function.

- [ ] 2. JSON export serializer *(R2)*
  - Build the `ProgressExport` envelope (`format`, `formatVersion`, `schemaVersion`
    = `PROBLEM_RECORD_SCHEMA_VERSION`, `exportedAt`, `records`). Do NOT include the
    `progress_index` (derived). Pure.

- [ ] 3. Import reconstructor/validator (security-critical) *(R3, R5)*
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

- [ ] 4. Merge logic *(R3.3)*
  - Pure `mergeRecords(existing, incoming)` → `{ merged, summary: {added, updated,
    skipped} }`: newer-wins per `slug` by `lastUpdatedAt` (add new; keep later;
    skip older). Idempotent.

- [ ] 4b. Verify the Markdown renderer vs. raw HTML (security) *(R5.1.2)*
  - Check how the app's markdown renderer handles raw HTML in note/content strings.
    If it escapes/strips → document it (importer sanitization is defense-in-depth).
    If it renders raw HTML → **fix the renderer here** (escape / disallow raw HTML),
    since import weaponizes that latent hole. Verify, don't assume.

## Storage wiring — `src/services/progress-records.ts`

- [ ] 5. Write + index rebuild *(R3.5, R3.6)*
  - Persist merged records (`record_{slug}`) and **rebuild `progress_index`** from
    them. Validate-all-then-write so a failure can't half-update storage.

## UI — `src/components/ProgressView.tsx`

- [ ] 6. Export controls *(R1.4, R2.3, R4.1, R6.1)*
  - A **Download ▾** (Markdown / JSON) near "Copy all"; build string → Blob →
    date-stamped download. **VERIFY** whether the `<a download>` anchor works in the
    MV3 side panel or `chrome.downloads` (+ `"downloads"` permission) is needed —
    test, don't assume; if a permission is added, keep it minimal.
- [ ] 7. Import control + feedback *(R3.1, R4.2, R6.2)*
  - Hidden `<input type="file" accept=".json,application/json">` → read text → run
    the import pipeline → write → refresh the view. Show
    "Imported: N added, M updated, K skipped" or a specific rejection reason.
- [ ] 8. **UI change → get the user to eyeball the Download menu, Import flow, and
  feedback before committing.**

## Tests *(R7)*

- [ ] 9. Unit tests — functional + SECURITY *(R7)*
  - Functional: Markdown builder; JSON serializer; `parseImport` (accept good;
    reject malformed/wrong-envelope/oversized without throwing; migrate old schema);
    merge (add-new / newer-wins / skip-older / idempotent re-import).
  - **Security (required):** an `<img onerror>` / `<script>` / `javascript:` payload
    in a string field is neutralized (not executable); a `__proto__` /`constructor`
    payload does NOT pollute `Object.prototype`; oversized file / excess record count
    is rejected; an out-of-bounds `bestAttemptIndex` in the file is recomputed, not
    used; a malformed import leaves existing storage unchanged.

## Verify + docs

- [ ] 10. `npm.cmd run build` clean; `npm.cmd run test` passes (lint+test+build
  gated). Add this spec to `.kiro/specs/README.md`.
- [ ] 11. **Explain what was built and STOP for the user's review before
  committing.** Commit in logical groups (io module / storage wiring / UI / tests);
  detailed messages via `git commit -F`; don't push/merge without being asked.

---

## Explicitly NOT in this session

- Auto-generated / continuously-saved report (future enhancement).
- Per-attempt merge (v1 is whole-record newer-wins).
- Markdown import (JSON is the round-trip format).
- Cloud sync / accounts / scheduled auto-export.
