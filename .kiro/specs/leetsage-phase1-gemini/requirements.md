# LeetSage Phase 1 — Working Free-Tier Base (Gemini)

## Problem Statement

LeetSage's core pipeline works (problem extraction → side panel display), but the AI never actually responds because there's no LLM wired to a usable free provider. The UI is cluttered and unstyled, and the toolbar-icon-click doesn't open the side panel. Phase 1 delivers a genuinely usable, good-looking tool that runs on Google Gemini's free tier, differentiated from LeetCode's built-in "Ask Leet" by a coaching (no-solutions) philosophy.

## Product Identity

LeetSage is a **personal, anti-cheating study coach for LeetCode** that deliberately withholds full solutions and helps the user build real understanding. It is free (bring-your-own-key), runs on Google Gemini's free tier, and is intentionally different from LeetCode's built-in "Ask Leet" (a solve-for-you Premium agent).

Primary user: the developer. Then interview preppers. Then students. Not currently a commercial product.

## Requirements

1. **Gemini provider (free tier).** Use Google Gemini through its OpenAI-compatible endpoint. Default model `gemini-2.5-flash-lite`, switchable to `gemini-2.5-flash` in settings. No other providers surfaced in the UI.

2. **Chat-hybrid side-panel UI.** One clean text input as the primary surface. The 7 existing actions become quick-command chips. Responses render as structured hint cards. Coaching feel, not a generic chatbot.

3. **Manual light/dark theme toggle**, defaulting to dark.

4. **Free-tier guardrails, generous and adjustable.** Per-response token cap, local per-minute + per-day rate limiter (stricter than Gemini's), cooldown between requests, hard request timeout, visible "X/Y requests today" usage counter, and a kill switch (off by default). All limits configurable in settings.

5. **Toolbar-icon-click opens the side panel** (or a documented, definitive fallback if it proves environmental).

6. **Preserve the no-solution philosophy** — the existing solution filter and problem-extraction pipeline stay intact.

## Key Architectural Decision — Bring-Your-Own-Key (BYOK)

Phase 1 uses BYOK (each user supplies their own Gemini key) rather than a supplied/managed key.

- **A client-side extension cannot hide a secret.** A hardcoded key ships to every user's machine and can be extracted in seconds → key theft, bill abuse, or instant free-quota exhaustion that breaks the app for everyone.
- **A managed key requires a backend server** (browser → your server → Gemini) to keep the key server-side — introducing hosting costs, per-user usage bills, abuse protection, uptime, and a data-privacy surface.
- **BYOK fits the current reality:** primary user is the developer (already has a key), no users yet, not selling it. Each user gets their own free Gemini quota, so N users = N free allowances at zero cost/liability.
- **Tradeoff:** BYOK adds setup friction (user must fetch a free key), acceptable for a technical audience. If LeetSage ever gains non-technical users at scale, revisit with a managed backend — likely a subsidized free allowance plus a BYOK-for-unlimited hybrid. That's a post-demand decision, not a now decision.

## Research Findings

- Gemini free tier requires no billing/credit card; over-limit requests are rejected (HTTP 429), not billed — the strongest possible cost ceiling.
- Free limits (early 2026): Flash-Lite ~15 req/min, ~1,000/day; Flash ~10 req/min, ~250/day.
- OpenAI-compatible base URL: `https://generativelanguage.googleapis.com/v1beta/openai/` — the existing `src/services/llm-service.ts` (OpenAI chat-completions format) needs minimal change.
- The icon-click uses the documented-correct pattern (`side_panel.default_path` in manifest + `setPanelBehavior({openPanelOnActionClick:true})` in the background worker), so the failure is likely environmental.

## Out of Scope (Future Phases)

- **Phase 2:** Tiered "state your approach first" struggle-first flow (explain your reasoning to unlock deeper hints).
- **Phase 3:** Learning analytics — hints used, solution-reveal tracking, time spent, submission success/failure, and flagging problems to revisit.
- Cross-platform support (HackerRank, Codeforces, etc.) — someday-maybe, LeetCode-only for now.
- Managed-key backend — only if/when there's real non-technical user demand.
