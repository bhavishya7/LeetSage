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

### 5. Progress tracking & study notes (agentic summarization)
**Spec:** `leetsage-progress-tracking`. **Skill:** agentic flows, structured
output, summarization.
**MVP (do this slice first).** A "generate report" button that summarizes a solved
problem (pattern/category, approach, key insight, complexity) and a **copy-text**
button so you can paste it elsewhere. This MVP also **doubles as the data-export**
that must precede the permission change (#4).
**Fuller vision.** A living record that updates as you solve/re-solve problems —
framed as a small **agent** that categorizes and maintains notes.
**Interview payoff.** "I built an agentic feature that summarizes and categorizes."
Also solves your real need (tracking your own LeetCode progress).
**Effort:** Medium (MVP) → High (full sync/analytics).

### 6. Structured output / function calling
**Skill:** modern LLM I/O, schema-constrained generation.
**What to build.** Move hints, complexity breakdowns, and examples from freeform
text to **JSON matching a schema**, so rendering is robust and the guardrail can
inspect structured fields instead of scraping prose.
**Why.** Named 2026 skill; makes the UI more reliable; complements the filter.
**Interview payoff.** "I used structured output to make LLM responses
machine-reliable." **Effort:** Medium.

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

1. **Progress-tracking MVP** (#5 slice) — needed as data-export before #4, and it's
   your first agentic feature.
2. **Eval suite + tests + metrics** (#1–3, built together) — the biggest
   resume/interview unlock; produces your numbers.
3. **Scope permissions** (#4) — quick security win, safe to do now that data is
   exportable.
4. **Structured output** (#6) then **prompt-injection hardening** (#7) — reliability
   + security depth.
5. **Cheatsheet / RAG** (#8), then Tier 3 stretch items.

At each step, backfill numbers into [RESUME.md](./RESUME.md) and new Q&A into
[INTERVIEW_PREP.md](./INTERVIEW_PREP.md). The docs are living — grow them with the code.

---

*This roadmap optimizes for learning + interview readiness, not feature count.
When priorities shift, re-order by the payoff/effort lens rather than by novelty.*
