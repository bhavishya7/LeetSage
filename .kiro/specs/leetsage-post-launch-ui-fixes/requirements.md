# Post-Launch UI Fixes — Requirements

> **Requirements phase only.** Per the user's instruction, THIS session writes
> requirements only. **Design + tasks + the full code analysis are deferred to a
> fresh session** (see the session handoff) so this session's context stays
> clean. Per `.kiro/steering/workflow.md`, the design/tasks session should write
> **tasks after design** and do a **deep codebase search first** — writing tasks
> against the real code has historically surfaced issues before any change.
>
> **Scope of THIS spec:** the shallow, low-risk UI / formatting / prompt-shape
> bugs found while dogfooding the published (Unlisted) LeetSmith build. The
> fundamental behavioral/guardrail changes live in the sibling spec
> **`leetsage-coaching-logic-overhaul`** — these two were split by the user along
> "UI bugs + simple fixes" vs. "fundamental logic changes."

**Status:** 🏗️ In progress — R1/R2/R3 implemented + user-verified; R5 + R6 added
mid-build during dogfooding and implemented in the same pass. Build/commit gated
on the user's review.
**Date:** 2026-10-14 (R1–R4); **2026-10-15** (R5, R6 added during the
design/tasks/implement session).

> **Bug-registry IDs (authoritative — reconciled 2026-10-15).** The guardrail-
> hardening registry already used B20/B21 for prior shipped work (progress-import
> strip; stale-tab injection), so this spec's bugs take the next free IDs:
> **B22** = R1 PATTERN_RECOGNITION `####` literal headings · **B23** = R2
> GENERATE_EXAMPLES per-example Time/Space lines · **B24** = R3 chat placeholder
> shows no-key copy mid-stream · **B25** = R5 PATTERN_RECOGNITION stray complexity
> line · **B26** = off-page sticky `problemContext` (OUT OF SCOPE — sibling spec) ·
> **B27** = R6 API key cannot be removed. (Earlier drafts of this doc called these
> B20–B25; corrected after checking the live registry — exactly the drift the
> registry discipline exists to catch.)
**Found by:** real-use dogfooding on problem *167. Two Sum II* post-deployment
(R5/R6 surfaced while verifying the R1–R3 build on the same problem).

---

## Background

Using the live extension surfaced several defects. The ones in THIS spec are
cosmetic / prompt-shape / small-logic — safe to fix without touching the
guardrail or core routing. Each was verified against the current code:

- `GENERATE_EXAMPLES` prompt (`src/services/prompts.ts` ~line 327) and the
  rendered card show Time/Space Complexity on every generated example.
- `PATTERN_RECOGNITION` prompt (`src/services/prompts.ts` ~line 332) is
  under-specified on formatting (no explicit `##`/`###` structure like the other
  action prompts have), so the model emits `####` headings the card renderer
  doesn't support — they render as literal `####` text (screenshot-confirmed).
- The chat input placeholder is `canInteract ? examples : 'Configure your API
  key first'` with `canInteract = apiKeyConfigured && !!problemContext &&
  !isLoading` (`src/sidepanel/App.tsx` ~lines 589, 659). The instant a request
  starts, `isLoading` → true → `canInteract` → false → the placeholder wrongly
  shows "Configure your API key first" even though the key is fine
  (screenshot-confirmed).

---

## Requirements

### R1 — Pattern Recognition: fix broken heading formatting

- **R1.1** THE `PATTERN_RECOGNITION` output SHALL render its section structure
  with the SAME heading convention that already renders correctly in the other
  action cards (e.g. Hint, Breakdown, Analyze), NOT as literal `####` text.
- **R1.2** The fix SHALL conform `PATTERN_RECOGNITION` to the working pattern —
  this is a "make it behave like the others" fix, not a new design. The user was
  explicit: every other card formats correctly; pattern-recognition should be
  fixed the same way the others already work. (Investigation during design should
  confirm whether the working cards owe their correct rendering to an explicit
  `##`/`###` prompt structure the renderer supports — the leading hypothesis — vs.
  anything renderer-side.)
