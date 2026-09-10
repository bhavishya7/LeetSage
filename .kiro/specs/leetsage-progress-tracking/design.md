# LeetSage — Progress Tracking: Design & System-Design Guide

> **Status:** Design captured, not yet built. Phase A (single-problem report +
> copy button) is DONE and shipped on `feature/progress-tracking`. This document
> designs Phase B (persistent records + "My Progress") and Phase C (cross-problem
> analytics / "weakest link"), and doubles as a **teaching doc**: it explains the
> system-design concepts behind each choice so building it is also learning it.
>
> Companion: [requirements.md](./requirements.md) (the vision) ·
> [../../../docs/career/DESIGN_DECISIONS.md](../../../docs/career/DESIGN_DECISIONS.md) ·
> [../../../docs/career/LEARNING_ROADMAP.md](../../../docs/career/LEARNING_ROADMAP.md)

---

## 0. How to read this doc

Each section has two layers:
- **DESIGN** — what we're building and the concrete decision.
- **📚 SYSTEM-DESIGN LESSON** — the transferable concept, so you can talk about it
  in an interview and apply it elsewhere. These are the payoff of building this.

Nothing here needs a backend. The whole point is that a *constraint* (client-only,
`chrome.storage`) forces the interesting decisions — which is exactly what
system-design interviews reward.

---

## 1. The three tiers (where we are, where we're going)

| Tier | What it is | State | Storage | Analysis |
|---|---|---|---|---|
| A | Single-problem study note + copy | **DONE** | none (ephemeral) | none |
| B | Persistent per-problem records + "My Progress" list; re-solve updates the record | **NEXT** | `chrome.storage.local` | none |
| C | Cross-problem analytics ("weakest link", "revisit these") | later | reads Tier B data | aggregation pipeline |

**Key insight that drives the whole design:** Tier C's "smartness" comes almost
entirely from Tier B's **data model**, not from AI. If we store the right
*structured* fields, the analytics are simple aggregation over local data. If we
only store free text, we'd have to re-feed everything to an LLM every time —
expensive, slow, and non-deterministic. **So most of the real design work is the
Tier B schema.**

> **⚠️ DEPENDENCY — build structured output first.** The `patterns[]`,
> complexity, and approach fields that populate `ProblemRecord` should come from
> the **structured-output** layer, not from re-parsing prose. See
> [../leetsage-structured-output/design.md](../leetsage-structured-output/design.md).
> That layer defines a hybrid prose + `data` response for `CHECK_APPROACH` /
> `UNDERSTAND_SOLUTION`; the `data` blocks stored on `ContentMetadata.structured`
> are exactly the raw material for `ProblemRecord.attempts[]`. Build (or at least
> design) structured output before/with Phase B so records populate cleanly
> instead of via fragile extraction.

> 📚 **SYSTEM-DESIGN LESSON — "model your data around your read patterns."**
> Before choosing storage, ask "what questions will I ask of this data?" Here the
> questions are "list my problems", "show one problem's history", and "group by
> pattern". Those questions dictate the schema and key layout below. Designing
> storage backwards from queries is the core habit of data modeling.

---

## 2. Decisions locked in

Two choices were made deliberately (with an eye on future upgrades):

1. **Pattern source: LLM-with-fixed-vocabulary first; LeetCode topic tags later.**
   The report generation asks the LLM to classify the problem into a *fixed list*
   of patterns (not free-form). Later we can extend the content-script extractor
   to scrape LeetCode's own topic tags for a deterministic source.
2. **Save trigger: explicit "Save to my progress" button first; auto-save on
   Accepted submission later.** Start with a button the user controls; evolve to
   detecting a successful submission automatically.

> 📚 **SYSTEM-DESIGN LESSON — "make the non-deterministic thing deterministic at
> the boundary."** An LLM classifying into free text would tag the same problem
> differently across runs, poisoning analytics. Constraining it to a **fixed
> enum** (structured output) turns a fuzzy model into a reliable classifier. This
> is the same reason APIs validate inputs against a schema at the edge.

---

## 3. Phase B — the data model (the heart of the design)

### 3.1 The record schema

