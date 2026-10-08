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
| [`leetsage-prompt-injection`](./leetsage-prompt-injection/) | ✅ **Shipped** | Prompt-injection hardening (OWASP LLM #1): untrusted LeetCode problem text + editor code are now fenced as DATA via a `wrapUntrusted()` choke point in `prompts.ts` (all 9 actions + the free-form `userQuery` path), with the guardrail **reasserted after** the untrusted block; the deterministic output solution-filter stays the hard backstop (defense-in-depth). **Built 2026-09-21** on branch `feature/prompt-injection-hardening` (commit `667b473`) — tested both sides (`prompts.test.ts` pins the framing; new `injection-leak` eval cases prove the filter still catches a *successful* injection), `npm.cmd run test` 134 → 149, build clean. **Merged to main.** A blocklist input scanner was considered and deliberately rejected; an LLM-as-judge semantic output check (scaffold in `src/evals/llm-judge.ts`) is the named-but-unbuilt next step. Design doc: the spec's [`design.md`](./leetsage-prompt-injection/design.md). |
| [`leetsage-metrics`](./leetsage-metrics/) | ✅ **Shipped** | Runtime metrics instrumentation: per-request **latency / tokens / est. cost** captured fully client-side (no backend), aggregated by pure unit-tested p50/p95 math over a bounded 200-sample rolling window + lifetime aggregates, surfaced in a read-only "Session stats" readout in the settings modal. **Built 2026-09-23** on branch `feature/metrics` (`6012265` + `f980103`) — **design-only spec** (requirements/tasks folded in; scope mirrors the existing usage-counter pattern). Key discovery: the streaming path never captured tokens, fixed via `stream_options.include_usage` + an `onUsage` callback (verified the Gemini endpoint honors it; honest `tokensCaptured:false` fallback otherwise). Self-run numbers: p50 1579 ms / p95 2982 ms, 1459 avg tokens/request, ~$0.000252/request over 9 requests (self-collected, single model — an estimate, not a bill). `npm.cmd run test` 149 → 167. **Merged to main.** |
| [`leetsage-guardrail-hardening`](./leetsage-guardrail-hardening/) | ✅ **Shipped** | Pre-launch guardrail/UX hardening + a standing **bug registry** (every fix must add a test/eval that would have caught it). Fixes six real bugs found in use, defers two: **B1** — flagged content was visible token-by-token *before* the filter ran, so a leak was briefly readable; now a **pre-display gate** withholds non-exempt streams behind an animated "thinking" placeholder and reveals only after `filterResponse` (exempt actions still stream live). **B2** — free-form chat reused `EXPLAIN_CONCEPT`, forcing an irrelevant real-world analogy; now a dedicated `getChatSystemPrompt()` answers directly (keeps the guardrail + output rules + `wrapUntrusted`). **B3** — a compact *folded-conditional* pseudocode (a whole binary search) slipped past `looksLikeFullPseudocode`; the heuristic now also catches loop + ≥2 pointer/bound-update + terminator procedures, tuned against the labeled eval (85.7% → 100% catch, FP 0%). Then exercising the shipped B1 build surfaced more: **B4** — chat was blind to the editor code (`handleChatSubmit` never sent it); now code-aware via `buildChatData`, but **stays NON-EXEMPT/filtered** (free text isn't a fixed-intent button). **B5** — heavy non-exempt actions felt frozen behind the B1 gate; `ThinkingIndicator` now shows an elapsed-seconds counter after a 3s grace (perceived-perf only). **B7** — the complexity badge split on nested parens (`O(log(M) + log(N))`); a pure balanced-paren parser (`complexity-parse.ts`) renders it as one badge. **Deferred (documented, not built):** **B6** chat intent-routing (its own future spec `leetsage-chat-intent-routing`) and **B8** optimality-equivalence crediting (fuzzy model-reasoning). **On branch `feature/guardrail-hardening`** (off spec `0edfd69`), 8 commits, each bug backed by a guard, `npm.cmd run test` 167 → **205**, build clean. **Merged to main.** Full trilogy: [`requirements.md`](./leetsage-guardrail-hardening/requirements.md) · [`design.md`](./leetsage-guardrail-hardening/design.md) · [`tasks.md`](./leetsage-guardrail-hardening/tasks.md). |
| [`leetsage-action-streamlining`](./leetsage-action-streamlining/) | ✅ **Shipped** | Pre-launch UI/UX curation: the quick-action bar drops from **9 actions (4 PRIMARY + 5 behind a "More ▾" overflow) to 4 flat, always-visible chips** — 💡 Hint (`GET_HINT`), 🔬 Analyze my code (`CHECK_APPROACH`), 🧠 Understand solution (`UNDERSTAND_SOLUTION`), 📝 Generate report (`GENERATE_REPORT`). The `SECONDARY` array, `showMore` state, and the "More ▾/Less ▴" toggle are removed entirely; the five niche actions (`BREAK_DOWN_PROBLEM`, `GENERATE_EXAMPLES`, `EXPLAIN_CONCEPT`, `TIME_COMPLEXITY_HINT`, `PATTERN_RECOGNITION`) are **dereferenced from the UI but their capabilities are KEPT** (the `ActionType` values, prompts/`buildUserMessage` cases, and the generic `handleActionClick` path all stay) so the upcoming **`chat-intent-routing`** spec can dispatch to them. UI/UX + wiring only — no filter/guardrail/streaming/routing changes. Full trilogy: [`requirements.md`](./leetsage-action-streamlining/requirements.md) · [`design.md`](./leetsage-action-streamlining/design.md) · [`tasks.md`](./leetsage-action-streamlining/tasks.md). |
| [`leetsage-progress-export-import`](./leetsage-progress-export-import/) | ✅ **Shipped** | Pre-launch progress export + import. **Export:** a combined **Markdown** study report (insights summary from `computeInsights` + full per-problem detail with the attempts timeline) and a portable **JSON** backup (versioned envelope `{format, formatVersion, schemaVersion, exportedAt, records}` — the derived `progress_index` is NOT exported, it's rebuilt on import). **Import:** a security-hardened pipeline for an untrusted file → privileged storage — governing rule **reconstruct, don't validate-in-place** (`sanitizeRecord` builds a fresh record via explicit field copy, never spread): size gate → parse → envelope gate → per-field sanitizers (slug regex, HTML-neutralized strings, enum-checked difficulty/outcome, patterns filtered to vocabulary, finite/bounded numbers, capped attempts, **recomputed** `bestAttemptIndex`) → `migrate()` → **newer-wins-per-slug merge** (idempotent) → **atomic** write + index rebuild + quota fail-closed. **Renderer verified (R5.1.2):** the app renders via React JSX (no `dangerouslySetInnerHTML`/`innerHTML`), so text is escaped by default — no live stored-XSS hole; importer sanitization is defense-in-depth. Download uses a Blob `<a download>` in the side-panel DOM (verified — no `chrome.downloads` permission needed). New pure module `src/services/progress-io.ts`; storage `writeImportedRecords` in `progress-records.ts`; Download ▾ / Import UI (title-bar + toolbar layout) in `ProgressView.tsx`. **Post-build security hardening pass** (design §4b): clearer non-JSON rejection (R5.5.4), a global attempts cap (R5.2.1), an explicit manifest CSP for extension pages (R5.6 — platform-enforced no-code-execution), and `url` validation keyed to the slug (R5.4.3 — preempts a future "open on LeetCode" link vector). **Round-trip verified against the user's real 13-problem export** — a re-import is a proven no-op (0/0/13); that round-trip also caught a real non-idempotent-escaping bug (apostrophes double-escaping), fixed by stripping only tag-forming `<`/`>` instead of HTML-escaping. Tests: functional + **security** (XSS neutralized, `__proto__` no pollution, oversized/excess/global-attempts rejected, out-of-bounds `bestAttemptIndex` recomputed, `url` rebuilt, idempotency, malformed leaves storage unchanged) — `npm.cmd run test` **246** (→ **277** after merging main). Full trilogy: [`requirements.md`](./leetsage-progress-export-import/requirements.md) · [`design.md`](./leetsage-progress-export-import/design.md) · [`tasks.md`](./leetsage-progress-export-import/tasks.md). Branch `feature/progress-export-import` (6 commits off spec `4e943c2`, main merged in `220c4d1`) — **merged to main.** |
| [`leetsage-chat-intent-routing`](./leetsage-chat-intent-routing/) | ✅ **Shipped** | The last pre-launch feature (resolves guardrail-hardening **B6**): the chat box becomes a smart entry point. A **pure `classify → resolveOverlap → route` pipeline** (`src/services/intent-router/`) sits *in front of* the existing chat path — it does NOT modify `filterResponse`, the pre-display gate, or `getChatSystemPrompt`. Intents are **data** (`INTENT_REGISTRY`: one `IntentDef` per routable intent, exemptness DERIVED from `isSolutionExemptAction`, never stored); `classify` is a **local heuristic** (zero API calls, so routing costs exactly one call — the routed action or chat, never two); `resolveOverlap` is a **three-way** decision (`route`/`ask`/`chat`) with an abstain band (precedence: context-sharpening → weight → confidence; genuine multi-intent → chat, never N calls). The guardrail: an **exempt-action match is turned into a confirm affordance** ("Did you want X? — Yes / Just answer"), never a silent route into a filter-exempt action — one reusable `ConfirmAffordance` component serves both the exempt guardrail and the borderline `ask`. Discovery (this spec owns it): a rotating placeholder + dismissible "Try asking…" chips re-surface the five actions that lost their buttons in action-streamlining. A **labeled golden set** doubles as the router's accuracy metric (incl. the explicit "solution-seeking message never silently reaches an exempt action" test). **Built on branch `feature/chat-intent-routing`** (off spec `8dae03f`); `npm.cmd run test` 205 → **236**, build clean. **Merged to main.** Full trilogy: [`requirements.md`](./leetsage-chat-intent-routing/requirements.md) · [`design.md`](./leetsage-chat-intent-routing/design.md) · [`tasks.md`](./leetsage-chat-intent-routing/tasks.md). |
| [`leetsage-chat-enhancement`](./leetsage-chat-enhancement/) | ✅ **Shipped** (merged to main via **PR #19**, `0341bcd`) | E9 — the big chat rework (resolves roadmap E1 + the agentic upgrade). Turns the chat box into a **three-tier, cost-aware agent** *in front of* the shipped intent router (which is untouched): **Tier 1** route to a pre-built action (1 request, shipped path), **Tier 2** context-aware chat with no tools (1 request), **Tier 3** a **bounded, read-only agentic tool loop** (2+ requests) that fires only when the model needs to fetch data. **Two-layer memory:** the existing zero-API `sessionDigest` (long-term "what they did") + a bounded sliding **conversation window** (last 3 chat turns, char-capped — short-term "what was just said"), both fenced as untrusted via `wrapUntrusted`. **The loop:** 3 zero-API read-only tools (`getEditorCode`/`getProblemExamples`/`getProblemConstraints` — `getComplexityOfCurrentCode` deliberately dropped: redundant with the Tier-1 `analyze-code` intent + a nested-LLM-call cost/guardrail hole), a hard **2-tool-round cap** (worst case 3 requests), **per-round `recordRequest` accounting** (one message can cost N requests, never silently — unit-tested invariant), graceful tool failures, capped tool results, and a system prompt that declares "what you already have" so it doesn't re-fetch. **Guardrails preserved end-to-end:** the loop's final answer is NON-EXEMPT → `filterResponse` + the B1 pre-display gate; tool results + both memory layers are untrusted/fenced. **Live agent-step trace** ("Reading your code…" → "Answering…") on the existing Thinking placeholder (process-only, guardrail-safe; rich trace deferred to E2). **Obscured usage indicator:** the header `X/200` becomes a draining **water-reservoir** glyph (green→amber→red "running low" cue preserved); the exact count moves to Settings. Tool-call support verified against the Gemini OpenAI-compatible endpoint. `npm.cmd run test` 277 → **329** (24 files), build clean. Full trilogy: [`requirements.md`](./leetsage-chat-enhancement/requirements.md) · [`design.md`](./leetsage-chat-enhancement/design.md) · [`tasks.md`](./leetsage-chat-enhancement/tasks.md). |
| [`leetsage-chat-polish`](./leetsage-chat-polish/) | 🧪 **Built, pending review** (on branch `feature/chat-polish`, local — NOT pushed, no PR) | E2 + E3 + E4 consolidated — a **visual/UX polish** pass on the chat surface. **Built 2026-10-05**, 4 commits `a353a70`…`71fed28` off `main`. **E2 visual polish:** a swappable **"Sage" gradient** identity via one `--sage-*` CSS token set (default sage-green → teal, one-line sage → cyan alternative), applied sparingly (header/Send/user-bubble/focus-ring/pill-tint) — with a **two-role token split** (deep `--sage-fill-*` stops where white text sits vs. light `--sage-mid`/`--sage-ring`/`--sage-tint` accents) after 3 rounds of readability review landed on white-on-darkened; kept the per-section heading palette + amber complexity badge; body-text contrast deepened (neutral-700→800 / 200→100) *instead* of bolding since Segoe UI is non-variable; entrance (fade+rise) + `:active` press feedback + a **grid-rows 1fr↔0fr** expand/collapse + a fixed streaming caret, **all `prefers-reduced-motion`-gated**; more breathing room. **E3 two routing bugs** (each guarded by `discovery-prompts.test.ts`): **B11** duplicate "Try" (dropped the `Try: ` prefix from the placeholders so the one "Try" lives on the chip row) and **B12** Try chips now **submit on tap** via `submitChat(chip)` — using a pure `resolveSubmitText(explicit, inputValue)` that prefers the explicit arg over input state to dodge a **React setState race** (`submitChat` took an optional `text?` arg). **E4 onboarding:** a `WelcomeCard` as the **single source** for both the empty-state and a re-openable header-"?" overlay (links to the verified `aistudio.google.com/app/apikey`, wording matched to `SettingsModal`). **Design-only spec** (documented deviation — small, UI-focused); explicitly NO Mermaid/idea-map/generative visual output and **no change to `filterResponse`, the B1 gate, `getChatSystemPrompt`/`getChatAgentSystemPrompt`, the router, or the loop** (presentation only). **Folded in (bonus, commit `aff3b65`, surfaced by the visual-review gate):** a typed `APIError` with a `retryable` flag + friendly per-status copy (no raw codes), transient 5xx retry on the streaming path, and a `humanizeTransportError` abort→timeout / network→connectivity mapping applied to **both** the streaming path and the agent's non-streaming `sendToolRound` — guarded by `llm-error-messages.test.ts` (the "signal is aborted" string must-not-leak case) + 503 / 503→200-recovery cases in `llm-tool-round.test.ts`. **Honesty caveat:** a successful end-to-end API call could NOT be confirmed this session (Google's free tier stayed overloaded with 503s) — the error *handling* is unit-verified, the happy-path coaching output was NOT seen live. **Deferred (design §10, not built):** a zero-token client-side "capabilities" answer (asking "what can you do?" currently spins the agentic loop; the fix needs router/prompt territory out of scope here — candidate: a local help-intent that pops the WelcomeCard). **Loose end:** the B11/B12 entries still need rows in the guardrail-hardening bug registry. `npm.cmd run test` 329 → **344** (26 files), build clean, eslint 0 (1 pre-existing `App.tsx` exhaustive-deps warning untouched). Design doc: [`design.md`](./leetsage-chat-polish/design.md). |
| [`leetsage-e6-bug-hardening`](./leetsage-e6-bug-hardening/) | 🏗️ **Open / in progress** (**batch 1 built 2026-10-06**, `034f2ce`, local — not pushed/merged) | The consolidated pre-launch **bug-hardening pass** (roadmap E6) — a STANDING spec on a long-lived branch (`feature/e6-bug-hardening`); the user merges per completed fix. **Batch 1 = the "Analyze my code" (`CHECK_APPROACH`) correctness/trust bugs**, dogfooded on LeetCode "Encode and Decode Strings": **B13 ✅** lost `N*M` formatting (markdown parser ate the `*` before the complexity renderer) — `renderInline` now honors only `**bold**`/`` `code` `` so a bare `*` in prose or inside `O(N*M)` stays literal, `O(...)` is masked before the emphasis split, and `formatComplexityInner` stops the `/n/g` over-replace (`O(min(a,b))`→`O(miN(a,b))`); **B15 ✅** incomplete/empty code capture — full Monaco model value is now the only analyzed source, DOM demoted to a liveness signal, retry/backoff, and a discriminated `{status:'ok'\|'empty'\|'failed'}` so a failed read surfaces an honest error and STOPS instead of analyzing as empty; **B14 🏗️ partial / R4 🏗️ partial** prompt example-bleed — swapped the hardcoded Two-Sum Big-O for non-answerable `O(<time>)` placeholders + "COMPUTE, DON'T COPY" + a `**Variables:**` line (no bare undefined symbols), *but* the run-to-run `O(N)`↔`O(N·M)` **instability is NOT fixed** (model-correctness → eval **E10**); **B16 🏗️ partial** (new) intra-message headline-vs-breakdown contradiction — prompt now computes bullets first, aggregates into the headline, reconciles (correctness still → E10). **The design's R3 "render the badge from structured `AnalyzeData`" was built, measured, and REVERTED** — it no-oped in the common case (prose & JSON agree), added render risk, and can't fix the drift (JSON drifts too); structured-driven badge deferred to **B10**. **Batch 2 built 2026-10-07** (`4b1af65` + `c97e78b`, same branch, local — not pushed/merged): **B10 ✅** — the cross-message optimal **drift** fix: pin ONE canonical optimal per problem in a new schema-versioned store `complexity-pin.ts` (keyed on the `/problems/{slug}/` slug), authority rule as a pure `shouldRepin()` (first authoritative emission pins; `UNDERSTAND_SOLUTION` overrides and re-pins; a later `CHECK_APPROACH`/`GENERATE_REPORT` never overwrites), fed back as a HARD prompt constraint (`pinnedOptimalConstraint()` on `CHECK_APPROACH`+`GENERATE_REPORT`, NOT `UNDERSTAND_SOLUTION`), the session digest reconciled from two conflicting optimal lines to ONE "Canonical optimal" line, cleared by "Reset this problem" (the escape hatch — no verifier exists, ADR-007). Two cost-neutral reasoning levers (hidden chain-of-thought + constraint-anchored variables) keep each action at exactly +1 request; routing to a stronger model was rejected. **Honest limit:** B10 makes the optimal STABLE + self-consistent, NOT provably correct — a wrong-but-stable optimal is still possible; correctness is **E10**'s job (stated in code, registry, docs). **B17 ✅** — the Session Stats cost caption leaked an internal file name (`metrics-pricing.ts`) and implied a bill; reworded (free tier is never charged — a 429 rejects, never bills, ADR-007) and extracted to an exported `COST_CAPTION` for test assertion. **New: B18** (registry row, NOT fixed) — a complexity follow-up about the user's own code misroutes to `TIME_COMPLEXITY_HINT` (no chat bubble + a generic card instead of an answer); a ROUTING defect (the card was correct for the action it ran), deferred to a future intent-router pass. Then **still carries B8/B9** and a later vuln-scan batch (`npm audit`, CSP, `host_permissions`, `innerHTML` re-verify, BYOK posture). Each fix adds a guarding test; registry rows live in `leetsage-guardrail-hardening/requirements.md` (B13 ✅, B15 ✅, B14/R4/B16 🏗️ partial, **B10 ✅, B17 ✅, B18 captured**). `npm.cmd run test` 387 → **413** (29 files), build clean, lint 0 (1 pre-existing `App.tsx` warning). Design doc: [`design.md`](./leetsage-e6-bug-hardening/design.md). See [`../../docs/career/DEV_JOURNAL.md`](../../docs/career/DEV_JOURNAL.md) (2026-10-06, 2026-10-07). |
| [`leetsage-e10-eval-framework`](./leetsage-e10-eval-framework/) | 🧪 **Built, pending review** (branch `feature/e10-eval-framework`, off `main`@`19db429`; local — NOT pushed, no PR) | E10 — a **Promptfoo** measurement layer (`evals-promptfoo/`, TS-native, local, no backend) added **beside** the deterministic `src/evals/` guardrail eval (which stays the CI gate, unchanged). It adds the two things that gate couldn't: a **real (non-mock) LLM-as-judge** (Gemini `gemini-3.5-flash-lite` via the same OpenAI-compatible endpoint the extension ships against) and a **CORRECTNESS dataset built from REAL CAPTURED responses**. **Built 2026-10-08** (`d563b13` deps + `242eeaf` feat, 12 files / 1306 insertions): `promptfooconfig.yaml` (live, judge grader) + `.offline.yaml` (no grader), `datasets/safety-cases{,.offline}.ts` (**generated from** the single source of truth `src/evals/fixtures/guardrail-cases.ts`), `datasets/correctness-cases{,.offline}.ts`, `assertions/solution-filter-assert.ts` (bridges the **real shipped `filterResponse`** — safety numbers match the Vitest gate *by construction*), `assertions/complexity-match-assert.ts`, `report/summarize.mjs` (metrics **split by source** so authored never masquerades as captured recall), `README.md`; npm scripts `eval:promptfoo` / `eval:promptfoo:offline`; dev dep `promptfoo` pinned **exact `0.124.0`**. **Decisions honored (ADR-010):** the judge is **local/on-demand on the user's BYOK key — key-free CI** (measurement, not a gate; confirmed `.github/`+`.husky/` reference neither promptfoo nor the key); the **echo-provider** pattern scores already-captured text (no generation); **captured, not authored** correctness data reported split-by-source; `PROMPTFOO_FAILED_TEST_EXIT_CODE=0` so a correctly-flagged miss doesn't abort the run; the offline/live split is **two config files + an `includeJudge` boolean** (an env toggle failed — Promptfoo sandboxes `file://` test modules away from `process.env` and caches test cases). **Correctness set = 1 wrong + 2 right so it discriminates:** `corr-encode-decode-strings` (reported bare `O(N)` vs ground-truth `O(N·M)` — a genuine miss → MISMATCH + judge FAIL), two Longest-Consecutive cases (hash-set + brute force, both correct → MATCH + judge PASS, user-supplied mid-session); the **B16 headline/breakdown case left a documented `ready:false` TODO** (only the shape known, not the verbatim text — don't fabricate). **Verified:** build clean; `npm.cmd run test` **413 unchanged** (CI gate not regressed, before+after the audit-fix churn); offline eval 28 cases / 0 errors / safety 100% catch · 0% FP · 100% precision + correctness 2/3; **full judged run** (live, 13,509 tokens / 1m27s) — the judge **agreed with every human label** (safety 100/0/100 over 25 non-exempt; correctness 2/3 case-for-case), validating the judge live. **Dependency security:** safe `npm audit fix` took 33 vulns (1 crit/29 high) → 7 high / 0 crit; 7 residual highs in Promptfoo-only proxy / Java-keystore chains **deliberately accepted + documented** (dev-only dep, never in `src/`/`dist/`/CI; fix needs a breaking 0.116 downgrade). `.env`/`.env.local` gitignored (verified before writing the key). **Honest limits:** E10 **measures** B14/R4/B16, it doesn't fix them; the judge is model-dependent + unvalidated against a human-labeled *judge* set (self-preference bias is real); E10 ≠ **E10b** (MCP browser testing, later). **Design-only spec** (documented). Design doc: [`design.md`](./leetsage-e10-eval-framework/design.md) + [`correctness-seed.md`](./leetsage-e10-eval-framework/correctness-seed.md). See [`../../docs/career/DEV_JOURNAL.md`](../../docs/career/DEV_JOURNAL.md) (2026-10-08) + DESIGN_DECISIONS ADR-010. |
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
  branch `feature/prompt-injection-hardening`, commit `667b473`; **merged to main**):
  untrusted problem text + editor code are fenced as DATA via one `wrapUntrusted()`
  choke point with the guardrail reasserted after the block, paired with the existing
  deterministic output filter as the hard backstop. Tested both sides
  (`prompts.test.ts` + new `injection-leak` eval cases modelling a *successful*
  injection); `npm.cmd run test` 134 → 149. See
  [`../../docs/career/DEV_JOURNAL.md`](../../docs/career/DEV_JOURNAL.md) (2026-09-21)
  and DESIGN_DECISIONS ADR-004 (2026-09-21 update).
- **Runtime metrics — built 2026-09-23** (`leetsage-metrics`, branch
  `feature/metrics`, `6012265` + `f980103`; **merged to main**): per-request
  latency/tokens/cost captured fully client-side, aggregated by pure unit-tested
  p50/p95 math over a bounded rolling window + lifetime aggregates, surfaced in a
  read-only "Session stats" readout. Closed the "quantified impact" gap (self-run:
  p50 1579 ms / p95 2982 ms, 1459 avg tokens/request, ~$0.000252/request over 9
  requests). `npm.cmd run test` 149 → 167. See
  [`../../docs/career/DEV_JOURNAL.md`](../../docs/career/DEV_JOURNAL.md) (2026-09-23).
- **Guardrail hardening — built 2026-09-24** (`leetsage-guardrail-hardening`,
  branch `feature/guardrail-hardening`, 8 commits `c56d506`…`f6d2a5a` off spec
  `0edfd69`; **merged to main**): six real bugs fixed, two deferred,
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
- **Chat intent routing — built 2026-09-26** (`leetsage-chat-intent-routing`,
  branch `feature/chat-intent-routing`, off spec `8dae03f`; **merged to
  main**): the last pre-launch feature and the resolution
  of guardrail-hardening **B6**. A pure `classify → resolveOverlap → route`
  pipeline (`src/services/intent-router/`) turns the chat box into a smart entry
  point *in front of* the untouched chat path. Data-driven `INTENT_REGISTRY`
  (exemptness derived from `isSolutionExemptAction`, never stored); local heuristic
  classifier (zero extra API calls — routing costs exactly one call); three-way
  `route`/`ask`/`chat` decision with an abstain band and deterministic precedence
  (context-sharpening → weight → confidence); genuine multi-intent falls through to
  chat (never N calls). The guardrail: an exempt-action match becomes a **confirm
  affordance**, never a silent route into a filter-exempt action — one reusable
  `ConfirmAffordance` serves both the exempt guardrail and the borderline `ask`.
  Discovery (rotating placeholder + "Try asking…" chips) re-surfaces the five
  actions that lost their buttons. A labeled golden set doubles as the router's
  accuracy metric (incl. the explicit no-silent-exempt test). `npm.cmd run test`
  205 → **236**, build clean.
- **Progress export + import — built 2026-09-27** (`leetsage-progress-export-import`,
  branch `feature/progress-export-import`, 6 commits `7f38955`…`56a3c23` off spec
  `4e943c2`, then main merged in `220c4d1`; **merged to main**): a combined
  **Markdown** study archive + a portable versioned **JSON** backup, and a
  security-hardened untrusted-file → storage **import** pipeline — governing rule
  **reconstruct, don't validate-in-place** (field-level allowlist defeating
  unknown-field injection / prototype pollution / type confusion), every derived
  field recomputed, an **idempotent newer-wins-per-slug merge**, and an atomic
  quota-fail-closed write. Hardened further with an explicit **manifest CSP**
  (platform-enforced no-code-execution) and slug-keyed **`url` validation** (preempts
  a future "open on LeetCode" link vector). Renderer verified XSS-safe (React JSX, no
  `innerHTML`) so sanitization is defense-in-depth. Round-trip verified against the
  user's real 13-problem export (re-import is a proven no-op). **Unblocks the
  scope-permissions change** (which wipes `chrome.storage` on reinstall).
  `npm.cmd run test` 236 → 246 → (post-merge) **277**, build clean. See
  [`../../docs/career/DEV_JOURNAL.md`](../../docs/career/DEV_JOURNAL.md) (2026-09-27).