- **R1.3** THE fix SHALL NOT change what the pattern-recognition content SAYS
  (name the pattern, how to identify it, 1-2 similar problems, no application
  walkthrough) — only how its structure renders.

### R2 — Generated Examples: drop per-example complexity lines

- **R2.1** THE `GENERATE_EXAMPLES` output SHALL NOT show a Time Complexity /
  Space Complexity line on each generated example — it is repetitive noise and
  complexity belongs in the complexity hint / Analyze, not on every example.
- **R2.2** THE output SHALL keep the useful parts of each example: the input,
  the output, and the "Why this helps" intuition-building explanation.
- **R2.3** THE existing difficulty label per example (Simple / Medium / Tricky)
  MAY be kept — it is distinct from the Time/Space complexity lines and is useful
  for ordering examples by difficulty. (Design should confirm the Time/Space
  lines' source: the prompt says "with complexity labels" meaning the
  Simple/Medium/Tricky difficulty, yet the card also shows Time/Space Complexity —
  so the Time/Space lines are either model free-styling or another prompt clause;
  the deep read should locate exactly where they originate before removing them.)

### R3 — Streaming placeholder bug

- **R3.1** THE chat input placeholder SHALL NEVER show "Configure your API key
  first" when an API key IS configured.
- **R3.2** WHILE a request is in flight (`isLoading`) with a key configured, the
  placeholder SHALL show a neutral state — the normal rotating placeholder, an
  empty placeholder, or a benign "thinking…" — reflecting that the input is
  disabled-because-busy, not disabled-because-no-key.
- **R3.3** THE fix SHALL preserve the genuine "Configure your API key first"
  message for the ACTUAL no-key state (when `apiKeyConfigured` is false). I.e.
  the placeholder decision SHALL distinguish "no key" from "busy" from "off a
  problem page" rather than collapsing all three into the no-key copy. (Note the
  interaction with the sibling spec's off-page gating: the design should make the
  placeholder reflect the SPECIFIC reason the input is disabled.)

### R4 — No regressions

- **R4.1** The Hint, Analyze, Understand, Report, Examples, Pattern, and chat
  flows SHALL otherwise work as before.
- **R4.2** Each fix SHALL be covered by a test that would have caught the defect
  (standing bug-registry discipline): a `PATTERN_RECOGNITION` formatting
  assertion, a `GENERATE_EXAMPLES` "no Time/Space complexity line" assertion, and
  a placeholder-state unit test (busy-with-key ≠ no-key copy).

### R5 — Pattern Recognition: drop the stray complexity line (bug B25, added during dogfooding)

> Added 2026-10-15 after the R1 fix was verified: the live Pattern Recognition
> card still free-styled a trailing "Complexity for this pattern is typically
> O(N) time and O(1) space." line — the same `OUTPUT_RULES` "always give
> complexity" nudge that drove the R2 examples bug, now showing on a card whose
> job is RECOGNIZING the pattern, not analyzing cost. The user confirmed it makes
> no sense there and asked to remove it. Same root cause + same lever as R2.

- **R5.1** THE `PATTERN_RECOGNITION` output SHALL NOT state the time or space
  complexity of the pattern — this card recognizes the pattern; complexity
  belongs in the Hint / Analyze actions.
- **R5.2** THE fix SHALL be a prompt-level negative clause (mirroring R2), not a
  renderer change, and SHALL NOT alter the heading structure fixed in R1.
- **R5.3** THE fix SHALL be guarded by a `prompts.test.ts` assertion that the
  `PATTERN_RECOGNITION` prompt forbids a complexity line.

### R6 — API-key removal (bug B27, added during dogfooding)

