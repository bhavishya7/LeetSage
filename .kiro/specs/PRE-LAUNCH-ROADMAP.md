# LeetSage — Pre-Launch Roadmap & Readiness Plan

> **Purpose.** A durable capture of every remaining item before the extension is
> "ready to publish," in the user's intended order, with enough detail that any
> fresh session can pick up each item without re-deriving the context. Written
> 2026-09-27 at a consolidation checkpoint. The user has **no deadline** — these
> are the user's own bar for "ready," not scope creep. **Scope permissions is
> deliberately LAST.**
>
> Companion: `.kiro/specs/README.md` (per-feature status index),
> `docs/career/LEARNING_ROADMAP.md`, `.kiro/steering/workflow.md` (process rules:
> explain-and-STOP before committing; spec discipline; handoff rules).

---

## Current state (verified at this checkpoint)

- **`main` @ `72da4ed`** is the authoritative, latest build. In sync with
  `origin/main`. Working tree clean.
- **Everything built so far is merged into `main`** — verified: `git branch
  --no-merged main` is empty, and `git diff main <branch>` shows `main` is a
  strict superset of every feature branch (branches were squash/PR-merged, so
  their tip commits aren't literal ancestors — hence `--is-ancestor` reports
  "unmerged" — but their *content* is fully in `main`; `feature/progress-export-import`
  diffs IDENTICAL to main).
- **Shipped & live on main:** Phase 1 (Gemini BYOK, chat-hybrid UI, guardrails,
  theme, MV3), structured output, progress tracking A–C, tests + guardrail eval +
  CI/CD (GitHub Actions + Husky), prompt-injection hardening, metrics,
  guardrail-hardening (B1–B7 + bug registry), action-streamlining (4-chip grid),
  chat-intent-routing (classify→route pipeline), progress export/import (+ manifest
  CSP).
- **Branch cleanup:** 15 non-main branches (local + origin) are all superseded by
  main and safe to delete — but require `git branch -D` (force), NOT `-d`, because
  they were squash-merged. The USER will do this themselves. Remote copies need
  `git push origin --delete <name>` (or GitHub UI) separately from local deletion.
- **Known test count on main:** ~277 (per the export/import post-merge note).

---

## HOUSEKEEPING (do first, independent)

### H1 — Fix the stale `.kiro/specs/README.md` statuses
The spec index still describes several specs as "✅ Built (on branch, local, not
pushed/merged)" — e.g. prompt-injection, metrics, guardrail-hardening,
action-streamlining, chat-intent-routing, progress-export-import. **They are all
merged to `main` now.** Fix:
- Change those statuses to "✅ **Shipped**" (merged to main), and
- Update the "Quick what's true right now" section at the bottom, which repeats the
  same stale "not pushed / local / awaiting review" language.
This is a documentation-accuracy fix (prevents misleading every future session).
Per the user: this stale-index fix can ride along on whatever branch we create
next (it does NOT need its own branch).

### H2 — Prune merged branches (USER does this)
All 15 non-main branches are safe to delete (`-D`, force, because squash-merged).
User handles it for safety. Not an agent task unless asked.

---

## THE ENHANCEMENTS (in the user's intended order)

> Ordering decision from the user: consolidation (done) → the items below →
> bug/vulnerability hardening pass → scope permissions (LAST) → deployment plan.
> Within the enhancements, exact order is still open for discussion, but
> conversation-context is the highest-value and the git-docs removal is
> independent. Each item below notes whether it needs a full spec or is lighter.

### E1 — Conversation / session context (STATELESS → windowed)
**→ MERGED INTO E9 (agentic chat).** Conversation context is a *prerequisite* of a
tool-use agent loop (an agent needs history to handle follow-ups), so it's no longer
a standalone item — it's built as part of E9. The detail below is the problem
statement E9 must solve.

**The problem (confirmed in code):** every `streamLLMRequest` call in `App.tsx`
(`handleActionClick` and `handleChatSubmit`) is **stateless** — it sends only
`problemContext` + action + `userCode` + `sessionDigest`, and **NO prior
messages/responses**. So the model has zero memory of what was already asked/
answered. This is why pressing "Analyze my code" repeatedly gives the same generic
opening, and why chat can't handle follow-ups ("what about the edge case I
mentioned?").

