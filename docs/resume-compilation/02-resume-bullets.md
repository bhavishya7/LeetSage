# 02 — Resume Bullets

> Candidate bullets tagged by JD angle. Each has short/medium/long variants, an
> evidence table mapping every phrase to a citation, and a "do not claim" list.
> **Voice:** strong verb → mechanism → outcome; tech named inline; **no invented
> numbers**. Pick the variant that fits the resume's density; tailor the tag set to
> the job.
>
> **The only real numbers available** are: 134 tests / 10 files (verified by running
> `npm run test`), the guardrail eval's scores on its **authored** dataset (100%
> catch / 0% false-positive after hardening; 62.5% catch on first run before the
> fix), and 9 coaching actions. There are **no** user, latency, cost, or adoption
> numbers — see "Do not claim" lists. Where a bullet says "no measured figure,"
> leave it out or ask the user for a real one.

---

## Bullet 1 — LLM integration + safety (angle: LLM, testing)

- **Short:** Built an AI LeetCode coach (React 19 / TypeScript, Gemini) with a
  deterministic output filter enforcing "never reveal the full solution," gated by a
  labeled eval in CI.
- **Medium:** Built a client-side AI coaching extension (React 19, TypeScript, Google
  Gemini via its OpenAI-compatible API) that streams responses and enforces a "teach,
  never solve" rule through a deterministic post-generation filter; hardened the filter
  after a labeled eval it gated in CI caught real leak paths its author missed.
- **Long:** Built a client-side AI LeetCode coaching extension (React 19, TypeScript,
  Google Gemini over its OpenAI-compatible endpoint with token streaming) whose defining
  constraint — teach without handing over the full solution — is enforced by a
  deterministic post-generation filter over the non-deterministic model; backed it with
  a hand-labeled guardrail eval (confusion-matrix metrics) wired into GitHub Actions CI,
  where the eval caught complete-function and pseudocode leak paths the author's
  intuition missed and drove a fix to 100% catch / 0% false-positive on the set.

**Evidence table**

| Phrase | Citation |
|---|---|
| React 19 / TypeScript | `package.json` (react `^19.1.1`, typescript `~5.8.3`) |
| Gemini via OpenAI-compatible API | `src/services/llm-service.ts` (`GEMINI_BASE_URL`, Bearer auth) |
| streams responses | `src/services/llm-service.ts` → `streamLLMRequest` (SSE generator) |
| deterministic post-generation filter | `src/services/solution-filter.ts` → `filterResponse` |
| labeled eval / confusion-matrix metrics | `src/evals/{fixtures/guardrail-cases.ts, metrics.ts, guardrail-eval.test.ts}` |
| gated in CI | `.github/workflows/ci.yml` (`npm run test` step); commit `b0b98e3` |
| caught real leak paths; 62.5%→100% | `DEV_JOURNAL.md` 2026-09-15; hardened `solution-filter.ts` (`looksLikeCompleteBraceFunction`); commit `0031cb9` |
| 100% catch / 0% false-positive | `guardrail-eval.test.ts` (asserts `catchRate === 1`, `falsePositiveRate === 0` on the authored set) |

**Do not claim:** that the 100% catch generalizes to real-world model output (it's an
**authored** dataset — a regression gate; `fixtures/guardrail-cases.ts` HONESTY NOTE).
Don't imply a live LLM-as-judge (it's an offline scaffold). No latency/token/cost numbers.

---

## Bullet 2 — Platform-constrained architecture (angle: architecture, full-stack)

- **Short:** Architected a Manifest V3 Chrome extension across three isolated contexts
  with a pull-based, service-worker-resilient data flow.
- **Medium:** Architected a Manifest V3 Chrome extension spanning three isolated JS
  contexts (content script, service worker, React side panel) that coordinate via typed
  message passing and `chrome.storage`; used a pull-with-retry data flow to survive the
  MV3 worker sleeping.
- **Long:** Architected a Manifest V3 Chrome extension across three isolated JS contexts
  (content script, background service worker, React side panel) communicating only via
  typed, discriminated-union message passing and `chrome.storage`; designed a pull-based
  (side-panel-requests) data flow with retry/backoff and a `chrome.scripting` inject
  fallback to survive the MV3 service worker's sleep/wake lifecycle, and read the user's
  code from Monaco by injecting into the page's MAIN world that the isolated content
  script can't reach.

**Evidence table**

