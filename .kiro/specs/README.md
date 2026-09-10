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
| [`leetsage-progress-tracking`](./leetsage-progress-tracking/) | ✅ Phase A / 📐 Phase B–C | Study-notes & progress tracking. **Phase A shipped** (the "Generate report" action + copy button). **Phases B–C designed** (persistent per-problem records + "My Progress" view + cross-problem analytics / "weakest link") in its `design.md` — a system-design teaching doc. |
| [`leetsage-structured-output`](./leetsage-structured-output/) | 📐 **Designed** | The next build: a hybrid prose + structured `data` response so the report, records, analytics, and evals all consume one machine-readable contract instead of re-parsing prose. Load-bearing; sequenced **before** progress-tracking Phase B. |
| [`leetsage-cheatsheet`](./leetsage-cheatsheet/) | 📝 **Planned** | Static, zero-token language cheatsheets (Python/Java/C++) + Big-O chart, stored in the extension. Candidate for a lightweight local RAG later. |
| [`leetsage-pseudocode-mode`](./leetsage-pseudocode-mode/) | 📝 **Planned** | A lightweight "plan your approach" playground with limited, token-conscious feedback. |
| [`leetsage-phase2-struggle-first`](./leetsage-phase2-struggle-first/) | 📝 **Planned** | Deeper hints unlock only after the user explains their reasoning — the coaching-identity gate. |
| [`leetsage-phase3-analytics`](./leetsage-phase3-analytics/) | 📝 **Planned** | Learning analytics: hints used, submission outcomes, "problems to revisit." Converges with progress-tracking Phase C — build them together. |
| [`ai-learning-assistant`](./ai-learning-assistant/) | 🗄️ **Historical** | The ORIGINAL requirements/design that shaped the action-button set. Superseded (it assumes OpenAI/Anthropic providers and a standalone chat mode that never shipped that way). Kept for context only — do **not** treat its details as current. |

## Quick "what's true right now"

- **Shipped & authoritative:** `leetsage-phase1-gemini` + progress-tracking Phase A.
- **Next to build:** `leetsage-structured-output`, then progress-tracking Phase B.
- **Don't trust for current state:** `ai-learning-assistant` (historical).

*Keep this index current when a spec changes status — it's the fastest way for a
new session to orient. The project-historian agent
([`../agents/project-historian.md`](../agents/project-historian.md)) can update it
along with the other docs.*
