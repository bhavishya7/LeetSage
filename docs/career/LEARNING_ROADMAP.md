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

### 3. Instrument basic runtime metrics  ✅ DONE (2026-09-23)
**Skill:** production monitoring mindset, cost-awareness.
**What shipped.** Fully client-side per-request metrics (no backend, mirroring the
usage counter): **wall-clock latency**, **prompt/completion tokens** (via
`stream_options.include_usage` + an `onUsage` callback on the streaming path — which
had never captured tokens before), and a **derived estimated cost** from one cited,
trivially-updatable price table. Pure, unit-tested aggregation — `percentile()`
(interpolated p50/p95) + `summarize()` — over a **bounded 200-sample rolling window**
plus **lifetime running aggregates**; `recordMetric()` is best-effort so it can never
break a coaching response. A read-only "Session stats" readout lives in the settings
modal. Design-only spec: `.kiro/specs/leetsage-metrics/design.md`. On branch
`feature/metrics` (`6012265` + `f980103`; test suite 149 → 167), **not yet pushed.**
**The numbers (self-run — honesty caveat kept).** **p50 1579 ms / p95 2982 ms**
latency, **1459 avg tokens/request**, **est. $0.000252/request** ($0.002271 over
9 requests). Self-collected, single model `gemini-3.5-flash-lite`, small n=9 —
an order-of-magnitude signal, not a benchmark; cost is an estimate on a BYOK free
quota, not a bill.
**Why it mattered.** The eval gave the *quality* numbers; this gave the *runtime*
numbers, closing the last "quantified impact" gap. The key catch was "verify don't
assume" — the streaming path (the one the UI uses) never saw token usage, so an
assumption-driven build would have recorded latency-only and missed the headline.
**Interview payoff.** Fills the runtime numbers in [RESUME.md](./RESUME.md) and
answers INTERVIEW_PREP Q5a. **Consciously deferred (scope-creep):** per-model
breakdown, success/error-rate capture (only successful requests are timed), a "reset
stats" button. **Effort:** ~~Low–Medium~~ done.

### 3.5. Guardrail hardening + a standing bug registry  ✅ DONE (2026-09-24)

**Spec:** `leetsage-guardrail-hardening` (full trilogy). **Skill:** guardrail
correctness (enforcement-point reasoning), eval-driven heuristic tuning, disciplined
bug tracking, human-in-the-loop review.
**What shipped.** Six real bugs fixed on branch `feature/guardrail-hardening`
(8 commits `c56d506`…`f6d2a5a` off spec `0edfd69`; **local — not pushed, no PR**),
two documented as deferrals — every fix bound to a guard, per the spec's governing
principle. **B1** the headline: the solution filter ran *after* tokens streamed to
the visible card, so a leak was briefly readable — moved to a **pre-display gate**
(non-exempt responses render behind an animated "thinking" placeholder and reveal
only after the filter; exempt actions still stream live). **B2** a dedicated
direct-answer chat prompt replacing the reused `EXPLAIN_CONCEPT` (no forced analogy).
**B3** closed the compact folded-conditional pseudocode blind spot in
`looksLikeFullPseudocode`, tuned against the labeled eval (**85.7% → 100%** catch,
FP 0%). Exercising the shipped B1 build then surfaced **B4** (chat was blind to the
editor code — now code-aware but still NON-EXEMPT/filtered), **B5** (the gate felt
frozen on heavy actions — an elapsed-seconds proof-of-life after a 3s grace), and
**B7** (complexity badge split on nested parens — a pure balanced-paren parser).
Test suite **167 → 205**; build clean.
**Why it mattered.** B1 is a clean "a gate belongs *before* the resource it guards"
correctness story; the registry makes bug-fixing durable (each entry can't silently
regress); and B4/B5/B7 are proof that human review after a green build catches what
the suite can't.
**Interview payoff.** RESUME "block-before-reveal" bullet; INTERVIEW_PREP Q&A on
green-build honesty and red-before-green eval fixtures. **Effort:** ~~Medium~~ done.

### 3.55. Action streamlining — 9 quick-actions → a 4-chip grid  ✅ DONE (2026-09-25)

