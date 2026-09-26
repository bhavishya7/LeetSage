# LeetSage — Action Streamlining: Requirements

> **Status: 📐 Planned — not yet built.** A pre-launch UI/UX change. It reduces the
> quick-action set to the essential few (all flat and always visible) and removes
> the "More" overflow, so the interface is simple and every option is discoverable
> at a glance. The cut actions' *capabilities* stay in the code (dereferenced from
> the UI, not deleted) so the upcoming chat-intent-routing feature can still reach
> them.
>
> Companion: [design.md](./design.md) · [tasks.md](./tasks.md) ·
> code: `src/components/QuickActions.tsx`, `src/types/models.ts`,
> `src/services/prompts.ts`, `src/sidepanel/App.tsx`.
>
> **Depends on / relates to:**
> - Sits between the shipped **guardrail-hardening** work and the planned
>   **`leetsage-chat-intent-routing`** spec. Routing will dispatch chat messages to
>   whichever actions survive here, and **owns the discovery affordances** (suggested
>   prompts / rotating placeholder). This spec does NOT build discovery UI.

---

## Motivation

The action bar currently exposes **9 actions** split into a PRIMARY row and a
SECONDARY set hidden behind a **"More ▾"** toggle. Two problems:
1. **Too many options** create decision paralysis; several overlap heavily
   ("Break down", "Concept", "Pattern", "Complexity", "Examples" are all flavors of
   "help me understand this problem").
2. **Hiding options behind "More" hurts discovery** — good UI keeps its essential
   options visible.

The developer (the sole current user) has **never used** any of the five
overlapping actions. They don't earn a button. Chat (now code-aware and guardrailed
after guardrail-hardening) plus the upcoming routing feature will cover those
intents instead.

## Scope

**UI/UX + wiring only.** This spec does NOT touch the solution filter, the
guardrail, streaming/gate logic, or routing logic. It changes which buttons the UI
shows and their layout/styling.

---

## Requirements

### R1 — The surviving action set (flat, always visible)
- **R1.1** THE action bar SHALL show exactly these four actions, always visible,
  never hidden behind an overflow:
  - 💡 **Hint** (`GET_HINT`)
  - 🔬 **Analyze my code** (`CHECK_APPROACH`)
  - 🧠 **Understand solution** (`UNDERSTAND_SOLUTION`)
  - 📝 **Generate report** (`GENERATE_REPORT`)
- **R1.2** THE free-form **chat box** SHALL remain below the action row as today.

### R2 — Remove the overflow and the five niche buttons
- **R2.1** THE "More ▾ / Less ▴" toggle SHALL be **removed entirely** (not just
  emptied).
- **R2.2** THE five niche action buttons SHALL be removed from the UI:
  `GENERATE_EXAMPLES`, `EXPLAIN_CONCEPT`, `TIME_COMPLEXITY_HINT`,
  `PATTERN_RECOGNITION`, `BREAK_DOWN_PROBLEM`.

### R3 — Keep the underlying capabilities (do NOT delete)
- **R3.1** THE five removed actions' entries in `ActionType` (`models.ts`) SHALL be
  **kept** (dereferenced from the UI, not deleted).
- **R3.2** Their system prompts and any wiring in `prompts.ts` / `App.tsx`'s
  `handleActionClick` SHALL be **kept** so a future feature (chat-intent-routing)
  can dispatch to them.
- **R3.3** It is acceptable that these action types/prompts are temporarily
  **unreferenced by the UI** in the interim before routing ships.

### R4 — Layout & styling (good UI for a flat row)
- **R4.1** WITH only four actions + chat, the buttons SHALL fit a clean, flat
  layout without an overflow control.
- **R4.2** THE styling SHALL keep the essential actions scannable and clearly
  tappable (the existing context-aware emphasis for code-actions when code is
  present MAY be retained or simplified — a UI judgement to confirm visually).
- **R4.3** This is a visual change → it SHALL be reviewed by the user (eyeballed in
  the reloaded extension) before committing (per `workflow.md`).

### R5 — Non-goals (explicit)
- **R5.1** Discovery affordances (rotating placeholder, "Try asking…" chips) are
  **NOT** in this spec — they belong to `leetsage-chat-intent-routing`.
- **R5.2** Chat intent-routing itself is NOT in this spec.
- **R5.3** No filter/guardrail/streaming/routing logic changes.
- **R5.4** No deletion of action types or prompts.

### R6 — Verification
- **R6.1** `npm.cmd run build` SHALL be clean and `npm.cmd run test` SHALL pass
  (CI + Husky gate lint + test + build). Existing tests SHALL not regress; if any
  test referenced the removed buttons, update it to match the new UI.

---

## Interim state (acceptable, by decision)

Streamlining ships **before** routing. In that window the five intents have no
button; a user who types e.g. "what pattern is this?" gets a normal code-aware
chat answer (good enough post-guardrail-hardening) — just not yet dispatched to the
specialized prompt. The sole user has confirmed this interim is fine (not shipped;
they are the only user).
