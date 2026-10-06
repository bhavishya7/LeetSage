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

R3 (structured-driven badge) is a PREREQUISITE enabler for **B10** (pin a single
optimal per problem across messages): once the badge reads from structured data, the
B10 fix can persist one canonical optimal keyed on the `/problems/{slug}/` URL and
feed it back as a hard constraint. **Do R1–R4 first, then B10** in this same E6 pass.

---

## 4. Carried-over registry bugs (also in this E6 pass)

- **B8** — optimality-equivalence crediting (`O(log M + log N)` ≡ `O(log(M·N))`) —
  prompt-level nudge; low priority.
- **B10** — optimal complexity drifts across messages (single-source-of-truth per
  problem; see §3 and the roadmap). Do AFTER R1–R4.
- **B9** — hallucinated section headers (client-side canonicalization) — candidate
  for this pass if cheap.

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
