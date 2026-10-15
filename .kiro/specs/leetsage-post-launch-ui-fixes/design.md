# Post-Launch UI Fixes — Design

> **Phase:** Design. Requirements are signed off (see [`requirements.md`](./requirements.md)).
> Per `.kiro/steering/workflow.md`, this session did a **deep codebase read FIRST**
> (findings below), writes **design → PAUSE for sign-off → tasks → PAUSE → implement**.
> Nothing is built yet.
>
> **Why a full trilogy for small fixes?** These three are genuinely small/well-
> understood (two prompt-string tweaks + one placeholder decision), so a design-only
> doc would be defensible. But the parent requirements.md already exists and the
> user asked for the full design → tasks → implement flow with sign-off gates, so
> we honor that. Rigor is scaled by *having done the deep read* and keeping the
> design proportionate, not by skipping the gates.

**Date:** 2026-10-15 · **Branch:** `feature/post-launch-ui-fixes` (off `main`@`ffcd204`).
**Found by:** dogfooding the live Unlisted build on problem *167. Two Sum II*.

---

## 1. Deep-read findings (what the code actually does)

This is the "verify before you claim" grounding the requirements asked for. Every
claim below was read in the current code, not assumed.

### 1.1 The card renderer's supported markdown subset (`src/components/ContentDisplay.tsx`)

`renderContent(text)` splits on `\n` and matches each line against a FIXED subset:

| Prefix matched | Rendered as |
|---|---|
| ` ``` ` | fenced `<pre>` code block |
| `## ` (two hashes + space) | `<h2>` section heading (colored by `headingColor`) |
| `### ` (three hashes + space) | `<h3>` subheading |
| `- ` or `* ` | `<li>` (disc) |
| `^\d+\.\s` | `<li>` (decimal) |
| empty line | spacer |
| anything else | `<p>` paragraph (inline-rendered) |

**Key fact for R1:** there is **no `#### ` (h4) branch**. A line starting with
`#### ` does not match `## ` or `### ` (the 4th char is `#`, not a space), so it
falls through to the `<p>` branch and renders the literal text `#### Heading`.
That is exactly the screenshot bug. Inline formatting (`renderInline`) only honors
`**bold**` and `` `code` `` (B13 history) — it does not touch headings.

**Design consequence:** R1 is a **prompt fix, not a renderer fix.** The renderer
already supports `##`/`###` correctly (every other card proves it). We must NOT add
a `####` level — the requirement is explicit about conforming to the working
pattern, and adding an h4 would be new design the renderer still has to grow.

### 1.2 `PATTERN_RECOGNITION` prompt (`src/services/prompts.ts`)

Current string (verbatim):

```
You are LeetSmith. Identify the algorithmic pattern(s) in this problem.
<SOLUTION_PREVENTION_RULES>
Name the pattern, explain how to identify it, mention 1-2 similar problems. Do NOT explain how to apply it.
<OUTPUT_RULES><TONE_GUIDELINES>
```

Unlike **every other action prompt**, it prescribes **no heading structure at
all** — it just says "name the pattern, explain, mention similar problems." Compare:

- `GET_HINT` → `"## Hint [level]: [title]"` heading.
- `GENERATE_EXAMPLES` → `"## Generated Examples"` + `"### Example A — …"`.
- `BREAK_DOWN_PROBLEM` → `"## Problem Breakdown"` + `"### Step N: …"`.
- `CHECK_APPROACH` / `UNDERSTAND_SOLUTION` → explicit `## …` sections.

