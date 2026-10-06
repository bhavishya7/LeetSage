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
- Code-size + shape checks: reject fenced code blocks over 14 lines, or any block
  that matches a complete-function pattern (a `def`/brace-function signature with a
  real body + a `return`) — regardless of line count, since a compact 8-line
  solution is still the whole answer.
- A pseudocode heuristic that flags text combining ≥5 imperative control lines with
  a loop and a result — the signature of "the whole algorithm in words." I added
  this after a real incident where the model returned pseudocode that was a 1:1 of
  the solution.
- Actions that analyze the user's *own* code (`CHECK_APPROACH`,
  `UNDERSTAND_SOLUTION`, `GENERATE_REPORT`) are exempt, because discussing their
  solution is the point.

**Honesty about limits.** Heuristics have false positives and negatives — so I
built an **eval suite** (see Q3a) that measures the filter's catch rate and
false-positive rate on a labeled set and gates against regressions, plus an
LLM-as-judge scaffold for the semantic cases regex can't catch.

**Signal.** Defense-in-depth; not trusting model compliance; knowing the limits of
your own solution and the path to improve it. **This is your strongest story —
lead with it if they ask about AI safety or output control.**

---

### Q3a. "You said you evaluate the guardrail. How? What did the eval actually find?"

**Short answer.** I built a **labeled eval** that treats the solution-filter as a
binary classifier — positive class = "this response leaks the full solution" — and
scores it as a release gate. A hand-labeled dataset of sample responses (leak vs.
safe), run through the filter, reported as **catch rate** (recall on leaks),
**false-positive rate** (legit coaching wrongly blocked), and **precision**. It's
wired as a test so a regression that weakens the guardrail fails the build.

**What it found (the important part).** The first run scored **62.5% catch rate** —
it caught only 5 of 8 known leaks. That surfaced two real blind spots in a filter
I *thought* was solid:
1. A **compact complete function** (an 8-line Two Sum) slipped through, because the
   complete-function check was gated behind a line-count threshold — a short-but-
   whole solution dodged it.
2. **Pseudocode that folds the conditional into a loop header** (a monotonic-stack
   writeup with no standalone `if`) wasn't recognized, because the heuristic
   required an explicit branch line.

I fixed both — dropped the line-count gate on the complete-function check, added a
brace-function detector for multi-brace languages the old regex missed, and
loosened the pseudocode heuristic to "loop + result + enough imperative steps." The
eval then hit **100% catch / 0% false-positive** on the set, with the existing
negative cases confirming I hadn't started over-blocking.

**The honesty I lead with.** The dataset is **author-generated** — I wrote both the
filter and the examples, so the examples skew toward shapes the filter can catch.
That makes it a strong **regression gate** but an **optimistic** estimate of real-
world recall. So I designed the dataset to ingest **real captured Gemini responses**
later, and built the **LLM-as-judge** layer offline/mockable (an injected judge
function, no live key needed) to catch the semantic paraphrases regex can't. A
judge I haven't validated against ground truth is just another opinion, so I score
it with the same metrics.

**Signal.** This is the headline. Evals as a release gate for an AI safety
constraint; measuring the thing I claim ("teaches, never solves"); the eval finding
real bugs my intuition missed; and being explicit about eval bias rather than
quoting a flattering number. If they ask about evals, LLM testing, or "how do you
know your AI feature works" — **lead here.**

---

### Q4. "LeetCode's problem text flows into your prompts. Are you exposed to prompt injection?"

