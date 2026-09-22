# 01 — Compilation (source of truth)

> Full evidence, organized by capability. For each item: **what it does**, **why it
> was non-trivial**, **the engineering decision**, and **the citation**. Read
> 00-CONTEXT-TRANSFER.md first for conventions (`[SHIPPED]`, `[PLANNED]`,
> `[UNVERIFIED]`, `[DOC DRIFT]`, citation format).

---

## 1. MV3 three-context architecture + pull-based data flow `[SHIPPED]`

**What it does.** The extension runs as three isolated JavaScript contexts that share
no memory — a **content script** (`src/content/`), a **background service worker**
(`src/background/index.ts`), and a **React side panel** (`src/sidepanel/`) — and
coordinate only through message passing and `chrome.storage.local`. The content script
scrapes the LeetCode problem; the panel requests it; the worker persists shared state.

**Why non-trivial.** MV3 replaced the old persistent background page with a **service
worker that sleeps** when idle. A naive "content script pushes data to the worker"
design silently drops messages whenever the worker is asleep — a race that is
intermittent and hard to debug.

**The decision — pull, not push.** The side panel **pulls** the problem on demand:
it sends a `REQUEST_PROBLEM_DATA` message; the content script answers from a cached
extraction (or extracts fresh), returning `true` from the listener to keep the async
response channel open. The content script *also* best-effort pushes (`PROBLEM_DATA`)
but swallows the "no receiving end" error because the pull path is the reliable one.

- Pull handler + cache + swallowed push error: `src/content/index.ts`
  (`REQUEST_PROBLEM_DATA` listener; `cachedProblem`; the `void chrome.runtime.lastError`).
- Worker message router (typed dispatch over `ExtensionMessage`): `src/background/index.ts`
  (`chrome.runtime.onMessage` handlers for problem data, `TRACK_ACTION`, progress get/reset).
- **Worker crash fix:** the manifest declares `"background": { "type": "module" }`
  (`public/manifest.json`) — without it the worker crashes silently on ES-module imports.
  (`DESIGN_DECISIONS.md` ADR-006; `DEV_JOURNAL.md` 2026-08-29.)
- Single-registration side-panel open: `src/background/index.ts` →
  `enablePanelOnActionClick()` relies solely on `setPanelBehavior({openPanelOnActionClick:true})`;
  the code comment documents *why* it must not also register `chrome.action.onClicked`
  (double-registration loses the user-gesture context on cold start).

**Message contracts are typed.** `src/types/messages.ts` defines a discriminated union
`ExtensionMessage` plus per-message type guards (`isProblemDataMessage`, etc.), so the
worker's dispatch is exhaustive and type-narrowed rather than stringly-typed.

---

## 2. LeetCode DOM + Monaco editor extraction `[SHIPPED]`

**What it does.** Two separate readers: (a) the **problem context** (title, difficulty,
description, examples, constraints) is scraped from the LeetCode DOM in the content
script; (b) the **user's editor code + language** is read from the Monaco editor.

**Why non-trivial.**
- LeetCode is a dynamic SPA — elements appear asynchronously and the layout differs
  across views. The scraper polls for elements and retries with backoff, and degrades
  gracefully (returns `[]`/`''` per-field rather than throwing) so a partial page still
  yields usable context.
- The editor's full source (including lines scrolled out of view) is only reliably
  available via `window.monaco.editor.getModels()[0].getValue()` — but `window.monaco`
  lives in the **page's MAIN world**, which an isolated content script cannot touch.

**The decision — inject into the MAIN world.** Code extraction uses
`chrome.scripting.executeScript({ world: 'MAIN', func })` to run a self-contained reader
in the page's own JS context, then returns the result to the panel. It falls back to
reconstructing from the rendered `.view-lines` DOM (visible lines) and reads the language
from the toolbar selector when Monaco reports `plaintext`.

- MAIN-world reader + fallbacks: `src/services/code-extractor.ts` → `readEditorFromPage`,
  `extractCurrentCode`. The `plaintext`→toolbar-language fallback is explicitly handled
  (a real bug fix — see §9 record correctness).
