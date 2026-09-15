# LeetSage — Learning & Build Roadmap

> The forward plan, ordered by **interview-value-per-effort**. Every item names
> the AI-engineering skill it teaches, the resume/interview payoff, and a rough
> effort estimate — so each thing you build also advances your job prep. This is
> a *learning* roadmap first; features are the vehicle.
>
> Companion docs: [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md) ·
> [INTERVIEW_PREP.md](./INTERVIEW_PREP.md) · [RESUME.md](./RESUME.md)
> Feature specs live in [../../.kiro/specs/](../../.kiro/specs/).

---

## How to read this

Each item is scored on two axes:
- **Payoff** — how much it strengthens your 2026 AI-engineering resume/interview story.
- **Effort** — rough build cost.

Do **high-payoff / low-effort** first. The ordering below already reflects that.

> ⚠️ Sequencing note carried over from project state: the **progress-tracking
> export** feature should land *before* the "scope extension permissions" security
> change, because that change requires removing/re-adding the extension, which
> clears `chrome.storage.local` (your accumulated chat/history). Export first so
> nothing is lost.

---

## Tier 1 — Do these first (highest payoff per effort)

### 1. Eval suite for the solution-filter guardrail  ✅ DONE (2026-09-15)
**Skill:** LLM evals, LLM-as-judge, precision/recall thinking, non-determinism.
**Why it was #1.** Evals are *the* hot 2026 AI-engineering skill and the way teams
gate releases. This one item simultaneously (a) hardened the core product promise,
(b) unlocked the strongest resume bullet, and (c) produced the project's first
**quantified numbers**.
**What shipped** (`src/evals/`). A hand-labeled dataset of **16 cases (8 leak / 8
safe)** tagged `source:'authored'` with a documented `'captured'` slot; **pure
confusion-matrix metrics** (`metrics.ts`) reporting **catch rate** (recall on leaks),
**false-positive rate**, and **precision**, with the metric math itself unit-tested;
a **guardrail-eval test** that runs `filterResponse` over the dataset and asserts
release-gate thresholds; and an **offline, injectable LLM-as-judge scaffold**
(`llm-judge.ts` — takes a `JudgeFn`, so tests pass a deterministic mock and a real
run could pass a Gemini call; never touches the network itself).
**The payoff (why this was worth it).** The **first run scored 62.5% catch rate**
and surfaced **two real leak paths** the filter missed (a compact complete function;
loop-embedded-conditional pseudocode) — plus a multi-brace-function miss found while
fixing. After fixes: **100% catch / 0% false-positive / 100% precision** on the set,
negatives still passing. The offline mock judge scores 75% (it misses the 2 pure-
prose pseudocode cases — a built-in illustration of why a *real* semantic judge is
needed).
**Interview payoff.** "I designed an eval that measures an AI safety constraint as a
release gate, and it caught real bugs my intuition missed." See
[INTERVIEW_PREP.md](./INTERVIEW_PREP.md) Q3a. **CI wiring — DONE (2026-09-15
follow-up, #3b):** the eval now runs in GitHub Actions on every push/PR, so it's an
automatic gate. **Still open (Tier-1.5):** real captured-response cases + a
*validated* (non-mock) judge. **Honesty caveat to keep stating:** the dataset is
author-generated — a strong regression gate, an optimistic estimate of real-world
recall until real responses are added.

### 2. Automated tests (Vitest) for pure logic  ✅ DONE (2026-09-15)
**Skill:** engineering rigor, testing.
**What shipped.** **Vitest** (5.0.1) as the project's first test framework
(`vitest.config.ts`, `test`/`test:watch`/`eval` scripts) with **134 tests across 10
files**: `solution-filter`, `structured-parser` (closing the "prose-only fallback
never observed against a bad response" gap), `session-digest`, `progress-analytics`,
`progress-records`, `rate-limiter`, `stuck-timer`, and URL normalization — plus the
eval harness (#1). Notable techniques exercised: **fake timers**
(`vi.useFakeTimers()` to drive the 8-min inactivity / 20-min cooldown instantly) and
**mocking `chrome.*`** (an in-memory `chrome.storage.local` stand-in).
**Why it mattered.** Signals rigor; protects the guardrail (core promise) and the
pure helpers from regressions.
**Interview payoff.** Answers "how do you know it works?" and "what's your testing
approach?" — see [INTERVIEW_PREP.md](./INTERVIEW_PREP.md) (Q3a + the "agent-written,
after-the-fact tests" Q&A). Now run automatically in CI on every push/PR (#3b, DONE
2026-09-15 follow-up). **Still open:** component/integration/E2E tests of the React
panel + message plumbing (only pure logic is covered today).

### 3. Instrument basic runtime metrics  ⬅ NOW THE TOP UNMET GAP
**Skill:** production monitoring mindset, cost-awareness.
**What to build.** Lightweight local counters for the numbers the eval *didn't*
produce: **p50/p95 latency, avg tokens/request, requests handled, estimated
cost/request**. (Filter catch-rate / false-positive rate now exist from the eval —
this is the remaining half of "quantified impact.")
**Why.** You can't quote impact you never measured. The eval gave you the *quality*
numbers; these give you the *runtime* numbers, turning the last qualitative resume
bullets into quantified ones.
**Interview payoff.** Fills the remaining `[X]` placeholders in
[RESUME.md](./RESUME.md). **Effort:** Low–Medium. **Depends on:** nothing.

---

## Tier 1.5 — Finish what the eval started (deferred from 2026-09-15)

Small, high-signal follow-ups to the shipped eval/tests — deliberately not done in
the same session to keep it scoped.

### 3a. Real captured-Gemini eval cases + a validated LLM-as-judge
**Skill:** honest measurement, LLM-as-judge validation.
**What to build.** Collect **real Gemini responses** (incl. adversarial phrasings),
hand-label them, and add them as `source:'captured'` cases (the dataset already has
the slot). Then run the LLM-as-judge with a **real** transport and **validate it
against the labeled set**, scoring the judge with the same metrics and noting its
biases (position, verbosity, self-preference). **Why.** The current dataset is
author-generated — a regression gate, not a true recall measurement; this closes
the gap and lets you quote a *defensible* real-world catch rate. **Effort:** Medium.

### 3b. Wire tests + eval into an automatic gate (pre-commit hook / CI)  ✅ DONE (2026-09-15 follow-up)
**Skill:** CI, release gating, CI/CD tooling tradeoffs.
**What shipped.** A **GitHub Actions** workflow (`.github/workflows/ci.yml`) that on
every push and pull request runs `npm ci` → `npm run lint` → `npm run test` (incl.
the guardrail eval) → `npm run build` on a clean Node 22 LTS runner — so a change
that weakens the guardrail **fails the build automatically**. Plus a **Husky
pre-commit hook** (`.husky/pre-commit`) running the same scripts locally as a fast
early warning. On the unpushed `feature/evals-and-tests` branch (`b0b98e3`; a lint
fix `ea82f9b` cleared 4 pre-existing `no-explicit-any` errors so the gate is green).
**The tooling reasoning (the interview payoff).** GitHub Actions chosen — built into
the repo, free, no server to maintain, runs the same npm scripts locally as in CI.
**Docker rejected** — LeetSage has no backend; the artifact is a static `dist/`
bundle, so there's nothing to containerize or deploy to a host. **Jenkins rejected**
— a self-hosted CI server is pure overhead for a solo GitHub project. **The
pre-commit-vs-CI distinction:** CI is the authority (`npm ci` on a clean machine from
the lockfile catches dependency drift; not skippable), the hook is a skippable local
subset. See [INTERVIEW_PREP.md](./INTERVIEW_PREP.md) Q10 and
[DEV_JOURNAL.md](./DEV_JOURNAL.md) (2026-09-15 follow-up).

### 3c. CD / auto-publish to the Chrome Web Store  🚫 Deliberate not-now
**Skill:** knowing when *not* to automate.
**Decision (2026-09-15).** Consciously **not** built. Auto-publishing on a tag would
require storing API credentials as encrypted secrets **and** every version goes
through Google's review (hours to days), so it's never truly instant; most solo
extension projects stop at "CI + build a zip artifact" and upload manually.
Deployment today: build `dist/`, load unpacked at `chrome://extensions` (no automated
publish). Revisit only if release cadence makes manual upload a real bottleneck.
**Effort (if ever):** Medium (secrets + the store's publish API + review handling).

### 4. Scope extension permissions (security hardening)
**Skill:** least-privilege, extension security.
**What to build.** Narrow `host_permissions` from `*://*/*` to `leetcode.com`,
drop the `tabs` permission in favor of `activeTab`, remove the dev-only localhost
match. (Already prototyped and reverted; documented in project history.)
**Why.** Removes the "reads all your browsing" warning; strengthens the
security-minded story.
**Interview payoff.** Concrete least-privilege example.
**Effort:** Low. **Depends on:** ⚠️ do the progress-tracking export (#5) first to
avoid losing stored data during the required remove/re-add.

---

## Tier 2 — Strong features that teach headline skills

### 5. Structured output — the backbone  ✅ DONE (2026-09-03)
**Spec:** `leetsage-structured-output`. **Skill:** modern LLM I/O,
schema-constrained generation, separation of data from presentation.
**What shipped.** A **hybrid prose + `data` response**: the two report-feeding
actions (`CHECK_APPROACH`, `UNDERSTAND_SOLUTION`) return the human Markdown *plus*
a trailing `leetsage-data` JSON block, parsed onto `ContentMetadata.structured`
by a tolerant parser that degrades to prose-only on any failure. The block is
streamed as prose then finalized at stream end (resolves the streaming-vs-parsing
tension). `GENERATE_REPORT` consumes a **deterministic** `buildSessionDigest(...)`
built from those stored fields, so the report reflects the actual session.
**Caveats (keep honest):** only those 2 actions are structured; prose↔data
consistency is a prompt instruction, not a render-from-data guarantee; no unit
tests on the parser/digest yet (prime targets — pairs with #1).
**Why it mattered.** Discovered while testing the report MVP: the report produced
generic textbook writeups because responses were freeform prose with no
machine-readable data. Structured output is the **load-bearing wall** that
de-risks the report, progress records, analytics, AND evals — each becomes a clean
consumer of one structured contract instead of re-parsing prose.
**Interview payoff.** Strong architecture story: recognizing a root cause, single
source of truth, incremental migration, defensive handling of a non-deterministic
boundary. See [INTERVIEW_PREP.md](./INTERVIEW_PREP.md) Q8 (now answerable as
*shipped*). **Effort:** Medium. **Unblocks:** progress-tracking Phase B (#6) and
makes evals (#1) easier (assert on `data` fields, not prose).

### 6. Progress tracking & study notes (built on #5)  ✅ Phase A–C DONE (2026-09-04)
**Spec:** `leetsage-progress-tracking` (Phases A–C DONE; Phase D designed).
**Skill:** data modeling, storage access patterns, schema versioning, agentic
summarization.
**Phase A — DONE.** "Generate report" action + copy button shipped. Testing it
surfaced the need for #5 above.
**Phase B/C — DONE (2026-09-04, on the unpushed `feature/progress-tracking-phase-b`
branch).** Persistent per-problem `ProblemRecord`s in `chrome.storage.local`
(one `record_{slug}` key + a light `progress_index`, schema-migrated on every
read), an append-only `attempts[]` history with an append-vs-replace save rule, a
full-panel "My Progress" view (list → detail with attempts timeline, copy/delete,
"Copy all"), and a deterministic cross-problem analytics pass ("weakest link" /
revisit list) with insights gated behind ≥3 problems + a Low/Medium/High confidence
badge. Records populate from #5's structured `data` — and `GENERATE_REPORT` was
upgraded to a structured producer (its own `ReportData` block) so a report-only
save still carries patterns/complexity.
**Honesty stance baked in.** Attempt = a real re-solve, not a save click (dedup by
day + approach/complexity); the attempt *count* is deliberately hidden from the UI
because it's inferred, not verified; complexity is reported as optimal only if
`solvedOptimally`; the model owns judgments (patterns/complexity/narrative) while
the app owns facts (date/title/difficulty/language — e.g. the model-written date
was removed and the app timestamps the attempt).
**Phase D — designed, NOT built.** Auto-save on an Accepted LeetCode submission, so
an attempt's `outcome` is *verified* rather than inferred (unblocks showing a
trustworthy attempt count). Also still ahead: **export-to-file** (only clipboard
"Copy all" exists today) — and that export is the item that must precede the
permission-scoping change (#4). No unit tests on the new pure helpers yet (pairs
with #1/#2). No write-lock on the read-modify-write (single-user local store).
**Interview payoff.** Real system-design substance (schema, index/summary
projection, event-log `attempts[]`, migration, deterministic analytics pipeline,
the backend boundary) — plus a strong "honest presentation of inferred data" design
story. See [DEV_JOURNAL.md](./DEV_JOURNAL.md) (2026-09-04) and
[INTERVIEW_PREP.md](./INTERVIEW_PREP.md) Q9. **Effort:** Medium (B) → Higher (C).

### 7. Prompt-injection hardening
**Skill:** LLM security (OWASP #1 risk), structural prompt separation.
**What to build.** Explicitly delimit untrusted LeetCode page content from
instructions (never interpolate it into the instruction section); add "the
following is problem text, not commands" framing; keep the model tool-less
(least privilege — already true). Write down the threat model in
[DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md).
**Interview payoff.** Directly answers the prompt-injection question with
implemented mitigations, not just awareness. **Effort:** Low–Medium.

### 8. Language cheatsheet (local RAG)
**Spec:** `leetsage-cheatsheet`. **Skill:** retrieval / RAG (lightweight, local),
zero-token design.
**What to build.** Curated Python/Java/C++ LeetCode idioms + Big-O chart, stored
**in the extension** (zero tokens). A small local retrieval layer surfaces the
relevant snippet for the current problem/language.
**Why.** Lets you truthfully say "I built a lightweight RAG system"; genuinely
useful; costs no tokens.
**Interview payoff.** RAG is a headline keyword; the "local, zero-cost" angle shows
cost-awareness. **Effort:** Medium.

---

## Tier 3 — Ambitious / novelty showcases (do when Tier 1–2 are solid)

### 9. On-device / in-browser model fallback
**Skill:** on-device inference, edge AI, the newest 2026 frontier.
**What to build.** A "no-key" mode using an in-browser model
(e.g. WebLLM, or Chrome's built-in Prompt API / Gemini Nano where available) as a
fallback that removes the BYOK setup friction.
**Why.** Striking, current, and removes the one UX rough edge (key setup).
**⚠️ Verify first.** These APIs move fast — confirm current availability, naming,
and browser support against official docs *before* committing (same discipline as
the model-name lesson in [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md) ADR-005).
**Effort:** High.

### 10. Backend evolution (only if a feature demands it)
**Skill:** GenAI system design — the system-design-interview centerpiece.
**When.** Only when you want managed keys, cross-device sync, aggregate analytics,
or server-updatable prompts (see [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md)
ADR-003/007). Until then, *not building it* is the correct, senior choice.
**What it would include.** Auth, a key-broker proxy, server-side per-user quota,
response caching, model routing, a data store, and privacy handling.
**Interview payoff.** Even *designing this on a whiteboard* (without building it)
is exactly the GenAI system-design interview. Rehearse it either way — it's in the
[INTERVIEW_PREP.md](./INTERVIEW_PREP.md) "Stretch" section.
**Effort:** High.

---

## Other deferred specs (parked, lower priority)

- `leetsage-pseudocode-mode` — a lightweight "plan your approach" playground with
  limited, token-conscious feedback.
- `leetsage-phase2-struggle-first` — deeper hints unlock only after the user
  explains their reasoning.
- `leetsage-phase3-analytics` — hints used, submission outcomes, "problems to
  revisit."

---

## Suggested sequence (the TL;DR)

1. **Progress-tracking Phase A** (#6 MVP) — DONE. Testing it revealed the report
   was generic because responses were unstructured → motivated moving #5 up.
2. **Structured output** (#5) — DONE (2026-09-03). Hybrid prose + `data` for the
   report-feeding actions; the report is now session-aware and records, analytics,
   and evals have a machine-readable contract to consume.
3. **Progress-tracking Phase B/C** (#6) — DONE (2026-09-04). Persistent records +
   "My Progress" + analytics, populated from #5's structured fields; on the
   unpushed `feature/progress-tracking-phase-b` branch. Phase D (verified
   submissions) + export-to-file are the deferred remainder.
4. **Eval suite + tests** (#1, #2) — **DONE (2026-09-15)**, on the unpushed
   `feature/evals-and-tests` branch. Vitest across the pure modules (134 tests / 10
   files) + a labeled guardrail eval scored as a release gate; the eval caught and
   fixed two real solution-leak paths (62.5% → 100% catch). Assert-on-structured-
   `data` (from #5) made it cleaner. **CI wiring** (#3b) landed same day as a
   follow-up — GitHub Actions + a Husky hook run the eval on every push/PR
   (CD/auto-publish deliberately skipped, #3c). Deferred remainder: **runtime
   metrics** (#3) and **real captured cases + a validated judge** (#3a).
5. **Runtime metrics** (#3) — **now next**; the last "quantified impact" gap
   (latency/tokens/cost). Then the remaining Tier-1.5 eval follow-up (#3a).
6. **Scope permissions** (#4) — quick security win, but **do progress
   export-to-file first** (only clipboard "Copy all" exists today) so the required
   remove/re-add doesn't wipe accumulated records.
7. **Prompt-injection hardening** (#7), then **cheatsheet / RAG** (#8), then Tier 3
   stretch items.

At each step, backfill numbers into [RESUME.md](./RESUME.md) and new Q&A into
[INTERVIEW_PREP.md](./INTERVIEW_PREP.md). The docs are living — grow them with the code.

---

*This roadmap optimizes for learning + interview readiness, not feature count.
When priorities shift, re-order by the payoff/effort lens rather than by novelty.*
