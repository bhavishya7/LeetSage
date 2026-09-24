# LeetSage — Guardrail Hardening: Tasks

> **Status: 📐 Planned — not started.** Implementation breakdown for
> [requirements.md](./requirements.md) / [design.md](./design.md). Build in a
> fresh focused session following `.kiro/steering/workflow.md` (explain-and-stop
> before committing; get UI changes eyeballed; CI/Husky gate lint+test+build).
> Requirements refs (Rx) and bug IDs (Bx) point at requirements.md.

---

## B1 — Pre-display gate *(R1)*

- [ ] 1. In `App.tsx`, gate the per-chunk render by action type: for **non-exempt**
  actions, do NOT render model tokens during the stream — accumulate `fullContent`
  and show the animated placeholder instead (task 5).
- [ ] 2. After the stream completes for non-exempt actions, run
  `parseStructuredResponse` (if applicable) → `filterResponse`, then commit the
  final (filtered-or-content) result in one update.
- [ ] 3. Keep **exempt** actions (`CHECK_APPROACH`/`UNDERSTAND_SOLUTION`/
  `GENERATE_REPORT`) streaming live as today (incl. `stripDataBlockForDisplay`).
- [ ] 4. Handle edge cases: placeholder reads as "working" not frozen; a mid-stream
  error clears the placeholder; metrics recording (latency/usage) still fires.
- [ ] 5. Build the placeholder: a **pulsing/fading three-dot indicator** (staggered
  opacity keyframes) + a short **action-aware label** from an `actionType`-keyed map
  (with a neutral "Thinking…" fallback). **UI change → get the user to eyeball the
  animation + wording + reveal flow before committing.**
- [ ] 6. Test: assert that for a non-exempt action whose (mocked) response would be
  filtered, the flagged content is never in a rendered/committed state before the
  filter — only the placeholder, then the filtered message. *(Guard for B1.)*

## B2 — Direct-answer chat path *(R2)*

- [ ] 7. Add a dedicated chat/free-form system prompt (e.g. a `CHAT` prompt or
  `getChatSystemPrompt()`) that answers directly, does NOT mandate a real-world
  analogy, keeps `SOLUTION_PREVENTION_RULES` + `OUTPUT_RULES`, and preserves the
  `wrapUntrusted` framing + guardrail reassertion.
- [ ] 8. Route the `userQuery` path (in `llm-service.ts` / `App.tsx`) through the
  new prompt instead of `EXPLAIN_CONCEPT`.
- [ ] 9. Confirm chat still flows through `filterResponse` and the B1 gate
  (non-exempt).
- [ ] 10. Test: assert the chat prompt does not force an analogy section and keeps
  the guardrail rules. *(Guard for B2.)*

## B3 — Filter blind spot *(R3)*

- [ ] 11. Add the real observed leak (the binary-search folded-conditional
  pseudocode) plus safe near-misses (short illustrative snippet, plain prose) as
  labeled cases in `src/evals/` fixtures.
- [ ] 12. Adjust `looksLikeFullPseudocode` (per design §3) so it catches compact
  folded-conditional procedures without tripping on the safe cases — tuned against
  the eval, not hand-guessed.
- [ ] 13. Run the guardrail eval; confirm catch rate rises and false-positive rate
  stays 0%. *(Guard for B3.)*
- [ ] 14. Add/adjust `solution-filter` unit tests for the new cases.

## Cross-cutting *(R5)*

- [ ] 15. Verify no regressions: full Vitest suite + eval green; `npm.cmd run build`
  clean; lint clean (CI + Husky will gate).
- [ ] 16. Update the bug-registry statuses in requirements.md to ✅ as each lands,
  and add this spec to `.kiro/specs/README.md` (status + a row in the index) so the
  map stays current.
- [ ] 17. **Explain what was built and STOP for the user's review before
  committing.** Then commit in logical groups (per bug) with detailed messages;
  don't push/merge without being asked.

---

## Explicitly NOT in this session

- The `PATTERN_RECOGNITION` **prompt** fix (B?-Pattern) — owned by
  `leetsage-action-streamlining` (depends on whether `Pattern` survives).
- Any action-set changes / option reduction — the streamlining spec.
