# Coaching Logic Overhaul — Design

> **Design phase.** Requirements are signed off (see [`requirements.md`](./requirements.md)).
> This is the full-trilogy middle phase — tasks come next, in a separate pass,
> **after** this design is signed off. Per `.kiro/steering/workflow.md` this is a
> SUBSTANTIAL, guardrail-touching spec, so it gets requirements + design + tasks
> with a pause between each.
>
> **Status:** 📐 Design draft — awaiting sign-off. Nothing built.
> **Date:** 2026-10-15. **Branch:** `feature/coaching-logic-overhaul` (off `main`
> @ `831c81f`, after the sibling `leetsage-post-launch-ui-fixes` PR #30 merged).
>
> This design was written **after a deep read of the real code** (the thing the
> requirements' "Notes" block asked for). Every decision below cites the file +
> behavior it rests on, so the tasks pass can be written against reality rather
> than assumption.

---

## 0. Reading map — what the code actually does today

The grounding facts this design builds on (verified by reading the files):

- **Actions flow through `App.tsx handleActionClick`** (`src/sidepanel/App.tsx`).
  Only `CHECK_APPROACH | UNDERSTAND_SOLUTION | GENERATE_REPORT` read the editor
  code (via `extractCurrentCode`); every other action — including
  `TIME_COMPLEXITY_HINT` — never reads code. The stream commits by:
  `parseStructuredResponse(fullContent, actionType)` → `filterResponse(prose,
  actionType)` → store `{ content: filteredContent, metadata.structured: data }`.
  Then `recordOptimalPin(url, data.optimalComplexity, actionType)`.
- **The Analyze "⚡ Efficiency" block is plain markdown**, not a bespoke
  component. `CHECK_APPROACH`'s prompt (`prompts.ts`) emits a `## ⚡ Efficiency`
  section with `**Current:**`, `**Optimal:**`, `**Variables:**`, and a
  `**Where the cost comes from:**` bullet breakdown. `ContentDisplay.tsx` colors
  the heading (amber for "efficiency/complexity") and `complexity-parse.ts`
  renders every `O(...)` as a badge. **Consequence:** a complexity-hint card that
  emits the same section headings renders identically **with zero new render
  code.**
- **The structured data contract** (`structured-parser.ts`): `STRUCTURED_ACTIONS
  = {CHECK_APPROACH, UNDERSTAND_SOLUTION, GENERATE_REPORT}`. Each has a schema;
  the model appends a `leetsage-data` JSON block the client strips before
  display. `AnalyzeData` already carries exactly what a complexity hint needs:
  `currentComplexity {time,space}`, `optimalComplexity {time,space}`,
  `onOptimalPath: boolean`. `parseStructuredResponse` for a non-structured action
  just returns `{ prose: raw }` (no data).
- **The complexity pin (B10, `complexity-pin.ts`)**: one canonical optimal per
  `/problems/{slug}/`, authority rule in the pure `shouldRepin()`.
  `handleActionClick` already reads `existingPin` and passes `pinnedOptimal` into
  `buildUserMessage`, which appends `pinnedOptimalConstraint(...)` for
  `CHECK_APPROACH`/`GENERATE_REPORT` (not `UNDERSTAND_SOLUTION`).
- **The off-page gate**: `canInteract = apiKeyConfigured && !!problemContext &&
  !isLoading` drives `QuickActions` `disabled`, the chat input `disabled`, the
  Send button, and the "Try asking" chips. The chat *placeholder* already uses a
  specific-reason helper `chatPlaceholder({apiKeyConfigured, hasProblem,
  isLoading, ...})` (B24, from the sibling spec) — but the *enable/disable* wiring
  still keys on the coarse `canInteract`.
- **`problemContext` is pull-based** (ADR-006). `pullFromActiveTab` →
  `REQUEST_PROBLEM_DATA` with retry/backoff via the pure `active-tab-pull.ts`
  brain (`MAX_ATTEMPTS=10`, `DELAY_MS=700` → up to ~7s, plus a one-shot
  `chrome.scripting` inject for stale tabs). So **`problemContext` is null for a
  real multi-second window on a genuine problem page** (fresh load, tab switch,
  stale-tab inject). This is the crux of the R4 decision (§3).
- **`getActiveLeetCodeTabId()`** reads the active tab URL directly
  (`chrome.tabs.query` → `tab.url?.includes('leetcode.com/problems/')`) — an
  **independent signal available regardless of `problemContext`**.
- **`filterResponse` returns `FilterResult {filteredContent, wasFiltered,
  filterReason?}`** (`types/api.ts`). Two callers consume it, both only read
  `filteredContent`: the `handleActionClick` stream-commit and the
  `handleChatSubmit` final reveal. The B1 pre-display gate (`streamLive =
  isSolutionExemptAction(...)`) withholds non-exempt tokens until this commit.
- **The eval gate scores ONLY `wasFiltered`** — both the Vitest gate
  (`guardrail-eval.test.ts`: `predictedLeak: filterResponse(...).wasFiltered`)
  and the Promptfoo bridge (`solution-filter-assert.ts`: `const {wasFiltered} =
  filterResponse(...)`). **Neither inspects `filteredContent`.** This is the key
  that makes R6 safe (§5).

---

## 1. R1–R3 — Code-aware complexity hint

### 1.1 What changes

`TIME_COMPLEXITY_HINT` becomes **code-aware**, rendered as a single card modeled
on the Analyze "⚡ Efficiency" block. Concretely:

1. **Add it to the code-reading set** in `handleActionClick`: read the editor
   code the same way `CHECK_APPROACH` does (`extractCurrentCode` →
   `{ok|empty|failed}`). Unlike `CHECK_APPROACH`, a failed/empty read does **not**
   hard-stop — it falls back to the optimal-only hint (R2).
2. **Add it to `STRUCTURED_ACTIONS`** so it carries a small `leetsage-data`
   block. New `ComplexityHintData` schema (minimal — reuses the `Complexity`
   type):
   ```ts
   interface ComplexityHintData {
     currentComplexity: { time: string; space: string } | null; // null when no code
     optimalComplexity: { time: string; space: string };
     onOptimalPath: boolean; // true == current already matches optimal
   }
   ```
   `null` current is the explicit "no code / couldn't read" signal (R2.2 — never
   fabricate a Current).
3. **Two prompt shapes, selected by whether code was read:**
   - **Code present** → emit a `## ⚡ Efficiency` block identical in shape to
     Analyze: `**Current:**`, `**Optimal:**`, `**Variables:**`, `**Where the cost
     comes from:**` bullets. Then **adaptive**:
     - current **worse** than optimal → add a `**Hint:**` section (nudge toward
       closing the gap, no algorithm) **and** a `**What this means:**` line (R1.2).
     - current **already optimal** → a `**What this means:**` line **and** a
       "you've reached optimal time/space" affirmation, and **no `**Hint:**`
       section** (R1.3).
   - **No code** → today's behavior: `## Complexity Hint` with `**Target time:**`,
     `**Target space:**`, `**What this means:**`, `**Hint:**` — optimal-only, no
     Current line, no claim about the user's code (R2.1).
4. **Reuse the pin for Optimal (R3.1).** `TIME_COMPLEXITY_HINT` is treated like
   `CHECK_APPROACH` for the pin: it receives `pinnedOptimalConstraint(pinnedOptimal)`
   so the Optimal it shows equals the canonical pin when one exists. It is **not**
   the `UNDERSTAND_SOLUTION` authority, so per `shouldRepin()` a later hint never
   overwrites an existing pin — but if **no** pin exists yet, the hint's emitted
   `optimalComplexity` pins it (first authoritative emission), exactly like a first
   `CHECK_APPROACH`. This keeps the hint from introducing a *new* optimal.
5. **Honesty (R1.4).** The `**Current:**` line is framed as a model estimate. The
   `COMPLEXITY_REASONING_LEVERS` block (hidden chain-of-thought + constraint-anchored
   variables) and the `COMPUTE, DON'T COPY` / `STATE YOUR VARIABLES` rules — already
   written for `CHECK_APPROACH` — are reused verbatim so the Current is computed
   from the user's actual code, not a familiar default. The card carries the same
   model-correctness caveat as B14/B16: stable + honest ≠ provably correct.

### 1.2 "Build upon" the Efficiency block, not copy it

To be explicit (this answers a review question): this is a **new, adaptive card**,
not a duplicate of the Analyze card. What we *reuse* is the Analyze block's
**shape and machinery** — the `## ⚡ Efficiency` markdown structure, the `O(...)`
badge renderer, the `Complexity` type, and the pin — so it renders consistently
and we don't re-implement rendering. What we *add* on top of that foundation:

- the **adaptive branch** Analyze doesn't have (worse-than-optimal → Hint +
  "What this means"; already-optimal → affirmation + "What this means", no Hint);
- the **no-code fallback** Analyze doesn't need (optimal-only, no Current line).

So: same visual language and plumbing, different behavior. "Build upon," not copy.

### 1.3 Everything is model-decided (there is no deterministic complexity analysis)

To clear up the review confusion: **the model computes everything** — Current,
Optimal, Variables, the breakdown, AND whether current-matches-optimal. There is
no code anywhere in this design that computes or compares Big-O. We can't, and we
don't try to.

The only narrow question was: once the model has *written* "Current: O(N²)" and
"Optimal: O(N)", does **code** decide "show the Hint section" by string-comparing
those two Big-Os, or does the **model** decide? Answer: **the model decides**, by
emitting the already-existing `onOptimalPath` boolean in its structured block,
and the prompt tells it to include/omit the Hint section accordingly.

Why not have code string-compare the two Big-Os (even just to pick the section):

- **`AnalyzeData.onOptimalPath` already exists and is already model-emitted** for
  the Analyze card — reusing it is zero new concept and keeps the two cards
  consistent.
- **A Big-O magnitude comparator is unreliable, new, fragile code** we'd rather
  not own — notation varies (`·` vs `*`, `^`, `min()`, multi-variable), and `O(N)`
  vs `O(N·M)` isn't a string compare. It's the exact class of thing B13
  (`O(min(a,b))` → `O(miN...)`) warned us about. `complexity-parse.ts` renders a
  badge; it does not and should not rank magnitudes.
- **Predictability lives at the PATH level** (what R1/R5 need): the section
  structure is driven by one boolean the model commits to, and the prompt forces
  the prose to reconcile with it (the same "headline must match your breakdown"
  discipline already in `CHECK_APPROACH`). The prompt instruction: decide
  `onOptimalPath` from the Current-vs-Optimal you just wrote, then include/omit the
  Hint section accordingly, and never show a Hint while asserting optimal. A unit
  test pins that instruction (`prompts.test.ts` pattern).

**Honest limit (documented, not a bug):** if the model mis-judges optimality it
may show/omit the Hint wrongly — the standing E10 model-correctness concern, same
caveat as B14/B16/B10. This spec makes the hint *code-aware and structurally
predictable*, not *provably correct*. Already in requirements "Out of scope"; will
be restated in code + docs.

### 1.3 R3.2 — stays NON-EXEMPT; must survive the filter

`TIME_COMPLEXITY_HINT` is **not** added to `SOLUTION_EXEMPT_ACTIONS`. Its output
still passes `filterResponse`. The legitimate complexity breakdown must not look
like a leak:

- The card contains **no fenced code block** and **no step-by-step algorithm**.
  "Where the cost comes from" is per-operation *cost* prose ("the nested loop
  scans the array for each element → O(N²)"), which does not trip
  `looksLikeFullPseudocode` (no loop+result+≥5 control-lines, no
  loop+2-bound-updates+terminator). The existing `neg-complexity-1` fixture
  ("Your nested loop is O(n^2)… trade space for time to get to O(n)") is proof
  this style passes clean today.
- The `**Hint:**` section is a *nudge* ("a different data structure could make
  the lookup O(1)"), explicitly **not** the algorithm — same bar as `GET_HINT`.
- **New eval negatives** (R7) will add realistic code-aware complexity-hint cards
  (both worse-than-optimal and already-optimal shapes) as `leaksSolution: false`
  so the gate proves the hint survives the filter and we don't regress FP=0.

### 1.4 Rendering — no new component

Because the card is markdown with the same section headings, `ContentDisplay`
already renders it: amber heading, `O(...)` badges, bold labels. The content type
stays `HINT` (as it is today for `TIME_COMPLEXITY_HINT` in `actionToContentType`).
`stripDataBlockForDisplay` already hides the trailing `leetsage-data` block once
`TIME_COMPLEXITY_HINT` is in `STRUCTURED_ACTIONS`. **This is a visual change the
user must eyeball on the built extension before commit** (per workflow.md).

---

## 2. R4 — Off-page input gating: the reliability decision

### 2.1 The evidence (what R4.5 demanded we produce)

**Is `!!problemContext` a trustworthy "on a coachable problem page" signal that
can NEVER false-negative on a real page (R4.4)?**

**No.** Direct from the code:

- `problemContext` is populated only by `applyProblem`, called after a *successful*
  pull. `pullFromActiveTab` retries up to `MAX_ATTEMPTS=10` at `DELAY_MS=700` (~7s),
  with a possible `chrome.scripting` inject + `POST_INJECT_DELAY_MS` for stale
  tabs. During all of that, on a **genuine** `/problems/{slug}/` page,
  `problemContext` is `null`.
- Trigger windows where this bites a real page: initial panel open on an
  already-loaded problem; a tab switch (`onActivated` re-pulls from scratch); a
  freshly reinstalled extension on a pre-existing tab (the inject path); a slow
  LeetCode SPA transition.
- Therefore gating **hard-disable on `!!problemContext` alone would violate R4.4**
  — it would disable inputs on a real problem page for several seconds, exactly
  the "transient load/race" the hard bar forbids.

**Is there a sturdier signal?** Yes: `getActiveLeetCodeTabId()` already reads the
active tab URL synchronously-ish via `chrome.tabs.query` and matches
`leetcode.com/problems/`. The normalized slug comes from `slugFromUrl` (used by
the pin + records). **The URL is available independently of the pull**, so "the
active tab is a problem page" can be known even while `problemContext` is still
loading.

### 2.2 Decision: HARD-DISABLE, gated on a URL signal + a settled-load grace (not on `problemContext` alone)

We **can** meet R4.4, so we take the **hard-disable** path (R4.1), but we define
"off a coachable page" on a signal that is false-negative-safe:

> **`onCoachablePage` = "the active tab's URL matches `leetcode.com/problems/`"**,
> tracked as its own piece of state, **independent of `problemContext`.**

Design:

1. **New state `activeTabIsProblem: boolean`** in `App.tsx`, set from the active
   tab URL. It's updated:
   - on mount (initial `chrome.tabs.query`),
   - in the existing `onActivated` / `onUpdated` tab listeners (which already
     fire `pullFromActiveTab`) — we additionally set `activeTabIsProblem` from the
     tab URL there,
   - defensively, whenever a pull succeeds (`applyProblem`) it's definitely true.
   This reuses listeners that already exist; no new polling.
2. **Gate inputs on the URL signal, not the context:**
   ```ts
   const onCoachablePage = activeTabIsProblem;         // URL-based, load-independent
   const canInteract = apiKeyConfigured && onCoachablePage && !isLoading;
   ```
   Why this is R4.4-safe: on a real `/problems/` page the URL matches
   **immediately**, before and during the pull. So inputs are enabled the moment
   the user is on a problem page; they never flip to "off-page" because
   `problemContext` is briefly null. The only time inputs are disabled is when the
   active tab genuinely is **not** a problem URL — which is the correct behavior.
3. **The context-still-loading case is handled by the EXISTING machinery, not by
   gating.** If the URL says problem-page but `problemContext` is still null when
   the user clicks, `handleActionClick`/`handleChatSubmit` already early-return
   (`if (!problemContext ...) return;`). We improve that from a silent no-op to a
   brief, honest "still reading this problem — try again in a moment" state
   (reusing the error banner), and `pullFromActiveTab` is already racing to fill
   it. So: **enabled, but a click during the sub-second load window gives a
   transient "loading" message rather than a wrong answer** — never a false
   off-page.
4. **R4.2 — the rest stays usable.** `canInteract` only wires `QuickActions`
   `disabled`, chat input `disabled`, Send, and the Try chips. Scrolling, copying
   past responses, Settings (⚙️), My Progress (📈), the welcome (❔), theme — none
   are gated on it (verified in the JSX). No change needed there.
5. **R4.3 — the clear off-page state.** When `!onCoachablePage`, show a calm,
   non-error inline notice in the input area: "Open a LeetCode problem to use the
   coaching tools." The chat placeholder already supports a specific reason via
   `chatPlaceholder({hasProblem})`; we extend/feed it so the placeholder reflects
   **off-page** specifically (coordination note below). The header empty state
   ("Open a LeetCode problem to get started") already exists and complements this.

### 2.3 Why NOT the R4.5 soft-warning

R4.5 is the fallback **only if** we couldn't prove R4.4. We can — the URL signal
is load-independent and matches immediately on a real page, so hard-disable never
false-negatives. Hard-disable is the better UX (it prevents a wasted request about
an absent problem, which is the whole point of R4.1) and the stronger product
statement ("grounded in the problem you're on"). Soft-warning is therefore not
needed and not chosen.

### 2.4 Coordination with the sibling spec (chat input placeholder)

The sibling `leetsage-post-launch-ui-fixes` already shipped `chatPlaceholder(...)`
+ the B24 "specific disabled reason" fix (no-key vs. busy). This spec adds a
**third** reason: **off-page**. We extend the *same* `chatPlaceholder` helper with
the `hasProblem`/off-page branch rather than introducing a competing disabled-state
path — so the input reflects the one true reason (no-key → busy → off-page) and
the two specs don't fight over the placeholder. `discovery-prompts.ts`'
`chatPlaceholder` is the single source of truth; we add the branch there with a
unit test.

---

## 3. R5 — "explain the key concept" path predictability

### 3.1 What's actually happening

A free-form "explain the key concept" message goes through the **intent router**
(`routeMessage` in `submitChat`). The router can:
- `dispatch` a non-exempt action → filtered,
- `confirm` an **exempt** action (e.g. `UNDERSTAND_SOLUTION`) → the user must tap
  "Yes" (never silent), or
- `chat` → the non-exempt agentic chat path → filtered.

So the "sometimes full pseudocode, sometimes filtered" is: sometimes the phrase
confirmed into exempt `UNDERSTAND_SOLUTION` (full solution allowed), sometimes it
went to `chat` (non-exempt, filtered). The **routing already requires an explicit
confirm tap before any exempt action** (the chat-intent-routing guardrail), so a
phrase never *silently* lands on the exempt path.

### 3.2 Decision: make the PATH predictable, accept OUTPUT variance (honest)

Per R5.2 we are honest: we cannot make the model deterministic. What we make
predictable is the **path**:

- **A concept-style question that does not explicitly ask for the solution routes
  to the non-exempt chat/concept path** (filtered), *unless* the user explicitly
  confirms the exempt `UNDERSTAND_SOLUTION` affordance. The router's confirm step
  is already the gate; this spec's contribution is to ensure "explain the
  key concept" phrasing classifies toward the **non-exempt** concept path by
  default (so the *default* is coaching), and only an explicit "understand the
  solution" intent surfaces the exempt confirm.
- **The graceful part is R6:** when the non-exempt concept answer does happen to
  spell out too much, redaction (R6) keeps the teaching and removes only the leak
  — so the run-to-run difference the user sees shrinks from "full answer vs.
  scolding blank" to "full teaching, with or without one redacted block." That is
  the real fix for the *experience* of the inconsistency.

Scope: this is a **router classification tightening + leaning on R6**, not a
router rewrite (requirements "Out of scope"). The task pass will pin the
classification with a golden-set case ("explain the key concept" → non-exempt
concept path, not a silent exempt route). If the deep-read of the router during
tasks shows the classification already behaves this way, R5 reduces to a
regression test asserting it — which is a legitimate, documented outcome.

---

## 4. R6 — Graceful recovery instead of total blanking (the big one)

> This is the product's one non-negotiable area, so this section is exhaustive:
> it enumerates **every path** `filterResponse` participates in, defines the
> recovery flow precisely, and proves the safety guarantee holds on every branch.

### 4.0 The complete inventory — every path the filter touches

`filterResponse` is called from exactly **two** sites, both of which read only
`.filteredContent` today; the B1 gate governs *when* that content is revealed.
Here is the full map so nothing is missed:

| # | Path | Action(s) | Exempt? | Streams live? | Consumes |
|---|------|-----------|---------|---------------|----------|
| 1 | `handleActionClick` stream-commit (`App.tsx`) | `GET_HINT`, `GENERATE_EXAMPLES`, `BREAK_DOWN_PROBLEM`, `EXPLAIN_CONCEPT`, **`TIME_COMPLEXITY_HINT`**, `PATTERN_RECOGNITION` | **No** → filtered | No (B1 gate withholds until commit) | `filteredContent` |
| 1e | same, exempt branch | `CHECK_APPROACH`, `UNDERSTAND_SOLUTION`, `GENERATE_REPORT` | **Yes** → bypass | Yes (live) | passthrough, `wasFiltered:false` |
| 2 | `handleChatSubmit` final reveal (`App.tsx`) | agentic chat answer (tagged `EXPLAIN_CONCEPT`, non-exempt) | **No** → filtered | No (B1 gate) | `filteredContent` |
| 3 | B1 pre-display gate (`streamLive = isSolutionExemptAction`) | all | n/a | governs reveal timing | reads `isSolutionExemptAction`, NOT the filter internals |
| 4 | Guardrail eval gate (`guardrail-eval.test.ts`) | all fixture cases | n/a | n/a | **`wasFiltered` only** |
| 5 | Promptfoo bridge (`solution-filter-assert.ts`) | all fixture cases | n/a | n/a | **`wasFiltered` only** |

Implications that constrain the design:
- **The recovery flow lives at BOTH call sites (1 and 2).** To avoid two
  divergent implementations, the regenerate-aware recovery is factored into **one
  shared async helper** (see §4.4) that both `handleActionClick` and
  `handleChatSubmit` call. `filterResponse` itself stays **pure and synchronous**
  (it must — the eval imports and calls it directly with no async/network). The
  *regenerate* (a network call) is orchestrated by the shared helper in `App.tsx`,
  NOT inside `filterResponse`.
- **The B1 gate (3) is unaffected.** It keys on `isSolutionExemptAction`, not on
  the filter's output, and it already withholds non-exempt output until the
  commit. A regenerate just means the commit happens after one more (awaited)
  round-trip; the placeholder holds the whole time, exactly as it does for a slow
  first call. No gate change.
- **Exempt actions (1e) are never redacted/regenerated** (R6.5) — the exempt
  short-circuit at the top of `filterResponse` is unchanged.
- **The eval (4,5) reads only `wasFiltered`.** This is the linchpin — see §4.1.

### 4.1 The core realization that makes this safe

The eval gate scores **only `wasFiltered`** (verified in both the Vitest gate and
the Promptfoo bridge; neither reads `filteredContent`). So:

> **Redaction, regenerate, and total-blank are all renderings of the SAME
> detection decision (`wasFiltered: true` whenever a leak was found). The safety
> numbers are invariant under what we put in `filteredContent`, as long as
> `filterResponse`'s DETECTION still flips `wasFiltered` on every leak and never
> on clean coaching.** (R6.4)

Concretely: `filterResponse`'s **detection logic does not change at all** — the
same `SOLUTION_PHRASES` / `COMPLETE_FUNCTION_PATTERNS` /
`looksLikeCompleteBraceFunction` / `looksLikeFullPseudocode` checks decide
`wasFiltered`. What changes is (a) what `filteredContent` holds when a leak is
found (redacted-partial instead of blank) and (b) a new `App.tsx`-level recovery
step that may regenerate. The gate is literally unaffected, by construction.

### 4.2 New return shape (pure filter)

`FilterResult` gains optional fields; existing callers keep working:
```ts
interface FilterResult {
  filteredContent: string;   // redacted-partial OR the reworded full message
  wasFiltered: boolean;      // unchanged meaning: a leak was DETECTED
  filterReason?: string;
  redactionMode?: 'none' | 'partial' | 'full'; // NEW — drives the recovery flow
}
```
`redactionMode`:
- `none` — nothing detected (clean passthrough), `wasFiltered: false`.
- `partial` — leak(s) removed, meaningful teaching preserved, `wasFiltered: true`.
- `full` — nothing teachable survived; `filteredContent` is the reworded message
  (R6.3/R6.6), `wasFiltered: true`.

`redactionMode` is what the `App.tsx` recovery helper branches on (partial → show
as-is; full → try one regenerate). The eval still ignores it and reads only
`wasFiltered`.

### 4.3 Flow overview (the whole R6 + R6b decision tree)

```
non-exempt response `content`, actionType, budget-check fn
        │
        ▼
  filterResponse(content, actionType)   ← PURE, synchronous, detection unchanged
        │
   wasFiltered? ──no──▶  show `content` (clean)                        [done]
        │yes
        ▼
   redactionMode?
     ├─ 'partial' ─▶ show redacted `filteredContent` (teaching survives)
     │                NO regenerate — don't spend a credit (R6.8.3)     [done]
     └─ 'full' ────▶ budget allows another request?  (checkRateLimit)
                        ├─ no  ─▶ show reworded full message (R6.9.2)   [done]
                        └─ yes ─▶ recordRequest(); regenerate ONCE
                                     │
                                     ▼
                                 filterResponse(regenerated, actionType)
                                     ├─ clean ─▶ show regenerated (R6.8.1) [done]
                                     └─ leaks ─▶ reworded full msg (R6.8.2) [done]
                                        (hard cap: never a 2nd regenerate)
```

The pure filter owns everything above the `redactionMode?` branch. The shared
`App.tsx` recovery helper owns everything from `redactionMode?` down (it's the
only part that can be async / spend a request).

### 4.4 The pure redaction algorithm (inside `filterResponse`)

`filterResponse` is restructured from "detect → blank at first hit" to
"**detect → redact offending regions → classify partial vs. full**". Still
synchronous, still the eval's single source of truth.

1. **Exempt short-circuit unchanged** (R6.5): exempt actions return
   `{filteredContent: content, wasFiltered: false, redactionMode: 'none'}`.
2. **Collect offending regions** instead of returning at the first hit:
   - **Fenced blocks** tripping the existing detectors (over-length,
     `COMPLETE_FUNCTION_PATTERNS`, `looksLikeCompleteBraceFunction`,
     `looksLikeFullPseudocode`) — recorded by `[start,end]` span (the fence regex
     already yields positions).
   - **Solution phrases** (`SOLUTION_PHRASES`) — the offending sentence/line.
   - **Non-fenced prose pseudocode** (R6.2, the trap): `looksLikeFullPseudocode`
     today runs on the *whole* text. We **segment the prose into blank-line-
     separated runs** and test each run; a tripping run is an offending region.
     This localizes a prose algorithm to its paragraph so surrounding teaching
     survives, while guaranteeing a prose-only algorithm is removed (no prose
     leak).
3. **Redact** each region (remove it; collapse the gap). No inline "omitted"
   marker text is shown to the user (R6.9.3 seamless) — the surviving prose simply
   stands on its own. (We keep the removal clean rather than leaving a visible
   placeholder, since the regenerate path is what produces the polished answer in
   the hole-left case.)
4. **Classify + self-verify:**
   - Compute surviving teachable content (strip whitespace; must be more than just
     headings/labels). Meaningful content remains → candidate `partial`.
   - **Re-run the detectors on the redacted result** (defense-in-depth). If
     anything still trips → it's NOT a safe partial → classify `full`. This proves
     R6.4: a `partial` result is itself clean, verified by the same detectors the
     gate trusts.
   - No meaningful content remains → `full`, `filteredContent` = reworded message.
5. **`wasFiltered` is `true` for both `partial` and `full`** — the eval sees the
   identical decision as today. `filterReason` strings are preserved.

### 4.5 The regenerate step (R6b — in the shared `App.tsx` recovery helper)

Only reached when `redactionMode === 'full'` AND the budget check allows it.

- **Mechanism.** One **non-streaming** call (`sendLLMRequest`-style; streaming is
  pointless since the B1 gate withholds output until after the re-filter anyway).
  It re-issues the SAME action/question with an additional, forceful "you drifted
  into the full solution last time — answer again, teaching the concept and
  approach, and DO NOT reveal the full solution, algorithm, or code" instruction.
  Implementation note: `sendLLMRequest` currently builds messages internally and
  has no `messages` override; the cleanest wiring is a small dedicated
  `regenerateWithoutSolution(...)` in `llm-service.ts` that posts a system+user
  pair (reusing `getSystemPrompt(actionType)` + a `REGENERATE_NO_SOLUTION`
  reinforcement) and returns `{content, usage}`. Tasks pass will finalize whether
  to extend `sendLLMRequest` or add the dedicated function; the latter is cleaner
  and keeps `sendLLMRequest`'s contract stable.
- **Counted (R6.9.1).** The helper calls `recordRequest()` for the regenerate and
  updates the usage counter — one user message that regenerates costs 2 against
  the 200/day cap, never silently (consistent with ADR-007 and the E9 per-round
  accounting).
- **Budget-gated (R6.9.2).** `checkRateLimit(guardrails)` is consulted first; if
  it disallows (kill switch, daily cap, per-minute, cooldown), skip the regenerate
  and show the local full message — no error.
- **Bounded (R6.8.2).** The regenerated output goes through `filterResponse`
  exactly once more. Clean → show it. Still leaks → reworded full message. **Never
  a second regenerate** — the loop is hard-capped at one, bounding cost + latency.
- **Seamless (R6.9.3).** Whatever we end up showing (regenerated clean answer, or
  the reworded message) is committed to the card normally. No "this was corrected"
  note. The reworded message itself (§4.6) is non-scolding and reads as a normal
  coaching redirect.
- **Metrics.** Best-effort `recordMetric` for the regenerate round, same as every
  other call (never breaks the response).

### 4.6 Strengthen the FIRST call so regenerate is RARE (R6.7)

The regenerate exists as a safety net, not a routine step. To keep it rare (so we
rarely spend the second credit), the primary non-exempt prompts are reinforced:

- `SOLUTION_PREVENTION_RULES` already forbids full solutions. We add a short,
  pointed reinforcement line to the non-exempt action prompts (and the chat
  prompt) emphasizing: teach the *approach and concept*; if you catch yourself
  about to write the full algorithm/pseudocode/working code, STOP and give the
  insight instead. This is a prompt-only change, zero cost, and it reduces how
  often any recovery path runs.
- **It must RESTATE, not restrict, the existing allowances** (see §4.6a). The
  reinforcement keeps the "short snippets (<10 lines) and partial pseudocode are
  encouraged" permission that `SOLUTION_PREVENTION_RULES` already grants — it only
  sharpens the ban on the *complete working solution*. Wording that reads as "be
  terse / withhold detail" is wrong and will not be used.
- A `prompts.test.ts` assertion pins the reinforcement so it isn't silently
  dropped later — AND asserts it still permits snippets/partial logic (so a future
  edit can't quietly turn it into a gag).
- Honest framing: this *lowers the odds* of a first-call leak; the deterministic
  filter + regenerate remain the backstop. Same defense-in-depth posture as the
  prompt-injection work (ADR-004): input framing lowers odds, output filtering
  makes the guarantee hold.

### 4.6a Usability guardrail — do NOT over-gate (a first-class constraint)

> This section exists because over-gating would quietly break the product's
> usability while technically "passing" the safety gate. It is a hard constraint
> on this spec, not a nicety.

**Principle: R6 changes what we SHOW when a leak is detected, never what COUNTS
as a leak.** The detectors (`looksLikeFullPseudocode`, `COMPLETE_FUNCTION_PATTERNS`,
`looksLikeCompleteBraceFunction`, `SOLUTION_PHRASES`, the line limit) are
**unchanged**. No response that passes clean today may start being gated because
of this spec. The three locks:

1. **Partial pseudocode and short snippets stay allowed.** `looksLikeFullPseudocode`
   only trips on a *whole* procedure (loop + result + ≥5 control lines, or the
   folded-conditional signature loop + ≥2 bound-updates + terminator). "Bits and
   pieces" — one idea, a 2–3 line illustration, a single loop sketch — do not and
   must not trip it. The existing `neg-binsearch-snippet-1` / `neg-snippet-1`
   fixtures are the proof and stay green.

2. **The user's OWN code, discussed, is not a leak we want to redact.** The
   scenario "user asks about a specific part of their code and how to improve it":
   - `CHECK_APPROACH` ("Analyze my code") and `UNDERSTAND_SOLUTION` are **exempt**
     — the filter short-circuits; their code + detailed feedback is never redacted
     (R6.5). This is the primary home for "improve my code" and it is untouched.
   - Free-form **chat** about the user's own code is non-exempt (filtered), but the
     prompt's existing `OWN_CODE_REFERENCE_RULE` tells the model to quote **short
     excerpts** of the user's code, not reprint the whole file — precisely so a
     normal "here's your line 12, try this instead" answer does not look like a
     full-solution dump. A few quoted lines + explanation does not match
     `COMPLETE_FUNCTION_PATTERNS` (which needs a full signature + a substantial
     body) or `looksLikeFullPseudocode`, so it sails through clean.
   - **New fixture + test for exactly this case** (R7): a chat response that quotes
     a few lines of the user's own code and suggests an improvement →
     `leaksSolution: false`, passes the filter clean (NOT redacted). This pins the
     "don't redact a user's own-code discussion" promise.

3. **R6 is a net usability WIN for the one genuinely-filtered own-code case.** The
   only own-code chat case that trips the filter is the model reprinting the user's
   *entire function* verbatim — indistinguishable to a deterministic filter from
   "here's the full solution." Today that blanks the whole response. After R6 it
   redacts just the full-function block and keeps the explanation (`partial`), or
   if nothing teachable survives, the regenerate produces a clean "here's the fix
   explained in words" answer (`full` → regenerate). So this case gets *better*,
   not stricter.

**Honest limitation (named, not hidden):** a deterministic filter cannot tell
"the user's own code echoed back" from "the optimal solution handed over" — both
are just a full function in text. We mitigate at the prompt (`OWN_CODE_REFERENCE_
RULE` + keeping Analyze/Understand exempt) rather than by weakening the filter.
Making free-form chat exempt for own-code is a larger guardrail decision and is
**out of scope** here (noted in §8).

**Enforcement:** the §4.9 **gate-invariance test** is the hard proof detection
didn't tighten — it asserts `wasFiltered` is byte-for-byte identical to today's
decision across every `GUARDRAIL_CASES` case. If this spec over-gates anything in
the existing set, that test fails.

### 4.7 Reworded full message (R6.6)

Replace the scolding `buildFilteredMessage` copy. New tone — acknowledges the
legitimate question, points to the coaching value, no "did something wrong":

> ⚠️ **Kept this one coaching-level**
> That answer drifted into handing over the full solution, so I've held it back —
> LeetSmith is built to get you to the answer yourself. For this problem, try
> **💡 Hint** for a nudge, or **🧠 Understand solution** if you want the optimal
> approach explained for study.

(Exact wording to be finalized in the task; it must not scold, and must name the
real affordances that exist — Hint / Understand solution — not the old
"Break Down Problem" button which no longer exists in the 4-chip bar.)

### 4.8 Why this can't leak a prose-only algorithm (the R6.2 trap, explicitly)

The failure mode to avoid: redacting the fenced block but leaving a spelled-out
algorithm in prose. Mitigations, layered:
- Prose is segmented and **each run is tested** with the same
  `looksLikeFullPseudocode` the gate trusts — a prose algorithm run is an
  offending region and gets redacted.
- The **post-redaction re-run** (§4.4 step 4) is a hard assertion: if the
  surviving text still trips any detector, we abandon `partial` and classify
  `full`. So a `partial` result is *proven* clean by the same code the gate uses.
  There is no path where we `show` content that a detector would still fire on.
- The **regenerate re-filter** (§4.5) applies the identical guarantee to the
  second call: a regenerated answer is only shown if `filterResponse` passes it
  clean; otherwise the reworded message. So the regenerate can never introduce a
  leak either.

### 4.9 Tests (R7.2 — R6 + R6b need explicit tests)

**Pure filter (`solution-filter.test.ts`):**
- (a) **teaching survives**: teaching paragraph + one fenced full function →
  `redactionMode:'partial'`, `wasFiltered:true`, surviving text contains the
  teaching, NOT the function body.
- (b) **prose-only algorithm does NOT survive**: short teaching + a prose
  full-pseudocode paragraph → the pseudocode paragraph is gone; result passes a
  re-filter (either a clean `partial` or `full`).
- (c) **empty-after-redaction → `full`**: an all-solution response → `full` with
  the reworded (non-scolding) message; assert the old "not to solve problems for
  you" string is gone.
- (d) **exempt untouched**: `CHECK_APPROACH` with a full function →
  `wasFiltered:false`, content unchanged.
- (e) **gate invariance (the critical one)**: run the **existing
  `GUARDRAIL_CASES`** through the new `filterResponse` and assert `wasFiltered`
  equals the old decision for **every** case. Proves catch rate / FP unchanged.
  The existing `guardrail-eval.test.ts` gates (catchRate=1, FP=0) run unchanged
  and must stay green; the Promptfoo bridge inherits it by construction.
- (h) **own-code discussion is NOT over-gated (§4.6a lock 2)**: a chat-style
  response that quotes a few lines of the user's OWN code and suggests an
  improvement → `wasFiltered:false`, shown clean (not redacted). Added as a
  `leaksSolution:false` fixture so it also rides the eval metrics.
- (i) **snippets/partial pseudocode still allowed (§4.6a lock 1)**: re-assert the
  existing snippet negatives pass clean under the new filter (covered by (e), but
  called out so the intent is explicit).

**Recovery helper (R6b — a new pure-ish helper, `App.tsx`-level, tested with
injected fns so no React/network harness):** factor the decision into a pure
`decideRecovery(filterResult, { budgetAllowed }): 'show-partial' | 'show-full' |
'regenerate'` plus a thin orchestrator, so the branching is unit-testable:
- (d1) **partial → no regenerate**: `redactionMode:'partial'` →
  `'show-partial'`, regenerate fn NOT called (R6.8.3).
- (e1) **full + budget → regenerate, clean → show it**: `full` + budget allowed →
  `'regenerate'`; a stubbed regenerate returning clean text → shown; `recordRequest`
  called exactly once (R6.8.1, R6.9.1).
- (f1) **full + regenerate still leaks → full message, no 2nd regenerate**:
  stubbed regenerate returns a leak → final = reworded message; regenerate fn
  called exactly once (R6.8.2).
- (g1) **full + budget disallowed → skip regenerate**: `budgetAllowed:false` →
  `'show-full'`, regenerate fn NOT called, `recordRequest` NOT called (R6.9.2).

**Prompt pinning (`prompts.test.ts`):** the R6.7 first-call reinforcement line is
present on the non-exempt action prompts + chat prompt.

---

## 5. Cross-cutting: no regressions (R7)

- **Hint/Analyze/Understand/Report/chat** otherwise unchanged. The behavioral
  deltas are: `TIME_COMPLEXITY_HINT` now reads code + is structured; the input gate
  keys on URL not context; `filterResponse` redacts instead of blanks; a non-exempt
  leak that would blank now attempts one bounded regenerate first.
- **The two filter callers (`handleActionClick`, `handleChatSubmit`)** both route
  through the shared recovery helper so the regenerate behavior is identical on
  the action path and the chat path (no divergence). The helper is `async`; both
  callers already `await` the filtered commit, so no structural change — just one
  possible extra awaited round-trip before the commit (the B1 placeholder holds).
- **The pin** gains one more feeding action (`TIME_COMPLEXITY_HINT`, non-authority)
  — consistent with `shouldRepin()` (first emission pins, never overwrites). Add a
  `complexity-pin` test asserting a hint does not overwrite an existing pin and
  does establish one when none exists.
- **`actionToContentType`** already maps `TIME_COMPLEXITY_HINT → 'HINT'`; no change.
- **Prompt-pinning tests** (`prompts.test.ts` pattern) for: the new code-aware
  hint prompt carries no concrete example Big-O (B14 discipline), carries the
  adaptive Hint/affirmation instruction, and the no-code fallback has no Current
  claim.

## 6. Files touched (preview for the tasks pass)

- `src/services/prompts.ts` — split `TIME_COMPLEXITY_HINT` into code-aware /
  fallback shapes; new `ComplexityHintData` schema + example; feed
  `pinnedOptimalConstraint` into the hint's `buildUserMessage` case.
- `src/types/models.ts` (+ `index.ts`) — `ComplexityHintData` type; add to
  `StructuredData` union. `src/types/api.ts` — `FilterResult.redactionMode`.
- `src/services/structured-parser.ts` — add `TIME_COMPLEXITY_HINT` to
  `STRUCTURED_ACTIONS` + validate `ComplexityHintData`.
- `src/sidepanel/App.tsx` — add `TIME_COMPLEXITY_HINT` to the code-reading set
  (non-hard-stop); `activeTabIsProblem` state + URL-based `onCoachablePage` gate;
  off-page notice; transient "still loading" message; pin feed for the hint.
- `src/services/solution-filter.ts` — the redaction rewrite (region collection,
  prose segmentation, partial/full classification, post-redaction re-filter
  assertion, reworded full message). Stays pure/sync.
- `src/services/llm-service.ts` — a dedicated `regenerateWithoutSolution(...)`
  (non-streaming; `getSystemPrompt(actionType)` + the `REGENERATE_NO_SOLUTION`
  reinforcement) returning `{content, usage}`. Keeps `sendLLMRequest`'s contract
  stable.
- `src/sidepanel/App.tsx` — the shared recovery helper + pure `decideRecovery`;
  wire both `handleActionClick` and `handleChatSubmit` through it; `recordRequest`
  + `checkRateLimit` for the regenerate; usage-counter update.
- `src/services/prompts.ts` — also: the R6.7 first-call reinforcement line on the
  non-exempt action prompts + chat prompt; the `REGENERATE_NO_SOLUTION` text.
- `src/components/discovery-prompts.ts` — extend `chatPlaceholder` with the
  off-page reason.
- `src/evals/fixtures/guardrail-cases.ts` — new negatives for the code-aware
  complexity-hint shapes (worse + already-optimal) AND the own-code-discussion
  case (§4.6a lock 2), all `leaksSolution:false`.
- Tests: `solution-filter` redaction + gate-invariance; `decideRecovery`
  branch tests; `prompts` pinning (hint + R6.7 reinforcement); `complexity-pin`
  hint-as-non-authority; `discovery-prompts` off-page placeholder;
  `active-tab-pull`/gating as needed.

## 7. Decisions locked here (for the record)

1. **R1 worse-vs-optimal: model-decided `onOptimalPath`, prompt-reconciled** —
   not a deterministic Big-O magnitude compare (no reliable comparator exists;
   reuse the proven field; keep the *path* predictable, accept output-correctness
   as the standing E10 limit).
2. **R4: HARD-DISABLE on a URL-based `onCoachablePage` signal** (not
   `!!problemContext`), because the URL is load-independent and matches
   immediately on a real page → R4.4 is met, so the R4.5 soft-warning fallback is
   not needed.
3. **R6: redact-in-place, `wasFiltered` unchanged in meaning** → eval safety
   numbers invariant by construction; `partial`/`full` are two renderings of the
   same decision; a `partial` result is proven clean by a post-redaction re-filter.
   `filterResponse` stays pure/sync (the eval depends on that).
4. **R6b: regenerate-first ONLY in the would-be-blank (`full`) case, hard-capped
   at ONE, counted + budget-gated, seamless.** A `partial` with surviving teaching
   is shown as-is (no credit spent). The strengthened first-call prompt (R6.7)
   keeps the regenerate rare. The regenerate's output is re-filtered; still-leaking
   → the reworded full message, never a second regenerate. Recovery is factored
   into a pure `decideRecovery` + a thin orchestrator shared by both filter callers.
5. **R5: tighten the default classification toward the non-exempt concept path +
   lean on R6**, not a router rewrite; honest that output variance isn't
   "fixable."

## 8. Out of scope (unchanged from requirements, plus one noted here)

Model-correctness of the Big-O; solved-state gating; intent-router redesign;
cosmetic sibling-spec fixes; spec-folder cleanup.

**Also out of scope (noted during design):** making free-form **chat** exempt
from the filter for own-code discussion. The filter can't distinguish a user's
own code echoed back from a handed-over solution; changing chat's exempt status is
a larger guardrail decision deferred to a future spec. For now chat stays
non-exempt, mitigated at the prompt via `OWN_CODE_REFERENCE_RULE` (§4.6a).

---

## 9. Post-build dogfooding fixes (2026-10-15, after the first build)

Dogfooding the built extension on *167. Two Sum II* surfaced four issues. All are
captured here so the reasoning isn't lost. None changes the guardrail's DETECTION
(safety numbers remain invariant); they fix display, recovery routing, and the
regenerate's usefulness.

### 9.1 Bug A — raw `leetsage-data` JSON rendered in a card (truncated response)

**Symptom.** A long `UNDERSTAND_SOLUTION` answer showed a dark scrollable box of
raw JSON (`{ "patterns": [...], "optimalComplexity": { "time`) at the bottom.
**Cause.** The response hit the 800-token cap *mid-JSON*, leaving an UNCLOSED
`leetsage-data` fence. `parseStructuredResponse`'s extractor only matches a
*closed* fence, so it returned the half-written JSON as prose and the card
rendered it. Pre-existing latent bug; surfaced by a long answer.
**Fix.** New pure `stripDanglingDataFence(raw)` in `structured-parser.ts`: when no
complete block is found, strip from a dangling opening fence to end-of-string, so
a truncated block is never shown. Tests: truncated-block stripped; complete block
still parses; helper unit tests. (A separate thought: these long answers bump the
800-token cap — a cap-tuning question for a later pass, not this spec.)

### 9.2 Bug B — a redacted pseudocode answer was a hollow shell

**Symptom.** "give me pseudocode" → the algorithm was correctly redacted but the
surviving framing ("Here is the pseudocode… remember to 1-index") was useless.
**Cause.** `hasMeaningfulTeaching` used a lenient absolute char-count, so leftover
framing passed and the response classified `partial` (shown as-is, no regenerate)
instead of `full` (which triggers the regenerate).
**Fix.** Reworked the partial/full decision from a fragile char threshold to a
**surviving-fraction** signal: a `partial` must keep ≥50% of the original's real
prose (filler framing stripped first) AND clear a small absolute floor. When
redaction removes the bulk (the thing the user asked for) and only a framing tail
survives, it falls through to `full` → the bounded regenerate produces a real
conceptual answer. Robust where a bare threshold was fragile — it keys on *how
much was removed*, not an arbitrary length. Tests: hollow-shell → `full`;
substantive-concept-beside-code → stays `partial`.

### 9.3 Fix 1a — the regenerate is gated by HARD limits only

**Symptom (from console diagnostics).** A pseudocode ask logged
`decision: "show-full", budgetAllowed: false` — the regenerate was SKIPPED
because `checkRateLimit` denied it (the user was hitting the per-minute/cooldown
pacing by testing rapidly), so they got the bare fallback with no retry.
**Decision.** The regenerate is a CONTINUATION of an already-paid request, not a
new user action, so the SOFT pacing limits (per-minute, cooldown) should not block
it — only the HARD limits (kill switch + daily cap) should. New `checkHardBudget`
in `rate-limiter.ts`; the recovery helper uses it instead of `checkRateLimit`.
Matches the "always try to produce a useful response for the credit spent" intent
without letting the regenerate run past the daily budget. Tests: `checkHardBudget`
blocks on kill switch + daily cap, ALLOWS despite a per-minute burst / cooldown
that `checkRateLimit` would block.

### 9.4 Fix 2 — the regenerate prompt steers to CONCEPTUAL prose, not pseudocode

**Symptom (from console diagnostics).** The model's "conceptual pseudocode"
answer still contained executable lines (`return [left + 1, right + 1]`,
`current_sum = numbers[left] + numbers[right]`) — a copy-pasteable recipe the
filter correctly caught. The old `REGENERATE_NO_SOLUTION` said "don't give the
full solution" but didn't tell the model WHAT to give instead.
**Decision (product owner confirmed).** When a solution/pseudocode ask is
withheld, the regenerate SHALL return a **conceptual plain-English explanation**
(strategy + key insight + why it works), explicitly NOT a numbered/step list,
pseudocode, or any code-shaped line. If the user literally asked for
pseudocode/code, they get the conceptual walkthrough instead, with a brief note
that this is as far as coaching goes. This is a deliberate product stance: a
faithful pseudocode answer is, by definition, close to the guardrail line, so the
most useful thing we *can* give without handing over the answer is the concept.
Honest tension noted: the user asked for X and gets "conceptual X" — consistent
with the product's one non-negotiable. `REGENERATE_NO_SOLUTION` rewritten
accordingly; `prompts.test.ts` pins the conceptual steer.

> **The line, restated (product owner):** a complete step-by-step recipe or
> copy-pasteable pseudocode/code (rename-the-variables-and-submit) is withheld; a
> plain-language conceptual explanation of the approach is allowed. The regenerate
> targets the latter.

### 9.5 Follow-up idea (NOT built) — token cap tuning

Bug A's root trigger (truncation mid-JSON) also means some long `UNDERSTAND_SOLUTION`
answers are being cut off at 800 tokens. The display is now safe, but the content
is still truncated. Raising `maxTokens` for the structured actions (or budgeting
the data block separately) is a candidate improvement — deferred, noted so it's
not lost.
