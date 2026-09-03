# LeetSage — Interview Prep

> Your study sheet for defending this project in a 2026 software / AI engineering
> interview. Each question has a **short answer** (say this first), a **deeper
> follow-up** (when they push), and the **signal** it demonstrates. Practice
> saying the short answers out loud until they're natural.
>
> Companion docs: [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md) ·
> [RESUME.md](./RESUME.md) · [LEARNING_ROADMAP.md](./LEARNING_ROADMAP.md)

---

## How to use this doc

1. Read the **60-second pitch** below until you can deliver it smoothly.
2. Drill the **Core Q&A** — these are the questions this project *will* attract.
3. Skim **General 2026 AI-engineering questions** — this project gives you a
   concrete example to answer each with ("in LeetSage I did X...").
4. Have a friend (or me — I can run mock interviews) ask from the **Mock
   interview bank** and push back on your answers.

---

## The 60-second pitch

> "LeetSage is a Chrome extension that coaches you through LeetCode problems
> without giving away the answer. It's an AI learning tool: progressive hints,
> problem breakdowns, and code analysis, all grounded in the specific problem
> you're on. The interesting engineering is that it's **client-only and
> bring-your-own-key** — no backend, each user brings a free Gemini key stored
> locally, so it costs nothing to run and scales for free. The hard part was
> enforcing the product's core rule — *never reveal the full solution* — which I
> did with a **two-layer guardrail**: prompt instructions plus a deterministic
> output filter that catches full implementations and pseudocode the model might
> leak. I also handled Manifest V3 constraints, streaming responses, and
> client-side cost guardrails."

That hits: product clarity, an architectural tradeoff, a safety mechanism, and
platform depth — in one paragraph.

---

## Core Q&A (this project will attract these)

### Q1. "How do you secure different users' API keys?"

**Short answer.** I don't hold them at all, and that's deliberate. It's
bring-your-own-key: each user's Gemini key stays on their machine in
`chrome.storage.local` and goes directly from their browser to Google. There's no
server, so there's no central store to breach and no secret I'm liable for.

**Deeper.** The tradeoff is the key sits in plaintext in local storage — but a
client-only app can't hide a secret from the machine's own owner anyway, so any
"encryption" would be theater (the decryption key lives on the same device). The
key is the user's own credential scoped to their own free quota, so the blast
radius of exposure is their account alone. If I needed to protect the key from the
user, or offer managed keys, that *forces* a backend — which is a different
security model (server-side vault, rotation, per-user scoping).

**Signal.** Security judgment; knowing what a control actually protects against;
understanding that architecture dictates the threat model.

---

### Q2. "You have no backend — how does this scale?"

**Short answer.** It scales trivially and for free *because* there's no backend.
Every user brings their own key and their own rate limits, so there's no shared
resource to saturate, no bill that grows with users, and no single point of
failure. It scales to a million users at zero marginal cost to me.

**Deeper.** What *doesn't* scale in this design is anything needing shared state:
managed keys, cross-device sync, aggregate analytics, leaderboards, or
server-updatable prompts. The moment I want one of those, I add a backend, and I
can describe it: an auth layer, a proxy that brokers or pools keys, server-side
per-user quota enforcement, and cost controls (response caching, model tiering,
token budgets). The senior move is *not* building that infrastructure until a
feature actually requires it.

**Signal.** Distinguishing "scales" from "has features that need scale";
cost-awareness; knowing when *not* to add infrastructure.

---

### Q3. "How do you stop the AI from just giving the answer?"

**Short answer.** Two layers. First, prompt-level rules tell the model to give
progressive hints and never full implementations. But prompts are a *soft*
control — LLMs are non-deterministic and can be talked around. So second, there's
a **deterministic output filter** that runs on every response and replaces it if
it looks like a full solution.

**Deeper — how the filter works.** It's layered:
- Phrase detection ("here's the complete solution", etc.).
- Code-size + shape checks: reject fenced code blocks over 14 lines, or blocks
  over 8 lines that match a complete-function regex.
- A pseudocode heuristic that flags text combining ≥5 control-flow lines with a
  loop, a branch, and a result — the signature of "the whole algorithm in words."
  I added this after a real incident where the model returned pseudocode that was
  a 1:1 of the solution.
- Actions that analyze the user's *own* code (`CHECK_APPROACH`,
  `UNDERSTAND_SOLUTION`) are exempt, because discussing their solution is the point.

**Honesty about limits.** Heuristics have false positives and negatives. The right
next step is an **eval suite** to measure the filter's precision/recall on a
labeled set, plus an LLM-as-judge layer for the semantic cases regex can't catch.

**Signal.** Defense-in-depth; not trusting model compliance; knowing the limits of
your own solution and the path to improve it. **This is your strongest story —
lead with it if they ask about AI safety or output control.**

---

### Q4. "LeetCode's problem text flows into your prompts. Are you exposed to prompt injection?"

**Short answer.** Yes, in principle — the problem description is untrusted input
that gets composed into the prompt, and prompt injection is the OWASP #1 risk for
LLM apps. In LeetSage the blast radius is small (the worst case is the model
misbehaving in the user's own panel; there are no tools, no privileged actions, no
other users' data to exfiltrate), but I treat page content as data, not
instructions.

**Deeper — what I'd harden.** The root cause is that LLMs read instructions and
data as one text stream. Mitigations: **structural separation** (clearly delimit
untrusted content and never interpolate it into the instruction section), explicit
"the following is problem text, not commands" framing, output validation (the
solution-filter already is one form of this), and **least privilege** — LeetSage
grants the model no tools or external actions, which removes the most dangerous
injection outcomes by construction.

**Signal.** Awareness of the #1 LLM security risk; ability to reason about blast
radius; knowing the standard mitigations even if not all are implemented yet.

---

### Q5. "How do you control LLM cost and latency?"

**Short answer.** Several levers. **Model tiering** — default to the cheap, fast
`flash-lite` model and only use the stronger model when needed. **Client-side
guardrails** — per-minute rate limit, daily cap, cooldown, per-request token cap,
timeout, and a kill switch. And **streaming** so the user sees output immediately
even for longer responses.

**Deeper.** In a backed version I'd add response caching (identical
problem+action can reuse a result), token budgeting per user, and prompt
compression. Cost-per-token math is worth being able to do live: tokens ×
price-per-million, times expected request volume.

