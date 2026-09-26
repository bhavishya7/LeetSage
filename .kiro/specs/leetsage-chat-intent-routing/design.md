# LeetSage — Chat Intent Routing: Design

> **Status: 📐 Planned — not yet built.** Design for [requirements.md](./requirements.md).
> Teaching format: **DESIGN** decision + **📚 SYSTEM-DESIGN LESSON**. Grounds against
> the shipped code: `handleChatSubmit` / `handleActionClick` (App.tsx),
> `buildChatData` / `streamLLMRequest` (llm-service.ts), `getChatSystemPrompt` +
> kept action prompts (prompts.ts), `isSolutionExemptAction` (solution-filter.ts),
> `ActionType` (models.ts).

---

## 1. Architecture: a small classify → resolve → route pipeline

Routing is **not** a pile of `if` statements in `handleChatSubmit`. It's a
three-stage pipeline of pure, independently-testable units, plus a thin dispatch:

```
message ─▶ classify() ─▶ Candidate[]        (0..n intents with confidence)
                        │
              resolveOverlap()               (→ 0 or 1 winning route, or "chat")
                        │
                   route()                    (confirm-if-exempt, else dispatch)
                        │
        ┌───────────────┴───────────────┐
   handleActionClick(action)      handleChatSubmit(...)  ← existing free-form path
```

- **`classify(message, context)` → `Candidate[]`** — pure function. Returns every
  intent the message matches, each with a confidence score. No side effects, no API.
- **`resolveOverlap(candidates, context)` → `Route`** — pure. Collapses candidates
  to a single decision: a specific `ActionType`, or `"chat"` (fall-through).
- **`route(decision)`** — the only impure part: for a non-exempt action, dispatch
  via the existing `handleActionClick`; for an exempt action, raise a **confirm**;
  for `"chat"`, call the existing chat path.

Everything above `route()` is pure → trivially unit-testable against the labeled
dataset (R10).

> 📚 **SYSTEM-DESIGN LESSON — a pipeline of pure stages beats a tangled dispatcher.**
> Separating "what does the message mean" (classify), "which single thing wins"
> (resolve), and "make it happen" (route) means each concern is testable and
> replaceable in isolation. It's the same reason compilers split lex → parse →
> codegen: pure transforms in the middle, effects only at the edge.

## 2. Intents as data (extensibility) *(R6)*

A single registry drives everything:

```ts
interface IntentDef {
  id: string;                 // "analyze-complexity", "get-hint", ...
  target: ActionType;         // the action to route to
  patterns: RegExp[];         // cheap match signals (keywords/phrases)
  weight: number;             // precedence for overlap resolution
  requiresCodeContext?: boolean; // sharpen match when editor code is present
  // exemptness is DERIVED from isSolutionExemptAction(target) — never duplicated.
}
const INTENT_REGISTRY: IntentDef[] = [ /* one entry per routable intent */ ];
```

Adding a future intent = add one `IntentDef`. The classifier iterates the registry;
the resolver sorts by weight/context; the router reads
`isSolutionExemptAction(target)`. No control-flow edits.

> 📚 **SYSTEM-DESIGN LESSON — data-driven, not code-driven, for things that grow.**
> When a set is expected to expand (intents, rules, feature flags), model it as data
> the engine iterates, not as branches you hand-edit. New entries can't introduce
> new control-flow bugs, and the whole set is inspectable and testable as data.

> 📚 **SYSTEM-DESIGN LESSON — derive, don't duplicate, cross-cutting facts.**
> Exemptness is read from `isSolutionExemptAction(target)`, the same predicate the
> filter and the pre-display gate use. A new exempt action automatically inherits
> the confirm requirement — no second list to keep in sync (the class of drift bug
> this project keeps fixing).

## 3. Cost model: local-first classification *(R2, cost)*

The classifier is a **local heuristic** — regex/keyword matching over the message,
zero API calls, sub-millisecond. Routing therefore costs **exactly one** API call
(the routed action or the chat call) — never two. An LLM classifier would double
the calls and add latency before the real work (guardrail B5 already showed latency
stings on the free tier), so it's rejected for v1 — but `classify()` is an interface,
so an LLM (or hybrid) classifier can replace it later with no call-site changes.

