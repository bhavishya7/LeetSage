# LeetSage — Chat Intent Routing: Requirements

> **Status: 📐 Planned — not yet built.** The last pre-launch feature. The chat box
> becomes a smart entry point: when a typed question is really one of the existing
> actions in disguise, route it to that action (which has the right prompt,
> structured output, filter/exempt handling, and progress tracking); otherwise fall
> through to the existing free-form chat path (code-aware + guardrailed).
>
> Companion: [design.md](./design.md) · [tasks.md](./tasks.md).
> **Depends on** the shipped **action-streamlining** (which action buttons survive)
> and **guardrail-hardening** (code-aware chat + the pre-display gate + the
> `isSolutionExemptAction` predicate). Originated as **B6** in the
> guardrail-hardening bug registry.
>
> Grounds against real code: `src/sidepanel/App.tsx` (`handleChatSubmit`,
> `handleActionClick`), `src/services/llm-service.ts` (`buildChatData`,
> `streamLLMRequest`), `src/services/prompts.ts` (`getChatSystemPrompt`, the kept
> action prompts), `src/services/solution-filter.ts` (`isSolutionExemptAction`),
> `src/types/models.ts` (`ActionType`).

---

## The idea

```
user types a message
   → classify intent
      → confident match to an action?  → route to that action (with a confirm
                                          step if the action is filter-exempt)
      → else / ambiguous / no match     → existing free-form chat (code-aware,
                                          filtered, guardrailed)
```

Discovery lives here too: because the five niche actions no longer have buttons
(action-streamlining), chat must *teach* users those intents exist.

## Design constraints the spec must satisfy (the hard questions)

- **Cost per ask (BYOK, free tier):** classification must not routinely add a
  second API call before the real one. Latency already stings (guardrail B5).