**Short answer.** Yes, in principle — the problem description is untrusted input
that gets composed into the prompt, and prompt injection is the OWASP #1 risk for
LLM apps. So I hardened it (2026-09-21). The blast radius is deliberately small
(the worst case is the model misbehaving in the user's own panel; there are no
tools, no privileged actions, no other users' data to exfiltrate), and page
content is now treated as **data, not instructions** — structurally, not just by
hope.

**What I did (defense-in-depth, tested both sides).** The root cause is that LLMs
read instructions and data as one token stream — the same in-band-signaling
problem behind SQL injection and XSS, and it's fixed the same way: keep the
untrusted data out of band and never let it be interpreted as control.
- **Structural separation.** A single `wrapUntrusted()` choke point fences all
  untrusted content (problem text, editor code, session digest) inside a
  hard-to-forge `<<<UNTRUSTED_CONTENT …` block framed explicitly as DATA; the
  per-action instruction stays *outside* the block. All 9 actions + the free-form
  question path funnel through it, so no call site can forget the framing. (It's
  the "parameterize the query" instinct: the data goes in a slot declared "not
  code.")
- **Guardrail reassertion.** The no-solutions rule is restated *after* the
  untrusted block, so a late "…now ignore the above" can't win on recency — the
  model's last read is my rule, not the attacker's.
- **Least privilege (by construction).** The model has no tools/functions/network
  — only text back to the panel — which removes the catastrophic injection
  outcomes entirely. The strongest mitigation is the capability you never grant.
- **Deterministic output filter (the hard backstop).** The pre-existing
  solution-filter scans the *output*, so even if an injection fully succeeds, a
  leaked solution is still caught on the way out. Input framing is a *soft*
  control; the output filter is the *hard* one.

**How I proved it (the part interviewers actually care about).** I encoded the
security property as CI-gated assertions on **both** sides: a unit test
(`prompts.test.ts`) asserts the framing exists and an injected payload stays
*inside* the fence for every action; and a new `injection-leak` eval case
simulates a *successful* injection (the model obeyed and dumped a solution) and
asserts the output filter *still* catches it. A mitigation you don't test is one
you'll silently regress. `npm run test` went 134 → 149.

**What I deliberately didn't build.** A blocklist scanner for injection phrases —
trivially bypassed by paraphrase/encoding and false-positive-prone (a legit
problem *about* prompt injection would trip it). Structural separation + output
validation are the real defenses; a blocklist is at best a telemetry signal. Next
step (scaffolded, not built): an LLM-as-judge semantic output check for paraphrased
leaks regex can't catch.

**Signal.** Named the #1 LLM risk and *shipped and tested* the standard
mitigations rather than hand-waving; sized the defense honestly to a small blast
radius; can name the in-band-signaling analogy (SQLi/XSS) and the recency argument;
and knows when *not* to build (blocklist theater). See DESIGN_DECISIONS ADR-004
(2026-09-21 update) and `.kiro/specs/leetsage-prompt-injection/design.md`.

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

### Q5a. "You mentioned cost and latency — do you actually measure them?" (runtime metrics) ⭐ quantified impact

> The natural follow-up to Q5. It turns "I care about cost/latency" into "here are
> the numbers and how I captured them."

**Short answer.** Yes — I instrumented per-request runtime metrics, entirely
client-side (no backend, same posture as the usage counter). Each AI request records
**wall-clock latency**, **prompt/completion tokens** when the API exposes usage, and
a **derived estimated cost** from a cited price table. The numbers from my own runs:
**p50 latency ~1.6 s, p95 ~3.0 s, ~1,459 tokens/request, ~$0.00025 est. per request.**

**Deeper.** Three things I'd want an interviewer to notice.
(1) **The capture was not obvious and I verified rather than assumed.** The
non-streaming path already parsed the OpenAI-compatible `usage` object, but the
*streaming* path — the one the UI actually uses — yielded only content and never saw
usage. Reading the real request path caught that; if I'd assumed, I'd have shipped a
**latency-only** metric and silently missed the headline tokens/cost number. The fix
was to set `stream_options: { include_usage: true }` and surface the final usage-only
chunk via an `onUsage` callback, keeping the streaming contract intact. I verified at
runtime that the Gemini endpoint honors it — and if it ever doesn't, the sample
records `tokensCaptured: false` and the readout says "not captured" instead of
fabricating a number.
(2) **The aggregation is pure and unit-tested.** `percentile()` (interpolated
p50/p95) and `summarize()` are I/O-free and covered by tests; storage is bounded
by design (a 200-sample rolling window for the distribution + lifetime running
aggregates that survive eviction — no unbounded history). And the metrics write is
**best-effort**: a failure is swallowed so monitoring can never break the coaching
response or double-count the rate limiter.
(3) **I kept the numbers honest.** Averages divide by `tokensCapturedRequests`, not
total requests, so a token-capture gap can't deflate the mean. The cost is an
*estimate* from public per-token pricing kept in one cited, trivially-updatable table
— I say "cost-awareness," not "a bill," because it's BYOK on a free quota. And the
sample is small (n=9, one model), so I present it as an order-of-magnitude signal,
not a benchmark.

**Signal.** Production monitoring mindset + intellectual honesty about
self-collected numbers — and "verify, don't assume" applied to reading the actual
code path. Live cost math still lands here too (tokens × price-per-million ×
volume). See [DEV_JOURNAL.md](./DEV_JOURNAL.md) (2026-09-23).

---

### Q5b. "Why only offer two models — the two *cheapest*? Why not let power users pick a better model, or detect what their key unlocks?" ⭐ product-judgment

> This is a product-vs-engineering judgment question. It attracts "did you think
> about your users?" and "do you know the API?" at the same time. Lead with the
> *why*, then show you understood the counter-argument well enough to reject it on
> purpose — that's what makes it a defensible decision rather than a limitation.

**Short answer.** It's a deliberate product decision that falls out of the one
identity constraint: LeetSage is **free, bring-your-own-key, no backend**. I expose
exactly the two cheapest Gemini models (`flash-lite` as the default, `flash` as the
step-up) because they sit inside Google's **free tier**, so every user can run the
tool at zero cost with no billing attached. Offering pricier models would quietly
break the "it's free" promise — some calls would start billing the user's Google
account — for a use case where a bigger model doesn't make the *coaching* better. A
hint, a problem breakdown, a nudge toward the right pattern — Flash-Lite does those
well; a frontier model doesn't make a *hint* more pedagogically useful, it just
costs more and runs slower. So the expensive models would add cost and latency to
serve a tiny minority, against the product's whole reason for existing.

**The counter-argument, stated fairly (so I can show I rejected it on purpose).**
"A power user with API billing enabled has access to stronger models and higher
rate limits — why not detect that and let them opt in?" It's a reasonable instinct,
and parts of it are even technically feasible. I actually dug into it:
- **The subscription confusion I had to clear up first.** Consumer Gemini
  subscriptions (the AI Plus/Pro/Ultra tiers) upgrade the *Gemini app*, **not** the
  API. My extension uses the API, so a consumer subscription is irrelevant to it.
  The real lever is **API billing** — a user links a billing account to their Google
  Cloud project, and the **same API key** then gets higher limits and paid-only
  models. There's no separate "premium token" to paste and detect; it's the same
  credential with billing attached.
- **What's actually detectable, and what isn't.** This is the sharp technical part.
  Models *are* discoverable: the Gemini API has a list-models endpoint
  (`GET /v1beta/openai/models` on the OpenAI-compatible base URL I already use), so
  I genuinely *could* query a key and show the models it can call, including paid
  ones. But **rate limits / tier are NOT reliably queryable** — Google doesn't
  publish a per-key "you are Tier 2, 1000 req/day" value you can read; the docs
  direct you to check AI Studio, and the real limit depends on model + project +
  billing + request path + account standing. So I could only learn a user's limit
  *reactively*, by catching a `429`. "Detect their models" is possible; "detect
  their limits and offer higher caps" basically isn't.

**Why I still said no (the judgment).** Even granting the feasible half, it's the
wrong call for *this* product:
1. **It muddies the core promise.** "Free, BYOK" is the headline. The moment some
   models bill the user, I have to caveat every model choice with "this may charge
   your account," and the clean story gets murky.
2. **Low value, real complexity.** It serves the rare billed-key user, and in return
   my `GeminiModel` type stops being a safe compile-time union (it'd become an
   arbitrary string), my hardcoded per-model **cost table breaks** for models I've
   never priced (and Gemini's lineup churns constantly — new Flash/Pro tiers landed
   repeatedly through 2026, with intro discounts), and my 200/day rate limiter — a
   *free-tier* assumption — is wrong for a paid user whose real limit I can't even
   read. That's a lot of fragility to maintain for a few users.
3. **It doesn't serve the mission.** The product teaches; the two cheap models teach
   fine. Spending complexity budget on frontier-model access is optimizing the thing
   that doesn't move the learning outcome.

**What I'd do if the context changed.** If this became a paid or team product (which
*forces* a backend — see Q2), the calculus flips: a backend can broker keys, enforce
per-user quota server-side, cache responses, and route models by task — at which
point dynamic model discovery via the list-models endpoint becomes worth building,
and "unknown price → show as estimate/omit" is the graceful degradation. I'd *still*
never build limit-detection, because the API doesn't support it; I'd react to 429s.
The one piece I'd consider even in the free version, purely for robustness, is
querying the models endpoint instead of hardcoding names — because a hardcoded model
ID is already fragile (a stale `gemini-2.5-*` name 404'd on me once; see Q7). But I'd
keep the *free two* as the default and recommended path regardless.

**Signal.** Product judgment anchored to a single identity constraint; knowing the
difference between "technically possible" and "worth building"; genuinely
understanding the API (app-subscription vs. API-billing, the list-models endpoint,
the un-queryable rate limits) rather than hand-waving; naming the type-system and
pricing-table fragility a dynamic model list would introduce; and treating "keep it
free" as a defended decision with a stated trigger for revisiting it. Pair with
**Q2** (no-backend scaling) and **Q5/Q5a** (cost control + measurement).

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

### Q8. "Tell me about an architecture decision you made." (structured output) ⭐ favorite

> Lead with this when asked about design, refactoring, or a decision you're proud
> of. It shows you diagnose root causes, not just patch symptoms. **This shipped
> (2026-09-03)** — you can speak to it in the past tense, with the streaming
> tradeoff and the tolerant-parse-with-fallback as real, built decisions.

**Short answer.** I built a "generate report" feature that summarizes a practice
session, and it produced generic, textbook writeups that ignored what the user
actually did. The root cause wasn't the prompt — it was architectural: every
action returned **freeform prose with no machine-readable data**, so the report
had nothing structured to summarize and fell back to generic content. The fix I
shipped was a **hybrid response** — the human-readable prose *plus* a small
structured `data` block conforming to a schema — and a deterministic session
digest that the report consumes.

**Deeper — why it's the right fix.** Once responses carry structured data, that
data becomes a **single source of truth** that many features consume: the report
aggregates it, the persistent progress records populate from it, the cross-problem
analytics group on it, and evals assert on it (`data.time === "O(N^2)"` instead of
regex-scraping prose). Building the progress feature on prose first would've meant
fragile extraction now and a rip-out later — so I resequenced to do structured
output first, as the load-bearing wall the other features stand on.

**The hard parts I had to reason about (and how I resolved them).**
- **Non-deterministic boundary:** the model can omit the block or emit malformed
  or schema-invalid JSON, so the parser **never throws** — a bad block degrades to
  prose-only and the card still renders. I also normalize what does parse (e.g.
  coerce free-text pattern names onto a closed vocabulary) so consumers get a
  predictable shape.
- **Streaming vs. structured parsing:** streaming gives responsive UX but you can't
  parse JSON until it's complete — so I stream the human prose (hiding the data
  fence, even a half-arrived one, so raw JSON never flashes) and finalize the small
  data block once the stream ends.
- **Consistency:** two representations of the same fact can diverge, so the data
  block is the source of truth and the prose is instructed to match it. Honest
  caveat: that's a *soft* prompt guarantee today, not render-from-data.
- **Feeding it forward:** the report doesn't re-summarize the prose with another
  LLM call — it builds a **deterministic digest** at read time from the stored
  structured fields. Cheaper, reliable, and grounded in what actually happened.

**Verify-before-assume detail.** I checked Gemini's OpenAI-compatible endpoint
docs and confirmed it *does* expose `response_format: {type: "json_schema"}` — but
it conflicts with token streaming and its JSON-Schema support is partial. So I
chose the prompt-a-fenced-block + tolerant-client-parse approach instead, which
keeps the streaming UX and doesn't depend on partial schema support. (Same
"verify against provider docs" discipline as the model-name 404 in Q7.)

**Signal.** Root-cause diagnosis over symptom-patching; separation of data from
presentation / single source of truth; recognizing a load-bearing primitive and
sequencing around it; defensive handling of an unreliable boundary; and choosing a
technique against verified provider capabilities, not assumptions. **This is your
strongest *architecture* story — pair it with the guardrail (Q3) as your strongest
*safety* story.**

---

### Q9. "Walk me through a data model you designed." (progress tracking) ⭐ system-design

> Lead with this for data-modeling / storage / system-design prompts. It's a real
> schema you built under a hard constraint (no backend), with honest tradeoffs.
> **Shipped 2026-09-04** — speak to it in the past tense.

**Short answer.** I added persistent per-problem progress to LeetSage — track
which problems you've worked, the approaches you tried, and surface your weakest
pattern across problems. With no backend, everything lives in
`chrome.storage.local`, so the model had to be designed around the storage's read
and write patterns. I used **one key per record (`record_{slug}`) plus a small
`progress_index` projection**: the "My Progress" list and the analytics render off
the light index, and only the detail view loads a full record.

**Deeper — the shape and why.**
- A `ProblemRecord` holds an **append-only `attempts[]` event log** rather than
  mutable "current state" — so history is preserved and I can compute "best attempt
  so far" (denormalized as `bestAttemptIndex`) instead of overwriting it.
- The index is a **summary projection** of each record (title, difficulty,
  patterns, timestamps) — classic read-optimization: the common path (render the
  list, run analytics) never deserializes every full record. The cost is
  **write-amplification / keeping the index in sync** on save, which I accept
  because reads dominate.
- **Schema versioning:** records carry `schemaVersion` and `migrate()` runs on
  every read — ordered, idempotent steps, cheap to add now and painful to retrofit
  later.
- **Analytics is a deterministic pipeline**, not an LLM call: group attempts by
  pattern → a struggle score → weakest link + a revisit list. Grouping relies on
  the **closed `ProblemPattern` vocabulary** from the structured-output layer — a
  stable set, not free text — which is exactly why that vocabulary is closed.

