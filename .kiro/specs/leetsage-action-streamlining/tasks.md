# LeetSage — Action Streamlining: Tasks

> **Status: 📐 Planned — not started.** Implementation breakdown for
> [requirements.md](./requirements.md) / [design.md](./design.md). Build in a fresh
> focused session following `.kiro/steering/workflow.md` (explain-and-STOP before
> committing; get the UI eyeballed; CI/Husky gate lint+test+build). Requirement
> refs (Rx) point at requirements.md.

---

- [ ] 1. Reduce the action set in `QuickActions.tsx` *(R1, R2)*
  - Collapse to a single flat list of four chips: `GET_HINT`, `CHECK_APPROACH`,
    `UNDERSTAND_SOLUTION`, `GENERATE_REPORT` (all always visible).
  - Remove the `SECONDARY` array, the `showMore` state, and the "More ▾ / Less ▴"
    toggle button entirely.
  - Move `BREAK_DOWN_PROBLEM` out of the visible set (along with the four former
    SECONDARY actions).

- [ ] 2. Keep the capabilities intact *(R3)*
  - Do NOT delete any `ActionType` value in `models.ts`.
  - Do NOT delete the removed actions' prompts/`buildUserMessage` cases in
    `prompts.ts`, nor the generic `handleActionClick` path in `App.tsx`.
  - It's fine that `GENERATE_EXAMPLES` / `EXPLAIN_CONCEPT` / `TIME_COMPLEXITY_HINT`
    / `PATTERN_RECOGNITION` / `BREAK_DOWN_PROBLEM` become temporarily
    UI-unreferenced.

- [ ] 3. Layout & styling pass *(R4)*
  - Ensure the four chips render as a clean flat row (no overflow control).
  - Decide (visually, with the user) whether to keep/simplify the context-aware
    code-action emphasis (`hasCode` → highlight Analyze/Understand).
  - **UI change → get the user to eyeball the reloaded extension before
    committing.**

- [ ] 4. Fix up references / dead code from the removal *(R6)*
  - Remove now-unused imports/vars introduced only for the SECONDARY set / toggle.
  - Check for anything that referenced `showMore` or the removed chips.

- [ ] 5. Tests & verification *(R6)*
  - Update any test that asserted the presence of the removed buttons or the
    "More" toggle to match the new four-action UI.
  - `npm.cmd run build` clean; `npm.cmd run test` passes (lint + test + build gated
    by CI + Husky). No unrelated regressions.

- [ ] 6. Docs *(process)*
  - Add this spec to `.kiro/specs/README.md` with status; note the dependency that
    `chat-intent-routing` will re-reference the kept actions and own discovery.

- [ ] 7. **Explain what changed and STOP for the user's review before committing.**
  Then commit (detailed message via `git commit -F`), staging specific files; don't
  push/merge without being asked.

---

## Explicitly NOT in this session

- Discovery affordances (suggested prompts, rotating placeholder) → `chat-intent-routing`.
- Intent routing / any chat logic changes → `chat-intent-routing`.
- Any filter / guardrail / streaming / routing logic → out of scope.
- Deleting action types or prompts → keep them (R3).