- **E9 chat enhancement — merged to main via PR #19** (`0341bcd`): the three-tier
  cost-aware chat agent (bounded read-only tool loop + two-layer memory + per-round
  request accounting) is now on main.
- **Chat polish (E2+E3+E4) — built 2026-10-05, PENDING REVIEW**
  (`leetsage-chat-polish`, branch `feature/chat-polish`, 4 commits
  `a353a70`…`71fed28` off `main`; **local — NOT pushed, no PR**): a presentation-only
  pass on the chat surface — a swappable **"Sage" gradient** identity (two-role
  token split: deep fill stops under white text vs. light accent tints, after 3
  rounds of readability review), entrance/press motion + a grid-rows expand/collapse
  + a fixed streaming caret (all `prefers-reduced-motion`-gated), more breathing
  room, a re-openable `WelcomeCard` (empty-state + "?" overlay, single source), and
  two guarded routing bugs (**B11** duplicate "Try"; **B12** chips submit on tap via
  a `resolveSubmitText` helper dodging a React setState race). A folded-in bonus
  (`aff3b65`) adds friendly `APIError` copy + transient 5xx retry + abort→friendly
  mapping on both the streaming path and the agent's `sendToolRound`. **Design-only
  spec** (documented deviation). Did NOT touch `filterResponse`, the B1 gate, the
  chat prompts, the router, or the loop. **Honesty caveat:** no successful
  end-to-end API call was confirmable (Google free tier overloaded — persistent
  503s); error handling is unit-verified, happy-path output not seen live.
  **Deferred (design §10):** a zero-token client-side "capabilities" answer.
  **Loose end:** B11/B12 still need rows in the guardrail-hardening bug registry.
  Tests **329 → 344** (26 files), build clean, eslint 0. See
  [`../../docs/career/DEV_JOURNAL.md`](../../docs/career/DEV_JOURNAL.md) (2026-10-05).