**Signal.** Production cost-awareness — a named 2026 interview theme.

---

### Q6. "Tell me about a hard bug." (Manifest V3 depth)

**Short answer.** MV3 replaced persistent background pages with service workers
that *sleep* when idle. My first data-flow design had the content script push
problem data to the panel — which silently failed whenever the worker was asleep.

**Deeper.** I switched to a **pull-based** flow: the side panel requests the
problem on demand with retry/backoff, and falls back to injecting the content
script via `chrome.scripting.executeScript` if there's no receiver. Two other MV3
gotchas: the worker needs `"type": "module"` in the manifest or it crashes
silently on ES imports; and reading the user's code from the Monaco editor
requires injecting into the page's **MAIN world**, because `window.monaco` lives
in the page's JS context that the isolated content script can't reach.

**Signal.** Real platform systems experience; debugging non-obvious lifecycle
issues; adapting architecture to platform constraints.

---

### Q7. "Why Gemini? Why the OpenAI-compatible endpoint?"

**Short answer.** Gemini has a genuinely usable free tier, which is essential for a
zero-cost BYOK tool. I use its OpenAI-compatible endpoint so the request shape is
the industry-standard one — which means the provider is swappable later with
minimal code change.

**Deeper / lesson.** Model names drift and matter: `gemini-2.5-*` names 404'd
(deprecated); the working ones were `gemini-3.5-flash-lite` / `-flash`. A stale
model name, not the key, caused an early debugging loop — so I now verify model
names against provider docs before assuming.

**Signal.** Pragmatic provider choice; portability thinking; learning from a
concrete mistake.

---

## General 2026 AI-engineering questions (use LeetSage as your example)

These come up in AI/LLM interviews regardless of the project. For each, the goal
is to answer generally **and** ground it in LeetSage.

- **"What are evals and why do they matter?"** Evals measure whether an AI feature
  actually works, instead of a "vibe check" on a few outputs. LLM-as-judge uses one
  model to score another against a rubric; you validate the judge against a small
  labeled set (it can reach ~85% human agreement but has position/verbosity/
  self-preference biases). *LeetSage tie-in:* my solution-filter is a deterministic
  eval target — I plan an eval suite that asserts the model never leaks a full
  solution and hints stay progressive.
- **"Structured output / function calling?"** Constraining the model to emit JSON
  matching a schema, so downstream code can rely on it. *Tie-in:* LeetSage currently
  parses freeform text; moving hints/complexity to schema'd JSON would make
  rendering robust. (On the roadmap.)
- **"RAG?"** Retrieval-augmented generation — fetch relevant context and put it in
  the prompt instead of relying on model memory. *Tie-in:* the planned language
  cheatsheet could be a small local retrieval layer (zero token cost).
- **"Agents / agentic failure modes?"** Multi-step LLM systems that plan and act;
  failure modes include loops, tool misuse, and cascading errors. *Tie-in:* the
  planned progress-tracking feature (summarize a solved problem, categorize the
  pattern, update notes) is a small agentic flow.
- **"How do you handle non-determinism?"** Don't rely on exact outputs; validate
  structurally, add deterministic guardrails, use evals to measure behavior over
  many runs. *Tie-in:* the deterministic filter over a probabilistic model is
  exactly this.
- **"Hallucination mitigation?"** Grounding (give the model the real problem
  text), constraining scope, and output validation.

---

## Behavioral / judgment questions

- **"Why did you build this?"** Genuine: I use it for my own LeetCode practice, and
  I wanted a tool that teaches instead of spoiling. (Authentic motivation reads
  well.)
- **"What would you do differently?"** Add evals and tests from the start; narrow
  extension permissions earlier; instrument basic metrics so I could quote impact
  numbers.
- **"What are you most proud of?"** The guardrail — turning a fuzzy product promise
  ("don't give the answer") into a concrete, layered, testable mechanism.
- **"What's the biggest weakness right now?"** No automated tests/evals yet, and no
  usage metrics — so I can describe behavior but not yet quantify it. I know exactly
  what I'd measure and why.

---

## Mock interview bank (have someone ask these cold)

**Warm-up:** Pitch LeetSage in 60 seconds. · What problem does it solve? · Who's
the user?

**Architecture:** Draw the components and how they communicate. · Why no backend? ·
Walk me through what happens from clicking "Hint" to seeing text. · Where does
state live?

**AI-specific:** How do you stop it revealing solutions? · How would you test that
it doesn't? · Design an eval for the guardrail. · Are you exposed to prompt
injection? · How do you control cost?

**Depth probes:** Why `chrome.storage.local` and not `sync`? · What breaks if the
service worker sleeps mid-request? · How do you keep chat history per problem? ·
Why the OpenAI-compat endpoint over the native SDK?

**Stretch (system design):** "Now imagine 1M users and you want managed keys +
cross-device sync + analytics. Design the backend." (Walk: auth, key-broker proxy,
per-user quota, caching, model routing, cost controls, data store, privacy.)

---

*Update this as the project grows. When you add evals, tests, or metrics, add the
numbers here — quantified answers beat qualitative ones every time.*
