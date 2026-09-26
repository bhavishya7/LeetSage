# LeetSage — Guardrail Hardening: Design

> **Status: ✅ Built — implemented as designed.** Design for the three bug fixes in
> [requirements.md](./requirements.md) (B1 pre-display gate, B2 direct-answer chat,
> B3 filter blind spot). Same teaching format as the other design docs: each
> section pairs a **DESIGN** decision with a **📚 SYSTEM-DESIGN LESSON**. Built on
> branch `feature/guardrail-hardening` (B1 via a `ThinkingIndicator` placeholder +
> `streamLive` gate in `App.tsx`; B2 via `getChatSystemPrompt()`; B3 via a
> folded-conditional detection path in `looksLikeFullPseudocode`, tuned against the
> eval).
>
> Grounds against real code: `src/sidepanel/App.tsx` (the stream loop),
> `src/services/prompts.ts` (prompts + `wrapUntrusted`), `src/services/llm-service.ts`
> (the `userQuery` path), `src/services/solution-filter.ts` (the filter),
> `src/evals/` (the labeled guardrail eval).

---

## 1. B1 — Pre-display gate ("analyzing…" then reveal)

**Today (the bug).** In `App.tsx`, the streaming loop does
`setLearningContent(... display ...)` on every chunk, so tokens paint into the
visible card as they arrive. `filterResponse` runs only *after* the loop. For a
non-exempt action that leaks, the user reads the leak, then it's replaced.

**Design.** Split behavior by whether the action is solution-exempt:

- **Exempt actions** (`CHECK_APPROACH`, `UNDERSTAND_SOLUTION`, `GENERATE_REPORT`):
  keep streaming live as today (solutions are allowed; they bypass the filter).
  They keep the existing `stripDataBlockForDisplay` mid-stream behavior.
- **Non-exempt actions** (Hint, Examples, Concept, Complexity, Pattern, and
  free-form chat): while streaming, the card shows a **placeholder** state
  (an "Analyzing…" / working indicator) — the model's actual tokens accumulate in
  memory (`fullContent`) but are NOT rendered. When the stream completes, run
  `parseStructuredResponse` (if applicable) → `filterResponse`, THEN render the
  final (filtered or content) result in one commit.

Mechanism: gate the per-chunk `setLearningContent` render on
`isStructuredAction(actionType)` / exempt-set membership. For non-exempt actions,
update only a lightweight "streaming" flag/placeholder during the loop; do the
real content commit once, after filtering.

> 📚 **SYSTEM-DESIGN LESSON — a gate must sit BEFORE the thing it protects.** The
> filter was logically correct but positioned after the render, so it could only
> *undo* exposure, not *prevent* it. Security/validation controls belong on the
> path *before* the protected resource is exposed — the same reason you validate
> input before acting on it, not after. "Detect and roll back" is weaker than
> "block before reveal."

> 📚 **SYSTEM-DESIGN LESSON — perceived performance vs. correctness.** Streaming
> exists for perceived speed. We keep the *feeling* of responsiveness (a visible
> "analyzing…" state) while moving the *actual* reveal behind the gate — a
> deliberate trade of a little live-typing flourish for a hard correctness
> guarantee, made only where correctness matters (non-exempt actions).

**Placeholder presentation (R1.5).** The non-exempt "working" state is a
**pulsing/fading three-dot indicator** (dots cycle opacity in staggered sequence
via a CSS keyframe animation with per-dot delays) next to a **short, action-aware
label** derived from a small map keyed by `actionType` (Hint → "Thinking of a
hint…", Break down → "Breaking it down…", Concept → "Explaining…", Complexity →
"Estimating complexity…", Examples → "Coming up with examples…", chat →
"Answering…"; neutral "Thinking…" fallback). Prefer a subtle pulse over a bouncy
bounce so it stays calm in the narrow panel. The animation is presentation-only —
it does not change the gate logic. Exact timing/wording is eyeballed with the user
in the build.

**Edge cases to handle:** the indicator should read as "working," not "stuck"; an
error mid-stream should clear the placeholder; the metrics recording
(latency/usage) already happens after the loop and is unaffected.

---

## 2. B2 — Direct-answer chat path

**Today (the bug).** `llm-service` / `App.tsx` route the free-form `userQuery`
through `getSystemPrompt('EXPLAIN_CONCEPT')`, whose text mandates "Use a real-world
analogy…". Any direct question inherits that, forcing analogies.

