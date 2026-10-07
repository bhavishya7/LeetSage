# LeetSage — E6 Bug / Vulnerability Hardening Pass (standing spec)

> **Spec rigor note (why design-only, standing):** This is the consolidated
> pre-launch **bug-hardening pass** from the roadmap (E6). It is a STANDING spec on
> a long-lived branch (`feature/e6-bug-hardening`): we work down a list of bugs,
> and the user **merges the branch each time a bug/fix is complete** (per-fix
> merge, not one big-bang). Each fix adds a guarding test (the bug-registry
> principle established in `leetsage-guardrail-hardening`). Design-only is
> appropriate: the fixes are well-understood and individually small; this doc is
> the running plan + root-cause record so a build session doesn't re-derive it.
>
> **Single source of truth for bugs = the registry** in
> `leetsage-guardrail-hardening/requirements.md`. This spec references the Bx IDs;
> as each lands, flip its registry row to ✅.
>
> **Status:** 🏗️ OPEN / in progress. First batch = the "Analyze my code"
> correctness bugs (B13/B14/B15) + the badge-source root fix. Carries B8 + B10.

---

## 0. Confirmed correctness finding (grounds the whole first batch)

The user hit "Analyze my code" repeatedly reporting **O(N)** for LeetCode **Encode
and Decode Strings**, while LeetCode's own AI said **O(N·M)**. **Verified by hand:
the correct answer is O(N·M), and the extension's "O(N)" is WRONG.** With
N = number of strings and M = average string length (so total input = N·M):
- `encode`: `"".join(strs)` O(N·M); the `while delim in combined_strs` scan O(N·M)
  (bounded rescans); the per-string concat loop O(N·M). → **O(N·M) time**.
- `decode`: single pass over the encoded string + slice copies → **O(N·M) time**.
- Space: output holds all characters → **O(N·M)**.
The user's approach (length-prefix + dynamic delimiter) **is optimal** — you can't
beat O(total characters). So the extension was *also* wrong to "suggest a fixed
delimiter / length prefix" (the user already does that) and wrong to imply they're
not optimal.

**Why O(N) appeared:** O(N) is the Two-Sum archetype answer, and it's exactly the
value hardcoded in the CHECK_APPROACH prompt's example (see B14). The model
anchored on the example instead of computing from the user's code. A correct run
earlier proves the model *can* get O(N·M) — the instability is the tell.