> 📚 **SYSTEM-DESIGN LESSON — don't pay a model to do a regex's job.** Intent
> classification for a dozen well-known phrasings is a cheap deterministic problem;
> spending an LLM round-trip (latency + tokens + $) on it is over-engineering.
> Reach for the model only where fuzziness genuinely demands it — and keep the seam
> so you *can* upgrade if the heuristic's misroute rate proves too high.

**Rejected alternatives (documented, right-sizing) *(R11)*.** 2026 routing
literature is dominated by enterprise-scale techniques: **vector/semantic routing**,
a **fine-tuned LLM router**, and **per-request LLM classification** over dozens–
hundreds of tools. All are **over-engineered here**: LeetSage has ~9 intents, one
model, no backend. A keyword heuristic is the right-sized tool; the sources agree
the principle is "classify cheap before you infer expensive" — we just don't need
the heavyweight version of it. The `classify()` seam means we can adopt a heavier
classifier later *if the golden-set accuracy demands it*, not preemptively.

**The router is a classifier — measure it *(R10)*.** The labeled golden set isn't
just a guardrail test; it's the router's accuracy metric. A relevant 2026 finding:
intent-classification accuracy **degrades as the intent count grows** (high at a
handful of intents, dropping sharply into the hundreds). That's a concrete,
after-the-fact justification for the action-streamlining work — a *small* intent set
isn't only cleaner UX, it keeps routing accurate. If we ever re-expand the intent
set, expect routing accuracy to need re-measuring.

> 📚 **SYSTEM-DESIGN LESSON — a router is a classifier; treat it like one, and keep
> its input space small.** Give it a golden set and an accuracy number, and be
> aware that more classes = lower accuracy. Constraining the number of intents is a
> reliability lever, not just a UX one.

## 4. Overlap resolution: a three-way decision *(R4, overlap)*