| Phrase | Citation |
|---|---|
| Manifest V3, three contexts | `public/manifest.json`; `src/{content,background,sidepanel}/` |
| typed / discriminated-union message passing | `src/types/messages.ts` (`ExtensionMessage`, `is*Message` guards) |
| pull-based with retry/backoff | `src/content/index.ts` (`REQUEST_PROBLEM_DATA`); `DESIGN_DECISIONS.md` ADR-006 |
| survive worker sleeping | `DESIGN_DECISIONS.md` ADR-006; `DEV_JOURNAL.md` 2026-08-29 |
| Monaco MAIN-world injection | `src/services/code-extractor.ts` (`world: 'MAIN'`, `readEditorFromPage`) |

**Do not claim:** cross-browser support (Chrome-only; manifest matches `leetcode.com`
only). Don't call it "published on the Web Store" — deployment is manual (load unpacked).

---

## Bullet 3 — Data modeling under a no-backend constraint (angle: architecture, full-stack)

- **Short:** Designed a client-side, no-backend data layer (versioned records +
  index projection + deterministic analytics) in `chrome.storage`.
- **Medium:** Designed a client-side persistence layer with no backend: schema-versioned
  per-problem records, a lightweight index projection for cheap list/analytics reads, an
  append-only attempts log, and a deterministic cross-problem analytics pass that flags
  low-confidence insights on thin data.
- **Long:** Designed a no-backend, client-side data layer in `chrome.storage`
  modeled around read patterns — one record-per-problem key plus a small index projection
  (read-optimization vs. write-amplification), an append-only `attempts[]` event log with
  a denormalized "best attempt" pointer, schema versioning applied on every read, and a
  pure deterministic analytics pipeline (group-by-pattern → struggle score → weakest link)
  that suppresses insights below a confidence threshold rather than overclaiming.

**Evidence table**

| Phrase | Citation |
|---|---|
| schema-versioned records, migrate-on-read | `src/services/progress-records.ts` (`migrate`, `PROBLEM_RECORD_SCHEMA_VERSION`) |
| index projection for cheap reads | `progress-records.ts` (`progress_index`, `ProblemIndexEntry`, `toIndexEntry`) |
| append-only attempts log + best pointer | `progress-records.ts` (`saveAttempt`, `computeBestAttemptIndex`); `src/types/models.ts` (`Attempt`) |
| deterministic analytics, low-confidence gate | `src/services/progress-analytics.ts` (`computeInsights`, `computeStruggleScore`, `lowConfidence: problemCount < 3`) |
| no backend | `DESIGN_DECISIONS.md` ADR-003 |

**Do not claim:** verified "solved" outcomes (inferred, not verified — Phase D is
`[PLANNED]`); export-to-file (not built; only clipboard copy). No "N problems tracked"
number — that's per-user runtime data, not in the repo.

---

## Bullet 4 — Testing / quality engineering (angle: testing, LLM)

- **Short:** Stood up the project's first test suite (Vitest, 134 tests) plus a labeled
  guardrail eval scored as a release gate.
- **Medium:** Introduced Vitest as the project's first test framework — 134 unit tests
  across 10 files over the pure logic (filter, parser, analytics, rate limiter) — plus a
  labeled solution-filter eval with confusion-matrix metrics and an offline, injectable
  LLM-as-judge scaffold, run as a CI release gate.
- **Long:** Introduced automated testing to the project (Vitest, 134 tests / 10 files
  covering the deterministic guardrail, structured-output parser, analytics, records, and
  rate limiter), and built a two-tier eval harness — a hand-labeled dataset with
  confusion-matrix metrics and an offline, network-free LLM-as-judge scaffold — wired
  into GitHub Actions so a change that weakens the safety guardrail fails the build;
  anchored tests to stated contracts (not observed output) to avoid characterization bias
  and documented the dataset's honest limits.

**Evidence table**

| Phrase | Citation |
|---|---|
| Vitest, first test framework | `package.json` (vitest `^5.0.1`); `vitest.config.ts` |
| 134 tests / 10 files | **Verified by running `npm run test`** (10 files, 134 passed) |
| covers filter/parser/analytics/records/rate limiter | `src/services/__tests__/` (8 files) + `src/evals/metrics.test.ts` |
| confusion-matrix metrics | `src/evals/metrics.ts` (`confusionMatrix`, `computeMetrics`) |
| offline injectable LLM-as-judge scaffold | `src/evals/llm-judge.ts` (`JudgeFn` transport, mock in tests) |
| CI release gate | `.github/workflows/ci.yml`; commit `b0b98e3` |
| contract-anchored (anti-characterization-bias) | `DEV_JOURNAL.md` 2026-09-15 (the failing session-digest test) |

**Do not claim:** component/integration/E2E coverage (none — pure-logic only). Don't
present the eval score as validated real-world recall. No coverage-percentage number
(coverage % was not measured).

