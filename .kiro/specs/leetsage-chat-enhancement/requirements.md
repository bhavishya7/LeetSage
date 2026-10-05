# LeetSage — Chat Enhancement (E9) · Requirements

> **Status:** ✅ Requirements — signed off by the user (open questions §11 resolved).
> Proceeding to design.
> **Spec rigor:** FULL TRILOGY (requirements → design → tasks). This is the single
> largest remaining pre-launch feature (see `.kiro/specs/PRE-LAUNCH-ROADMAP.md` →
> E9, the LOCKED plan). Per `.kiro/steering/workflow.md`, requirements get the
> user's sign-off before design begins.
>
> **What this feature is (one line):** turn the chat box from a single stateless
> call into a *three-tier, cost-aware agent* — route the common case to a shipped
> action (1 request), answer novel questions from conversation context (1 request),
> and fall back to a *bounded, read-only tool loop* (2+ requests) only when the
> model genuinely needs to fetch data — all without breaking the teaches-never-
> solves identity, the no-backend/BYOK posture, or the 200/day budget.
>
> **Pre-build hard gate — RESOLVED:** Gemini's OpenAI-compatible endpoint
> (`.../v1beta/openai/chat/completions`) **supports function/tool calling**
> (`tools` + `tool_choice: "auto"`, standard OpenAI request shape) per the official
> docs (`ai.google.dev/gemini-api/docs/openai`). Tool support is an endpoint-level
> capability; `gemini-3.5-flash-lite` / `-flash` are current (not the deprecated
> 2.5). The loop is therefore buildable; the design will decide streaming vs.
> non-streaming for the tool-call rounds.

---

## 1. Context & motivation

Today every chat message is **one stateless `streamLLMRequest`** (`App.tsx`
`handleChatSubmit`): it sends the problem context + the user's editor code + the
question, and **no prior turns and no session memory**. Two consequences:

1. **No memory.** Chat can't handle follow-ups ("what about the edge case I
   mentioned?") and doesn't know the user already used three hints or ran an
   analysis — each message starts cold.
2. **Not agentic.** The model answers from whatever is in that one prompt; it can't
   decide *"I need to look at their current code / the examples / the constraints"*
   and go fetch it. It's a single-shot responder sitting behind a local intent
   router (shipped `leetsage-chat-intent-routing`).

E9 addresses both **without** regressing the four things that define LeetSage:

- **Teaches, never solves** (prompt rules + deterministic `filterResponse` + B1
  pre-display gate).
- **No backend / BYOK** — everything client-side, user's own free Gemini key.
- **The 200/day request budget** — the free-tier guardrail.
- **The shipped intent router** — E9 *extends* it, does not replace it.

## 2. Scope

### In scope
- A **three-tier dispatch** for a chat message: route-to-action → context chat →
  bounded tool loop (the LOCKED architecture, §4 below).
- **Two-layer conversation memory**: the existing zero-cost `sessionDigest`
  (long-term "what they did") threaded into chat, plus a **bounded sliding window**
  of recent turns (short-term "what was just said").
- A **bounded, read-only agentic tool loop** with per-round request accounting.
- An **obscured usage indicator** in the header (ring/bar, no raw numbers), with the
  exact `X/200` + metrics moved to Settings.
- **Expanding the labeled golden set** for the (still local-heuristic) classifier.

### Out of scope (explicit non-goals)
- **No LLM/embedding classifier.** The classifier stays the local heuristic
  (reintroducing a per-message classification API call is the exact cost E9 avoids).
- **No backend, no vector DB, no agent framework** (LangGraph/CrewAI). A hand-rolled
  TS control loop in the browser is the deliberate fit.