```ts
/** A stable, versioned record of one problem the user has worked on. */
interface ProblemRecord {
  schemaVersion: number;        // for migrations (see §6)
  slug: string;                 // normalized problem key, e.g. "two-sum" — the PK
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  patterns: ProblemPattern[];   // fixed-vocabulary tags — powers analytics
  attempts: Attempt[];          // history; append on each save (enables "improved")
  bestAttemptIndex: number;     // pointer into attempts[] (fastest/cleanest so far)
  firstSolvedAt: number;        // epoch ms
  lastUpdatedAt: number;        // epoch ms
  notes: string;                // free-form user/AI notes
}

interface Attempt {
  date: number;                 // epoch ms
  outcome: 'solved' | 'attempted' | 'gave-up';
  approachSummary: string;      // short prose
  solutionSummary: string;      // language-agnostic outline (not a code dump)
  timeComplexity: string;       // "O(N)"
  spaceComplexity: string;      // "O(1)"
  hintsUsed: number;            // from existing ProgressState.hintLevel
  language?: string;
}

/** Fixed vocabulary — the ONLY allowed pattern values. */
type ProblemPattern =
  | 'array' | 'hash-map' | 'two-pointers' | 'sliding-window' | 'stack'
  | 'queue' | 'linked-list' | 'binary-search' | 'sorting' | 'recursion'
  | 'backtracking' | 'tree' | 'graph' | 'heap' | 'greedy'
  | 'dynamic-programming' | 'bit-manipulation' | 'math' | 'string' | 'other';
```

**Why each field earns its place:**
- `slug` is the primary key — reuses the existing `normalizeProblemUrl()` so a
  re-solve maps to the same record (not a new one).
- `patterns` is a **fixed enum array** — the field the whole "weakest link"
  feature aggregates on. Fixed vocabulary = trustworthy grouping.
- `attempts[]` is an **array, not a single value** — this is the decision that
  enables "you solved it faster this time." Each save appends; nothing is
  overwritten, so you keep a timeline.
- `bestAttemptIndex` avoids recomputing "best so far" every read; it's a
  denormalized pointer maintained on write.
- `schemaVersion` is cheap insurance for §6 migrations.

> 📚 **SYSTEM-DESIGN LESSON — "history vs. current state."** Storing an
> `attempts[]` log instead of a single mutable value is *event-log thinking* (a
> lightweight cousin of event sourcing). You keep every attempt as an immutable
> record and derive "best" / "improved" from the log. Logs are more flexible than
> overwriting state — you can always recompute new metrics from history later.
> The tradeoff is storage growth (see §5 quota).

### 3.2 Storage layout — key design

`chrome.storage.local` is a **key-value store** (like a tiny NoSQL DB). Two layout
options:

**Option 1 — one giant blob.** `progress = { [slug]: ProblemRecord }`.
- ✅ Simple. ❌ Every save rewrites the *entire* object; the list view must load
  everything even to show titles. Gets slow and write-heavy as records grow.

**Option 2 — one key per record + a light index (CHOSEN).**
```
progress_index      -> ProblemIndexEntry[]   // {slug, title, difficulty, patterns, lastUpdatedAt}
record_two-sum      -> ProblemRecord         // full record
record_3sum         -> ProblemRecord
...
```
- ✅ Saving one problem writes only that key + the small index (not every record).
- ✅ The "My Progress" list renders from the tiny `progress_index` alone — no need
  to load full records until you open one.
- ✅ Analytics can run off the index for pattern/difficulty counts (they live in
  the index), only loading full records when needed.
- ❌ Slightly more bookkeeping (keep index and records in sync).

> 📚 **SYSTEM-DESIGN LESSON — "index/summary tables and access patterns."** The
> `progress_index` is exactly a **secondary index / summary table**: a small,
> fast-to-read projection of the big data, holding just the fields the list and
> analytics need. Real databases do this constantly (covering indexes,
> materialized views). The general principle: *duplicate a little data to make
> your common read path cheap.* The cost is keeping the copy consistent on write —
> a tradeoff you'll name in interviews as "read optimization vs. write
> amplification / consistency."

### 3.3 Write path (save a record)