**The honesty constraints (this is the interesting part).** The data is *inferred*,
not verified — I can't see LeetCode's judge — so the design refuses to overclaim:
insights stay hidden until there are ≥3 problems and carry a Low/Medium/High
**confidence badge**; the **attempt count is deliberately withheld from the UI**
because a save click isn't a verified re-solve; and complexity is reported as
"optimal" only when the model flagged `solvedOptimally`, else the measured
complexity. I also drew a clean line — **the model owns judgments (patterns,
complexity, narrative); the app owns facts (date, title, difficulty, language)** —
which is why I removed the model-written date and let the app timestamp the attempt.

**A subtle bug worth telling.** A "save" is not a "solve". Logging every save
inflated the attempt log, so I added an **append-vs-replace** rule: same calendar
day + unchanged approach/complexity replaces the latest attempt in place; a
different day or a changed approach/complexity appends a new one. Verified
submissions (Phase D) are the deferred piece that would let me trust — and show —
the count.

**Signal.** Data modeling around access patterns; event-log vs. mutable state;
index/summary projections and the read-vs-write tradeoff; schema migration;
deterministic aggregation over an LLM; and — the differentiator — designing for
*honest presentation of uncertain data* rather than a confident-but-wrong UI.

---

### Q10. "Walk me through your CI/CD — why GitHub Actions, and not Docker or Jenkins?"

> Lead with this for CI/CD, DevOps, or "how do you gate releases" prompts. It pairs
> with the eval (Q3a): CI is what turns that eval from a manual discipline into an
> **automatic** release gate. **Shipped 2026-09-15 (follow-up)** on
> `feature/evals-and-tests` — **pushed; first CI run green** (~24s, 10 files /
> 134 tests).

**Short answer.** I use **GitHub Actions**. On every push and pull request a clean
Linux runner does `npm ci` → lint → test → build, and the test step includes my
guardrail **eval** — so a change that weakens the "never hand over the solution"
rule **fails the build automatically**. That's the point: the eval becomes a real
release gate instead of something I remember to run. I chose Actions because it's
built into the repo, free, needs no server to maintain, and runs the exact same npm
scripts I run locally — the lowest-overhead way to automate the gate.

**Why not Docker.** Docker packages an app *plus its whole environment* into an
image that runs identically anywhere — it earns its keep when you deploy a
**long-running service** (an API, a backend) as a container on a host. **LeetSage
has no backend.** The build artifact is a static bundle (`dist/` — the JS the
browser loads), not a server process, so there's nothing to containerize and nothing
to deploy to a host. A Dockerfile would be an image to maintain for zero benefit,
and Actions already gives me a clean Node environment for reproducible test runs.

**Why not Jenkins.** Jenkins is a **self-hosted** CI server — I'd install and
maintain the machine, plugins, security, and uptime myself. That's normal in a large
enterprise; for a solo GitHub project it's pure overhead compared to Actions, which
needs no server. I can talk about Jenkins, I just wouldn't run it here.

**Why no CD / auto-publish (a deliberate non-choice).** CD would upload the
extension to the Chrome Web Store automatically on a tag. I skipped it on purpose:
publishing needs API credentials stored as encrypted secrets **and** every version
goes through Google's review (hours to days), so it's never truly instant. Most solo
extension projects stop at "CI + build a zip" and upload manually — so my deployment
today is: build `dist/`, load unpacked. Knowing *when not* to automate is part of
the answer.

**The sharp follow-up — "can a commit pass your pre-commit hook but still fail CI?"**
Yes, and understanding why is the real signal. I also added a **Husky pre-commit
hook** that runs the *same* scripts (lint/test/build) locally — but the hook and CI
are **not** guaranteed to agree. **CI is the authority** because it runs `npm ci` on
a clean machine straight from the lockfile: exact locked versions, and it fails if
`package.json` and the lockfile disagree. **The hook is a fast, local, best-effort
check** against whatever is already in my `node_modules`, which can have drifted. So
the classic failure is a dependency I installed locally but forgot to add to
`package.json` — the hook passes (my `node_modules` has it), CI's clean install
fails. The hook is also skippable (`--no-verify`); CI isn't. Mental model: the hook
is a **subset** of CI, a courtesy for fast feedback, not a replacement for the gate.

**One honest wrinkle.** The first time I ran the full CI sequence locally, **lint
failed** — on 4 pre-existing `no-explicit-any` errors that predated the test work.
Rather than make lint non-blocking (weakening the gate on day one), I fixed them in
a separate commit by properly typing the two external-boundary reads (the Monaco
MAIN-world reader and the two `response.json()` shapes), keeping every access
`?.`-guarded. Green gate, honestly earned.

**A second wrinkle — version hygiene / verification discipline.** On the first run
CI warned that **Node 20 was deprecated** (that's the *action's* own runtime on the
runner, separate from the `node-version: "22"` I install for the build). I bumped
the actions — but initially to a version I **remembered**, `@v5`, which turned out
to be **two majors stale**. Instead of trusting the plausible-looking number, I
**verified the current major against the actions' release pages and the GitHub
changelog** and pinned **`@v7`** for both. It's the *same* "verify against docs,
don't trust a remembered identifier" discipline that bit me once before with a
stale model name (`gemini-2.5-*` → a 404). I also corrected it **on top** of the
`@v5` commit rather than rewriting history, since it may already have been pushed.

**Signal.** Choosing CI/CD tooling from real constraints, not cargo-culting Docker/
Jenkins; knowing what each tool actually *buys* you (and that "no backend" removes
the reason for containers); the `npm ci`-on-a-clean-machine authority distinction
between a hook and CI; and treating "don't automate publishing yet" as a defensible
engineering decision. Pair with **Q3a** — this is what makes the eval an automatic
gate.

---

### Q11. "You route free-form chat to actions. How did you build the router — and how do you keep it from becoming a way around your solution guardrail?" ⭐ AI/system-design

> Lead with this for intent-classification, LLM-orchestration, or "how do you design
> a safe AI feature" prompts. It's the last pre-launch feature and it pairs a clean
> design story with a sharp safety decision.

