# 03 — Interview Prep

> The verbal version. For each capability: the deeper technical explanation to give
> out loud, likely follow-ups with answers **two levels below the bullet**, the
> BYOK/no-backend answer, the agentic-workflow story (including an override), and
> honest weak spots with how to address them. Everything traces to 01-compilation.md.

---

## A. LLM integration + the solution filter (the product's identity)

**The explanation.** "LeetSage's one non-negotiable rule is that it coaches without
handing over the full answer. I enforce that in two layers. The soft layer is prompt
instructions — the system prompt tells the model to give progressive hints and short
snippets, never a complete implementation. But an LLM is non-deterministic and can be
talked around, so the hard layer is a **deterministic post-generation filter** that runs
on every non-exempt response and replaces it with a 'filtered' message if it looks like a
full answer. The filter checks for solution-revealing phrases, over-long code blocks
(>14 lines), complete-function shapes, and step-by-step pseudocode of the whole algorithm.
A few actions are deliberately exempt — analyzing the user's *own* code, or generating a
saveable study note — because a solution is the point there."

**Follow-ups (two levels down):**

- *"How does the filter detect a 'complete function' without a parser?"* — Regex-family
  heuristics on extracted fenced blocks: a Python `def` header with 5+ indented body
  lines; a brace-language function with a large single-scope body; and — because the
  char-count brace pattern can't span *nested* braces — a separate check for a
  brace-function header plus a `return` anywhere in the block. Crucially, a complete
  function is rejected **regardless of line count**, because a compact 8-line Two Sum is
  still the whole answer. (`src/services/solution-filter.ts` → `COMPLETE_FUNCTION_PATTERNS`,
  `looksLikeCompleteBraceFunction`.)
- *"How do you know it works?"* — A labeled eval. I hand-labeled a dataset of leak and
  non-leak responses, ran the filter over it, and scored catch rate and false-positive
  rate with a confusion matrix. On the **first run it scored 62.5% catch** — it missed
  three real leak shapes. I hardened the filter and got to 100% catch / 0% false-positive
  on that set, and wired the eval into CI so a regression fails the build.
- *"Isn't 100% suspicious?"* — Yes, and I'm explicit about it. The dataset is
  **author-generated**, so it's a strong *regression gate* but *overstates* real-world
  recall — I wrote both the heuristics and the examples, so they skew toward what I
  already thought of. The honest fix, which I designed the harness for but haven't run, is
  to ingest real captured Gemini responses (`source: 'captured'`) and add a validated
  LLM-as-judge for semantic paraphrase leaks that regex can't catch. (`fixtures/guardrail-cases.ts`
  HONESTY NOTE; `src/evals/llm-judge.ts`.)
- *"What about prompt injection from the scraped page?"* — Real exposure: LeetCode page
  text flows into the prompt. Today's mitigation is the output filter, not input
  sanitization; I'd name that as a gap and a next step, not pretend it's solved.

---

## B. Why no backend? Why BYOK? (the most-probed decision)

**The answer.** "A backend usually earns its keep by doing two things: holding secrets and
centralizing state. LeetSage deliberately wants neither. For secrets: a purely client-side
extension **can't hide one** — any key I shipped could be pulled off a user's machine in
seconds, leading to key theft or quota abuse. So I went **bring-your-own-key**: each user
pastes their own free Gemini key, stored locally, sent straight from their browser to
Google. That means N users = N free quotas at zero cost and zero central secret for me to
leak. For state: everything a user needs is theirs alone, so it lives in
`chrome.storage.local` per user. With neither need, a backend would be pure cost and
operational burden."

**Follow-ups:**

- *"Isn't storing the key in plaintext a vulnerability?"* — It's the accepted BYOK model.
  Any client-side 'encryption' key would also live on the same device, so it gives no real
  protection against someone who already owns the machine. The blast radius is the user's
  own key scoped to their own free quota, and it's only ever sent to Google over HTTPS.
  (`DESIGN_DECISIONS.md` ADR-002.)
