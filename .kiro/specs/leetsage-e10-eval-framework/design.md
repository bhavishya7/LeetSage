# LeetSage — E10: Proper Eval Framework (Promptfoo + correctness + real captured data)

> **Spec rigor:** design-only is appropriate — the shape is well-understood (adopt a
> named tool, port the existing dataset, add correctness cases + a real judge). But
> E10 is the single largest-value remaining item and is **bigger than a "swap the
> harness" job** because it adds a *correctness* dataset built from REAL captured
> responses (manual-ish labeling). Scope is enumerated below; this doc is the plan.
>
> **Status:** 📐 Designed, not built. Own branch `feature/e10-eval-framework`. E10b
> (MCP browser testing) is a SEPARATE spec/branch, built after E10.
>
> **Decisions LOCKED (2026-10-06):** (1) Promptfoo as its OWN eval step, not inside
> Vitest. (2) LLM-as-judge runs LOCAL/on-demand only — **key-free CI**; the judge is
> a MEASUREMENT tool, not a release gate. (3) Correctness dataset from REAL CAPTURED
> responses, seeded from observed failures — NOT authored cases (authored = the
> source of the optimism bias). (4) E10 and E10b are separate; E10 first. (5) Verify
> Promptfoo's current API/version against its docs AT BUILD TIME (it moves fast).

---

## 1. Why — what's wrong with the current eval

The current eval (`src/evals/`) is **hand-rolled**: a custom `computeMetrics`/
`formatReport` confusion matrix (`metrics.ts`) over a labeled set
(`fixtures/guardrail-cases.ts`), run as a Vitest test, plus an **offline MOCK**
LLM-as-judge (`llm-judge.ts`, `makeHeuristicMockJudge`). Two honest gaps, both
already flagged in the code's own comments:
1. **The judge is a mock** — a marker-matcher, never a real semantic judge. "Did
   this paraphrase hand over the whole idea?" is never actually measured.
2. **The dataset is AUTHORED** (`source: 'authored'`) — written by the same person
   who wrote the filter, so it skews toward shapes the filter already catches. A
   strong *regression gate*, but an *optimistic* measure of real recall.
