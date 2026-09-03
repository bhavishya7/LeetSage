# LeetSage — Structured Output: Design & System-Design Guide

> **Status:** Design captured, not yet built. This is the **enabling backbone** for
> high-quality report generation, persistent progress records, cross-problem
> analytics, and evals. It should be built **before (or alongside)** Progress
> Tracking Phase B, because those features want to read structured data, not
> re-parse prose.
>
> Companion docs:
> [../leetsage-progress-tracking/design.md](../leetsage-progress-tracking/design.md) ·
> [../../../docs/career/LEARNING_ROADMAP.md](../../../docs/career/LEARNING_ROADMAP.md) ·
> [../../../docs/career/INTERVIEW_PREP.md](../../../docs/career/INTERVIEW_PREP.md) ·
> [../../../docs/career/DESIGN_DECISIONS.md](../../../docs/career/DESIGN_DECISIONS.md)

---

## 0. How to read this doc

Same format as the progress-tracking design: each section has a **DESIGN** layer
(what to build) and a **📚 SYSTEM-DESIGN LESSON** (the transferable concept, for
interviews and for applying elsewhere).

---

## 1. The problem this solves

Today every LeetSage action returns **freeform Markdown prose**. That reads well
for a human, but it's *opaque to other code*. When the "Generate report" feature
tried to summarize a session, it had only two options — both bad:

1. Re-feed the entire prose transcript back to the LLM (token-heavy; the model has
   to re-parse its *own* earlier prose to recover facts like "what complexity did
   it find?").
2. Feed nothing → the report falls back to a generic, textbook writeup of the
   optimal solution, ignoring the user's actual hour of work. **(This is the bug we
   observed.)**

The root cause is architectural: **responses carry no machine-readable data, only
prose.** So downstream consumers (report, records, analytics, evals) can't reliably
extract what happened.

> 📚 **SYSTEM-DESIGN LESSON — "separate data from presentation."** Prose is a
> *rendering* of information, not the information itself. When a system only
> produces the rendering, every other component is forced to reverse-engineer the
> data back out (scraping, regex, re-summarizing). The fix is to make the
> structured data the primary artifact and treat the human-readable text as one
> view of it. This is the same principle behind returning JSON from an API instead
> of an HTML page, or separating a model from its template.

---

## 2. The core idea: a hybrid prose + data response

Each structured action returns BOTH:
- **`prose`** — the nicely-formatted Markdown the user reads today (unchanged UX).
- **`data`** — a small, schema-conforming object with the facts other code needs.

```ts
interface StructuredResponse<T> {
  prose: string;   // what the user sees (rendered as today)
  data: T;         // machine-readable facts for report / records / analytics
}
```

The `data` block is tiny (a few hundred tokens at most) and is what the report,
progress records, and analytics consume — never the prose.

> 📚 **SYSTEM-DESIGN LESSON — "one source, many consumers."** Once `data` exists,
> multiple features consume the *same* structured facts: the report aggregates
> them, the progress record persists them, analytics groups by them, evals assert
> on them, and the solution-filter could inspect them. Designing a clean shared
> data contract once, and letting many consumers read it, beats each feature
> re-deriving facts independently. This is "single source of truth."

---

## 3. Schema-per-action (structure only what's needed)

Do **not** convert all ~9 actions at once. Structure only the actions whose facts
the report/records actually need. Start here:

### 3.1 `CHECK_APPROACH` (Analyze my code)
```ts
interface AnalyzeData {
  approachDetected: string;          // "brute-force nested loop"
  currentComplexity: { time: string; space: string };
  optimalComplexity: { time: string; space: string };
  issues: string[];                  // style / correctness-risk notes
  onOptimalPath: boolean;            // is their approach heading toward optimal?
}
```

### 3.2 `UNDERSTAND_SOLUTION` (optimal explanation)
```ts
interface UnderstandData {
  patterns: ProblemPattern[];        // fixed vocabulary (see progress-tracking design)
  keyInsight: string;                // the "aha"
  optimalComplexity: { time: string; space: string };
}
```