```
On "Save to my progress":
  1. Generate the report (LLM) → also returns structured fields
     (patterns[], complexity, summaries) via structured output.
  2. Load existing record_{slug} (if any).
  3. Append a new Attempt; recompute bestAttemptIndex.
  4. Merge patterns (union); update lastUpdatedAt.
  5. Write record_{slug}.
  6. Upsert the progress_index entry.
```

> 📚 **SYSTEM-DESIGN LESSON — "read-modify-write & idempotency."** Steps 2–5 are a
> classic read-modify-write. Because `chrome.storage` is async and the panel can
> fire events, note the *race*: two rapid saves could interleave. For a
> single-user local store this is low-risk, but the correct mental model —
> "serialize writes to the same key" or "make the write idempotent" — is the same
> concept as optimistic locking / transactions in a real DB. Worth mentioning you
> know the risk even if you don't fully guard it in v1.

---

## 4. Phase B — the "My Progress" view (UI)

A new view (tab or modal in the side panel) that:
- Lists problems from `progress_index`: title, difficulty, pattern chips, last
  updated, attempt count.
- Sort/filter by difficulty, pattern, recency.
- Click a row → full `ProblemRecord`: notes + the `attempts[]` timeline showing
  improvement over time.
- Per-record actions: copy note, delete, (later) export.

Keep it read-mostly and simple; the data model does the heavy lifting.

---

## 5. Storage limits & lifecycle (the "ops" thinking)

`chrome.storage.local` ≈ **10 MB** quota, async, single-browser, no query engine.

- **Estimate:** a record is ~1–2 KB. Even 500 problems ≈ ~1 MB. So quota is not a
  near-term problem — but *plan for it* rather than ignore it.
- **At quota:** surface a warning and offer **export** (write all records to a
  downloaded JSON/Markdown file) rather than silently failing. Export also solves
  portability (§7).
- **`attempts[]` growth:** cap displayed history or collapse very old attempts if
  a single record balloons (unlikely for LeetCode use).

> 📚 **SYSTEM-DESIGN LESSON — "know your store's limits and design for the
> boundary."** Every datastore has quotas, latency, and consistency
> characteristics. Naming them (10 MB, async, single-browser) and having a plan
> for the limit (prune/export) is what separates "it works on my machine" from
> "production-minded." The same reasoning scales up to "what happens when this
> DynamoDB partition gets hot" or "when this table hits its row limit."

---

## 6. Schema versioning & migration

Every record carries `schemaVersion`. On load:
```
if (record.schemaVersion < CURRENT) record = migrate(record);
```
`migrate()` applies ordered, idempotent steps (v1→v2 adds a field with a default,
etc.). Do this from day one — it's near-free now and painful to retrofit.

> 📚 **SYSTEM-DESIGN LESSON — "schema evolution."** The moment you persist
> structured data, you own the "what happens to old data when the shape changes"
> problem forever. Versioned records + a migration function is the standard answer
> (it's what DB migration tools, protobuf field numbers, and API versioning all
> encode). Interviewers love "how do you evolve a schema without breaking existing
> data?" — this is your concrete answer.

---

## 7. Phase C — cross-problem analytics ("weakest link")

Once records exist, analytics is **aggregation over local data**, not AI:

```
computeInsights(records):
  byPattern = groupBy(records, r => r.patterns)          // fan-out: a problem has multiple patterns
  for each pattern:
     solvedCount, avgHintsUsed, avgAttemptsToSolve, difficultyMix
     struggleScore = f(avgHintsUsed, attemptsToSolve, gave-up rate)
  rank patterns by struggleScore  → "weakest link"
  revisitList = records where (hintsUsed high) OR (not touched in N days)
```

- **"Weakest link"** = highest struggle-score pattern, *presented honestly* with
  the sample size ("based on 8 sliding-window problems"). With tiny N, label it
  low-confidence — don't overclaim on 3 data points.
- **Optional AI layer (hybrid):** compute the *stats deterministically*, then pass
  the numbers to the LLM to write a friendly narrative summary. The LLM never
  invents the data — it just phrases it. This is the safe, cheap way to combine
  deterministic analytics with LLM fluency.

