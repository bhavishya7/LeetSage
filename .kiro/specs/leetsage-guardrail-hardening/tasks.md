# LeetSage — Guardrail Hardening: Tasks

> **Status: ✅ Built — B1/B2/B3 implemented and guarded (awaiting the user's
> visual review of the B1 placeholder before commit).** Implementation breakdown
> for [requirements.md](./requirements.md) / [design.md](./design.md). Built
> following `.kiro/steering/workflow.md` (explain-and-stop before committing; get
> UI changes eyeballed; CI/Husky gate lint+test+build). Requirements refs (Rx) and
> bug IDs (Bx) point at requirements.md.

---

## B1 — Pre-display gate *(R1)*

- [x] 1. In `App.tsx`, gate the per-chunk render by action type: for **non-exempt**
  actions, do NOT render model tokens during the stream — accumulate `fullContent`
  and show the animated placeholder instead (task 5). *(`streamLive =
  isSolutionExemptAction(actionType)`; per-chunk `setLearningContent` only when
  `streamLive`, in both `handleActionClick` and `handleChatSubmit`.)*
- [x] 2. After the stream completes for non-exempt actions, run
  `parseStructuredResponse` (if applicable) → `filterResponse`, then commit the
  final (filtered-or-content) result in one update. *(Existing post-loop commit;
  now the ONLY commit for non-exempt actions.)*
- [x] 3. Keep **exempt** actions (`CHECK_APPROACH`/`UNDERSTAND_SOLUTION`/
  `GENERATE_REPORT`) streaming live as today (incl. `stripDataBlockForDisplay`).
- [x] 4. Handle edge cases: placeholder reads as "working" not frozen; a mid-stream
  error clears the placeholder (existing catch filters the card out); metrics
  recording (latency/usage) still fires (unchanged, after the loop).
- [x] 5. Build the placeholder: a **pulsing/fading three-dot indicator** (staggered
  opacity keyframes) + a short **action-aware label** from an `actionType`-keyed map
  (with a neutral "Thinking…" fallback). *(`ThinkingIndicator.tsx` +
  `thinking-labels.ts` + `leetsage-dot-pulse` keyframe in `index.css`.)*
  **UI change → still needs the user to eyeball the animation + wording + reveal
  flow before committing.**
- [x] 6. Test: assert that for a non-exempt action whose (mocked) response would be
  filtered, the flagged content is never in a rendered/committed state before the
  filter — only the placeholder, then the filtered message. *(Guard for B1:
  `src/sidepanel/__tests__/predisplay-gate.test.ts`.)*

## B2 — Direct-answer chat path *(R2)*

- [x] 7. Add a dedicated chat/free-form system prompt (e.g. a `CHAT` prompt or
  `getChatSystemPrompt()`) that answers directly, does NOT mandate a real-world
  analogy, keeps `SOLUTION_PREVENTION_RULES` + `OUTPUT_RULES`, and preserves the
  `wrapUntrusted` framing + guardrail reassertion. *(`getChatSystemPrompt()` in
  `prompts.ts`.)*
- [x] 8. Route the `userQuery` path (in `llm-service.ts` / `App.tsx`) through the
  new prompt instead of `EXPLAIN_CONCEPT`. *(`buildMessages`: `request.userQuery ?
  getChatSystemPrompt() : getSystemPrompt(request.actionType)`.)*
- [x] 9. Confirm chat still flows through `filterResponse` and the B1 gate
  (non-exempt). *(Chat card stays tagged `EXPLAIN_CONCEPT` → non-exempt → filtered
  + gated.)*
- [x] 10. Test: assert the chat prompt does not force an analogy section and keeps
  the guardrail rules. *(Guard for B2: `prompts.test.ts`.)*

## B3 — Filter blind spot *(R3)*

- [x] 11. Add the real observed leak (the binary-search folded-conditional
  pseudocode) plus safe near-misses (short illustrative snippet, plain prose) as
  labeled cases in `src/evals/` fixtures. *(`pos-pseudo-binsearch-folded[-prose]`
  + `neg-binsearch-snippet-1`/`neg-binsearch-prose-1` in `guardrail-cases.ts`.)*
- [x] 12. Adjust `looksLikeFullPseudocode` (per design §3) so it catches compact
  folded-conditional procedures without tripping on the safe cases — tuned against
  the eval, not hand-guessed. *(Second detection path: loop + ≥2 pointer/bound
  updates + terminator; verified via a temp probe that the new fixtures dropped
  catch rate to 85.7% before the fix, back to 100% after.)*
- [x] 13. Run the guardrail eval; confirm catch rate rises and false-positive rate
  stays 0%. *(Guard for B3: catch rate 100% / FP 0%.)*
- [x] 14. Add/adjust `solution-filter` unit tests for the new cases. *(describe
  "folded-conditional pseudocode (B3 blind spot)" in `solution-filter.test.ts`.)*

## Cross-cutting *(R5)*

- [x] 15. Verify no regressions: full Vitest suite + eval green; `npm.cmd run build`
  clean; lint clean (CI + Husky will gate). *(191 tests pass; build clean; lint 0
  errors, 2 pre-existing warnings.)*
- [x] 16. Update the bug-registry statuses in requirements.md to ✅ as each lands,
  and add this spec to `.kiro/specs/README.md` (status + a row in the index) so the
  map stays current.
- [ ] 17. **Explain what was built and STOP for the user's review before
  committing.** Then commit in logical groups (per bug) with detailed messages;
  don't push/merge without being asked. *(Explaining now; awaiting review — the B1
  placeholder still needs a visual eyeball. NOT committed.)*

---

## Explicitly NOT in this session

- The `PATTERN_RECOGNITION` **prompt** fix (B?-Pattern) — owned by
  `leetsage-action-streamlining` (depends on whether `Pattern` survives).
- Any action-set changes / option reduction — the streamlining spec.
