# LeetSage — Resume Material

> Ready-to-adapt resume bullets, a project blurb, and an honest gap analysis of
> what to build before this reads as "AI Engineer" strong. Grounded in what
> 2026 hiring teams actually screen for.
>
> Companion docs: [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md) ·
> [INTERVIEW_PREP.md](./INTERVIEW_PREP.md) · [LEARNING_ROADMAP.md](./LEARNING_ROADMAP.md)

---

## What 2026 hiring teams screen for (why these bullets are shaped this way)

Distilled from current AI/ML/LLM-engineer resume guidance
([techiecv](https://www.techiecv.com/resume-guides/ai-engineer-resume),
[huntr](https://huntr.co/resume-examples/ai-engineer),
[interviewquery](https://www.interviewquery.com/p/ai-engineer-resume),
[hireflow](https://hireflow.net/resume-examples/llm-engineer)) —
*content rephrased for licensing compliance*:

- **Shipped features with real users beat tutorials/notebooks.** A prompt notebook
  on GitHub stalls before screening; a feature real people use gets read.
- **Lead bullets with action verbs + measurable impact** (latency, cost, accuracy,
  usage). Numbers > adjectives.
- **Name the stack and the tools** so it matches the job posting and passes ATS
  keyword scans.
- **Show engineering rigor**, not just model calls — testing, evals, monitoring,
  tradeoffs.
- By 2026 market definition, if you've shipped an LLM-powered feature you can
  legitimately use the "AI Engineer" framing.

LeetSage fits the "shipped, real-user, real-tradeoffs" mold. Its current gap is
**quantified impact** and **rigor artifacts** (tests/evals/metrics) — see the gap
analysis below, which doubles as your build priority list.

---

## Project blurb (portfolio / LinkedIn / resume header)

**Short (one line):**
> LeetSage — a client-only Chrome extension that coaches LeetCode users with AI
> hints and code analysis while enforcing a "never reveal the solution" guardrail.

**Medium (portfolio):**
> LeetSage is an AI learning coach for LeetCode, built as a bring-your-own-key
> Chrome extension (Manifest V3, React + TypeScript). It streams Google Gemini
> responses to deliver progressive hints, problem breakdowns, and pre-submission
> code analysis — deliberately withholding full solutions via a two-layer
> guardrail (prompt rules + a deterministic output filter). Zero backend, zero
> hosting cost, and it scales for free because every user brings their own key.

---

## Resume bullets — three flavors

Pick 2–4 depending on space. Swap in real numbers as soon as you have them
(marked `[X]`). Verbs first, impact where possible.

### Flavor A — concise (2 bullets, for a packed resume)

- Built **LeetSage**, a Manifest V3 Chrome extension (React/TypeScript) that
  streams Google Gemini responses to coach LeetCode users, using a **client-only,
  bring-your-own-key** design that runs at **zero backend cost** and scales to
  unlimited users.
- Enforced a "never reveal the full solution" product constraint with a
  **two-layer AI guardrail** — prompt-level rules plus a **deterministic output
  filter** that blocks complete implementations and full-algorithm pseudocode.

### Flavor B — detailed (4 bullets, dedicated project section)

- Designed and shipped **LeetSage**, an AI coaching Chrome extension (Manifest V3,
  React 19, TypeScript, Tailwind, Vite) integrating **Google Gemini** via its
  OpenAI-compatible streaming API for real-time hints, breakdowns, and code analysis.
- Architected a **client-only, bring-your-own-key** system with **no backend**,
  eliminating hosting cost and centralized-secret risk — a deliberate
  cost/security tradeoff — while enabling free, unlimited-user scaling.
- Implemented a **multi-layer AI safety guardrail** enforcing a strict
  "no full solutions" policy: system-prompt rules plus a deterministic post-generation
  filter (phrase, code-size/shape, and full-pseudocode heuristics) that intercepts
  solution leakage the model would otherwise produce.
- Built **client-side cost/abuse guardrails** (rate limiting, daily caps,
  cooldowns, token limits, timeout, kill switch) and **model tiering** (flash-lite
  default) to keep latency low and free-tier usage sustainable.

### Flavor C — AI-forward (leads with the AI-engineering signal)

- Shipped a production **LLM-powered** learning feature (Google Gemini, streaming)
  used on live LeetCode problems, applying **prompt engineering**, **output
  validation**, and **model tiering** for cost control.
- Engineered **defense-in-depth guardrails** over a non-deterministic model — a
  deterministic output filter that enforces product constraints the prompt alone
  can't guarantee, plus **prompt-injection hardening** (OWASP LLM #1): untrusted
  page content and user code are structurally fenced as DATA with the guardrail
  reasserted after, backed by least-privilege (no tool access) and the output
  filter as the hard backstop — **verified on both sides by tests** (input framing
  pinned per action; an eval case proves a *successful* injection is still caught).
- Hardened the guardrail's **enforcement point**: found that flagged content was
  streamed to the UI *before* the filter ran (a leak was briefly readable, then
  replaced), and moved the check to a **pre-display gate** — non-exempt responses
  render behind an animated placeholder and reveal only after passing the filter,
  turning a detect-and-roll-back into **block-before-reveal** without losing
  perceived responsiveness. Guarded by a DOM-free test on the commit sequence.
- Built a **chat intent-router** — a pure `classify → resolve → route` pipeline (a
  local, zero-API-call heuristic classifier behind a swap-in seam, a data-driven
  intent registry, and a **three-way route/ask/abstain** resolver) that turns a
  free-form question into the right structured action while bounding each message to
  **exactly one model call**; enforced the product's core guardrail by making any
  route into a solution-bearing action a **confirm-to-route** step (never silent),
  and scored the router against a **labeled golden set** that doubles as its accuracy
  metric.
- Designed a **client-side agentic tool-use loop** (no backend, no framework) that
  upgrades chat into a **three-tier, cost-aware agent** — route to a pre-built
  action, else answer directly, else run a **bounded (≤2-round) read-only tool loop**
  only when the model needs a fact it lacks — with **per-round request accounting**
  (one message costs *N* counted requests, never silently; unit-tested invariant), a
  **zero-inference read-only tool allowlist**, and an **unbypassable safety
  guardrail** (the loop's non-exempt answer still clears the deterministic
  solution-filter + pre-display gate; all tool results and conversation memory are
  fenced as untrusted) — on a free-tier, bring-your-own-key model under a 200-request/
  day budget. *(Merged to main via PR #19.)*
- **Instrumented client-side runtime metrics** (per-request latency, tokens, and
  estimated cost) with pure, unit-tested p50/p95 aggregation and bounded local
  storage — measuring **p50 ~1.6 s / p95 ~3.0 s latency and ~1,459 tokens (~$0.00025)
  per request** (self-collected, single model) to reason about latency and cost with
  numbers, not adjectives.
- **Hardened an untrusted-file import** into the extension's persistent storage with
  a **reconstruct-don't-validate-in-place** pipeline — building fresh records by
  field-level allowlist (defeating unknown-field injection, **prototype pollution**,
  and type confusion in one move), recomputing every derived field, and finishing
  with an **idempotent newer-wins merge** and an atomic, quota-fail-closed write;
  moved the no-code-execution guarantee into a **platform-enforced manifest CSP** and
  validated a stored URL *before* a planned link feature could weaponize it.
  Round-trip-verified against a real export (re-import is a proven no-op).
- Made and documented core **AI system-design tradeoffs** (bring-your-own-key vs.
  managed backend; client-only vs. server; **constraining the model menu to two
  free-tier models** rather than exposing paid/power-user models — a deliberate
  "keep it free" product decision weighed against the API's actual capabilities)
  with a written decision log and an articulated scaling path.
- Built a **labeled eval suite** for the AI safety guardrail — scoring the
  deterministic solution-filter on a hand-labeled dataset as a release gate
  (**catch rate / false-positive rate / precision**), plus an offline
  **LLM-as-judge** scaffold for the semantic cases regex can't catch; the eval
  **surfaced two solution-leak paths** the filter missed, which were then fixed
  (regression-gated at 100% catch / 0% false-positive on the set).
- Designed a **single-source-of-truth structured-output contract** (hybrid prose +
  schema'd JSON) for a non-deterministic model, with **tolerant parsing that
  degrades to prose-only** and streaming preserved — turning freeform responses
  into a machine-readable contract the report and future analytics/evals consume.
- Built a **client-side progress-tracking data model** on that contract —
  versioned per-problem records with an append-only attempt log and a light index
  projection, schema-migrated on read, feeding a deterministic cross-problem
  analytics pipeline ("weakest link") — with analytics and inferred fields honestly
  gated (confidence badge on thin data; unverified counts withheld).

> Tip: keep one bullet that signals *rigor* (guardrails/validation) and one that
> signals *judgment* (tradeoffs) — those two separate you from "called an API"
> resumes.

---

## Skills-section keywords (ATS)

Only list what you can defend. Currently truthful for LeetSage:

`LLM integration` · `Google Gemini` · `prompt engineering` · `streaming responses`
· `structured output` · `AI output guardrails` · `LLM evals` · `LLM-as-judge` ·
`unit testing (Vitest)` · `Chrome Extension (Manifest V3)` ·
`React` · `TypeScript` · `Tailwind CSS` · `Vite` · `client-side architecture` ·
`cost optimization / rate limiting` · `AI-assisted development (custom agents)` ·
`prompt-injection mitigation (OWASP LLM #1)` · `production metrics / monitoring` ·
`intent classification / routing` · `agentic tool-use / function calling` ·
`LLM orchestration (bounded control loop)` ·
`input validation / untrusted-input hardening` · `Content Security Policy (CSP)` ·
`design tokens / theming (CSS custom properties)` ·
`UI motion & accessibility (prefers-reduced-motion)` ·
`resilient API error handling (typed errors, transient retry/backoff)`

Add once built: `RAG`.

---

## Honest gap analysis (= your build priority list)

What separates the current project from a top-tier "AI Engineer" resume artifact,
ordered by resume-value-per-effort. Each maps to
[LEARNING_ROADMAP.md](./LEARNING_ROADMAP.md).

| Gap | Why it matters on a resume | Fix | Effort |
|---|---|---|---|
| ~~**No evals**~~ ✅ **shipped (2026-09-15)** | "I wrote evals for my LLM feature" is a top 2026 signal; it also proves the guardrail works | Labeled guardrail eval (16 cases, 8 leak / 8 safe) scoring the solution-filter as a release gate: **100% catch / 0% false-positive / 100% precision**; the eval **caught 2 real leak paths** (a compact complete function; loop-embedded-conditional pseudocode) that were then fixed. Offline **LLM-as-judge** scaffold included (injectable, no live key). *(Caveat: dataset is author-generated — a strong regression gate, but overstates real-world recall until real captured responses are added.)* | ~~Medium~~ done |
| ~~**No quantified impact**~~ ✅ **closed (2026-09-23)** | Resumes reward numbers | **Eval numbers** (100% catch / 0% FP; 167 tests) **+ runtime metrics now real**: instrumented per-request latency/tokens/cost client-side — self-run **p50 1579 ms / p95 2982 ms latency, 1459 avg tokens/request, ~$0.000252 est. cost/request** ($0.002271 over 9 requests). *(Caveat: self-collected, single model `gemini-3.5-flash-lite`, small n=9 sample — an order-of-magnitude signal, not a benchmark.)* | ~~Low–Med~~ done |
| ~~**No automated tests**~~ ✅ **shipped (2026-09-15)** | Signals engineering rigor | **Vitest** on the pure modules: solution-filter, structured-parser, session-digest, progress-analytics, progress-records, rate-limiter, stuck-timer, URL normalization — **134 tests across 10 files**, plus the eval harness. | ~~Low–Med~~ done |
| ~~**No structured output**~~ ✅ **shipped (2026-09-03)** | Named modern-LLM-I/O skill | Hybrid prose + `data` response for the 2 report-feeding actions, tolerant parse w/ prose-only fallback, deterministic session digest → session-aware report. Strong architecture story. *(Caveats: 2 actions only; no unit tests yet.)* | ~~Medium~~ done |
| **Broad permissions** | Reviewers/users notice; weakens "security-minded" claim | Scope `host_permissions` to leetcode.com (prototyped + reverted; deferred until progress export lands) | Low |
| **RAG/agentic element** *(agentic shipped + merged)* | Both are headline 2026 keywords | **Agentic tool-use shipped (2026-10-01, merged to main via PR #19):** a bounded, read-only **client-side tool loop** with per-round request accounting + an unbypassable guardrail (E9 chat enhancement). Also progress-tracking **Phase A–C** + a custom Kiro **project-historian agent**. **RAG** (the cheatsheet) is the remaining keyword still ahead. | Med–High |

**The single highest-leverage move — done (2026-09-15):** the **eval suite for
the guardrail** is built. It hardened the core product promise (caught and fixed
two real leak paths), unlocked the strongest resume bullet ("designed evals that
measure an AI safety constraint"), and produced the first defensible numbers.
**Runtime metrics — done (2026-09-23):** per-request latency/tokens/cost are now
instrumented client-side (p50/p95 latency, avg tokens, est. cost), closing the
"quantified impact" gap. **Next highest-leverage:** feeding **real captured Gemini
responses** into the eval set so the catch-rate reflects real-world recall, not just
the authored set (plus a validated, non-mock LLM-as-judge).

> **Recent progress (keep this honest as it ships):** progress-tracking MVP
> shipped; "Understand solution" correctness bug fixed; **structured output
> shipped** (2026-09-03 — hybrid prose + `data` for the report-feeding actions,
> making the report session-aware); **progress-tracking Phase B/C shipped**
> (2026-09-04 — persistent per-problem records, a "My Progress" view, and
> weakest-link analytics built on the structured contract; merged to main via PR #11);
> a custom Kiro project-historian agent now maintains these docs; **evals + unit
> tests shipped** (2026-09-15 — Vitest across the pure modules, 134 tests, plus a
> labeled guardrail eval that caught and fixed two real solution-leak paths), then
> **wired into CI** (2026-09-15 follow-up — GitHub Actions runs lint/test/build on
> every push/PR, making the eval an automatic release gate; pushed, first run green);
> and **runtime metrics shipped** (2026-09-23 — per-request latency/tokens/cost
> instrumented client-side, aggregated with pure p50/p95 math; test suite 149 → 167;
> on the `feature/metrics` branch, not yet pushed) closing the "quantified impact"
> gap; and most recently **progress export + import shipped** (2026-09-27 — a
> Markdown study archive + a versioned JSON backup, and a security-hardened
> untrusted-file → storage import pipeline: reconstruct-don't-validate-in-place,
> idempotent newer-wins merge, platform-enforced manifest CSP, slug-keyed URL
> validation; round-trip-verified against a real 13-problem export; test suite
> 236 → 277 after merging main; on the `feature/progress-export-import` branch, not
> yet pushed); and most recently **E9 chat enhancement — chat as a three-tier
> cost-aware agent — built (2026-10-01)** on the `feature/chat-enhancement` branch
> (a route-first/loop-as-fallback design, a bounded read-only agentic tool loop with
> per-round request accounting, two-layer conversation memory, and an unbypassable
> guardrail; test suite 277 → **329**), **since merged to main via PR #19**; and most
> recently **chat polish (E2+E3+E4) — built (2026-10-05)** on the
> `feature/chat-polish` branch (a presentation-only pass: a swappable "Sage" gradient
> identity with a two-role contrast/accent token split, `prefers-reduced-motion`-gated
> motion, a re-openable onboarding `WelcomeCard`, two guarded routing bugfixes, and a
> folded-in friendly-API-error-handling pass with transient retry + abort mapping;
> test suite 329 → **344**; **built and locally green, NOT yet pushed or merged**;
> honesty caveat — a successful end-to-end API call could not be confirmed this
> session because Google's free tier stayed overloaded, so the new error *handling*
> is unit-verified but the happy path was not seen live). See
> [DEV_JOURNAL.md](./DEV_JOURNAL.md) for the full narrative. The gaps above stay
> listed until the work is actually *built*, not just designed — the top unmet
> resume gap is now **real captured-response eval cases + a validated LLM-as-judge**.

---

## Numbers captured (and still to capture)

You can't quote impact you never measured. Even rough, self-collected numbers help.
**Captured so far** (keep the honesty caveats when quoting):

- ✅ Solution-filter **catch rate 100% / false-positive rate 0% / precision 100%**
  on the 16-case labeled set (2026-09-15). *Caveat: author-generated dataset — a
  strong regression gate, optimistic vs. real-world recall until real captured
  responses are added.*
- ✅ **p50 latency 1579 ms, p95 latency 2982 ms** (2026-09-23 runtime metrics).
- ✅ **Avg 1459 tokens/request**; **est. $0.000252/request**, **$0.002271 total**
  over the sample. *Caveat: self-collected, single model `gemini-3.5-flash-lite`,
  small n=9 sample — an order-of-magnitude signal, not a benchmark. Cost is an
  estimate from public per-token pricing (BYOK / free quota), not a bill.*
- ✅ **344 automated tests** across the pure modules + the guardrail eval (167 at
  the 2026-09-23 metrics milestone → **205** after the 2026-09-24 guardrail-
  hardening pass added guards for B1–B7 → **236** after the 2026-09-26 chat
  intent-routing pass added the labeled router golden set → **277** after the
  2026-09-27 progress-export-import pass added functional + security tests, then
  merged main → **329** (24 files) after the 2026-10-01 E9 chat-enhancement pass
  added the agent-loop / tool / window / fencing / tool-round / usage-indicator
  tests → **344** (26 files) after the 2026-10-05 chat-polish pass added
  `discovery-prompts.test.ts` and `llm-error-messages.test.ts` and expanded
  `llm-tool-round.test.ts`). *Caveat: the 344 figure is on the `feature/chat-polish`
  branch — **built and locally green, not yet pushed or merged**; E9 (329) merged to
  main via PR #19, so the last merged-to-main count is 329.*

**Still to capture:**

- Requests served / problems coached (your own usage counts) — the metrics store now
  keeps a lifetime `totalRequests`, so a larger real-usage number can be read off it.
- Hint-progression adherence (does level 1 stay conceptual?).
- A larger metrics sample (n=9 today) and a per-model breakdown (deferred).

Log these as you keep using the extension, then update the numbers above as the
sample grows.

---

*Revisit this doc right before you apply so bullets match the specific posting's
language. Ask me to tailor a version to a job description any time.*