With no structure specified, the model free-styles its own hierarchy and reaches
for `####` sub-sub-headings the renderer can't show. **Root cause: the prompt is
under-specified on formatting** (confirms the requirements' leading hypothesis —
it's a prompt gap, not a renderer gap).

### 1.3 `GENERATE_EXAMPLES` prompt + the Time/Space origin

Current string (verbatim):

```
You are LeetSmith. Generate 2-3 NEW examples with complexity labels (Simple/Medium/Tricky).
<SOLUTION_PREVENTION_RULES>
Format under a "## Generated Examples" heading; for each, a "### Example A — <complexity>: <short description>" heading, then "**Input:**", "**Output:**", and "**Why this helps:**" lines with real values.
<OUTPUT_RULES><TONE_GUIDELINES>
```

**Origin of the Time/Space lines — located (requirement R2.3 asked us not to
assume):** the prompt **never requests a Time Complexity / Space Complexity line.**
The only per-example body lines it specifies are `**Input:**`, `**Output:**`,
`**Why this helps:**`. The `<complexity>` token in the `### Example A — <complexity>`
heading means the **Simple/Medium/Tricky difficulty label** (the opening sentence
says "complexity labels (Simple/Medium/Tricky)"). So the Time/Space lines on the
rendered card are **model free-styling** — the model volunteers them because
`OUTPUT_RULES` says "Whenever you state complexity, give BOTH time AND space," and
`GENERATE_EXAMPLES`'s loose format leaves room to state complexity per example.

**Design consequence:** there is no prompt clause to delete. The fix is to add an
**explicit negative instruction** telling the model NOT to put Time/Space
complexity on each example (and to keep the three useful lines). The Simple/Medium/
Tricky label stays — it lives in the heading, is semantically distinct, and R2.3
keeps it.

> Note: the `GENERATE_EXAMPLES` card is a NON-EXEMPT action (confirmed in
> `predisplay-gate.test.ts` — it's in the `nonExempt` list), so it flows through
> `filterResponse` + the B1 gate. This fix is prompt-shape only; it does not touch
> that path, and the output filter is unaffected (dropping a complexity *line* can
> only reduce what's shown, never leak more).

### 1.4 The streaming-placeholder bug (`src/sidepanel/App.tsx`)

Confirmed verbatim at the cited lines:

```ts
const canInteract = apiKeyConfigured && !!problemContext && !isLoading;   // ~589
const currentPlaceholder = canInteract
  ? PLACEHOLDER_EXAMPLES[placeholderIdx]
  : 'Configure your API key first';                                        // ~659
```

`canInteract` is overloaded for TWO jobs:

1. **Enable/disable** the input, Send button, QuickActions, and Try-chips
   (`disabled={!canInteract}`) — this is *correct* in all three disabled states
   (no key, off-page, busy): you shouldn't type while any of them hold.
2. **Choose the placeholder copy** — this is the BUG. It collapses all three
   disabled reasons into the single "Configure your API key first" string, so the
   instant a request starts (`isLoading → true`), the key-fine user is wrongly told
   to configure a key.

The three underlying signals already exist in scope:
`apiKeyConfigured` (boolean), `problemContext` (truthy = on a problem page),
`isLoading` (request in flight).

**Design consequence:** keep `canInteract` as the single enable/disable gate (don't
touch the `disabled=` wiring — that behavior is right). Only the **placeholder
copy** needs to become reason-aware, derived from the three signals in priority
order.

### 1.5 How App-level logic gets unit-tested in this repo

The vitest env is **`node` (DOM-free) on purpose** (`predisplay-gate.test.ts`
documents this and tests App's gate by extracting the *decision* into a pure
predicate). There is no React Testing Library / jsdom here. So R3's guard must
follow the same pattern: **extract the placeholder decision into a pure,
exported function** and unit-test that function — do not try to render App.

---

## 2. The three fixes

### R1 — `PATTERN_RECOGNITION` heading formatting (bug **B22**)

**Change:** rewrite the `PATTERN_RECOGNITION` prompt string to prescribe an
explicit `##`/`###` structure, mirroring how the other cards are specified. Content
stays the same (name the pattern, how to identify it, 1-2 similar problems, no
application walkthrough — R1.3).

Proposed structure (uses only renderer-supported levels):

```
Format under a "## Pattern Recognition" heading. For EACH pattern, a
"### <Pattern name>" subheading, then a "**How to spot it:**" line and a
"**Similar problems:**" line (1-2). Do NOT explain how to apply it, and do NOT
use any heading deeper than "###" (our renderer supports only "##" and "###").
```

Why this shape:
- `## ` + `### ` are the only heading levels the renderer draws (§1.1). The
  explicit "no heading deeper than ###" instruction is a belt-and-suspenders guard
  against the exact `####` free-styling we observed.
- Mirrors the `BREAK_DOWN_PROBLEM`/`GENERATE_EXAMPLES` "`##` section + `###`
  per-item" idiom the working cards already use.
- `headingColor()` already maps "pattern" → pink, so the heading gets its color for
  free.

**No renderer change.** (Investigation confirmed the working cards owe correct
rendering to the `##`/`###` prompt structure, per R1.2's hypothesis.)

### R2 — `GENERATE_EXAMPLES` drop per-example Time/Space lines (bug **B23**)

**Change:** add an explicit negative clause to the `GENERATE_EXAMPLES` prompt. Keep
`**Input:**`, `**Output:**`, `**Why this helps:**` and the Simple/Medium/Tricky
heading label; forbid a Time/Space complexity line per example.

Proposed added clause (appended to the existing format sentence):

```
Do NOT include a Time Complexity or Space Complexity line on the examples —
examples are for building intuition about inputs/outputs, not for complexity
analysis (that belongs in the Hint/Analyze actions). Keep the Simple/Medium/Tricky
label in the heading.
```

Why this shape:
- The Time/Space lines are model free-styling (§1.3) — there's no clause to delete,
  so an explicit prohibition is the correct lever.
- Naming *where* complexity belongs (Hint/Analyze) discourages the model from
  "helpfully" adding it back, and matches the product's separation of concerns.
- Explicitly keeping the Simple/Medium/Tricky label protects R2.3 against the model
  over-reading "no complexity" and dropping the difficulty label too (they share
  the word "complexity" in the current prompt — a real ambiguity we're removing).

**Interaction with `OUTPUT_RULES`:** `OUTPUT_RULES` says "whenever you state
complexity, give both time and space." That's a *formatting* rule conditioned on
"whenever you state complexity" — our clause tells the model not to state
complexity *on examples* in the first place, so there's no contradiction. We are
not editing `OUTPUT_RULES` (shared by all actions).

### R3 — Reason-aware chat placeholder (bug **B24**)

**Change:** introduce a pure, exported helper that maps the three signals to the
correct placeholder, and use it in `App.tsx` instead of the `canInteract` ternary.
Leave `canInteract` and every `disabled={!canInteract}` wiring untouched.

New pure function (location: `src/components/discovery-prompts.ts` — it already owns
`PLACEHOLDER_EXAMPLES` and the pure `resolveSubmitText`, so the placeholder-copy
decision is a natural neighbor and keeps App importing from one discovery module):

```ts
export interface PlaceholderState {
  apiKeyConfigured: boolean;
  hasProblem: boolean;   // !!problemContext — on a problem page
  isLoading: boolean;    // a request is in flight
  rotatingExample: string; // PLACEHOLDER_EXAMPLES[placeholderIdx]
}

/**
 * Decide the chat input placeholder from the SPECIFIC reason it's disabled,
 * in priority order, so a busy/off-page state never shows the no-key copy (B24).
 * Pure + DOM-free so it unit-tests under the node vitest env.
 */
export function chatPlaceholder(s: PlaceholderState): string {
  if (!s.apiKeyConfigured) return 'Configure your API key first';
  if (!s.hasProblem)       return 'Open a LeetCode problem to get started';
  if (s.isLoading)         return 'Thinking…';
  return s.rotatingExample;
}
```

Priority order rationale:
1. **No key** wins first — it's the only state the user must *act* on; it stays the
   genuine "Configure your API key first" copy (R3.3).
2. **Off a problem page** next — matches the header's existing "Open a LeetCode
   problem to get started" wording (DRY the user-facing phrasing).
3. **Busy** → a neutral `"Thinking…"` (R3.2 — benign, reflects disabled-because-busy,
   not no-key). This also pairs naturally with the existing B1/B5 "thinking"
   vocabulary the user already sees mid-stream.
4. Otherwise → the normal rotating example (the healthy, idle state).

Call-site change in `App.tsx`:

```ts
const currentPlaceholder = chatPlaceholder({
  apiKeyConfigured,
  hasProblem: !!problemContext,
  isLoading,
  rotatingExample: PLACEHOLDER_EXAMPLES[placeholderIdx],
});
```

`showIdleCaret` keeps using `canInteract` (the decorative caret should still only
show when the field is genuinely usable — unchanged).

---

### R5 — Pattern Recognition drops its stray complexity line (bug **B25**)

> Added 2026-10-15, after R1 was verified live. The deep read for R1 already
> explained WHY this happens: the shared `OUTPUT_RULES` says "Whenever you state
> complexity, give BOTH time AND space," and with `PATTERN_RECOGNITION`'s format
> leaving room, a cheap model volunteers a "Complexity for this pattern is
> typically O(N)…" line. Identical root cause + lever to R2.

**Change:** append a negative clause to the (already-R1-rewritten)
`PATTERN_RECOGNITION` prompt: do NOT state time/space complexity here (it belongs
in Hint/Analyze); omit any "complexity for this pattern is…" line. No renderer
change; heading structure from R1 untouched. **Review follow-up:** also instruct
the prompt to put a BLANK LINE between the `### <pattern>` subheading, the
"How to spot it" line, and the "Similar problems" line — on the live build they
rendered cramped back-to-back vs. the well-spaced Hint card (the renderer turns a
blank line into a spacer, so this is a prompt-shape fix, not a renderer change).

**Guard:** extend the B22 `describe` in `prompts.test.ts` with an assertion that
the prompt forbids a complexity line.

### R6 — API-key removal via an explicit "Remove key" button (bug **B27**)

> Added 2026-10-15. Different subsystem from R1–R3 (settings/consent), folded in
> here by the user's explicit choice rather than a separate spec. Full root-cause
> analysis below.

**Root cause (traced in code).** `SettingsModal` is a one-way "enter a key to
start" form. Two places hard-require a non-empty key:
- `canSaveSettings(apiKey, consentChecked, saving)` →
  `apiKey.trim().length > 0 && consentChecked && !saving` — Save disabled on empty.
- `handleSave()` → `if (!key) { setError('API key is required'); return; }` — bails
  on empty even if Save fired.

So no UI path persists an empty key → the key can never be removed.

**Why the hard part is already done.** An empty key is ALREADY a fully-supported
state everywhere downstream (verified):
- `getSettings()` defaults `apiConfig.apiKey = ''` for a fresh install.
- `handleActionClick` and `handleChatSubmit` both early-return on
  `!settings?.apiConfig.apiKey`.
- `apiKeyConfigured = Boolean(settings?.apiConfig.apiKey)` → `canInteract` false →
  input/Send/QuickActions disabled; our R3 `chatPlaceholder` shows the no-key copy;
  the `!apiKeyConfigured` orange "add your key" banner reappears.

So **removing the key already makes the extension unusable (R6.4) for free** — the
only missing piece is the ability to SAVE the empty state.

**Consent-reset decision (R6.3).** On removal, reset consent to unacknowledged
(`consentAcknowledged = false`, `consentVersion = 0`). Three reasons:
1. Consent is about data transmission; with no key, nothing is ever sent, so a
   persisted "consented" records consent for an impossible activity.
2. `isAlreadyConsented()` is ALREADY key-conditional
   (`Boolean(settings.apiConfig?.apiKey) && …`). Persisting `true` with an empty
   key would make the stored flag disagree with the gate's own definition —
   resetting keeps the data model self-consistent.
3. The consent-gate code already names "the key is cleared" as a legitimate
   re-prompt trigger. Re-entering a key therefore re-shows the interactive consent
   checkbox — i.e. re-entering a key = re-consenting to send data. Correct posture.

**Design of the fix (minimal, settings-subsystem only):**

1. **`consent-gate.ts`** — relax the Save gate so the empty/remove path is
   saveable WITHOUT weakening the gate for the real (key-present) case. Split the
   logic conceptually:
   - saving WITH a key → still requires consent (unchanged, R6.6);
   - saving an EMPTY key (removal) → always allowed (not saving-in-flight).
   Concretely, `canSaveSettings` becomes:
   `const key = apiKey.trim(); if (saving) return false; if (key.length === 0) return true; return consentChecked;`
   This keeps every existing `canSaveSettings` test green EXCEPT the two that
   assert empty ⇒ false — those get UPDATED (empty is now saveable) and the intent
   is re-documented. (Only two existing cases change; both are the ones the bug
   lived behind.)
2. **`SettingsModal`** — add a **"Remove key" button next to the API-key field**
   (R6.1), shown only when a key is currently configured
   (`currentSettings?.apiConfig.apiKey` non-empty). On click: an **in-panel,
   themed confirm** (NOT `window.confirm`, which pops centered on the whole
   browser out of theme — a review catch) with "Remove key" / "Keep key" buttons;
   confirming clears the field state (`setApiKey('')`, `setConsentChecked(false)`)
   so the modal reflects the first-run shape, and the user presses Save (now
   enabled by the relaxed gate) to persist it. Keeps removal deliberate (R6.1)
   without a destructive surprise.
   - `handleSave()` loses its `if (!key) { … return; }` bail; when `key` is empty
     it persists the first-run settings shape with `apiKey: ''`,
     `consentAcknowledged: false`, `consentVersion: 0` (R6.2/R6.3).
   - **Consent SURFACE reacts to the LIVE key (review catch).** The static
     "✓ acknowledged" box vs. the interactive checkbox was gated on
     `isAlreadyConsented(currentSettings)` — computed ONCE from the opening
     settings — so a returning user who removed the key in-session still saw the
     static "acknowledged" box (removed key + shown consent = nonsense). Fix:
     `showStaticConsent = consentedPreviously && keyPresent` (keyPresent from the
     live field), so clearing the key immediately flips to the interactive,
     UNticked checkbox. The interactive checkbox is additionally `checked={keyPresent
     && consentChecked}` and its `onChange` is a no-op while the field is empty —
     so "no key + ticked consent" can never appear or be saved.
3. **Disabled-reason caption** — when the field is empty, the caption/Save state
   should read as a removal, not an error. With the relaxed gate, Save is ENABLED
   on empty, so the existing `!canSave` caption simply won't show for empty; no
   "API key is required" error path remains for the empty case.
4. **Cancel path (R6.5)** — unchanged. `onClose` persists nothing, so "blank +
   unchecked + Cancel" stays a no-op. Verified: Cancel is `onClick={onClose}`.

**Guard (R6.7):** extend `consent-gate.test.ts` — empty key saveable; (the modal's
empty-key save writes consent=false is asserted via the pure save-shape helper or a
documented behavioral note since the write itself is in the React component and this
repo is DOM-free); non-empty key still requires consent; existing cases updated.

> **DOM-free testing note.** As with R3, we can't render the modal (node vitest
> env). The pure, testable surface is `consent-gate.ts`. The one piece that lives
> only in the component (the actual `handleSave` writing consent=false on empty) is
> covered by the user's manual eyeball + the pure gate test proving empty is
> saveable. If we want it unit-tested, we extract a pure
> `buildSettingsOnSave(...)` helper — see tasks 6.x; included as a small, worthwhile
> extraction so the consent-reset-on-remove rule is guarded, not just eyeballed.

## 3. Coordination with the sibling spec (`leetsage-coaching-logic-overhaul`)

The sibling spec owns **off-page input gating** and will want the placeholder to
also say *why* the input is disabled when the user is off a problem page / gated.
This design is deliberately built to **not fight** that work:

- The placeholder decision is now a **single pure function with explicit priority
  branches**, not an inline ternary. The sibling spec can add/adjust the off-page
  (or a future "gated") branch in ONE place with a clear precedence, instead of
  re-untangling an overloaded `canInteract`.
- We already give the off-page case its own branch and message, so the sibling's
  gating has a seam to slot into rather than a collision to resolve.
- We do **not** change `canInteract` or any `disabled=` wiring, so we don't preempt
  how the sibling decides to gate the input itself.

This is the extent of the coordination R3.3's note asked for — noted here, no shared
code written across the two specs.

> **Related: bug B26 (OUT OF SCOPE here).** Dogfooding 2026-10-15 found that
> navigating off a problem page keeps the stale `problemContext` loaded, so
> `!!problemContext` stays true and the off-page placeholder branch never fires
> (which is why the R3 off-page copy couldn't be verified live). Making
> `problemContext` clear on leaving a problem page is **off-page gating** — the
> sibling spec's territory — and the user explicitly scoped it OUT of this spec.
> The R3 branch LOGIC is correct and already waiting; B26 is logged as a registry
> row for the sibling spec to resolve.

---

## 4. What is explicitly NOT changing

- **The renderer** (`ContentDisplay.tsx`) — R1 is a prompt fix; no new heading
  level, no inline-render change.
- **`OUTPUT_RULES` / `TONE_GUIDELINES` / `SOLUTION_PREVENTION_RULES`** — shared by
  all actions; untouched.
- **`filterResponse`, the B1 pre-display gate, `getChatSystemPrompt`,
  `getChatAgentSystemPrompt`, the intent router, the agent loop** — none of this is
  in scope (that's the sibling spec / prior specs).
- **`canInteract` and the input/Send/QuickActions `disabled` wiring** — correct as
  is; only the placeholder *copy* derivation changes.
- **The structured-data blocks** on `CHECK_APPROACH`/`UNDERSTAND_SOLUTION`/
  `GENERATE_REPORT` — `GENERATE_EXAMPLES` and `PATTERN_RECOGNITION` are not
  structured producers, so no schema is affected.
- **The consent GATE for the key-present case** (R6) — saving WITH a key still
  requires the consent box; only the empty/remove path becomes saveable.
- **The storage layer / settings schema** — removal reuses the already-supported
  empty-key shape; no new fields, no migration.
- **B26 (off-page sticky problem context)** — sibling spec's job, not touched here.

---

## 5. Testing strategy (each fix gets a test that would have caught it — R4.2)

All DOM-free (node vitest env, §1.5):

- **B22 (R1)** — in `prompts.test.ts`: assert `getSystemPrompt('PATTERN_RECOGNITION')`
  prescribes a `## ` heading and a `### ` per-pattern subheading, and explicitly
  forbids headings deeper than `###` (i.e. contains no instruction to emit `####`,
  and tells the model the renderer supports only `##`/`###`). A would-have-caught
  assertion: the prompt no longer leaves heading structure unspecified.
- **B23 (R2)** — in `prompts.test.ts`: assert `getSystemPrompt('GENERATE_EXAMPLES')`
  (a) still asks for `**Input:**`/`**Output:**`/`**Why this helps:**`, (b) keeps the
  Simple/Medium/Tricky label, and (c) carries an explicit instruction NOT to put a
  Time/Space complexity line on each example.
- **B24 (R3)** — in `discovery-prompts.test.ts`: `chatPlaceholder`
  returns the no-key copy ONLY when `apiKeyConfigured` is false; returns a NON-no-key
  string when `isLoading` is true with a key configured (the exact regression); the
  off-page string when there's no problem; and the rotating example in the healthy
  state. The priority order (no-key beats off-page beats busy) is asserted directly.
- **B25 (R5)** — in `prompts.test.ts` (extend the B22 `describe`): assert the
  `PATTERN_RECOGNITION` prompt forbids a time/space complexity line.
- **B27 (R6)** — in `consent-gate.test.ts`:
  - `canSaveSettings`: empty key (trimmed) is now SAVEABLE when not mid-save, even
    with consent unchecked (the removal path); a NON-empty key still requires
    consent; still blocked while saving. (The two existing "empty ⇒ false" cases
    are UPDATED to the new rule with a comment explaining the B27 change.)
  - a new pure `buildSettingsOnSave(...)` helper (extracted from `handleSave`): when
    the key is empty it yields `apiKey:''`, `consentAcknowledged:false`,
    `consentVersion:0`; when the key is present it yields the key +
    `consentAcknowledged:true`, `consentVersion:CONSENT_VERSION`. This makes the
    consent-reset-on-remove rule unit-testable instead of eyeball-only (worthwhile
    for a privacy-relevant behavior).
  - the "Remove key" button rendering + confirm + the manual unusable-after-remove
    check (R6.4) stay the user's eyeball (DOM-free env).

The prompt-string edits are additive/negative-clause; the placeholder behavior is a
new function + call-site swap; the R6 gate change updates two existing consent-gate
cases (documented).

---

## 6. Risk & reversibility

Low risk, all local and reversible:
- Three prompt-string edits (R1/R2/R5 — behavioral only via the model; guarded by
  string tests).
- One pure placeholder helper + a one-line call-site swap in `App.tsx` (R3).
- R6: a relaxed pure Save-gate + a pure `buildSettingsOnSave` helper + a "Remove
  key" button and a `handleSave` tweak in `SettingsModal`. No storage schema change
  (reuses the empty-key shape), no network, no manifest, no filter/guardrail path.
- The one slightly-sharp edge in R6 is the consent reset — but it is deliberate
  (R6.3), guarded by the new pure helper test, and reversible (re-entering a key
  re-consents, exactly like first run).

The **visual** outcomes (R1 headings, R2/R5 examples/pattern losing complexity
lines) depend on the live model and **must be eyeballed on the built extension
before commit** (workflow.md hard rule). R6's "Remove key" button, its confirm, and
the extension-unusable-after-remove behavior also need an eyeball — the unit tests
prove the gate + save-shape, not the rendered modal.

---

## 7. Bug-registry rows to add (on commit, with the user's go-ahead)

Append to `leetsage-guardrail-hardening/requirements.md` (next free IDs):

- **B22** — PATTERN_RECOGNITION renders `####` as literal text (prompt
  under-specified on formatting). Guard: `prompts.test.ts`.
- **B23** — GENERATE_EXAMPLES shows noisy per-example Time/Space lines (model
  free-styling; prompt silent). Guard: `prompts.test.ts`.
- **B24** — chat placeholder shows "Configure your API key first" mid-stream
  (`canInteract` collapses busy/off-page into the no-key copy). Guard: pure
  `chatPlaceholder` unit test.
- **B25** — PATTERN_RECOGNITION free-styles a stray "complexity for this pattern
  is…" line (same `OUTPUT_RULES` nudge as B23). Guard: `prompts.test.ts`.
- **B26** — off-page keeps stale `problemContext` loaded (off-page placeholder
  branch never fires). **Logged only — OUT OF SCOPE**, belongs to the sibling
  `leetsage-coaching-logic-overhaul` (off-page gating). No fix here.
- **B27** — API key cannot be removed/blanked via the UI (`SettingsModal` +
  `canSaveSettings` hard-require a non-empty key). Fix: a "Remove key" button + a
  relaxed Save gate (empty saveable) + consent reset on removal. Guard:
  `consent-gate.test.ts` + a pure `buildSettingsOnSave` helper test.

And add this spec's row to `.kiro/specs/README.md`.

> Per workflow.md these doc edits — and the commit — wait for the user to review
> (including eyeballing the built extension for R1/R2).
