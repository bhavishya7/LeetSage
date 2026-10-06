# LeetSage — Chat Polish, Routing-Bug Fixes & Onboarding (E2 + E3 + E4)

> **Spec rigor note (why design-only):** This is the "small, well-understood,
> UI-focused" bucket per `.kiro/steering/workflow.md` → Spec discipline. The scope
> is a concrete, enumerated checklist (below), the requirements are self-evident
> from it, and it's almost entirely presentational. So this is a **single
> design-only spec** covering three related roadmap items (E2 polish, E3 routing
> bugs, E4 onboarding) that all live on the **same chat surface** and overlap
> heavily (the discovery chips appear in all three). A full requirements/tasks
> trilogy would be ceremony out of proportion to the work.
>
> **This spec will be revised in the build session.** The user has said they
> expect to make changes when they actually work on it in a dedicated session —
> treat this as the starting design, not a frozen contract. In particular the
> exact gradient, timings, and spacing values are starting points to be tuned by
> eye (see "Visual-review gate").
>
> **Status:** 📐 Designed, NOT built. One branch (`feature/chat-polish`) when work
> starts.

---

## 1. Motivation

The chat panel works but feels **barebones**: content appears instantly with
almost no motion (the only animations today are the thinking-dots and the
confirm-affordance pop-in), the chrome is uniformly **gray** with no color
identity, spacing is **tight/cramped**, and the streaming experience lacks the
"alive" feel modern IDE chatbots have (including a blinking cursor that exists in
code but rarely shows — see E3-adjacent note in §4). The user compared it to
LeetCode's internal assistant, which feels fluid, spacious, and cohesively themed.

**Hard constraint — NOT a LeetCode clone, and NOT a capability expansion.** This
is *polish* (motion, color, spacing) on the EXISTING feature set. Explicitly
**out of scope:** Mermaid diagrams / "idea maps" / richer generative visual output
(a capability change, and some of it — e.g. full-solution flowcharts — would
directly violate the no-solutions guardrail). No model picker, no agent toggle, no
structural change.

---

## 2. Current state (verified in code, 2026-10-05)

- **Motion:** cards (`ContentCard`) and the user bubble (`UserBubble`) mount with
  NO entrance animation — instant appearance. Buttons/chips have only
  `transition-colors` on hover; no press feedback, no mount motion. Card
  expand/collapse is an instant conditional render. Only existing animations:
  `leetsage-dot-pulse` (thinking dots) and `leetsage-pop-in` (confirm affordance),
  both in `src/index.css`, both `prefers-reduced-motion`-gated.
- **The "blinking cursor" that 'failed':** it IS in `ContentDisplay.tsx` —
  `{isStreaming && !isGated && item.content && <span className="... animate-pulse ml-0.5" />}`.
  It only renders for **exempt** streaming actions **that already have content**.
  Because the B1 pre-display gate withholds content for non-exempt actions (incl.
  chat) until the filter runs, the cursor almost never appears in practice. So the
  fix is placement/logic, not "we can't do it."
- **Color:** accent is **blue** throughout (user bubble `bg-blue-600`, Send button
  `bg-blue-500`, focus ring `ring-blue-400`, active header toggles `text-blue-500`).
  Per-section heading colors exist (`headingColor()` in `ContentDisplay.tsx`) and
  are good — keep them. The chrome (header, cards, input, chips, banners) is all
  `neutral-*` gray. No signature identity color.
- **Spacing:** compact — `px-3 py-2` bars, `mb-2` between cards, `text-[13px]`
  body. Reads as cramped.
- **Discovery chips (E3 territory):** `TRY_ASKING_CHIPS` in
  `src/components/discovery-prompts.ts`, rendered in `App.tsx` under a
  `Try asking:` label; chip `onClick={() => setChatInput(chip)}` only POPULATES.
  `PLACEHOLDER_EXAMPLES` prefixes 5 of 6 entries with `Try: …`.
