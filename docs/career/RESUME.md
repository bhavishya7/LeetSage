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
- Made and documented core **AI system-design tradeoffs** (bring-your-own-key vs.
  managed backend; client-only vs. server) with a written decision log and an
  articulated scaling path.
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
`prompt-injection mitigation (OWASP LLM #1)`

Add once built: `RAG` · `production metrics / monitoring`.

---

## Honest gap analysis (= your build priority list)

What separates the current project from a top-tier "AI Engineer" resume artifact,
ordered by resume-value-per-effort. Each maps to
[LEARNING_ROADMAP.md](./LEARNING_ROADMAP.md).

| Gap | Why it matters on a resume | Fix | Effort |
|---|---|---|---|
| ~~**No evals**~~ ✅ **shipped (2026-09-15)** | "I wrote evals for my LLM feature" is a top 2026 signal; it also proves the guardrail works | Labeled guardrail eval (16 cases, 8 leak / 8 safe) scoring the solution-filter as a release gate: **100% catch / 0% false-positive / 100% precision**; the eval **caught 2 real leak paths** (a compact complete function; loop-embedded-conditional pseudocode) that were then fixed. Offline **LLM-as-judge** scaffold included (injectable, no live key). *(Caveat: dataset is author-generated — a strong regression gate, but overstates real-world recall until real captured responses are added.)* | ~~Medium~~ done |
| **No quantified impact** *(partial)* | Resumes reward numbers; you currently have none | **Test/eval numbers now real** (134 tests; filter catch-rate/FP-rate above). Still missing runtime metrics: p50/p95 latency, tokens/request, requests handled | Low–Med |
| ~~**No automated tests**~~ ✅ **shipped (2026-09-15)** | Signals engineering rigor | **Vitest** on the pure modules: solution-filter, structured-parser, session-digest, progress-analytics, progress-records, rate-limiter, stuck-timer, URL normalization — **134 tests across 10 files**, plus the eval harness. | ~~Low–Med~~ done |
| ~~**No structured output**~~ ✅ **shipped (2026-09-03)** | Named modern-LLM-I/O skill | Hybrid prose + `data` response for the 2 report-feeding actions, tolerant parse w/ prose-only fallback, deterministic session digest → session-aware report. Strong architecture story. *(Caveats: 2 actions only; no unit tests yet.)* | ~~Medium~~ done |
| **Broad permissions** | Reviewers/users notice; weakens "security-minded" claim | Scope `host_permissions` to leetcode.com (prototyped + reverted; deferred until progress export lands) | Low |
| **RAG/agentic element** *(partial)* | Both are headline 2026 keywords | Progress-tracking **Phase A–C shipped** (persistent records + "My Progress" + weakest-link analytics, built on the structured contract) + a custom Kiro **project-historian agent**; RAG cheatsheet + verified-submission (Phase D) records still ahead | Med–High |

**The single highest-leverage move — now done (2026-09-15):** the **eval suite for
the guardrail** is built. It hardened the core product promise (caught and fixed
two real leak paths), unlocked the strongest resume bullet ("designed evals that
measure an AI safety constraint"), and produced the first defensible numbers.
**Next highest-leverage:** runtime metrics (latency, tokens/request) to finish the
"quantified impact" gap, and feeding **real captured Gemini responses** into the
eval set so the catch-rate reflects real-world recall, not just the authored set.

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
> every push/PR, making the eval an automatic release gate; pushed, first run green).
> See
> [DEV_JOURNAL.md](./DEV_JOURNAL.md) for the full narrative. The gaps above stay
> listed until the work is actually *built*, not just designed — **runtime metrics**
> (latency/cost) are now the top unmet gap.

---

## Numbers to start capturing now

You can't quote impact you never measured. Even rough, self-collected numbers help:

- Requests served / problems coached (your own usage counts).
- Solution-filter **catch rate** and false-positive rate (needs the eval set).
- Median + p95 **response latency**.
- Average **tokens per request** and estimated **cost per request** (even though
  it's the user's free quota — the math shows cost-awareness).
- Hint-progression adherence (does level 1 stay conceptual?).

Log these as you build the eval suite, then backfill the `[X]` placeholders above.

---

*Revisit this doc right before you apply so bullets match the specific posting's
language. Ask me to tailor a version to a job description any time.*
