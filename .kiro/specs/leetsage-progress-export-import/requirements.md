# LeetSage — Progress Export / Import: Requirements

> **Status: ✅ Built (branch `feature/progress-export-import`, local — awaiting
> review).** A pre-launch feature: download your saved
> progress as a **combined Markdown report** (study archive) and as **portable
> JSON** (a re-importable backup), and **import** a previously-exported JSON to
> restore/merge records. Full trilogy (this is substantial because *import* ingests
> an untrusted file into local storage: validation, migration, and merge logic).
>
> Companion: [design.md](./design.md) · [tasks.md](./tasks.md).
> Grounds against real code: `src/components/ProgressView.tsx`
> (`buildAllNotesMarkdown`, "Copy all", the My Progress UI),
> `src/services/progress-records.ts` (`getProgressIndex`, `getRecord`, `saveAttempt`,
> `migrate`, storage layout `record_{slug}` + `progress_index`),
> `src/services/progress-analytics.ts` (`computeInsights`), `src/types/models.ts`
> (`ProblemRecord`, `Attempt`, `ProblemIndexEntry`, `PROBLEM_RECORD_SCHEMA_VERSION`).

---

## Why

1. **Study archive:** the user wants a real, readable record of their LeetCode
   journey they can keep and review — the feature they care about most.
2. **Backup / portability:** `chrome.storage.local` is single-browser and gets
   **wiped when the extension is removed/re-added** — which the upcoming
   scope-permissions change requires. A JSON export + import is the safety net that
   makes progress durable and portable across browsers. (Progress-tracking design
   flagged single-browser as the key limitation; this addresses it.)

## Two artifacts, two purposes

- **Markdown (`.md`)** — for *reading*: one combined document = an insights summary
  at the top + full per-problem detail below. Human-readable, renders anywhere.
- **JSON (`.json`)** — for *portability/backup*: the structured records, re-importable.

---

## Requirements

### R1 — Markdown export (combined report)
- **R1.1** FROM the "My Progress" view, THE SYSTEM SHALL let the user **download** a
  single combined Markdown report of all saved records.
- **R1.2** THE report SHALL begin with an **insights summary** (from
  `computeInsights`): total problems, weakest link (+ confidence), pattern
  distribution, and the revisit list — matching what the Insights panel shows.
- **R1.3** THE report SHALL then include **full per-problem detail**: title,
  difficulty, patterns, the attempts timeline (date, outcome, approach, complexity,
  hints, language, which was best), and the saved note — reusing/extending the
  existing `buildAllNotesMarkdown` structure.
- **R1.4** THE file SHALL have a date-stamped name (e.g. `leetsage-progress-YYYY-MM-DD.md`).

### R2 — JSON export (portable backup)
- **R2.1** FROM "My Progress", THE SYSTEM SHALL let the user **download** a JSON
  file containing all `ProblemRecord`s and a top-level `schemaVersion` +
  export metadata (export date, an app/format version, record count).
- **R2.2** THE JSON SHALL be sufficient to fully reconstruct the records on import
  (it is the source of truth; the `progress_index` is rebuilt from records, not
  trusted from the file).
- **R2.3** THE file SHALL have a date-stamped name (e.g. `leetsage-progress-YYYY-MM-DD.json`).

### R3 — Import (merge, newer-wins)
- **R3.1** FROM "My Progress", THE SYSTEM SHALL let the user **pick a JSON file**
  (previously exported) and import it.
- **R3.2** THE importer SHALL run each surviving record through the existing
  per-record `migrate()` so older-schema exports are brought current.
- **R3.3** Merge policy SHALL be **merge, newer-wins per `slug`**: for each imported
  record, if no local record exists → add it; if one exists → keep whichever has the
  later `lastUpdatedAt` (whole-record for v1 — no per-attempt merge). Merge SHALL be
  idempotent (re-importing the same file changes nothing).
- **R3.4** After import, THE SYSTEM SHALL rebuild the `progress_index` from the
  resulting records and refresh the My Progress view.