- **Onboarding (E4 territory):** empty state in `ContentDisplay.tsx` ("🧠 Tap a
  quick action below…"). No first-run/API-key welcome beyond the amber "Add your
  Gemini key" button in `App.tsx`.

Files in play: `src/components/ContentDisplay.tsx`, `src/sidepanel/App.tsx`,
`src/index.css`, `src/components/discovery-prompts.ts`, and the quick-action /
Send / chip buttons. Tailwind 4 + Vite.

---

## 3. E2 — Fluidity & visual polish (the concrete checklist)

### 3.1 Motion / animations
- **Card + bubble entrance:** fade + slight rise on mount (reuse/tune
  `leetsage-pop-in`; softer, ~150–200ms). No more instant appearance.
- **Button / chip press feedback:** subtle `:active` scale-down (~0.97) + smooth
  hover transitions on quick-action chips, Try chips, and Send.
- **Card expand/collapse:** animate height/opacity instead of instant toggle
  (a max-height or grid-rows transition; keep it cheap — no layout jank).
- **Streaming "typing" feel + the blinking cursor:** make a real blinking cursor
  appear DURING streaming, including at the moment a gated non-exempt card reveals
  its filtered content. Fix the render condition so it isn't dead for chat/gated
  actions. This is the specific thing the user tried and couldn't land.
- **ALL motion gated behind `prefers-reduced-motion: reduce`** (the project's
  established pattern — see the two existing `@media` blocks in `index.css`).

### 3.2 Color identity — the "Sage" gradient
- Introduce ONE **signature gradient accent** used sparingly as the identity, so
  the panel stops reading as flat gray.
- **Chosen direction: sage-green → teal** ("Sage", true to the product name — a
  calm, muted, organic green sliding into teal; distinct from LeetCode's
  purple-blue). Honest naming note: the color *sage* is a grey-green, NOT
  turquoise; the "light turquoise/cyan" the user pictured is this green→teal
  blend. Starting tokens (TUNE BY EYE in the build session):
  - light accent stop ~ `#7CB9A8` / Tailwind `emerald-300`-ish (sage)
  - deep accent stop ~ `#0E7C86` / `teal-600`-ish
  - gradient e.g. `bg-gradient-to-r from-emerald-400 to-teal-500` (approx).
- **Documented ALTERNATIVE (one-line flip):** sage-green → **cyan**, brighter /
  techier (`from-emerald-400 to-cyan-500`). The user leaned toward turquoise, so
  make the gradient a single CSS token/util the user can swap after eyeballing.
- **Where the accent goes (sparing, cohesive — not everywhere):** the panel
  header strip, the **Send** button, the active/streaming state, and the **user
  bubble** (replace `bg-blue-*`). Focus ring → the accent.
- **Keep** the per-section `headingColor()` palette and the **amber** complexity
  badge as a warm counterpoint (so it's not monochrome green). Do NOT recolor the
  Easy/Medium/Hard difficulty colors (semantic) or the red error / semantic states.
- Must work in BOTH light and dark themes (the panel has a manual toggle).

### 3.3 Breathing room
- A measured increase in default spacing (card padding, inter-card gap, input-bar
  padding, body line-height) so it feels less cramped — but it's a NARROW side
  panel, so bump deliberately, don't sprawl. Tune by eye.

### 3.4 Chips as integrated suggestion pills (overlaps §4 E3)
- Restyle the Try chips to feel like designed suggestion pills (accent-tinted
  border/hover, the new spacing), consistent with the sage identity.

---

## 4. E3 — Chat intent-routing bugs → fix here + log to the bug registry

Both are concrete and verified in code. Per the registry principle
(guardrail-hardening spec), **each fix adds a guarding test**, and each gets a Bx
entry in that spec's registry.

### 4.1 Duplicate "Try" (new registry id, e.g. B11)
Two discovery surfaces both say "Try": the chip row label `Try asking:` AND the
rotating placeholder's `Try: …` prefix (5 of 6 `PLACEHOLDER_EXAMPLES`). On an empty
chat (first-run — exactly when both show) the user sees "Try" twice.
- **Fix (recommended):** chips keep the `Try asking:` framing; the placeholder
  DROPS the `Try: ` prefix and just shows the example (e.g. "what pattern is
  this?"). One "Try", not two.
- Guarding test: assert the placeholder strings no longer carry the `Try: `
  prefix (or whichever single source of truth is chosen).

### 4.2 Try chip populates but doesn't submit (new registry id, e.g. B12)
`onClick={() => setChatInput(chip)}` only fills the box; the user must still press
Send. These four chips are COMPLETE example questions (not templates needing
input), so they should **submit immediately**.
- **Fix:** thread the chip text through `submitChat(chip)` so a tap fires the
  message (which also exercises the real routing path — a bonus demo of routing).
  Verify `submitChat` can take an explicit arg rather than only reading
  `chatInput` state (today it reads `chatInput.trim()`), to avoid a set-state race.
- Guarding test: tapping a chip triggers the submit path (not just a state set).

### 4.3 UX nuance to preserve
A chip that is a *template needing input* would populate-only; but all current
chips are full questions → submit. If a future template-style chip is added, it can
opt out of auto-submit. Document this so the behavior isn't blindly applied later.

---

## 5. E4 — Onboarding (first-run)

- **Recommendation (option a):** a first-run **welcome / empty-state** in the panel
  — what LeetSage is (one line: "I coach you toward the answer, I never hand it
  over"), the "add your free Gemini key" step, and 2–3 example asks. Build on the
  EXISTING empty state in `ContentDisplay.tsx` (the "🧠 Tap a quick action…" block)
  and the existing API-key prompt rather than adding a modal.
- Leans on the discovery chips (§3.4/§4) for the example asks — this is why E4
  folds in here naturally.
- **Out of scope:** a full guided/stepped walkthrough (overkill for v1).
- Low effort, high value. No API calls (purely presentational).

---

## 6. Non-goals / guardrails (do NOT break)

- No Mermaid / idea-map / visual generative output (capability + guardrail risk).
- No change to `filterResponse`, the B1 pre-display gate, `getChatSystemPrompt` /
  `getChatAgentSystemPrompt`, the intent router, or the agentic loop. This is
  **presentation only** — if a change needs to touch those, it's out of scope for
  this spec.
- The no-solutions identity is untouched; motion/color never reveal withheld
  content earlier (the blinking cursor shows on content ALREADY cleared for
  display, never on gated-but-unfiltered tokens).
- Accessibility: all motion respects `prefers-reduced-motion`; the accent must keep
  sufficient contrast in light AND dark; keep focus-visible outlines.

---

## 7. Verification & visual-review gate (hard rule)

- `npm.cmd run build` must compile and `npm.cmd run test` must pass before
  presenting. E3's two fixes add guarding tests; E2/E4 are visual (few/no new
  tests, but must not break existing ones).
- **This is a VISUAL change → the user MUST eyeball the built, reloaded extension
  before any commit** (workflow rule). The gradient, timings, and spacing are
  explicitly "tune by eye" — expect the user to adjust tokens. Do NOT commit on the
  assumption it "looks right."
- Build → explain what/why/how → **STOP for review** → commit only after the user
  approves. Never commit to main; work on `feature/chat-polish`.

---

## 8. Open decisions for the build session

1. **Gradient:** sage-green → teal (default) vs. sage-green → cyan (brighter). User
   eyeballs and picks; keep it a single swappable token.
2. **How much spacing** is "breathable" without wasting the narrow panel — tune live.
3. **Expand/collapse animation technique** (max-height vs. grid-rows) — pick
   whichever avoids jank with variable-height content.
4. Whether E4's welcome copy lives in the empty state only, or also as a dismissible
   first-run banner.

---

## 9. Folded in during the build session (beyond the original scope)

These were surfaced by exercising the built extension (the visual-review gate doing
its job) and handled in this session even though they weren't in the original §3–5
checklist:

- **Friendly API error copy + transient-retry (bonus fix).** During review, every
  request started failing with a raw **`API Error 503`** (Google's Gemini free tier
  was overloaded), and a follow-on **`signal is aborted without reason`** (a raw
  abort/timeout `DOMException`) leaked to the UI. Both are now mapped to
  apologetic, non-technical messages via a typed `APIError` (with a `retryable`
  flag) + a `humanizeTransportError` boundary applied to BOTH the streaming path
  (`streamLLMRequest`) and the agent's non-streaming tool round (`sendToolRound`).
  Transient 5xx now retry with backoff. Guarded by `llm-error-messages.test.ts`
  (the abort-string-must-not-leak case) and the 503 cases in `llm-tool-round.test.ts`.
  This touches error *presentation* only — `filterResponse`, the gate, the prompts,
  and the loop are untouched, so it stays within the spec's "presentation-only" rule.
  *(The 503/overload itself is upstream — code can only fail gracefully, not make an
  overloaded service respond.)*

## 10. Deferred / future (documented, NOT built this session)

- **"Capabilities" meta-questions answered locally (zero-token).** Observed in
  review: asking the chat *"what all can you do?"* routes into the **agentic chat
  loop** — spending an API request (and risking the overload/timeout above) to
  describe the app's own features. This is wasteful: a capabilities/how-to-use
  answer is **static** and should be answered **client-side with no API call and no
  loop**. The right home for it already exists — the **E4 welcome card** (the ❔
  button + first-run empty state) *is* the "what is LeetSage / how to use it"
  surface. **Deferred because the fix lives in territory this spec must not touch:**
  it needs either a chat-prompt change (`getChatAgentSystemPrompt`, explicitly
  out of scope here) or an **intent-router rule** that recognizes a capabilities
  question and pops the welcome card instead of calling the model. Candidate future
  design: add a local "capabilities/help" intent to the router that, instead of
  dispatching an action or chatting, triggers the welcome overlay (purely
  presentational, zero tokens). Belongs to a small follow-up spec (router + a
  guarding golden-set case), not chat-polish.