**Design.** Introduce a dedicated **chat / free-form** system prompt (e.g. a new
`CHAT` action-or-mode prompt, or a `getChatSystemPrompt()` the `userQuery` path
uses instead of `EXPLAIN_CONCEPT`). It should:
- Answer the user's actual question directly and concisely.
- Use an analogy/example **only if it genuinely aids the specific question** — not
  as a mandated section.
- Keep the no-solutions guardrail rules (`SOLUTION_PREVENTION_RULES`) and the
  `OUTPUT_RULES`.
- Keep the untrusted-content framing: the problem context + the user's question are
  still wrapped via `wrapUntrusted` (from the prompt-injection work), and the
  guardrail is reasserted after the untrusted block.

Note it stays a **non-exempt** path, so it flows through B1's pre-display gate and
`filterResponse`.

> 📚 **SYSTEM-DESIGN LESSON — reuse the mechanism, not the wrong template.** The
> chat path reused `EXPLAIN_CONCEPT` because it was convenient, inheriting behavior
> that didn't match the intent. Sharing infrastructure (guardrail rules, output
> rules, untrusted-content framing) is good; sharing a *task template* whose intent
> differs is a bug. Separate "what to do" (per-intent) from the cross-cutting rules
> (shared).

---

## 3. B3 — Close the compact-pseudocode blind spot

**Today (the bug).** `looksLikeFullPseudocode` requires `controlLines >= 5 &&
hasLoop && hasResult`, counting mostly *line-leading* control keywords. A compact
algorithm folds its branch into the loop header and may not have a line-leading
`return`, so it scores under the threshold and passes.

**Design (verify current heuristic first, then adjust minimally).** Strengthen the
detection so a *complete, compact* procedure is caught, without raising
false-positives on short illustrative snippets or prose. Candidate signals (to be
chosen/validated against the eval, not all applied blindly):
- Count control/operation keywords **anywhere on a line**, not only line-leading,
  so a folded `while … : mid = …; if …` still registers its loop + branch.
- Treat a loop **plus** an index/pointer-update pattern (`mid =`, `left =`,
  `right =`, `lo/hi`, `l/r`) **plus** a terminating/return-ish line as the
  "complete procedure" signature even when short.
- Keep a floor that excludes 1–2 line snippets (single-idea illustrations must
  still pass).

The exact rule is chosen by **adding the observed leak + safe near-misses to the
eval dataset and tuning until catch-rate rises with false-positive-rate staying at
0** — do NOT hand-tune the regex in isolation.

> 📚 **SYSTEM-DESIGN LESSON — heuristics need an eval, not a hunch.** A regex
> guardrail is a classifier; changing it blind risks trading a false negative for a
> false positive. The disciplined move is to encode the real leak as a labeled
> case, change the heuristic, and let the eval's confusion matrix tell you whether
> you actually improved — the same loop that already caught earlier leaks. This is
> literally "evaluate the change on data, don't trust the author's imagination."

> 📚 **SYSTEM-DESIGN LESSON — defense in depth still matters.** B3 is a hole in the
> deterministic backstop, but note it's one layer: the prompt (soft) + the filter
> (hard) + (soon) the pre-display gate. Hardening the filter doesn't mean the other
> layers are redundant — each catches what the others miss.

---

## 4. The bug registry (process, not code)

Requirements R4 makes the registry a standing artifact. Design intent: it is a
*table in `requirements.md`*, and the governing rule ("every fix adds a guard")
turns it from a changelog into a regression-defense system. When a new bug is
found: add a row, write the failing test/eval, fix, watch it go green, ship.

> 📚 **SYSTEM-DESIGN LESSON — a bug log with teeth.** A list of past bugs is
> documentation; a list where each entry is bound to an automated guard is a
> *regression suite with a narrative*. The value isn't the list — it's that every
> item can never silently come back.

---

## 5. What would change this design

- If **action-streamlining** cuts `Pattern`/`Concept`, some non-exempt actions
  disappear — B1's gate simply applies to whatever non-exempt actions remain
  (design is action-set-agnostic). B2 (chat) becomes *more* central.
- If a future action needs to stream *and* be filtered, revisit B1 (incremental
  filtering) — deliberately not built now (the placeholder approach is simpler and
  sufficient).