**Short answer.** I treated the router as what it is — **a classifier** — and built
it as a pure `classify → resolveOverlap → route` pipeline where each stage is
independently testable. A typed question that matches an existing action routes to
that action; anything ambiguous or multi-part falls through to normal chat. The
guardrail decision is the interesting part: chat must **never silently route into a
solution-bearing (filter-exempt) action**, so an exempt match — or any borderline
case — becomes a **confirm-to-route affordance** ("Reveal the full solution? Yes /
Just answer"). The user's deliberate tap is what reaches a solution, not clever
phrasing.

**The design, and why each call.**
- **Pure pipeline over a tangled dispatcher.** `classify`, `resolveOverlap`, and
  `route` are pure functions, each unit-tested against a labeled golden set.
  `route()` stays pure by returning a `RouterEffect` (`dispatch | confirm | chat`)
  that the React layer interprets — no handlers called from inside the core.
- **Intents are data, exemptness is derived.** One `IntentDef` per intent in an
  `INTENT_REGISTRY`; whether an intent is solution-exempt is **derived** from the
  same `isSolutionExemptAction()` the filter and the pre-display gate use — never
  stored. One source of truth, so a future exempt action inherits the confirm
  requirement for free.
- **A local heuristic classifier behind a seam.** Regex/keyword, zero API calls, so
  a chat message costs **exactly one** model call (the routed action or chat), never
  two. The `classify()` seam lets an LLM classifier drop in later with no call-site
  changes. I explicitly **rejected** vector routing / a fine-tuned router /
  per-request LLM classification as over-engineered for ~9 client-side intents with
  no backend.
- **A three-way resolver with an abstain band.** Not a binary threshold —
  `route` / `ask` / `chat`, with an explicit "not sure" band (modeled on
  allow/deny/abstain classifier practice). Precedence is
  context-sharpening → weight → confidence. Genuine multi-intent falls through to
  chat, because one call can answer a multi-part question and I never want to fire N
  actions off one message.
- **The golden set is the accuracy metric.** A router is a classifier, so its test
  set doubles as its measurement — seeded with real observed examples across
  confident-match / overlap / borderline / multi-intent / no-match, plus an explicit
  test that "just give me the full solution" never silently reaches an exempt action.
  I tuned the classifier *against that set*, not by hand — narrowing `explain-concept`
  because it was mis-catching general trivia, and adding "my code's complexity"
  patterns so `analyze-code` context-sharpens when the editor has code.

**Signal.** Recognizing that "route intent" is a classification problem and building
it with the discipline of one (pure stages, data-driven config, derived cross-cutting
facts, a defined tiebreaker *and* an abstain band, a labeled metric); bounding the
blast radius of a user message to one API call; and — the load-bearing point —
making the safety property structural: a free-text entry point can't become a bypass
because reaching a solution-bearing action always requires a deliberate confirm.
Pair with **Q3** (the guardrail) and the workflow Q&A below (the visual-review gate
that caught the confirm banner's problems and an adjacent data-loss bug).

---

### Q12. "You let users import a file into the extension's storage. How do you stop a malicious file from doing damage?" ⭐ security

> Lead with this for security, input-validation, or "untrusted input" prompts. It's
> a clean threat-model story with a single memorable principle.

**Short answer.** The import is the one place an **untrusted file** flows into
**privileged, persistent storage**, so I treated it as a trust boundary and spent
the design budget there. The governing rule is **reconstruct, don't
validate-in-place**: I never persist the parsed object. For each record I build a
brand-new trusted object by copying only the fields I explicitly know about, each
through its own sanitizer. Anything I didn't allow simply doesn't survive — it's an
**allowlist, not a denylist**.

**Why that one principle is load-bearing.** Reconstruction defeats three classes of
attack *at once*, without me having to enumerate them: **unknown-field injection**
(an extra field never gets copied, so it can't ride along into storage),
**prototype pollution** (I never spread the object, and my property reader refuses
`__proto__`/`constructor`/`prototype` and uses `Object.prototype.hasOwnProperty.call`
so a hostile own `hasOwnProperty` can't lie), and **type confusion** (every field is
coerced/validated to its expected shape — enums checked against a vocabulary, numbers
forced finite and bounded, timestamps range-checked). A denylist would have to
predict every bad input; an allowlist only has to know the good shape.

**The rest of the pipeline (defense-in-depth).** A size gate before parsing (DoS),
`JSON.parse` in a try/catch (never `eval`), an envelope-format gate (a foreign file
is rejected with a friendly message), a global attempts cap so `N × M` can't evade
the per-record cap, **every derived field recomputed** (the best-attempt index, the
whole storage index) rather than trusted from the file, and the write itself is
atomic with a quota check that fails closed. I also validated the stored `url` to the
LeetCode problem shape even though nothing renders it as a link *today* — because a
planned "open on LeetCode" link would otherwise turn an unvalidated `javascript:` url
into a live vector the day it ships. And strings are HTML-neutralized as
defense-in-depth: I verified the renderer is already XSS-safe (React JSX, no
`dangerouslySetInnerHTML`/`innerHTML` anywhere), so the sanitizer is a second layer,
not the only one.

**Signal.** Recognizing a trust boundary and designing to it; a single structural
principle (reconstruct over validate) that defeats a whole class of attacks instead
of a brittle list of patches; defense-in-depth with the derived-field recompute and
atomic/fail-closed write; and validating a field *before* it has a dangerous consumer.
Pair with **Q4** (prompt injection — the other untrusted-input boundary) and the
"platform-enforced beats discipline-enforced" workflow answer below (the manifest CSP).

---

### Q13. "Make your chat agentic. How did you add tool-use without blowing your cost budget or your safety guarantee?" ⭐ AI/system-design

> Lead with this for agents, tool-use/function-calling, LLM-orchestration, or
> "how would you design an agent" prompts. It's the project's clearest agentic-
> engineering story and pairs naturally with Q5 (cost) and Q3/Q11 (guardrail/router).

**Short answer.** I made chat a **three-tier, cost-aware agent** that sits *in front
of* my existing intent router rather than replacing it: **Tier 1** routes a
confident intent to a pre-built action (1 request); **Tier 2** answers context-aware
with no tools (1 request); **Tier 3** is a **bounded, read-only tool loop** that
fires *only* when the model needs to fetch a fact it doesn't have (2+ requests). It's
a client-side TypeScript control loop — **no backend, no agent framework, no vector
DB** — because the product's constraints (free, BYOK, 200 requests/day, no server)
don't justify one.

**Why route-first-loop-as-fallback (the design choice).** Three options: (a) replace
routing wholesale with the loop — throws away shipped, tested routing and makes
*every* message pay the agent premium; (b) route first, loop as fallback — chosen;
(c) send everything through the loop — over-engineered and expensive. (b) keeps the
cheap shipped path for the common case and reserves the agentic machinery for the
narrow case that actually needs it. It also lowers the stakes on classifier
accuracy: under-routing falls through *gracefully* into capable chat.

**How I kept cost bounded — the two-axes insight.** Cost is two independent things,
and conflating them is the trap. **Request count** (my 200/day budget): adding
conversation memory adds **zero** requests — a chat turn is one request whether it
carries zero or N prior turns; **only tool rounds add requests.** **Tokens per
request** (per-call cost + latency): context *does* add input tokens, and an
unbounded transcript compounds. So I gave chat memory that's **free on the request
axis and bounded on the token axis**: a long-term layer that **reuses an existing
zero-API session digest** (built from structured data, not a model summary) and a
short-term **bounded sliding window** (last 3 turns, char-capped). I explicitly
rejected a rolling LLM summary because the summary *itself* costs a request — the
wrong trade. And the loop is **hard-capped at 2 tool rounds** (worst case 3
requests), a fixed constant, not a user-tunable knob.

**How I kept it honest and counted.** The single most important property is
**per-round request accounting**: the loop records **exactly one** request per
network round — each tool round *and* the final answer — so one message that costs
N requests counts N against the budget, never silently. There's a unit test
asserting the record-count equals the rounds issued. If the budget runs out
mid-loop, it degrades gracefully to a final answer instead of erroring.

**How I kept the safety guarantee (the part interviewers probe).** The tools are a
**read-only, zero-inference allowlist** — three tools that read the editor code, the
examples, and the constraints — each returning a fact that *already exists* (a DOM
read or in-memory data), so a tool round makes **no hidden extra model call**. I
deliberately **dropped a "complexity of my code" tool** that seemed obvious, because
its only implementation would be a **nested model call inside the tool** — an
*uncounted* request below my accounting, no longer read-only, and a side door that
pipes model-generated solution-adjacent content back in. (It's also redundant: that
question already routes to a Tier-1 action.) That asymmetry — the 3 tools do zero
inference, a complexity tool would do a whole LLM call — is the whole reason it's
out. And the loop's **final answer is NON-EXEMPT**: it still clears my deterministic
solution filter and the pre-display gate before it's shown, exactly like normal
chat; tool results and both memory layers are fenced as untrusted input. So adding
tool-use didn't widen the bypass surface.

**The honest caveat I lead with.** Because I pre-load the problem, examples,
constraints, and the user's code into the prompt, the model almost always answers at
Tier 2 — **the loop is a rare fallback, not the default path.** I kept it anyway,
because the bounded-agent machinery (iteration cap + per-round accounting +
unbypassable guardrail) is the valuable, correct part even when it rarely fires, and
I'd rather say that plainly than force the loop to run to look impressive. I did
verify it executes end-to-end live (empty editor → the loop fetches the code → final
answer → the filter runs on it).

**Signal.** Agentic engineering scaled to real constraints rather than cargo-culted
from a framework; a precise cost model (**"context ≠ requests; only tool rounds cost
requests"**); a safety-first tool design (read-only allowlist, a tool *rejected*
specifically because it would be an uncounted model call, non-exempt final answer
still filtered); and the maturity to document that the headline feature is a rare
fallback. Pair with **Q5/Q5a** (cost + measurement), **Q11** (the router it sits in
front of), and **Q3** (the guardrail it preserves).

---

## General 2026 AI-engineering questions (use LeetSage as your example)

These come up in AI/LLM interviews regardless of the project. For each, the goal
is to answer generally **and** ground it in LeetSage.

- **"What are evals and why do they matter?"** Evals measure whether an AI feature
  actually works, instead of a "vibe check" on a few outputs. LLM-as-judge uses one
  model to score another against a rubric; you validate the judge against a small
  labeled set (it can reach ~85% human agreement but has position/verbosity/
  self-preference biases). *LeetSage tie-in:* see **Q3a** — I **built** a labeled eval
  that scores my solution-filter as a release gate (catch rate / false-positive rate
  / precision) and it caught two real leak bugs on its first run; I also built an
  offline, injectable LLM-as-judge scaffold for the semantic cases regex can't catch.
  It's now an **automatic** gate — it runs in GitHub Actions CI on every push/PR, so
  a change that weakens the guardrail fails the build (see **Q10**).
- **"Structured output / function calling?"** Constraining the model to emit JSON
  matching a schema, so downstream code can rely on it. *Tie-in:* see **Q8** — this
  is a **shipped**, load-bearing decision in LeetSage. The report-feeding actions
  emit a schema'd `data` block alongside the prose; a tolerant parser validates it
  and degrades to prose-only on failure; the report consumes it as the single
  source of truth. I chose a prompt-a-fenced-block approach over the provider's
  native `response_format: json_schema` because the latter conflicts with token
  streaming and only partially supports JSON-Schema.
- **"RAG?"** Retrieval-augmented generation — fetch relevant context and put it in
  the prompt instead of relying on model memory. *Tie-in:* the planned language
  cheatsheet could be a small local retrieval layer (zero token cost).
- **"Agents / agentic failure modes?"** Multi-step LLM systems that plan and act;
  failure modes include loops, tool misuse, and cascading errors. *Tie-in:* the
  shipped progress-tracking flow (summarize a solved problem, categorize the
  pattern, persist it as a record) is a small structured pipeline; and I built a
  custom Kiro **project-historian agent** whose failure I had to constrain (it
  corrupted a file via shell text-manipulation — see the agents section).
- **"How do you handle non-determinism?"** Don't rely on exact outputs; validate
  structurally, add deterministic guardrails, use evals to measure behavior over
  many runs. *Tie-in:* the deterministic filter over a probabilistic model is
  exactly this.
- **"Hallucination mitigation?"** Grounding (give the model the real problem
  text), constraining scope, and output validation.

---

## Working with AI agents — how you built it (a distinct 2026 theme)

Interviewers increasingly ask not just *what* you built but *how you worked with
AI to build it.* These answers are drawn from the real practices on this project.

### "How do you work effectively with coding agents?"

**Answer.** I treat the context window as a managed resource — *context
engineering*. I scope a session to roughly one feature or spec, and critically, I
**externalize decisions into durable artifacts** — specs, an architecture decision
log, a dev journal, and always-on steering files — rather than relying on the
conversation to remember them. That way, when context compacts or I start a fresh
session, the knowledge persists and the agent stays grounded. I use **layered
context**: always-on steering carries the product definition and conventions, and
it *references* heavier documentation rather than inlining it, so each session is
grounded without wasting the context budget (conditional steering can load deep
implementation notes only when I touch the relevant code). I even built a **custom
agent** to keep that documentation current. The failure mode I avoid is a
sprawling session where unrelated work pollutes the context and the agent starts
conflating threads or losing earlier decisions.

**Signal.** Understanding context *economics*, not just "I wrote some rules" —
and having built tooling and habits around it.

**Where this paid off most (E9, 2026-10-01).** The biggest feature I've built —
turning chat into a three-tier agent with a bounded tool loop — I ran as a **full
spec trilogy with sign-off between phases** (requirements → design → tasks →
implement). That wasn't ceremony for its own sake: the **requirements phase forced
every open question into the open before any code existed** — streaming vs.
non-streaming tool rounds, the round cap (1 vs 2 vs 3–4), the memory-window size,
whether to make limits Settings knobs or fixed constants, and the form of the usage
indicator. We resolved each *with* the decision reasoning captured, so when I got to
implementation there were no architectural surprises mid-build — the hard calls were
already made and written down. The payoff of spec-driven work isn't the documents,
it's that the expensive-to-reverse decisions happen while they're still cheap to
change (a sentence in `requirements.md`, not a refactor).

**Signal (second).** Scaling process rigor to feature complexity, and knowing *why*
a design-phase gate is worth it — it front-loads the irreversible decisions.

### "Tell me about a time you had to constrain or debug an AI agent's behavior."

**Answer.** My documentation agent corrupted a file by editing it through a shell
command (`Set-Content`), which re-encoded the whole file and mangled its UTF-8
characters and line endings. The root cause was a tooling gap: I'd given the agent
shell access but no proper file-editing tool, so it fell back to shell text
manipulation. The fix was to **constrain its tools** — grant a surgical write/edit
tool, restrict shell to read-only git, and add an explicit rule never to edit files
via `Set-Content`/`sed`/`echo`. The general lesson: agents should use dedicated,
surgical file-editing tools, not shell text manipulation, which re-encodes and
clobbers. Give an agent exactly the tools its job needs — no more.

**Signal.** Diagnosing an agent failure to its root cause (tool availability, not
"the model messed up"), and hardening via least-privilege tooling.

### "How do you make sure knowledge isn't lost across sessions?"

**Answer.** Beyond externalizing into files, I formalized a **session-handoff
block** that a working session emits at the end (what changed, why, any
workflow/AI-usage lesson, and what's designed-but-not-built), which I pass to the
documentation agent so the *why* and the process lessons — the things that live in
conversation, not diffs — get captured, not just the code changes. I noticed the
gap when I realized my best interview material (how I worked) was the thing most
likely to evaporate, and I closed it by making capture a repeatable ritual.

**Signal.** Systems thinking about your own workflow; iterating on your tooling
when you spot a gap.

### "How do you verify AI-built features actually work — not just that they compile?"

**Answer.** For event-driven, non-deterministic (LLM) features, "compiles" is not
"works" — a green build can hide a real bug. When I shipped structured output, the
build passed and the happy path looked done, but the generated report was still
generic. What caught it was **hands-on testing plus inspecting persisted state**: I
dumped `chrome.storage.local` and saw that the structured `data` *was* being
captured on each card, but the report ignored it. That isolated a **stale-closure
React bug** — `handleActionClick` is a `useCallback` that deliberately omits
`learningContent` from its deps (so it doesn't re-create on every streamed chunk),
so the digest function read an empty closure snapshot and the report silently fell
back to generic. I fixed it with a ref that always mirrors the latest history. The
lesson: for these features, verify the *invisible half* — the state you persist and
the exact input you feed the model — because the visible half can look fine while
the data path is broken.

**Reinforced by the progress-tracking work (2026-09-04).** Same lesson, three more
bugs the compiler couldn't see, all caught only by dumping `chrome.storage.local`
and reading actual saved records: an **inflated attempt count** (a save click was
logged as a re-solve), a **stale-analysis projection** (the record took its
approach/complexity from the latest analysis instead of the report the user
saved), and a **"plaintext" language** (LeetCode leaves Monaco's model language as
`plaintext`, so the language field stored garbage until I made the toolbar fallback
run). None of these was a type error; a green build looked done. For any LLM-fed
data path, my rule is now: inspect the persisted state, not just compilation.

**Reinforced again by the guardrail-hardening pass (2026-09-24).** I shipped the
B1 pre-display gate; the build was green and the suite passed. Then I *exercised the
running extension* — the mandatory "eyeball the UI before commit" step — and three
real bugs fell out that no test had asserted: chat was blind to the editor code
(**B4** — "what's my time complexity?" returned "you didn't include your code"), the
gate's placeholder felt frozen on a 5–6s action (**B5**), and the complexity badge
split on nested parens (**B7** — `O(log(M) + log(N))` rendered half as a badge and
half as prose). A passing green build would have shipped all three. The lesson held:
**human-in-the-loop review after a green build is where the real bugs live** — so I
logged each in the standing bug registry and fixed it *with its own guard* before
committing.

**Signal.** Testing discipline for non-deterministic systems; knowing that type-
checking and the happy path don't cover data-flow/closure bugs; reaching for
persisted-state inspection as a debugging tool.

### "How do you keep AI-assisted work honest when the build is green — where do the real bugs come from?" ⭐

**Answer.** A green build and a passing suite are necessary, not sufficient — they
only prove the code does what a test *already asserts*, and an agent that wrote the
code and the tests together can leave whole behaviors unasserted. My habit is a hard
gate: **build → explain what changed → STOP and manually exercise the running
thing** before anything is committed. The clearest payoff was my guardrail-hardening
pass. I shipped one planned fix (B1, a pre-display gate that withholds a streaming
response behind a "thinking" placeholder until it clears the solution filter). Build
green, tests green. Then I *used* it, and three bugs the suite never saw surfaced:
free-form chat couldn't answer "what's my time complexity?" because it never sent the
editor code (B4); the placeholder felt frozen on a heavy 5–6s action (B5); and the
complexity badge split on nested parens like `O(log(M) + log(N))` (B7). None was a
type error. I treat those human-caught bugs as first-class: each became a row in a
**standing bug registry** and each got its own test/eval before I committed, so it
can't silently regress.

**Signal.** I don't equate "compiles + tests pass" with "correct" for interactive,
non-deterministic features. I structure the workflow (build → explain → stop →
eyeball) so a human catches what the suite can't, and I convert those catches into
durable guards instead of one-off fixes. It's a concrete, honest answer to "how do
you use AI effectively" — the AI writes fast, the human review is where quality
enters.

The pattern repeated on my next feature (chat intent-routing), which is the point —
it's not a one-off. The build was green and the router logic was correct, but
eyeballing the running extension exposed a cluster of things no assertion covers: my
**guardrail confirm banner overflowed the panel edge, blended into the background
(too quiet for an interrupt), and had copy that restated the obvious instead of
conveying the stakes** — all reworked (a vertical card, an amber "heads-up"
treatment, stakes-driven copy) only because a human looked. And exercising it
surfaced a genuine **data-loss bug unrelated to the feature**: "Reset this problem"
wiped a problem's whole history on a single accidental tap with no warning, now a
two-step confirm. Same lesson as the B4/B5/B7 catches — the review gate keeps
catching adjacent bugs a green build hides.

### "Isn't a passing spec/acceptance-criteria enough? When has 'it meets the spec and compiles' still not been good enough?" ⭐

**Answer.** No — a spec being satisfied is not the same as the UI being *good*, and
I have a concrete case. I ran a small pre-launch pass to curate my quick-action bar
from nine actions down to four (five of them were overlapping "understand the
problem" flavors I never used — my working principle is that *a never-used control
is a cost, not an asset*, so hiding them behind a "More" toggle had been treating a
curation problem as a layout problem). My first pass built a valid flat four-chip
row: build clean, eslint zero, tests 205/205, and it met every acceptance criterion
in the spec. Then I did what my workflow forces — build, explain, **stop, and
eyeball the running extension before committing** — and it felt off. Looking at it
surfaced two quality issues no test could catch: the flat flex-wrap gave a *ragged
row of unequal-width chips* that didn't align, and a leftover *context-aware
highlight* recolored buttons based on hidden editor state I couldn't even predict as
the user. Neither was in the spec. The fix — an equal-width 2×2 grid, one uniform
chip style, and removing that unpredictable highlight — was a **second-order
improvement the spec never asked for**, and it only existed because a human looked
at the running thing. A nice tail: deleting that one invisible highlight cascaded
into a real dead-code cleanup — a piece of React state, a callback, and its three
listeners existed *only* to feed it, so a UI change turned out to have a surprising
logic tail.

**Signal.** I don't treat "meets the spec + compiles + tests green" as "done" for
UI. The written acceptance criteria are a floor, not a ceiling; the human visual
gate catches quality the spec-author didn't think to encode. It's the same
green-build-honesty discipline as my guardrail pass, but sharper — there the suite
missed bugs; here the *spec itself* was satisfied and the UI was still wrong.

### "You retired a feature from the UI but say you kept it in the code. Why, and isn't that just dead code?" 

**Answer.** It's a deliberate **capability/entry-point separation.** When I
streamlined the action bar, I removed the five cut actions' *UI entry points* — the
buttons — but kept their *capabilities*: the `ActionType` values, their prompt /
message-building cases, and the generic action-dispatch path all stay intact. The
reason is sequencing: the very next spec is chat-intent-routing, which will route a
free-form message like "what's the pattern here?" to the matching action. If I'd
deleted the capabilities, I'd have to re-add and re-write them a spec later; by
dereferencing only the UI, routing gets built against the *real* surviving action
set instead of assumptions. I also sequenced the streamlining *before* routing on
purpose for the same reason — "verify, don't assume" applied to spec order, not just
code. It's documented as a temporary, accepted interim state (I'm the sole user), so
it's not silent dead code — it's a capability parked behind a soon-to-arrive entry
point.

**Signal.** Thinking about a control as a *capability* separate from its *surface*;
sequencing work so a later feature is built against reality; and being explicit that
"temporarily unreferenced by design, documented" is different from "dead code left
lying around."

### "You said you fixed a bug with an eval. How do you know the eval actually reproduced the bug?" ⭐

**Answer.** Because I made it fail *first*. When I closed a filter blind spot (B3 —
compact pseudocode that folds its `if` into the loop header slipped past the
"folded-conditional" detector), the honest move wasn't just "add a case and watch it
pass." My **first** fixture didn't reproduce the bug at all: it had line-leading
`if`/`else`/`return`, so the *old* heuristic already caught it — a green test that
proved nothing. I rewrote the fixture to the *real* folded shape, confirmed the eval
dropped from **100% to 85.7% catch rate BEFORE the fix** (with the leak actually
getting through), then made the fix and watched it climb back to **100% with FP still
0%**. Getting red-before-green here needed a throwaway probe, because vitest under
`env=node` suppresses `console.log` unless a test throws — so "verify the fixture
fails" was itself a small piece of work. The principle: **change a heuristic against
an eval, not a hunch** — and a characterization case that never failed against the
old code is theater, not evidence.

**Signal.** Test/eval discipline: I know a fixture has to reproduce the defect
(red-before-green) or the "eval-driven fix" claim is hollow; I tune guardrail
heuristics against a labeled confusion matrix rather than hand-editing a regex until
it looks right; and I'll build throwaway tooling to *prove* the red state when the
test harness hides output.

### "A labeled eval/test set — doesn't it just encode what you already believe? Give me a time it corrected *you*." ⭐

**Answer.** Twice, actually, and the second is the subtle one. The obvious time: my
guardrail eval scored **62.5% on its first run** and found two real leak paths my
intuition had missed. The subtler time was on the E9 build, when I expanded the
router's golden set. I added a follow-up fixture, *"what about the edge case I
mentioned?"*, and labeled it as expected to **fall through to chat**. The test
**failed** — the classifier routed it to `GENERATE_EXAMPLES`, because *"edge case"*
is a generate-examples keyword. My first instinct was "the classifier is wrong," but
the classifier was **right**: a message literally asking about edge cases is a
reasonable examples request. The bug was my **label** — I'd written a fixture whose
wording contradicted my intent. I fixed it by rephrasing the follow-up to be
keyword-free, so it tests the behavior I actually meant. The lesson: a labeled eval
doesn't just catch the code's mistakes, it **catches *your* mislabels** — the moment
your assumption and the data disagree, one of them is wrong and you have to find out
which, rather than reflexively "fixing" the code to match a bad label.

**Signal.** I treat a labeled set as an independent check on *my own* assumptions,
not a rubber stamp — including the humility to conclude the test author (me) was
wrong and the system was right, which is exactly what makes an eval evidence instead
of theater.

### "You wrote the tests after the code — with an agent. How do you know they aren't just rubber-stamping the existing behavior?"

**Answer.** This is the real risk of characterization tests (and doubly so when an
agent writes them after reading the implementation): you can accidentally assert
"whatever the code currently returns," which passes by construction and proves
nothing. I guard against it three ways. **First, anchor assertions to the stated
contract and boundary values, not the observed output** — e.g. "a code block over
14 lines is blocked, 14 passes" comes from the design rule, so a test failing there
means the *code* is wrong, not the test. **Second, include cases the author might
not have thought about** — malformed JSON, day-boundary rollover, cooldown windows,
loop-embedded conditionals — so the suite probes behavior rather than mirroring it.
**Third, and most convincing: a separate eval on an independent labeled set.** My
guardrail eval scored the filter at **62.5% catch rate on the first run and found
two real leak bugs** — proof the tests weren't just photographs of working code,
because the measurement disagreed with my assumptions and I had to fix the code.

I'm also honest about the residual bias: an agent that just read the implementation
carries *some* bias no matter how careful, and my eval dataset is author-generated,
which flatters the recall number. The mitigations are exactly the ones above plus
feeding in real captured responses and an independent judge — which is why I built
the eval to ingest both.

**Signal.** Understanding *why* after-the-fact and agent-written tests can be weak,
and having concrete practices (contract-anchored assertions, adversarial cases, an
independent eval) that turn them back into real evidence — plus honesty about the
bias that remains.

### "How do you avoid building on stale assumptions when working with an agent?"

**Answer.** "Verify, don't assume" — reconcile design docs against shipped code
before building on them. When I started progress tracking, the design doc described
patterns and complexity with an illustrative kebab-case schema, but the
structured-output layer I'd already shipped used a Title-Case `ProblemPattern`
vocabulary and a `{time, space}` complexity object. The doc had **drifted** from
the code. If I'd coded to the doc, I'd have built a needless translation layer and
a second, conflicting pattern vocabulary. Instead I aligned the new records to the
*shipped* types and updated the design doc to match. The general discipline — the
same one that caught the `gemini-2.5-*` model-name 404 — is that a plausible-looking
spec (or an agent's confident summary of one) is not ground truth; the running code
is, so I check it before I build.

A sharper version showed up while building chat intent-routing. I noticed a
structured-response section header rendered as "Real-Year Analogy" when the prompt
specifies "Real-World Analogy," and my first instinct was that the headers are
hardcoded/deterministic — so the corruption must be a renderer bug worth chasing.
Before acting on that, I **traced the actual render path** and found the opposite:
the section headers are **model-generated from prompt instructions**, and the only
text transform my renderer applies (the n→N/superscript normalization) runs *inside*
`O(...)` complexity segments, never on heading words. So the corruption is model
output, not a code bug — which changes the fix entirely (heading canonicalization or
prompt hardening, not a renderer patch). I logged it as a deferred bug (B9) rather
than fixing it in a spec that must not touch prompts. The lesson: before assuming
"this is deterministic, so a wrong value means a code bug," verify *whether it's
actually deterministic* against the code path.

**Signal.** Treating specs and agent output as fallible; reconciling documentation
drift toward the source of truth; avoiding accidental duplication/translation
layers; and — the routing example — checking whether a value is even
deterministic before diagnosing it as a code bug, so effort goes to the real cause.

### "How do you decide what an LLM should produce versus what your code should own?"

**Answer.** A rule I keep coming back to: **the model owns judgments; the system
owns facts.** In the progress tracker, the model produces the judgments it's
actually good at — the algorithmic patterns, the complexity assessment, the
narrative summary — and those get captured as structured data. But facts the app
already holds — the date, the problem title, difficulty, the editor language — the
app injects or stamps itself; I never ask the model to reproduce them. Concretely,
the report used to print a model-written date, which is a guessed, unreliable fact;
I removed it and let the app timestamp the saved attempt. This also keeps the model
honest about uncertainty: because the app can't verify a submission passed, I don't
show an authoritative "attempts" count or claim a solution is optimal unless the
model explicitly flagged it — inferred data is presented *as* inferred (a
confidence badge, a withheld count), never as verified.

**Signal.** Clear division of responsibility between a probabilistic component and
deterministic code; not asking the model to do something the system can do reliably;
honest UX for uncertain data.

### "An LLM feature gives wrong output. How do you debug it?"

**Answer.** Instrument the **exact input** first — don't tune the prompt blind. My
"generic report" symptom had two very different causes: an *empty* digest (a wiring
bug) or an *ignored* digest (a prompt-strength problem), and they need opposite
fixes. I added a temporary `console.log` of the precise digest text being sent. It
showed a populated digest → so the wiring was fine and it was prompt strength →
I reworked the prompt to foreground the session-activity block. Removed the log
before commit. The general principle: when a probabilistic component misbehaves,
make its input observable so you can tell a *plumbing* failure from a *prompting*
failure — otherwise you're guessing against a non-deterministic system.

**Signal.** Systematic debugging of LLM features; turning an ambiguous symptom into
a decisive two-way diagnosis by instrumenting the input; cleaning up diagnostics
before committing.

### "When you add a security mitigation, how do you know it actually works?"

**Answer.** I encode the security *property* as a CI-gated assertion — not just the
happy path — and ideally prove it from **both** sides of the defense. When I
hardened the prompts against injection (2026-09-21), the mitigation was structural
separation (fence untrusted problem text/code as DATA, reassert the guardrail
after it) backed by the existing deterministic output filter. I tested it two ways:
a **unit test** asserts, for every action, that the framing is present and an
injected payload placed in the problem text stays *inside* the fence (it can't
escape into the instruction section); and an **eval case** simulates a *successful*
injection — the model obeyed and dumped a solution — and asserts the output filter
*still* catches the leak. So one test proves the input framing holds; the other
proves the backstop holds even when framing fails. The reasoning: input framing is
a *soft* control an LLM can be talked around, so the assertion that actually
guarantees the invariant is the one on the output. A mitigation you don't turn into
a test is one you'll silently regress — this is what moved my prompt-injection story
(Q4) from "here's what I'd harden" to "here's what I did, and here's the failing
test that would catch a regression."

**Signal.** Testing the security invariant rather than trusting the mitigation;
understanding soft (prompt) vs. hard (deterministic) controls and asserting on the
hard one; defense-in-depth verified on both sides, wired into the CI gate.

### "Any environment-specific tooling gotchas working on this project?"

**Answer.** Yes — the local shell (PowerShell on Windows) garbles command *echo*
and **UTF-16-encodes redirected output**, which quietly breaks two things: reading
build/test results back, and writing multi-line git commit messages. So my reliable
verification path is to **redirect build/test/commit output to a temp file, read it
back, then delete the temp file** (and for commits, write the message to a temp file
and use `git commit -F` rather than a multi-line `-m`). It's a small thing, but it's
the difference between "I think the build passed" and actually reading the
`built in <N>ms` line. The broader habit: know the failure modes of your own
toolchain and build a repeatable workaround, rather than fighting the same garbled
output every session.

**Signal.** Pragmatic toolchain awareness; establishing a reliable verify-then-clean-up
ritual instead of trusting flaky terminal output.

**Extended by the E9 build (2026-10-01) — don't fight a slow hook through a terminal
that can't report completion.** My pre-commit hook runs lint+test+build (~40s), and
the terminal wrapper returns a garbled `-1` without cleanly signalling when a long
command finishes. Combined, I couldn't tell whether a commit had landed, and my first
workaround — *backgrounding* `git commit` — made it worse: several zombie processes
piled up and **fought over git's `index.lock`, blocking the commits**, and I even
introduced a duplicate-import bug the hook correctly rejected. The fix that worked:
**verify lint+test+build once up front** (one clean pass — 329 tests, build green),
then commit the batch of logical commits with `git commit --no-verify` — which the
repo's own `.husky/pre-commit` explicitly sanctions as the "in a pinch" bypass, with
**CI as the real gate on push.** The last few commits then took seconds instead of
40s each. The lesson: pay a slow gate *once*, not per-commit, when the terminal can't
tell you a command finished — and clean up background processes rather than letting
them accumulate on a shared resource like the git index.

**Signal.** Knowing a repo's *sanctioned* bypass and its real gate (local hook = fast
local check, CI = the authority on push), and recognizing that a "clever" workaround
(backgrounding a committing process) can be worse than the friction it's dodging.

### "You edit files while I have my editor open. What goes wrong, and how do you prevent it?" ⭐

**Answer.** A real one bit me on the E9 build. I rewrote `App.tsx` on disk while the
user still had that file **open** in their editor. Later the editor's **stale
in-memory buffer got saved over my changes**, silently **reverting an entire feature
rewrite** (the chat-submit handler, a header-to-bottom-bar UI move, and the imports) —
and *only* that one file, because it was the only one open; every other file I'd
edited survived. Nothing errored; the build was still green on the reverted code. I
caught it only because the *running extension* still showed the old usage counter
("3/200") that my change was supposed to replace — i.e. by eyeballing behavior, not
by trusting the files. The fix was procedural: re-apply the edits, and keep files an
agent is editing **closed** in the editor (or use Revert File / reopen to keep the
disk version and discard the buffer). The deeper point: when two writers (an agent on
disk, a human's editor buffer) touch the same file, last-save-wins can silently clobber
work, and the compiler won't tell you because the clobbered state still compiles.

**Signal.** Awareness of a concrete agent/human collaboration hazard (disk vs. editor
buffer, last-writer-wins) and a simple preventive protocol; and — again — catching a
silent regression by observing *runtime behavior*, not by trusting a green build or
the file on disk.

### "Tell me about a bug your tests missed that real data caught." ⭐

**Answer.** When I built progress import, my first-pass string sanitizer
HTML-**escaped** all five entities (`'` → `&#39;`, `&` → `&amp;`, and so on). Every
synthetic unit test passed, because my fixtures used clean text. Then I wrote a
**round-trip test that loaded my own real 13-problem export** — and it caught the bug
immediately: real study notes are full of apostrophes ("element's", "key's"), and
escaping isn't **idempotent**, so an export → import → export → import cycle
progressively double-escaped (`element's` → `element&#39;s` → `element&amp;#39;s`),
corrupting legit prose and showing literal entities in the UI. Import is a transform
that can run repeatedly on its own output, so **idempotency is a first-class
correctness property** for it — and that's exactly the property clean synthetic
inputs don't exercise. The fix was telling: I **reduced scope instead of adding more
escaping.** Since I'd already verified the renderer is XSS-safe (React JSX, no
`innerHTML`), the importer only needs to stop HTML *tags* from forming — so I strip
only the tag-forming `<`/`>`, which is idempotent and lossless for apostrophes and
ampersands. Over-sanitizing *was* the bug; the minimal transform was both
safety-equivalent and idempotent. I documented the one honest trade: a literal `>` in
prose ("timestamp > mid") loses that char — acceptable and safe.

**Signal.** Round-trip / property tests against real data beat more unit tests with
convenient inputs; I know to look for idempotency on any re-runnable transform; and
my instinct for a sanitizer bug was to make the transform *smaller and provably
safe*, not to pile on more escaping.

### "When you add a safety guarantee, how do you make it as strong as possible — and when do you validate a field before it's even used?" ⭐

**Answer.** Two habits, both from the same import work. First, **platform-enforced
beats discipline-enforced.** My code never evals or executes file content — but
that's a promise I'm making. I moved it into an explicit manifest **CSP**
(`script-src 'self'; object-src 'self'; base-uri 'self'`), so now the *browser*
forbids script injection on the extension page even if a future bug introduces a
sink. When a guarantee can move from "we promise we never do X" to "the platform
forbids X," that's strictly stronger, and it costs almost nothing. Second,
**validate a field before it has a dangerous consumer.** The imported record carries
a `url` that nothing renders as a link today — so an unvalidated url is harmless
*right now*. I was going to defer validating it, but I realized a planned "open on
LeetCode from My Progress" link would silently turn an unvalidated
`javascript:`/off-domain url into a live clickjack/XSS vector the day it ships. So I
validated it now — it must be an `https://leetcode.com/problems/<slug>/…` url matching
the record's own slug, else it's rebuilt from the trusted slug — closing the hole
*before* the consumer that would weaponize it exists.

**Signal.** I reach for structural, platform-level enforcement over convention when
it's available; and I think about new ingress paths (an import) *and* anticipated
egress paths (a future link) when deciding what to validate — paying a cheap check
now to avoid a scramble later. Pair with **Q12** (the import threat model) and
**Q4** (prompt injection).

### "Tell me about a time you were stuck in a loop with the agent — how did you break out?" ⭐

**Answer.** During a chat-polish session the user wanted a persistent, terminal-style
blinking cursor *inside* the chat input when it was unfocused. I tried it, and it
fought me on two fronts. First it **wouldn't blink** — and the root cause wasn't a
bug, it was my own code behaving correctly: the user had `prefers-reduced-motion`
effectively on (Windows energy-saver), and my reduced-motion CSS *deliberately* makes
decorative motion static, so the caret was static *by design*. Second, the
placeholder **jumped on focus**, because my decorative caret (absolutely positioned)
and the real browser text caret sat at different x-positions depending on padding — I
chased it with padding swaps and made it worse. After the second failed attempt I
**stopped patching and named the root cause out loud**: this element is fighting *two
platform defaults at once* — the reduced-motion setting kills its whole reason to
exist (the blink), and the real OS text caret is white and can't be recolored to the
theme, so a second fake caret will always risk a visual mismatch. I surfaced that
tradeoff to the user and recommended dropping the decorative caret for the
conventional rotating-placeholder affordance. The user decided to **keep** it (static
is fine) *and* bring back the rotating placeholder; the actual fix was then trivial —
one constant padding value so the decorative and real carets share an x, no jump.

**Signal.** I apply the "if an approach fails twice, diagnose the root cause rather
than patch a third time" discipline literally. The valuable move wasn't a clever CSS
trick — it was recognizing a **failure loop**, attributing it to *fighting platform
defaults* (reduced-motion + the un-styleable OS caret) rather than to a fixable bug,
and handing the user an honest tradeoff instead of burning more attempts. It's also a
small lesson that a decorative element that doesn't earn its complexity is worth
dropping — and that it's the user's call to make, not mine to force either way.

### "A feature started throwing errors right after your change. How did you tell a real regression from an unrelated failure — and own the part that *was* yours?" ⭐

**Answer.** Mid-review of a visual-polish change, every request started failing with
a raw `API Error 503`. The lazy read is "I just changed things, I broke it." I didn't
assume that — I checked the DevTools console and saw `generativelanguage.g.../chat/
completions` itself returning 503, which is Google's Gemini **free tier being
overloaded**, an upstream condition. My change was presentation-only and never touched
the request path, so I told the user plainly: **this specific error is not a
regression from my work.** But I didn't stop at "not my fault" — investigating the
503 exposed two *real* latent weaknesses worth fixing: users were seeing raw technical
error codes, and the streaming path did a bare `fetch` with **no retry**, so a
transient 5xx failed hard. I fixed both (a typed `APIError` with a `retryable` flag +
friendly per-status copy, transient-5xx retry with backoff). Then the user hit a
*second* error — `signal is aborted without reason` — and this one **I had
introduced** with the retry change: a raw abort/timeout `DOMException` leaking to the
UI. I owned it and added a `humanizeTransportError` boundary. And I caught that my
*first* fix was **incomplete** — I'd wrapped only the streaming generator, but the
chat path's non-streaming `sendToolRound` had no catch, so the abort still leaked when
the user asked a chat question. I added the same boundary there. The honest caveat I
kept in the docs: I was never able to confirm a *successful* end-to-end call that
session because the free tier stayed overloaded, so the error *handling* is
unit-tested but the happy path wasn't seen live.

**Signal.** I separate "my change regressed this" from "an upstream dependency is
failing" with evidence (the console), instead of either reflexively blaming myself or
reflexively blaming the service — and I still mine an upstream failure for the real
local weaknesses it reveals. And when a bug genuinely *is* mine, I say so, and I check
whether my fix is *complete* (both the streaming and non-streaming paths) rather than
declaring victory after the first obvious spot. The honesty extends to the docs: I
don't let "error handling verified" quietly become "feature verified working."

### "Give me an example of deciding something should NOT be an LLM call." ⭐

**Answer.** Testing the chat, the user asked it "what all can you do?" — and watched
it route into the **agentic loop**, spending an actual API request (and risking the
free-tier overload) to describe the app's own features. The insight is a cost one: a
capabilities / how-to-use answer is **static** — it doesn't depend on the user's code
or problem — so paying a model call (and a loop) to generate it is pure waste on a
200-request/day budget. The right answer is **client-side, zero tokens**: the app
already *has* a "what is LeetSage / how to use it" surface — the onboarding
`WelcomeCard` I'd just built — so a capabilities question should pop that card, not
call the model. I deferred actually building it, honestly, because the fix lives in
territory that spec had promised not to touch (it needs an intent-router rule or a
chat-prompt change), and I documented the candidate design (a local "help" intent,
guarded by a golden-set case) for a small follow-up spec rather than scope-creeping.

**Signal.** Cost-awareness as a design instinct — "not everything is an LLM call,"
especially on a free-tier budget — and recognizing when the correct response is a
*static, local* answer wired to an existing surface. Plus the discipline to *defer*
the fix cleanly (documented, scoped to a follow-up) when it would otherwise violate
the current spec's boundaries, rather than reaching across them mid-session.

### "Have you ever skipped the full spec process on purpose? How do you decide?"

**Answer.** Yes, deliberately and in writing. My project's convention is to scale
spec rigor to feature complexity: a substantial feature gets the full requirements →
design → tasks trilogy with sign-off between phases, but a small, well-understood,
UI-focused change can be a single design-only spec — *as long as the deviation is
documented, not silent.* For the chat-polish work (visual gradient, motion,
onboarding, two small routing bugs) I wrote **one design-only spec with a note at the
top stating why**: the scope was an enumerated checklist, the requirements were
self-evident from it, it was almost entirely presentational, and it folded three
roadmap items that all lived on the same chat surface and overlapped heavily. A full
trilogy would have been ceremony out of proportion to the work. The thing I guard
against isn't skipping — it's *silent* skipping (undocumented drift).

**Signal.** I treat process as a tool scaled to the problem, not a ritual performed
for its own sake — and I know the honest interview answer is "I scaled rigor to
complexity and documented the deviation," which is stronger than pretending every
change got a full trilogy. Pairs with the E9 answer in "working with AI agents" where
the *opposite* call was right (a big agentic feature that earned the full trilogy).

---

## Behavioral / judgment questions

- **"Why did you build this?"** Genuine: I use it for my own LeetCode practice, and
  I wanted a tool that teaches instead of spoiling. (Authentic motivation reads
  well.)
- **"What would you do differently?"** Add evals and tests from the *start* rather
  than after the fact — I added them later (2026-09-15) and, tellingly, the eval
  immediately found two real leak bugs, which is exactly the regression net earlier
  tests would have been. Also: narrow extension permissions earlier, and instrument
  runtime metrics sooner so I could quote latency/cost numbers.
- **"What are you most proud of?"** The guardrail — turning a fuzzy product promise
  ("don't give the answer") into a concrete, layered, testable mechanism — *and* the
  eval that measured it and caught two real leaks my intuition had missed. A close
  second is the E9 agentic chat (2026-10-01): a three-tier, cost-aware tool loop
  with per-round request accounting and an unbypassable guardrail, built as a
  client-side control loop sized to the product's free/BYOK/no-backend constraints
  rather than reached for off a framework shelf — and I was honest in the docs that
  the loop is a rare fallback, kept because the bounded-agent machinery is the
  correct part even when it rarely fires.
- **"What's the biggest weakness right now?"** No **runtime** metrics yet
  (latency, tokens/request, cost) — I have quality numbers from the guardrail eval
  (catch rate / false-positive rate) but not production numbers, so I can quantify
  *correctness* but not yet *cost/latency*. And my eval dataset is author-generated,
  so its catch rate is an optimistic regression gate, not a validated real-world
  recall — I know exactly how I'd close both (instrument metrics; feed in real
  captured responses + a validated judge).

---

## Mock interview bank (have someone ask these cold)

**Warm-up:** Pitch LeetSage in 60 seconds. · What problem does it solve? · Who's
the user?

**Architecture:** Draw the components and how they communicate. · Why no backend? ·
Walk me through what happens from clicking "Hint" to seeing text. · Where does
state live? · Walk me through the progress-tracking data model and its tradeoffs
(→ Q9).

**AI-specific:** How do you stop it revealing solutions? · How do you *evaluate*
that guardrail, and what did the eval find? (→ Q3a). · Are you exposed to prompt
injection? · How do you control cost? · Why only two models, and the two cheapest —
why not let power users pick a better one? (→ Q5b). · Tell me about an architecture
decision you made and why (→ structured output, Q8). · How do you get reliable
structured data out of a non-deterministic model while still streaming? · Make your
chat agentic — how do you add tool-use without blowing the cost budget or the safety
guarantee? (→ Q13). · What's the difference between "context" and "requests" in your
cost model, and why does it matter? · Why did you *drop* a tool from your allowlist?

**Working with agents:** How do you work effectively with coding agents? · Tell me
about a time you constrained or debugged an agent's behavior. · How do you keep
knowledge from being lost across sessions? · How do you verify an AI-built feature
actually works, not just compiles? · How do you know agent-written, after-the-fact
tests aren't just rubber-stamping the code? · Give me a time a labeled eval/test set
corrected *you*, not the code. · How do you avoid building on stale assumptions
(spec vs. code drift)? · How do you decide what an LLM should produce vs. what your
code owns? · An LLM feature gives wrong output — how do you debug it? · What goes
wrong when an agent edits files you have open? · When a slow pre-commit hook fights
a flaky terminal, how do you still commit safely?

**Depth probes:** Why `chrome.storage.local` and not `sync`? · What breaks if the
service worker sleeps mid-request? · How do you keep chat history per problem? ·
Why the OpenAI-compat endpoint over the native SDK?

**Stretch (system design):** "Now imagine 1M users and you want managed keys +
cross-device sync + analytics. Design the backend." (Walk: auth, key-broker proxy,
per-user quota, caching, model routing, cost controls, data store, privacy.)

---

*Update this as the project grows. When you add evals, tests, or metrics, add the
numbers here — quantified answers beat qualitative ones every time.*