- **R3.5** THE import SHALL be **atomic w.r.t. existing data**: no matter what the
  file contains, a failed/partial import SHALL NEVER corrupt or partially-overwrite
  existing storage (validate + reconstruct everything in memory, then write once).

### R4 — No backend, client-side only
- **R4.1** Export SHALL be a client-side file download (Blob + object URL, or the
  `chrome.downloads` API — build verifies which is needed in the MV3 side panel).
- **R4.2** Import SHALL use a client-side file picker (`<input type="file">`);
  the file is read and parsed in the extension, never uploaded anywhere.

---

## R5 — Import security (THREAT MODEL — the load-bearing section)

Import ingests an **untrusted file into privileged, persistent storage** in the
extension's own context (which can reach `chrome.*` and the user's Gemini key).
This is the single most dangerous surface in the app and is treated accordingly.

### R5.0 — Governing principle: RECONSTRUCT, don't validate-in-place
- **R5.0.1** THE importer SHALL NOT store the parsed objects from the file. For each
  record it SHALL **construct a brand-new, trusted `ProblemRecord`** by copying only
  known fields through explicit per-field sanitizers, discarding everything else.
  The untrusted object is read from, never persisted or spread into a stored object.
  (This structurally defeats unknown-field injection, prototype pollution, and type
  confusion at once.)

### R5.1 — Stored XSS (the crown-jewel risk)
- **R5.1.1** String fields that are ever rendered — `title`, `notes`,
  `approachSummary`, `solutionSummary`, `patterns` — SHALL be treated as attacker-
  controlled. The importer SHALL neutralize embedded HTML (strip or escape raw HTML,
  e.g. an `<img onerror=…>` payload) so imported content cannot execute when rendered.
- **R5.1.2** THE build SHALL **verify how the app's Markdown renderer handles raw
  HTML** in `notes`/content. If the renderer escapes/strips HTML, that's the primary
  defense (importer sanitization is defense-in-depth). If it renders raw HTML, that
  is a pre-existing latent stored-XSS hole that import would weaponize, and it SHALL
  be fixed as part of this work (verify-and-fix here, not deferred).
- **R5.1.3** THERE SHALL be a test that an imported `onerror`/`<script>`/
  javascript-URL payload in a string field is neutralized (not rendered/executed).