- DOM scraper with polling + retry/backoff + graceful degradation: `src/content/extractor.ts`
  → `waitForElement`, `extractProblemContext` (3 retries, exponential backoff), plus
  `extractExamples` / `extractConstraints` (try/catch → empty fallback).
- Live re-extraction on SPA navigation: `observeProblemChanges` (a `MutationObserver`).

**Untrusted-input note.** Scraped page text flows into LLM prompts. This is a genuine
prompt-injection surface; the mitigation today is the deterministic output filter (§3),
not input sanitization. Called out honestly in `DESIGN_DECISIONS.md` (cross-cutting
themes table).

---

## 3. LLM integration: Gemini, streaming, and the solution filter `[SHIPPED]`

### 3a. Provider integration

**What it does.** Calls Gemini through its **OpenAI-compatible Chat Completions**
endpoint with Bearer auth, in both **non-streaming** and **streaming (SSE)** modes.

**The decision — OpenAI-compatible endpoint, not the native SDK.** Keeps the familiar
chat-completions request/response shape (so the provider is swappable) and uses Gemini's
genuinely-free tier. (`DESIGN_DECISIONS.md` ADR-005.)

- `src/services/llm-service.ts`:
  - `sendLLMRequest` — non-streaming; reads `choices[0].message.content` defensively
    (every access `?.`-guarded because it's an untrusted boundary — typed as
    `ChatCompletionResponse`).
  - `streamLLMRequest` — an `async function*` generator that parses the SSE
    `data: {…}` lines, yields `delta.content` chunks, and skips malformed chunks.
  - `fetchWithRetry` — exponential backoff on 5xx, but **no retry on 4xx or
    `AbortError`** (a 401/403/429 is terminal, not transient).
  - `buildAPIError` — maps 401/403 → "invalid/unauthorized key", 429 → "rate limit /
    free-tier quota reached".
  - `AbortController` + `setTimeout` gives every request a hard timeout.
- Model default + tiering: `DEFAULT_MODEL = 'gemini-3.5-flash-lite'` in `llm-service.ts`;
  user can opt up to `gemini-3.5-flash` (`GeminiModel` in `src/types/api.ts`).
  (`DESIGN_DECISIONS.md` ADR-008 — model tiering as a named cost technique.)