- *"When *would* you add a backend?"* — The moment I need **shared or central** state:
  managed keys (frictionless onboarding), cross-device progress sync, aggregate
  analytics/leaderboards, or remotely-updatable prompts. At scale with non-technical
  users, I'd likely do a hybrid — a subsidized shared allowance plus BYOK-for-unlimited.
  That's a post-demand decision, not a now decision. (ADR-001, ADR-003.)
- *"How do you keep LLM costs bounded with no server to meter?"* — Client-side guardrails:
  a per-response token cap (800), per-minute (8) and per-day (200) request caps, a cooldown,
  a hard timeout, and a kill switch — all persisted so they survive the worker sleeping.
  Plus model tiering: default to the cheap `flash-lite`, opt up to `flash` only when
  needed. A determined user can edit storage to bypass them, but the only quota they'd hurt
  is their own. (`src/services/rate-limiter.ts`; `DEFAULT_GUARDRAILS` in `src/types/api.ts`;
  ADR-007/008.)

---

## C. MV3 architecture + the hardest bug

**The explanation.** "It's three isolated JS contexts that share no memory — a content
script on the page, a background service worker, and the React side panel — coordinating
via message passing and storage. The design decision I'm proudest of is making problem
data **pull-based**. In MV3 the background is a service worker that sleeps, so a
push-based flow silently drops data whenever the worker's asleep. Instead the panel
requests the problem when *it's* ready, with retry/backoff and a `chrome.scripting` inject
fallback — robust against the lifecycle."

**Follow-ups:**

- *"Tell me about a hard bug."* — Two good ones. (1) The service worker **crashed
  silently** on ES-module imports until I added `"type": "module"` to the manifest's
  background entry — no error, just nothing happening. (2) The API threw 404s I first
  blamed on the unusual `AQ.`-prefixed key; the real cause was a **stale model name** —
  the specced `gemini-2.5-*` identifiers had been deprecated, and `gemini-3.5-*` worked.
  The lesson I codified: verify model/version names against provider docs before assuming.
  (`DEV_JOURNAL.md` 2026-08-29; ADR-005/006.)
- *"How do you read the user's code from the editor?"* — LeetCode uses Monaco, and the
  full source is only reliable via `window.monaco`, which lives in the page's **MAIN
  world** — an isolated content script can't reach it. So I inject a self-contained reader
  into the MAIN world with `chrome.scripting.executeScript({ world: 'MAIN' })`, with a
  `.view-lines` DOM fallback and a toolbar-based language detector. (`src/services/code-extractor.ts`.)
- *"How does session state survive a submission?"* — I key it on a **normalized**
  `/problems/{slug}/` URL. The raw URL changes on the submissions tab, which would look
  like a different problem and wipe the chat. (`normalizeProblemUrl` in `src/content/extractor.ts`.)

---

## D. Structured output — my strongest architecture story

**The explanation.** "The report feature was producing generic textbook writeups, and the
tempting fix was to tune the prompt. But the **root cause was architectural**: every
response carried only a *rendering* — prose — with no machine-readable data, so anything
downstream (the report, progress records, analytics, evals) would have to reverse-engineer
facts out of prose. So I introduced a hybrid response: the human prose **plus** a small
trailing JSON `data` block that's the **single source of truth**. That one primitive
de-risked four features at once."

**Follow-ups:**

- *"The model output is unreliable — how do you parse it safely?"* — The parser **never
  throws**. A missing, malformed, or schema-invalid block degrades to prose-only. And
  because I stream the response for UX, I strip the data block mid-stream so the user never
  sees raw JSON flash by, then do the authoritative parse once the stream completes.
  (`src/services/structured-parser.ts` → `parseStructuredResponse`, `stripDataBlockForDisplay`.)
- *"Why not use Gemini's JSON-schema mode?"* — I checked its support against the current
  docs and chose the tolerant-parse approach deliberately — same 'verify against provider
  docs' discipline. (`DEV_JOURNAL.md` 2026-09-03.)