### R5.2 — Resource exhaustion / DoS
- **R5.2.1** THE importer SHALL enforce hard caps and reject the whole file if
  exceeded: **max file size** (e.g. a few MB, well under the ~10MB storage quota),
  **max record count**, **max attempts per record**, a **global max attempts
  across the whole file** (so N records × M attempts can't evade the per-record
  cap — hardening #2, added post-build), and **max length per string field**
  (with over-long strings truncated or the record skipped — design decides, but
  bounded either way).
- **R5.2.2** THE importer SHALL never let import push `chrome.storage.local` past its
  quota; if the merged result would exceed a safe budget, it SHALL fail closed with
  a clear message rather than corrupt the store.

### R5.3 — Prototype pollution
- **R5.3.1** Keys `__proto__`, `constructor`, `prototype` SHALL be rejected/stripped
  and never copied. Reconstruction SHALL use explicit field assignment (or a
  null-prototype object), never `Object.assign`/spread of the untrusted object into
  a trusted one.

### R5.4 — Type confusion & derived-field integrity
- **R5.4.1** Every field SHALL be strictly coerced with bounds: `difficulty` ∈
  {Easy,Medium,Hard}; `outcome` ∈ {solved,attempted,gave-up}; `patterns` filtered to
  the known `ProblemPattern` vocabulary; `slug` matched to `^[a-z0-9-]+$`; numbers
  finite and in sane ranges (no `NaN`/`Infinity`/negative timestamps).
- **R5.4.2** Derived/denormalized fields SHALL be **recomputed, not trusted** from
  the file — notably `bestAttemptIndex` (recompute via `computeBestAttemptIndex`) and
  the whole `progress_index`. An out-of-bounds `bestAttemptIndex` in the file SHALL
  never reach storage or a render.
- **R5.4.3** (hardening #5, added post-build) THE `url` field SHALL be validated to
  the expected shape — `https://leetcode.com/problems/<slug>/…` with the slug
  matching the record's own (already strictly validated) slug — and **rebuilt
  deterministically from the slug otherwise**. The file's `url` is never trusted
  verbatim. Rationale: the `url` is not rendered as a link today, but a future
  "open on LeetCode" affordance would turn an unvalidated `javascript:`/off-domain
  `url` into a live clickjack/redirect/XSS vector; validating now closes that
  latent hole before the feature can weaponize it (the §4a "a feature can
  weaponize a latent flaw" principle, applied preemptively).

### R5.5 — Fail-closed behavior
- **R5.5.1 (hard fail):** IF `JSON.parse` throws, or the envelope is wrong
  (`format !== 'leetsage-progress'`, bad `formatVersion`, `records` not an array), or
  a size cap is exceeded → **reject the entire file**, touch NO stored data, show a
  specific message.
- **R5.5.2 (per-record skip):** individually malformed/unsanitizable records SHALL be
  **skipped and counted** (not abort the whole import) — but a skipped record is never
  written. Report `{added, updated, skipped}`.
- **R5.5.3** THE importer SHALL NOT `eval`/`Function`/execute any file content.
- **R5.5.4** (hardening #1, added post-build) WHEN a picked file is clearly not our
  JSON (does not begin with `{`/`[`, or fails `JSON.parse`), THE importer SHALL
  return a **specific, friendly** message pointing the user at the `.json` backup
  they exported — because the picker's `accept=".json"` is only a UI hint and the
  user can choose any file.

### R5.6 — Platform-enforced no-code-execution (CSP)
- **R5.6.1** (hardening #3, added post-build) THE extension manifest SHALL declare
  an explicit `content_security_policy.extension_pages` that disallows inline
  script and `eval`/remote script (`script-src 'self'; object-src 'self';
  base-uri 'self'`). This makes the app's "no code execution" guarantee enforced
  by the browser platform, not merely by code discipline — defense that holds even
  if a future bug would otherwise introduce an injection sink. (MV3 already forbids
  inline/eval by default; declaring it makes the intent explicit and auditable.)
  `connect-src` is intentionally left unrestricted so the BYOK Gemini API calls to
  `generativelanguage.googleapis.com` keep working.

### R6 — UI
- **R6.1** THE export/import controls SHALL live in the **My Progress** header near
  the existing "Copy all" (e.g. a small Download ▾ menu offering Markdown / JSON,
  and an Import action). This is a UI change → user eyeballs before commit.
- **R6.2** Import SHALL give clear feedback: success (N added, M updated, K skipped)
  or a specific failure reason.

### R7 — Verification (incl. security tests)
- **R7.1** THE pure functions SHALL be unit-tested: the Markdown report builder, the
  JSON export serializer, the import **reconstructor/validator** (accept good; reject
  malformed/wrong-envelope/oversized without throwing; migrate old schema), and the
  **merge** logic (newer-wins, add-new, skip-older, idempotent).
- **R7.2 (security tests — required):** an XSS payload (`<img onerror>`, `<script>`,
  `javascript:` URL) in a string field is neutralized; a `__proto__`/`constructor`
  payload does NOT pollute `Object.prototype`; an oversized file / excess record
  count is rejected; an out-of-bounds `bestAttemptIndex` is recomputed, not used; a
  malformed import leaves existing storage byte-for-byte unchanged.
- **R7.3** `npm.cmd run build` + `npm.cmd run test` pass (CI + Husky gate).

---

## Non-goals / deferred

- **Auto-generated / auto-saved report as the user interacts** — a future
  enhancement (records already auto-populate on "Save to My Progress"; a
  continuously-written report file is v-next, NOT built here).
- **Per-attempt merge** (combining attempt timelines across two versions of the same
  problem) — v1 is whole-record newer-wins; per-attempt union is deferred.
- **Markdown import** — only JSON is importable (Markdown is a read artifact).
- **Cloud sync / accounts** — out of scope (no-backend posture).
- **Auto-export on a schedule** — manual only.
