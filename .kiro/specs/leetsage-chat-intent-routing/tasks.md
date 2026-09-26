# LeetSage — Chat Intent Routing: Tasks

> **Status: 📐 Planned — not started.** Implementation breakdown for
> [requirements.md](./requirements.md) / [design.md](./design.md). Build in a fresh
> focused session per `.kiro/steering/workflow.md` (explain-and-STOP before
> committing; UI eyeballed; CI/Husky gate lint+test+build). Rx refs → requirements.

---

- [ ] 1. Intent registry (data-driven) *(R6.1, design §2)*
  - Define `IntentDef` and `INTENT_REGISTRY` (one entry per routable intent:
    `id`, `target: ActionType`, `patterns`, `weight`, optional
    `requiresCodeContext`). Exemptness is DERIVED via `isSolutionExemptAction`,
    never stored. Put it in its own module (e.g. `src/services/intent-router/`).

- [ ] 2. `classify(message, context)` → `Candidate[]` *(R2.1, R6.2)*
  - Pure, local, no API. Match the message against registry patterns; return all
    matches with a confidence score. Context carries `hasCode`.

- [ ] 3. `resolveOverlap(candidates, context)` → `Decision` *(R4, R5)*
  - Pure. Returns a **three-way** decision: `route(action)` | `ask(action)` |
    `chat`. Apply precedence: context-sharpening → weight → confidence bands
    (high → `route`; borderline → `ask`; low/none → `chat`).
  - Detect genuine multi-intent (multiple high-confidence, different families,
    uncollapsible) → return `chat` (design §5). Never return multiple actions.

- [ ] 4. `route(decision)` dispatch + the guardrail *(R3, R4, R7)*
  - `route(action)` **non-exempt** → call existing `handleActionClick(target)`
    (identical to a button press).
  - `route(action)` **exempt** (`isSolutionExemptAction(target)`) → do NOT dispatch;
    raise the **confirm** affordance. "Yes" → `handleActionClick(target)`;
    "Just answer" → chat.
  - `ask(action)` (borderline, any action) → raise the **same** confirm affordance
    ("Did you want X, or just an answer?").
  - `chat` → existing free-form `handleChatSubmit` path unchanged.

- [ ] 5. Wire into `App.tsx` `submitChat` / `handleChatSubmit` *(design §7)*
  - Pre-step: assemble context (editor code already available), classify → resolve
    → route. Do NOT modify `filterResponse`, the pre-display gate, or
    `getChatSystemPrompt` — routing sits in front of them.

- [ ] 6. Confirm affordance UI (one component, reused) *(R3.2, R4.4, R9)*
  - A lightweight in-chat confirm keyed on `{ prompt, action }`, reused for BOTH the
    exempt-action guardrail and the borderline `ask` outcome. "Yes" →
    `handleActionClick`; "Just answer" → chat. Subtle "ran X" indication for direct
    non-exempt routes. **UI change → get the user to eyeball it before committing.**

- [ ] 7. Discovery affordances *(R8)*
  - Rotating/suggestive placeholder + optional dismissible "Try asking…" chips. No
    API call on their own. **UI change → user review before commit.**

- [ ] 8. Labeled golden set + guardrail test *(R10, R11, guard)*
  - `message → expected outcome (route:<action> | ask | chat)` dataset seeded with
    the three real examples: "what is the current time complexity" (+code) →
    route:Analyze (or ask, if borderline); "difference between a set and a dict in
    Python?" → chat; "explain the optimal solution" → exempt → confirm (not silent).
    Cover confident match, overlap, borderline `ask`, multi-intent, no-match.
  - The set doubles as the router's **accuracy metric** (it's a classifier) — a
    routing regression fails the test.
  - Explicit test: a solution-seeking message ("just give me the full solution")
    does NOT silently reach a filter-exempt action.

- [ ] 9. Verify + docs
  - `npm.cmd run build` clean; `npm.cmd run test` passes (lint+test+build gated).
  - Update `.kiro/specs/README.md`; mark **B6** in the guardrail-hardening bug
    registry as resolved-by-this-spec.

- [ ] 10. **Explain what was built and STOP for the user's review before
  committing.** Commit in logical groups (registry+pipeline / dispatch+guardrail /
  UI / tests); detailed messages via `git commit -F`; don't push/merge without
  being asked.

---

## Explicitly NOT in this session

- LLM-based classifier (keep the `classify()` seam so it can be swapped later).
- Action chaining / multi-step agentic sequences (multi-intent → chat instead).
- Changes to the four surviving buttons, the filter, the pre-display gate, or the
  chat prompt — routing consumes them, doesn't modify them.
