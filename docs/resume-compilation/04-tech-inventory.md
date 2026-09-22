# 04 — Tech Inventory

> Every technology in the project, tiered by the developer's **actual depth** — not
> by whether it appears in `package.json`. This gates the resume's skills line and any
> "have you used X?" answer. When a JD asks about a T3/T4 item, answer at that honesty
> level.
>
> **Tier meaning:**
> - **T1 — Deep.** Made real design decisions; can explain tradeoffs and internals; can
>   discuss at length under questioning.
> - **T2 — Working.** Used substantively and correctly; can discuss the parts touched,
>   but not every corner.
> - **T3 — Applied / shallow.** Present and used, but in a limited or conventional way;
>   would need a refresher to go deep.
> - **T4 — Incidental.** In the project as a dependency or boilerplate; barely "my" skill.
>
> "Depth" is judged from what the code + docs actually show this developer *did*, per
> 01-compilation.md.

---

## T1 — Deep (lead with these; defensible under questioning)

| Tech / skill | Why T1 — the evidence |
|---|---|
| **TypeScript** | Whole codebase; discriminated-union message types + guards (`types/messages.ts`), a generic `StructuredResponse<T>` + union (`types/models.ts`), closed literal vocabularies (`ActionType`, `ProblemPattern`), untrusted-boundary typing (`llm-service.ts`, `code-extractor.ts`). Real typing decisions, not just annotations. |
| **Chrome Extension MV3 architecture** | Three-context design, pull-based data flow, MAIN-world injection, `type: module` worker fix, normalized-URL persistence — all reasoned through in ADR-006 + `DEV_JOURNAL`. Debugged the worker lifecycle firsthand. |
| **LLM integration & prompt engineering** | 9 tailored system prompts + shared rule blocks (`prompts.ts`), streaming SSE parsing (`llm-service.ts`), structured-output contract + tolerant parser (`structured-parser.ts`), deterministic session digest (`session-digest.ts`). Made the OpenAI-compat + tiering + JSON-mode decisions (ADR-005/008). |
| **AI safety / output guardrails** | The deterministic solution-filter design + hardening driven by a labeled eval (`solution-filter.ts`, `evals/`); the two-layer defense-in-depth rationale (ADR-004). This is the project's core and its strongest story. |
| **Evals / test rigor for non-deterministic systems** | Built a confusion-matrix eval harness + offline injectable judge from scratch (`evals/metrics.ts`, `llm-judge.ts`); understands characterization bias, dataset bias, contract-anchored assertions, "mock all the clocks." Can discuss deeply (`DEV_JOURNAL` 2026-09-15). |
| **Client-side architecture / "when not to build a backend"** | The no-backend / BYOK decision with rejected alternatives and a clear "what would change it" (ADR-001/002/003). A genuine architecture-judgment story. |
| **Spec-driven agentic development** | Authored specs/ADRs/steering, configured a least-privilege sub-agent, drove design→implement→review through PRs, and overrode the agent on a real fix. Process is visible in `.kiro/` + `git log`. |

---

## T2 — Working (comfortable; can discuss the parts touched)

| Tech / skill | Why T2 — the evidence | Where it stops |
|---|---|---|
| **React 19** | Built the whole side-panel UI; hit and fixed a real hooks pitfall (stale closure via `useCallback` deps → `useRef`+`useEffect` mirror, `App.tsx`). | Two intentional `exhaustive-deps` warnings remain unfixed; no advanced concurrent-features work. |
| **Data modeling / storage design** | Record + index projection, append-only log, schema migration, read-modify-write (`progress-records.ts`); analytics pipeline (`progress-analytics.ts`). | Single-user local store; no real DB, indexing, or concurrency control (noted in code). |
| **`chrome.storage` / extension messaging APIs** | Used across all three contexts with promise wrappers, `Set`↔array marshaling, per-day keys (`storage.ts`, `background/index.ts`). | Conventional usage; no `sync` storage, no quota-pressure handling. |
| **DOM scraping / resilient extraction** | Polling + retry/backoff + graceful degradation + `MutationObserver` on a dynamic SPA (`content/extractor.ts`). | Selector-based; brittle to LeetCode redesigns (inherent). |
| **Vite** | Multi-entry build for 3 MV3 contexts, custom `rollupOptions` output (`vite.config.ts`). | Config is modest; no custom plugins or advanced build tuning. |
| **GitHub Actions CI** | Authored `ci.yml` (clean install → lint → test → build gate); understands the pre-commit-vs-CI authority distinction and why-not-Docker/Jenkins. | One straightforward workflow; no matrix builds, caching beyond `cache: npm`, or deployment. |
| **Vitest** | 134 tests / 10 files; fake timers, `chrome` mocking, the mock-time gotcha (`__tests__/`, `evals/`). | First-time framework this project; pure-logic only, no component testing. |

