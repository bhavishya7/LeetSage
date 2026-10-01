# LeetSage — Guardrail Hardening & Bug Registry: Requirements

> **Status: ✅ Built — B1, B2, B3 fixed and guarded.** A pre-launch hardening
> spec. It fixes a set of guardrail/UX bugs found in real use, and it establishes
> a **standing bug registry** (below) that future bugs append to, so bug fixes
> stay consolidated and each one is guarded by a test/eval instead of silently
> regressing. All three bugs are fixed, each backed by an automated guard; the
> full suite (191 tests incl. the guardrail eval) is green.
>
> Companion: [design.md](./design.md) · [tasks.md](./tasks.md) ·
> [../leetsage-structured-output/design.md](../leetsage-structured-output/design.md) ·
> [../leetsage-prompt-injection/design.md](../leetsage-prompt-injection/design.md) ·
> code: `src/services/solution-filter.ts`, `src/services/prompts.ts`,
> `src/sidepanel/App.tsx`, `src/evals/`.
>
> **Dependency note:** the `PATTERN_RECOGNITION` prompt bug (observed alongside
> these) is **deliberately NOT in this spec.** Whether to fix it depends on whether
> the `Pattern` action survives the action-streamlining work
> (`leetsage-action-streamlining`), so that spec owns it. Fixing a prompt for a
> button that may be cut would be wasted effort.

---

## Governing principle

**Every guardrail bug fix MUST add a test or eval case that would have caught it.**
The bug registry is only durable if each entry is backed by an automated guard
(Vitest test or a labeled eval case, gated by CI). A fix without a guard is
allowed to silently regress — which is how these bugs reached production in the
first place.

---

## The bugs in scope (found in real use, 2026)

