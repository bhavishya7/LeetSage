# LeetSage — Career & Engineering Docs

Documentation that captures the *why* behind LeetSage and turns the project into
interview + resume material for a 2026 software / AI engineering job search.
Grounded in current hiring-team expectations (evals, production LLM features,
cost-awareness, AI security) and in the project's actual implementation.

| Doc | What it's for |
|---|---|
| [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md) | Architecture decision log (ADRs): BYOK, no backend, the multi-layer guardrail, MV3, Gemini, cost controls — decision, alternatives, tradeoff, and what would change it. Doubles as an interview study sheet. |
| [INTERVIEW_PREP.md](./INTERVIEW_PREP.md) | The 60-second pitch, core Q&A (key security, scaling, guardrails, prompt injection, cost, MV3), general 2026 AI-engineering questions grounded in LeetSage, and a mock-interview bank. Also holds **workflow / AI-usage answers** — how the project was built with agents (context engineering, agent-tooling decisions) — since that's a distinct 2026 interview theme. |
| [RESUME.md](./RESUME.md) | Ready-to-adapt resume bullets (three flavors), project blurbs, ATS keywords, and an honest gap analysis that doubles as a build priority list. |
| [LEARNING_ROADMAP.md](./LEARNING_ROADMAP.md) | Forward plan ordered by interview-value-per-effort: structured output, progress-tracking, evals, tests, metrics, prompt-injection hardening, RAG cheatsheet, on-device models. |
| [DEV_JOURNAL.md](./DEV_JOURNAL.md) | Chronological, per-feature development log: what was built, why, what broke, how it was solved, and the interview angle. The doc to re-read before an interview or when returning after time away. |

For code-level understanding, see the [deep-dive learning guide](../leetsage-learning-guide.md).

**Maintenance:** these are living documents, kept current by the **project-historian**
agent ([`.kiro/agents/project-historian.md`](../../.kiro/agents/project-historian.md)).
Run it on demand at the end of a work session — it reviews recent changes and drafts
DEV_JOURNAL entries plus RESUME/INTERVIEW_PREP updates for your review before you
commit. As evals, tests, and metrics land, it backfills quantified numbers into
`RESUME.md` and new Q&A into `INTERVIEW_PREP.md`.
