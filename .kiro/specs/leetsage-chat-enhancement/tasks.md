# LeetSage — Chat Enhancement (E9) · Tasks

> **Status:** 📝 Tasks — awaiting user review before implementation.
> **Reqs/Design:** [`requirements.md`](./requirements.md) · [`design.md`](./design.md)
> (both signed off). **Branch:** `feature/chat-enhancement` (off `main @ 72da4ed`).
>
> **Process reminder (workflow.md hard rule):** implement → **build + test** → EXPLAIN
> and **STOP for the user to review** (eyeball the water glyph + chat in the built,
> reloaded extension) → commit (user-triggered) → historian. **No autonomous
> build→commit→historian pass.**
>
> **Ordering principle:** build the **pure, deps-injected modules first** (unit-testable
> with no React / no `chrome.*` / no network), then the thin service wrappers, then wire
> App.tsx last. Each group ends green (`npm.cmd run build` + `npm.cmd run test`) so a
> regression is caught where it's introduced. Commits are grouped **one concern per
> commit** (staged by name, not `git add .`) — but only after the user's review.

---

## Group 0 — Housekeeping (rides along, per roadmap H1)

- [ ] **0.1** Fix stale statuses in `.kiro/specs/README.md` (H1): several specs still read
  "built on branch / not merged"; they're all **merged to main**. Flip to ✅ Shipped and
  fix the "Quick what's true right now" section. *(Doc-only; the roadmap says this can
  ride on this branch — no separate branch.)*
- [ ] **0.2** Add the `leetsage-chat-enhancement` row to the specs index as
  📐 **Designed** → flip to the appropriate status as E9 lands.

## Group 1 — Conversation window (pure) · `src/services/chat-window.ts`

- [ ] **1.1** Implement `buildConversationWindow(history, { turns, charBudget })`:
  newest-first, select only chat turns (`type === 'CHAT_MESSAGE'`: the `isUserQuery`
  user bubble + its assistant reply), take ≤ `turns` pairs, stop before exceeding
  `charBudget`, render as a compact `You: … / LeetSage: …` transcript; `''` when no chat
  turns. Export the constants `WINDOW_TURNS = 3`, `WINDOW_CHAR_BUDGET = 2500`.
- [ ] **1.2** `chat-window.test.ts`: only chat turns selected (action cards excluded);
  last-3 limit; char-budget trims oldest; empty history → `''`; ordering is oldest→newest
  within the rendered block.
- [ ] **1.3** Build + test green.

## Group 2 — Read-only tools (pure-ish) · `src/services/chat-tools.ts`

- [ ] **2.1** Define `ToolDef { name, description, parameters, stepLabel, run(ctx) }` and
  `ToolContext { problemContext, getTabId }`. Implement the 3 tools:
  `getEditorCode` (→ `extractCurrentCode(await getTabId())`, returns code+lang or a
  graceful "couldn't read" string), `getProblemExamples` (from `problemContext.examples`),
  `getProblemConstraints` (from `problemContext.constraints`). Each `run` is zero-API.
- [ ] **2.2** `CHAT_TOOLS` array + `runTool(name, args, ctx)` dispatcher: unknown name →
  error string (R6.3); any thrown read → caught, returned as a graceful string (R6.4);
  every result truncated to `TOOL_RESULT_CHAR_CAP = 1500` with a `…(truncated)` marker
  (R6.5). Export an OpenAI-shaped `toolSpecs()` (name/description/parameters) for the
  request body, and a `toolLabel(name)` for the step trace.
- [ ] **2.3** `chat-tools.test.ts`: each tool returns expected data; unknown tool → error
  string; throwing read → graceful string; oversized result truncated to cap;
  `toolSpecs()` shape matches OpenAI `tools[]`.
- [ ] **2.4** Build + test green.

## Group 3 — Prompt + fencing · `src/services/prompts.ts`

- [ ] **3.1** Add `getChatAgentSystemPrompt()` — built on `getChatSystemPrompt()`'s rules
  (keeps `SOLUTION_PREVENTION_RULES` + `OUTPUT_RULES`, non-exempt, no forced analogy),
  **plus** tool guidance (when to call a tool) and the **"AVAILABLE CONTEXT"** note (R6.6:
  problem/examples/constraints already provided; code included-or-not; prior conversation
  + session summary included; only call a tool for something not already present).
- [ ] **3.2** Add `wrapToolResult(toolName, result)` — reuses `wrapUntrusted` framing so a
  tool result re-enters the prompt fenced as DATA (R8.3).
- [ ] **3.3** `prompts.test.ts` additions: the chat-agent prompt keeps the guardrail
  language; `wrapToolResult` contains the untrusted markers.
- [ ] **3.4** Build + test green.