> Added 2026-10-15. Dogfooding found a user who has entered a key, acknowledged
> the consent box, and later clears the key field CANNOT save — only Cancel is
> available — so **a user can never remove their API key through the UI**. The
> modal was built one-way ("enter a key to start") and both `canSaveSettings`
> and `handleSave` hard-require a non-empty key.
>
> **Scope decision:** this is a different subsystem (settings / consent-gate)
> than R1–R3, but the user explicitly chose to tackle it HERE rather than spin a
> separate spec. Captured as a first-class requirement so the deviation is
> documented, not silent.

- **R6.1** THE Settings modal SHALL provide an explicit **"Remove key"** control,
  placed near the API-key textbox, that lets the user remove a configured key.
  (A dedicated button — not merely blanking the field — so removal is a
  deliberate act, not an accidental mid-edit side effect.)
- **R6.2** WHEN the user removes the key, THE SYSTEM SHALL persist the empty-key
  state (returning settings to the first-run shape: `apiConfig.apiKey = ''`).
- **R6.3** WHEN the key is removed, THE SYSTEM SHALL reset the data-use consent to
  UNACKNOWLEDGED (`consentAcknowledged = false`, `consentVersion = 0`). Rationale:
  with no key, nothing is ever sent to Google, so holding "consented" records
  consent for an activity that cannot occur; and `isAlreadyConsented` is already
  key-conditional, so resetting keeps the stored flag self-consistent. Re-entering
  a key therefore re-shows the interactive consent gate (re-entering a key =
  re-consenting to send data — a re-prompt condition the consent-gate code already
  names).
- **R6.4** AFTER key removal, THE extension SHALL be UNUSABLE for coaching: every
  action and the chat SHALL be blocked, the input disabled, the placeholder SHALL
  read the no-key copy (R3.3), and the "add your key" affordance SHALL reappear.
  (The downstream guards already enforce this on an empty key — the requirement is
  that removal does not bypass them.)
- **R6.5** THE existing escape path SHALL remain: a user may open Settings, leave
  the key blank, leave the consent box unchecked, and press **Cancel** as a
  no-op (persists nothing). This already works and SHALL NOT regress.
- **R6.6** Saving WITH a (non-empty) key SHALL still require the consent box to be
  checked (the consent gate is unchanged for the case that actually sends data);
  only the empty-key/remove path is newly saveable.
- **R6.7** THE fix SHALL be guarded by `consent-gate.test.ts` unit tests: empty
  key is saveable; an empty-key save resets consent; a non-empty key still
  requires consent; existing cases stay green.

---

## Out of scope (deferred / belongs elsewhere)

- The code-aware complexity hint, off-page INPUT GATING behavior itself, the
  filter-redaction redesign, and "explain the key concept" consistency — all in
  the sibling **`leetsage-coaching-logic-overhaul`** spec.
- **B26 — sticky `problemContext` off-page** (navigating off a problem page keeps
  the stale problem loaded, so the off-page placeholder branch can't be observed).
  Found 2026-10-15. **Explicitly out of scope here** (user's call) — it is off-page
  gating territory owned by the sibling `leetsage-coaching-logic-overhaul` spec.
  The R3 placeholder work already leaves a clean off-page seam for it. Logged as a
  registry row only.
- Spec-folder cleanup/consolidation (the user wants to tidy the many
  partial/complete specs later — separate pass).

## Notes for the design/tasks session

- Do a FULL read of `src/services/prompts.ts` (all action prompt strings + the
  shared `OUTPUT_RULES`/`TONE_GUIDELINES`), the card renderer (`renderInline` /
  the markdown subset — history: B13 touched it), `src/sidepanel/App.tsx` around
  `canInteract` / `currentPlaceholder` / `QuickActions` disabling, and the
  `GENERATE_EXAMPLES` card rendering path. Locate the EXACT origin of the
  per-example Time/Space lines before removing them (don't assume).
- Confirm the renderer's supported markdown subset so R1 picks a heading style it
  actually renders (don't introduce a new `####` level the renderer still won't
  handle).
- Write tasks only AFTER the deep read; the task breakdown is where
  code-grounded issues tend to surface.
