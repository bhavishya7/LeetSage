# LeetSage — Product (what this project is)

LeetSage is a **Chrome extension (Manifest V3)** that acts as an **AI learning
coach for LeetCode**. It opens a side panel on a problem page and offers on-demand
coaching — progressive hints, problem breakdowns, pre-submission code analysis,
deep "why this works" explanations, and a study-note report — all grounded in the
specific problem the user is on.

## The one non-negotiable constraint

**It teaches; it never hands over the full solution.** This is the entire product
identity. A multi-layer guardrail enforces it: prompt-level rules plus a
deterministic post-generation **solution filter**. Exceptions are deliberate and
narrow — the actions that discuss the user's *own* code or record it as a study
note (`CHECK_APPROACH`, `UNDERSTAND_SOLUTION`, `GENERATE_REPORT`) are exempt.
When in doubt, err toward *coaching*, not *solving*.

## Other defining constraints (don't quietly break these)

- **Free / bring-your-own-key (BYOK).** Each user supplies their own free Google
  Gemini API key, stored locally. Never introduce a shipped/shared key.
- **No backend.** Everything runs client-side. Don't add a server, database, or
  managed-key layer without an explicit decision — it changes the whole
  cost/security posture. (See DESIGN_DECISIONS ADR-001/003.)
- **Learning-first UX.** Distinct from a generic "solve it for me" chatbot:
  structured coaching cards, progressive hints, honest about what it can't verify.

## Who it's for

The developer building it uses it for their own LeetCode practice, and the project
doubles as an interview/resume artifact — so correctness and honesty in both the
product and its docs matter.

## Where to learn more

- Code-level deep dive: `docs/leetsage-learning-guide.md`
- Architecture rationale (ADRs): `docs/career/DESIGN_DECISIONS.md`
- What's shipped vs. planned: `.kiro/specs/README.md`