---

## Bullet 5 — Agentic / spec-driven development (angle: agentic, prompt engineering)

- **Short:** Drove a spec-driven, AI-agent-assisted workflow (specs → design → tasks →
  review), authoring architecture decisions and correcting agent output before merge.
- **Medium:** Built the project through a spec-driven agentic workflow in an AI IDE —
  authoring requirements/design/tasks and ADRs, decomposing features for the agent,
  reviewing and integrating output through PRs, and overriding the agent where its work
  was wrong (e.g. directing a guardrail-filter fix instead of accepting a weak eval score).
- **Long:** Engineered a spec-driven, AI-agent-assisted development workflow: authored
  per-feature specs (requirements/design/tasks), architecture decision records, and
  standing "steering" rules; built a purpose-configured documentation sub-agent with
  deliberately scoped, least-privilege permissions; and kept a human-in-the-loop review
  discipline visible in the commit history (design → implement → record, merged via PRs)
  — including overriding the agent to harden a safety filter after an eval disagreed with it.

**Evidence table**

| Phrase | Citation |
|---|---|
| spec-driven (requirements/design/tasks) | `.kiro/specs/` (8 specs) + `README.md` status index |
| ADRs | `docs/career/DESIGN_DECISIONS.md` (ADR-001…008) |
| standing steering rules | `.kiro/steering/{product,tech,workflow}.md` |
| scoped least-privilege sub-agent | `.kiro/agents/project-historian.md` (read-only git; writes limited to `docs/career/**`) |
| design→implement→record, PRs | `git log` (`c3790ea`/`7104be0` → `affc683`/`798228b` → `a3ff192`/`dfd4e74`; PRs #5–#12) |
| overrode the agent (filter fix) | `DEV_JOURNAL.md` 2026-09-15 (chose to harden filter after 62.5% eval); commit `0031cb9` |

**Do not claim:** that the AI worked unattended, or that "AI wrote the whole app." The
signal is the human's specifying/reviewing/correcting role — keep it framed that way.

---

## Bullet 6 — Frontend / UX in a constrained surface (angle: full-stack, frontend)

- **Short:** Built the React 19 + Tailwind side-panel UI: streaming response cards,
  progressive-hint chips, and a "My Progress" analytics view.
- **Medium:** Built the extension's React 19 + Tailwind 4 side-panel UI (Vite
  multi-entry build) — streaming markdown response cards, context-aware action chips,
  three-tier progressive hints, and a full-panel "My Progress" list/detail with an
  attempts timeline and confidence-gated insights.
- **Long:** Built the React 19 + Tailwind CSS 4 side-panel UI, bundled by a Vite
  multi-entry build across the extension's three MV3 contexts — live-streaming markdown
  response cards (raw JSON data-blocks stripped mid-stream), context-aware action chips,
  three-tier progressive hints, a theme toggle, and a full-panel "My Progress" view
  (problem list → detail with an attempts timeline, per-record copy/delete) that hides
  analytics until enough data exists to be honest.

**Evidence table**

| Phrase | Citation |
|---|---|
| React 19 + Tailwind 4 | `package.json` (react `^19.1.1`, tailwindcss `^4.1.12`) |
| Vite multi-entry build | `vite.config.ts` (3 inputs: side_panel/background/content) |
| streaming cards; strip JSON mid-stream | `src/components/ContentDisplay.tsx`; `src/services/structured-parser.ts` (`stripDataBlockForDisplay`) |
| action chips, hints | `src/components/QuickActions.tsx`; `src/services/prompts.ts` (hint levels) |
| "My Progress" list/detail | `src/components/ProgressView.tsx` |
| confidence-gated insights | `src/services/progress-analytics.ts` (`lowConfidence`) |

**Do not claim:** design-system or accessibility-audit work (there's targeted a11y
detail — e.g. the copy button's aria-label — but no formal audit). No "users found it
intuitive" — no user research exists.

---

## Global "do not put on the resume" list

- Any user count, download count, GitHub stars, latency, token, or cost figure — **no
  measured figure exists** in the repo.
- "Published to the Chrome Web Store" — deployment is manual (CD deliberately skipped).
- "Full test coverage" / a coverage percentage — not measured; pure-logic tests only.
- "Prevents all solution leaks" — the filter is a strong regression-gated backstop, not a
  proof; semantic paraphrase leaks are a known gap (the LLM-as-judge is a scaffold).
- Phase D verified submissions, cheatsheets, pseudocode mode, struggle-first gating —
  all `[PLANNED]`, not built.
- Encrypted key storage — the key is intentionally plaintext local (ADR-002); don't imply
  otherwise.