**Spec:** `leetsage-action-streamlining` (full trilogy). **Skill:** product
curation, UI/UX judgment, capability/entry-point separation, human-in-the-loop
visual review.
**What shipped.** Curated the quick-action bar from **9 actions to 4** on branch
`feature/action-streamlining` (`0cc0b39` spec + `9f0c91a` feat, off main `dcababa`,
**not pushed**). The old 4-PRIMARY + 5-behind-"More" layout became a single,
always-visible **2×2 grid** of the four surviving intents — Hint (`GET_HINT`),
Analyze my code (`CHECK_APPROACH`), Understand solution (`UNDERSTAND_SOLUTION`),
Generate report (`GENERATE_REPORT`) — with equal-width cells and uniform styling.
The `SECONDARY` array, `showMore` state, and the toggle were removed from
`QuickActions.tsx`; the five cut actions (`BREAK_DOWN_PROBLEM`, `GENERATE_EXAMPLES`,
`EXPLAIN_CONCEPT`, `TIME_COMPLEXITY_HINT`, `PATTERN_RECOGNITION`) were
**dereferenced from the UI but kept in code** (types, prompts, `handleActionClick`)
so #3.6 can dispatch to them. UI/wiring only — no filter/guardrail/streaming
changes; tests unchanged at **205**, build clean, eslint 0.
**Why it mattered.** Governing principle: **a never-used control is a cost, not an
asset** — "hiding behind More" had treated a curation problem as a layout one.
Sequenced deliberately **before** #3.6 so routing is written against the real
four-action surface, not assumptions.
**The payoff (the interview story).** The mandatory visual-review gate caught what
a green build couldn't: the first pass met the spec and compiled, but eyeballing the
running extension exposed a ragged unequal-width chip row and an unpredictable
`hasCode` context-aware highlight — fixed with the equal-width grid + uniform
styling + removing the highlight (a second-order improvement the spec never asked
for). Removing the highlight also cascaded into a real dead-code cleanup in
`App.tsx` (state + callback + 3 listeners). See
[INTERVIEW_PREP.md](./INTERVIEW_PREP.md) ("a passing spec is not the same as good
UI" + capability/entry-point separation) and [DEV_JOURNAL.md](./DEV_JOURNAL.md)
(2026-09-25). **Deferred to #3.6:** discovery affordances (suggested prompts /
rotating placeholder) and the routing that re-references the five cut actions.
**Effort:** ~~Low~~ done.

### 3.6. Chat intent-routing (B6) — its own next spec  📝 PLANNED (next up)