---

## T3 — Applied / shallow (used, but conventionally; refresh before going deep)

| Tech / skill | Why T3 | Honest caveat |
|---|---|---|
| **Tailwind CSS 4** | Styled the entire UI; hit a real CSS-cascade bug (`button { all: unset }` stripping styles → scoped `@layer base` reset, `DEV_JOURNAL` 2026-08-31). | Utility-class usage + one debugging story; no design-system or deep theming architecture. |
| **Husky / git hooks** | Configured a pre-commit hook running lint+test+build (`.husky/pre-commit`, `prepare: husky`). | One hook; standard setup. |
| **ESLint / typescript-eslint** | Config present; fixed `no-explicit-any` errors properly (commit `ea82f9b`). | Mostly default flat-config; didn't author custom rules. |
| **Streaming / async generators** | Implemented `async function*` SSE parsing (`streamLLMRequest`). | One well-scoped use; not a broad streaming architecture. |
| **Accessibility** | Targeted detail — copy-button `aria-label`, avoiding nested interactive elements (`DEV_JOURNAL` 2026-09-02). | No formal audit; can't claim WCAG compliance (would require assistive-tech testing + expert review). |
| **CI/CD concepts (Docker, Jenkins, CD)** | Can articulate *why they were rejected* for this project (`ci.yml` comment, `DEV_JOURNAL`). | **Reasoned about, not used here** — see T4 flag. Don't claim hands-on Docker/Jenkins from this project. |

---

## T4 — Incidental (dependency/boilerplate — barely "my" skill)

| Tech / skill | Why T4 |
|---|---|
| **react-dom** | Standard render entry point; no direct decisions. |
| **PostCSS / autoprefixer** | Tailwind's build plumbing; not directly authored. |
| **@crxjs/vite-plugin** | MV3 build integration; used as configured (and it's a **beta** dependency — a flag, not a skill). |
| **@vitejs/plugin-react** | Boilerplate Vite/React glue. |
| **@types/* packages** | Type stubs; no authored decisions. |
| **globals (eslint)** | Transitive lint config detail. |

---

## Skills-line guidance (what to actually write)

- **Safe to lead with (T1/T2):** TypeScript, React, Chrome Extensions (Manifest V3),
  LLM integration, AI output-safety/guardrails, evals & testing (Vitest), client-side
  architecture, Vite, GitHub Actions CI, DOM/data extraction, data modeling.
- **Include only if the JD asks, and at honest depth (T3):** Tailwind CSS, git hooks/Husky,
  async generators/streaming, accessibility (targeted, not audited).
- **Do NOT put on a skills line as hands-on (T4 / reasoned-only):** Docker, Jenkins, CD
  pipelines — you can *discuss the tradeoffs* (a real interview strength) but you did not
  *use* them here. PostCSS/autoprefixer and the type-stub packages aren't skills.
- **Never imply from this project:** any cloud platform, backend framework, database, or
  containerization — LeetSage has none by design. Claiming them off this project would be
  unverifiable.

---

## "Have you used X?" quick reference

| If asked… | Honest answer grounded in this repo |
|---|---|
| Docker? | "Not in this project — I deliberately chose *not* to containerize because there's no backend to run. I can explain when Docker earns its keep." |
| A database? | "No — it's client-only; state lives in `chrome.storage.local`. I modeled the data (record + index projection, append-only log, migrations) but against local storage, not a DB." |
| A backend framework (Node/Express, etc.)? | "No backend by design (ADR-003). I can explain the tradeoff and when I'd add one." |
| Testing frameworks? | "Yes — Vitest; 134 tests plus a labeled eval harness I built, wired into CI." |
| Cloud (AWS/GCP/Azure)? | "Not in this project. Gemini is called directly over HTTP from the browser (BYOK); there's no cloud infra I provisioned." |
| CI/CD? | "CI yes — GitHub Actions gate (lint/test/build). CD no — I consciously skipped auto-publish; deployment is manual." |