**New requirement surfaced by this:** complexity must NEVER be a bare, undefined
symbol. "O(N)" with no definition is what confused the user (LeetCode's N = strings,
some sources' N = total chars). The coach must state **O(N·M)** explicitly, OR
"O(N) where N = total number of characters" — never an undefined bare O(N). (See R4.)

---

## 1. Root-cause trace (verified 2026-10-05 — do not re-derive)

The "Analyze my code is broken" report is really THREE independent root causes that
compound. Full trace across prompt → capture → parse → render:

### Bug A → **B14**: wrong/unstable complexity = PROMPT example-bleed
`getSystemPrompt('CHECK_APPROACH')` in `src/services/prompts.ts` hardcodes a fully
written example Efficiency section with concrete Two-Sum values —
`**Current:** O(N²) time, O(1) space` / `**Optimal:** O(N) time, O(N) space` — plus
a matching "nested loop / `seen = {}` hash map / `arr[1:]`" narrative. The structured
`ANALYZE_DATA_EXAMPLE` repeats `O(N^2)`/`O(N)`. The "this is the SHAPE, not text to
copy" caveat is too weak for `gemini-3.5-flash-lite`. Result: the model sometimes
echoes O(N)/O(N²), sometimes computes the real value → the run-to-run flip-flop. The
PARSER is innocent (`validateAnalyze`/`toComplexity` pass strings through). **Prompt
problem.**

### Bug B → **B15**: contradictory advice = incomplete/empty code capture
`src/services/code-extractor.ts` `readEditorFromPage` prefers Monaco's MAIN-world
model (`getValue()`, longest-model heuristic) but **falls back to scraping
`.view-lines`, which is VISIBLE-lines-only**, and there is **no retry/backoff**
(unlike the problem-data pull path). On a failed/transient MAIN-world read or a
scrolled editor, the model gets partial/empty code; `buildUserMessage` then says
"My editor is currently empty," and the model gives generic advice — which, via
Bug A, becomes the hardcoded Two-Sum narrative that contradicts the user's real
length-prefix solution. **Capture problem.**

### Bug C → **B13**: lost "N*M" formatting = markdown parser eats the asterisk
In `src/components/ContentDisplay.tsx`, `renderInline` splits on markdown emphasis
(`/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g`) **before** complexity parsing. On
`**Current:** O(N*M) time, O(N*M) space`, the literal `*` in `N*M` are consumed as
italic delimiters and stripped, mangling the Big-O before the (otherwise `*`-safe)
`splitComplexity → renderComplexity → formatSuperscripts` chain runs. **Renderer
problem.** (Latent sibling: the `/n/g → N` replace inside a complexity segment
corrupts `O(min(a,b))` → `O(miN(a,b))` — fix in the same pass.)

### The structural smell underneath A & C
**The complexity badge is driven ENTIRELY by the model's PROSE, not by the parsed
`AnalyzeData`.** `AnalyzeData.currentComplexity/optimalComplexity` is validated and
stored on `metadata.structured`, but **no component renders it** — only
`session-digest.ts` (digest/records) consumes it. So prose and structured data can
disagree, and all complexity rendering inherits every prose-parsing fragility. The
user chose the **root fix: render the Efficiency complexity from the structured
data** (R3), which kills Bug C's whole class and sets up B10.

---

## 2. First batch — scope (the "Analyze my code" correctness fixes)

### R1 — B14: Fix the prompt so complexity reflects the REAL code (not the example)
- Replace the concrete Two-Sum values in the CHECK_APPROACH system prompt's example
  Efficiency section (and `ANALYZE_DATA_EXAMPLE`) with an **abstract/placeholder**
  shape the model cannot echo as an answer — e.g. `O(<time>)`, `O(<space>)`, or a
  clearly-non-numeric template, with an explicit instruction to COMPUTE from the
  user's actual code and NOT reuse any example values.
- Keep the section STRUCTURE (Approach / Efficiency / Code Style) — only the
  example's leakable values change.
- Guard: a `prompts.test.ts` assertion that the CHECK_APPROACH prompt does not embed
  a concrete answerable Big-O like `O(N^2)`/`O(N)` as example output (so a future
  edit can't re-introduce the bleed). Full correctness is guarded later by the eval.

### R2 — B15: Code capture MUST be reliable — the top-priority fix
**User mandate: code capture is the first thing ever built and it HAS TO WORK 100%
of the time. Harden it as the single most important item in this batch.** The
`decode`-side reality: an LLM analyzing the WRONG code is worse than no analysis, so
capture reliability is the foundation everything else stands on.

**The 3 outcomes must be exhaustive and UNAMBIGUOUS — the silent middle case must be
impossible:**
1. **Full code present** → feed the COMPLETE source to the model.
2. **Genuinely empty** (user wrote nothing) → tell them honestly "you haven't
   written any code yet" — never pretend, never give generic analysis as if code
   existed.
3. **Read failed** (couldn't reach the editor) → an explicit error/retry, NOT a
   silent fallback to a fragment and NOT a false "empty".

The bug today is that outcomes 2 and 3 are CONFLATED (a failed read looks like
"empty"), and a partial read (visible-only DOM) masquerades as outcome 1.

**Hardening requirements:**
- **Trust the full Monaco model, not the DOM fragment.** The primary read
  (`window.monaco.editor.getModels()[].getValue()`) returns the WHOLE document
  including scrolled-off lines. The current **visible-only `.view-lines` DOM
  fallback can return a TRUNCATED fragment that silently masquerades as the full
  code — this is the dangerous path and must be eliminated as a code source.** A
  partial scrape must NEVER be sent to the model as if it were the complete
  solution. (The DOM may still be used ONLY as a last-resort *liveness* signal —
  "is there any code at all" — never as the analyzed source.)
- **Retry/backoff on the MAIN-world read** — mirror the robust problem-data pull
  pattern (which already retries with backoff + a `chrome.scripting` inject
  fallback). The code read currently makes a SINGLE attempt with no retry; that is
  the gap. Retry the real Monaco read across a few attempts over a short window to
  absorb editor-not-ready / script-race / sleeping-worker timing.
- **Distinguish "empty" from "failed to read" explicitly.** `extractCurrentCode`
  must return a discriminated result (e.g. `{ status: 'ok', code, language }` /
  `{ status: 'empty' }` / `{ status: 'failed' }`) instead of today's
  `ExtractedCode | null` where null means both "empty" and "error". The caller
  branches on it: `ok` → analyze; `empty` → honest "no code yet"; `failed` →
  surface a real error / retry affordance, never a silent generic analysis.
- **Verify Monaco multi-model selection** — the "longest `getValue()` wins"
  heuristic can pick a wrong model (diff/preview). Confirm it reliably targets the
  user's editor model; prefer a more deterministic selection if available.
- **Language capture** must stay correct (the Monaco model often reads `plaintext`;
  the toolbar fallback resolves the real language — keep that working).
- When capture is `failed` or `empty`, the prompt must reflect it HONESTLY and the
  model must NOT emit an authoritative complexity/approach as if it saw full code
  (ties to R4).
- **Guards:** unit tests for (a) full-Monaco preferred over DOM; (b) a
  truncated/partial read is NEVER accepted as the analyzed source; (c) the three
  statuses (`ok`/`empty`/`failed`) are distinct and the caller branches correctly;
  (d) retry fires on a transient failure; (e) multi-model selection picks the editor
  model; (f) language resolution. This path is foundational → test it hardest.

### R3 — B13 + root fix: render complexity from STRUCTURED DATA, not prose
- Render the **Efficiency section's Current/Optimal complexity from
  `AnalyzeData.currentComplexity`/`optimalComplexity`** (the parsed, validated
  structured values) rather than re-parsing the prose line. This is the user-chosen
  root fix: it makes the badge authoritative, kills the markdown-eats-`*` bug class,
  and aligns prose↔data.
- Keep the prose for the explanatory "where the cost comes from" text; only the
  Current/Optimal values become structured-driven.
- ALSO fix `renderInline` so an inline `O(...)` with `*` (e.g. in body prose) no
  longer loses its asterisk — extract/protect `O(...)` groups BEFORE the markdown
  emphasis split (defense-in-depth, since prose still contains complexity mentions).
- Fix the latent `/n/g → N` over-replace (scope it so it can't corrupt `O(min(..))`).
- Decide the fallback: if structured data is absent (model emitted no valid block),
  fall back to the (now `*`-safe) prose renderer — never show nothing.
- Guards: `complexity-parse` / renderer tests for `O(N*M)`, `O(N * M)`, `O(n*m)`,
  `O(min(a,b))`, `O(N log N)`, nested parens; a test that the badge reads from
  structured data when present.

### R4 — NEW: complexity is never an undefined bare symbol
- The coach must express complexity as either an **explicit multi-variable form**
  (`O(N·M)` / `O(N*M)`) OR **a single symbol WITH its definition stated** ("O(N)
  where N = total characters"). A bare undefined `O(N)` is a defect (it caused this
  very confusion: LeetCode's N = #strings).
- Prompt-level requirement + (where feasible) a structured-data note of what the
  variables mean. Hard to guard deterministically; the eval guards it later.

---

## 3. Interaction with B10 (optimal drift) — sequence note

R3 was ORIGINALLY framed as a prerequisite enabler for B10 (render the badge from
structured data, then pin that value). **Update (post-batch-1): R3's structured-
driven badge was tried and REVERTED** — it no-oped when prose and JSON agree (the
common case) and couldn't fix the drift because the structured JSON drifts too. So
B10 does NOT depend on a structured-driven badge. B10 is now the PRIMARY fix for the
run-to-run complexity instability (the open part of B14/R4/B16).

---

## 3b. B10 — pin ONE canonical complexity per problem (the real drift fix)

**This is the next build (batch 2). It is what actually closes the O(N) ↔ O(N·M)
run-to-run instability that batch 1 could only partially address.**

### The problem (confirmed)
`currentComplexity`/`optimalComplexity` are RE-GUESSED by the model on every call —
each `CHECK_APPROACH` (and chat/report) is an independent request with no shared
ground truth, so the value flip-flops between messages for the SAME problem. Batch 1
removed the prompt example-bleed (necessary) but the model still drifts (not
sufficient). There is no single source of truth today.

### The design — persist-and-feed-back (prompt-level pin)
The fix is NOT a render change; it is a **memory + prompt-constraint** change:
1. **Persist the first authoritative complexity per problem**, keyed on the
   normalized `/problems/{slug}/` URL (the SAME key session persistence and progress
   records already use). Store BOTH `optimalComplexity` AND the model's assessment
   of the user's `currentComplexity`? → **Decision: pin the OPTIMAL only.** The
   optimal is a fixed property of the problem (stable, pinnable). The *current*
   complexity legitimately CHANGES as the user edits their code, so it must stay
   re-computed each call — pinning it would be wrong. (This resolves the "both looked
   wrong" observation: optimal should be stable; current should track their code.)
2. **Feed the pinned optimal back into every subsequent prompt** (CHECK_APPROACH,
   UNDERSTAND_SOLUTION, the chat/agent path, GENERATE_REPORT) as a HARD constraint:
   "The established optimal complexity for THIS problem is X (time) / Y (space). Use
   exactly this as the optimal; do NOT recompute or contradict it. Assess the user's
   CURRENT complexity against it." So the model stops re-guessing the optimal.
3. **Authority rule — LOCKED: (b).** Pin on the first authoritative emission, but
   **`UNDERSTAND_SOLUTION` can OVERRIDE and re-pin** (it's the action whose whole job
   is the optimal — the canonical authority; a first `CHECK_APPROACH` guess must not
   permanently outrank it).
4. **Honesty / self-correction — LOCKED: clearable, session-scoped pin.** Since the
   pin comes from a non-deterministic model with NO verifier (confirmed: no external
   authoritative source exists — see note below), it can be WRONG:
   - The pin is scoped to the **session/problem**, not a permanent global truth.
   - **Ship a clearable escape hatch** so a wrong pin is never inescapable — at
     minimum a "this looks off? / clear" affordance (and "Reset this problem" already
     clears session state, so wire the pin into that too). Do NOT silently lock a
     wrong optimal with no way out.
   - Pinning makes the value STABLE and SELF-CONSISTENT across a session; being
     *correct* is still the eval's job (E10). State this honestly — **B10 fixes
     *drift*, not *correctness*.**

### No external authoritative source (confirmed by research, 2026-10-06)
There is **no machine-readable complexity to fetch** — not from LeetCode (its
GraphQL has no `timeComplexity` field; complexity appears only as optional human
prose in editorials/solutions; introspection is disabled; no official API) and not
anywhere else. **Every tool in this space COMPUTES complexity from the code with an
LLM** (even LeetCode's own AI, and the public complexity-analyzer tools). And
complexity is often notation/definition-dependent (O(N·M) ≡ "O(N) where N = total
chars"), so a single typed field couldn't be authoritative anyway. **Conclusion:**
pinning the model's own first authoritative answer and letting the user correct it
IS the right design given the landscape — not a workaround. Don't spend effort
hunting for a source of truth; there isn't one.

### Reasoning-quality levers (keep requests at +1 — LOCKED)
Hard constraint: a predefined button press stays **exactly 1 request** against the
200/day. Within that, two levers improve each (still-1-request) call's complexity
reliability — BOTH approved for B10:
- **Lever 1 — chain-of-thought (APPROVED, accept the latency tradeoff).** Make the
  model reason through the cost derivation step-by-step (identify each loop/op, its
  cost, how they combine) BEFORE committing to the headline. Biggest correctness
  lever that respects "+1 request". **The reasoning MUST stay HIDDEN** (reasoned
  internally / stripped from the displayed card — never dump it into the answer, and
  it must not leak past the no-solutions guardrail). Cost: more tokens + **latency**
  within the one request — NOT more requests, and (per ADR-007 clarification) NOT a
  realistic TPM-quota threat for one-at-a-time usage. Watch the B5 "feels frozen"
  lesson: the pre-display gate must still feel alive during the longer think.
- **Lever 3 — anchor variables to the problem constraints (APPROVED, ~free).** Tell
  the model to derive its complexity VARIABLES from the stated constraints (already
  in the prompt context, e.g. `1 ≤ strs.length ≤ 200` → N; `strs[i].length ≤ 200`
  → M). Tight addition to the existing R4 "Variables:" rule, not a new paragraph.
  Grounds the definitions; ~zero extra tokens.
- **NOT doing — Lever 2 (route to the stronger model):** rejected — raises token
  cost even though requests stay +1; keep flash-lite the default.
5. **Digest reconciliation (carried from the original B10 trace):** `buildSessionDigest`
   can currently emit TWO conflicting optimal lines (latest analysis' vs. latest
   understanding's). With a single pinned optimal, the digest must emit ONE
   reconciled line (the pinned value). Fix this as part of B10.

### Storage shape
Small, keyed on slug. Options: a dedicated `complexity_pin_{slug}` key, OR extend the
existing per-problem record/progress structure. **Lean: a small dedicated store** (it
exists even before the user saves a progress record; a `CHECK_APPROACH` with no save
should still pin). Keep it schema-versioned like the other stores.

### Guards (tests)
- A pinned optimal persists across calls for the same slug and is injected into each
  action/chat prompt (assert the prompt carries the pinned value).
- Two sequential analyses of the same problem return the SAME optimal (drift gone) —
  the explicit regression test for this bug.
- The CURRENT complexity is NOT pinned (still recomputed) — assert current can differ
  across calls while optimal is stable.
- The authority rule ((a) vs (b)) behaves as chosen.
- Digest emits ONE reconciled optimal line.

### What B10 does NOT do
It does not make the complexity *correct* — a wrong-but-stable optimal is still
possible and is the correctness eval's (E10) job. B10's win is: **stable, self-
consistent, non-contradictory within a problem.** Say this honestly in the UI/docs.

---

## 4. Carried-over registry bugs (also in this E6 pass)

- **B8** — optimality-equivalence crediting (`O(log M + log N)` ≡ `O(log(M·N))`) —
  prompt-level nudge; low priority.
- **B10** — optimal complexity drifts across messages (single-source-of-truth per
  problem; see §3 and the roadmap). Do AFTER R1–R4.
- **B9** — hallucinated section headers (client-side canonicalization) — candidate
  for this pass if cheap.
- **B17** — stats-panel caption leaks the internal file name `metrics-pricing.ts`
  into user-facing UI and misframes "cost" (free-tier users are never billed — a
  429 rejects, never charges). Fix: drop the file reference; state the no-charge
  reality honestly. UI text → user eyeballs. **Bundle with the B10 batch** (same
  branch, tiny). See DESIGN_DECISIONS ADR-007 clarification (2026-10-06).

(Plus the roadmap's broader E6 vulnerability-scan checklist — `npm audit`, CSP
re-verify, `host_permissions` breadth, `innerHTML` re-verify, BYOK-key posture — as
a later batch in this same standing branch.)

---

## 5. Verification & gate (hard rule)

- `npm.cmd run build` compiles + `npm.cmd run test` passes before presenting. Each
  fix adds its guarding test; flip the registry row to ✅.
- **These are correctness + VISUAL changes → the user MUST eyeball the built
  extension on a REAL problem (Encode and Decode Strings is the canonical repro) and
  confirm it now reports O(N·M) with intact formatting** before any commit.
- Build → explain → **STOP for review** → the user merges the branch per completed
  fix. Never commit to main directly; branch `feature/e6-bug-hardening`.
- Honest caveat from the chat-polish session still applies: a healthy-service live
  coaching call should be the confirmation (Gemini free-tier 503s have blocked this);
  retry when the service is up.

---

## 6. Resolved decisions (locked 2026-10-05)

1. **B14 example form → BOTH.** Strip the concrete Big-O from the CHECK_APPROACH
   prompt example and use abstract placeholders (`O(<time>)` / `O(<space>)`) so there
   is nothing answerable to parrot, AND add an explicit instruction to COMPUTE the
   complexity from the user's actual code and never reuse example values. (Complexity
   is per-problem; a templated/example answer is never acceptable.)
2. **R2 capture → eliminate the silent-partial case; three explicit outcomes.**
   Trust the full Monaco model as the ONLY analyzed source; **drop the visible-only
   DOM fragment as a code source** (liveness-signal at most); add retry/backoff on
   the real read; return a discriminated `ok | empty | failed` status so "empty" and
   "failed" can never be conflated. Capture reliability is the TOP priority of this
   batch (user mandate: it must work 100% of the time). (See R2 for full detail.)
3. **R3 structured render → prose fallback, never show nothing.** Render the
   Efficiency complexity from structured `AnalyzeData` when present; if the model
   emitted no valid structured block, fall back to the (now `*`-safe) prose renderer.
   Never render an empty/blank complexity.
4. **Batch order → R1–R4 (analyze fixes) → B10 → B9/B8 → vuln-scan.** R3's
   structured-render is the prerequisite that enables B10 (pin one canonical optimal).

**Settled context (not build decisions, for the record):**
- Bug registry stays inside `leetsage-guardrail-hardening/requirements.md` (the
  established single-source-of-truth location).
- The eval framework (E10/E10b) is explicitly DEFERRED until this E6 batch lands.
- Gemini service is healthy as of 2026-10-05 → the build session CAN and MUST do the
  live confirmation (Encode and Decode Strings must report **O(N·M)** with intact
  formatting, from fully-captured code) before committing.
