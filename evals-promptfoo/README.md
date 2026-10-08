# LeetSage — Promptfoo eval suite (E10)

> **What this is:** the Promptfoo-based evaluation layer that MEASURES two things
> the deterministic CI gate can't: a real (non-mock) **LLM-as-judge** and a
> **correctness** dataset built from REAL captured responses. See the spec at
> `.kiro/specs/leetsage-e10-eval-framework/design.md`.

## The two-layer eval story (why there are two separate things)

LeetSage has **two** evals on purpose, and they live in different places by design:

| | Deterministic guardrail eval | Promptfoo eval (this folder) |
|---|---|---|
| Lives in | `src/evals/` (Vitest) | `evals-promptfoo/` |
| Runs in CI? | **Yes — the release gate** | **No — local/on-demand only** |
| Needs an API key? | No (fully offline) | Yes for the judge (your own Gemini key) |
| Measures | Does the solution-filter catch leaks? (catch/FP/precision) | Semantic safety (judge) + **correctness** of complexity vs ground truth |
| Data | labeled, author + a few captured | captured responses (safety mirror + correctness) |

The deterministic filter eval stays the **CI gate** — fast, offline, blocks a
merge that weakens the "never hand over the solution" promise. Promptfoo is the
**measurement** layer: a model-dependent judge and a correctness check that are
too flaky / key-dependent to gate CI, so they run locally when you want a read on
quality. This mirrors the earlier deliberate "CD skip" call: a conscious decision
about *what belongs in CI vs. what doesn't*, driven by the no-shipped-key posture.

## Running it

The judge + correctness checks call a live model, so they need YOUR Gemini key
(BYOK — never a shipped/CI key):

Provide your key one of two ways (BYOK — never a shipped/CI key):

```powershell
# Preferred: a gitignored .env at the project root (Promptfoo auto-loads it).
#   GEMINI_API_KEY=<your-key>
# — or — per-shell:
$env:GEMINI_API_KEY = "<your-key>"

# Full run: safety + correctness WITH the live LLM-as-judge. Needs a key.
npm.cmd run eval:promptfoo

# Deterministic-only: no key, no live model calls. The solution-filter mirror
# (safety) + the notation-equivalence check (correctness) — the same signal the
# Vitest CI gate enforces, surfaced through Promptfoo for a quick offline read.
npm.cmd run eval:promptfoo:offline
```

### Why two configs (live vs offline), not one env toggle

The offline/live split uses **two config files**, not a runtime env flag — a
deliberate choice learned the hard way:

- Promptfoo loads `file://` test modules (our `datasets/*.ts`) in a **sandbox that
  does not inherit the shell `process.env`**, and it **caches generated test
  cases**. So "read `GEMINI_API_KEY` at dataset-load time to decide whether to
  emit the judge" is unreliable — the generators can't see the key, and a stale
  cached result sticks.
- An always-emitted judge is no good either: the **offline config has no grader
  provider**, so a judge assertion there would hang/retry instead of failing fast.

The robust fix: the dataset builders take an `includeJudge` boolean PARAMETER, and
two thin entry files pass it — `*.ts` (live, judge on) vs `*.offline.ts` (judge
off). Each config references the matching entry. `.env` still feeds the *grader*
(that part of Promptfoo does read it); the two-config split only governs whether a
judge assertion is emitted at all.

## Layout

- `promptfooconfig.yaml` — LIVE config: safety + correctness, with the judge
  grader (Gemini via the OpenAI-compatible endpoint) under
  `defaultTest.options.provider`.
- `promptfooconfig.offline.yaml` — OFFLINE config: no grader, deterministic only.
- `datasets/safety-cases.ts` — the SAFETY test cases, generated from the single
  source of truth (`src/evals/fixtures/guardrail-cases.ts`) so the two evals can
  never drift. Preserves the `source` (authored/captured) + leak-type tags.
  `buildSafetyCases(includeJudge)` is the shared builder.
- `datasets/safety-cases.offline.ts` — thin entry: `buildSafetyCases(false)`.
- `datasets/correctness-cases.ts` — the CORRECTNESS dataset: REAL captured cases
  (problem + code + what the extension reported + ground-truth complexity).
  `buildCorrectnessCases(includeJudge)` is the shared builder.
- `datasets/correctness-cases.offline.ts` — thin entry: `buildCorrectnessCases(false)`.
- `assertions/solution-filter-assert.ts` — a thin bridge so Promptfoo's safety
  report runs the REAL `filterResponse` (no re-implementation = no drift).
- `assertions/complexity-match-assert.ts` — the deterministic notation-equivalence
  check for correctness (O(N·M) ≡ O(N*M) ≡ O(NM) ≡ …).
- `report/summarize.mjs` — reads Promptfoo's JSON output and prints the metrics
  SPLIT BY SOURCE (authored vs captured), so the flattering authored number never
  masquerades as real recall. Plain Node ESM (no TypeScript, no Promptfoo import)
  so it runs with a bare `node` after the eval.

## Dependency security (why `npm audit` still reports findings)

Adding Promptfoo pulled in a large dev-only dependency tree. We ran a **safe,
non-breaking `npm audit fix`** when it landed, which cleared the critical finding
(`tar`) and the shared dev-toolchain highs (`undici`, `js-yaml`, `vite`, `rollup`,
`postcss`, …) — those were largely pre-existing in the build/lint toolchain, not
introduced by Promptfoo.

**7 high-severity findings deliberately remain**, all in two Promptfoo-only
chains:

- `basic-ftp` → `get-uri` → `pac-proxy-agent` → `proxy-agent` → `promptfoo`
- `node-forge` → `jks-js` → `promptfoo`

These live in Promptfoo's **proxy and Java-keystore** code paths, which this eval
never exercises (no proxy, no JKS — just the echo provider + a Gemini grader).
Clearing them requires `npm audit fix --force`, which **downgrades Promptfoo to
0.116.7 — a breaking change** that would invalidate the 0.124 config/API this
suite is written against. So we accept them, on this reasoning:

- Promptfoo is a **dev dependency**: it is never imported by `src/`, never in the
  shipped `dist/` bundle, and never runs in CI. The extension's runtime deps are
  just `react` + `react-dom`.
- The exploit vectors are DoS / path-traversal-on-extraction classes that require
  feeding **hostile input to a local tool** that only ever processes this repo and
  your own pasted eval text.

Re-check anytime with `npm.cmd audit`. If a future Promptfoo release resolves the
proxy/JKS chains without a breaking downgrade, bump the pin and re-run `audit`.

## Honesty caveats (read before quoting any number)

- The **judge is model-dependent and unvalidated** against a human-labeled judge
  set — treat its verdicts as a signal, not truth. Known biases: position,
  verbosity, self-preference (the judge here is a Gemini model grading a Gemini
  model → self-preference risk is real).
- **Correctness ground truth is human-labeled** (by the user, confirming proposed
  labels). It's only as good as the labeling.
- The safety set is still **mostly authored**; the split-by-source report
  (`report/summarize.mjs`) exists precisely so the captured recall is visible
  separately.

- The **judge is model-dependent and unvalidated** against a human-labeled judge
  set — treat its verdicts as a signal, not truth. Known biases: position,
  verbosity, self-preference (the judge here is a Gemini model grading a Gemini
  model → self-preference risk is real).
- **Correctness ground truth is human-labeled** (by the user, confirming proposed
  labels). It's only as good as the labeling.
- The safety set is still **mostly authored**; the `--split-by-source` report
  exists precisely so the captured recall is visible separately.
