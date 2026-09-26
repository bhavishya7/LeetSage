# LeetSage — Action Streamlining: Design

> **Status: 📐 Planned — not yet built.** Design for [requirements.md](./requirements.md).
> Same teaching format: **DESIGN** decision + **📚 SYSTEM-DESIGN LESSON**.
> Grounds against `src/components/QuickActions.tsx` (the current PRIMARY/SECONDARY
> chip split + "More" toggle), `src/types/models.ts` (`ActionType`),
> `src/services/prompts.ts`, `src/sidepanel/App.tsx` (`handleActionClick`).

---

## 1. The decision: cut to four flat actions, no overflow

**Today.** `QuickActions.tsx` has a `PRIMARY` array (4 chips incl. `Break down`) and
a `SECONDARY` array (5 chips) revealed by a `showMore` toggle ("More ▾ / Less ▴").

**Change.** The action bar becomes a single flat row of four, always visible:
`GET_HINT`, `CHECK_APPROACH`, `UNDERSTAND_SOLUTION`, `GENERATE_REPORT`. The
`SECONDARY` set, the `showMore` state, and the "More/Less" toggle button are
removed. `BREAK_DOWN_PROBLEM` (currently in PRIMARY) moves out of the UI along with
the four SECONDARY niche actions.

**Why these four survive:** each is a distinct, high-value intent with no real
overlap — get unstuck (Hint), review my code (Analyze), learn the optimal
(Understand), save a study note (Report). The five cut ones ("Break down",
"Concept", "Pattern", "Complexity", "Examples") are overlapping "understand the
problem" flavors the sole user never used; chat + routing will cover them.

> 📚 **SYSTEM-DESIGN LESSON — a feature that is never used is a cost, not an
> asset.** Every visible control adds decision load for the user and surface area
> to build, test, and harden. Cutting unused options is *negative work that adds
> value* — fewer things to get wrong before launch. "Hiding behind More" was
> treating a curation problem as a layout problem.

## 2. Keep the capabilities; only remove the buttons

**Change.** Remove the five chips and their `SECONDARY` wiring in `QuickActions`,
but **keep**:
- the five `ActionType` values in `models.ts` (dereferenced from UI, not deleted),
- their system prompts + `buildUserMessage` cases in `prompts.ts`,
- the `handleActionClick` dispatch path in `App.tsx` (it still handles any
  `ActionType`; it just won't be called for these until routing exists).

**Why.** The upcoming `chat-intent-routing` spec will dispatch chat messages to
these exact actions. Deleting them now would mean re-adding them (and re-writing
the prompts) later — churn and risk. Dereferencing is cheap and reversible.

> 📚 **SYSTEM-DESIGN LESSON — separate the capability from its entry point.** A
> button is one *entry point* to a capability, not the capability itself. Removing
> the entry point while preserving the capability keeps the door open for a better
> entry point later (smart chat routing) without throwing away working code. This
> is the same reason you keep an API endpoint even when you redesign the UI that
> calls it.

## 3. Layout & styling

**Change.** Four chips in a flat `flex` row (the existing wrapper already uses
`flex flex-wrap items-center gap-2` — with four items it won't need to wrap in a
normal panel width, and there's no overflow control to reason about). The existing
context-aware emphasis (code-actions highlighted when `hasCode`) MAY be retained,
simplified, or dropped — a visual call to make during review. The `renderChip`
styling stays; only the arrays and the toggle change.

> 📚 **SYSTEM-DESIGN LESSON — visibility of options (Nielsen heuristic).** "Make
> the system's status and available actions visible" — hiding actions behind an
> overflow forces recall over recognition. Four always-visible, well-labeled
> actions let the user *recognize* what they can do without hunting.

**Review gate.** This is a visual change; per `workflow.md` the build session must
get the user to eyeball the reloaded extension before committing.

## 4. What this does NOT touch

The solution filter, the guardrail, the B1 streaming/pre-display gate, chat logic,
and (not-yet-built) routing are all **out of scope**. This is a chip-array + layout
change plus a small wiring cleanup. Discovery affordances (suggested prompts,
rotating placeholder) belong to the routing spec, not here.

> 📚 **SYSTEM-DESIGN LESSON — keep a change's blast radius tight.** A UI cleanup
> that also touched the filter or chat logic would be hard to review and risky to
> ship. Scoping this to "buttons + layout + dereference" makes it a small,
> low-risk, easily-reviewed diff — the right size for a pre-launch polish change.

## 5. What would change this design

- **`chat-intent-routing`** will re-reference the kept action types (dispatch
  targets) and add discovery UI — a *consumer* of what this spec leaves in place.
- If, in review, four buttons feel too sparse or a fifth proves genuinely
  essential, revisit R1 — but the current evidence (zero usage of the five) says
  four is right.