### B1 — Flagged content is visible before the filter gates it *(guardrail integrity)*
**Observed:** pressing `Concept` streamed a response that began with real
solution-adjacent content (the problem's algorithm name and detail) token-by-token
onto the screen; only *after* the full response arrived did `filterResponse` run
and replace it with the "Content filtered" message. The user could read the
flagged content before it was removed.
**Root cause:** in `App.tsx`, the response streams directly into the visible card
inside the `for await` loop; `filterResponse()` runs only *after* the stream
completes. The guardrail is a post-hoc replacement, not a pre-display gate.
**Severity:** high — for a genuine solution leak, the user reads the answer before
it's filtered, defeating the core "never reveal the solution" promise.

### B2 — Free-form chat forces a real-world analogy onto direct questions *(prompt correctness)*
**Observed:** asking a simple, direct question in chat (e.g. about a loop or a
function) returned a forced real-world analogy ~3/4 of the time, often irrelevant
to the actual question.
**Root cause:** the free-form `userQuery` path routes through the
`EXPLAIN_CONCEPT` system prompt, which literally instructs "Use a real-world
analogy…". A direct question is shoehorned into the concept-explanation template.
**Severity:** medium — wrong/annoying UX; undermines the chat escape-hatch. More
important if action-streamlining pushes more conceptual asks into chat.

### B3 — The solution filter misses compact "folded-conditional" pseudocode *(guardrail integrity)*
**Observed:** `Pattern` returned a fenced pseudocode block that was essentially the
whole binary-search algorithm, and the filter let it through.
**Root cause:** `looksLikeFullPseudocode()` requires `controlLines.length >= 5 &&
hasLoop && hasResult`. A compact algorithm with the conditional folded into the
loop header (e.g. `while left <= right: mid = …; if …: …; else: …`) has too few
line-leading control keywords and no line-leading `return`/result, so it slips
under the threshold — a false negative in the filter itself (independent of which
action produced it).
**Severity:** high — a real solution-leak path through the deterministic backstop.

> The `PATTERN_RECOGNITION` *prompt* also permitted that block by not forbidding
> code/pseudocode. That prompt fix is deferred to the streamlining spec (see the
> dependency note above). B3 here is about the **filter**, which must catch such a
> leak no matter what produced it.

### B4 — Free-form chat is blind to the user's editor code *(missing capability)* — ✅ fixed
**Observed** (during B1's visual review, 2026-09-23): asking chat "what is the
current time complexity" with a complete, Accepted solution in the editor returned
"you didn't include your code in the prompt". **Root cause:** the `userQuery` path
(`handleChatSubmit`) never called `extractCurrentCode` — only the templated
`CHECK_APPROACH`/`UNDERSTAND_SOLUTION`/`GENERATE_REPORT` actions sent editor code.
So chat literally could not see the code and correctly said so. **Not a B2
regression** (B2 only removed the forced analogy, which worked). **Fix:** chat now
always sends the (non-empty) editor code, folded into the `wrapUntrusted` DATA
block (`buildChatData`); the chat prompt is aware of it but must not assume it's
correct. **Decision — chat stays NON-EXEMPT (filtered):** an action button has a
fixed trusted intent, but chat is free text, so making code-bearing chat *exempt*
would let a "complete my stub" ask bypass the filter. Keeping chat filtered lets the
model analyze/quote pieces of the user's code while a full-solution dump is still
caught; "show me the solution" is redirected to the `Understand Solution` action.

### B5 — Heavy non-exempt actions feel slow behind the B1 gate *(perceived performance)* — ✅ fixed
**Observed** (same review): `Concept` showed ~5–6s of "Thinking…" before revealing,
while `Hint`/`Pattern` returned in ~1s. **Root cause:** B1's gate withholds the
whole stream until complete, so the user now waits the FULL generation time that
live streaming used to mask; `Concept` has the heaviest non-exempt prompt. The gate
is behaving correctly (design §1 called out this trade) — this is **perceived
performance**. **Fix:** the placeholder no longer reads as frozen — after a 3s grace
period `ThinkingIndicator` switches to "Still working on it…" plus an elapsed-seconds
counter, a lightweight proof-of-life (not a real progress bar; the model's progress
is unknowable). The gate itself is unchanged.

> B4 and B5 were surfaced by exercising the shipped B1 change — exactly the "get UI
> changes eyeballed" step catching real issues. Per the standing-registry principle
> each was logged as a row and then fixed in a follow-up pass (kept separate from the
> B1–B3 commits). The larger **intent-routing** idea that grew out of B4 (route a
> chat message to a matching action when one fits) is intentionally NOT built here —
> it's its own feature with a guardrail decision (routing free text into
> filter-exempt actions), tracked separately as a new spec.

---

## Requirements

### R1 — Pre-display gate (fixes B1)
- **R1.1** WHEN a **non-exempt** action (any action NOT in the solution-exempt set:
  `CHECK_APPROACH`, `UNDERSTAND_SOLUTION`, `GENERATE_REPORT`) is generating, THE
  SYSTEM SHALL show a non-content **placeholder** (e.g. "Analyzing…") in place of
  the raw streaming tokens, and SHALL NOT display the model's actual content until
  after `filterResponse` has run.
- **R1.2** WHEN the response passes the filter, THE SYSTEM SHALL reveal the
  (filtered) content.
- **R1.3** WHEN the response is filtered, THE SYSTEM SHALL show only the
  "Content filtered" message — the raw flagged content SHALL never have been
  visible.
- **R1.4** THE SYSTEM MAY continue to stream exempt actions
  (`CHECK_APPROACH`/`UNDERSTAND_SOLUTION`/`GENERATE_REPORT`) live, since solution
  content is allowed there and they bypass the filter — preserving their
  responsive UX. (Structured actions still strip their data block mid-stream as
  today.)
- **R1.5** The placeholder SHALL be an **animated, pulsing/fading multi-dot
  indicator** (dots cycling opacity in staggered sequence) paired with a **short,
  action-aware label** (e.g. Hint → "Thinking of a hint…", Break down → "Breaking
  it down…", Concept → "Explaining…", free-form chat → "Answering…"). It SHALL read
  as actively "working," never a frozen blank card. The exact wording and the
  animation timing are a UX detail to confirm with the user (visual review) during
  the build; a neutral fallback label ("Thinking…") is acceptable where no
  specific one fits.

### R2 — Direct-answer chat path (fixes B2)
- **R2.1** WHEN the user asks a free-form question (the `userQuery` path), THE
  SYSTEM SHALL use a prompt that answers the question **directly**, NOT the
  `EXPLAIN_CONCEPT` template.
- **R2.2** THE chat prompt SHALL NOT mandate a real-world analogy; it MAY use one
  only when genuinely helpful to the specific question.
- **R2.3** THE chat prompt SHALL still obey the no-solutions guardrail and the
  untrusted-content framing (`wrapUntrusted`) already applied to the query.
- **R2.4** Free-form chat SHALL remain subject to `filterResponse` (it is not an
  exempt action), and therefore also to the R1 pre-display gate.

### R3 — Close the filter blind spot (fixes B3)
- **R3.1** THE `looksLikeFullPseudocode` heuristic (or its replacement) SHALL flag
  a compact algorithm that folds its conditional into a loop header — i.e. detect
  full-procedure pseudocode even when line-leading `if`/`return` are absent —
  WITHOUT flagging short single-idea illustrative snippets or plain narrative
  prose.
- **R3.2** THE fix SHALL be validated by adding the real observed leak (the
  binary-search pseudocode block) and near-miss safe cases to the labeled
  guardrail eval dataset, and the eval SHALL report the updated catch/false-positive
  rates.

### R4 — Bug registry (standing, extensible)
- **R4.1** THE spec SHALL maintain a **bug registry** table (below): each row has an
  ID, symptom, root cause, fix, the guarding test/eval, and status.
- **R4.2** Future bugs SHALL be appended here (not scattered), and each fix SHALL
  add its guarding test/eval per the governing principle.

### R5 — Verification & no regressions
- **R5.1** All fixes SHALL be covered by Vitest tests and/or eval cases, gated by
  the existing CI + Husky pre-commit (`lint` + `test` + `build` must pass).
- **R5.2** The existing 149-test suite and guardrail eval SHALL continue to pass
  (no regressions); the eval's catch rate SHALL not decrease.

---

## Bug registry

| ID | Symptom | Root cause | Fix (req) | Guard | Status |
|----|---------|-----------|-----------|-------|--------|
| B1 | Flagged content visible before filter replaces it | Streams to view; filter runs post-stream | Pre-display gate for non-exempt actions (R1) | `src/sidepanel/__tests__/predisplay-gate.test.ts` (gate contract) | ✅ fixed |
| B2 | Chat forces irrelevant real-world analogy | `userQuery` uses `EXPLAIN_CONCEPT` prompt | Direct-answer chat prompt (R2) | `prompts.test.ts` — "direct-answer, no forced analogy (B2)" | ✅ fixed |
| B3 | Compact folded-conditional pseudocode leaks through filter | `looksLikeFullPseudocode` threshold blind spot | Detect folded-conditional algorithms (R3) | Eval cases `pos-pseudo-binsearch-folded[-prose]` + `solution-filter.test.ts` | ✅ fixed |
| B4 | Free-form chat can't answer questions about the user's own code (e.g. "what is the current time complexity" → "you didn't include your code") | The `userQuery` path in `handleChatSubmit` never extracts/sends the editor code — only the templated `CHECK_APPROACH`/`UNDERSTAND_SOLUTION`/`GENERATE_REPORT` actions call `extractCurrentCode`. Chat is blind to the editor. | `handleChatSubmit` now always sends the (non-empty) editor code; `buildChatData` folds it into the `wrapUntrusted` block. **Chat stays NON-EXEMPT** (still filtered) — the model may analyze/quote pieces but a full-solution dump is still caught; the prompt points a "show me the solution" ask to `Understand Solution` | `chat-code.test.ts` — code folded in / omitted; prompt aware-of-code but guardrailed | ✅ fixed |
| B5 | Non-exempt actions with heavy prompts (esp. `Concept`) show 5–6s of "Thinking…" before reveal — feels frozen | B1's pre-display gate withholds the whole stream until complete, so the user now waits the FULL generation time (which live streaming used to mask). `Concept`'s prompt is the heaviest non-exempt one. | `ThinkingIndicator` now runs an elapsed timer: after a 3s grace period it switches to a "Still working on it…" phrase + an elapsed-seconds counter, so the card visibly signals life instead of a frozen label. (Perceived-performance only — the gate is unchanged; not a real progress bar since the model's progress is unknowable.) | Visual review + the existing B1 gate test (labels still fixed strings) | ✅ fixed |

| B6 | Chat should route a question to a matching action (e.g. "is my code O(n²)?" → Analyze code) instead of always free-forming | Chat has no intent classifier; every message goes down the free-form path | **✅ Resolved by `leetsage-chat-intent-routing`** (built on branch `feature/chat-intent-routing`): a pure `classify → resolveOverlap → route` pipeline sits in front of the chat path. Classifier is a local heuristic (no extra API call); the decision is three-way (`route`/`ask`/`chat`); an exempt-action match is turned into a **confirm affordance** (never a silent route into a filter-exempt action, resolving the guardrail-hole the deferral flagged). | Labeled golden set (`intent-router/__tests__/golden-set.test.ts`) doubling as the router's accuracy metric, incl. an explicit "solution-seeking message never silently reaches an exempt action" test | ✅ fixed (in `leetsage-chat-intent-routing`) |
| B7 | Complexity badge splits on nested parens — `O(log(M) + log(N))` renders only `O(log(M)` as a yellow badge, the rest as plain text | `renderComplexity` regex `/O\(([^)]+)\)/` stops at the FIRST `)`, so any inner paren (`log(M)`, `O(N*log(N))`) truncates the match | Balanced-paren parser (`splitComplexity`/`matchingParen` in `complexity-parse.ts`) captures the whole `O(...)` incl. nested parens as one badge | `complexity-parse.test.ts` — nested / two-per-line / unbalanced / no-complexity cases | ✅ fixed |
| B8 | `Analyze code` under-credits optimality: didn't note that `O(log M + log N)` is equivalent to `O(log(M·N))`, so a user who reached optimal is told "Optimal: O(log(M*N))" as if different | Prompt/model reasoning — the coach doesn't apply log-equivalence to recognize the user matched optimal | Prompt nudge to recognize algebraic complexity equivalences (deferred — fuzzy, model-reasoning, not rendering) | (prompt-level; hard to guard deterministically) | 📝 deferred |
| B9 | Structured-action section HEADERS are hallucinated — observed `## 🌍 Real-Year Analogy` rendered in an `UNDERSTAND_SOLUTION` card where the prompt specifies **`## 🌍 Real-World Analogy`** (model wrote "Real-Year" for "Real-World"). Misleads the user and looks broken. | These headings are **NOT hardcoded/deterministic** — a common wrong assumption. The prompt only *describes* the section shape (`## 🌍 Real-World Analogy`, `## 🔑 Key Insight`, …) as instructions; the model reproduces the literal heading text token-by-token, so it can drift/hallucinate. `ContentDisplay` renders headings via raw `line.slice(3)` (no transform touches heading words — verified the `n→N`/superscript replaces run ONLY inside `O(...)` complexity segments), so the corruption is in the model output, not the renderer. Happens identically via a button press or a routed chat message. | Deferred (out of scope for `chat-intent-routing`, which must not modify prompts). Candidate fixes, in order of robustness: (a) **client-side canonicalization** — since the section set is fixed per action, post-process the response to snap near-miss headings back to the canonical strings (deterministic, testable); (b) strengthen the prompt to emit section headings verbatim / from a fixed list; (c) render section headings from a client-owned template keyed by position rather than trusting the model's heading text at all. Option (a) or (c) makes the headings deterministic again. | (none yet — belongs to a future prompt/rendering-hardening pass; a canonicalization helper would get a unit test) | 📝 deferred (documented) |

*(Append future bugs below this line as new rows.)*

---

## Non-goals / explicitly out of scope

- **The `PATTERN_RECOGNITION` prompt fix** — deferred to
  `leetsage-action-streamlining` (depends on whether `Pattern` survives).
- Reworking the action set / reducing options — that is the streamlining spec.
- Any new coaching capability — this is hardening only (feature-freeze mindset
  toward launch).
