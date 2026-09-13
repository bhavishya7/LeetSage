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

### 1. Eval suite for the solution-filter guardrail  ⭐ top priority
**Skill:** LLM evals, LLM-as-judge, precision/recall thinking, non-determinism.
**Why it's #1.** Evals are *the* hot 2026 AI-engineering skill and the way teams
gate releases. This one project item simultaneously (a) hardens your core product
promise, (b) unlocks your strongest resume bullet, and (c) produces the
**quantified numbers** every other resume bullet currently lacks.
**What to build.**
- A labeled dataset: model responses paired with "leaks solution? yes/no".
- **Deterministic evals** — assert `filterResponse` catches the known-bad cases and
  passes the known-good ones (this is also just unit testing the filter).
- **LLM-as-judge eval** — a second model scores "did this basically give away the
  answer?" for the semantic cases regex can't catch. Validate the judge against
  your labeled set; note its known biases (position, verbosity, self-preference).
- Report catch-rate, false-positive rate, and hint-progression adherence.
**Interview payoff.** "I designed evals that measure an AI safety constraint at
scale, combining deterministic checks with a validated LLM-as-judge." That's a
senior-sounding, true sentence.
**Effort:** Medium. **Depends on:** nothing.

### 2. Automated tests (Vitest) for pure logic
**Skill:** engineering rigor, testing.
**What to build.** Vitest on the stable, pure modules: `solution-filter`,
`rate-limiter`, `stuck-timer`, and `normalizeProblemUrl`. (The filter tests overlap
with the deterministic evals above — build them together.)
**Why.** Signals rigor; protects the guardrail (core promise) and the
session-persistence fix from regressions once strangers use it.
**Interview payoff.** Answers "how do you know it works?" and "what's your testing
approach?".
**Effort:** Low–Medium. **Depends on:** nothing (pairs with #1).

### 3. Instrument basic metrics
**Skill:** production monitoring mindset, cost-awareness.
**What to build.** Lightweight local counters: requests served, filter catch-rate,
p50/p95 latency, avg tokens/request, estimated cost/request.
**Why.** You can't quote impact you never measured. Even self-collected numbers
turn qualitative resume bullets into quantified ones.
**Interview payoff.** Fills the `[X]` placeholders in [RESUME.md](./RESUME.md).
**Effort:** Low–Medium. **Depends on:** nothing.

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
4. **Eval suite + tests + metrics** (#1–3, built together) — **now next**; the
   biggest resume/interview unlock and it produces your numbers. Evals are easier
   with #5 (assert on structured fields, not prose), and Phase B/C added a fresh
   batch of pure helpers to unit-test (`complexityRank`, `computeBestAttemptIndex`,
   `computeInsights`, `computeStruggleScore`, `shouldReplaceLatest`,
   `sameCalendarDay`, `slugFromUrl`).
5. **Scope permissions** (#4) — quick security win, but **do progress
   export-to-file first** (only clipboard "Copy all" exists today) so the required
   remove/re-add doesn't wipe accumulated records.
6. **Prompt-injection hardening** (#7), then **cheatsheet / RAG** (#8), then Tier 3
   stretch items.

At each step, backfill numbers into [RESUME.md](./RESUME.md) and new Q&A into
[INTERVIEW_PREP.md](./INTERVIEW_PREP.md). The docs are living — grow them with the code.

---

*This roadmap optimizes for learning + interview readiness, not feature count.
When priorities shift, re-order by the payoff/effort lens rather than by novelty.*
