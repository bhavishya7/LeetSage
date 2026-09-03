# LeetSage — Career & Engineering Docs

Documentation that captures the *why* behind LeetSage and turns the project into
interview + resume material for a 2026 software / AI engineering job search.
Grounded in current hiring-team expectations (evals, production LLM features,
cost-awareness, AI security) and in the project's actual implementation.

| Doc | What it's for |
|---|---|
| [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md) | Architecture decision log (ADRs): BYOK, no backend, the multi-layer guardrail, MV3, Gemini, cost controls — decision, alternatives, tradeoff, and what would change it. Doubles as an interview study sheet. |
| [INTERVIEW_PREP.md](./INTERVIEW_PREP.md) | The 60-second pitch, core Q&A (key security, scaling, guardrails, prompt injection, cost, MV3), general 2026 AI-engineering questions grounded in LeetSage, and a mock-interview bank. |
| [RESUME.md](./RESUME.md) | Ready-to-adapt resume bullets (three flavors), project blurbs, ATS keywords, and an honest gap analysis that doubles as a build priority list. |
| [LEARNING_ROADMAP.md](./LEARNING_ROADMAP.md) | Forward plan ordered by interview-value-per-effort: evals, tests, metrics, structured output, prompt-injection hardening, RAG cheatsheet, on-device models, agentic progress-tracking. |

For code-level understanding, see the [deep-dive learning guide](../leetsage-learning-guide.md).

**Maintenance:** these are living documents. As the project grows — especially as
evals, tests, and metrics land — backfill quantified numbers into `RESUME.md` and
new Q&A into `INTERVIEW_PREP.md`.