> 📚 **SYSTEM-DESIGN LESSON — "analytics pipeline & separation of concerns."**
> This is a mini **ETL / aggregation pipeline**: load → group → score → rank →
> present. Keeping *computation* (deterministic, testable) separate from
> *presentation* (LLM narrative) is a clean architecture boundary — the same
> reason production systems separate a metrics/aggregation layer from the
> reporting/UI layer. It's also very testable: the scoring function is pure input
> → output, perfect for the eval/test suite on the roadmap.

---

## 8. Phase D (future) — auto-save on Accepted submission

The eventual upgrade from the explicit button:
- Extend the content script to **detect a successful submission** (LeetCode shows
  an "Accepted" result + runtime/memory in the DOM).
- On Accepted, auto-capture an `Attempt` (with runtime as a real improvement
  metric — "faster this time" becomes measurable, not guessed).

**Why it's deferred:** submission-detection is new, brittle extraction work (DOM
scraping of a dynamic result panel), and less reliable than a button. Ship the
button first; add auto-detect once the data model is proven.

> 📚 **SYSTEM-DESIGN LESSON — "push vs. pull, and reliability of signals."**
> Auto-detect is an *event-driven* (push) capture; the button is *user-initiated*
> (pull). Event-driven is nicer UX but depends on a fragile external signal
> (LeetCode's DOM). Designing for "what if the signal is missed or fires twice?"
> (idempotent capture keyed by submission) is the same reliability thinking as
> webhooks and at-least-once delivery in distributed systems.

---

## 9. The backend boundary (the interview headline you earn)

Everything above stays client-only. The honest ceiling of `chrome.storage.local`:
- single-browser (no cross-device sync),
- no multi-user, no server-side aggregation,
- ~10 MB.

**When you'd cross into a backend** (and can whiteboard without building):
- Cross-device sync, accounts, or sharing progress.
- Then: auth, a per-user record store (the same `ProblemRecord` schema migrates
  almost directly to a DB row/document), server-side aggregation for heavier
  analytics, and privacy/data-ownership handling.

> 📚 **SYSTEM-DESIGN LESSON — "the migration path is the design."** Because Phase B
> already defines a clean `ProblemRecord` schema with a primary key and an index,
> moving to a backend is "put these records in a table keyed by (userId, slug) and
> move aggregation server-side." Being able to say *"my client schema maps to this
> server schema, here's the migration"* is a top-tier system-design answer — and
> you get it for free by designing the client data model well now.

---

## 10. Build order (when we pick this up)

0. **Structured output first** (prerequisite): implement the hybrid prose + `data`
   response for the report-feeding actions per
   [../leetsage-structured-output/design.md](../leetsage-structured-output/design.md).
   Records and analytics read those structured fields.
1. **Schema + storage layer** (§3): types, `record_{slug}` + `progress_index`
   read/modify/write helpers, `schemaVersion` + `migrate()`. Unit-test the pure
   parts (pairs with the eval/test roadmap item).
2. **Structured-output classification** (§2): report generation returns
   `patterns[]` from the fixed enum + structured fields (via the structured-output
   layer above).
3. **"Save to my progress" button** (§3.3 write path).
4. **"My Progress" view** (§4).
5. **Analytics** (§7): pure `computeInsights()` + a simple insights view; optional
   LLM narrative on top.
6. Later: **export** (§5), **auto-save** (§8), **backend** (§9) only if it becomes
   a product.

---

## 11. What this feature teaches you (the résumé/interview summary)

Building B→C gives you concrete, defensible experience in:
- **Data modeling** around read patterns (schema, primary key, index).
- **Storage access patterns** & the read-optimization vs. write-amplification
  tradeoff (index/summary projection).
- **Event-log modeling** (`attempts[]`) vs. mutable state.
- **Schema versioning & migration.**
- **Structured-output LLM classification** into a constrained vocabulary.
- **A deterministic analytics pipeline** cleanly separated from LLM presentation.
- **Knowing the backend boundary** and being able to describe the migration.

That's a genuine system-design story built on a tool you actually use — which is
exactly the combination 2026 interviews reward.