### 3.3 `GENERATE_REPORT` (consumes the above)
The report is special: it's a **consumer**, not a producer of new facts. It reads
the session's structured `data` blocks + final code and assembles the report. Its
own structured output is the record fields (patterns, complexity, summaries) that
feed `ProblemRecord` (see §5).

### 3.4 Hint level
Already tracked as `hintLevel` — no new schema needed; the report reads it directly.

**Leave as prose for now:** `GET_HINT` body, `GENERATE_EXAMPLES`, `EXPLAIN_CONCEPT`,
`TIME_COMPLEXITY_HINT`, `PATTERN_RECOGNITION`. They don't feed the report yet;
structure them later if a consumer needs them.

> 📚 **SYSTEM-DESIGN LESSON — "incremental migration, driven by consumers."** You
> don't schematize everything speculatively — you structure a field when a consumer
> needs it. This keeps scope tight and avoids designing schemas nobody reads.
> Real systems evolve contracts the same way: add structure where there's demand,
> leave the rest flexible.

---

## 4. Where the structured data lives (storage link)

`LearningContent.metadata` already exists and is already persisted into
`ProgressState.contentHistory` (per-problem, across sessions). The structured
`data` block for each action gets stored there:

```ts
interface ContentMetadata {
  // ...existing fields...
  structured?: AnalyzeData | UnderstandData | /* ... */;  // the action's data block
}
```

So the report reads `learningContent[*].metadata.structured` from the current
session (and `contentHistory` for persistence) — no re-fetching, no re-parsing.

> 📚 **SYSTEM-DESIGN LESSON — "reuse the existing carrier."** `metadata` and
> `contentHistory` are already threaded through state and storage. Attaching the
> new structured data to the existing carrier (rather than inventing a parallel
> store) keeps the persistence path and the data path unified — fewer moving
> parts, less that can drift out of sync.

---

## 5. How this makes the report actually good

With structured data in hand, "Generate report" builds a compact, factual
**session digest** deterministically (no LLM re-summarization needed to extract
facts):

> "Hints used: 3 (reached implementation level). Analyzed code twice — first
> attempt brute-force O(N²)/O(1), second reached O(N)/O(N) with a hash set.
> Pattern: sliding-window. 2 chat questions (both about when to shrink the
> window). Final complexity O(N)/O(min(N,M))."

That digest + the final code is what the report LLM call receives — small,
relevant, and grounded in *what the user actually did*. It captures the journey,
not a textbook page.

**And the same structured fields directly populate a `ProblemRecord.attempts[]`
entry** (patterns, complexity, approach summary) — so structured output isn't just
for the report, it's the raw material for the whole progress-tracking data model.

> 📚 **SYSTEM-DESIGN LESSON — "compute the summary at the source, not at read
> time."** Building a small structured digest as each action completes (write-time)
> is cheaper and more reliable than reconstructing it from prose when the report is
> requested (read-time). This mirrors precomputed aggregates / materialized views:
> do the expensive normalization once, near the source, and keep reads cheap.

---

## 6. The hard decisions to resolve before building

These are genuine engineering tradeoffs — not assumptions. Resolve them at build
time; do NOT guess (see the model-name lesson in DESIGN_DECISIONS.md ADR-005).

### 6.1 How to get reliable JSON out of Gemini
- **Option A:** Use a JSON / response-schema mode if the OpenAI-compatible endpoint
  exposes it (e.g. `response_format`). **VERIFY availability against current
  provider docs before relying on it.**
- **Option B:** Prompt for JSON in a fenced block + parse client-side, with a
  **fallback**: if parsing fails, degrade gracefully to prose-only (never crash the
  card).
- **Recommendation:** try A; keep B's tolerant-parse-with-fallback as the safety
  net regardless.

