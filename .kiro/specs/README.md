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

## Spec-document completeness

Rigor is scaled to the feature (see `.kiro/steering/workflow.md` → "Spec
discipline"): substantial features get the full **requirements + design + tasks**
trilogy; small/well-understood changes may be **design-only** with the reason
stated in the doc. Current state:

- **Full trilogy** (requirements + design + tasks): `leetsage-structured-output`,
  `leetsage-progress-tracking` — the two flagships (requirements + tasks
  **backfilled 2026-09-21** from the shipped code to complete the record).
- **Design-only (documented as such):** `leetsage-prompt-injection`,
  `leetsage-metrics` — small, well-scoped; each design.md states requirements/tasks
  were folded in given the narrow scope.
- **Vision/requirements-style:** the `📝 Planned` specs below (design/tasks come
  when they're built).

## The specs

| Spec | Status | What it is |
|---|---|---|
| [`leetsage-phase1-gemini`](./leetsage-phase1-gemini/) | ✅ **Shipped** | The authoritative built state: Gemini (BYOK, OpenAI-compatible endpoint, `gemini-3.5-*`), chat-hybrid UI, free-tier guardrails, dark/light theme, MV3 fixes. This is the spec that describes what actually runs. |
| [`leetsage-progress-tracking`](./leetsage-progress-tracking/) | ✅ Phase A–C / 📐 Phase D | Study-notes & progress tracking. **Phases A–C shipped** — Phase A (the "Generate report" action + copy button), then **Phase B/C built 2026-09-04** (merged to main via PR #11): persistent per-problem `ProblemRecord`s (`record_{slug}` + a light `progress_index`, schema-migrated on read), a full-panel "My Progress" view (list → detail with attempts timeline, copy/delete, "Copy all"), and a deterministic cross-problem analytics pass ("weakest link" / revisit list, insights gated behind ≥3 problems + a confidence badge). `GENERATE_REPORT` became a structured producer so records populate reliably. **Phase D designed, not built** — auto-save on an Accepted submission (so an attempt's `outcome: 'solved'` is *verified*, not inferred; the attempt count is deferred from the UI until then). |
| [`leetsage-structured-output`](./leetsage-structured-output/) | ✅ **Shipped** | A hybrid prose + structured `data` response so the report, records, analytics, and evals consume one machine-readable contract instead of re-parsing prose. **Shipped 2026-09-03** for the 2 report-feeding actions (`CHECK_APPROACH`, `UNDERSTAND_SOLUTION`); the report now consumes a deterministic session digest built from it. Caveats: only those 2 actions are structured; prose↔data consistency is a prompt instruction, not enforced. (The parser now has unit tests as of 2026-09-15 — the prose-only fallback is observed against malformed/partial/non-object JSON, not just code-read.) Unblocks progress-tracking Phase B. |
| [`leetsage-prompt-injection`](./leetsage-prompt-injection/) | ✅ **Built** (on branch) | Prompt-injection hardening (OWASP LLM #1): untrusted LeetCode problem text + editor code are now fenced as DATA via a `wrapUntrusted()` choke point in `prompts.ts` (all 9 actions + the free-form `userQuery` path), with the guardrail **reasserted after** the untrusted block; the deterministic output solution-filter stays the hard backstop (defense-in-depth). **Built 2026-09-21** on branch `feature/prompt-injection-hardening` (commit `667b473`) — tested both sides (`prompts.test.ts` pins the framing; new `injection-leak` eval cases prove the filter still catches a *successful* injection), `npm.cmd run test` 134 → 149, build clean. **Not yet merged to main.** A blocklist input scanner was considered and deliberately rejected; an LLM-as-judge semantic output check (scaffold in `src/evals/llm-judge.ts`) is the named-but-unbuilt next step. Design doc: the spec's [`design.md`](./leetsage-prompt-injection/design.md). |
| [`leetsage-metrics`](./leetsage-metrics/) | ✅ **Built** (on branch) | Runtime metrics instrumentation: per-request **latency / tokens / est. cost** captured fully client-side (no backend), aggregated by pure unit-tested p50/p95 math over a bounded 200-sample rolling window + lifetime aggregates, surfaced in a read-only "Session stats" readout in the settings modal. **Built 2026-09-23** on branch `feature/metrics` (`6012265` + `f980103`) — **design-only spec** (requirements/tasks folded in; scope mirrors the existing usage-counter pattern). Key discovery: the streaming path never captured tokens, fixed via `stream_options.include_usage` + an `onUsage` callback (verified the Gemini endpoint honors it; honest `tokensCaptured:false` fallback otherwise). Self-run numbers: p50 1579 ms / p95 2982 ms, 1459 avg tokens/request, ~$0.000252/request over 9 requests (self-collected, single model — an estimate, not a bill). `npm.cmd run test` 149 → 167. **Not yet pushed / merged.** |
| [`leetsage-guardrail-hardening`](./leetsage-guardrail-hardening/) | ✅ **Built** (on branch, local) | Pre-launch guardrail/UX hardening + a standing **bug registry** (every fix must add a test/eval that would have caught it). Fixes six real bugs found in use, defers two: **B1** — flagged content was visible token-by-token *before* the filter ran, so a leak was briefly readable; now a **pre-display gate** withholds non-exempt streams behind an animated "thinking" placeholder and reveals only after `filterResponse` (exempt actions still stream live). **B2** — free-form chat reused `EXPLAIN_CONCEPT`, forcing an irrelevant real-world analogy; now a dedicated `getChatSystemPrompt()` answers directly (keeps the guardrail + output rules + `wrapUntrusted`). **B3** — a compact *folded-conditional* pseudocode (a whole binary search) slipped past `looksLikeFullPseudocode`; the heuristic now also catches loop + ≥2 pointer/bound-update + terminator procedures, tuned against the labeled eval (85.7% → 100% catch, FP 0%). Then exercising the shipped B1 build surfaced more: **B4** — chat was blind to the editor code (`handleChatSubmit` never sent it); now code-aware via `buildChatData`, but **stays NON-EXEMPT/filtered** (free text isn't a fixed-intent button). **B5** — heavy non-exempt actions felt frozen behind the B1 gate; `ThinkingIndicator` now shows an elapsed-seconds counter after a 3s grace (perceived-perf only). **B7** — the complexity badge split on nested parens (`O(log(M) + log(N))`); a pure balanced-paren parser (`complexity-parse.ts`) renders it as one badge. **Deferred (documented, not built):** **B6** chat intent-routing (its own future spec `leetsage-chat-intent-routing`) and **B8** optimality-equivalence crediting (fuzzy model-reasoning). **On branch `feature/guardrail-hardening`** (off spec `0edfd69`), 8 commits, each bug backed by a guard, `npm.cmd run test` 167 → **205**, build clean. **Local — not pushed, no PR.** Full trilogy: [`requirements.md`](./leetsage-guardrail-hardening/requirements.md) · [`design.md`](./leetsage-guardrail-hardening/design.md) · [`tasks.md`](./leetsage-guardrail-hardening/tasks.md). |
| [`leetsage-action-streamlining`](./leetsage-action-streamlining/) | ✅ **Built** (on branch) | Pre-launch UI/UX curation: the quick-action bar drops from **9 actions (4 PRIMARY + 5 behind a "More ▾" overflow) to 4 flat, always-visible chips** — 💡 Hint (`GET_HINT`), 🔬 Analyze my code (`CHECK_APPROACH`), 🧠 Understand solution (`UNDERSTAND_SOLUTION`), 📝 Generate report (`GENERATE_REPORT`). The `SECONDARY` array, `showMore` state, and the "More ▾/Less ▴" toggle are removed entirely; the five niche actions (`BREAK_DOWN_PROBLEM`, `GENERATE_EXAMPLES`, `EXPLAIN_CONCEPT`, `TIME_COMPLEXITY_HINT`, `PATTERN_RECOGNITION`) are **dereferenced from the UI but their capabilities are KEPT** (the `ActionType` values, prompts/`buildUserMessage` cases, and the generic `handleActionClick` path all stay) so the upcoming **`chat-intent-routing`** spec can dispatch to them. UI/UX + wiring only — no filter/guardrail/streaming/routing changes. Full trilogy: [`requirements.md`](./leetsage-action-streamlining/requirements.md) · [`design.md`](./leetsage-action-streamlining/design.md) · [`tasks.md`](./leetsage-action-streamlining/tasks.md). |
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
- **Runtime metrics — built 2026-09-23** (`leetsage-metrics`, branch
  `feature/metrics`, `6012265` + `f980103`; **not yet pushed**): per-request
  latency/tokens/cost captured fully client-side, aggregated by pure unit-tested
  p50/p95 math over a bounded rolling window + lifetime aggregates, surfaced in a
  read-only "Session stats" readout. Closed the "quantified impact" gap (self-run:
  p50 1579 ms / p95 2982 ms, 1459 avg tokens/request, ~$0.000252/request over 9
  requests). `npm.cmd run test` 149 → 167. See
  [`../../docs/career/DEV_JOURNAL.md`](../../docs/career/DEV_JOURNAL.md) (2026-09-23).
- **Guardrail hardening — built 2026-09-24** (`leetsage-guardrail-hardening`,
  branch `feature/guardrail-hardening`, 8 commits `c56d506`…`f6d2a5a` off spec
  `0edfd69`; **local — not pushed, no PR**): six real bugs fixed, two deferred,
  each fix guarded. **B1** pre-display gate — non-exempt actions no longer paint
  raw tokens before the filter runs (an animated "thinking" placeholder holds until
  the filtered reveal); exempt actions still stream live. **B2** dedicated
  direct-answer chat prompt (no forced analogy) replacing the reused
  `EXPLAIN_CONCEPT` on the `userQuery` path. **B3** closed the compact
  folded-conditional pseudocode blind spot in `looksLikeFullPseudocode`, tuned
  against the labeled eval (85.7% → 100% catch, FP 0%). **B4** made chat code-aware
  (`buildChatData`) while keeping it NON-EXEMPT/filtered. **B5** an elapsed-seconds
  counter so the B1 gate doesn't feel frozen on heavy actions (perceived-perf only).
  **B7** a balanced-paren parser (`complexity-parse.ts`) so nested-paren complexity
  renders as one badge. **B6** (chat intent-routing) and **B8** (optimality-
  equivalence crediting) are documented deferrals, not built. B4/B5/B7 were surfaced
  by *exercising* the shipped B1 build — the visual-review gate doing its job.
  Establishes a standing bug registry (each entry bound to an automated guard).
  `npm.cmd run test` 167 → **205**, build clean. See
  [`../../docs/career/DEV_JOURNAL.md`](../../docs/career/DEV_JOURNAL.md) (2026-09-24).
- **Action streamlining — built 2026-09-25** (`leetsage-action-streamlining`,
  branch `feature/action-streamlining`, off main `dcababa`): the quick-action bar
  went from 9 actions (4 PRIMARY + 5 behind a "More ▾" overflow) to **4 flat,
  always-visible chips** (Hint / Analyze my code / Understand solution / Generate
  report). The `SECONDARY` array, `showMore` state, and the More/Less toggle were
  removed from `QuickActions.tsx`; the five cut actions were **dereferenced from
  the UI but kept in code** (action types, prompts, `handleActionClick`) so
  `chat-intent-routing` can dispatch to them. UI/UX + wiring only — no
  filter/guardrail/streaming/routing changes. Sole-user evidence: the five cut
  actions were never used. Sets up `chat-intent-routing`, which will re-reference
  the kept actions and own discovery affordances.
- **Next to build:** **B6 chat intent-routing** as its own spec
  (`leetsage-chat-intent-routing`, context-transfer already handed off), the
  deferred eval follow-up (real captured responses + a validated LLM-as-judge — the
  injection work names this as its next step too), then progress-tracking Phase D
  (verified submissions) and export-to-file.
- **Don't trust for current state:** `ai-learning-assistant` (historical).

*Keep this index current when a spec changes status — it's the fastest way for a
new session to orient. The project-historian agent
([`../agents/project-historian.md`](../agents/project-historian.md)) can update it
along with the other docs.*
