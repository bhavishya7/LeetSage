# 00 — Context Transfer

> **Purpose of this folder.** An evidence-grounded compilation of the developer's
> work on **LeetSage**, written so a *different* session or reader with **no access
> to this repo** can write resume bullets, prep for interviews, and answer "have you
> used X?" honestly. Every non-obvious claim in these files cites a real file,
> commit, or config key in the repo. This is a **distinct, more rigorous artifact**
> from the narrative docs under `docs/career/` — it does not copy them.

## How to read these files (reading order)

1. **00-CONTEXT-TRANSFER.md** (this file) — orientation: what LeetSage is, the exact
   stack, and how it was built (agentic engineering + the human's role).
2. **01-compilation.md** — the source of truth. Every capability, organized by
   concern, with what it does, why it was non-trivial, the engineering decision, and
   a citation. Shipped vs. planned is labeled per item.
3. **02-resume-bullets.md** — candidate bullets by JD angle, with length variants, an
   evidence table per bullet, and an explicit "do not claim" list.
4. **03-interview-prep.md** — the verbal version: deeper explanations, likely
   follow-ups two levels down, the BYOK/no-backend answer, the agentic-workflow
   story, and honest weak spots.
5. **04-tech-inventory.md** — every technology tiered T1–T4 by the developer's actual
   depth. This gates the skills line and any "have you used X?" answer.

## Evidence conventions used throughout

- **Citation format.** `path/to/file.ts` → `symbolName`, or a commit hash, or a
  config key. Line numbers are given only where they were directly observed.
- **`[SHIPPED]` / `[PLANNED]`** tags separate what runs in the working code from what
  exists only as a spec, stub, or roadmap item.
- **`[UNVERIFIED]`** marks anything not confirmable in-repo — treated as not-a-fact.
- **`[DOC DRIFT]`** flags a place where an existing narrative doc disagrees with the
  shipped code (the code is treated as truth).
- **No invented metrics.** The only measured numbers are the test suite
  (134 tests / 10 files, verified by running `npm run test`) and the guardrail eval's
  scores on its own labeled dataset. There are **no** usage, latency, cost, star, or
  user numbers in the repo — "no measured figure" is stated wherever one would be
  expected.

## What LeetSage is (one paragraph, for a non-user)

LeetSage is a **Chrome extension (Manifest V3)** that acts as an **AI learning coach
for LeetCode**. It opens a side panel next to a problem and offers on-demand coaching
— progressive hints, a problem breakdown, pre-submission analysis of the user's own
code, a deep "why the optimal solution works" explanation, and a saveable study-note
report — all grounded in the specific problem on screen. Its defining constraint is
that **it teaches without handing over the full solution**; that rule is enforced by
both prompt instructions and a deterministic post-generation filter. It is **free and
bring-your-own-key** (each user supplies their own Google Gemini API key, stored
locally) and has **no backend** — everything runs client-side in the browser.

## Exact stack (from `package.json`, with the decision behind each)

Runtime dependencies are intentionally minimal — just React. Everything else is
build/dev tooling. Versions below are the declared ranges in `package.json`.

| Technology | Version (declared) | Role / why it's here |
|---|---|---|
| **React** | `^19.1.1` | The side-panel UI. The only runtime dependency besides `react-dom`. |
| **react-dom** | `^19.1.1` | DOM renderer for the panel. |
| **TypeScript** | `~5.8.3` | Whole codebase is TS; types are load-bearing (discriminated unions for messages/actions, structured-output contracts). |
| **Vite** | `^7.1.2` | Build tool + dev server. Build is `tsc -b && vite build`. |
| **@vitejs/plugin-react** | `^5.0.0` | React support in Vite. |
| **@crxjs/vite-plugin** | `^2.0.0-beta.33` | MV3 Chrome-extension build integration for Vite. (Note: a **beta** dependency.) |
| **Tailwind CSS** | `^4.1.12` (+ `@tailwindcss/vite`, `postcss`, `autoprefixer`) | Styling for the panel UI. |
| **@types/chrome** | `^0.1.4` | Types for the `chrome.*` extension APIs used across all three contexts. |
| **Vitest** | `^5.0.1` | Test runner (the project's first). Config in `vitest.config.ts`. Scripts: `test`, `test:watch`, `eval`. |
| **ESLint** (`eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`) | `^9.33.x` / `^8.39.1` | Linting; part of the CI gate. Config in `eslint.config.js`. |
| **Husky** | `^9.1.7` | Git pre-commit hook (`prepare: husky`). Runs lint + test + build locally. |

**Provider (not an npm dependency — called over HTTP):** Google **Gemini** via its
**OpenAI-compatible endpoint** (`https://generativelanguage.googleapis.com/v1beta/openai`,
in `src/services/llm-service.ts`). Models: **`gemini-3.5-flash-lite`** (default) and
**`gemini-3.5-flash`** (`src/types/api.ts` → `GeminiModel`). BYOK: the key is sent as
`Authorization: Bearer <key>` from the browser directly to Google.

**Platform:** Chrome Extension **Manifest V3** (`public/manifest.json`) — a service
worker (`"type": "module"`), a content script matched to `https://leetcode.com/problems/*`,
and a side panel.

## "This was built via agentic engineering" — what that means here, precisely

LeetSage was built inside **Kiro** (an agentic IDE) using a **spec-driven workflow**.
The human engineer's role was **specifying, decomposing, directing, reviewing,
correcting, and integrating** — not passively accepting generated code. The claim is
not "an AI built it unattended"; the artifacts below show a human in the loop at every
step.

**Artifacts that prove the workflow (all in-repo):**

- **Specs** — `.kiro/specs/` holds 8 feature specs, each with `requirements.md` /
  `design.md` / `tasks.md`, plus a `README.md` index that labels every spec
  **shipped / designed / planned / historical**. Example: the BYOK decision is
  argued in `.kiro/specs/leetsage-phase1-gemini/requirements.md` *before* any code.
- **Steering files** — `.kiro/steering/{product,tech,workflow}.md` encode standing
  project rules (product identity, stack/build gotchas, git and review conventions)
  so any fresh session starts grounded rather than re-deriving context.
- **A custom sub-agent** — `.kiro/agents/project-historian.md` is a purpose-built
  documentation agent with **deliberately constrained permissions** (read-only git;
  write access scoped to `docs/career/**`; every other write/shell action set to
  "ask"). The human designed the agent's guardrails, not just its task.
- **Architecture Decision Records** — `docs/career/DESIGN_DECISIONS.md` (ADR-001…008)
  captures the *why* and the rejected alternatives for each major choice.
- **A per-feature dev journal** — `docs/career/DEV_JOURNAL.md` logs each feature's
  what/why/what-broke/how-solved with commit hashes.
- **Commit history pattern** — `git log` shows a repeating **spec → implement →
  review** rhythm: `docs: design …` commits (e.g. `c3790ea`, `7104be0`) precede
  `feat: …` implementation commits (`affc683`, `798228b`), followed by `docs: record
  …` commits (`a3ff192`, `dfd4e74`), all merged through PRs (#5–#12) off feature
  branches rather than committed straight to `main`.

**Where the human's judgment is most visible (verifiable in the journal + code):**

- **Overrode the agent on a filter fix.** When the guardrail eval scored 62.5% catch
  rate, the human chose to *fix the filter* (harden it) rather than accept the number
  — and directed a careful fix ("proceed with path 1 carefully"). Result: the
  hardened `src/services/solution-filter.ts` (see `looksLikeCompleteBraceFunction`,
  and the removed line-count gate). (`DEV_JOURNAL.md`, 2026-09-15; commit `0031cb9`.)
- **Rejected rubber-stamp tests.** A `session-digest` test that failed was *not*
  rewritten to match the code; the human confirmed the intended contract and fixed
  the test to assert it. (`DEV_JOURNAL.md`, 2026-09-15.)
- **Made the "no backend" call and defended it** as an ADR with rejected alternatives
  (`DESIGN_DECISIONS.md` ADR-003), not a default.
- **Diagnosed root causes over symptoms** — e.g. the stale-closure React bug found by
  inspecting `chrome.storage`, not by trusting a green build (`learningContentRef` in
  `src/sidepanel/App.tsx`; `DEV_JOURNAL.md` 2026-09-03).

See **03-interview-prep.md** for the full narrated version of these.