- **Intent overlap:** a message can plausibly match several intents ("what's the
  complexity of my code?" ≈ Analyze + Complexity). The design must resolve overlap
  deterministically, not arbitrarily.
- **Multi-intent in one message:** ("explain the pattern AND give me examples").
  The design must define exactly what happens — not silently pick one or fire
  several API calls.
- **Future-proofing:** adding a new intent later must be a small, localized change
  (a data entry), not a rewrite.
- **The guardrail hole:** routing free text into a filter-exempt action is a way to
  bypass the "never reveal the solution" gate by phrasing.

---

## Requirements

### R1 — Route or fall through
- **R1.1** WHEN the user submits a chat message, THE SYSTEM SHALL classify it and,
  on a **confident** match to a routable action, route to that action; otherwise it
  SHALL use the existing free-form chat path.
- **R1.2** THE default on any uncertainty (low confidence, ambiguity, no match)
  SHALL be to fall through to free-form chat — routing is opt-in-by-confidence,
  never a guess.

### R2 — Classifier: local-first, no mandatory extra API call *(cost)*
- **R2.1** THE v1 classifier SHALL be a **local, deterministic heuristic** (keyword
  / pattern matching over the message), adding **zero** API calls and ~zero latency.
- **R2.2** THE SYSTEM SHALL route only above a confidence threshold; below it, fall
  through to chat.
- **R2.3** An LLM-based classifier is **explicitly rejected for v1** (it would add a
  second API call + tokens + latency before the real call). The design SHALL keep
  the classifier behind a clean interface so an LLM classifier *could* be swapped in
  later without touching call sites (future-proofing).

### R3 — The guardrail rule (non-negotiable) *(guardrail hole)*
- **R3.1** Chat SHALL NEVER **silently** route to a **filter-exempt** action
  (any action where `isSolutionExemptAction()` is true — today `CHECK_APPROACH`,
  `UNDERSTAND_SOLUTION`, `GENERATE_REPORT`). Reaching a solution-bearing action must
  stay a deliberate user act.
- **R3.2** WHEN classification matches an exempt action, THE SYSTEM SHALL **confirm
  with the user first** (a one-tap "Looks like you want to X — [do it] / [just
  answer]") rather than auto-firing it. The user's tap is the deliberate act.
- **R3.3** Non-exempt actions MAY route without a confirm (they still pass through
  `filterResponse` + the pre-display gate), though a confirm affordance is allowed
  as a UX choice.
- **R3.4** THE guardrail rule SHALL be enforced structurally (keyed on
  `isSolutionExemptAction`), so adding a future exempt action automatically inherits
  the confirm requirement — not a hand-maintained list.

### R4 — Three-way decision with an ABSTAIN band *(overlap, confidence)*
- **R4.1** THE resolver SHALL return one of **three** outcomes, not two:
  **`route`** (a specific action, confident), **`ask`** (borderline/ambiguous — ask
  the user which they meant), or **`chat`** (low/no confidence — just answer).
  (Modeled on the allow/deny/**abstain** pattern from 2026 intent-classifier
  practice: an explicit "not sure" band beats a binary threshold that guesses.)
- **R4.2** WHEN a message matches multiple intents, THE SYSTEM SHALL resolve by a
  **documented, deterministic precedence** (context-sharpening → weight →
  confidence), not by match order or randomness.
- **R4.3** Overlap resolution SHALL consider available context (e.g. whether editor
  code is present) as a tiebreaker where it sharpens intent.
- **R4.4** WHEN confidence is in the **borderline band** (a plausible match the
  resolver can't make decisively), THE SYSTEM SHALL return `ask` — surfacing a
  lightweight "Did you want X, or just an answer?" prompt — rather than silently
  routing (risking a wrong-shaped answer) or silently falling through (losing a
  likely-useful route). Reuse the same confirm affordance as R3.2.
- **R4.5** WHEN confidence is below the borderline band, THE SYSTEM SHALL fall
  through to `chat` (R1.2) — chat addresses a broad question directly anyway.

### R5 — Multi-intent handling *(multi-intent)*
- **R5.1** THE SYSTEM SHALL NOT silently fire multiple actions (multiple API calls)
  from one message.
- **R5.2** WHEN a message clearly contains multiple distinct intents, THE SYSTEM
  SHALL either (a) route to the single best/primary intent, or (b) fall through to
  free-form chat (which can answer a multi-part question in one response) — the
  design SHALL pick one behavior and document it. **Default recommendation: fall
  through to chat for genuine multi-intent**, since one chat call answers the whole
  question in one cost unit.
- **R5.3** THE SYSTEM SHALL never chain/auto-sequence actions in v1.

### R6 — Extensibility / future-proofing *(future intents)*
- **R6.1** Intents SHALL be defined as **data** (a registry: intent → target
  `ActionType`, match patterns, exempt flag derived from `isSolutionExemptAction`,
  precedence weight), so adding an intent is adding a table entry — not editing
  routing control flow.
- **R6.2** THE classifier, the overlap-resolver, and the router SHALL be separate,
  independently-testable units (a pipeline), so any one can change without the
  others.

### R7 — Input synthesis for routed actions
- **R7.1** WHEN routing to an action, THE SYSTEM SHALL supply the inputs that action
  needs (e.g. `hintLevel` for `GET_HINT`, session digest for `GENERATE_REPORT`,
  editor code for the code-aware actions — chat already extracts code), reusing the
  existing `handleActionClick` path so behavior matches a button press exactly.

### R8 — Discovery (this spec owns it)
- **R8.1** THE chat input SHALL advertise routable intents so users discover the
  capabilities that no longer have buttons — e.g. a **rotating/suggestive
  placeholder** and/or a small set of **"Try asking…" example chips**.
- **R8.2** Discovery affordances SHALL be lightweight and dismissible/non-intrusive;
  they SHALL NOT trigger an API call on their own.

### R9 — Transparency
- **R9.1** WHEN a message is routed, THE SYSTEM SHALL make it evident that a specific
  action ran (the resulting card is already action-labeled), so the user isn't
  surprised by a differently-shaped answer. The confirm step (R3.2) covers exempt
  actions; for non-exempt routes a subtle indication is sufficient.

### R10 — Verification & router accuracy *(guard, per the bug-registry principle)*
- **R10.1** THE SYSTEM SHALL have a **labeled test set** ("golden set") mapping
  example messages → expected outcome (`route:<action>` / `ask` / `chat`), seeded
  with the three real observed examples (see design), covering confident match,
  overlap, borderline/`ask`, multi-intent, and no-match.
- **R10.2** THE router SHALL be **measured** against that set (it is a classifier,
  so treat it like one) — the test set doubles as an accuracy check, so a change
  that regresses routing is caught. Note (2026 practice): classification accuracy
  degrades as the number of intents grows — a documented reason to keep the intent
  set small (the streamlining work already did this).
- **R10.3** THERE SHALL be an explicit test that a solution-seeking message
  (e.g. "just give me the full solution") does **NOT** silently reach a filter-exempt
  action (R3).
- **R10.4** `npm.cmd run build` + `npm.cmd run test` pass (CI + Husky gate).

### R11 — Right-sized classifier (rejected alternatives, documented)
- **R11.1** THE design SHALL explicitly reject, as over-engineered for ~9
  client-side intents with no backend: **vector/semantic routing**, a **fine-tuned
  LLM router**, and a **per-request LLM classifier** (v1). The local heuristic is
  the right-sized choice; the `classify()` seam allows a later upgrade if the
  golden-set accuracy proves insufficient.

---

## Non-goals

- LLM-based classification (v1 is heuristic; interface allows later swap).
- Action chaining / multi-step agentic sequences.
- Any change to the four surviving buttons (action-streamlining owns the button set).
- Changes to the filter/guardrail logic itself (this consumes `isSolutionExemptAction`,
  doesn't modify it).