**Hard-won lesson (documented).** `gemini-2.5-*` model names returned 404 ("no longer
available to new users"); the working names are `gemini-3.5-*`. The bug was first
mis-blamed on the unusual `AQ.` key format — a red herring. (`DESIGN_DECISIONS.md`
ADR-005; `DEV_JOURNAL.md` 2026-08-29.)

### 3b. Prompt construction + progressive hints

**What it does.** Nine coaching actions, each with a tailored system prompt. Hints are
**three-tier** (Level 1 conceptual → Level 2 approach → Level 3 implementation, still no
full code); the requested level is tracked and incremented per problem.

- `src/services/prompts.ts`:
  - `getSystemPrompt(actionType)` — a `Record<ActionType, string>` covering all 9 actions.
  - Shared blocks injected into prompts: `SOLUTION_PREVENTION_RULES` (never give a full
    solution; snippets under ~10 lines OK), `OUTPUT_RULES` (plain-text Big-O, no LaTeX,
    no preamble), `TONE_GUIDELINES`.
  - `buildUserMessage(...)` — per-action templating; free-form questions bypass the
    template and are grounded by prepending `formatProblemContext(...)`.
- Hint level increment: `src/background/index.ts` (`TRACK_ACTION` → `hintLevel =
  Math.min(hintLevel + 1, 3)`), persisted in `ProgressState` (`src/types/models.ts`).

### 3c. The solution filter (the product's non-negotiable) `[SHIPPED]`

**What it does.** A **deterministic post-generation filter** runs on every non-exempt
response and replaces it with a "content filtered" message if it looks like a full
answer. This is the *hard* backstop behind the *soft* prompt rules — because LLM output
is non-deterministic and can be talked around.

**How it actually works** (`src/services/solution-filter.ts` → `filterResponse`):
- **Exempt actions** (solutions are the point): `CHECK_APPROACH`, `UNDERSTAND_SOLUTION`,
  `GENERATE_REPORT` (`SOLUTION_EXEMPT_ACTIONS`).
- **Phrase match** — substring scan for solution-revealing language (`SOLUTION_PHRASES`).
- **Code-block size** — any fenced block over `MAX_CODE_BLOCK_LINES` (14) is rejected.
- **Complete-function detection** — `COMPLETE_FUNCTION_PATTERNS` (Python `def` + 5+ body
  lines; brace-language function with a 200+ char single-scope body) **plus**
  `looksLikeCompleteBraceFunction` (a brace-function header + a `return`, to catch
  multi-brace nested-body functions the char-count regex can't span). A complete function
  is rejected **regardless of line count** — a compact 8-line solution is still the whole
  answer.
- **Full-pseudocode heuristic** — `looksLikeFullPseudocode` flags text (fenced *or*
  prose) with ≥5 imperative control lines **and** a loop **and** a result/return.

**The decision & the hardening story.** The filter was **hardened after the guardrail
eval caught real leaks** (see §7): the original design gated the complete-function check
behind a line count (a compact solution slipped through), missed multi-brace functions,
and over-required a standalone `if` in the pseudocode heuristic (a monotonic-stack
writeup with the branch folded into the loop header slipped through). Code comments name
the exact eval cases that drove each fix (`pos-code-1`, `pos-code-2`, `pos-pseudo-prose-2`).

**`[DOC DRIFT]`** `DESIGN_DECISIONS.md` ADR-004 still describes the *older* filter — it
mentions a `MAX_SNIPPET_LINES` (8) gate and lists only two exempt actions. The **shipped
code** (`solution-filter.ts`) removed that gate and exempts three actions. Trust the code;
the ADR predates the 2026-09-15 hardening.

---

## 4. Free-tier / cost guardrails `[SHIPPED]`

**What it does.** Client-side controls that keep the tool safe-by-default on a free tier:
per-response token cap, per-minute + per-day request caps, cooldown between requests,
hard request timeout, a usage counter, and a global **kill switch** — all user-adjustable.

**The decision.** Even with BYOK, runaway calls burn the user's free quota. Guardrails
demonstrate explicit cost-control thinking. They are client-side, which a determined user
could bypass by editing storage — accepted, because the only quota they'd hurt is their
own. (`DESIGN_DECISIONS.md` ADR-007.)

- Defaults: `src/types/api.ts` → `DEFAULT_GUARDRAILS` = `{ maxTokens: 800,
  maxRequestsPerMinute: 8, maxRequestsPerDay: 200, cooldownMs: 2000,
  requestTimeoutMs: 20000, killSwitch: false }`.
- Enforcement order (kill switch → daily cap → per-minute → cooldown):
  `src/services/rate-limiter.ts` → `checkRateLimit`. Uses a **rolling one-minute window**
  (`pruneOld`) and returns a `retryAfterMs` hint.
- Usage persisted across worker sleep: `recordRequest` writes a per-day
  `UsageState` (`date`, `count`, `recentTimestamps`) via `src/services/storage.ts`
  (`getUsage`/`saveUsage`, keyed `usage_YYYY-MM-DD`). Handles date rollover.
- Token cap + timeout applied per request: `src/services/llm-service.ts`
  (`max_tokens`, `AbortController`).

**No measured figure** for real request volume, cost, or latency — these are limits and
enforcement, not observed usage.

**Anecdotal only (NOT a resume number, NOT instrumented).** In the developer's own daily
use, usage has never come close to the 200/day cap, and replies feel fast (subjectively
~2s). These are personal, un-instrumented observations — usable *in conversation* if an
interviewer asks "how does it perform in practice?", but they must **not** appear on a
resume as figures and cannot be cited to a source in the repo (there is no telemetry).
The honest phrasing is "in my own use, well under the daily cap and replies feel near-
instant — but I haven't instrumented latency/token metrics; that's the top measurement gap."

---

## 5. BYOK architecture + the deliberate "no backend" decision `[SHIPPED]`

**What it does.** Each user pastes their own free Gemini API key into Settings; it is
stored in `chrome.storage.local` and sent directly from the browser to Google. LeetSage
never holds anyone's key and runs **no server**.

**Why non-trivial / the decision.** A purely client-side extension **cannot hide a
secret** — a shipped key can be extracted from any user's machine. A managed key would
require a backend (hosting, per-user billing, abuse protection, a central secret to
breach). BYOK sidesteps all of it and scales to N users at zero cost/liability. The two
things a backend usually buys — holding secrets and centralizing state — are things
LeetSage deliberately doesn't want (BYOK removes the secret; per-user local storage
removes shared state). (`DESIGN_DECISIONS.md` ADR-001, ADR-002, ADR-003;
`.kiro/specs/leetsage-phase1-gemini/requirements.md` "Key Architectural Decision — BYOK".)

- Key stored + defaults: `src/services/storage.ts` → `getSettings`/`saveSettings`
  (`USER_SETTINGS`; default model `gemini-3.5-flash-lite`, theme `dark`; guardrails
  backfilled for older saved settings).
- Key sent as Bearer, browser→Google directly: `src/services/llm-service.ts`
  (`Authorization: Bearer ${request.apiKey}`).
- Settings UI: `src/components/SettingsModal.tsx`.

**Honest tradeoff (documented, not hidden).** The key sits in plaintext local storage;
this is the accepted BYOK model because any client-side "encryption" key also lives on
the same machine. (`DESIGN_DECISIONS.md` ADR-002.)

---

## 6. State & persistence (`chrome.storage.local`) `[SHIPPED]`

**What it does.** Three kinds of state persist locally so they survive the worker
sleeping and the panel closing: **per-session progress**, **per-day usage**, and
**persistent progress records** (§9).

**The non-obvious decision — normalize the problem URL.** Session state is keyed on a
**normalized** `/problems/{slug}/` URL, not the raw href. The raw URL changes when the
user opens the submissions tab or navigates within a problem, which would make a
submission look like a different problem and wipe the chat.

- Normalization: `src/content/extractor.ts` → `normalizeProblemUrl`; mirrored for the
  panel context as `src/services/progress-records.ts` → `slugFromUrl`. (Unit-tested:
  `src/services/__tests__/normalize-url.test.ts`.)
- Session progress read/write with `Set`↔array marshaling: `src/services/storage.ts`
  (`saveProgress`/`getProgress`, keyed `progress_{url}`).
- (`DESIGN_DECISIONS.md` ADR-006; `DEV_JOURNAL.md` 2026-08-30.)

---

## 7. Testing + the labeled guardrail eval `[SHIPPED]`

**What's actually covered.** **Verified by running `npm run test`: 134 tests pass across
10 files** (Vitest 5.0.1). Two tiers:

**Tier 1 — unit tests on pure logic** (`src/services/__tests__/`, 8 files):
`solution-filter`, `structured-parser`, `session-digest`, `progress-analytics`,
`progress-records`, `normalize-url`, `stuck-timer`, `rate-limiter`.

**Tier 2 — a labeled solution-filter eval as a release gate** (`src/evals/`):
- `fixtures/guardrail-cases.ts` — a hand-labeled dataset (8 positive "leak" cases + 8
  negative "legit coaching" cases), each tagged with `leakType` and `source: 'authored'`.
- `metrics.ts` — a **pure confusion-matrix** implementation (`confusionMatrix`,
  `computeMetrics` → catch rate / false-positive rate / precision). The metric math is
  itself unit-tested (`metrics.test.ts`).
- `guardrail-eval.test.ts` — runs the filter over the dataset and asserts the release
  gate: **catch rate = 100%, false-positive rate = 0%** on the authored set, plus
  per-leak-type coverage.
- `llm-judge.ts` — an **offline, injectable** LLM-as-judge scaffold (`JudgeFn` transport;
  a deterministic mock in tests). It never touches the network — respecting the
  no-shipped-key constraint. A real Gemini-backed judge is a future swap-in.

**The eval found real bugs (the headline).** On its first run the guardrail eval scored
**62.5% catch rate** — it caught only 5 of 8 known leaks in a filter the author believed
solid. It surfaced three genuine blind spots (compact complete function; multi-brace
Java/C++ function; loop-header-folded pseudocode), which were then fixed to reach 100%.
(`DEV_JOURNAL.md` 2026-09-15; commit `0031cb9`.)

**Honesty about coverage gaps (stated in-repo, not hidden):**
- The eval dataset is **author-generated** — a strong **regression gate** but an
  **optimistic** estimate of real-world recall. The file opens with an explicit HONESTY
  NOTE and a documented slot to ingest real captured Gemini responses (`source: 'captured'`).
  (`fixtures/guardrail-cases.ts`.)
- The LLM-as-judge is a **scaffold**, exercised only with a mock — no validated live judge
  run exists.
- These are **unit/eval tests of pure logic** — there are **no** component, integration,
  or E2E tests of the React panel or the message plumbing.
- **No runtime metrics** (latency, tokens/request, cost) are measured — the top remaining
  "quantified impact" gap, per the roadmap.

---

## 8. CI/CD `[SHIPPED for CI]` / `[deliberately NOT built for CD]`

**What it does.** A **GitHub Actions** workflow runs on every push and PR (all branches):
`checkout → setup Node 22 → npm ci → lint → test → build`. Because the `test` step runs
the guardrail eval, **a change that weakens the "never hand over the solution" guardrail
fails CI automatically** — the eval becomes an automatic release gate. A **Husky
pre-commit hook** runs the same scripts locally as a fast early warning.

- CI: `.github/workflows/ci.yml` (`actions/checkout@v7`, `actions/setup-node@v7`,
  `node-version: "22"`, `cache: npm`; steps `npm ci` → `npm run lint` → `npm run test`
  → `npm run build`).
- Pre-commit hook: `.husky/pre-commit` (`npm run lint` + `npm run test` + `npm run build`);
  wired via `package.json` `"prepare": "husky"`.

**The decisions (documented, interview-ready):**
- **GitHub Actions over Docker/Jenkins** — LeetSage has no backend; the artifact is a
  static `dist/` bundle, so there's nothing to containerize (Docker) and no CI server
  worth self-hosting (Jenkins). (Reasoning is written into `ci.yml`'s header comment and
  `DEV_JOURNAL.md` 2026-09-15 follow-up.)
- **CD / auto-publish deliberately skipped** — Web Store review latency + secret
  management; deployment stays manual (build `dist/`, load unpacked).
- **Pre-commit vs CI authority** — the hook is a skippable, best-effort subset; only CI's
  clean `npm ci` catches dependency drift. (`.husky/pre-commit` header comment.)

**Commits:** `b0b98e3` (CI + Husky), `ea82f9b` (fixed pre-existing `no-explicit-any` lint
errors so lint passes), `e7653b8` (pinned actions to the verified-current `@v7` after an
`@v5`-from-memory correction — a "verify, don't assume" fix mirroring the model-name 404).
**Merged to `main` via PR #12** (confirmed by the developer; the merge commit `97c8f28`
is in `git log`). **`[UNVERIFIED]` in this compilation:** only the "first CI run green
~24s" *timing* comes from the journal and was not re-checked here; the workflow file,
scripts, and the merge are verified.

