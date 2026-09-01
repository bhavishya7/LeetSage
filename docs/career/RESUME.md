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
- Engineered **defense-in-depth output guardrails** over a non-deterministic model
  — a deterministic filter that enforces product constraints the prompt alone can't
  guarantee — and scoped the design against **prompt-injection** risk (untrusted
  page content, least-privilege, no tool access).
- Made and documented core **AI system-design tradeoffs** (bring-your-own-key vs.
  managed backend; client-only vs. server) with a written decision log and an
  articulated scaling path.

> Tip: keep one bullet that signals *rigor* (guardrails/validation) and one that
> signals *judgment* (tradeoffs) — those two separate you from "called an API"
> resumes.

---

## Skills-section keywords (ATS)

Only list what you can defend. Currently truthful for LeetSage:

`LLM integration` · `Google Gemini` · `prompt engineering` · `streaming responses`
· `AI output guardrails` · `Chrome Extension (Manifest V3)` · `React` ·
`TypeScript` · `Tailwind CSS` · `Vite` · `client-side architecture` ·
`cost optimization / rate limiting`

Add once built: `LLM evals` · `LLM-as-judge` · `structured output / function
calling` · `RAG` · `unit testing (Vitest)` · `prompt-injection mitigation`.

---

## Honest gap analysis (= your build priority list)

What separates the current project from a top-tier "AI Engineer" resume artifact,
ordered by resume-value-per-effort. Each maps to
[LEARNING_ROADMAP.md](./LEARNING_ROADMAP.md).

| Gap | Why it matters on a resume | Fix | Effort |
|---|---|---|---|
| **No evals** | "I wrote evals for my LLM feature" is a top 2026 signal; it also proves the guardrail works | Eval suite for the solution-filter (deterministic + LLM-as-judge) | Medium |
| **No quantified impact** | Resumes reward numbers; you currently have none | Instrument basics: requests handled, filter catch-rate, p50/p95 latency, tokens/request | Low–Med |
| **No automated tests** | Signals engineering rigor | Vitest on filter, rate-limiter, URL normalization | Low–Med |
| **No structured output** | Named modern-LLM-I/O skill | Move hints/complexity to JSON schema output | Medium |
| **Broad permissions** | Reviewers/users notice; weakens "security-minded" claim | Scope `host_permissions` to leetcode.com (already staged, deferred) | Low |
| **No RAG/agentic element** | Both are headline 2026 keywords | Cheatsheet (local RAG) or agentic progress-tracking | Med–High |

**The single highest-leverage move:** build the **eval suite for the guardrail.**
It hardens the core product promise *and* unlocks the strongest resume bullet
("designed evals that measure an AI safety constraint at scale") *and* gives you
the quantified numbers every other bullet is missing.

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
