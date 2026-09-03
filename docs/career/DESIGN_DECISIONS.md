# LeetSage — Design Decisions (Architecture Decision Log)

> A living record of *why* LeetSage is built the way it is. Every entry states the
> decision, the alternatives considered, the tradeoff accepted, and what would
> change the decision later. This doubles as engineering documentation **and** an
> interview study sheet — being able to defend these choices is worth more than
> the code itself.
>
> Companion docs: [INTERVIEW_PREP.md](./INTERVIEW_PREP.md) ·
> [RESUME.md](./RESUME.md) · [LEARNING_ROADMAP.md](./LEARNING_ROADMAP.md) ·
> code-level deep dive in [../leetsage-learning-guide.md](../leetsage-learning-guide.md)

---

## The one-paragraph summary (memorize this)

LeetSage is a **client-only, bring-your-own-key (BYOK)** Chrome extension that
coaches you through LeetCode problems without revealing full solutions. It has
**no backend**: each user supplies their own Google Gemini API key, stored
locally, and the browser calls Gemini directly. The product's core constraint —
*never hand over the answer* — is enforced by a **multi-layer guardrail**
(prompt-level rules plus a deterministic output filter). Every architectural
choice flows from three goals: keep it **free**, keep it **safe** (both "no
solutions" and "no central secret to leak"), and keep it **simple to operate**
(zero infrastructure).

---

## ADR-001 — Bring-your-own-key (BYOK), not a managed key

**Decision.** Each user pastes their own free Gemini API key into Settings. It is
stored in `chrome.storage.local` on their machine and sent directly from their
browser to Google. LeetSage never holds anyone's key.

**Alternatives considered.**
- *Managed key* (I hold one key, proxy all users' calls): would let users skip
  setup, but requires a backend, makes me pay for everyone's usage, exposes me to
  abuse/cost blowups, and centralizes a secret that becomes a breach target.
- *OAuth into a provider*: heavier setup, still needs a backend to hold tokens.

**Tradeoff accepted.** Users must do a one-time key setup (friction), and the key
sits in plaintext in local extension storage (see ADR-002). In exchange: zero
cost to me, zero central secret, zero server to run, and it scales to unlimited
users for free.

**What would change it.** If I wanted a frictionless "no setup" experience or
managed billing, I'd introduce a backend proxy — which changes the entire
cost/abuse/security calculus (see ADR-007 on scaling).

---

## ADR-002 — API key stored in `chrome.storage.local` (plaintext)

**Decision.** The user's key lives in `chrome.storage.local`, unencrypted.

**Why this is acceptable (not a defect).** A purely client-side app has no secure
place to hide a secret *from the owner of the machine it runs on*. Any
"encryption" key would also have to live on the same device, so it provides no
real protection against a local attacker who already owns the box. This is the
standard, accepted model for BYOK browser extensions.

**Mitigations / honesty.**
- The key is the *user's own* credential, scoped to their own free Gemini quota —
  blast radius of exposure is their own account, not other users.
- It is never transmitted anywhere except directly to Google's API over HTTPS.
- README should tell users the key lives locally and to use a rotatable/scoped
  key. (Follow-up item.)

**What would change it.** Managed keys or cross-device sync would force a backend,
at which point the secret moves server-side and gets real protection (vault,
rotation, per-user scoping).

---

## ADR-003 — No backend (client-only architecture)

**Decision.** There is no server. The extension is the whole product: content
script + side panel (React) + background service worker, all running in the
browser, calling Gemini directly.

**Why.** The two things a backend usually buys — holding secrets and centralizing
state — are things LeetSage deliberately *doesn't* want (BYOK removes the secret;
per-user local storage removes the shared state). Without those needs, a backend
is pure cost and operational burden.

**Tradeoff accepted.** No server-side analytics, no managed keys, no cross-device
sync, no server-side prompt updates (prompt changes ship with the extension).

**What would change it.** Any feature requiring *shared* or *central* state:
managed keys, cross-device progress sync, aggregate analytics/leaderboards, or
remotely-updatable prompts. See [INTERVIEW_PREP.md](./INTERVIEW_PREP.md) "How do
you scale with no backend?".

---

## ADR-004 — Multi-layer guardrail to never reveal full solutions

**Decision.** Enforce the "teach, don't solve" constraint in **two layers**:
1. **Prompt-level** (`src/services/prompts.ts`): system rules instruct the model
   to give progressive hints, never complete implementations, for most actions.
2. **Deterministic output filter** (`src/services/solution-filter.ts`): a
   post-generation check that runs on the model's output and replaces it with a
   "content filtered" message if it looks like a full answer.

**How the filter actually works** (`filterResponse(content, actionType)`):
- **Exempt actions.** `CHECK_APPROACH` and `UNDERSTAND_SOLUTION` are exempt —
  their whole point is to discuss the user's *own* code, so solution-like content
  is expected there.
- **Layer A — phrase match.** Substring scan for solution-revealing language
  ("here's the complete solution", "full implementation", etc.).
- **Layer B — code-size + shape.** Extracts fenced code blocks; rejects any block
  over `MAX_CODE_BLOCK_LINES` (14). A block over `MAX_SNIPPET_LINES` (8) that also
  matches a "complete function" regex (def/function/method with a substantial
  body) is rejected as a full implementation.
- **Layer C — pseudocode heuristic.** `looksLikeFullPseudocode()` flags text
  (fenced *or* prose) that combines ≥5 control-flow lines with a loop **and** a
  branch **and** a result/return — the signature of "the whole algorithm spelled
  out in words." Added after a real incident where the model returned pseudocode
  that was a 1:1 of the solution.

**Why two layers (defense in depth).** The prompt is a *soft* control — LLMs are
non-deterministic and can be talked around. The filter is a *hard*,
deterministic backstop that doesn't depend on the model complying. This is the
2026-standard pattern: **never trust the model's compliance alone; add a
deterministic check on the output.**

**Tradeoff accepted.** Heuristics have false positives (a legitimately long
explanation can trip the line limit) and false negatives (a clever paraphrase can
slip through). The thresholds are tuned conservatively toward learning.

**What would improve it.** An **eval suite** (see LEARNING_ROADMAP) to measure the
filter's precision/recall against a labeled set, and an LLM-as-judge layer for the
semantic "did this basically give the answer?" cases that regex can't catch.

---

## ADR-005 — Gemini via the OpenAI-compatible endpoint

**Decision.** Call Gemini through its OpenAI-compatible Chat Completions endpoint
(`.../v1beta/openai/chat/completions`) with `Bearer` auth, rather than the native
Gemini SDK.

**Why.**
- **Free tier.** Gemini has a genuinely usable free tier — essential for a
  zero-cost BYOK tool.
- **Familiar, portable shape.** The OpenAI request/response format is the
  lingua franca; using it means the provider is swappable later with minimal code
  change (any OpenAI-compatible provider drops in).
- **Streaming.** Supports token streaming for responsive UX.

**Tradeoff accepted.** The compat layer may lag native Gemini features. Fine for
chat-completion use.

**Hard-won lesson.** Model names matter and drift. `gemini-2.5-*` names returned
404 (deprecated); the working names were `gemini-3.5-flash-lite` / `gemini-3.5-flash`.
A stale model name — *not* the key format — caused an earlier 404 debugging loop.
**Always verify current model names against the provider docs before assuming.**

---

## ADR-006 — Manifest V3, pull-based problem-data flow

**Decision.** Build as an MV3 extension. The side panel **pulls** problem data
from the content script on demand (via a `REQUEST_PROBLEM_DATA` message with
retry/backoff, plus a `chrome.scripting.executeScript` inject as a fallback),
rather than relying on the content script to **push** it.

**Why pull, not push.** MV3 replaced persistent background pages with **service
workers that sleep** when idle. A push-only design silently drops data whenever
the worker is asleep. Pull-with-retry is robust against that lifecycle.

**Other MV3 gotchas encountered (real systems experience):**
- The service worker needs `"type": "module"` in the manifest or it crashes
  silently on ES-module imports.
- Reading the user's code from the Monaco editor requires injecting into the
  page's **MAIN world** (`world: 'MAIN'`), because `window.monaco` lives in the
  page's JS context, which the isolated content script can't touch.
- Session persistence keys on a **normalized** problem URL (`/problems/{slug}/`)
  so that navigating to the submissions tab doesn't wipe the chat history.

**What would change it.** Nothing near-term; MV3 is mandatory for the Chrome Web
Store.

---

## ADR-007 — Free-tier guardrails (rate limiting, caps, kill switch)

**Decision.** Client-side guardrails: per-minute rate limit, daily request cap,
cooldown between requests, per-request token cap, request timeout, and a global
kill switch — all user-adjustable.

**Why.** Even with BYOK, runaway calls burn the user's free quota and cost them
money if they've enabled billing. The guardrails make the tool safe-by-default and
demonstrate **cost-control thinking** — a theme interviewers probe directly
("how do you keep LLM costs bounded?").

**Tradeoff accepted.** Client-side limits can be bypassed by a determined user
editing storage — acceptable because the only person they'd hurt is themselves
(their own key/quota). Server-side enforcement would need a backend.

---

## ADR-008 — Model tiering (Flash-Lite default, Flash optional)

**Decision.** Default to `gemini-3.5-flash-lite` (cheapest/fastest), let users
opt up to `gemini-3.5-flash` for harder explanations.

**Why.** Most coaching actions (hints, breakdowns) don't need the strongest model.
Defaulting to the cheap tier keeps latency low and free-tier usage sustainable;
this is **model tiering / routing**, a named cost-optimization technique worth
citing in interviews.

---

## Cross-cutting themes (the interview headline)

| Theme | Where it shows up | Interview framing |
|---|---|---|
| Cost control | BYOK, guardrails, model tiering | "How do you keep LLM costs bounded?" |
| Safety / output constraints | Multi-layer guardrail, solution-filter | "How do you stop the model doing X?" |
| Security tradeoffs | BYOK, local key storage | "How do you secure users' keys?" |
| Non-determinism | Deterministic filter over probabilistic model | "LLM output isn't reliable — how do you handle that?" |
| Untrusted input | LeetCode page content flows into prompts | "Prompt injection — are you exposed?" |
| Platform constraints | MV3 worker lifecycle, MAIN-world injection | "Tell me about a hard bug." |
| Knowing when *not* to build | No backend until a feature needs one | "When would you add infrastructure?" |

---

*Maintained alongside the code. When a decision changes, add a new ADR or amend
the existing one with a dated note — don't delete history.*
