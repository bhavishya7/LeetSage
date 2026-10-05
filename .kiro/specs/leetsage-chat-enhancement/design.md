# LeetSage — Chat Enhancement (E9) · Design

> **Status:** 📐 Design — awaiting user review before tasks.
> **Requirements:** [`requirements.md`](./requirements.md) (signed off; §11 decisions
> locked). **Roadmap:** `.kiro/specs/PRE-LAUNCH-ROADMAP.md` → E9 (locked architecture).
>
> This document is the *how*. It composes the three tiers with the shipped intent
> router, specifies the read-only tool loop and its request accounting, shows how the
> two memory layers thread into the prompt, fences every untrusted input, and
> describes the obscured usage indicator. It records the context alternatives (A/B/C)
> and the resolved tool-calling verification.

---

## 0. Verification result (the pre-build hard gate)

The Gemini OpenAI-compatible endpoint LeetSage already uses
(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`)
**supports function/tool calling** with the standard OpenAI request shape (`tools: [{
type: "function", function: { name, description, parameters } }]` + `tool_choice:
"auto"`), per the official docs (`ai.google.dev/gemini-api/docs/openai`). Tool support
is **endpoint-level**, not model-gated; `gemini-3.5-flash-lite` / `-flash` are current
(not the deprecated 2.5). The response carries `choices[0].message.tool_calls[]` and
the conversation continues by appending a `role: "tool"` message per call. **No model
or endpoint change is needed.**

**Streaming decision (confirmed with user):** the docs demonstrate tool calls on the
**non-streaming** call. So:
- **Tool-call rounds run NON-STREAMING** — a plain `fetch` to `/chat/completions` with
  `tools` set, parse `tool_calls`, run the tools, append results, repeat. These rounds
  are short and structured.
- **Only the FINAL answer streams** — once the model stops requesting tools (or the cap
  forces a final answer), we make the terminal call via the existing
  `streamLLMRequest` path. The answer still **hides-then-reveals** behind the B1 gate +
  `filterResponse` exactly like a Tier-2 chat answer (the guardrail: a non-exempt answer
  must never flash solution text mid-stream — §5).

**Live agent-step trace (confirmed with user — the honesty cue, guardrail-safe):** a
multi-request loop that just sits on "Thinking" feels slow and hides that it's spending
requests. So the loop **emits step events** ("reading your code", "checking the
examples", "answering") that App.tsx renders as a **minimal live step label** on the
existing Thinking placeholder — modern-agent feel for the *process*. Critically, this
splits process from content:
- **Tool-step labels are safe to show live** — "Reading your code" / "Checking
  constraints" are process, not model-generated answer text, so they carry no solution
  risk.
- **The final answer is NOT shown token-by-token** — it still hides-then-reveals (B1),
  because a non-exempt answer could spell out a solution before the filter runs.

For E9 we build the **plumbing** (an `onStep` callback on `runChatAgent` + a tiny
current-step label) and keep the rendering minimal. The **rich agent-trace UI**
(a styled step timeline, transitions) is deliberately deferred to **E2 (chat
fluidity/polish)**, which the roadmap sequences *after* E9 so polish lands on the final
chat shape — E9 just makes the trace *possible* without closing the door. A small inline
**routing note** ("↪ answering this as a Hint") when a chat message is routed at Tier 1
is in the same spirit (cheap transparency) and also fine to land minimally here or in
E2.

---

## 1. The three tiers, composed with the shipped router

The shipped `routeMessage(message, { hasCode })` already returns a `RouterEffect`
(`dispatch` | `confirm` | `chat`). **E9 does not touch the router.** It only enriches
what happens on the `chat` effect — today that calls `handleChatSubmit`; after E9 it
calls an enriched chat path that may escalate into the loop.

```
submitChat(q)                              [App.tsx — unchanged entry]
  │
  ├─ routeMessage(q, { hasCode })          [PURE, 0 API — shipped]
  │
  ├─ 'dispatch' → handleActionClick(a)     ── TIER 1: 1 request (shipped)
  ├─ 'confirm'  → ConfirmAffordance        ── (shipped; exempt guardrail / ask)
  └─ 'chat'     → handleChatSubmit(q)       ── TIER 2/3 (ENRICHED by E9)
                     │
                     │  build prompt = system + digest + window + (code|problem) + q
                     │  offer read-only tools; tool_choice:"auto"
                     │
                     ├─ model answers directly        ── TIER 2: 1 request
                     └─ model requests tool(s)         ── TIER 3: escalate
                          │  run tool(s) locally (0 API), append results (fenced)
                          │  round 2 (if asked again, still ≤ cap)
                          └─ cap reached OR no more tool calls
                                 → FINAL answer (streamed)   [+1 request]
```

**Why (b) route-first, loop-as-fallback (not re-litigated — recorded):** keeps the
cheap deterministic fast-path for the common case, reuses the shipped classifier +
registry + routing dispatch unchanged, and pays the multi-request premium only for
genuinely novel questions. (a) "replace routing with the loop" throws away working
routing and makes every message pay the agent premium; (c) "everything through the
loop" is over-engineered and expensive. Both rejected in the roadmap.

**Tier boundary is the model's call, bounded by us.** We don't try to predict in code
whether a message "needs tools" — we hand the model the tool allowlist and let
`tool_choice: "auto"` decide. Tier 2 vs. Tier 3 is simply "did the model emit a
`tool_calls` array." Our job is to **bound** that (cap + accounting + fencing), not to
second-guess it.

---

## 2. New module: `src/services/chat-agent.ts` (the bounded loop)

A new, mostly-pure orchestrator. It owns the loop; App.tsx owns the UI/state and
passes in callbacks so the module stays testable without React or `chrome.*`.

### 2.1 Public surface

```ts
export interface ChatAgentDeps {
  /** Non-streaming tool-call round: returns the raw assistant message
   *  (content + any tool_calls). Thin wrapper over fetch(/chat/completions). */
  runToolRound(messages: ChatMessageParam[]): Promise<AssistantTurn>;
  /** Stream the FINAL answer (reuses streamLLMRequest under the hood). */
  streamFinal(messages: ChatMessageParam[], onChunk: (c: string) => void,
              onUsage: (u: Usage) => void): Promise<void>;
  /** Execute one allow-listed tool. Zero-API; returns a capped string or an
   *  error-string (graceful failure, R6.4). Rejects unknown tools (R6.3). */
  runTool(name: string, args: unknown): Promise<string>;
  /** Called BEFORE every network round: the rate-limit pre-check (R7.3). */
  checkBudget(): Promise<GuardrailCheck>;
  /** Called AFTER a round's request is issued: increments usage + metrics
   *  (R7.2). One call per request the loop makes. */
  recordRound(latencyMs: number, usage?: Usage): Promise<void>;
  /** Optional: live agent-step trace for the Thinking placeholder. Emits
   *  process-only labels ("reading your code", "answering") — NEVER answer
   *  content, so it's guardrail-safe to show live. Omittable (tests pass noop). */
  onStep?(step: AgentStep): void;
}

/** Process-only step events the loop emits (guardrail-safe, no answer text). */
export type AgentStep =
  | { kind: 'thinking' }                          // model deciding
  | { kind: 'tool'; label: string }               // e.g. "Reading your code"
  | { kind: 'answering' };                         // final answer streaming

export interface ChatAgentResult {
  /** The final (unfiltered) assistant text — App.tsx then runs filterResponse. */
  answer: string;
  roundsUsed: number;         // tool rounds actually taken (0, 1, or 2)
  stoppedReason: 'answered' | 'cap' | 'budget';
}

export async function runChatAgent(
  initialMessages: ChatMessageParam[],
  deps: ChatAgentDeps,
): Promise<ChatAgentResult>;
```

### 2.2 The loop (pseudocode — the actual control flow)

```
messages = initialMessages
for round in 0 .. MAX_TOOL_ROUNDS (=2):           // R7.1
    deps.onStep?({ kind:'thinking' })              // live trace (process only)
    check = await deps.checkBudget()               // R7.3 pre-check
    if !check.allowed:
        // can't even start this round → force a final answer from what we have
        return finalize(messages, deps, 'budget')  // uses streamFinal, +1 request
    t0 = now()
    turn = await deps.runToolRound(messages)       // NON-STREAMING round
    await deps.recordRound(now()-t0, turn.usage)   // R7.2 — count THIS request

    if turn.toolCalls is empty:
        // model answered without tools → this WAS the answer (Tier 2),
        // but we ran it non-streaming; return it for the single filtered reveal.
        return { answer: turn.content, roundsUsed: round, stoppedReason: 'answered' }

    // model asked for tools → run them locally (0 API), append fenced results
    append assistant turn (with tool_calls) to messages
    for call in turn.toolCalls:
        deps.onStep?({ kind:'tool', label: toolLabel(call.name) })  // "Reading your code"
        result = await deps.runTool(call.name, call.args)   // zero-API, capped, graceful
        append { role:'tool', tool_call_id: call.id,
                 content: wrapToolResult(result) } to messages   // R8.3 fenced

// cap reached (did 2 tool rounds, model still wants more) → force final answer
return finalize(messages, deps, 'cap')             // streamFinal, tool_choice:'none', +1 request

// finalize(): deps.onStep?({ kind:'answering' }); stream the terminal call,
//             recordRound once, return { answer, roundsUsed, stoppedReason }.
```

**Request accounting (R7.2) — the honest part.** Every arrow that hits the network
calls `recordRound` exactly once:
- each `runToolRound` (up to 2),
- the terminal `finalize`/`streamFinal` (1).

So worst case = **3 requests for one message** (2 tool rounds + 1 final), each counted.
A message answered without tools = **1 request**. `runTool` makes **zero** network
calls, so running N tools in a round adds **zero** requests — only the model rounds
cost.

> **Subtlety — the Tier-2-without-tools case ran non-streaming.** When the first round
> returns no tool calls (the common Tier-2 answer), we already have the full answer text
> but produced it non-streaming. **Design choice for v1 (confirmed with user):** return
> it and do the **single filtered reveal** App.tsx already uses for non-exempt chat —
> rather than build streaming-tool-call-delta parsing (the more complex option, parked
> in §12 for v1.1). This is safe UX-wise because **today's non-exempt chat already
> withholds tokens behind the "Answering…" placeholder and reveals once, after
> `filterResponse`** (the B1 gate). So whether the answer came from one non-streaming
> round or a 3-request loop, the reveal is the same.
>
> What *changes* the feel (for the better) is the **live step trace** (§0): during a
> multi-round loop the placeholder shows the current process step ("Reading your code…"
> → "Thinking…" → "Answering…"), so the loop reads as intentional, not frozen. That
> trace is process-only (never answer content), so it's guardrail-safe to show live.

### 2.3 Constants (fixed for v1 — no Settings knobs, R7.1 / R4)

```ts
const MAX_TOOL_ROUNDS = 2;        // worst case 3 requests/message
const WINDOW_TURNS = 3;           // last 3 Q&A turns
const WINDOW_CHAR_BUDGET = 2500;  // ~ caps window prompt growth (R4.2)
const TOOL_RESULT_CHAR_CAP = 1500;// per tool result (R6.5)
```

---

## 3. The read-only tool allowlist

### 3.1 The three tools (all zero-API, R6.1)

| Tool | Returns | Source | API calls |
|---|---|---|---|
| `getEditorCode` | the user's current editor code + language | `extractCurrentCode(tabId)` (MAIN-world Monaco read) | 0 |
| `getProblemExamples` | the problem's worked examples | `problemContext.examples` (in memory) | 0 |
| `getProblemConstraints` | the problem's constraints | `problemContext.constraints` (in memory) | 0 |

Each is defined as **data** in a registry (mirrors the intent-router's data-driven
style), so adding a future read tool is one entry, not control-flow edits:

```ts
// src/services/chat-tools.ts
export interface ToolDef {
  name: string;
  description: string;                 // what the model sees
  parameters: JSONSchema;              // OpenAI function-params schema (often {})
  run(ctx: ToolContext): Promise<string>;  // zero-API; returns a capped string
}
export const CHAT_TOOLS: ToolDef[] = [ /* the three above */ ];
```

`ToolContext` carries what the tools need without them reaching into React:
`{ problemContext, getTabId: () => Promise<number|null> }`.

### 3.2 Why `getComplexityOfCurrentCode` is NOT a tool (recorded decision)

Dropped for v1. Three reasons, in order of weight:
1. **It's already a Tier-1 intent.** "complexity of my code" matches `analyze-code`
   (→ `CHECK_APPROACH`, weight 30, `requiresCodeContext`) and routes before the loop
   is ever reached. The loop would only see it in a narrow sliver the classifier
   missed.
2. **The model doesn't need it.** If it wants a complexity verdict mid-loop, it calls
   `getEditorCode` and reasons about complexity itself in the final answer.
3. **It would break the clean model.** Unlike the three reads (zero inference), a
   complexity tool has no stored fact to read — it would make its **own nested Gemini
   call**, i.e. an uncounted request below the loop, no longer "read-only," and it
   would route model-generated solution-adjacent content back in through a side door
   (more guardrail surface). The three zero-API reads keep requests only at the round
   level and the allowlist genuinely read-only.

**Correct gaps (not missing tools):** "did my code pass the tests?" isn't DOM-readable
until Progress Phase D, and "give me the editorial" is against the guardrail. Chat
should honestly say it can't do those — a tool that pretended to would be worse.

### 3.3 Graceful failure + capping (R6.4 / R6.5)

- `runTool` wraps the read in try/catch; on failure it returns a string like
  `"(couldn't read the editor — the user may have navigated away)"` so the model
  answers with what it has instead of the turn throwing. Especially relevant for
  `getEditorCode` across the MV3 worker sleeping / tab change.
- Every tool result is truncated to `TOOL_RESULT_CHAR_CAP` (with a `"…(truncated)"`
  marker) before it goes back into `messages`, bounding prompt growth across rounds.
- `runTool` on an unknown name returns an error string (R6.3) — the model is told the
  tool doesn't exist; it never executes anything off-list.

### 3.4 Telling the model what it already has (R6.6)

The loop's system prompt includes a short "AVAILABLE CONTEXT" note: *the problem
description, examples, and constraints are already provided; the user's current code
<is / is not> included below; prior conversation and a session summary are included.*
Then: *only call a tool to fetch something not already present.* This stops the model
burning a round re-fetching code that's already in the prompt — the common redundancy
given chat already reads the editor up front.

---

## 4. Two-layer memory threaded into the prompt

### 4.1 Message assembly (the enriched chat prompt)

The initial `messages[]` the loop starts with:

```
[ system  : getChatAgentSystemPrompt()   // chat rules + tool guidance + "what you already have"
, user    : wrapUntrusted(
              buildChatData(request)                 // problem + (code if captured)   [shipped]
              + "\n\n" + sessionDigest               // LONG-TERM memory  (R3)          [NEW in chat]
              + "\n\n" + windowBlock,                 // SHORT-TERM memory (R4)          [NEW]
              `My question: ${q}`)                    // instruction stays OUTSIDE       [shipped]
]
```

Everything scraped/model-authored (problem, code, digest, window) rides **inside** the
`wrapUntrusted` DATA fence; only the live question is the instruction (R5.1). This is
the exact framing the chat path uses today — E9 just adds the digest + window into the
data block.

### 4.2 Long-term: the session digest (R3)

Reuse `buildSessionDigest(learningContentRef.current, progress)` **verbatim** — the
same zero-API function that feeds `GENERATE_REPORT` today. It reads structured `data`
off the history; it is NOT a model call. When it returns `''` (no structured
activity), we omit the block (R3.3). `progress.hintLevel` remains the authority for
hint depth; the digest only *reports* usage (R3.4). **Read from `learningContentRef`,
not the `useCallback` closure variable** — the same staleness fix the digest already
relies on (the closures deliberately don't depend on `learningContent`).

### 4.3 Short-term: a bounded conversation window (R4) — new tiny module

```ts
// src/services/chat-window.ts   (PURE — unit-testable)
export function buildConversationWindow(
  history: LearningContent[],
  opts = { turns: WINDOW_TURNS, charBudget: WINDOW_CHAR_BUDGET },
): string;
```

- Walk `history` **newest-first**, selecting only **chat turns** — the `CHAT_MESSAGE`
  content type (the user bubble `isUserQuery` + its assistant reply). This excludes
  action-card bodies (R4.3 — the digest covers those).
- Take up to `turns` user→assistant pairs; stop early when adding the next turn would
  exceed `charBudget` (R4.2) — newest turns win.
- Render as a compact transcript:
  `Earlier in this conversation:\nYou: …\nLeetSage: …\n(…)`.
- Returns `''` when there are no prior chat turns (first question) — block omitted.

This is pure and reads from the same `learningContentRef` snapshot passed in, so it's
trivially testable (array in → string out) and immune to the closure-staleness quirk.

### 4.4 Why bounded window + digest (A/B/C alternatives — R10.3)

| Option | What | Verdict |
|---|---|---|
| **A — full transcript** | send every prior turn verbatim | ❌ rejected: grows linearly, inflates *every* request, compounds as the chat lengthens — the exact per-request token cost we're bounding. |
| **B — bounded window + flat digest** | last 3 chat turns (capped) + the zero-API factual digest | ✅ **chosen**: per-request token cost is flat and predictable; recent follow-ups work (window); long-term "what they did" is covered cheaply (digest); zero extra requests. |
| **C — rolling LLM summary** | periodically ask the model to summarize the chat | ❌ rejected: the summary itself costs a request — wrong trade for a BYOK / 200-a-day product. (We already have a zero-cost structured digest; C would pay for a worse version of it.) |

**Two cost axes, stated plainly (R10):**
- *Request count (200/day):* memory adds **zero** requests. A chat turn is 1 request
  whether it carries 0 or 3 prior turns. Only the **tool loop** adds requests (R7.2).
  **Context ≠ requests.**
- *Tokens per request:* memory **does** add input tokens, so we bound it — the window
  char budget + the flat digest keep each request's input size predictable even as the
  conversation grows and even across loop rounds (where tool results also append,
  themselves capped by R6.5).

---

## 5. Guardrails end-to-end (R8, R12)

The loop sits **in front of** the shipped safety chain; it does not replace any link.

- **Final answer is NON-EXEMPT.** The chat path has always been non-exempt. The loop's
  final answer is filtered by `filterResponse(answer, 'EXPLAIN_CONCEPT')` and held
  behind the **B1 pre-display gate** in App.tsx exactly like today's chat (R8.1). A
  tool-loop answer gets no special solution privilege (R8.2).
- **Tool results are untrusted** → each is fenced via a `wrapToolResult` helper that
  reuses the `wrapUntrusted` framing before re-entering the prompt (R8.3). A malicious
  constraints string scraped from a crafted page can't smuggle instructions in through
  a tool result.
- **Memory is untrusted** → digest + window ride inside the same `wrapUntrusted` DATA
  fence (R5.1).
- **System prompt reasserts** the no-solutions rule for the loop (built on
  `getChatSystemPrompt`'s rules) so the final answer rarely trips the filter — avoiding
  the "spent 3 requests then the filter nuked the answer" waste. (The filter still wins
  if it does trip; the prompt just makes that rare.)
- **The router is untouched** (R12.1): `routeMessage` still returns the same three-way
  effect; E9 only enriches the `chat` branch. The exempt-confirm affordance behavior is
  unchanged (R12.3). Tier-1 routed actions + quick-action buttons behave exactly as
  today (R12.4).

**Guardrail invariant to test:** a solution-seeking message (e.g. "just give me the
full code") must NOT reach a solution via the loop. It routes at Tier 1 to
`UNDERSTAND_SOLUTION` → confirm affordance (shipped, exempt); if it somehow reaches
chat, the non-exempt filter catches a full-solution final answer. The golden-set test's
"never silently reaches an exempt action" case still holds because the router is
unchanged.

---

## 6. The obscured usage indicator (R11)

### 6.1 Component: `src/components/UsageReservoir.tsx` (water-level glyph)

A small presentational component replacing the header's `{usageCount}/{max}` span.
*(Form confirmed with user — a draining reservoir, not pips/bar/ring.)*

- **Form:** a tiny **beaker/glass SVG** (≈16–20px, header-sized) whose **water level
  drops** as the day's requests climb. The metaphor is a finite reserve being used up —
  a natural fit for the daily-request budget, and free of the "context-window" reading
  that a linear bar or ring carries. (A beaker reads more cleanly than a "natural water
  body" at header size; a lake outline gets muddy that small — so: a container glyph.)
- **Fill:** `fillFraction = 1 - clamp(used / max, 0, 1)` — full glass at 0 requests,
  empty near the cap. Rendered as a `<rect>`/`<path>` water body clipped to the glass
  outline, its top edge at the fill level.
- **Color (the preserved "running low" cue, R11.2):** the water is calm green/blue
  while plenty remains, shifts to **amber** past ~70% used, **red** past ~90% — so the
  "slow down" signal survives without a number. Near-empty may show just a shallow
  puddle for a stronger "almost out" read.
- **No raw numbers** in the header (R11.1).
- **Accessibility (R11.5):** `role="img"` + `aria-label` conveying the *approximate*
  state (`"Daily usage: low"` / `"moderate"` / `"high — approaching the limit"`) and a
  matching `title` tooltip. Obscuring is visual only — assistive tech still gets the
  state.
- **Props:** `{ used: number; max: number }` — pure derivation of fill fraction + color
  band inside the component; no storage access. The band derivation is a tiny pure
  helper, unit-testable (fraction → band).
- **Fallback:** if the water glyph doesn't read well at header size when eyeballed in
  the build, swapping to a segmented pip meter is a small, contained change (same props,
  same bands) — noted so we're not blocked on the visual.

### 6.2 Where the exact number goes (R11.3)

The precise `X / 200` moves into **Settings**, which already has the right homes:
- the **"usage limits"** advanced section (shows `Requests / day` as the cap), and
- the **"session stats"** `StatsPanel` (the existing metrics readout).

Design choice: add a single read-only line to the Settings "session stats" panel —
`Requests today: X / 200 (resets at midnight)` — fed by `getUsageToday()`. This keeps
the number discoverable for anyone who wants it, just not pressuring in the header.

### 6.3 Wiring

App.tsx already holds `usageCount` state and updates it (`setUsageCount(usage.count)`)
after each `recordRequest`. The loop's per-round `recordRound` propagates the updated
count, so the water level drops after **each** round (R11.4) — a 3-request message
visibly drains the glass more than a 1-request one, which is the honest signal. The
daily-reset refresh on `visibilitychange` (shipped) refills it at midnight, unchanged.

---

## 7. App.tsx integration (minimal, surgical)

`handleChatSubmit` is the only handler that changes. Its shape stays the same up to the
point where it builds the request; instead of a single `streamLLMRequest`, it:

1. Builds `initialMessages` (§4.1): system + the `wrapUntrusted(data + digest + window,
   question)` user message.
2. Calls `runChatAgent(initialMessages, deps)` with `deps` wired to:
   - `runToolRound` → a new **non-streaming** `sendToolRound()` in `llm-service.ts`
     (fetch with `tools` + `tool_choice:"auto"`, parse `tool_calls`),
   - `streamFinal` → the existing `streamLLMRequest` (with `tool_choice:"none"` /no
     tools so the terminal call can't re-request tools),
   - `runTool` → `CHAT_TOOLS` dispatcher (§3),
   - `checkBudget` → `checkRateLimit(settings.guardrails)`,
   - `recordRound` → `recordRequest()` + `setUsageCount` + best-effort `recordMetric`,
   - `onStep` → sets a small `agentStep` state that the Thinking placeholder renders as
     the current step label ("Reading your code…" / "Thinking…" / "Answering…").
3. Takes `result.answer`, runs `filterResponse(answer, 'EXPLAIN_CONCEPT')`, and does the
   **existing** single filtered reveal into the response card (B1 pattern — unchanged).
4. Appends the user + response `LearningContent` to history as today (so the next turn's
   window + digest see them).

`handleActionClick` (Tier 1) and the quick-action buttons are **untouched**.
`submitChat` → `routeMessage` is **untouched**. The header swaps the count span for
`<UsageReservoir used={usageCount} max={settings.guardrails.maxRequestsPerDay} />`.

**Step label rendering (minimal for E9).** `ContentDisplay`'s existing Thinking
placeholder gains an optional `stepLabel` prop; when set, it shows the current agent
step instead of the generic "Answering…". This is the **minimal** rendering — the rich
styled trace timeline is E2. The `agentStep` state resets when the stream completes.

### 7.1 `llm-service.ts` additions

- `sendToolRound(request, messages, tools)` — non-streaming `fetch` returning
  `{ content, toolCalls, usage }`. Mirrors `sendLLMRequest`'s error handling
  (`buildAPIError`, 401/403/429 messages). Does **not** stream.
- `streamLLMRequest` gains an optional `tools?` / `toolChoice?` passthrough so the final
  call can pin `tool_choice:"none"`. (Backward compatible — omitted = today's behavior.)
- A small OpenAI tool-call type (`{ id, function: { name, arguments } }`) added to the
  response-shape interfaces (untrusted boundary — guarded parsing, same as today).

---

## 8. Expanding the golden set (R2.3)

No classifier change — only more labeled examples in the intent-router test fixtures so
the over-route rate is measurable with the loop as the safety net. Add cases that
reflect the new reality:
- Messages that **should fall through to chat** (and thus into Tier 2/3), e.g. genuine
  follow-ups ("what about the edge case I mentioned?"), multi-part questions.
- Messages that should still **route at Tier 1** (regression guard).
- The guardrail case ("just give me the full code" → confirm, never silent) stays.
Keep the labeled set as the router's accuracy metric; bias stays toward high-confidence
routing (under-routing now falls into capable chat, so a high bar is safe).

---

## 9. Testing strategy (R13)

Pure modules get unit tests (no React, no `chrome.*`, no network — deps are injected):

- **`chat-agent.test.ts`** (drives `runChatAgent` with fake `deps`):
  - no tool calls → 1 `recordRound`, `stoppedReason:'answered'`, 1 request.
  - 1 tool round then answer → 2 `recordRound`s (round + final), `roundsUsed:1`.
  - model keeps requesting tools → capped at `MAX_TOOL_ROUNDS`, forced final,
    `stoppedReason:'cap'`, exactly 3 `recordRound`s.
  - `checkBudget` denies mid-loop → `stoppedReason:'budget'`, graceful final.
  - **per-round accounting invariant:** `recordRound` call count === requests issued.
- **`chat-tools.test.ts`:** each tool returns expected data; unknown tool → error
  string (R6.3); a throwing read → graceful error string (R6.4); oversized result →
  truncated to the cap (R6.5).
- **`chat-window.test.ts`:** selects only chat turns; last-3 limit; char-budget trims
  oldest; empty history → `''`; action cards excluded.
- **Fencing:** a test asserting tool results + digest + window are wrapped via
  `wrapUntrusted` (string contains the markers) (R8.3 / R5.1).
- **Golden set:** expanded fixtures still pass; the no-silent-exempt case holds.
- **Build + full suite:** `npm.cmd run build` clean; `npm.cmd run test` green (~277 +
  new).

`UsagePips` is presentational; covered by eyeball in the build (R13.5) + optionally a
tiny band-derivation test (fraction → color band).

---

## 10. File-by-file change summary

**New:**
- `src/services/chat-agent.ts` — the bounded loop orchestrator (pure, deps-injected);
  owns the `AgentStep` events + `toolLabel()`.
- `src/services/chat-tools.ts` — the 3 read-only tool defs + dispatcher + caps + the
  human step labels per tool.
- `src/services/chat-window.ts` — pure bounded-window builder.
- `src/components/UsageReservoir.tsx` — the draining water-level glyph (+ pure band
  helper).
- Tests: `chat-agent.test.ts`, `chat-tools.test.ts`, `chat-window.test.ts` (+ fencing,
  + expanded golden-set fixtures, + a tiny reservoir-band test).

**Modified:**
- `src/services/llm-service.ts` — add `sendToolRound` (non-streaming, tools);
  `streamLLMRequest` optional `tools`/`toolChoice` passthrough; tool-call response
  types.
- `src/services/prompts.ts` — add `getChatAgentSystemPrompt()` (chat rules + tool
  guidance + "what you already have") and a `wrapToolResult()` helper (reuses
  `wrapUntrusted`).
- `src/sidepanel/App.tsx` — enrich `handleChatSubmit` to call `runChatAgent`; thread
  digest + window; `agentStep` state wired to `onStep`; swap header count span for
  `<UsageReservoir>`; per-round `setUsageCount`.
- `src/components/ContentDisplay.tsx` — optional `stepLabel` prop on the Thinking
  placeholder (minimal step rendering; rich trace is E2).
- `src/components/SettingsModal.tsx` — add the exact `Requests today: X / 200` line to
  the session-stats panel.
- (Possibly) `src/types/api.ts` — tool-call/`toolChoice` fields on the request/response
  types if not kept local to `llm-service.ts`.

**Untouched (regression surface to protect):** the whole `intent-router/`,
`solution-filter.ts`, `rate-limiter.ts` core, `session-digest.ts`, `ConfirmAffordance`,
`handleActionClick`, the quick-action buttons.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Loop re-fetches data already in the prompt (wasted round) | §3.4 "what you already have" system note; code already pre-sent by chat. |
| Final answer trips the filter after spending requests | §5 system prompt reasserts no-solutions; filter still wins (correctness > cost). |
| MV3 worker sleeps mid-loop / tab navigates away | §3.3 graceful tool failure → model answers with what it has. |
| Prompt grows across rounds | window char budget (R4.2) + per-tool-result cap (R6.5) + cap of 2 rounds. |
| Non-tool Tier-2 answer isn't streamed | §2.2: today's non-exempt chat already withholds-then-reveals, so UX is unchanged. |
| Model invents a tool / mis-formats args | §3.3 unknown-tool error string; guarded arg parsing (untrusted boundary). |
| Double-counting or under-counting requests | §2.2 one `recordRound` per network round; unit-tested invariant (§9). |

---

## 11b. Decisions & findings from the build (honest record)

Captured during implementation + live testing so the spec reflects what actually
shipped, not just what was planned:

- **The tool loop is a RARE fallback in the common flow (confirmed live, accepted).**
  Because `handleChatSubmit` pre-loads problem + examples + constraints + the user's
  editor code into the prompt, and the three read-only tools fetch exactly those
  things, the model almost never *needs* a tool — it answers directly at Tier 2 (1
  request). The loop fires only in the narrow case where data genuinely isn't in the
  prompt (e.g. the editor was empty at submit time, then the user asks about their
  code). **Decision (user-confirmed): keep it as a bounded correctness fallback**
  rather than force it to fire (option 2) or add a genuinely-new-data tool (option 3).
  The agentic machinery — bounded loop + per-round request accounting + unbypassable
  guardrail — is the valuable, correct part even when it rarely triggers. The loop was
  verified to execute end-to-end live (empty-editor → `getEditorCode` → final answer).

- **Own-code echo vs. the filter (Option D fix).** Testing surfaced a real issue: when
  the user asks "what have I typed so far?", the honest answer reproduces their own
  code, which the NON-EXEMPT chat filter flags as a "complete function" and blocks —
  i.e. the user's OWN code was being guardrailed as if it were the withheld solution.
  Fixed at the PROMPT, not the filter (no guardrail weakening): a shared
  `OWN_CODE_REFERENCE_RULE` in both `getChatSystemPrompt` and
  `getChatAgentSystemPrompt` tells the model to REFER to specific lines / short
  excerpts and describe them, rather than reprint the whole file. Verified live: chat
  now discusses the user's own code accurately (naming their variables, giving
  complexity) without tripping the filter. The filter remains the hard backstop.

- **Usage indicator — final form (user-eyeballed).** The obscured indicator is a small
  draining **water droplet** (a beaker/pip did not read at header size), relocated from
  the header to the **bottom input bar** beside a **"Daily usage"** label — placed
  where requests are actually spent so it reads as a budget, not a mystery glyph, and
  sharing one row with "Reset this problem" to avoid dead whitespace. Green→amber→red
  tint preserved; exact `X/200` lives in Settings → session stats.

## 12. Out of scope (deferred — do not build here)

- Chat visual polish / fluidity (E2), onboarding (E4), routing-bug fixes (E3).
- Any write/mutating tool; any tool that makes a nested model call.
- User-adjustable loop cap / window size (fixed constants for v1).
- Submission-result reading ("did my tests pass") — Progress Phase D.
- Streaming tool-call deltas on the first round (option (b) in §2.2) — a v1.1
  refinement only if the non-streaming first round proves to feel slow.
