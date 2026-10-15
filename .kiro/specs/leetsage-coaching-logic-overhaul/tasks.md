# Coaching Logic Overhaul — Tasks

> **Tasks phase.** Requirements + design are signed off. This breakdown was
> written **after** re-reading the real code (per `.kiro/steering/workflow.md`:
> "write tasks after design + a deep read — it surfaces issues"). Notes below
> under **"Surfaced while writing tasks"** capture what the code read revealed.
>
> **Status:** ✅ Implemented 2026-10-15 — build clean, `npm.cmd run test` 532/532
> green, lint 0 errors (1 pre-existing App.tsx warning), offline guardrail eval
> safety unchanged (100% catch / 0% FP). **Not committed — awaiting user review**
> (the hint card, off-page state, and a redacted/recovered card must be eyeballed
> on the built extension first, per workflow.md).
> **Date:** 2026-10-15. **Branch:** `feature/coaching-logic-overhaul`.
>
> Convention: each task lists the files it touches, the acceptance check, and the
> requirement(s) it satisfies. **Build + test gates** per `tech.md`:
> `npm.cmd run build` must compile and `npm.cmd run test` must stay green after
> each group. **STOP for user review before any commit** (workflow.md hard rule);
> visual changes (hint card, off-page state, redacted card) must be eyeballed on
> the built extension.

---

## Surfaced while writing tasks (read-driven findings)

1. **`looksLikeOurData` already includes the hint's keys.** The parser's loose
   JSON-fence fallback keys on `currentComplexity|optimalComplexity|onOptimalPath`
   — all three are what `ComplexityHintData` uses, so **no change** to
   `looksLikeOurData` is needed when we add the hint schema. Only `validate()`'s
   `switch` needs a new case.
2. **`sendLLMRequest` has NO `messages` override** (only `streamLLMRequest` does).
   So the regenerate needs either (a) a dedicated `regenerateWithoutSolution()` or
   (b) extending `sendLLMRequest`. Chosen: **(a)** — keeps `sendLLMRequest`'s
   contract stable (confirmed in design §6). It reuses `getSystemPrompt(actionType)`
   so the regenerate speaks the same action's language.
3. **`filterResponse` MUST stay pure + synchronous.** `guardrail-eval.test.ts` and
   the Promptfoo bridge import and call it directly with no async. The regenerate
   (network) therefore lives in an `App.tsx`-level helper, NOT in the filter. The
   pure decision is extracted as `decideRecovery(...)` for testing.
4. **Two filter call sites, both read only `.filteredContent`** — the
   `handleActionClick` stream-commit (line ~357) and the `handleChatSubmit` reveal
   (line ~514). Both must route through the shared recovery helper so behavior
   can't diverge. Both already `await` before committing, so making the commit
   path await one more round-trip is structurally safe (B1 placeholder holds).
5. **`chatPlaceholder` already takes `hasProblem`** (from the sibling spec's B24
   fix). The off-page reason extends that existing helper — we do NOT add a
   competing disabled-state path. Coordinate, don't fight (design §2.4).
6. **The pin feed for the hint is a one-liner in two places:** `handleActionClick`
   already computes `existingPin`/`pinnedOptimal` for the code-aware actions; we
   extend the `actionType` guard to include `TIME_COMPLEXITY_HINT`, and
   `buildUserMessage`'s `TIME_COMPLEXITY_HINT` case appends
   `pinnedOptimalConstraint(options?.pinnedOptimal)`.
7. **`actionToContentType` already maps `TIME_COMPLEXITY_HINT → 'HINT'`** — no
   change; the card renders through the existing `HINT` path + markdown renderer.

---

## Group A — Types & structured plumbing for the complexity hint (R1–R3)

### A1. Add `ComplexityHintData` type
- **Files:** `src/types/models.ts`, `src/types/index.ts`.
- **Do:** add
  ```ts
  export interface ComplexityHintData {
    currentComplexity: { time: string; space: string } | null; // null = no code read
    optimalComplexity: { time: string; space: string };
    onOptimalPath: boolean;
  }
  ```
  Add `ComplexityHintData` to the `StructuredData` union; export it from `index.ts`.
- **Check:** `tsc -b` compiles; `StructuredData` includes the new shape.
- **Req:** R1.1, R2.1.