- **E6 bug-hardening — batch 1 built 2026-10-06** (`leetsage-e6-bug-hardening`,
  standing branch `feature/e6-bug-hardening`, commit `034f2ce`; local — NOT
  pushed/merged): the first batch on the **"Analyze my code" (`CHECK_APPROACH`)**
  path, dogfooded on "Encode and Decode Strings". **B13 ✅** (markdown no longer eats
  `*` in `O(N*M)`; `n→N` over-replace fixed) and **B15 ✅** (reliable code capture —
  full Monaco model only, DOM demoted to a liveness signal, retry/backoff,
  discriminated `ok|empty|failed`, honest-stop on a failed read) are closed;
  **B14/R4/B16 🏗️ partial** (prompt example-bleed swapped for non-answerable
  placeholders + "COMPUTE, DON'T COPY" + a `Variables:` line + an intra-message
  headline/breakdown reconcile rule) — but the run-to-run `O(N)`↔`O(N·M)`
  **correctness instability is explicitly NOT closed**, routed to the deferred
  correctness eval **E10** (not B10). The design's R3 structured-badge "root fix" was
  **built, measured as a no-op in the common case, and reverted**. `npm.cmd run test`
  344 → **387**, build clean, lint 0 (1 pre-existing warning). Carries **B10/B9/B8**
  + a vuln-scan batch for later. See
  [`../../docs/career/DEV_JOURNAL.md`](../../docs/career/DEV_JOURNAL.md) (2026-10-06).