- *"You said a green build hid a bug — what happened?"* — The build passed but the report
  was still generic. I dumped `chrome.storage.local` and saw the structured data *was*
  being captured on each card — the report just wasn't seeing it. Root cause: a React
  **stale closure** — the digest builder read a snapshot of the chat history from a
  `useCallback` that intentionally omits that history from its deps (to avoid re-creating
  on every streamed chunk). Fix: a `ref` mirrored to the latest history via `useEffect`,
  read as `.current`. The lesson: for event-driven, non-deterministic LLM features,
  "compiles" ≠ "works" — inspect the persisted state. (`learningContentRef` in
  `src/sidepanel/App.tsx` ~L61–62/218/338; commit `affc683`.)

---

## E. Data modeling + analytics (system design under no-backend)

**The explanation.** "Persistent progress needed a data model chosen around read patterns.
I store one `record_{slug}` key per problem plus a small `progress_index` projection, so
the 'My Progress' list and analytics read the cheap index instead of loading every full
record — read-optimization traded against keeping the two in sync on write. Attempts are an
**append-only event log** with a denormalized best-attempt pointer, and I version the
schema and migrate on every read. The analytics are a pure deterministic pipeline —
group by pattern, score struggle, rank, surface the weakest link — with a **confidence gate**
so I don't overclaim on two data points."

**Follow-ups:**

- *"Is 'solved' real?"* — No, it's **inferred**, and I'm honest about that in the product:
  I hide the attempt count and flag insights below 3 problems as low-confidence, because
  the tool can't verify a real submission yet. Verified submissions (Phase D) are designed,
  not built. (`progress-analytics.ts` `lowConfidence`; `session-digest.ts` complexity-honesty
  rule; `[PLANNED]` in 01-compilation.md §9c.)
- *"Concurrency on the read-modify-write save?"* — It's a classic read-modify-write; I note
  in code that the correct model is serializing writes to the same key, but I don't lock it
  in v1 because it's a single-user local store — low interleaving risk. (`progress-records.ts`
  `saveAttempt` comment.)

---

## F. Testing / evals (quality rigor)

**The explanation.** "This was the project's first test framework — Vitest — and I wrote
134 tests across the pure logic plus a labeled guardrail eval I treat as a release gate,
not just more unit tests. The eval is the highlight because it **disagreed with me**: it
found leak paths my intuition missed."

**Follow-ups:**

- *"Tests written after the code — aren't they just rubber-stamping it?"* — That's exactly
  the risk (characterization bias), and I have a concrete counter-example: a session-digest
  test I wrote **failed**. The wrong move would've been to change the test to match the
  code. Instead I went back to the source, confirmed the behavior was the intended contract,
  and fixed the *test*. Anchoring assertions to the stated contract and boundary values —
  not observed output — is the antidote. Residual bias remains when the same author writes
  both, which is why I want an independent reviewer and captured real data. (`DEV_JOURNAL.md`
  2026-09-15.)
- *"Why an injected `JudgeFn` for the LLM-as-judge?"* — So the whole suite runs offline with
  no API key — a core product constraint (no shipped key). Tests pass a deterministic mock;
  a real run swaps in a thin Gemini wrapper. I also unit-test the metric math itself,
  because an eval whose math you can't trust is worse than none. (`src/evals/llm-judge.ts`,
  `metrics.test.ts`.)
- *"How do tests actually run — manual or automatic?"* — Both now: manually via `npm run
  test`, and automatically via a Husky pre-commit hook and GitHub Actions CI on every push/PR.

---

## G. CI/CD tooling choices

