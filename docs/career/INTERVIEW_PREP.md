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

**Signal.** Testing discipline for non-deterministic systems; knowing that type-
checking and the happy path don't cover data-flow/closure bugs; reaching for
persisted-state inspection as a debugging tool.

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

**Signal.** Treating specs and agent output as fallible; reconciling documentation
drift toward the source of truth; avoiding accidental duplication/translation
layers.

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
  eval that measured it and caught two real leaks my intuition had missed.
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
injection? · How do you control cost? · Tell me about an architecture decision you
made and why (→ structured output, Q8). · How do you get reliable structured data
out of a non-deterministic model while still streaming?

**Working with agents:** How do you work effectively with coding agents? · Tell me
about a time you constrained or debugged an agent's behavior. · How do you keep
knowledge from being lost across sessions? · How do you verify an AI-built feature
actually works, not just compiles? · How do you know agent-written, after-the-fact
tests aren't just rubber-stamping the code? · How do you avoid building on stale
assumptions (spec vs. code drift)? · How do you decide what an LLM should produce
vs. what your code owns? · An LLM feature gives wrong output — how do you debug it?

**Depth probes:** Why `chrome.storage.local` and not `sync`? · What breaks if the
service worker sleeps mid-request? · How do you keep chat history per problem? ·
Why the OpenAI-compat endpoint over the native SDK?

**Stretch (system design):** "Now imagine 1M users and you want managed keys +
cross-device sync + analytics. Design the backend." (Walk: auth, key-broker proxy,
per-user quota, caching, model routing, cost controls, data store, privacy.)

---

*Update this as the project grows. When you add evals, tests, or metrics, add the
numbers here — quantified answers beat qualitative ones every time.*