---

## 9. Structured output + progress tracking (data modeling under no-backend) `[SHIPPED A–C]` / `[PLANNED D]`

### 9a. Structured-output backbone `[SHIPPED]`

**What it does.** Three actions (`CHECK_APPROACH`, `UNDERSTAND_SOLUTION`,
`GENERATE_REPORT`) return a **hybrid response**: human prose **plus** a trailing
machine-readable `leetsage-data` JSON block. The `data` is the **single source of truth**
that downstream features (report, records, analytics, evals) consume instead of
re-parsing prose.

**Why non-trivial / the decision.** The report MVP produced generic textbook writeups
because responses carried only a *rendering*, not *data* — every consumer would have had
to reverse-engineer facts from prose. The fix was architectural: separate data from
presentation and make the data authoritative. Over a non-deterministic model boundary,
the parser must **never throw** — it degrades to prose-only on any missing/malformed/
schema-invalid block.

- Contract types: `src/types/models.ts` → `StructuredResponse<T>`, `AnalyzeData`,
  `UnderstandData`, `ReportData`, the `StructuredData` union, and the closed
  `ProblemPattern` vocabulary.
- Prompt side: `src/services/prompts.ts` → `structuredDataRules(...)` (emit JSON last,
  data is source of truth).
- Parse side: `src/services/structured-parser.ts` → `parseStructuredResponse` (tolerant,
  never throws), `stripDataBlockForDisplay` (hides the block mid-stream so raw JSON never
  flashes), `canonicalizePattern` (maps free-text pattern names onto the closed vocab via
  aliases). Unit-tested: `__tests__/structured-parser.test.ts`.
