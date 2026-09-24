# LeetSage — Runtime Metrics Instrumentation (design)

> **Spec scope: design-only.** Per `.kiro/steering/workflow.md` → "Spec
> discipline", this is a small, well-understood change: it mirrors an existing
> local-counter pattern (`storage.ts` / `rate-limiter.ts`), adds pure
> aggregation functions, and surfaces a small read-only stats panel. The
> requirements are self-evident (record per-request latency/tokens/cost, aggregate
> them locally, show the numbers) and the task breakdown is short, so
> **requirements and tasks are folded into this one document** rather than split
> into the full trilogy. If implementation reveals the scope is larger than
> expected (e.g. the streaming token-capture turns out to need a background-worker
> redesign), stop and confirm with the user before expanding to a full
> requirements → design → tasks trilogy.

---

## 1. Goal & motivation

Record lightweight, per-request runtime metrics entirely client-side and make the
aggregated numbers visible, to:

1. **Close the resume "quantified impact" gap** — the eval gave the *quality*
   numbers (catch rate / false-positive rate); this gives the *runtime* numbers:
   p50/p95 latency, average tokens/request, estimated cost/request. (See
   `docs/career/RESUME.md` "Numbers to start capturing now" and
   `LEARNING_ROADMAP.md` item #3.)
2. **Add a production-monitoring mindset** — the interview signal is "I instrument
   what I ship and reason about latency and cost", not "I called an API".

**Non-goals / constraints (do not break these):**

- **No backend.** Everything is local (`chrome.storage.local`), same posture as the
  usage counter. No server, no telemetry, no network egress of metrics. (ADR-001/003.)
- **Bounded storage.** No unbounded event history — a fixed rolling window plus
  running aggregates.
- **No new permissions.** Uses storage we already have.
- **BYOK cost framing.** The user runs on their own free Gemini quota, so the
  "cost" is an *estimated* dollar figure computed from public per-token pricing —
  it demonstrates cost-awareness, it is not a bill.

---

## 2. What we verified in the code (don't re-derive)

Read before designing (`llm-service.ts`, `storage.ts`, `rate-limiter.ts`, `App.tsx`):

- **Non-streaming path (`sendLLMRequest`)** already parses the OpenAI-compatible
  `usage` object (`prompt_tokens`, `completion_tokens`) and maps it onto
  `LLMResponse.usage`. But its callers (`hint-system`, `breakdown-engine`,
  `example-generator`, …) **discard** it.
- **Streaming path (`streamLLMRequest`)** — the one `App.tsx` actually uses for
  every UI action and the chat box — yields only content chunks. It does **not**
  request or read a usage field today. The OpenAI-compatible streaming API only
  emits a final usage chunk when the request sets
  `stream_options: { include_usage: true }`; otherwise usage is unavailable
  mid/post-stream. **This is the key limitation** and is handled honestly (§5).
- **Latency** is independent of tokens — it's wall-clock around the call, always
  measurable in `App.tsx`.
- **Storage pattern to mirror** (`storage.ts` + `rate-limiter.ts`): promise-wrapped
  `chrome.storage.local` getters/setters, a keyed record, defaults backfilled on
  read, date rollover handled in the writer. Metrics will follow this exactly.
- **Models** (`GeminiModel`): `gemini-3.5-flash-lite` (default) / `gemini-3.5-flash`.

---

## 3. Requirements (folded in — acceptance criteria)

EARS-style, kept short because scope is small:

- **R1 — Latency.** WHEN an AI request completes (success), THE SYSTEM SHALL record
  its wall-clock latency in ms.
- **R2 — Tokens.** WHEN the API response exposes a usage object, THE SYSTEM SHALL
  record prompt and completion token counts for that request. WHEN usage is not
  available (e.g. a stream without `include_usage`), THE SYSTEM SHALL record the
  request with tokens marked absent rather than fabricating a count.
- **R3 — Cost.** WHEN token counts are known for a request, THE SYSTEM SHALL derive
  an estimated USD cost from a single, clearly-labeled, source-cited price table
  keyed by model.
- **R4 — Aggregation.** THE SYSTEM SHALL compute p50 and p95 latency, average
  tokens/request, request count, and total/average estimated cost via **pure
  functions** (no I/O), so they are unit-testable.
- **R5 — Persistence & bounds.** THE SYSTEM SHALL persist metrics in
  `chrome.storage.local`, keeping a **bounded rolling window** of the most recent N
  samples plus lifetime running aggregates — never unbounded history.
- **R6 — Readout.** THE SYSTEM SHALL surface the aggregated numbers in a small,
  unobtrusive, read-only UI section, honest about what it can't measure (e.g. a
  "tokens not captured for streamed responses" note if that path can't be fixed).
- **R7 — Failure isolation.** Metrics recording SHALL NOT affect the request path:
  a metrics write that throws must be swallowed (best-effort) so it never breaks a
  coaching response or double-counts against the rate limiter.

---

## 4. Data model

```ts
// One captured request (the rolling-window sample).
interface RequestMetricSample {
  ts: number;                 // epoch ms when recorded
  model: GeminiModel;
  latencyMs: number;          // wall-clock around the call
  promptTokens?: number;      // absent when usage unavailable (streaming w/o include_usage)
  completionTokens?: number;
  estCostUsd?: number;        // derived; absent when tokens absent
  tokensCaptured: boolean;    // explicit honesty flag (R2)
}

// Persisted metrics state (one storage key). Bounded (R5).
interface MetricsState {
  version: 1;
  samples: RequestMetricSample[];   // rolling window, capped at MAX_SAMPLES
  lifetime: {                       // running aggregates that survive window eviction
    totalRequests: number;
    tokensCapturedRequests: number; // denominator for token/cost averages
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalEstCostUsd: number;
  };
}
```

- **Rolling window** `samples` (cap `MAX_SAMPLES`, e.g. **200**) powers the
  percentile math (percentiles need the distribution, not just a sum). Oldest
  evicted on overflow.
- **`lifetime`** running totals survive eviction so "total requests / total est.
  cost" stay truthful over the extension's life without keeping every sample.
- Token/cost averages divide by `tokensCapturedRequests`, **not** `totalRequests`,
  so the streaming-usage gap doesn't silently deflate the average.

### Pricing constants (R3) — single labeled source of truth

Lives in one place, `src/services/metrics-pricing.ts`, clearly labeled and cited:

```ts
// Public Gemini per-token pricing, USD per 1,000,000 tokens.
// SOURCE: Google Gemini API pricing (ai.google.dev/gemini-api/docs/pricing) and
//   corroborating trackers, retrieved 2026-09-23.
// CAVEAT (read before quoting): LeetSage's model IDs are `gemini-3.5-*`
//   (see tech.md), but publicly-listed per-token rates were cleanest for the
//   `gemini-2.5-*` tier at retrieval time ($0.10/$0.40 lite; $0.30/$2.50 flash);
//   the `3.5` rates were not cleanly corroborated across sources. We therefore
//   treat these as an ESTIMATE basis and keep them trivially updatable here.
//   If/when the exact 3.5 rates are confirmed, update this table and cite it.
```

Because it's a plain keyed table, updating a price is a one-line edit — satisfying
"easy to update".

---

## 5. Handling the streaming-usage limitation (the honest part)

Two options were considered:

- **Option A — enable usage on the stream.** Add
  `stream_options: { include_usage: true }` to `streamLLMRequest`'s body and read
  the final usage-only chunk (the OpenAI-compatible contract emits one delta with a
  populated `usage` and empty `choices` right before `[DONE]`). **Chosen** — it's a
  two-line change on the request body plus a branch in the parse loop, it doesn't
  disturb the yielded content chunks, and it gives real tokens for the path the app
  actually uses.
- **Option B — leave the stream token-blind and only record latency.** Simpler, but
  it means the headline "tokens/request" number is never captured for the main flow.

**Decision: attempt Option A.** If the endpoint does not honor `include_usage` for
this OpenAI-compatible surface (verify at runtime), fall back to recording the
sample with `tokensCaptured: false` and **document the limitation in the readout**
rather than fabricating token counts (R2). Either way we never invent numbers.

---

## 6. Architecture & flow

```
App.tsx request path (stream)
  t0 = performance.now()
  for await chunk of streamLLMRequest({..., onUsage})   // usage surfaced at stream end
  latencyMs = performance.now() - t0
  recordMetric({ model, latencyMs, usage })  // best-effort, try/catch swallowed (R7)
        │
        ▼
  metrics-store.ts  (mirrors storage.ts)
    getMetrics() / saveMetrics()  → chrome.storage.local key 'metrics_v1'
    recordMetric(sample): read → append+cap window, update lifetime → write
        │ uses
        ▼
  metrics-pricing.ts   estimateCostUsd(model, prompt, completion)  (pure)
  metrics-aggregate.ts percentile(), summarize(state)              (pure, unit-tested)
        │ consumed by
        ▼
  StatsPanel (small read-only section)  ← p50/p95, avg tokens, req count, est cost
```

- **Where usage is surfaced from the stream:** rather than change the generator's
  yield type (it yields `string`), pass an optional `onUsage?(u)` callback in the
  `LLMRequest`, invoked once if a usage chunk arrives. Keeps the streaming contract
  intact and is opt-in per call site.
- **Recording point:** in `App.tsx`, after the stream completes, next to the
  existing `recordRequest()` usage-counter call — the two are siblings (rate-limit
  counter vs. metrics). Metrics recording is wrapped so a failure never bubbles.

### Module layout (new files)

| File | Responsibility | Pure? |
|---|---|---|
| `src/services/metrics-pricing.ts` | price table + `estimateCostUsd()` | ✅ pure |
| `src/services/metrics-aggregate.ts` | `percentile()`, `summarize()` | ✅ pure (unit-tested) |
| `src/services/metrics-store.ts` | `getMetrics/saveMetrics/recordMetric` (chrome.storage.local) | I/O |
| `src/components/StatsPanel.tsx` | small read-only readout | UI |
| `src/services/metrics-aggregate.test.ts`, `metrics-pricing.test.ts` | Vitest for the pure math | tests |

Types (`RequestMetricSample`, `MetricsState`, `MetricsSummary`, `onUsage` on
`LLMRequest`) go in `src/types/` next to the existing metric-adjacent types.

## 7. UI

A compact, unobtrusive **"Session stats"** read-only block (in the Settings modal,
under a small heading, or a tiny toggled readout in the panel — decide during
implementation, keep it minimal). Shows: requests recorded, p50 / p95 latency,
avg tokens/request, est. cost/request and total est. cost. Includes an honest line
when tokens weren't captured for streamed responses. **This is a UI change → per
workflow.md the user must eyeball the built extension before it's committed.**

## 8. Testing (R4)

Vitest on the **pure** functions only (matching the project's existing "test the
pure modules" approach):

- `percentile()` — empty, single, exact-index, interpolation, p50/p95 on known sets,
  unsorted input.
- `summarize()` — mixed captured/uncaptured samples (averages divide by the right
  denominator), empty state, lifetime vs. window distinction.
- `estimateCostUsd()` — known token counts × known rates for each model; zero tokens;
  rounding behavior.

CI (`ci.yml`) + the Husky pre-commit hook gate lint + test + build, so these run
automatically.

## 9. Risks / tradeoffs

- **`include_usage` may not be honored** on the OpenAI-compatible surface → covered
  by the `tokensCaptured:false` fallback + honest readout (§5).
- **Pricing drift / model-name mismatch** → isolated to one cited table with a
  written caveat (§4); trivially updatable.
- **Self-measured numbers** → the same honesty stance as the eval dataset: these are
  the developer's own runs, a real order-of-magnitude signal, not a benchmark. Say so
  in the docs when the numbers are backfilled.
- **Read-modify-write race** on the metrics key → single-user local store, and writes
  are best-effort; acceptable (same stance as the progress records).
