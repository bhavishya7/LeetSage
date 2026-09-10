# LeetSage Documentation — Start Here

The master map of LeetSage's documentation. Everything is organized in three
layers: **how the code works**, **why it's built that way + career/interview
material**, and **what's planned**. Use this page to find the right doc fast.

## How the code works (technical)

| Doc | What it's for |
|---|---|
| [`leetsage-learning-guide.md`](./leetsage-learning-guide.md) | The code-level deep dive — a file-by-file walkthrough of *what* was built, *why*, and *how* (architecture, data flow, LLM service, solution filter, the 9 actions, code-extractor, etc.). Kept reconciled with the shipped source. |
| [`chrome-extension-guide.md`](./chrome-extension-guide.md) | Chrome-extension fundamentals (Manifest V3 contexts, message passing, storage, side panel) taught in the context of LeetSage. Good primer if extensions are new to you. |
| [`../README.md`](../README.md) | Project README — what LeetSage is, how to build/install, and the tech stack. |
| [`../src/README.md`](../src/README.md) | Source-tree layout. |

## Why it's built that way + interview/resume material (career)

See [`career/README.md`](./career/README.md) for the full index. In short:

| Doc | What it's for |
|---|---|
| [`career/DESIGN_DECISIONS.md`](./career/DESIGN_DECISIONS.md) | Architecture decision log (ADRs): the *why* behind BYOK, no-backend, the guardrail, MV3, Gemini, cost controls. |
| [`career/DEV_JOURNAL.md`](./career/DEV_JOURNAL.md) | Chronological build story: what/why/what-broke/how-solved/interview-angle per feature. Re-read this to remember how things came to be. |
| [`career/INTERVIEW_PREP.md`](./career/INTERVIEW_PREP.md) | Q&A + pitch + mock-interview bank, including **how the project was built with AI agents** (context engineering, agent tooling). |
| [`career/RESUME.md`](./career/RESUME.md) | Resume bullets, ATS keywords, and an honest gap analysis. |
| [`career/LEARNING_ROADMAP.md`](./career/LEARNING_ROADMAP.md) | The forward plan, ordered by interview-value-per-effort. |

## What's planned (specs)

See [`../.kiro/specs/README.md`](../.kiro/specs/README.md) — the spec status index
(shipped / designed / planned / historical), the single source of truth for
project state.

## How this stays current

- **Steering** (`../.kiro/steering/`) auto-loads product/tech/workflow context into
  every session, and points here.
- The **project-historian** agent (`../.kiro/agents/project-historian.md`) updates
  the `career/` docs on demand from a session-handoff block; the deeper technical
  guides are reconciled against `src/` when work touches those areas.
- Rule of thumb: when code and a doc disagree, fix the doc — don't let two sources
  drift apart.