> 📚 **SYSTEM-DESIGN LESSON — "never trust an external boundary; validate and
> degrade."** The model can emit malformed JSON. Parse defensively, validate
> against the schema, and have a defined fallback (prose-only) so a bad parse
> downgrades the feature instead of breaking the UI. Same as validating any
> third-party API response.

### 6.2 Streaming vs. structured output (a real tension)
Today the UI **streams tokens** for responsive UX. You can't parse JSON until it's
complete, so streaming and guaranteed-valid-JSON conflict.
- **Recommendation:** stream the `prose` for a responsive read, and finalize the
  small `data` block at the end of the stream (parse once complete). Or, for the
  few structured actions, accept a non-streamed response since `data` is small.
- Keep the human-facing prose streaming so the felt experience is unchanged.

> 📚 **SYSTEM-DESIGN LESSON — "incremental vs. atomic outputs."** Streaming is
> incremental (great for perceived latency); structured parsing needs the whole
> payload (atomic). Many systems split a response into a streamed human part and a
> finalized machine part — the same reason a page streams content but finalizes a
> checksum/metadata at the end.

### 6.3 Keeping prose and data consistent
Two representations of the same facts can disagree (data says O(N), prose says
O(N²)).
- **Recommendation:** treat `data` as the source of truth for facts, and instruct
  the model that the prose must match the data. Longer term, some prose (like the
  complexity line) could be *rendered from* `data` client-side to guarantee
  consistency.

> 📚 **SYSTEM-DESIGN LESSON — "single source of truth avoids divergence."** When the
> same fact lives in two places, they drift. Either derive one from the other, or
> designate one authoritative. This is the same reasoning behind normalization and
> "don't store what you can compute."

---

## 7. Why this is worth doing now (and the payoff)

Structured output is not one feature — it's the **backbone** that de-risks four
roadmap items at once:
- **Report** becomes session-aware and genuinely useful (fixes the observed bug).
- **Progress records** populate directly from structured fields — no fragile
  prose-scraping, no extra LLM extraction call.
- **Analytics** ("weakest link") groups on reliable structured `patterns` /
  complexity fields.
- **Evals** assert on `data.currentComplexity.time === "O(N^2)"` instead of
  regex-matching prose — dramatically easier and more reliable.

Building progress-tracking on freeform prose first would mean fragile extraction
now and a rip-out later. Doing structured output first means each later feature is
a clean consumer of a stable contract.

> 📚 **SYSTEM-DESIGN LESSON — "identify the load-bearing wall."** Some pieces of a
> system enable many others. Investing in the shared primitive (here: a structured
> response contract) before the features that depend on it avoids building those
> features twice. Recognizing that ordering *is* the design skill.

---

## 8. Recommended build scope (tight, incremental)

1. Define `StructuredResponse<T>` and the per-action `data` schemas for
   `CHECK_APPROACH` and `UNDERSTAND_SOLUTION` only (§3).
2. Update those two prompts to return prose + a `data` JSON block; add
   tolerant parsing with prose-only fallback (§6.1).
3. Store `data` on `ContentMetadata.structured` (§4).
4. Resolve streaming handling for these two actions (§6.2).
5. Rework "Generate report" to build a deterministic session digest from the
   stored structured data + final code (§5).
6. (Then, in progress-tracking Phase B) populate `ProblemRecord.attempts[]` from
   the same structured fields.

Structure more actions later only when a consumer needs them.

---

## 9. Interview headline

> "I noticed my session-report feature produced generic writeups because responses
> were freeform prose with no machine-readable data. So I introduced a hybrid
> response — human prose plus a small structured data block — which turned every
> action into a single source of truth that the report, the persistent progress
> records, the analytics, and the evals all consume. I had to resolve the
> streaming-vs-structured-parsing tension and add tolerant JSON parsing with a
> prose-only fallback so a bad model response degrades instead of breaking."

That answer demonstrates: recognizing an architectural root cause, separation of
concerns / single source of truth, incremental migration, and defensive handling
of a non-deterministic boundary — exactly the 2026 AI-engineering signals.