`resolveOverlap(candidates, context)` returns one of **three** outcomes —
`route(action)`, `ask(action)`, or `chat` — modeled on the allow/deny/**abstain**
pattern from 2026 intent-classifier practice. A binary "route or not" threshold is
forced to guess at the boundary; a three-way decision has an honest "not sure" band.

Resolution order:
1. **Context sharpening** — if editor code is present and a candidate is
   `requiresCodeContext` (e.g. "complexity of *my* code" → Analyze), it wins over a
   generic candidate (generic Complexity).
2. **Weight** — higher-`weight` intents win ties (specific beats generic; essential
   actions outrank niche ones).
3. **Confidence bands** →
   - **High** (a decisive winner) → `route(action)` (which the router then
     confirms-or-dispatches per §6).
   - **Borderline** (a plausible winner the resolver can't make decisively, or two
     near-tied candidates) → **`ask(action)`**: surface "Did you want *X*, or just
     an answer?" using the same confirm affordance as the exempt path (§6). Better
     than silently routing wrong or silently dropping a likely-useful route.
   - **Low / none** → `chat` (fall through; chat answers directly).

> 📚 **SYSTEM-DESIGN LESSON — ambiguity needs a defined tiebreaker AND an abstain
> band.** Any classifier hits ties; the design sin is resolving them by accident
> (match order, map iteration). An explicit precedence handles decisive cases; an
> **abstain/`ask`** outcome handles the genuinely-uncertain middle by asking the
> human instead of guessing — cheaper (no wasted wrong-shaped call) and more
> trustworthy than a binary threshold. This mirrors allow/deny/abstain classifiers
> that refuse to force a verdict they don't have.

## 5. Multi-intent (one message, several asks) *(R5, multi-intent)*

**Decision: genuine multi-intent falls through to chat.** If the message clearly
carries multiple distinct intents ("explain the pattern AND give me examples"),
the system does NOT fire multiple actions (multiple API calls) and does NOT chain
them. It routes to chat, which answers the whole multi-part question in **one** call
— the cheapest, least-surprising outcome. (A single dominant intent with incidental
extra wording still routes normally via §4.)

Detection heuristic: multiple high-confidence candidates from *different* intent
families that overlap-resolution can't collapse to one via context → treat as
multi-intent → chat.

> 📚 **SYSTEM-DESIGN LESSON — bound the blast radius of one user action.** One
> message triggering N API calls (cost, rate-limit, N cards) is a surprise and a
> cost bug. Collapsing multi-intent to a single chat call keeps "one message → one
> billable response" — a predictable cost/UX contract. Chaining/agentic sequencing
> is deliberately deferred (out of scope), because it multiplies cost and failure
> modes.

## 6. The guardrail: confirm-to-route for exempt actions *(R3, the hole)*

Auto-routing free text into a filter-exempt action would let a user reach
solution-bearing content by phrasing ("just show me the solution" →
`UNDERSTAND_SOLUTION`, which bypasses the filter). So:

- `route()` checks `isSolutionExemptAction(decision.target)`.
- **Exempt** → do NOT dispatch. Surface a **confirm affordance** in the chat area:
  "Looks like you want to *understand the solution* — [Show me] / [Just answer my
  question]". The user's tap on "Show me" is the deliberate act that was previously
  the button press; "Just answer" falls through to chat.
- **Non-exempt** → dispatch directly (still filtered + gated); a subtle "ran X"
  indication for transparency (R9).

This turns the confirm step into a *feature*, not friction: it doubles as the
transparency mechanism (§9 concern) and the guardrail, using one interaction.

**One affordance, three jobs.** The same confirm UI serves: (a) the exempt-action
guardrail (§6), (b) the borderline **`ask`** outcome (§4), and (c) transparency.
Build it once, keyed on a `{ prompt, action }` shape, and reuse it — an exempt
match and a borderline non-exempt match both render "Did you want *X*? — [Yes] /
[Just answer]".

> 📚 **SYSTEM-DESIGN LESSON — keep the human in the loop for the irreversible/
> sensitive path.** The general agentic-safety pattern: auto-execute low-stakes
> actions, require confirmation for high-stakes ones. Here "high-stakes" =
> revealing solution content (the product's one non-negotiable). Gating exactly
> that path behind a tap preserves the invariant that solutions require a deliberate
> act, no matter how the request is phrased.

## 7. Where it plugs in

`submitChat` / `handleChatSubmit` in `App.tsx` gains a pre-step: build context
(editor code is already available to chat), run classify → resolve. On a
non-exempt route, call the existing `handleActionClick(target)` (identical to a
button press — R7). On an exempt match, render the confirm. Else, the existing
free-form chat path runs unchanged. **No change** to `filterResponse`, the
pre-display gate, or `getChatSystemPrompt` — routing sits *in front of* them.

## 8. Discovery *(R8)*

Because the five niche intents lost their buttons, chat teaches them: a
**rotating placeholder** cycling example asks ("what pattern is this?", "give me
another example", "explain the concept"…) and/or a small dismissible row of
**"Try asking…" chips** above the input. Purely presentational — no API call until
the user actually sends something.

> 📚 **SYSTEM-DESIGN LESSON — discovery by example beats a menu.** Modern chat UIs
> teach capability through suggested prompts rather than a catalog of buttons. It
> scales as intents grow (rotate more examples) and matches how users already
> expect an AI input to behave.

## 9. What would change this design

- **An LLM classifier** (if heuristic misroutes too often) — swap `classify()`; the
  pipeline and everything downstream are unchanged.
- **Action chaining / multi-intent execution** — a bigger, post-launch idea; would
  revisit §5 and the "one message → one call" contract deliberately.
- **A new exempt action** — inherits confirm-to-route for free (§2/§6, derived
  exemptness).

## 10. Cohesion check (how it fits the whole app)

- Reuses `handleActionClick` → routed actions behave *exactly* like button presses
  (same prompts, structured output, filter/exempt handling, progress tracking,
  metrics). No parallel path to drift.
- Reuses `isSolutionExemptAction` → one source of truth for exemptness across the
  filter, the pre-display gate, and now routing.
- Sits in front of the existing chat path → the guardrail-hardening work (code-aware
  chat, pre-display gate, direct-answer prompt) is untouched and still applies to
  the fall-through.
- Registry + pure pipeline → future intents and a future LLM classifier are additive.
