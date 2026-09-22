# LeetSage Specs — Index & Status

> Start here to understand what each spec is and whether it's **shipped**,
> **designed**, **planned**, or **historical**. Specs are the requirements /
> design / tasks documents that drive each feature. This index exists so a fresh
> session (or you, after time away) can see the state of the project at a glance
> without opening every folder.
>
> For the *code-level* picture see [`../../docs/leetsage-learning-guide.md`](../../docs/leetsage-learning-guide.md);
> for the *why* behind decisions see [`../../docs/career/DESIGN_DECISIONS.md`](../../docs/career/DESIGN_DECISIONS.md);
> for the chronological build story see [`../../docs/career/DEV_JOURNAL.md`](../../docs/career/DEV_JOURNAL.md);
> for what's next see [`../../docs/career/LEARNING_ROADMAP.md`](../../docs/career/LEARNING_ROADMAP.md).

## Status legend

- ✅ **Shipped** — built and merged; live in the extension.
- 📐 **Designed** — design captured, not yet built; ready to implement.
- 📝 **Planned** — idea/requirements captured; not yet designed in depth.
- 🗄️ **Historical** — superseded; kept for context, not authoritative.

## The specs

| Spec | Status | What it is |
|---|---|---|
| [`leetsage-phase1-gemini`](./leetsage-phase1-gemini/) | ✅ **Shipped** | The authoritative built state: Gemini (BYOK, OpenAI-compatible endpoint, `gemini-3.5-*`), chat-hybrid UI, free-tier guardrails, dark/light theme, MV3 fixes. This is the spec that describes what actually runs. |
| [`leetsage-progress-tracking`](./leetsage-progress-tracking/) | ✅ Phase A–C / 📐 Phase D | Study-notes & progress tracking. **Phases A–C shipped** — Phase A (the "Generate report" action + copy button), then **Phase B/C built 2026-09-04** (merged to main via PR #11): persistent per-problem `ProblemRecord`s (`record_{slug}` + a light `progress_index`, schema-migrated on read), a full-panel "My Progress" view (list → detail with attempts timeline, copy/delete, "Copy all"), and a deterministic cross-problem analytics pass ("weakest link" / revisit list, insights gated behind ≥3 problems + a confidence badge). `GENERATE_REPORT` became a structured producer so records populate reliably. **Phase D designed, not built** — auto-save on an Accepted submission (so an attempt's `outcome: 'solved'` is *verified*, not inferred; the attempt count is deferred from the UI until then). |
| [`leetsage-structured-output`](./leetsage-structured-output/) | ✅ **Shipped** | A hybrid prose + structured `data` response so the report, records, analytics, and evals consume one machine-readable contract instead of re-parsing prose. **Shipped 2026-09-03** for the 2 report-feeding actions (`CHECK_APPROACH`, `UNDERSTAND_SOLUTION`); the report now consumes a deterministic session digest built from it. Caveats: only those 2 actions are structured; prose↔data consistency is a prompt instruction, not enforced. (The parser now has unit tests as of 2026-09-15 — the prose-only fallback is observed against malformed/partial/non-object JSON, not just code-read.) Unblocks progress-tracking Phase B. |
| [`leetsage-prompt-injection`](./leetsage-prompt-injection/) | ✅ **Built** (on branch) | Prompt-injection hardening (OWASP LLM #1): untrusted LeetCode problem text + editor code are now fenced as DATA via a `wrapUntrusted()` choke point in `prompts.ts` (all 9 actions + the free-form `userQuery` path), with the guardrail **reasserted after** the untrusted block; the deterministic output solution-filter stays the hard backstop (defense-in-depth). **Built 2026-09-21** on branch `feature/prompt-injection-hardening` (commit `667b473`) — tested both sides (`prompts.test.ts` pins the framing; new `injection-leak` eval cases prove the filter still catches a *successful* injection), `npm.cmd run test` 134 → 149, build clean. **Not yet merged to main.** A blocklist input scanner was considered and deliberately rejected; an LLM-as-judge semantic output check (scaffold in `src/evals/llm-judge.ts`) is the named-but-unbuilt next step. Design doc: the spec's [`design.md`](./leetsage-prompt-injection/design.md). |
| [`leetsage-cheatsheet`](./leetsage-cheatsheet/) | 📝 **Planned** | Static, zero-token language cheatsheets (Python/Java/C++) + Big-O chart, stored in the extension. Candidate for a lightweight local RAG later. |
| [`leetsage-pseudocode-mode`](./leetsage-pseudocode-mode/) | 📝 **Planned** | A lightweight "plan your approach" playground with limited, token-conscious feedback. |
| [`leetsage-phase2-struggle-first`](./leetsage-phase2-struggle-first/) | 📝 **Planned** | Deeper hints unlock only after the user explains their reasoning — the coaching-identity gate. |
| [`leetsage-phase3-analytics`](./leetsage-phase3-analytics/) | 📝 **Planned** | Learning analytics: hints used, submission outcomes, "problems to revisit." Converges with progress-tracking Phase C — build them together. |
| [`ai-learning-assistant`](./ai-learning-assistant/) | 🗄️ **Historical** | The ORIGINAL requirements/design that shaped the action-button set. Superseded (it assumes OpenAI/Anthropic providers and a standalone chat mode that never shipped that way). Kept for context only — do **not** treat its details as current. |

## Quick "what's true right now"

- **Shipped & authoritative:** `leetsage-phase1-gemini` + progress-tracking
  Phase A–C + `leetsage-structured-output`. (Progress Phase B/C — three commits —
  is merged to main via PR #11.)
- **Tests + a guardrail eval — shipped 2026-09-15, now wired into CI** (not a spec,
  but part of the authoritative built state): **Vitest** across the pure modules
  (134 tests / 10 files) plus a labeled **solution-filter eval** scored as a release
  gate. The eval caught two real solution-leak paths, now fixed — so the shipped
  `solution-filter.ts` is *hardened* vs. its earlier description (no line-count gate
  on complete functions; multi-brace-function detection; a looser pseudocode
  heuristic). As of a **2026-09-15 follow-up**, the tests+eval run **automatically**:
  a **GitHub Actions** workflow (`npm ci` → lint → test → build on every push/PR) and
  a **Husky pre-commit hook** — so a change that weakens the guardrail fails the
  build. (GitHub Actions chosen over Docker/Jenkins because there's no backend to
  containerize or host; **CD / auto-publish to the Web Store was deliberately
  skipped** — review latency + secret management → manual publish.) All on the
  `feature/evals-and-tests` branch — **pushed; CI runs green** (first run ~24s,
  10 files / 134 tests; the Node-20 action-runtime warning was cleared by pinning
  `checkout`/`setup-node` to the verified current major `@v7`). See
  [`../../docs/career/DEV_JOURNAL.md`](../../docs/career/DEV_JOURNAL.md) (2026-09-15
  + its follow-up).
- **Prompt-injection hardening — built 2026-09-21** (`leetsage-prompt-injection`,
  branch `feature/prompt-injection-hardening`, commit `667b473`; **not yet merged**):
  untrusted problem text + editor code are fenced as DATA via one `wrapUntrusted()`
  choke point with the guardrail reasserted after the block, paired with the existing
  deterministic output filter as the hard backstop. Tested both sides
  (`prompts.test.ts` + new `injection-leak` eval cases modelling a *successful*
  injection); `npm.cmd run test` 134 → 149. See
  [`../../docs/career/DEV_JOURNAL.md`](../../docs/career/DEV_JOURNAL.md) (2026-09-21)
  and DESIGN_DECISIONS ADR-004 (2026-09-21 update).
- **Next to build:** runtime metrics (latency/tokens/cost — the last "quantified
  impact" gap), then the deferred eval follow-up (real captured responses + a
  validated LLM-as-judge — the injection work names this as its next step too), then
  progress-tracking Phase D (verified submissions) and export-to-file.
- **Don't trust for current state:** `ai-learning-assistant` (historical).

*Keep this index current when a spec changes status — it's the fastest way for a
new session to orient. The project-historian agent
([`../agents/project-historian.md`](../agents/project-historian.md)) can update it
along with the other docs.*