- Deterministic digest (no second LLM call): `src/services/session-digest.ts` →
  `buildSessionDigest` reads the stored `data` blocks and assembles the report's
  `SESSION ACTIVITY` grounding at read time.

**The stale-closure bug story.** A green build hid a real bug: the report was still
generic because `buildSessionDigest` read a **stale closure snapshot** of the chat
history (the `handleActionClick` `useCallback` intentionally omits `learningContent` from
its deps to avoid re-creating on every streamed chunk). Fix: a `learningContentRef` kept
current by a `useEffect`, read as `learningContentRef.current`.
(Verified: `src/sidepanel/App.tsx` lines ~61–62 define the ref/effect; ~218 and ~338 read
`.current`. `DEV_JOURNAL.md` 2026-09-03; commit `affc683`.) The bug was found by dumping
`chrome.storage.local`, not by the compiler — the "compiles ≠ works" lesson.

### 9b. Persistent records + "My Progress" + analytics `[SHIPPED, Phase A–C]`

**What it does.** Per-problem `ProblemRecord`s persist across sessions with an
append-only `attempts[]` history; a light `progress_index` projection powers a full-panel
"My Progress" list → detail view; and a deterministic cross-problem analytics pass surfaces
a "weakest link" pattern and a revisit list.

**The data-modeling decisions (this is the system-design story):**
- **One key per record + a light index** — `record_{slug}` holds the full record;
  `progress_index` holds a small `ProblemIndexEntry[]` projection so the list/analytics
  read cheaply. Cost: keeping index+record in sync on write (read-optimization vs.
  write-amplification). `src/services/progress-records.ts`.