- **E10 eval framework — built 2026-10-08, PENDING REVIEW** (`leetsage-e10-eval-framework`,
  branch `feature/e10-eval-framework`, 2 commits `d563b13` + `242eeaf` off
  `main`@`19db429`; **local — NOT pushed, no PR**): a **Promptfoo** measurement layer
  (`evals-promptfoo/`) added **beside** the deterministic `src/evals/` guardrail eval
  (still the CI gate, untouched) — adding the two things that gate lacked: a **real
  (non-mock) LLM-as-judge** (Gemini via the shipped OpenAI-compatible endpoint) and a
  **correctness dataset of real captured responses** scored against human-labeled
  ground truth. **Key-free CI** (the judge is a local/on-demand measurement on the
  user's BYOK key, never a gate — ADR-010); the **echo-provider** pattern scores
  already-captured text; metrics are **split by source** (authored vs captured) so a
  flattering regression number never poses as real recall; safety cases are
  **generated from the single source of truth** and bridge the **real `filterResponse`**
  so they match the Vitest gate by construction. The offline/live split is **two
  config files + an `includeJudge` boolean** (an env toggle failed — Promptfoo
  sandboxes `file://` test modules away from `process.env` and caches test cases).
  Correctness set is a deliberate **1-wrong + 2-right** mix (Encode/Decode `O(N)` vs
  `O(N·M)` miss flagged; two correct Longest-Consecutive cases pass; the B16 case is a
  documented `ready:false` TODO — don't fabricate). **Verified:** build clean,
  `npm.cmd run test` **413 unchanged**, offline 28/0-errors (safety 100/0/100 +
  correctness 2/3), and a **full judged live run** (13,509 tokens / 1m27s) where the
  judge **agreed with every human label** — validating the judge live. Dependency
  security: `npm audit fix` 33→7 highs (0 critical); 7 residual Promptfoo-only
  proxy/JKS highs accepted + documented (dev-only dep, never in `src/`/`dist/`/CI).
  **Honest limit:** E10 *measures* correctness (B14/R4/B16), it doesn't fix it. Tests
  **413 → 413** (new eval files are outside the tsconfig/Vitest gate). See
  [`../../docs/career/DEV_JOURNAL.md`](../../docs/career/DEV_JOURNAL.md) (2026-10-08)
  and DESIGN_DECISIONS ADR-010.
- **Next to build:** finish **E6** (B8/B9 → the vuln-scan batch), act on E10's
  measured-wrong Encode/Decode result (a follow-up prompt/model correctness fix — a
  separate decision), **E10b** (MCP browser testing), and/or **scope extension
  permissions** (now unblocked by export-to-file), then progress-tracking Phase D
  (verified submissions). The clickable "open on LeetCode" link is a documented
  future (its `url` is already validated; the link isn't built).
- **Don't trust for current state:** `ai-learning-assistant` (historical).

*Keep this index current when a spec changes status — it's the fastest way for a
new session to orient. The project-historian agent
([`../agents/project-historian.md`](../agents/project-historian.md)) can update it
along with the other docs.*
