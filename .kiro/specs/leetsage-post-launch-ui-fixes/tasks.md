# Post-Launch UI Fixes — Tasks

> **Phase:** Tasks. Written AFTER the deep read + signed-off [`design.md`](./design.md)
> (workflow.md: "write tasks only AFTER the deep read; the task breakdown is where
> code-grounded issues tend to surface"). The deep read already happened in the
> design phase; nothing new surfaced that invalidates the design.
>
> **Hard gate (workflow.md):** implement → build (`npm.cmd run build`) + test
> (`npm.cmd run test`) → **EXPLAIN and STOP**. Do NOT commit, do NOT run the
> historian. The user triggers the commit and must eyeball the built extension for
> the visual changes (R1 headings, R2 examples) first.

**Branch:** `feature/post-launch-ui-fixes` (off `main`@`ffcd204`).

---

## Task list

### 1. R1 — `PATTERN_RECOGNITION` heading structure (B22)

- [ ] **1.1** In `src/services/prompts.ts`, rewrite the `PATTERN_RECOGNITION`
  prompt string to prescribe an explicit renderer-supported heading structure:
  a `## Pattern Recognition` section, a `### <pattern name>` subheading per
  pattern, a `**How to spot it:**` line and a `**Similar problems:**` line (1-2),
  and an explicit instruction NOT to use any heading deeper than `###` (state the
  renderer supports only `##`/`###`). Keep the content scope unchanged (name the
  pattern, how to identify it, 1-2 similar problems, NO application walkthrough —
  R1.3) and keep `SOLUTION_PREVENTION_RULES` / `OUTPUT_RULES` / `TONE_GUIDELINES`.
  - _Grounds: design §2 R1; renderer subset design §1.1._
- [ ] **1.2** Add guards in `src/services/__tests__/prompts.test.ts`
  (new `describe('getSystemPrompt(PATTERN_RECOGNITION) — explicit heading structure (B22)')`):
  - asserts the prompt contains a `## ` heading instruction and a `### ` per-pattern
    subheading instruction;
  - asserts it explicitly forbids headings deeper than `###` / tells the model the
    renderer supports only `##`/`###`;
  - asserts the content scope is preserved (mentions "similar problems", "do NOT
    explain how to apply").
  - _Would-have-caught: the old prompt specified no heading structure at all._

### 2. R2 — `GENERATE_EXAMPLES` drop per-example Time/Space lines (B23)

- [ ] **2.1** In `src/services/prompts.ts`, add an explicit negative clause to the
  `GENERATE_EXAMPLES` prompt: keep the `## Generated Examples` heading, the
  `### Example A — <Simple/Medium/Tricky>: <desc>` heading, and the
  `**Input:**` / `**Output:**` / `**Why this helps:**` lines; add "Do NOT include a
  Time Complexity or Space Complexity line on the examples … (that belongs in the
  Hint/Analyze actions). Keep the Simple/Medium/Tricky label in the heading."
  - _Grounds: design §2 R2; origin confirmed as model free-styling, design §1.3._
- [ ] **2.2** Add guards in `prompts.test.ts`
  (new `describe('getSystemPrompt(GENERATE_EXAMPLES) — no per-example complexity line (B23)')`):
  - asserts the prompt still requests `**Input:**`, `**Output:**`, `**Why this helps:**`;
  - asserts it keeps the Simple/Medium/Tricky labelling;
  - asserts it carries an explicit instruction NOT to put a Time/Space complexity
    line on each example.
  - _Would-have-caught: the old prompt was silent on complexity, letting the model
    free-style Time/Space lines._

### 3. R3 — reason-aware chat placeholder (B24)

- [ ] **3.1** In `src/components/discovery-prompts.ts`, add the exported pure
  helper `chatPlaceholder(state)` + `PlaceholderState` interface exactly as in
  design §2 R3: priority order no-key → off-page → busy (`'Thinking…'`) →
  rotating example. Pure + DOM-free. Document the B24 reasoning in a doc-comment.
  - _Grounds: design §2 R3; node-env unit-test constraint design §1.5._
- [ ] **3.2** In `src/sidepanel/App.tsx`, replace the `currentPlaceholder`
  ternary (~line 659) with a call to `chatPlaceholder({ apiKeyConfigured,
  hasProblem: !!problemContext, isLoading, rotatingExample:
  PLACEHOLDER_EXAMPLES[placeholderIdx] })`. Import `chatPlaceholder` from
  `discovery-prompts` (the existing import line already pulls from that module).
  Do NOT touch `canInteract`, `showIdleCaret`, or any `disabled={!canInteract}`
  wiring.
  - _Grounds: design §1.4, §4._
- [ ] **3.3** Add a guard test for `chatPlaceholder`. Place it in a new
  `src/components/__tests__/discovery-prompts.test.ts` (DOM-free). Cases:
  - no key → `'Configure your API key first'` (even if also off-page / busy —
    no-key has top priority, R3.3);
  - key configured + `isLoading` true → NOT the no-key copy (the exact regression,
    R3.1/R3.2) and equals `'Thinking…'`;
  - key configured + no problem (`hasProblem:false`) + not loading → the off-page
    copy;
  - healthy state (key + problem + not loading) → the passed `rotatingExample`.
  - _Would-have-caught: busy-with-key previously showed the no-key copy._

### 3b. R5 — Pattern Recognition drops the stray complexity line (B25)

> Added 2026-10-15 after R1 was verified; same root cause/lever as R2.

- [ ] **3b.1** In `src/services/prompts.ts`, append a negative clause to the
  (R1-rewritten) `PATTERN_RECOGNITION` prompt: do NOT state time/space complexity
  here (belongs in Hint/Analyze); omit any "complexity for this pattern is…" line.
  Do NOT alter the R1 heading structure.
  - _Grounds: design §2 R5._
- [ ] **3b.2** Extend the B22 `describe` in `prompts.test.ts` with an assertion
  that the prompt forbids a complexity line.

### 3c. R6 — API-key removal via a "Remove key" button (B27)

> Added 2026-10-15. Settings/consent subsystem, folded in by the user's explicit
> choice. Root-cause analysis in design §2 R6.

- [ ] **3c.1** In `src/components/consent-gate.ts`, relax `canSaveSettings` so an
  EMPTY (trimmed) key is saveable when not mid-save, while a NON-empty key still
  requires consent:
  `const k = apiKey.trim(); if (saving) return false; if (!k) return true; return consentChecked;`
  Update the doc-comment to explain the B27 removal path.
  - _Grounds: design §2 R6 step 1; R6.6._
- [ ] **3c.2** In `src/components/consent-gate.ts`, add a pure exported helper
  `buildSettingsOnSave(args)` that returns the `UserSettings` to persist: given the
  trimmed key + model + guardrails + flags + `currentSettings`, when the key is
  empty it sets `apiConfig.apiKey:''`, `consentAcknowledged:false`,
  `consentVersion:0`; when the key is present it sets the key,
  `consentAcknowledged:true`, `consentVersion:CONSENT_VERSION`. Pure/DOM-free so the
  consent-reset-on-remove rule is unit-testable.
  - _Grounds: design §2 R6 step 2 + the DOM-free testing note; R6.2/R6.3._
- [ ] **3c.3** In `src/components/SettingsModal.tsx`:
  - add a **"Remove key" button next to the API-key field**, shown ONLY when
    `currentSettings?.apiConfig.apiKey` is non-empty (R6.1). On click: open an
    **in-panel themed confirm** (NOT `window.confirm` — review catch: native dialog
    pops centered on the whole browser, out of theme) with "Remove key"/"Keep key";
    confirming does `setApiKey('')` + `setConsentChecked(false)` + clears error, so
    the modal shows the first-run shape and Save (now enabled) persists it.
  - refactor `handleSave` to build the settings via `buildSettingsOnSave(...)` and
    DROP the `if (!key) { setError('API key is required'); return; }` bail so an
    empty key persists the first-run shape (R6.2/R6.3). Keep the consent error for
    the key-present-but-unchecked case.
  - **Live consent surface (review catch):** derive `keyPresent` from the live
    field and `showStaticConsent = consentedPreviously && keyPresent`; render the
    static "✓ acknowledged" box only when `showStaticConsent`, else the interactive
    checkbox. Make the interactive checkbox `checked={keyPresent && consentChecked}`
    with an `onChange` that no-ops while the field is empty, so "removed key +
    ticked consent" can never show or be saved.
  - _Grounds: design §2 R6 steps 2–4; R6.1/R6.3/R6.4/R6.5/R6.6._
- [ ] **3c.4** In `src/components/__tests__/consent-gate.test.ts`:
  - UPDATE the two existing "empty ⇒ Save disabled" cases to the new rule (empty is
    saveable), with a comment noting the B27 change;
  - keep "non-empty key requires consent" and "blocked while saving";
  - add `buildSettingsOnSave` cases: empty key ⇒ `apiKey:''` + consent reset
    (`consentAcknowledged:false`, `consentVersion:0`); present key ⇒ key +
    `consentAcknowledged:true` + `consentVersion:CONSENT_VERSION`.
  - _Would-have-caught: the hard empty-key gate that made removal impossible._

### 4. Verify (workflow.md "verify before you claim done")

- [ ] **4.1** `npm.cmd run build` — confirm it compiles (`built in <N>ms`). Fix
  any TS/build errors surfaced. (If the terminal garbles the command, write output
  to a temp file, read it, then delete the temp file.)
- [ ] **4.2** `npm.cmd run test` — confirm the full suite passes and the three new
  guards run green. Note the before/after test count.
- [ ] **4.3** `npm.cmd run lint` (if part of the pre-commit/CI set) — confirm 0 new
  warnings (the one pre-existing `App.tsx` exhaustive-deps warning is untouched).
- [ ] **4.4** Clean up any temp files created during verification.

### 5. Explain & STOP (hard gate — do NOT commit)

- [ ] **5.1** Write up what was built (what / why / how) for each of R1/R2/R3,
  including the before/after test count, and STOP for the user's review.
- [ ] **5.2** Remind the user to eyeball on the built, reloaded extension before any
  commit (unit tests only prove prompt shape / placeholder logic / the save gate):
  - R1 headings render correctly, R2 examples + R5 pattern card lose their
    complexity lines (model-driven);
  - R6: the "Remove key" button appears next to the key field, the confirm fires,
    Save persists the empty state, and the extension is then unusable (input
    disabled, no-key placeholder, "add your key" banner back); re-entering a key
    re-shows the consent checkbox.

### 6. On the user's go-ahead ONLY (not part of the autonomous pass)

- [ ] **6.1** Append bug-registry rows **B22 / B23 / B24 / B25 / B26 / B27** to
  `.kiro/specs/leetsage-guardrail-hardening/requirements.md` (format per the
  existing table; symptom / root cause / fix / guard / status). B26 is logged as
  OUT OF SCOPE (sibling spec); B22–B25 + B27 are fixed in this spec. (IDs start at
  B22 because the registry already used B20/B21 for prior shipped work.)
- [ ] **6.2** Add this spec's row to `.kiro/specs/README.md` (status + one-line
  summary; mark built-pending-review until merged).
- [ ] **6.3** Stage the specific files in logical groups and commit with a detailed
  message (summary + body) via `git commit -F <tempfile>`; delete the temp file.
  Decide separately what to do with the two unrelated untracked spec folders
  (`leetsage-coaching-logic-overhaul/`, `leetsage-repo-vault-mirror/`) — they are
  NOT part of this spec's commit.

---

## File-touch summary

| File | Change | Task |
|---|---|---|
| `src/services/prompts.ts` | rewrite `PATTERN_RECOGNITION` (headings + no-complexity); add negative clause to `GENERATE_EXAMPLES` | 1.1, 2.1, 3b.1 |
| `src/services/__tests__/prompts.test.ts` | add B22 (+B25) + B23 guard `describe`s | 1.2, 2.2, 3b.2 |
| `src/components/discovery-prompts.ts` | add pure `chatPlaceholder` + `PlaceholderState` | 3.1 |
| `src/sidepanel/App.tsx` | swap `currentPlaceholder` ternary for `chatPlaceholder(...)` | 3.2 |
| `src/components/__tests__/discovery-prompts.test.ts` | add B24 guard (appended to existing file) | 3.3 |
| `src/components/consent-gate.ts` | relax `canSaveSettings` for empty key; add pure `buildSettingsOnSave` | 3c.1, 3c.2 |
| `src/components/SettingsModal.tsx` | "Remove key" button + confirm; `handleSave` via `buildSettingsOnSave`, drop empty-key bail | 3c.3 |
| `src/components/__tests__/consent-gate.test.ts` | update 2 cases + add `buildSettingsOnSave` cases (B27) | 3c.4 |
| `.kiro/specs/leetsage-guardrail-hardening/requirements.md` | B22–B27 rows (B26 out-of-scope) | 6.1 (post-approval) |
| `.kiro/specs/README.md` | spec index row | 6.2 (post-approval) |

No renderer, filter, guardrail, router, manifest, or `OUTPUT_RULES` changes. R6
touches the settings/consent subsystem only and reuses the existing empty-key
storage shape (no schema change). B26 (off-page sticky context) is OUT OF SCOPE
(sibling spec).