- **Append-only event log, not mutable state** — `attempts[]` with a denormalized
  `bestAttemptIndex`. `computeBestAttemptIndex` / `complexityRank` pick the best solved
  attempt.
- **Schema versioning** — `migrate()` runs on every read (idempotent, ordered steps);
  `PROBLEM_RECORD_SCHEMA_VERSION` in `src/types/models.ts`.
- **Honest attempt semantics** — `shouldReplaceLatest` / `sameCalendarDay`: a re-save of
  the same solution on the same day *replaces* the latest attempt rather than inflating a
  count; a real re-solve *appends*. All pure, unit-tested (`__tests__/progress-records.test.ts`).
- **Analytics that refuse to overclaim** — `src/services/progress-analytics.ts` →
  `computeInsights` (group-by-pattern → `computeStruggleScore` → rank → weakest link +
  revisit list), with `lowConfidence: problemCount < 3` gating so thin-data insights are
  flagged. Unit-tested (`__tests__/progress-analytics.test.ts`).
- **Report is authoritative over stale session facts** — `session-digest.ts` →
  `buildRecordProjection` prefers the report's own `ReportData`, and applies a
  **complexity-honesty rule** (store the optimal complexity only if `solvedOptimally`,
  else the measured complexity — never label a brute-force attempt with optimal Big-O).
- UI: `src/components/ProgressView.tsx`.