### A2. Parse + validate the hint's data block
- **Files:** `src/services/structured-parser.ts`.
- **Do:** add `TIME_COMPLEXITY_HINT` to `STRUCTURED_ACTIONS`; add a
  `validateComplexityHint(obj)` (optimal required via `toComplexity`; current =
  `toComplexity` or `null`; `onOptimalPath === true`); add the `case
  'TIME_COMPLEXITY_HINT'` to `validate()`. No change to `looksLikeOurData`
  (finding #1).
- **Check:** unit test — a hint response with a `leetsage-data` block parses to
  `{currentComplexity, optimalComplexity, onOptimalPath}`; a no-code block with
  `currentComplexity: null` validates; a malformed block degrades to prose-only.
- **Req:** R1.1, R2.1, R2.2.

### A3. Prompt: split `TIME_COMPLEXITY_HINT` into code-aware + fallback shapes
- **Files:** `src/services/prompts.ts`.
- **Do:**
  - Rewrite the `TIME_COMPLEXITY_HINT` system prompt to emit the `## ⚡ Efficiency`
    shape when code is present: `**Current:**`, `**Optimal:**`, `**Variables:**`,
    `**Where the cost comes from:**` bullets; then adaptive — worse-than-optimal →
    `**Hint:**` + `**What this means:**`; already-optimal → `**What this means:**`
    + "you've reached optimal" affirmation, NO Hint. Decide `onOptimalPath` from
    the Current-vs-Optimal just written; never show a Hint while asserting optimal.
  - Keep the no-code fallback = today's optimal-only `## Complexity Hint`
    (Target time / Target space / What this means / Hint), with NO Current claim.
  - Reuse `COMPLEXITY_REASONING_LEVERS` + the COMPUTE-DON'T-COPY / STATE-YOUR-
    VARIABLES discipline (same as `CHECK_APPROACH`). No concrete example Big-O
    (B14). Append `structuredDataRules(COMPLEXITY_HINT_SCHEMA, COMPLEXITY_HINT_EXAMPLE)`
    with non-answerable `O(<time>)` placeholder values.
  - `buildUserMessage` `TIME_COMPLEXITY_HINT` case: pass the code block (like
    `CHECK_APPROACH`) when `userCode` present, else the "optimal only, no code"
    instruction; append `pinnedOptimalConstraint(options?.pinnedOptimal)`.
- **Check:** `prompts.test.ts` — hint prompt carries no concrete example Big-O;
  carries the adaptive include/omit-Hint instruction; the no-code path makes no
  Current claim; the pinned-constraint line appears when a pin is passed.
- **Req:** R1.1–R1.4, R2.1–R2.2, R3.1.

### A4. Wire the hint into `handleActionClick` (read code, feed pin, non-hard-stop)
- **Files:** `src/sidepanel/App.tsx`.
- **Do:** add `TIME_COMPLEXITY_HINT` to the code-reading guard (the
  `CHECK_APPROACH | UNDERSTAND_SOLUTION | GENERATE_REPORT` block) so it calls
  `extractCurrentCode`. Unlike `CHECK_APPROACH`, a `failed`/`empty` read does NOT
  hard-stop — it proceeds with `userCode` undefined (→ fallback prompt).
  Extend the `pinnedOptimal` guard so the hint receives `existingPin?.optimal`
  (it is NOT the `UNDERSTAND_SOLUTION` authority). The existing structured-data
  commit + `recordOptimalPin` path already fires for any action whose `data` has
  `optimalComplexity`, so the hint will pin a first optimal / respect `shouldRepin`
  automatically — verify, don't duplicate.
- **Check:** manual + a `complexity-pin` test (B-group) — hint with no prior pin
  establishes one; hint with an existing pin does NOT overwrite it.
- **Req:** R1.1, R2.1, R3.1, R3.2.

---

## Group B — Off-page input gating (R4)

### B1. URL-based `onCoachablePage` signal
- **Files:** `src/sidepanel/App.tsx`.
- **Do:** add `activeTabIsProblem` state, set from the active tab URL on mount and
  in the existing `onActivated`/`onUpdated` listeners (reuse — no new polling), and
  `true` whenever `applyProblem` runs. Define `onCoachablePage = activeTabIsProblem`
  and `canInteract = apiKeyConfigured && onCoachablePage && !isLoading`.
- **Check:** on a `/problems/` URL, inputs are enabled immediately (before
  `problemContext` loads); off a problem URL, inputs disable. Never a false
  off-page on a real page (R4.4).
- **Req:** R4.1, R4.4.

### B2. Transient "still loading" click handling
- **Files:** `src/sidepanel/App.tsx`.
- **Do:** when `onCoachablePage` but `problemContext` is still null and the user
  acts, surface a brief "Still reading this problem — try again in a moment"
  (reuse the error banner) instead of the current silent early-return. The
  existing `pullFromActiveTab` is already racing to fill context.
- **Check:** clicking during the sub-second load window shows the transient
  message, not a wrong/ungrounded answer.
- **Req:** R4.4.

### B3. Off-page clear state + placeholder
- **Files:** `src/sidepanel/App.tsx`, `src/components/discovery-prompts.ts`.
- **Do:** extend `chatPlaceholder` with the off-page reason (precedence: no-key →
  busy → off-page). Show a calm inline notice in the input area when
  `!onCoachablePage`: "Open a LeetCode problem to use the coaching tools." Confirm
  scroll/copy/Settings/Progress/welcome/theme are NOT gated on `canInteract`
  (verified — they aren't; just re-confirm after the change).
- **Check:** `discovery-prompts.test.ts` — off-page returns the off-page copy;
  no-key still wins over off-page; busy wins appropriately. Visual: off-page state
  reads clearly (eyeball on built extension).
- **Req:** R4.1, R4.2, R4.3.

---

## Group C — Graceful filter recovery (R6 + R6b) — THE BIG ONE

> Order matters: pure filter first (C1–C2) with the gate-invariance proof, THEN
> the regenerate orchestration (C3–C5). Do not touch detection logic.

### C1. `FilterResult.redactionMode` + reworded full message
- **Files:** `src/types/api.ts`, `src/services/solution-filter.ts`.
- **Do:** add `redactionMode?: 'none' | 'partial' | 'full'` to `FilterResult`.
  Replace `buildFilteredMessage`'s scolding copy with the reworded, non-scolding
  message (names the real affordances: 💡 Hint / 🧠 Understand solution — NOT the
  removed "Break Down Problem" chip).
- **Check:** old "not to solve problems for you" string is gone from the codebase.
- **Req:** R6.6.

### C2. Redaction rewrite inside `filterResponse` (pure, sync — detection UNCHANGED)
- **Files:** `src/services/solution-filter.ts`.
- **Do:** restructure from "detect → blank at first hit" to "detect → collect
  offending regions → redact → classify partial/full":
  - exempt short-circuit unchanged → `{wasFiltered:false, redactionMode:'none'}`.
  - collect fenced blocks (by span), solution-phrase lines, and **per-blank-line-
    run** prose that trips `looksLikeFullPseudocode` (segment the prose, test each
    run — R6.2 trap).
  - redact (remove the region, collapse gap; no visible marker — seamless R6.9.3).
  - classify: meaningful teaching remains → `partial`; **re-run the detectors on
    the redacted text** — if still trips, classify `full`; nothing meaningful →
    `full` (reworded message). `wasFiltered: true` for both.
  - **Detection predicates themselves are NOT modified** (R6.4, §4.6a).
- **Check (critical):** NEW `solution-filter.test.ts` cases —
  (a) teaching + fenced full function → `partial`, teaching survives, body gone;
  (b) teaching + prose full-pseudocode run → that run gone, result passes re-filter;
  (c) all-solution → `full` + reworded message;
  (d) exempt + full function → `wasFiltered:false`, unchanged;
  **(e) GATE INVARIANCE** — every `GUARDRAIL_CASES` case: new `wasFiltered` ==
  old decision (positives true, negatives false). Must be exact.
- **Req:** R6.1–R6.5, §4.6a locks.

### C3. `regenerateWithoutSolution` in the LLM service
- **Files:** `src/services/prompts.ts`, `src/services/llm-service.ts`.
- **Do:** add `REGENERATE_NO_SOLUTION` reinforcement text in `prompts.ts`. Add
  `regenerateWithoutSolution({apiKey, model, maxTokens, timeoutMs, problemContext,
  actionType, userQuery?, userCode?, codeLanguage?, ...})` — a NON-streaming call
  (`sendLLMRequest`-style) posting system = `getSystemPrompt(actionType)` +
  `REGENERATE_NO_SOLUTION`, user = the same wrapped data block, returning
  `{content, usage}`. Keep `sendLLMRequest` unchanged (finding #2).
- **Check:** unit test the message assembly (reinforcement present; same untrusted
  fencing). No live call needed.
- **Req:** R6.8.

### C4. Pure `decideRecovery` + shared recovery helper
- **Files:** `src/sidepanel/App.tsx` (or a small `src/services/` pure module for
  `decideRecovery` so it's harness-free).
- **Do:** pure `decideRecovery(filterResult, { budgetAllowed }): 'show-partial' |
  'show-full' | 'regenerate'` per the §4.3 tree. Shared async helper
  `recoverFilteredResponse(prose, actionType, deps)`:
  1. `filterResponse(prose, actionType)`; if not filtered → return prose.
  2. `decideRecovery`:
     - `show-partial` → return the redacted content (no regenerate, no credit).
     - `show-full` → return the reworded message.
     - `regenerate` → `recordRequest()` + `recordMetric` (best-effort), call
       `regenerateWithoutSolution`, then `filterResponse` the result ONCE: clean →
       return it; still leaks → return the reworded message. Never a 2nd regen.
  - `budgetAllowed` comes from `checkRateLimit(guardrails)` evaluated by the caller
    before entering the `full` branch.
- **Check:** `decideRecovery` branch tests (d1/e1/f1/g1 from design §4.9) with
  injected stubs — partial→no regen; full+budget→regen once (recordRequest once);
  full+regen-still-leaks→full msg (regen once, no 2nd); full+no-budget→full msg
  (no regen, no recordRequest).
- **Req:** R6.8.1–R6.8.3, R6.9.1–R6.9.3.

### C5. Route BOTH filter callers through the recovery helper
- **Files:** `src/sidepanel/App.tsx`.
- **Do:** replace the two `const { filteredContent } = filterResponse(...)` sites
  (`handleActionClick` commit ~357; `handleChatSubmit` reveal ~514) with
  `await recoverFilteredResponse(...)`. Update the usage counter after a
  regenerate. The B1 gate is untouched (still keys on `isSolutionExemptAction`).
- **Check:** build; action + chat flows commit a filtered/recovered result; the
  placeholder holds across the extra round-trip. Visual eyeball of a redacted card.
- **Req:** R6 (both paths), R7.1.

### C6. Strengthen the first-call prompts (R6.7) — WITHOUT over-gating (§4.6a)
- **Files:** `src/services/prompts.ts`.
- **Do:** add a short reinforcement to the non-exempt action prompts + chat prompt:
  teach the approach/concept; if about to write the complete working solution/
  full algorithm, STOP and give the insight. **Must RESTATE** that short snippets
  (<10 lines) and partial pseudocode are ENCOURAGED (restate the existing
  `SOLUTION_PREVENTION_RULES` allowance, don't restrict it).
- **Check:** `prompts.test.ts` — reinforcement present AND still permits
  snippets/partial logic (so it can't drift into a gag).
- **Req:** R6.7, §4.6a lock 1.

---

## Group D — Eval fixtures & usability proof (R7, §4.6a)

### D1. New guardrail-case negatives
- **Files:** `src/evals/fixtures/guardrail-cases.ts`.
- **Do:** add `leaksSolution:false` cases —
  - a code-aware complexity-hint card, worse-than-optimal shape (Current/Optimal/
    Variables/breakdown/Hint) — must pass clean;
  - a code-aware complexity-hint card, already-optimal shape (affirmation, no Hint)
    — must pass clean;
  - **own-code discussion (§4.6a lock 2):** a chat response quoting a few lines of
    the user's own code + a suggested improvement — must pass clean (not redacted).
- **Check:** `guardrail-eval.test.ts` stays green (catchRate=1, FP=0); the new
  negatives are classified safe; dataset still non-degenerate.
- **Req:** R7.2, §4.6a locks 1–2.

### D2. Full suite + build gate
- **Do:** `npm.cmd run build` (compiles), `npm.cmd run test` (all green, count
  only grows), and the **Promptfoo offline eval** (`eval:promptfoo:offline`) to
  confirm the safety numbers (100% catch / 0% FP) are unchanged by the redaction
  rewrite (inherited by construction, but verify).
- **Check:** build clean; tests green; offline eval safety unchanged.
- **Req:** R7.1, R7.2.

---

## Group E — Explain & STOP (workflow hard rule)

### E1. Build, verify, explain, STOP
- **Do:** final `npm.cmd run build` + `npm.cmd run test`; run the guardrail eval;
  clean up any temp files. Then **explain what/why/how and STOP for user review.**
  Do NOT commit; do NOT run the historian. The user eyeballs the hint card, the
  off-page state, and a redacted/recovered card on the built extension first.
- **Req:** workflow.md "Explain and STOP before committing"; R7.

---

## Test inventory (so nothing is skipped)

| Test | Proves | Req |
|---|---|---|
| parser: hint data parse/validate/degrade | A2 | R1.1,R2 |
| prompts: hint no-example-BigO / adaptive / no-code-no-Current / pin line | A3 | R1–R3 |
| complexity-pin: hint establishes-not-overwrites | A4 | R3.1 |
| discovery-prompts: off-page placeholder precedence | B3 | R4.3 |
| solution-filter: (a)–(d) redaction + **(e) gate invariance** + (h) own-code + (i) snippets | C2,D1 | R6,§4.6a |
| decideRecovery: d1/e1/f1/g1 | C4 | R6.8–R6.9 |
| llm-service: regenerate message assembly | C3 | R6.8 |
| prompts: R6.7 reinforcement present + still-permits-snippets | C6 | R6.7,§4.6a |
| guardrail-eval + promptfoo offline: safety unchanged | D1,D2 | R7 |