**Spec:** `leetsage-chat-intent-routing` (a context-transfer was handed to the
developer; not yet designed in depth). **Skill:** intent classification (LLM vs
heuristic), guardrail decision-making.
**What to build.** Route a free-form chat message to a matching action when one
fits (e.g. "is my code O(n²)?" → Analyze code), else fall back to free-form. It will
also **re-reference the five actions dereferenced from the UI in #3.55** (so they're
reachable again, via routing rather than dedicated buttons) and **own the discovery
affordances** (suggested prompts / rotating placeholder) deferred out of that pass.
**Why it's deferred to its own spec.** It needs a classifier choice *and* a
guardrail decision — routing free text into the filter-**exempt** actions is exactly
the bypass B4 declined to open, so the routing design must decide that deliberately,
not inherit it. Now unblocked: #3.55 shipped, so routing is written against the real
surviving four-action surface. **Effort:** Medium. **Also deferred (registry-only, harder to guard):**
**B8** — `Analyze code` under-credits optimality because it doesn't apply algebraic
complexity equivalence (`O(log M + log N) = O(log(M·N))`); a prompt nudge, but fuzzy
model-reasoning that's hard to guard deterministically.

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
early warning. On the `feature/evals-and-tests` branch (`b0b98e3`; a lint
fix `ea82f9b` cleared 4 pre-existing `no-explicit-any` errors so the gate is green).
**Pushed; the first CI run is green** (~24s, 10 files / 134 tests). The first run
warned Node 20 was deprecated (the action's own runtime); bumping the actions —
`@v5` from memory (`22ddfba`), then corrected to the verified current major `@v7`
(`e7653b8`) — cleared it. The 2 `react-hooks/exhaustive-deps` warnings remain and
are intentionally left for a proper future fix.
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
**Phase B/C — DONE (2026-09-04, merged to main via PR #11).** Persistent
per-problem `ProblemRecord`s in `chrome.storage.local`
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

### 7. Prompt-injection hardening  ✅ DONE (2026-09-21)
**Skill:** LLM security (OWASP #1 risk), structural prompt separation.
**What shipped.** A `wrapUntrusted()` choke point in `prompts.ts` fences all
untrusted content (problem text, editor code, session digest) inside a
hard-to-forge `<<<UNTRUSTED_CONTENT …` block framed as DATA, keeps the per-action
instruction *outside* the block, and **reasserts the no-solutions guardrail after**
it (recency defense). All 9 actions + the free-form `userQuery` path funnel through
it. Least privilege (tool-less model) documented as mitigation-by-construction; a
blocklist input scanner was considered and **deliberately rejected**. The threat
model + blast radius are written up in the spec
[`.kiro/specs/leetsage-prompt-injection/design.md`](../../.kiro/specs/leetsage-prompt-injection/design.md)
and summarised in [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md) (ADR-004, 2026-09-21
update). **Tested both sides:** `prompts.test.ts` pins the framing per action; new
`injection-leak` eval cases model a *successful* injection and assert the
deterministic output filter still catches the leak. `npm.cmd run test` 134 → 149;
build clean. On branch `feature/prompt-injection-hardening` (commit `667b473`) —
**not yet merged to main.**
**Still open:** an LLM-as-judge semantic output check (scaffold in
`src/evals/llm-judge.ts`) for paraphrased leaks regex can't catch — the named next
step.
**Interview payoff.** Directly answers the prompt-injection question with
**implemented and tested** mitigations, not just awareness (INTERVIEW_PREP Q4).
**Effort:** ~~Low–Medium~~ done.

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
   "My Progress" + analytics, populated from #5's structured fields; merged to
   main via PR #11. Phase D (verified
   submissions) + export-to-file are the deferred remainder.
4. **Eval suite + tests** (#1, #2) — **DONE (2026-09-15)**, on the
   `feature/evals-and-tests` branch (pushed; CI green). Vitest across the pure modules (134 tests / 10
   files) + a labeled guardrail eval scored as a release gate; the eval caught and
   fixed two real solution-leak paths (62.5% → 100% catch). Assert-on-structured-
   `data` (from #5) made it cleaner. **CI wiring** (#3b) landed same day as a
   follow-up — GitHub Actions + a Husky hook run the eval on every push/PR
   (CD/auto-publish deliberately skipped, #3c). Deferred remainder: **runtime
   metrics** (#3) and **real captured cases + a validated judge** (#3a).
5. **Runtime metrics** (#3) — **DONE (2026-09-23)** on branch `feature/metrics`
   (`6012265` + `f980103`, not yet pushed): per-request latency/tokens/cost captured
   client-side (p50 1579 ms / p95 2982 ms, 1459 avg tokens, ~$0.000252/request over a
   9-request self-run), pure unit-tested p50/p95 math, bounded storage; test suite
   149 → 167. The "quantified impact" gap is closed. **Now next:** the remaining
   Tier-1.5 eval follow-up (#3a — real captured cases + a validated judge).
6. **Scope permissions** (#4) — quick security win, but **do progress
   export-to-file first** (only clipboard "Copy all" exists today) so the required
   remove/re-add doesn't wipe accumulated records.
7. ~~**Prompt-injection hardening** (#7)~~ — **DONE (2026-09-21)** on branch
   `feature/prompt-injection-hardening` (`667b473`, not yet merged): untrusted
   content fenced as DATA + guardrail reasserted after, tested both sides
   (`prompts.test.ts` + `injection-leak` eval cases), `npm.cmd run test` 134 → 149.
8. ~~**Guardrail hardening** (#3.5)~~ — **DONE (2026-09-24)** on branch
   `feature/guardrail-hardening` (8 commits, local — not pushed): pre-display gate
   (B1) + 5 more bug fixes and a standing bug registry, `npm.cmd run test` 167 → 205.
9. ~~**Action streamlining** (#3.55)~~ — **DONE (2026-09-25)** on branch
   `feature/action-streamlining` (`0cc0b39` + `9f0c91a`, off main `dcababa`, not
   pushed): the quick-action bar went 9 actions → a 4-chip 2×2 grid; the five cut
   actions are dereferenced from the UI but kept in code for routing to reach.
   UI/wiring only; tests unchanged at 205. **Now next: B6 chat intent-routing**
   (#3.6) as its own spec — written against the real four-action surface and owning
   the deferred discovery affordances; **B8** deferred. Then **cheatsheet / RAG**
   (#8), then Tier 3 stretch items.

At each step, backfill numbers into [RESUME.md](./RESUME.md) and new Q&A into
[INTERVIEW_PREP.md](./INTERVIEW_PREP.md). The docs are living — grow them with the code.

---

*This roadmap optimizes for learning + interview readiness, not feature count.
When priorities shift, re-order by the payoff/effort lens rather than by novelty.*