**Three data-correctness bugs (compiler-invisible, caught by inspecting saved records):**
patterns-missing on report-only saves (fixed by making `GENERATE_REPORT` emit its own
`ReportData`), inflated attempt count (fixed by append-vs-replace + hiding the count in
the UI), and `plaintext` language (fixed in `code-extractor.ts`). (`DEV_JOURNAL.md`
2026-09-04; commits `798228b`, `538781c`, `f0b7c58`; PR #11.)

### 9c. Phase D — verified submissions `[PLANNED]`

Auto-save on an Accepted submission (so `outcome: 'solved'` is *verified*, not inferred)
is **designed, not built**. This is why the attempt count is deferred from the UI today.
(`.kiro/specs/leetsage-progress-tracking/README` status; `DEV_JOURNAL.md`.)

---

## 10. TypeScript usage (notable patterns) `[SHIPPED]`

- **Discriminated unions + type guards** for message passing:
  `src/types/messages.ts` (`ExtensionMessage` union; `is*Message` guards used for
  exhaustive dispatch in the worker).
- **Generic contract type**: `StructuredResponse<T>` and the `StructuredData` union
  (`AnalyzeData | UnderstandData | ReportData`) in `src/types/models.ts`; consumers
  narrow with in-operator guards (e.g. `'approachDetected' in d`) in `session-digest.ts`.
- **Closed string-literal vocabularies** as types: `ActionType` (9 members),
  `ProblemPattern` (23 members), `GeminiModel` — used to keep analytics grouping and
  routing reliable.
- **Untrusted-boundary typing**: minimal interfaces for external JSON
  (`ChatCompletionResponse`, `APIErrorBody` in `llm-service.ts`; `MonacoModel`/
  `MonacoGlobal` in `code-extractor.ts`) with every access `?.`-guarded — added when
  `no-explicit-any` lint errors were fixed (commit `ea82f9b`).
- **Const-assertion config object**: `STORAGE_KEYS` (`as const`) in `storage.ts`.

---

## 11. Build & tooling `[SHIPPED]`

- **Vite multi-entry build** for the three MV3 contexts: `vite.config.ts` — `input:
  { side_panel: index.html, background: src/background/index.ts, content:
  src/content/index.ts }`, fixed `entryFileNames`, `outDir: dist`, plugins `react()` +
  `tailwindcss()`.
- **Build command**: `tsc -b && vite build` (`package.json` `build` script) — type-check
  then bundle. (On this Windows setup it's run as `npm.cmd run build`.)
- **MV3 manifest**: `public/manifest.json` — `manifest_version: 3`, module service
  worker, side panel, content script matched to `https://leetcode.com/problems/*`,
  permissions `[scripting, tabs, sidePanel, commands, contextMenus, storage]`, a keyboard
  command (`Ctrl+Shift+L`).
- **Vitest config**: `vitest.config.ts` (node env; explicit imports).

---

## 12. Agentic-workflow evidence (artifacts) `[SHIPPED as process]`

- **Specs**: `.kiro/specs/` (8 features × requirements/design/tasks) + `README.md` index
  with a shipped/designed/planned/historical legend.
- **Steering**: `.kiro/steering/{product,tech,workflow}.md` — standing project rules.
- **Custom sub-agent**: `.kiro/agents/project-historian.md` — a documentation agent with
  **scoped permissions** (read-only git; writes limited to `docs/career/**`; all else
  "ask").
- **ADRs**: `docs/career/DESIGN_DECISIONS.md` (ADR-001…008, each with rejected alternatives).
- **Dev journal**: `docs/career/DEV_JOURNAL.md` (per-feature what/why/what-broke/how-solved
  + commit hashes).
- **Commit/PR pattern**: `git log` shows `docs: design …` → `feat: …` → `docs: record …`,
  merged via PRs #5–#12 off feature branches. Examples: `c3790ea`/`7104be0` (design) →
  `affc683`/`798228b` (implement) → `a3ff192`/`dfd4e74` (record).

See **03-interview-prep.md** for how the human drove this loop and the specific override.