## Group 4 — Non-streaming tool round · `src/services/llm-service.ts`

- [ ] **4.1** Add tool-call response types (guarded, untrusted boundary):
  `ToolCall { id, name, arguments }`, `AssistantTurn { content, toolCalls, usage }`.
- [ ] **4.2** Implement `sendToolRound({ apiKey, model, maxTokens, timeoutMs, messages,
  tools })` — **non-streaming** `fetch` to `/chat/completions` with `tools` +
  `tool_choice: "auto"`; parse `choices[0].message` into `AssistantTurn` (content +
  `tool_calls[]` mapped to `ToolCall`, `arguments` JSON-parsed defensively); reuse
  `buildAPIError` + retry semantics. Returns `usage` when present.
- [ ] **4.3** Add optional `tools?` / `toolChoice?` passthrough to `streamLLMRequest` so
  the terminal answer call can pin `tool_choice: "none"`. Backward compatible (omitted =
  today's behavior) — existing streaming tests unaffected.
- [ ] **4.4** `llm-service` test additions (mock `fetch`): `sendToolRound` parses a
  tool-call response and a plain-answer response; malformed `arguments` handled; 429/401
  surfaced via `buildAPIError`. *(Keep to the existing mocking style in the suite.)*
- [ ] **4.5** Build + test green.

## Group 5 — The bounded agent loop (pure, deps-injected) · `src/services/chat-agent.ts`

- [ ] **5.1** Define `ChatAgentDeps` (`runToolRound`, `streamFinal`, `runTool`,
  `checkBudget`, `recordRound`, optional `onStep`), `AgentStep`
  (`thinking|tool{label}|answering`), `ChatAgentResult` (`answer`, `roundsUsed`,
  `stoppedReason: 'answered'|'cap'|'budget'`), and constants `MAX_TOOL_ROUNDS = 2`.
- [ ] **5.2** Implement `runChatAgent(initialMessages, deps)` per design §2.2: pre-check
  budget each round → `runToolRound` → `recordRound` (exactly once per network round) →
  if no tool calls return the answer; else run tools (fenced, via `runTool`) and loop;
  at cap force a `finalize` (streamed, `tool_choice:'none'`) with one more `recordRound`.
  Emit `onStep` events at each stage.
- [ ] **5.3** `chat-agent.test.ts` (fake deps — the core safety tests, R13.3):
  - no tool calls → 1 `recordRound`, `stoppedReason:'answered'`, `roundsUsed:0`.
  - 1 tool round then answer → 2 `recordRound`s, `roundsUsed:1`.
  - model keeps requesting → capped at 2, forced final, exactly **3** `recordRound`s,
    `stoppedReason:'cap'`.
  - `checkBudget` denies mid-loop → `stoppedReason:'budget'`, graceful final.
  - **invariant:** `recordRound` call count === number of network rounds issued.
  - `onStep` emits the expected sequence; omitting `onStep` is a no-op.
- [ ] **5.4** Build + test green.

## Group 6 — Usage reservoir glyph · `src/components/UsageReservoir.tsx`

- [ ] **6.1** Pure band helper `usageBand(used, max): 'low'|'moderate'|'high'` (amber ≥
  ~0.7, red ≥ ~0.9) + `fillFraction = 1 - clamp(used/max, 0, 1)`.
- [ ] **6.2** `UsageReservoir` component: a small beaker/glass SVG (~16–20px) with a water
  body clipped to the glass, top edge at the fill level; color green/blue → amber → red by
  band; near-empty shallow puddle; `role="img"` + `aria-label`/`title` ("Daily usage:
  low/moderate/high — approaching the limit"). Props `{ used, max }`, no storage access.
- [ ] **6.3** Tiny `UsageReservoir.test.ts` for `usageBand`/`fillFraction` (fraction →
  band thresholds). *(Visual correctness is the build eyeball, R13.5.)*
- [ ] **6.4** Build + test green.

## Group 7 — Wire App.tsx + ContentDisplay + Settings (the integration)

- [ ] **7.1** `ContentDisplay.tsx`: add optional `stepLabel?: string` to the Thinking
  placeholder so it shows the current agent step instead of the generic "Answering…"
  when set. Minimal — rich trace is E2.
- [ ] **7.2** `App.tsx` `handleChatSubmit`: build `initialMessages` =
  `getChatAgentSystemPrompt()` + `wrapUntrusted(buildChatData + sessionDigest(from
  learningContentRef) + buildConversationWindow(from learningContentRef), 'My question:
  …')`; call `runChatAgent` with deps wired to `sendToolRound`, `streamLLMRequest`
  (tool_choice:'none'), `runTool` (with `ToolContext`), `checkRateLimit`, and a
  `recordRound` that does `recordRequest` + `setUsageCount` + best-effort `recordMetric`;
  `onStep` → new `agentStep` state. Then `filterResponse(result.answer, 'EXPLAIN_CONCEPT')`
  → the **existing** single filtered reveal; append user + response `LearningContent` as
  today. Reset `agentStep` on completion.
- [ ] **7.3** `App.tsx` header: replace the `{usageCount}/{max}` span with
  `<UsageReservoir used={usageCount} max={settings.guardrails.maxRequestsPerDay} />`.
- [ ] **7.4** `SettingsModal.tsx`: add a read-only `Requests today: X / 200 (resets at
  midnight)` line to the session-stats panel, fed by `getUsageToday()`.
- [ ] **7.5** Confirm the untouched surfaces compile against the changes: `routeMessage`
  / `submitChat`, `handleActionClick`, quick-action buttons, `ConfirmAffordance` — no
  behavioral edits (R12).
- [ ] **7.6** Build + test green.

## Group 8 — Golden set + guardrail coverage (R2.3, R13.4)

- [ ] **8.1** Expand the intent-router golden-set fixtures: add messages that *should*
  fall through to chat (genuine follow-ups, multi-part), keep Tier-1 regression cases, and
  **keep** the "solution-seeking message never silently reaches an exempt action" case.
  Classifier stays the local heuristic — fixtures only.
- [ ] **8.2** Fencing assertion test: digest + window + tool results all carry the
  `wrapUntrusted` markers in the assembled prompt (R5.1 / R8.3).
- [ ] **8.3** Build + full suite green (baseline ~277 + the new tests).

## Group 9 — Verify, EXPLAIN, STOP (workflow hard gate)

- [ ] **9.1** `npm.cmd run build` compiles clean (`tsc -b && vite build`, prints
  `built in <N>ms`). Fix any surfaced errors. Clean up any temp files.
- [ ] **9.2** `npm.cmd run test` — all green; confirm the new safety tests
  (per-round accounting invariant, cap, window cap, tool allowlist, fencing) pass.
- [ ] **9.3** **EXPLAIN what/why/how and STOP.** Present the work; the user **eyeballs the
  built, reloaded extension** — specifically the water reservoir glyph at header size and
  the chat loop's step label + reveal — before anything is committed. (Visual + UX change
  → mandatory eyeball per workflow.md.)
- [ ] **9.4** *(Only after user approval)* Commit in logical groups (pure modules → service
  wrappers → App wiring → UI → docs), detailed messages via `git commit -F` tempfile
  (deleted after), specific files staged by name. Then run the project-historian on the
  session handoff. **User triggers commit + push + PR.**

---

## Mapping to requirements (traceability)

| Requirement | Tasks |
|---|---|
| R1 three-tier dispatch | 5.2, 7.2 (router untouched; chat branch enriched) |
| R2 classifier stays local / expand golden set | 8.1 |
| R3 long-term memory (digest) | 7.2 |
| R4 bounded window | 1.1–1.3, 7.2 |
| R5 memory untrusted/fenced | 3.2, 8.2 |
| R6 read-only tool allowlist + graceful/capped/declared | 2.1–2.3, 3.1 |
| R7 bounded loop + per-round accounting | 5.1–5.3 (invariant), 7.2 |
| R8 loop never bypasses guardrail | 3.1, 3.2, 5.2 (finalize), 7.2 (filter+gate) |
| R9 pre-flight cost awareness | 5.2 (budget pre-check → graceful final) |
| R10 cost model (recorded) | design §4.4 (doc); 5.3 invariant proves "context ≠ requests" |
| R11 obscured usage indicator | 6.1–6.3, 7.3, 7.4 |
| R12 preserve shipped chain | 7.5 (+ untouched modules) |
| R13 verification | 9.1–9.2, all `*.test.ts`, 9.3 eyeball |

## Risks carried from design §11 (watch during impl)

- Loop re-fetching already-present data → the §3.1 "AVAILABLE CONTEXT" note (task 3.1).
- Final answer tripping the filter after spending requests → §3.1 prompt reasserts rules;
  filter still wins (3.1 + 7.2).
- MV3 worker sleep / tab change mid-loop → graceful tool failure (2.2).
- Prompt growth across rounds → window cap (1.1) + tool-result cap (2.2) + 2-round cap (5.1).
- Double/under-counting requests → one `recordRound` per round, unit-tested (5.3).

## Out of scope (do NOT build here — design §12)

Chat visual polish/fluidity (E2), onboarding (E4), routing-bug fixes (E3), any
write/nested-LLM tool, user-adjustable loop/window knobs, submission-result reading
(Progress Phase D), streaming tool-call deltas on the first round (v1.1).
