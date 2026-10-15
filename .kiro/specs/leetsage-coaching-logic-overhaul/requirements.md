# Coaching Logic Overhaul — Requirements

> **Requirements phase only.** Per the user's instruction, THIS session writes
> requirements only. **Design + tasks + the full code analysis are deferred to a
> fresh session** (see the session handoff) so this session's context stays
> clean. Per `.kiro/steering/workflow.md`, the design/tasks session should write
> **tasks after design** and do a **deep codebase search first** — writing tasks
> against the real code has historically surfaced issues before any change.
> This is a SUBSTANTIAL, guardrail-touching spec: full trilogy, with user
> sign-off between phases.
>
> **Scope of THIS spec:** the fundamental behavioral / guardrail / logic changes
> found while dogfooding the published (Unlisted) LeetSmith build. The shallow
> cosmetic fixes live in the sibling spec **`leetsage-post-launch-ui-fixes`** —
> split by the user along "UI bugs + simple fixes" vs. "fundamental logic
> changes."

**Status:** 📝 Requirements draft — awaiting sign-off; design/tasks in a later
session. Nothing built.
**Date:** 2026-10-14.
**Found by:** real-use dogfooding on problem *167. Two Sum II* post-deployment.

---

## Background / problem statement

Four fundamental issues, each confirmed against the current code:

### Problem A — the complexity hint is fundamentally not useful on its own

`TIME_COMPLEXITY_HINT` (`src/services/prompts.ts` ~line 331) produces a GENERIC
hint about the problem's OPTIMAL complexity only — it never reads the user's
editor code (not in the `CHECK_APPROACH | UNDERSTAND_SOLUTION | GENERATE_REPORT`
code-reading set in `App.tsx handleActionClick` ~line 261). A complexity hint
blind to what the user wrote is near-useless: a developer looking at their own
code wants THEIR code's complexity, the optimal, and a nudge to close the gap.
Initially filed as a routing bug (B18); on review it's a design flaw in what the
hint IS. The agreed model is the existing Analyze "⚡ Efficiency" block
(Current / Optimal / Variables / "Where the cost comes from" bullets / closing
coaching line — see `CHECK_APPROACH` prompt ~line 330), which already does this
well.

### Problem B — the UI is partially live off LeetCode problem pages

