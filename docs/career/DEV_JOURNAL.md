# LeetSage — Development Journal

> A chronological record of how LeetSage was built: **what** was added each step,
> **why**, **what broke**, **how it was solved**, and the **interview angle** —
> the story you can tell about each feature. This is the doc to re-read before an
> interview or when you come back after time away and need to remember how a
> feature works and why it exists.
>
> Backfilled from git history + specs on the date noted below. From here on it is
> maintained by the **project-historian** agent (see
> [../../.kiro/agents/](../../.kiro/agents/)) — run it at the end of a work
> session to append the latest entry, then review before committing.
>
> Companion docs: [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md) (the *why* of
> architecture) · [INTERVIEW_PREP.md](./INTERVIEW_PREP.md) (Q&A) ·
> [RESUME.md](./RESUME.md) (bullets) · [LEARNING_ROADMAP.md](./LEARNING_ROADMAP.md)
> (what's next). Code-level detail: [../leetsage-learning-guide.md](../leetsage-learning-guide.md).

---

## How to read an entry

Each entry follows the same shape so it's scannable and interview-ready:

- **What** — the change, in one line.
- **Why** — the motivation / problem it solved.
- **What broke / the hard part** — the bug, dead end, or tricky decision.
- **How solved** — the resolution.
- **Interview angle** — the story or signal to highlight.
- **Commit(s)** — the git reference(s).

---

## 2025-08-24 — Project scaffold & first problem detection

**What.** Initial Chrome-extension setup; content + background scripts that read
the current LeetCode problem name and display it.
**Why.** Prove the core plumbing: can an extension see the problem the user is on?
**Hard part.** A Chrome extension has three isolated JS contexts (content script,
background, UI) that can't share memory — only messages and storage.
**How solved.** Established the content-script → background → UI message flow.
**Interview angle.** Understanding the multi-context extension architecture from
day one — a concrete "I know how browser extensions actually work" point.
**Commits.** `0521e76`, `8c6633a`, `949c46a`.

## 2026-03 → 04 — Kiro adoption & AI-assistant core (with a revert)

**What.** Brought the project into a spec-driven Kiro workflow; implemented the
first AI learning-assistant core features. One implementation was reverted and
redone.
**Why.** Move from "displays the problem" to "coaches on the problem", and adopt a
requirements → design → tasks workflow.
**Hard part.** An early full implementation didn't hold up and was reverted —
a normal part of iterating, worth being honest about.
**How solved.** Reverted (`03d0fd7`) and rebuilt the core cleanly (`2505f8e`).
**Interview angle.** Spec-driven, AI-assisted development workflow; willingness to
revert and redo rather than patch a bad foundation.
**Commits.** `59c25f9`, `f450b6d`, `03d0fd7`, `2505f8e`.

## 2026-08-29 — Phase 1: Gemini BYOK, chat-hybrid UI, guardrails, MV3 fix

**What.** Wired up Google Gemini (bring-your-own-key, free tier); built the
chat-hybrid side-panel UI with free-tier guardrails and a dark/light theme; fixed
MV3 service-worker registration so problem data displays reliably.
**Why.** This is the product coming alive: real AI coaching, free to run, no
backend. (See [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md) ADR-001/003/005.)
**What broke.** (1) The MV3 **service worker was crashing silently** on ES-module
imports. (2) A push-based problem-data flow dropped data whenever the worker slept.
(3) The API returned **404s** that were first (wrongly) blamed on the `AQ.`-prefixed
API key — the real cause was a **stale model name**: the specced `gemini-2.5-*`
identifiers were "no longer available to new users."
**How solved.** (1) Added `"type": "module"` to the manifest's background entry.
(2) Switched to a **pull-based** flow — the panel requests the problem on demand
with retry/backoff, plus a `chrome.scripting.executeScript` inject fallback.
(3) Switched to `gemini-3.5-flash-lite` / `gemini-3.5-flash` (verified against
Google's model docs); confirmed the `AQ.` key works fine with Bearer auth.
**Interview angle.** Real MV3 systems debugging (worker lifecycle, silent crashes,
push-vs-pull) — a strong "tell me about a hard bug" story. Plus the BYOK/no-backend
cost & security tradeoff. And a debugging-discipline lesson: an error's *first
suspected cause* (the unusual key format) was a red herring; the real cause was a
deprecated model name — now the rule is "verify model names against provider docs
before assuming."
**Commits.** `28e9de0`, `425621b`, `75305b0`, `839993d`.

## 2026-08-30 — Session persistence + pre-submission code analysis + "Understand solution"

**What.** Made chat history persist through submissions; added pre-submission
"Analyze my code"; added the "Understand solution" action and redesigned the
action bar (primary row + "More" overflow, context-aware).
**Why.** Coaching should survive navigation, and should be able to read the user's
actual editor code (via the Monaco MAIN-world reader).
**What broke.** Submitting a problem **wiped the session** because history was
keyed on the full URL, which changes on the submissions tab.
**How solved.** `normalizeProblemUrl()` → keys on `/problems/{slug}/`, so submit/
navigation no longer resets the chat.
**Interview angle.** State-persistence design keyed on a normalized identity;
reading page state the isolated content script can't reach (MAIN-world injection).
**Commits.** `e1ddc4b`, `2b1355a`.

## 2026-08-31 — Polish: buttons, stuck timer, complexity formatting, README, color

**What.** Fixed button rendering, tuned the stuck timer, improved complexity
formatting (superscripts + space complexity + per-operation breakdown),
consolidated the header, rewrote the README, and added color + readability polish.
**Why.** The tool worked but felt monochrome and slightly rough; readability and
scannability matter in a narrow side panel.
**What broke.** A global `button { all: unset }` was **stripping all Tailwind
button styling**, making every button look identical — the root cause of "the
buttons look the same."
**How solved.** Replaced it with a targeted reset in `@layer base`; added
color-coded section headings and a superscript renderer normalizing `O(N^2)`/`O(N2)`
→ O(N²).
**Interview angle.** CSS-cascade debugging (a global reset with unintended reach);
attention to UX in a constrained surface.
**Commits.** `1316a4a`, `b10192d`, `43c5d55`.

## 2026-09-01 — Career & engineering documentation

**What.** Added `docs/career/`: DESIGN_DECISIONS (ADRs), INTERVIEW_PREP, RESUME,
LEARNING_ROADMAP.
**Why.** Turn the project into durable interview/resume material, grounded in
researched 2026 hiring expectations and the real implementation.
**Interview angle.** The docs themselves demonstrate reflective engineering — you
can articulate *why* every choice was made, not just *what* was built.
**Commits.** `6d63379`.

## 2026-09-02 — Progress-tracking MVP (Phase A)

**What.** A "Generate report" action producing a Markdown study note for the
current problem, plus a Copy button on responses.
**Why.** Ship the progress-tracking value immediately with no persistence
infrastructure, and validate the report format before building storage (Phase B).
**Interview angle.** Shipping a thin, useful MVP slice to de-risk a larger feature.
**Commits.** `758d868`.

## 2026-09-02 — Fix: "Understand solution" explains the OPTIMAL solution

**What.** Reframed "Understand solution" to explain the *optimal* solution as the
reference, treating the user's editor code as untrusted context — never asserting
it is correct.
**Why.** It was explaining whatever was in the editor *as if it worked*, even when
the code was incomplete or wrong — actively teaching the wrong thing.
**Root cause.** The prompt assumed "the developer has written a working solution",
which the tool can't verify (it can't run the code or see test results).
**How solved.** Rewrote the prompt to explain the optimal approach, forbid
correctness claims, and add a conditional "How Your Attempt Compares" section that
relates their code without asserting it passes. Kept it distinct from "Analyze my
code" (which reviews *their* code).
**Interview angle.** A subtle correctness/trust bug in an AI learning tool:
recognizing the model can't verify what it's asked to praise, and designing around
that limitation. Pairs with the guardrail as a "safety in an AI product" story.
**Commits.** `e3c5b93`.

## 2026-09-02 — Design: Progress Tracking phases B/C (system-design teaching doc)

**What.** Documented the full data model and storage design for persistent
per-problem records (Phase B) and cross-problem analytics / "weakest link"
(Phase C), as a teaching doc.
**Why.** The "weakest link across problems" idea needs persistence + a structured
data model + aggregation — a genuine system-design exercise under a no-backend
constraint.
**Interview angle.** Data modeling around read patterns, index/summary projections,
event-log `attempts[]` vs. mutable state, schema versioning, and knowing the
backend boundary. See [../leetsage-progress-tracking/design.md](../../.kiro/specs/leetsage-progress-tracking/design.md).
**Commits.** `c3790ea`.

## 2026-09-02 — Decision: structured output is the backbone (resequenced ahead of Phase B)

**What.** Decided to introduce a hybrid **prose + structured `data`** response for
the report-feeding actions, and moved it *ahead* of progress-tracking Phase B on
the roadmap.
**Why.** Testing the report MVP revealed it produced generic textbook writeups —
because responses are freeform prose with no machine-readable data, so the report
had nothing structured to summarize.
**Root cause.** Architectural: responses carried only the human rendering, not the
data. Every downstream consumer (report, records, analytics, evals) would have to
reverse-engineer facts out of prose.
**How solved (designed, not yet built).** A `StructuredResponse<T>` shape — prose
for the human + a small schema-conforming `data` block stored on
`ContentMetadata.structured` — as a single source of truth all features consume.
Documented the hard decisions: Gemini JSON reliability (+ tolerant parse fallback),
the streaming-vs-parsing tension, and prose/data consistency.
**Interview angle.** ⭐ Your strongest *architecture* story: diagnosing a root cause
(not patching a symptom), separation of data from presentation / single source of
truth, recognizing a load-bearing primitive, and sequencing around it. Captured as
INTERVIEW_PREP Q8. See [../leetsage-structured-output/design.md](../../.kiro/specs/leetsage-structured-output/design.md).
**Commits.** `7104be0`.

## 2026-09-02 — UI: Copy button relocated to a compact icon

**What.** Moved the Copy control from the card header to a compact, icon-only
button at the bottom of the response.
**Why.** In the header it competed with other controls and was easy to miss; a
labelled button at the bottom felt too big with empty space beside it.
**How solved.** A 24×24 borderless icon (⧉ → ✓ when copied), right-aligned at the
bottom, label in the tooltip/aria-label. Now a real `<button>` (no invalid nesting
inside the header button).
**Interview angle.** Iterating on UX from real use; accessibility detail (avoiding
nested interactive elements).
**Commits.** `12aa35e`.


## 2026-09-02 — Steering files, spec index, and doc-drift reconciliation

**What.** Set up the three Kiro **steering files** (`product.md`, `tech.md`,
`workflow.md`) and a **spec index** (`.kiro/specs/README.md`); reconciled the
code-level docs (`leetsage-learning-guide.md`, `chrome-extension-guide.md`) with
the shipped code; resolved the Gemini model-version drift across code and specs;
and hardened the project-historian agent's verification instructions.
**Why.** The real trigger was a *process* problem: this work had been running in
one long session, and context kept compacting and losing detail. The fix was to
**externalize durable knowledge into files** so a *fresh* session can orient from
`product`/`tech`/`workflow` steering + the spec index instead of relying on a
lossy conversation. Same instinct that motivates the dev journal, applied to the
working rules themselves.
**What broke / the hard part.** The docs and code had genuinely drifted — most
concretely the model name: specs said `gemini-2.5-*`, but those identifiers 404
("no longer available to new users") and the code had already moved to
`gemini-3.5-*`. Two sources disagreed and only the code was right.
**How solved.** Wrote the steering files as standing facts (stack, build gotchas,
the no-solution product constraint, git/UX conventions); added the spec index
marking each spec shipped/designed/planned; corrected the model name in the specs
with a dated *superseded* note (kept the README version-agnostic — "Flash-Lite");
and added an explicit "verify model names against provider docs" rule to `tech.md`
and the historian so the same stale-name loop cannot recur.
**Interview angle.** **Context engineering as an engineering discipline** — noticing
that a long single session degrades quality, then treating durable knowledge as
files (steering, specs, ADRs, journal) that any fresh session or agent can load,
rather than trusting chat memory. Plus the concrete "docs-vs-code drift, code was
right" cleanup and building a repeatable guardrail against the specific failure
(a stale model name) rather than just fixing the one instance.
**Commits.** `ca7337c` (steering + spec index), `e3554e9` (learning/chrome-ext
guide reconciliation), `449d82b` (model-drift resolution + historian hardening).

## 2026-09-03 — Structured output shipped: hybrid prose + `data`, session-aware report

**What.** Built the structured-output backbone that was designed on 2026-09-02.
The two report-feeding actions (`CHECK_APPROACH`, `UNDERSTAND_SOLUTION`) now
return a **hybrid response** — the human prose *plus* a small machine-readable
JSON block — and the "Generate report" action consumes that data via a
deterministic session digest, so the report reflects the developer's *actual*
session instead of a generic textbook writeup. Only those 2 actions are
structured; hints/examples/breakdown/concept/chat stay prose-only by design.
**Why.** The report MVP produced generic writeups because every response was
freeform prose with no machine-readable data — the report had nothing
session-specific to consume. The root cause was architectural: responses carried
only a *rendering*, not the *data*. Structured output is the load-bearing fix that
also de-risks progress records, analytics, and evals — one contract, many
consumers.
**What broke / the hard part.** Two things.
(1) **A green build hid a real bug.** `tsc -b && vite build` passed and the happy
path looked done, but the report was still generic. Manual testing plus dumping
`chrome.storage.local` revealed structured data *was* being captured on each
card's metadata — but the report ignored it. Root cause: `handleActionClick` is a
`useCallback` that intentionally omits `learningContent` from its deps (to avoid
re-creating on every streamed chunk), so `buildSessionDigest(learningContent, ...)`
read a **stale/empty closure snapshot** → the digest came out empty and the report
silently fell back to the generic (code-only) prompt.
(2) **"Generic report" was ambiguous** — it could mean an empty digest (a *wiring*
bug) or an ignored digest (a *prompt-strength* problem). Tuning the prompt blind
would have been guessing.
**How solved.** (1) Added a `learningContentRef` that a `useEffect` keeps mirrored
to the latest history; the digest reads `learningContentRef.current` so it always
sees the freshest cards (`src/sidepanel/App.tsx`, lines ~56–58 and ~213–214).
(2) Added a **temporary diagnostic `console.log` of the exact prompt input** (the
digest text). It showed a *populated* digest → so the wiring was fine and it was
prompt strength → reworked the `GENERATE_REPORT` prompt to foreground the
`SESSION ACTIVITY` block as the primary source ("reflect the actual journey, not a
textbook writeup"). Removed the log before commit. Verified live on
*largest-rectangle-in-histogram*: the console showed the digest populated ("3 of 6"
cards carried structured data) and the report described the real O(N²)→O(N)
journey, the specific bugs, and the hint used.
On the parser side, `parseStructuredResponse` **never throws** — a missing,
malformed, or schema-invalid block degrades to prose-only — and
`stripDataBlockForDisplay` hides the block (and a partially-streamed fence) during
live streaming so raw JSON never flashes. The digest is **deterministic** (built
at read time from the stored structured fields), not a second LLM summarization
call.
**Interview angle.** ⭐ Two strong, distinct stories. **Architecture:** diagnosing
a *root cause* (responses carried a rendering, not data) rather than patching the
prompt symptom — separation of data from presentation, single source of truth,
tolerant parse with a prose-only fallback over a non-deterministic boundary, and
streaming the prose while finalizing the small data block at the end. **Workflow:**
"compiles ≠ works" for event-driven, non-deterministic LLM features — the green
build hid a stale-closure React bug that only surfaced by inspecting *persisted
state*; and when an LLM output is wrong, **instrument the exact input first** (the
diagnostic log turned "generic report" into a two-way diagnosis) instead of tuning
the prompt blind. Also: verified Gemini's `response_format: json_schema` support
against current docs before deciding *not* to use it — the same "verify against
provider docs" discipline as the earlier model-name 404.
**Caveats (not overclaimed).** Only 2 actions are structured; prose↔data
consistency is a prompt instruction, not a render-from-data guarantee; the
degradation path is verified by code reading, not yet observed against a real bad
model response; no unit tests yet (`structured-parser.ts` and `session-digest.ts`
are pure and are prime targets). Progress-tracking Phase B is *enabled* by this
work, not built.
**Commits.** `affc683` (feat: structured-output layer + report session digest) on
branch `feature/structured-output` — `src/types/{models,api,index}.ts`,
`src/services/{structured-parser,session-digest,prompts,llm-service}.ts`,
`src/sidepanel/App.tsx` (plus minor `ContentDisplay.tsx` word-wrap/overflow UI
polish that rode along in the same commit).

## 2026-09-04 — Progress-tracking Phase B + C: persistent records, "My Progress", analytics

**What.** Built persistent per-problem progress on top of the structured-output
backbone: a versioned `ProblemRecord` data model with an append-only
`attempts[]` history and a light `ProblemIndexEntry` projection; a
`record_{slug}` + `progress_index` storage layout with schema migration on every
read; a deterministic cross-problem analytics pass ("weakest link", revisit list);
and a full-panel **My Progress** UI (problem list → record detail with an attempts
timeline, per-record copy/delete, "Copy all"; insights hidden until ≥3 problems,
with a Low/Medium/High confidence badge). `GENERATE_REPORT` also became a
**structured producer** so records populate reliably, and several honesty bugs
were fixed (see below). On branch `feature/progress-tracking-phase-b`, not yet
pushed.
**Why.** Phase A shipped only an on-demand report; the value of "track my progress
and tell me my weakest pattern across problems" needs persistence, a structured
data model, and aggregation — a real system-design exercise under the no-backend
constraint. The structured-output layer (2026-09-03) made it buildable: records
populate from the same machine-readable `data` other consumers read. Key design
calls: **reuse the shipped Title-Case `ProblemPattern` + `Complexity {time,space}`
types** rather than the design doc's illustrative kebab schema (the spec had
drifted; aligning to shipped code avoids a translation layer and a second pattern
vocabulary); a **full-panel screen over a modal** (a near-full-width dialog reads
poorly in a narrow side panel); and **insights hidden until ≥3 problems + a
confidence badge** so analytics on thin data stay honest.
**What broke / the hard part.** A green build hid three data-correctness bugs that
the compiler could never catch — all only visible by inspecting actual saved
records / `chrome.storage.local` dumps:
(1) **"patterns: none" on Car Fleet.** Patterns previously came *only* from
`UNDERSTAND_SOLUTION`, so saving a report without ever running that action
produced a record with no patterns — which then dropped out of analytics.
(2) **Inflated attempt count.** A save click (or re-generate + re-save of the same
solution) was being logged as a new "attempt", so the count didn't reflect real
re-solves.
(3) **"plaintext" language.** LeetCode leaves Monaco's model language as
`"plaintext"`, so `getLanguageId()` returned `"plaintext"` and the reliable
toolbar-selector fallback never ran — records stored a useless language.
Plus a projection subtlety: the record's approach/complexity was being taken from
the (possibly stale) latest analysis instead of the report the user actually saved.
**How solved.**
(1) Made `GENERATE_REPORT` emit and parse its **own** `ReportData` block
(`patterns`, `approachSummary`, `optimalComplexity`, `solvedOptimally`) via
`prompts.ts` + `structured-parser.ts` (added to `STRUCTURED_ACTIONS`), so a
report-only save still carries patterns (commit `538781c`).
(2) Gave `saveAttempt` an **append-vs-replace** rule (`f0b7c58`): same calendar
day + unchanged approach & complexity → replace the latest attempt in place;
different day OR changed approach/complexity → append a genuinely new attempt (pure
helpers `shouldReplaceLatest` / `sameCalendarDay`). And **deferred the attempt
count from the UI** entirely — kept the timeline (renamed "History"), and
list/detail/insights show recency + "N problems tracked" — because an attempt is
still *inferred*, not verified, until Phase D captures real submission events.
(3) In `code-extractor.ts`, treat `plaintext`/empty as "not identified" so the
toolbar language ("Python3") is read; `ProgressView.displayLanguage()` omits
plaintext/unknown/empty.
For the projection, `buildRecordProjection` now prefers the report's own
`ReportData` over stale session facts, and applies a **complexity-honesty rule**
(report the optimal complexity only if `solvedOptimally`, else the analysis'
measured complexity). Also removed the model-written `**Date:**` line from the
report — the app timestamps the saved attempt itself. The spec was kept in sync
(`design.md` §3.1/§3.3 now describe the append-vs-replace rule and the
deferred-count decision). Build passed (`tsc -b && vite build`) throughout.
**Interview angle.** Two distinct stories. **System design:** a client-side data
model chosen around read patterns — one `record_{slug}` key plus a small index
projection for the list/analytics (read optimization vs. write-amplification on
save), an append-only event log (`attempts[]`) rather than mutable state, schema
versioning with `migrate()` on every read, and a deterministic analytics pipeline
(group-by-pattern → struggle score → weakest link) with an explicit low-confidence
threshold — all under a deliberate no-backend boundary. **Honesty as a design
stance:** the product repeatedly *refuses to overclaim on inferred data* — the
low-confidence insights label, the deferred attempt count, the "optimal only if
solved-optimally" complexity rule, and the "model owns judgments (patterns,
complexity, narrative), the system owns facts (date, title, difficulty, language)"
split that drove removing the model-written date. **Workflow:** the same
"compiles ≠ correct data" lesson as the structured-output entry, now reinforced —
three separate bugs (inflated count, stale-analysis projection, "plaintext"
language) were invisible to `tsc` and only caught by inspecting persisted records;
for LLM-fed data paths, inspect the persisted state, not just compilation. And a
"verify don't assume" catch: reconciling the design-doc's illustrative schema
against the *shipped* structured-output types before building, which surfaced real
drift and avoided a needless translation layer.
**Caveats (not overclaimed).** Phase D auto-save on an Accepted submission is
**not** built — so `outcome: 'solved'` is inferred, not verified (why the attempt
count is deferred). Only clipboard "Copy all" exists; export-to-file is not built
(and it's the roadmap item that must precede the permission-scoping change). No
unit tests yet — the pure helpers (`complexityRank`, `computeBestAttemptIndex`,
`computeInsights`, `computeStruggleScore`, `shouldReplaceLatest`, `sameCalendarDay`,
`slugFromUrl`, the parser) are the intended targets and pair with the evals/tests
roadmap item. No write-lock on the read-modify-write (single-user local store;
noted in code).
**Commits.** `798228b` (feat: progress tracking Phase B + C — records, My Progress,
analytics), `538781c` (feat: make `GENERATE_REPORT` a structured producer; stop
model-written dates), `f0b7c58` (fix: honest attempt semantics + correct projection
& language) — all on branch `feature/progress-tracking-phase-b` (off
`main`@`336e34a`), **not yet pushed**. Files:
`src/types/{models,index}.ts`, `src/services/{progress-records,progress-analytics,
session-digest,prompts,structured-parser,code-extractor}.ts`,
`src/components/{ProgressView,ContentDisplay}.tsx`, `src/sidepanel/App.tsx`, and
`.kiro/specs/leetsage-progress-tracking/design.md`.

---

## Next up (see [LEARNING_ROADMAP.md](./LEARNING_ROADMAP.md))

1. ~~**Structured output** — the backbone~~ — **DONE (2026-09-03)**; the report is
   now session-aware and records/analytics/evals have a machine-readable contract
   to consume.
2. ~~**Progress-tracking Phase B/C** — persistent records + "My Progress" view +
   analytics~~ — **DONE (2026-09-04)**, on the unpushed
   `feature/progress-tracking-phase-b` branch. Phase D (auto-save on an Accepted
   submission → verified attempts) is the deferred remainder.
3. **Evals + tests + metrics** — the biggest resume/interview unlock; easier now
   that structured output exists (assert on `data` fields, not prose), and there's
   now a fresh batch of pure helpers to unit-test (`complexityRank`,
   `computeBestAttemptIndex`, `computeInsights`, `computeStruggleScore`,
   `shouldReplaceLatest`, `sameCalendarDay`, `slugFromUrl`).

*When each lands, add an entry above (via the project-historian agent) and backfill
any resulting numbers into [RESUME.md](./RESUME.md).*

---

## Reference — Shipped vs. spec (verified 2026-09-02)

> Not a dated build entry — a **standing reference** you can re-read before an
> interview to state precisely *what LeetSage does today* and *what is designed
> but not yet built*, without over-claiming. Grounded in a read of the actual
> `src/` at commit `7d4d71b`, cross-checked against the specs. Update this when
> the shipped surface changes.

### Where the specs live (and which is authoritative)

- **`.kiro/specs/ai-learning-assistant/`** — the ORIGINAL vision spec (7 action
  buttons, OpenAI/Anthropic, chat mode, stuck timer). Explicitly marked
  **historical**: it shaped the design, then evolved. Do not describe it as the
  current build.
- **`.kiro/specs/leetsage-phase1-gemini/`** — the **authoritative shipped spec**:
  Gemini free-tier + BYOK, chat-hybrid UI, guardrails, MV3 icon fix.
- **`.kiro/specs/leetsage-{progress-tracking,structured-output,cheatsheet,
  pseudocode-mode,phase2-struggle-first,phase3-analytics}/`** — **planned /
  designed**, not yet shipped (structured-output and progress-tracking B/C have
  detailed design docs; the rest are requirements only).

### Shipped and verified in `src/`

- **Coaching actions (9 `ActionType`s in `types/models.ts`).** Primary chips:
  `GET_HINT`, `BREAK_DOWN_PROBLEM`, `CHECK_APPROACH` ("Analyze my code"),
  `UNDERSTAND_SOLUTION`. Secondary (under "More"): `GENERATE_EXAMPLES`,
  `EXPLAIN_CONCEPT`, `TIME_COMPLEXITY_HINT`, `PATTERN_RECOGNITION`,
  `GENERATE_REPORT`. (`QuickActions.tsx`.) Note: this evolved past the original
  spec's 7 — `UNDERSTAND_SOLUTION` and `GENERATE_REPORT` were added later.
- **Chat-hybrid UI**, not the original button-only panel. Free-form questions go
  through the same pipeline, grounded by prepending problem context
  (`llm-service.ts` `buildMessages`).
- **Gemini via the OpenAI-compatible endpoint** (`llm-service.ts`), BYOK, with
  streaming (SSE) + non-streaming paths, `max_tokens` cap, `AbortController`
  timeout, and retry/backoff on 5xx (401/403/429 surfaced, not retried).
- **Free-tier guardrails** (`rate-limiter.ts`, `DEFAULT_GUARDRAILS` in `api.ts`):
  per-minute + per-day caps, cooldown, request timeout, usage counter, kill
  switch — all adjustable in settings.
- **Solution filter** (`solution-filter.ts`): blocks solution-revealing phrases,
  over-long code blocks (>14 lines), complete-function patterns, and full
  step-by-step pseudocode. **Exempts** `CHECK_APPROACH`, `UNDERSTAND_SOLUTION`,
  `GENERATE_REPORT` (those legitimately involve the user's own code / a report).
- **Editor code reading** (`code-extractor.ts`): MAIN-world injection to read
  Monaco's model value, with a `.view-lines` DOM fallback and a toolbar-based
  language detector.
- **Progress tracking + persistence** (`progress-tracker.ts`, `storage.ts`): used
  actions + hint level + history per normalized problem URL, in `chrome.storage`.
- **Report action** (`GENERATE_REPORT`) producing a Markdown study note; Copy
  button on responses (Phase A MVP).
- **Structured output** (added 2026-09-03, not in the original `7d4d71b` read):
  `CHECK_APPROACH` and `UNDERSTAND_SOLUTION` emit a trailing `leetsage-data` JSON
  block parsed onto `ContentMetadata.structured`; `GENERATE_REPORT` consumes a
  deterministic `buildSessionDigest(...)` so the report is session-aware. Tolerant
  parse degrades to prose-only. Caveats: only those 2 actions; prose↔data
  consistency is a prompt instruction, not enforced; no unit tests yet.

### Designed but NOT yet shipped (say "planned", not "built")

- **Persistent per-problem records + "My Progress" view** (progress-tracking
  Phase B/C) — designed; today only the on-demand report exists.
- **Cheatsheets, pseudocode playground, struggle-first hint gating, learning
  analytics** — requirements/spec only.
- **Chat Mode toggle & Stuck Timer as originally specced** — a `stuck-timer.ts`
  exists and the chat surface shipped as the hybrid input, but the original
  spec's standalone Chat Mode component and full stuck-timer UX are not the
  shipped shape; describe the hybrid input + tuned timer as what actually ships.
- **Evals / automated tests / metrics** — not yet; the optional property tests in
  the task plans (`*`-marked) were not implemented.

### ✅ Model version — resolved (safe to state in an interview)

The shipped model is **`gemini-3.5-flash-lite` (default) / `gemini-3.5-flash`**
(`types/api.ts`, `services/storage.ts`, `services/llm-service.ts`), verified
against Google's current model docs (2026). The earlier Phase 1 *spec* had
specified `gemini-2.5-*`; those identifiers returned 404 ("no longer available to
new users") against the endpoint, so implementation switched to `3.5-*`. The
Phase 1 spec has since been updated with a dated superseded note; the README only
says "Flash-Lite" generically (no stale version). So: **code is correct, docs are
aligned, `2.5` was the tried-first-and-failed name — that's the story, not a
discrepancy.**
