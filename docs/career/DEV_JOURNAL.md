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
**How solved.** (1) Added `"type": "module"` to the manifest's background entry.
(2) Switched to a **pull-based** flow — the panel requests the problem on demand
with retry/backoff, plus a `chrome.scripting.executeScript` inject fallback.
**Interview angle.** Real MV3 systems debugging (worker lifecycle, silent crashes,
push-vs-pull) — a strong "tell me about a hard bug" story. Plus the BYOK/no-backend
cost & security tradeoff.
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

---

## Next up (see [LEARNING_ROADMAP.md](./LEARNING_ROADMAP.md))

1. **Structured output** — the backbone; makes the report session-aware and
   de-risks records, analytics, and evals.
2. **Progress-tracking Phase B** — persistent records + "My Progress" view, built
   on the structured fields.
3. **Evals + tests + metrics** — the biggest resume/interview unlock; easier once
   structured output exists.

*When each lands, add an entry above (via the project-historian agent) and backfill
any resulting numbers into [RESUME.md](./RESUME.md).*