Off a LeetCode problem page: "Analyze my code" correctly hard-stops ("Couldn't
read your editor code…", the B15 behavior), BUT a typed "what is the time
complexity" still returns a generic answer and the Hint button still returns a
hint. The product is "grounded in the specific problem you're on"; off-page there
is nothing to ground. `App.tsx` already has `canInteract = apiKeyConfigured &&
!!problemContext && !isLoading` and gates `QuickActions`/chat on it — but the
behavior isn't reliable/consistent enough, and `problemContext` presence is not
proven to be a trustworthy "on a coachable problem page" signal (MV3 pull-based
load with retry/backoff can make it transiently null on a real page).

### Problem C — the solution filter blanks the WHOLE response and scolds the user

`buildFilteredMessage` (`src/services/solution-filter.ts` ~line 127) replaces the
ENTIRE response with "This response appeared to contain too much solution detail.
LeetSmith is here to help you *learn*, not to solve problems for you!" at every
detection site. When the user explicitly asked a legitimate thing ("explain the
key concept"), discarding the whole (mostly teachable) answer and scolding them
is anti-user. The desired behavior: REDACT only the offending section and keep
the teaching content.

### Problem D — "explain the key concept" is inconsistent run-to-run

The same phrase sometimes shows full pseudocode (routed to the exempt
`UNDERSTAND_SOLUTION`, filter bypassed) and sometimes gets filtered (routed to a
non-exempt path, filter fires). The exempt set is exactly `CHECK_APPROACH`,
`UNDERSTAND_SOLUTION`, `GENERATE_REPORT` (`solution-filter.ts` ~line 11). Partly
model non-determinism (not "fixable"), partly path inconsistency (fixable).

---

## Requirements

### R1 — Code-aware complexity hint (code present)

- **R1.1** WHEN a complexity hint is requested AND the editor code was read
  successfully, THE SYSTEM SHALL produce a single card modeled on the Analyze
  "⚡ Efficiency" block, including:
  - **R1.1.1** the user's **Current** code complexity (time + space), computed
    from their actual editor code;
  - **R1.1.2** the **Optimal** complexity (time + space);
  - **R1.1.3** a **Variables** line defining every symbol used;
  - **R1.1.4** a **"Where the cost comes from"** step-by-step breakdown of why the
    current code has that complexity (the descriptive, educational part the user
    valued in the Analyze block).
- **R1.2** WHEN the user's current complexity is WORSE than optimal (room to
  improve), THE SYSTEM SHALL additionally include a **Hint** section nudging
  toward closing the gap AND a **"What this means"** explanation — WITHOUT
  revealing the better algorithm (coaching, not solving).
- **R1.3** WHEN the user's current complexity ALREADY matches optimal, THE SYSTEM
  SHALL include a **"What this means"** explanation and an affirmation that
  optimal time/space has been reached, AND SHALL NOT show a "Hint" section.
- **R1.4** THE SYSTEM SHALL present "Current" honestly as a MODEL ESTIMATE of the
  user's code (same model-correctness caveat as B14/B16), never over-claiming
  certainty about the user's code complexity.

### R2 — Complexity hint fallback (no code present)

- **R2.1** WHEN the editor code could NOT be read (empty or failed) but the user
  is on a coachable problem page, THE SYSTEM SHALL fall back to today's behavior:
  the OPTIMAL target complexity hint only, with no "Current" line and no claim
  about the user's code.
- **R2.2** A failed/empty read SHALL NOT fabricate a "Current" complexity.

### R3 — Consistency with the established optimal (no new drift)

- **R3.1** THE "Optimal" in the hint SHALL reuse the canonical complexity-pin
  (B10, `src/services/complexity-pin.ts`) where a pin exists, so the hint does
  not introduce a NEW optimal conflicting with Analyze / Understand / Report.
- **R3.2** THE code-aware complexity hint SHALL remain NON-EXEMPT (it is not added
  to `SOLUTION_EXEMPT_ACTIONS`); its output still passes through the guardrail.
  (Note interaction with R6 redaction: stating "your code is O(N²), optimal is
  O(N), here's a nudge" is coaching and must survive the filter — the design must
  ensure the legitimate complexity breakdown is NOT mistaken for a leak.)

### R4 — Off-page input gating (reliability-gated)

- **R4.1** WHEN the user is NOT on a coachable LeetCode problem page, THE SYSTEM
  SHALL disable the INPUT affordances — the quick-action chips and chat submit —
  so none can issue a request about an absent problem.
- **R4.2** WHILE inputs are disabled off-page, THE SYSTEM SHALL keep the rest of
  the UI fully usable: scrolling, copying previous responses, opening Settings,
  and opening My Progress.
- **R4.3** THE SYSTEM SHALL show a clear state explaining the user should open a
  LeetCode problem to use the coaching inputs.
- **R4.4 — HARD RELIABILITY BAR.** THE SYSTEM SHALL NEVER disable the inputs on a
  legitimate LeetCode problem page due to a transient load state, a timing race,
  or a bug. A false "off-page" on a real problem page is unacceptable.
- **R4.5 — FALLBACK IF R4.4 CANNOT BE GUARANTEED.** IF the design cannot
  demonstrate the "on a coachable problem page" signal meets R4.4 (never a false
  negative on a real page, including during the MV3 pull-based load with
  retry/backoff), THEN THE SYSTEM SHALL instead implement a SOFTER WARNING:
  inputs stay enabled, a non-blocking banner warns that answers won't be grounded
  because no problem is detected. Hard-disable vs. soft-warning is a DESIGN-PHASE
  decision backed by evidence about the signal's reliability — not assumed now.
  (The design must specifically evaluate whether `!!problemContext` is a
  trustworthy signal or whether a sturdier one is needed, e.g. the active tab's
  normalized `/problems/{slug}/` URL plus a settled context read.)

### R5 — ("explain the key concept" consistency)

- **R5.1** THE SAME user phrasing SHALL NOT nondeterministically land on an
  exempt vs. a non-exempt path such that it sometimes shows full pseudocode and
  sometimes gets filtered. THE design SHALL make the exempt-vs-non-exempt decision
  for concept-style questions PREDICTABLE.
- **R5.2** This is partly model non-determinism (acknowledged, NOT "fixable"):
  the eval/filter are deterministic per-input, but model OUTPUT varies run to run.
  The goal is a predictable PATH + a graceful filtered result (R6), not a promise
  the model never produces a leak.

### R6 — Graceful filter redaction instead of total blanking (THE BIG ONE)

- **R6.1** WHEN `filterResponse` detects solution-bearing content in a NON-EXEMPT
  response, THE SYSTEM SHALL attempt to REDACT only the offending section(s) (the
  fenced solution/code block and/or the prose lines constituting full-algorithm
  pseudocode) and PRESENT the remaining teaching content (concept, analogy, "why
  it works") — rather than discarding the whole response.
- **R6.2** THE redaction SHALL remove BOTH fenced solution blocks AND non-fenced
  prose that trips the full-pseudocode detector (`looksLikeFullPseudocode`), so a
  prose-only spelled-out algorithm cannot survive redaction (no partial leak).
- **R6.3** WHEN redaction would leave nothing teachable (the response was almost
  entirely solution, or leak and teaching cannot be cleanly separated), THE SYSTEM
  SHALL fall back to a FULL filtered message — but reworded per R6.6.
- **R6.4** THE redaction SHALL NOT weaken the guarantee: nothing solution-bearing
  is EVER shown. Redaction and full-blank are two presentations of the SAME
  non-negotiable outcome; redaction merely preserves the non-leaking parts.
- **R6.5** EXEMPT actions (`CHECK_APPROACH`, `UNDERSTAND_SOLUTION`,
  `GENERATE_REPORT`) are unaffected — deliberately allowed to show solution-level
  detail, NOT redacted.
- **R6.6** THE user-facing filtered/redacted message SHALL be reworded to
  acknowledge the user asked a legitimate question and point them to the coaching
  value, WITHOUT implying they did something wrong (replace the current scolding
  "not to solve problems for you!" copy).

### R7 — No regressions

- **R7.1** The Hint, Analyze, Understand, Report, and chat flows on a real
  problem page SHALL otherwise work as before except for the intentional changes.
- **R7.2** Each change SHALL be covered by a test/eval that would have caught the
  defect (standing bug-registry discipline). In particular R6 redaction SHALL
  have tests proving (a) teaching content survives, (b) a prose-only algorithm
  does NOT survive, (c) the empty-after-redaction fallback fires, and the
  guardrail-eval safety numbers do NOT regress.

---

## Out of scope (so docs don't overstate)

- **Verifying the model's complexity inference is correct.** R1 makes the hint
  code-aware and honest-about-uncertainty; it does NOT prove the Big-O is right
  (the standing E10 / model-correctness concern). A wrong-but-honest "Current"
  estimate is still possible.
- **Solved-state gating** (showing solution-level content only after the user has
  attempted/solved) — the separate unbuilt `phase2-struggle-first` idea.
- **Intent-router redesign.** The weak `hasCode` signal (`!!problemContext`) is
  noted; this spec touches it only as needed for R4, not a router rewrite.
- **The cosmetic fixes** (pattern formatting, example complexity lines, streaming
  placeholder) — sibling spec `leetsage-post-launch-ui-fixes`.
- **Spec-folder cleanup/consolidation** — later, separate pass.

## Notes for the design/tasks session (do a FULL code read)

- **R1/R3:** read the whole Analyze path — `CHECK_APPROACH` prompt + its
  structured `ANALYZE_DATA_SCHEMA`/parse, the complexity-badge renderer
  (`complexity-parse.ts`), `complexity-pin.ts` (B10 authority rules), and how the
  Analyze "Efficiency" block is rendered — so the complexity hint can REUSE that
  machinery rather than re-implement it. Decide: is "worse than optimal"
  determined by the model in-prompt or computed deterministically from parsed
  current-vs-optimal (and how does that interact with the pin)?
- **R4:** investigate the problem-data pull flow (content script
  `REQUEST_PROBLEM_DATA` retry/backoff, the `chrome.scripting` inject fallback,
  how/when `problemContext` becomes non-null, the normalized `/problems/{slug}/`
  URL). Produce EVIDENCE on whether a false-negative on a real page is possible;
  that evidence decides R4.1 hard-disable vs. R4.5 soft-warning.
- **R6:** read `solution-filter.ts` end-to-end (all detection branches,
  `extractCodeBlocks`, `looksLikeFullPseudocode`, the exempt short-circuit) and
  the guardrail eval fixtures (`src/evals/`) + the Promptfoo bridge
  (`evals-promptfoo/assertions/solution-filter-assert.ts`) so redaction is proven
  not to regress the safety numbers. Redaction likely changes `filterResponse`'s
  return shape — trace every caller (App.tsx stream-commit path, the B1
  pre-display gate).
- Write tasks only AFTER the deep read.