3. **It only measures SAFETY** (does it leak a solution?), NOT **correctness** (is
   the complexity right? is the advice grounded in the user's code?). The E6 pass
   proved correctness is the real gap — B14/R4/B16 are all "partial pending the
   eval", and B10 fixes drift but can't verify correctness. **E10 is that
   measurement.** Without it, correctness is eyeballed one problem at a time.

Good news: the dataset file was **already built to ingest real responses** — it
defines `source: 'authored' | 'captured'`. So this is an extension, not a rebuild.

## 2. Why Promptfoo (recap of the earlier decision)

TS/JS-native, runs fully LOCAL (no backend — matches the no-backend/BYOK identity),
config-driven (YAML test cases + assertions), has a Node API, and ships first-class
**LLM-as-judge** rubrics (`llm-rubric`, `g-eval`, factuality, multi-judge) — the
exact gap in the current setup. Rejected: RAGAS/DeepEval (Python; no retrieval
layer here), hosted/SaaS eval platforms (fight the no-backend posture). The resume
value: "gated/measured an AI constraint with Promptfoo incl. an LLM-as-judge" is a
named 2026 skill vs. "I wrote my own metrics function."

## 3. Scope

### R1 — Adopt Promptfoo as its own eval step
- Add Promptfoo as a dev dependency (pin the version; VERIFY current API at build).
- A `promptfoo` config (YAML) + an npm script (e.g. `eval:promptfoo`) separate from
  the existing `npm run eval` (Vitest). Keep BOTH during migration.
- **CI stays key-free:** the GitHub Actions gate keeps running the DETERMINISTIC,
  offline checks (the solution-filter guardrail eval + unit tests + build). Promptfoo
  runs that need a live model (the judge, correctness) are **local/on-demand**, NOT
  in CI. Document this split clearly.

### R2 — Port the existing SAFETY dataset
- Move the labeled `GUARDRAIL_CASES` (leak/safe) into Promptfoo's test-case format,
  preserving the `authored`/`captured` source tag and the per-leak-type coverage.
- Keep the deterministic solution-filter assertion (it's fast, offline, CI-gated) —
  Promptfoo COMPLEMENTS it with the judge, doesn't replace it.

### R3 — Add a real (non-mock) LLM-as-judge — LOCAL only
- Replace the mock judge with a Promptfoo `llm-rubric`/`g-eval` judge, framed around
  the SAFETY constraint ("did this hand over the full solution?") AND the
  CORRECTNESS constraint (see R4).
- Runs with the user's OWN Gemini key, locally, on-demand. Score it with the same
  metrics as the filter (catch rate / FP / precision) + note the known judge biases
  (position/verbosity/self-preference) when reporting — a judge you haven't validated
  is just another opinion.
- NEVER a CI gate; NEVER needs a shipped/CI key.

### R4 — Add a CORRECTNESS dataset from REAL CAPTURED responses (the new, bigger part)
This is what actually closes B14/R4/B16's "pending the eval" status.
- A labeled set of real problems, each with: the problem, the user's code, the
  extension's REPORTED complexity, and the KNOWN-CORRECT complexity (ground truth).
- **Seed from observed failures already in hand:** Encode and Decode Strings
  (correct O(N·M), extension said O(N)); Longest Consecutive Sequence (correct O(N));
  the headline-contradicts-breakdown case (B16). These are REAL captured responses
  where the right answer is known — the ideal honest data.
- Expand with a modest spread (easy/medium/hard, different patterns) of captured
  responses, each labeled. Tag every case `source: 'captured'` so metrics can split
  captured-vs-authored and the honest recall is visible.
- The correctness eval measures: does the extension's complexity match ground truth?
  (Both as a deterministic string/equivalence check where possible, and via the
  judge for notation-equivalence like O(N·M) ≡ "O(N) where N = total chars" — ties
  to B8.)

### R5 — Honest reporting
- Metrics split by `source` (authored vs captured) so the flattering authored number
  never masquerades as real recall.
- State plainly: the judge is a local measurement, not a CI gate; captured data is
  the honest signal; correctness ground truth is human-labeled.

## 4. The MANUAL CAPTURE PROCESS — designed to be painless for the user

**Goal: the user's entire job is to paste a few things; the build session does ALL
the formatting, labeling-structure, and wiring.**

For each case the user wants to add, the user provides (copy-paste, no formatting):
1. **The problem** — name or URL is enough (e.g. "Encode and Decode Strings" or the
   LeetCode link). The build session can pull title/difficulty/constraints.
2. **Their code** — paste the code block.
3. **What the extension said** — paste the complexity it reported (e.g. "Current:
   O(N), Optimal: O(N)") and, if easy, the relevant snippet of the response. A
   screenshot is fine too.
4. **(Optional) the correct answer** — if the user knows it (e.g. "LeetCode says
   O(N·M)"). If they DON'T, they can say so and the build session proposes a
   ground-truth label for the user to confirm — the user never has to hand-format
   anything.

That's it. **The build session then does everything else:** turn each paste into a
structured `captured` case in the dataset file, assign the ground-truth label,
wire it into the Promptfoo config, and run the eval. The user reviews the resulting
labels (a quick "yes these ground-truth answers are right"), not the plumbing.

> If even step 3 is annoying, the lighter path: the user pastes just the problem +
> code + "it said O(N), should be O(N·M)" in one line, and the build session
> structures the rest. The absolute minimum is **problem + code + what it said**;
> the correct answer is nice-to-have (the session can propose it).

**Capture does NOT require the service to be scripted** for E10 — manual paste is
fine. (E10b's MCP harness can later AUTOMATE capture — run the extension on a
problem, grab the output — which is why the two reinforce each other. Not required
for E10.)

## 5. Non-goals
- NOT a CI gate for the judge/correctness (local/on-demand only).
- NOT a rewrite of the deterministic solution-filter eval (keep it as the fast CI
  gate).
- NOT E10b (MCP browser testing) — separate spec/branch, after this.
- Does NOT by itself FIX B14/R4/B16 — it MEASURES them so a fix can be validated.
  (A measured-wrong result may then drive a follow-up prompt/model change.)

## 6. Verification & gate
- `npm.cmd run build` compiles; existing `npm.cmd run test` + the deterministic
  guardrail eval still pass (don't regress the CI gate during migration).
- The new Promptfoo eval runs locally and produces a report (catch/FP/precision for
  safety; match-rate for correctness; split by source).
- Build → explain → STOP for review → user merges. Branch
  `feature/e10-eval-framework`. Service healthy needed only to RUN the live judge /
  capture, not to build the harness.

## 7. Open items for the build session
1. Promptfoo current config schema + Node/CLI invocation — VERIFY against its docs.
2. Exact ground-truth representation for correctness (canonical complexity string +
   accepted equivalents, so O(N·M) ≡ O(NM) ≡ "O(N), N=total chars" all pass).
3. How many captured cases to seed before the metric is meaningful (start with the
   known failures + a handful; grow over time).

## 8. Interview angle
LLM evaluation with INDUSTRY tooling (Promptfoo); LLM-as-judge with honest
bias/validation caveats; the authored-vs-captured dataset distinction (why real
captured data beats self-authored cases); CI gating a deterministic safety check
while keeping a model-dependent quality judge as a local measurement — a deliberate
"what belongs in CI vs. what doesn't" decision mirroring the earlier CD skip.