**Was it intentional?** Not a deliberate decision — each action was built one-shot.
**Does it break the lightweight model?** NO. `gemini-3.5-flash-lite` handles
multi-turn fine. Real constraints are **cost (tokens), latency, token caps, and
guardrail surface** — not capability.

**Design (don't do all-or-nothing):** windowed/bounded context, NOT the whole
transcript — last N turns OR a running summary, with a token cap. Raw material
exists: `learningContentRef` holds the session `LearningContent[]`. Decisions:
window size vs. rolling summary vs. hybrid; token-budget cap (respect `maxTokens`;
don't blow the free tier); history must flow through `wrapUntrusted` framing (prior
content is still untrusted) and not defeat the no-solutions guardrail; per-action
vs. global context; filter/gate unchanged (history is input).
**Interview angle:** context-window management, cost-bounded prompt construction.

### E2 — Chat UI fluidity / visual polish
**The ask:** compared to LeetCode's chat, ours is "plain and bland." Make it more
fluid/nicer — message transitions, bubble styling, spacing, smoother streaming
feel, maybe a typing cadence.
**Honest caveat:** "make it feel nicer" is subjective + open-ended → MUST be scoped
to a concrete list of specific improvements or it becomes a time sink.
**Rigor:** small UI spec OR fold into an onboarding/polish spec. Lower priority than
correctness items. UI change → user must eyeball before commit (workflow rule).

### E3 — Chat intent-routing bugs (already merged to main — append to bug registry)
Two concrete bugs the user observed:
- **Duplicate "Try" mentions** — multiple "Try" prompts/labels showing (likely the
  rotating placeholder + the "Try asking…" chips both saying "Try", or chips
  duplicating). Investigate `discovery-prompts.ts` + the chip rendering in
  `App.tsx`.
- **"Try" chip only populates the input, doesn't submit** — clicking a Try chip
  inserts the text into the chat box but the user must still manually submit.
  **UX decision:** a canned example chip should probably **submit immediately** (not
  just populate). Populate-only makes sense for a *template needing input*; a full
  example question should fire. Decide per-chip behavior.
**Rigor:** these go into the **standing bug registry** (guardrail-hardening spec's
registry, the established home) and get fixed in the **bug/vulnerability hardening
pass** (see below). Each fix must add a guarding test (registry principle).

### E4 — Tutorial / onboarding
**The ask:** do first-time users need a walkthrough of how to use the app well?
**Options (cheapest first):**
- (a) **First-run welcome card / empty-state** in the panel: what LeetSage is,
  "add your Gemini key," a few example asks. Low effort, high value. There may
  already be an empty-state to build on (ContentDisplay shows a "Tap a quick
  action…" empty state today).
- (b) Point users to **ask the chat** ("ask me what I can do") — leans on the new
  routing/discovery.
- (c) Full guided walkthrough — overkill for v1.
**Recommendation:** (a) a simple first-run welcome/empty-state. Could be its own
small spec or folded into E2 (polish).
**Rigor:** small spec or part of E2.

### E5 — Remove learning/resume docs from git ⚠️ decision-dependent
**The ask:** the user does NOT want personal career artifacts on git — these are
for learning, not product. Affected: `docs/career/` (DEV_JOURNAL, DESIGN_DECISIONS,
INTERVIEW_PREP, RESUME, LEARNING_ROADMAP, README) and `docs/resume-compilation/`
(00-CONTEXT-TRANSFER, 01-compilation, 02-resume-bullets, 03-interview-prep,
04-tech-inventory). (NOTE: the project-historian agent + steering reference
docs/career/ — removing them has ripple effects on those workflows; decide what the
historian maintains afterward.)
**CRITICAL nuance — deletion method matters:**
- Simply `git rm` + `.gitignore` removes them from `HEAD`/future but they **REMAIN
  IN GIT HISTORY** (every past commit). On a PUBLIC repo, a visitor can still see
  them in history.
- **Options:**
  - (a) `git rm` + gitignore — clean going forward, history retains them. Fine IF
    the concern is just "don't clutter the shipped repo."
  - (b) **Rewrite history** (`git filter-repo`) to purge them entirely — thorough,
    but REWRITES HISTORY + force-push (disruptive; the user has deliberately
    avoided force operations all project). Also breaks every existing commit hash
    referenced in docs.
  - (c) Move them to a **separate private repo** or local-only folder.
**Recommendation:** decide "clean-forward (a)" vs. "erase-from-history (b/c)" FIRST
— they're different operations with different risk. Given the repo is public and
these are personal, likely (a) + possibly a one-off (b) purge before making the
repo more visible. **This needs an explicit user decision before any action.**
**Also decide:** does the project-historian agent keep running (it maintains
docs/career/)? If those docs leave git, the historian's target changes.
**Rigor:** no spec needed; it's a git operation + a decision. But HIGH CAUTION
(history rewrite is the one irreversible-ish git action).

### E6 — Bug / vulnerability hardening pass
**The ask + established intent:** a consolidated sweep before launch:
- Fix all registry bugs (E3 routing bugs; the **action-streamlining-revealed bug**
  the user mentioned is documented in that spec — find it and fix; plus any open Bx).
- A **vulnerability scan**: review the whole attack surface — the import pipeline
  (already hardened), prompt-injection framing, the CSP, `host_permissions` breadth
  (ties into scope-permissions), any `innerHTML`/`dangerouslySetInnerHTML` (export
  spec verified none today — re-verify), dependency audit (`npm audit`), secret
  handling (BYOK key in `chrome.storage.local` — document the posture).
- Everything fixed gets a guarding test (registry principle).
**Rigor:** likely a FULL SPEC (consolidates the registry + a security review
checklist). Comes AFTER the feature enhancements, BEFORE scope-permissions.

### E7 — Scope extension permissions (LAST feature-ish item)
**Already designed/discussed, deferred to here by the user.** Narrow
`host_permissions` from broad (`http://*/*`,`https://*/*`) to `https://leetcode.com/*`;
swap the `tabs` permission for `activeTab`; drop any dev-only localhost match.
**Why last:** applying it requires **removing + re-adding the unpacked extension**,
which **wipes `chrome.storage.local`** (progress records + API key). The
export/import feature (E-done, shipped) is the mitigation: export progress JSON
before, re-import after. So this must come after the user is happy with everything
and has exported their data.
**Also check:** whether the download in export/import needs `chrome.downloads` (it
was verified to use the Blob `<a download>` anchor — no `downloads` permission — so
scoping shouldn't conflict).
**Interview angle:** least-privilege, concrete permission-narrowing.
**Rigor:** small/design-only spec; mostly a `manifest.json` change + verify the
extension still works after the remove/re-add.

### E8 — Deployment plan (Chrome Web Store)
**The finish line.** Needs its own planning doc/spec covering: a store listing
(name, description, screenshots, privacy policy — BYOK/no-backend/no-data-
collection is a strong privacy story), the store's review requirements, the
manifest's final permission justification (post-E7), icons/assets, a privacy
disclosure (the extension sends problem text + the user's code to Google Gemini via
the user's own key — must be disclosed), versioning, and the fact that CD/
auto-publish was deliberately NOT built (manual publish — see the CI/CD decision).
**Rigor:** a planning doc + a pre-submission checklist.

### E9 — Chat enhancement (agentic tool-loop + context + routing + usage UI) ⭐ the big one
**Scope note:** this is ONE consolidated feature covering the whole chat rework —
conversation context (merged E1), the agentic tool-use loop, how it coexists with
the shipped intent-routing, the guardrails that keep it safe/cheap, and the
obscured usage indicator. It's the single largest remaining item and the honest
"make LeetSage more agentic" upgrade that fits a client-only TS extension (we
rejected LangGraph/CrewAI/vector-DB/K8s as architecturally wrong — forcing them
would be fake). FULL SPEC.

**Why agentic at all.** A **tool-use control loop** is what actually makes
something "an agent" — it decides which tool to call, acts, observes, decides
again, loops until done. Buildable in TypeScript, in the browser, no backend.

---

#### LOCKED ARCHITECTURE — option (b), three tiers

A free local classifier decides the path; cost scales with need:

```
user types a message
   │
   ├─ classify()  — LOCAL heuristic, 0 API calls, ~instant
   │
   ├─ HIGH-CONFIDENCE intent match? ──YES──▶ route to the pre-built action
   │                                          = 1 request (cheap, deterministic)
   │
   └─ no strong match ─────────────────────▶ context-aware chat:
          ├─ answer from conversation context / direct answer   = 1 request
          └─ model decides it needs data → agentic TOOL LOOP     = 2..N requests
```

Three tiers, cheapest-first:
1. **Route to a pre-built intent** (high-confidence match) → 1 request. The common
   case stays as cheap as today.
2. **Context-aware chat, no tools** → 1 request. Because chat is now
   context-aware (merged E1), a question already answered earlier can be answered
   *again from context* without tools. Direct answers also land here.
3. **Agentic tool loop** → 2+ requests, fires ONLY when the model decides it needs
   to fetch something (`getEditorCode()`, `getProblemExamples()`,
   `getProblemConstraints()`, `getComplexityOfCurrentCode()` — a small, read-only
   tool allowlist). The expensive path is reached only when capability genuinely
   demands it.

**Why (b) over (a)/(c):** keeps the cheap deterministic fast-path for the common
case; reuses the ALREADY-SHIPPED classifier + intent registry + routing dispatch
(the agent loop is the *new* fallback branch, not a rewrite); pays the multi-request
premium only for genuinely novel questions. (a) subsumes routing entirely —
cleaner story but throws away working routing and makes every chat message pay the
agent premium. (c) routes everything through the loop — over-engineered +
expensive. Rejected both.

**Classifier decision (LOCKED):** KEEP the existing **local keyword/pattern
heuristic** — do NOT upgrade to embeddings or an LLM classifier for v1 (an LLM
classifier would reintroduce an extra API call per message — the exact cost we're
avoiding). The three-tier design makes high accuracy *less* critical: bias toward
**high confidence — only route a strong match**; everything uncertain falls through
to the (now capable) context chat / loop. Under-routing fails GRACEFULLY (into more
capable chat), so a high confidence bar is safe. Only *improvement* for v1: **expand
the labeled golden set** with more real examples so over-route rate is measurable.
Revisit the classifier only if the eval shows too many false strong matches.

**Conversation context (merged E1) — TWO-LAYER MEMORY (design decision):** chat
today is **stateless** (`App.tsx` `streamLLMRequest` sends problem context + action
+ code + an optional `sessionDigest`, but **no prior turns**). E9 gives chat memory
via two distinct layers that answer two different questions — keep them separate:

- **Long-term "what the user has done" → reuse the existing `sessionDigest`
  (`src/services/session-digest.ts`).** This is the answer to "should chat know they
  already used 3 hints?" — **yes, and the mechanism already exists.**
  `buildSessionDigest(history, progress)` produces a compact, FACTUAL summary
  (hints used + depth reached, # of code analyses + approach/complexity/issues,
  patterns + key insight, # of free-form questions) **with ZERO API cost** — it
  reads the structured `data` blocks off `learningContentRef`, it does NOT ask the
  model to summarize. Today it's only threaded into `GENERATE_REPORT`; **E9 threads
  it into the chat path too** (chat already receives `buildChatData` = problem +
  code; add the digest alongside it). Cost: a few flat lines of input tokens, no
  extra request. This is the cheap, durable long-term memory.
- **Short-term "what was just said" → a bounded sliding window** of the last N
  (≈3–4) conversational turns, verbatim, token-capped. This is what enables genuine
  follow-ups ("what about edge cases?" after the previous answer).

**Do NOT replay the raw button/action history as prose** into every chat prompt —
it's token-heavy, redundant (chat already sees problem + code), and grows every
turn. The digest is the intelligent substitute: it already distills that history
cheaply and is already unit-tested (`session-digest.test.ts`).

**Cost model to be explicit about in design (two independent axes):**
- *Request count (the 200/day budget):* including context adds **zero** requests —
  a chat turn is 1 request whether it carries 0 or N prior turns. Only the agentic
  TOOL LOOP adds requests (one per tool round). Context ≠ requests.
- *Tokens per request (`maxTokens` / per-call cost + latency):* context **does** add
  input tokens, and an unbounded full transcript inflates every turn and compounds
  as the chat grows. The bounded window + the flat digest keep per-request token
  cost **flat and predictable** — the whole reason to prefer a window over "send
  everything." (Alternatives to record in `design.md`: (A) full transcript —
  simplest, cost grows linearly, rejected; (B) bounded window + digest —
  **recommended**; (C) rolling LLM summary — best retention but the summary itself
  costs a request, wrong trade for BYOK/200-a-day.)

**Hint-level is the source of truth for *depth*, not the digest.** The digest may
*report* "used the approach-level hint" so chat is aware, but `progress.hintLevel`
stays authoritative for *what hint depth to serve next* — don't let the digest
become a second, drifting hint counter.

**Safety:** both layers are UNTRUSTED (prior model/scraped/user content) and flow
through `wrapUntrusted`; neither may defeat the no-solutions guardrail
(`filterResponse` + pre-display gate still apply to every turn's output).

**Tool-calling mechanism:** Gemini **function/tool calling** via the
OpenAI-compatible endpoint — **VERIFY the endpoint supports tool-calling before
committing** (same "verify model features" discipline as the model-name lesson).

---

#### GUARDRAILS (the agent loop adds new risk — all required)

- **Loop iteration cap (critical):** hard max tool rounds (e.g. 3–4), then force a
  final answer. Prevents runaway/infinite loops — the classic agent failure mode.
- **Per-round request accounting (critical):** EACH tool round increments the rate
  limiter + metrics, so the 200/day stays honest (one message must not silently
  burn N requests uncounted). `recordRequest()` is called per round, not per message.
- **No guardrail bypass via the loop (critical):** the agent must NOT self-authorize
  a solution-reveal that the exempt-confirm gate normally requires. Every loop
  turn's final output still passes `filterResponse` + the pre-display gate; tool
  results fed back in are untrusted → `wrapUntrusted`. Don't let the loop become a
  back door around the no-solutions promise.
- **Tool allowlist / least privilege (important):** the model may ONLY call the
  small, explicit set of **read-only** tools defined; it cannot invent tools or take
  actions. (The model is tool-less today — adding tools reduces that safety, so the
  allowlist is how it stays bounded.)
- **Token budget for the loop (important):** cap the growing transcript + tool
  results per round (ties to the bounded window + digest in the two-layer memory
  above — the window stays capped even as the loop appends tool results).
- **Pre-flight cost check (nice-to-have):** if the user is near the daily cap, warn
  / degrade to a single-shot answer rather than start a multi-round loop that hits
  the wall mid-way.

---

#### OBSCURED USAGE INDICATOR (part of this chat enhancement)

Because the agent loop makes a single message cost a variable number of requests,
the raw `0/200` counter in the header becomes noisy/pressuring. Replace it with an
**obscure usage indicator** — a percentage ring / subtle bar that fills as the user
approaches the daily cap, NO exact numbers in the header. **Keep the "running low"
signal** (color shift green→amber→red near the limit) so the user still gets the
"slow down" warning the raw number provided — just don't remove the signal entirely.
The **exact `X/200`** (and the existing metrics readout) move to **Settings only**.

---

**Rigor:** FULL SPEC — the most substantial remaining feature; real tradeoffs in
cost, routing coexistence, guardrail safety, and context management. Builds on and
*extends* (does not replace) chat-intent-routing; the spec must explicitly reconcile
the two per the locked (b) architecture.
**Interview angle:** "I built a client-side agent control loop (tool-calling +
bounded iteration + conversation memory) as a graceful fallback behind a free local
intent classifier, counted every tool round against the user's rate limit, and kept
the no-solutions guardrail unbypassable through the loop — a deliberate
cost/safety/capability tradeoff on a free-tier BYOK model." Strong, honest agentic
engineering.

### E10 — Proper eval framework (replace the hand-rolled harness)
**Current state (verified):** the guardrail eval (`src/evals/`) is **hand-rolled** —
a custom `computeMetrics`/`formatReport` over a labeled `GUARDRAIL_CASES` set, plus
an **offline mock** LLM-judge scaffold (`llm-judge.ts`), honestly flagged as
author-generated (overstates real recall) and never run against a validated live
judge. It works and gates CI, but it's bespoke.
**The upgrade:** adopt a real eval framework/tool (e.g. **Promptfoo** — JS/TS-native,
runs locally, no backend, fits this project; or a RAGAS-style approach if any
retrieval lands). Port the labeled guardrail set into it; optionally wire a real
(not mock) LLM-as-judge for the semantic "did it basically give the answer?" cases.
**VERIFY** the chosen tool is current + fits a client-side TS project before
committing (don't assume).
**Why it's worth it:** "I used an eval framework (Promptfoo/RAGAS) to gate an AI
safety constraint in CI" is a real, named 2026 resume skill — vs. "I wrote my own
metrics function." Low-risk: you already have the labeled dataset and the CI wiring.
**Rigor:** small spec or design-only (swap the harness, keep the dataset + gates).
**Interview angle:** LLM evaluation with industry tooling; LLM-as-judge; CI release
gates.

#### E10b — MCP-driven browser smoke testing (do DURING the eval-framework work)

A second, complementary half of E10's "testing/verification maturity" theme: use
the **Chrome DevTools MCP server** (`chrome-devtools-mcp`) as a browser-automation
harness to exercise the *actually-rendered* extension on a *real LeetCode page* —
the gap the unit/eval suite structurally cannot cover.

**Why this is a real gap, not busywork:** the whole test suite runs Vitest with
`env=node` (DOM-free). Nothing today exercises the rendered side-panel UI, the
content-script DOM scraping on live LeetCode markup, the Monaco MAIN-world code
read, or MV3 service-worker timing against a real page. An MCP-driven smoke test
over the real DOM (navigate → a11y snapshot → assert side panel present → check
console errors + network calls) is a credible complement to the offline suite.

**Why it "didn't work" before (DIAGNOSED this session — verified against the
installed `chrome-devtools-mcp@latest --help`):**
- The MCP server itself is FINE — tested live this session: it connects, launches
  Chrome, lists pages, navigates, snapshots, reads console/network. Not broken.
- What's broken is the *specific thing `.kiro/settings/mcp.json` configured it for*:
  it passes `--load-extension=...\dist` + `--disable-extensions-except=...\dist` to
  auto-load the built extension into the MCP's own Chrome. In the current version,
  **extension support is gated behind `--categoryExtensions`, which is "only
  supported with a pipe connection" and "not supported with autoConnect / browserUrl
  / wsEndpoint until [Chrome] 149"** (quoted from the tool's own `--help`). So those
  load-extension flags silently don't take effect — the live test launched a plain
  Chrome with no extension loaded. That matches the past "configured it but couldn't
  make it work."
- Secondary suspects for the original failure: `npx -y ...@latest` cold-start
  download exceeding the MCP handshake timeout (transient); a stale/missing `dist/`
  at launch; and this is a PowerShell env where the `npx` shim is execution-policy
  blocked (same reason the project uses `npm.cmd` not `npm`) — the MCP spawn must
  resolve `node`/`npx` correctly.

**The fix — attach to a self-launched browser (the user browses on Edge, which is
Chromium):** don't have the MCP launch its own Chrome with load-extension flags.
Instead launch a Chromium browser YOURSELF with remote debugging + the extension
already loaded, then point the MCP at it:
- **(A) RECOMMENDED — attach via `--browserUrl`:** start Edge (or Chrome) with
  `--remote-debugging-port=9222 --load-extension=...\dist` yourself, then configure
  the MCP with `--browserUrl http://127.0.0.1:9222` (or `--autoConnect`). The MCP
  attaches to *your* running browser where the extension is already installed — so
  to the page it's just there; you don't need the version-gated extension-category
  tools, only navigation + snapshot + console + network, which all work over an
  attached connection. Bonus: pre-enter the Gemini key in that profile so
  end-to-end LLM-path testing works. Edge accepts the Chromium debugging + extension
  flags. **Caveat:** the MCP's dedicated *extension-inspection* tools (service-worker
  internals) aren't available over `browserUrl` until the 149 release — but those
  aren't needed for page-level smoke testing.
- **(B) let the MCP launch Chrome, DROP the extension flags:** fine for testing any
  web page's DOM, but the extension won't be present, so it can't test the
  extension's own behavior. Less useful for this goal.

**Honest resume/MCP framing (don't overstate):** this is *integrating and
operationalizing* an existing MCP server as a test harness — NOT authoring one. The
real engineering substance is the diagnosis above: understanding why the naive
config fails (version-gated extension support; pipe-vs-attach connection modes) and
choosing the attach-to-a-running-browser workaround. Accurate sentence:
"Debugged and configured an MCP-based browser-testing harness, working around the
tool's version-gated extension loading by attaching to a remote-debugging browser
instance." Do NOT claim "built an MCP server" (that's a separate, larger effort).

**Validation step the user owns:** proving config (A) end-to-end needs the user to
launch Edge with remote debugging + `dist/` loaded (the agent can't start the user's
interactive browser); then the agent can attach, navigate to a real problem, and
confirm the side panel renders + content script scrapes. **Validate before relying
on it** (same verify-don't-assume discipline).
**Rigor:** design-only / notes — it's a tooling/testing-workflow addition, not a
product-code feature.
**Interview angle:** MCP tooling in practice; browser automation as a test harness;
diagnosing a tool's version-gated feature and routing around it via connection mode.

---

## Deferred / backlog (documented, NOT in the pre-launch path unless user says)

- **Progress-tracking Phase D** — auto-save on a *verified* Accepted LeetCode
  submission (needs new submission-result DOM extraction). Would make
  `outcome: 'solved'` verified, not inferred; unblocks showing a trustworthy
  attempt count.
- **B8** — optimality-equivalence crediting (recognize `O(log M + log N)` ≡
  `O(log(M·N))`) — fuzzy model-reasoning, deferred.
- **B10** — **optimal complexity drifts across messages in the same session**
  (found 2026-10-05, verified by a full lifecycle trace). The optimal time/space
  for a problem is a FIXED property, but it's re-guessed independently on every
  action and every chat turn — e.g. "Analyze my code" said Optimal O(N)/O(N) and a
  later message said O(N+M)/O(N+M) for the same problem. **Root cause:** there is NO
  single source of truth for optimal complexity. Each of CHECK_APPROACH,
  UNDERSTAND_SOLUTION, GENERATE_REPORT, TIME_COMPLEXITY_HINT, and free-form chat is an
  independent model call that recomputes it; parsed optimals are stored only as
  per-message `metadata.structured` artifacts; and the E9 two-layer memory does NOT
  pin it — the conversation window excludes action cards, and `buildSessionDigest`
  surfaces optimal only as *advisory prose* that can even carry **two conflicting
  lines** (latest analysis' optimal vs. latest understanding's optimal, emitted
  independently in `session-digest.ts`). The only reconciliation
  (`extractSessionFacts` → report > latest-understand > latest-analysis) runs ONLY at
  report-save time and never feeds back into a prompt.
  **Fix direction (for the B10 build):** establish a single source of truth per
  problem — on the first authoritative optimal (CHECK_APPROACH / UNDERSTAND_SOLUTION),
  capture + persist it keyed on the normalized `/problems/{slug}/` URL (same key as
  session persistence), then feed it back into EVERY subsequent prompt (actions + chat)
  as a HARD constraint ("the established optimal for this problem is X; use exactly
  this, do not recompute"); and fix the digest to emit ONE reconciled optimal line, not
  two. **Open decision:** when a later analysis disagrees with the pinned value, trust
  the first pin, or let UNDERSTAND_SOLUTION (the action whose job is explaining the
  optimal) override an earlier CHECK_APPROACH guess and re-pin? (GM leans the latter.)
  **Nuance:** optimal is model-produced with no verifier, so "strictly enforced"
  realistically means *pin-and-reuse*, not *provably correct*. Related to but distinct
  from **B8** (B8 = crediting equivalent notations like O(N) ≡ O(N+M); B10 = not
  drifting in the first place). **Touches the same files E9 changed** (prompts,
  storage, chat memory) → do it as part of the **E6 bug-hardening pass**, batched
  with **E10b** (MCP browser testing) so the fix can be smoke-tested on a real page.
- **Eval follow-up** — real captured Gemini responses + a validated LLM-as-judge
  (current eval is on an authored dataset; `src/evals/llm-judge.ts` scaffold exists).
- **"Open on LeetCode" clickable link** in records — the `url` is already validated
  by the import sanitizer; the link UI isn't built.
- **On-device model (no-BYOK)** — Phase 2 / post-launch. Chrome built-in Prompt API
  / Gemini Nano / WebLLM. Big integration; reinforces the no-backend identity;
  removes BYOK friction. Verify API availability before committing (moves fast).
- **Planned specs (never built):** cheatsheet (static, zero-token; maybe local RAG),
  pseudocode-mode, phase2-struggle-first, phase3-analytics.
- **Auto-generated/continuously-saved progress report** (the user named this as a
  future for export/import).
- **Per-attempt merge** in import (v1 is whole-record newer-wins).
- **"What can you do?" → capabilities router intent that pops the welcome card**
  (deferred from chat-polish design §10). A zero-token local-router intent: when the
  user asks what LeetSage can do, route it to re-open the first-run welcome /
  empty-state card (which lists the capabilities + example asks) instead of spending
  an API call. Small future feature — a new `IntentDef` in the intent router + a
  trigger to surface the onboarding card. Independent of the E6 pass.

---

## Suggested sequence (GM recommendation — user may reorder)

1. **H1** fix stale spec index (rides on the next branch).
2. **E9 agentic chat** (tool-use loop + conversation context (E1), reconciled with
   intent-routing) — the big one; full spec. Does the heavy chat rework ONCE so E2
   polish and E3 bug fixes land on the final chat shape, not the old one.
3. **E3 + E2 + E4** chat routing bugs + fluidity polish + onboarding — do AFTER E9
   since E9 reshapes chat (some E3 routing bugs may be mooted/changed by E9's
   coexistence decision). Bugs → registry; polish/onboarding → small spec(s).
4. **E10 proper eval framework** (swap the hand-rolled harness; small spec).
5. **E6 bug/vulnerability hardening pass** (consolidated sweep + security review).
6. **E5 remove learning docs from git** (decision first; independent — anytime once
   decided).
7. **E7 scope permissions** (LAST; export data first).
8. **E8 deployment plan** → publish.

> Why E9 before E2/E3: E9 substantially reworks the chat surface (and partially
> replaces routing). Doing cosmetic polish (E2) or routing-bug fixes (E3) first
> would be work thrown away when E9 reshapes it. Build the final chat architecture,
> then polish/fix/eval on top of it.
>
> Honest note: E9 is the single largest remaining feature and carries real cost +
> guardrail-safety risk — it's the one to design most carefully (and the one most
> worth it for the agentic-engineering story). If the user ever wants a *minimal*
> launch instead, E9 could be deferred to v1.1 and the chat shipped as-is (routing +
> stateless) — but the user has chosen to invest in it for the learning value.

---

*Keep this file updated as items move. Each enhancement that becomes active work
should get its own spec folder under `.kiro/specs/` (full trilogy for substantial
ones, design-only for small — per workflow.md spec discipline), with this file as
the index of what's planned and why.*