- **No new write/mutating tools.** The tool allowlist is strictly read-only.
- **No chat-UI visual polish / fluidity** (that's E2), **no onboarding** (E4), **no
  routing-bug fixes** (E3) — those land *after* E9 reshapes the chat surface.
- **No change to how the quick-action buttons behave** or to the exempt action set.

---

## 3. Glossary

- **Tier 1 / route** — a high-confidence intent match dispatches a pre-built action
  (identical to pressing its button). 1 request.
- **Tier 2 / context chat** — free-form answer grounded in problem + code + the two
  memory layers, **no tools**. 1 request.
- **Tier 3 / tool loop** — the model is offered a read-only tool allowlist; it may
  call tools across bounded rounds, each round a request, then produce a final
  answer. 2+ requests.
- **Exempt action** — `CHECK_APPROACH`, `UNDERSTAND_SOLUTION`, `GENERATE_REPORT`
  (per `isSolutionExemptAction`): allowed to contain solution content, so they
  bypass `filterResponse`. A routed exempt match is **never silent** — it becomes a
  confirm affordance.
- **sessionDigest** — the deterministic, zero-API factual summary built by
  `buildSessionDigest(history, progress)`.
- **Request budget** — `GuardrailSettings.maxRequestsPerDay` (default 200), tracked
  by `rate-limiter.ts`.

---

## 4. The LOCKED three-tier architecture (requirement framing)

Per the roadmap, option (b) — route-first, loop-as-fallback — is **locked**; these
requirements encode it rather than re-litigate it.

**R1 — Cheapest-first dispatch.**
- **R1.1** WHEN the user submits a chat message, THE SYSTEM SHALL run the existing
  pure `routeMessage` pipeline (local, zero API) as the first step, before any
  network request.
- **R1.2** WHEN `routeMessage` yields a **high-confidence non-exempt route**, THE
  SYSTEM SHALL dispatch that action exactly as today (Tier 1 — 1 request) and SHALL
  NOT enter context chat or the tool loop.
- **R1.3** WHEN `routeMessage` yields an **exempt route** or a **borderline ask**,
  THE SYSTEM SHALL surface the confirm affordance (unchanged from shipped behavior)
  and SHALL NOT silently enter any tier.
- **R1.4** WHEN `routeMessage` yields **chat** (no strong match / genuine
  multi-intent), THE SYSTEM SHALL enter Tier 2 (context chat).
- **R1.5** WHILE in Tier 2, IF the model determines it needs to fetch data it does
  not already have, THE SYSTEM SHALL escalate to Tier 3 (the tool loop); OTHERWISE
  THE SYSTEM SHALL answer directly in Tier 2 (1 request).
- **R1.6** THE SYSTEM SHALL reach Tier 3 (the multi-request path) ONLY via R1.5 —
  the tool loop is a fallback, never the default path for a chat message.

**R2 — Classifier stays local (no new per-message cost).**
- **R2.1** THE SYSTEM SHALL keep the classifier a local heuristic; it SHALL NOT add
  an LLM or embedding classification call per message.
- **R2.2** THE SYSTEM SHALL bias toward **high-confidence routing** — only a strong
  match routes; everything uncertain falls through to the (now capable) Tier 2/3.
- **R2.3** THE SYSTEM SHALL expand the labeled golden set with additional real
  examples so the over-route rate is measurable; the only sanctioned classifier
  *improvement* for E9 is a larger golden set, not a new classifier.

---

## 5. Two-layer conversation memory

**R3 — Long-term memory via the existing digest (zero extra request).**
- **R3.1** WHEN entering Tier 2/Tier 3 for a chat message, THE SYSTEM SHALL build
  the `sessionDigest` from the current session history (`learningContentRef`) and
  include it in the chat prompt alongside the existing `buildChatData` (problem +
  code).
- **R3.2** THE SYSTEM SHALL build the digest deterministically (reusing
  `buildSessionDigest`) with **zero additional API requests** — it reads structured
  `data`, it does not ask the model to summarize.
- **R3.3** WHEN the session has no structured activity, THE digest SHALL be empty and
  THE SYSTEM SHALL omit it (no empty-block noise), preserving today's behavior.
- **R3.4** THE SYSTEM SHALL treat `progress.hintLevel` as the **authoritative source
  of hint depth**; the digest MAY *report* hint usage for awareness but SHALL NOT
  become a second, independently-incremented hint counter.

**R4 — Short-term memory via a bounded sliding window.**
- **R4.1** WHEN sending a chat message, THE SYSTEM SHALL include the last **N
  conversational turns** (user question + assistant answer pairs) verbatim as prior
  chat context, where N is a small bounded constant (target ≈ 3–4 turns).
- **R4.2** THE SYSTEM SHALL cap the window by a **token/character budget**; IF the
  last N turns exceed the budget, THE SYSTEM SHALL include fewer turns (newest-first)
  rather than exceed the cap.
- **R4.3** THE SYSTEM SHALL draw the window only from **chat turns** (free-form
  Q&A), consistent with "what was just said"; it SHALL NOT replay full action-card
  bodies as prose (the digest is the substitute for action history — R3).
- **R4.4** THE SYSTEM SHALL NOT send the entire transcript; an unbounded history is
  explicitly rejected (it grows per turn and inflates every request — see the cost
  model, R10).

**R5 — Memory is untrusted.**
- **R5.1** THE SYSTEM SHALL treat BOTH memory layers (digest + window) as **untrusted
  content** and SHALL fence them via the existing `wrapUntrusted` framing (prior
  model/scraped/user content can carry an injection).
- **R5.2** Neither memory layer SHALL defeat the no-solutions guardrail: every chat
  turn's output STILL passes `filterResponse` + the B1 pre-display gate (R8).

---

## 6. The bounded agentic tool loop (Tier 3)

**R6 — Read-only tool allowlist (least privilege).**
- **R6.1** THE SYSTEM SHALL offer the model ONLY an explicit, **zero-API,
  read-only** tool allowlist. The v1 set: `getEditorCode`, `getProblemExamples`,
  `getProblemConstraints`. Each tool returns a fact that already exists (a DOM read
  or in-memory data) and SHALL NOT itself make any model/API call.
- **R6.2** THE SYSTEM SHALL NOT expose any tool that writes, mutates state, performs
  network/side-effecting actions, triggers a nested LLM generation, or that the model
  could use to take an action on the user's behalf.
- **R6.3** WHEN the model requests a tool not on the allowlist, THE SYSTEM SHALL
  refuse that call (treat as a no-op/error fed back to the model), never execute it.
- **R6.4** WHEN a tool read fails (e.g. the editor can't be read because the user
  navigated away, or the MV3 worker slept), THE SYSTEM SHALL return a graceful
  "couldn't read X" result to the model so it can answer with what it has, rather
  than throwing and losing the whole turn.
- **R6.5** THE SYSTEM SHALL cap the size of each tool result (truncate oversized
  scraped content) so a large constraints/examples blob cannot inflate the loop
  prompt unbounded (ties to R10.2).
- **R6.6** THE SYSTEM SHALL tell the model, in the loop's system prompt, **what data
  is already in the prompt** (problem description + examples + constraints + the
  user's code when captured + the digest + the recent window) so it does not waste a
  round re-fetching data it already has.

> **Why no `getComplexityOfCurrentCode` (design decision, confirmed with user).**
> Dropped for v1 — redundant two ways over, and it would break the clean cost +
> least-privilege model: (1) "complexity of my code" is **already a first-class
> intent** (`analyze-code` → `CHECK_APPROACH`, weight 30, matched at Tier 1), so it
> never reaches the loop; (2) if the model wants a complexity verdict mid-loop it can
> call `getEditorCode` and **reason about it itself**; and critically (3) unlike the
> three read tools (which do zero inference), a complexity tool has no stored fact to
> read — it would have to make its **own nested Gemini call**, which is an uncounted
> request below the loop, is no longer "read-only," and re-introduces model-generated
> solution-adjacent content through a side door. The three zero-API read tools cover
> every data need the loop can legitimately serve. The two things they deliberately
> do NOT cover — "did my code pass the tests?" (not DOM-readable until Progress Phase
> D) and "give me the editorial solution" (against the guardrail) — are correct gaps,
> not missing tools.

**R7 — Bounded iteration + honest request accounting.**
- **R7.1** THE SYSTEM SHALL enforce a **hard cap of 2 tool rounds**; WHEN the cap is
  reached, THE SYSTEM SHALL force a final answer with the data it has (no further tool
  calls). Worst case per message = 3 requests (2 tool rounds + 1 final answer). The
  cap is a **fixed constant** for v1 (not a user-adjustable Setting — the user chose
  to keep usage low).
- **R7.2** FOR EACH request the loop issues (every round, including the final-answer
  round), THE SYSTEM SHALL call `recordRequest()` and record a metrics sample — so a
  single message that costs N requests counts as N against the 200/day budget, never
  as 1.
- **R7.3** BEFORE each loop request, THE SYSTEM SHALL run the existing
  `checkRateLimit` pre-check; WHEN a round would exceed a cap (daily/per-minute/
  cooldown/kill switch), THE SYSTEM SHALL stop the loop gracefully and return the
  best answer it can from the data gathered so far, surfacing the limit reason.
- **R7.4** THE SYSTEM SHALL be resilient to the classic agent failure mode: no
  infinite loop, no runaway requests — R7.1 + R7.3 together bound it.

**R8 — The loop never bypasses the guardrail.**
- **R8.1** THE loop's **final user-facing answer** SHALL pass through `filterResponse`
  + the B1 pre-display gate exactly like a Tier-2 chat answer (the chat path is
  NON-EXEMPT).
- **R8.2** THE SYSTEM SHALL NOT allow the loop to self-authorize a solution reveal
  that the exempt-confirm gate would normally require — a tool-loop answer is held to
  the same no-solutions standard as ordinary chat.
- **R8.3** THE SYSTEM SHALL treat every **tool result** fed back to the model as
  untrusted and fence it via `wrapUntrusted` before it re-enters the prompt.

**R9 — Pre-flight cost awareness (degrade, don't surprise).**
- **R9.1** WHEN the user is near the daily cap such that a multi-round loop would hit
  the wall mid-way, THE SYSTEM SHOULD degrade to a single-shot answer (Tier 2) rather
  than start a loop it cannot finish. *(SHOULD — nice-to-have; design may defer the
  exact threshold.)*

---

## 7. Cost model (the two axes the design must be explicit about)

**R10 — Two independent cost axes.**
- **R10.1 Request count (200/day):** adding conversation context SHALL add **zero**
  requests — a Tier-1/Tier-2 chat turn is 1 request regardless of how much memory it
  carries. ONLY the Tier-3 tool loop adds requests (one per round, R7.2).
- **R10.2 Tokens per request:** the design SHALL keep per-request input tokens
  **bounded and predictable** via the capped window (R4.2) + the flat digest — an
  unbounded transcript is rejected (R4.4).
- **R10.3** The design SHALL record the three context alternatives and why: (A) full
  transcript — rejected (grows linearly); (B) bounded window + digest —
  **recommended**; (C) rolling LLM summary — rejected (the summary itself costs a
  request, wrong for BYOK/200-a-day).

---

## 8. Obscured usage indicator

**R11 — Header shows a signal, not a number.**
- **R11.1** THE SYSTEM SHALL replace the header's raw `X/200` text with a non-numeric
  **segmented pip meter** (a small row of discrete segments that fill as the user
  approaches the daily cap). A linear fill bar was rejected because in modern IDEs a
  fill bar reads as "context-window used," which would mislead; a segmented
  "allowance" meter reads as quota/budget. *(Confirmed with user.)*
- **R11.2** THE indicator SHALL preserve the "running low" cue: a color shift
  (green → amber → red) as usage nears the cap, so the "slow down" signal survives.
- **R11.3** THE exact `X/200` count AND the existing metrics readout SHALL be
  available in **Settings only** (not removed — relocated).
- **R11.4** THE indicator SHALL update after each request the same way the counter
  does today (including per-round loop increments, R7.2), and SHALL reflect the
  daily reset.
- **R11.5** THE indicator SHALL be accessible (an `aria-label`/`title` conveying the
  approximate state, e.g. "Daily usage: low/moderate/high") so the obscuring is
  visual, not a loss of information for assistive tech.

---

## 9. Preserve the shipped chain (regression guardrails)

**R12 — Nothing shipped regresses.**
- **R12.1** `routeMessage` and the pure `classify → resolveOverlap → route` pipeline
  SHALL remain pure (no side effects, no network); E9 adds tiers *after* the `chat`
  effect, it does not alter the router's three-way decision.
- **R12.2** `filterResponse`, `isSolutionExemptAction`, the B1 pre-display gate,
  `getChatSystemPrompt`, and `wrapUntrusted` SHALL remain intact and on the chat
  path.
- **R12.3** The exempt-action confirm affordance behavior (shipped
  `chat-intent-routing`) SHALL be unchanged.
- **R12.4** Tier-1 routed actions and the existing quick-action buttons SHALL behave
  exactly as today.
- **R12.5** The existing `~277` tests SHALL continue to pass; new behavior
  (loop bounding, per-round accounting, memory windowing, tool allowlist) SHALL be
  covered by new tests.

---

## 10. Verification / acceptance

**R13 — Done means:**
- **R13.1** `npm.cmd run build` compiles clean (`tsc -b && vite build`).
- **R13.2** `npm.cmd run test` passes (baseline ~277 + new tests).
- **R13.3** New unit tests cover: per-round `recordRequest` accounting (N requests
  for N rounds), the loop iteration cap forcing a final answer, the window token cap
  trimming oldest turns, the digest threading into the chat prompt, the tool
  allowlist rejecting an unknown tool, and tool results flowing through
  `wrapUntrusted`.
- **R13.4** The golden-set test still passes with the expanded set, and the
  "solution-seeking message never silently reaches an exempt action" case still
  holds.
- **R13.5 (visual).** The obscured usage indicator and any chat-path UI change are
  eyeballed by the user in the built, reloaded extension before commit (workflow
  rule).

---

## 11. Resolved decisions (confirmed with user)

All open questions are resolved; recorded here so the design doesn't re-litigate.

1. **Tool-call streaming.** Tool-call rounds run **non-streaming**; only the **final
   answer streams**. The tool loop reuses the **same "Thinking" placeholder** as the
   existing B1 gate — **no new UX, no behavioral change** to how chat already feels.
2. **Loop round cap = 2 tool rounds** (worst case 3 requests). Rationale: 1 round
   can't do a two-step fetch ("read code → realize I also need constraints → fetch");
   2 covers essentially every realistic case; the cap is a fixed constant we can tune
   up later if the eval shows it's too tight.
3. **Window = last 3 turns**, ~2–3k char budget. Locked.
4. **Loop cap + window size are FIXED CONSTANTS for v1** — no new Settings knobs. The
   user explicitly does not want higher usage yet.
5. **Usage indicator = segmented pip meter** (green → amber → red), not a ring (ring
   reads as "context used" in IDEs) and not a linear bar (same connotation). The user
   will eyeball it in the build; if the pips don't land, swapping the glyph is a small
   change.
6. **Tool allowlist = 3 zero-API read tools** (`getEditorCode`, `getProblemExamples`,
   `getProblemConstraints`); `getComplexityOfCurrentCode` **dropped** (see the box
   under R6). No real data scenario is lost: the two uncovered asks — "did my code
   pass the tests?" and "give me the editorial" — are correctly out of reach
   (unverifiable until Progress Phase D / against the guardrail).
7. **Edge-case resolutions folded into the requirements:** graceful tool failures
   (R6.4), capped tool-result size (R6.5), the system prompt declares what's already
   in context so the model doesn't re-fetch (R6.6), the conversation window reads from
   `learningContentRef` (not the stale `useCallback` closure — the same lesson the
   digest already applies), and the loop's final answer stays NON-EXEMPT through
   `filterResponse` + the B1 gate (R8).