**The explanation.** "CI is GitHub Actions: on every push/PR a clean runner does `npm ci →
lint → test → build`. Because the test step runs the guardrail eval, weakening the safety
filter fails the build automatically. A Husky pre-commit hook runs the same scripts locally
as fast feedback."

**Follow-ups:**

- *"Why GitHub Actions and not Docker or Jenkins?"* — LeetSage has no backend; the artifact
  is a static `dist/` bundle, not a running service. Docker earns its keep containerizing a
  long-running service — there's nothing here to containerize. Jenkins is a self-hosted CI
  server to install and maintain — pure overhead for a solo GitHub project. Actions is built
  into the repo, needs no server, and runs the exact npm scripts I run locally. (`ci.yml`
  header comment.)
- *"Can the pre-commit hook pass but CI fail?"* — Yes, and understanding why is the point.
  CI runs `npm ci` on a **clean** machine from the lockfile, so it catches dependency drift
  — e.g. a package installed locally but never added to `package.json`. The hook runs against
  whatever's already in local `node_modules` and is skippable with `--no-verify`. So the hook
  is a courtesy subset; CI is the authority. (`.husky/pre-commit` comment.)
- *"Why no CD / auto-publish?"* — Web Store publishing needs encrypted credentials and goes
  through Google's review (hours to days), so it's never truly instant. For a solo project,
  manual publish is the right call; I built CI, not CD, on purpose.
- *"Anything go wrong wiring CI?"* — Two things. A green build still had a red **lint** (4
  pre-existing `no-explicit-any` errors); I fixed them by typing the two external-JSON
  boundaries rather than weakening lint. And I pinned the actions to `@v5` from memory to
  clear a Node-20 deprecation warning — but that was two majors stale; I verified the current
  major against the release pages and corrected to `@v7`. Same 'verify, don't assume' lesson
  as the model-name 404. (commits `ea82f9b`, `e7653b8`.)

---

## H. The agentic-workflow story (how I actually drove it)

**The narrative.** "I built this inside an agentic IDE using a spec-driven loop, but I was
the engineer in the loop the whole way. For each feature I authored the spec —
requirements, design, tasks — and the architecture decision records with rejected
alternatives, then directed the agent to implement against them, reviewed the output, and
integrated it through PRs. The commit history literally shows the rhythm: `docs: design`
commits precede `feat:` commits, followed by `docs: record` commits, all merged via PRs
off feature branches. I also encoded standing project rules as 'steering' files so a fresh
session starts grounded instead of re-deriving context, and I built a documentation
sub-agent with **deliberately scoped, least-privilege permissions** — read-only git,
writes limited to the docs folder, everything else set to ask."

**The override (have this ready — it's the strongest single answer to "did the AI just
write it?"):** "When the guardrail eval scored 62.5%, the agent's filter had real blind
spots. I didn't accept the number or the existing code — I directed a careful hardening of
the filter (removing a line-count gate that let compact solutions through, adding
multi-brace-function detection, loosening the pseudocode heuristic), re-ran the eval, and
got to 100% on the set. An independent measurement disagreed with the agent, and I made the
call to fix it. That's the human-in-the-loop signal." (`DEV_JOURNAL.md` 2026-09-15;
`solution-filter.ts`; commit `0031cb9`.)

**Other judgment calls I owned:** reusing the shipped Title-Case pattern/complexity types
instead of a design doc's illustrative kebab schema (avoided a translation layer);
choosing a full-panel view over a modal for a narrow side panel; hiding the attempt count
because it's inferred, not verified; and diagnosing root causes over symptoms (the
stale-closure bug, the structured-output architecture).

---

## I. Honest weak spots (name them before the interviewer does)

| Weak spot | Honest framing | How I'd address it |
|---|---|---|
| Eval dataset is author-generated | "It's a regression gate, not a real-world recall measurement — I say so in the code." | Ingest captured Gemini responses (`source:'captured'` slot exists); run + validate the LLM-as-judge. |
| No component/integration/E2E tests | "Coverage is pure logic only; the React panel and message plumbing aren't tested." | Add React Testing Library for the panel; a mocked-`chrome` integration test for the message flow. |
| No runtime metrics (latency/tokens/cost) | "I have no measured performance figures — it's the top quantified-impact gap." | Instrument the LLM call for p50/p95 latency + tokens/request; surface in the usage counter. |
| Prompt-injection from scraped page | "Real exposure; mitigated by the output filter, not input sanitization." | Add input handling / delimiting; treat page text as untrusted in the prompt. |
| `[DOC DRIFT]` ADR-004 vs. shipped filter | "The ADR predates the 2026-09-15 hardening and describes the older filter." | Update ADR-004 to match `solution-filter.ts` (a docs fix, not code). |
| Beta dependency (`@crxjs/vite-plugin`) | "A build-time plugin on a beta version — a supply/stability risk." | Pin/monitor; have a fallback build path in mind. |
| Solo project, no real users | "It's a personal tool and interview artifact — I won't claim adoption." | Frame as depth-of-engineering evidence, not a product-metrics story. |
