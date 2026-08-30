# LeetSage Phase 1 — Implementation Record

Status: **COMPLETE** — all tasks done, verified live in Chrome, committed on
`feature/gemini-provider` (commits: Gemini wiring, then UI + guardrails + theme).

## Tasks

- [x] **1. Fix the side-panel icon-click.**
  Root cause was NOT the click wiring — the MV3 service worker was crashing on
  load. The bundled `background.js` uses ES `import`, but `manifest.json`
  declared a classic (non-module) service worker, so the worker never
  registered (showed permanently "Inactive", no errors visible until we read
  the built output). Fix: add `"type": "module"` to the manifest's `background`
  block. Also set `sidePanel.setOptions({enabled:true})` then
  `setPanelBehavior({openPanelOnActionClick:true})` on install + startup.
  Do NOT also register `chrome.action.onClicked` — it conflicts with
  `openPanelOnActionClick` and suppresses the native open.

- [x] **2. Wire up Gemini provider.**
  `llm-service.ts` targets the OpenAI-compatible endpoint
  `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
  with `Authorization: Bearer <key>`. Keeps streaming (SSE) + non-streaming.

- [x] **3. API key + model settings.**
  Settings stores the Gemini key + chosen model; model switcher offers
  Flash-Lite / Flash. Key validation is intentionally loose (non-empty only) —
  we let Gemini reject bad keys rather than hardcoding a prefix.

- [x] **4. End-to-end AI response.**
  Action/chat → Gemini stream → solution filter → rendered card. Verified live.

- [x] **5. Free-tier guardrails.**
  `rate-limiter.ts`: kill switch, per-day cap, per-minute cap, cooldown, all
  checked before each call; token cap + timeout passed per request; usage
  persisted per-day in `chrome.storage` with a live header counter. All limits
  adjustable in Settings; kill switch off by default.

- [x] **6. Chat-hybrid UI redesign.**
  Unified layout: header, problem-context bar, scrollable content stream,
  bottom input bar with quick-command chips + free-form text input. Replaced
  the button-grid ActionPanel and the separate ChatMode.

- [x] **7. Theme toggle.**
  Tailwind v4 class-based dark mode (`@custom-variant dark`); manual light/dark
  toggle in the header, defaults to dark, persisted.

- [x] **8. Polish + verify.**
  Suppressed harmless "Extension context invalidated" reload noise; deleted
  dead popup-era code (`src/App.tsx`, `App.css`, `Popup.tsx`); clean build;
  full manual test in Chrome.

## Key learnings (do not lose these)

1. **MV3 + ES modules:** a service worker that uses `import` REQUIRES
   `"type": "module"` in the manifest, or it silently fails to register.

2. **Gemini model names drift.** `gemini-2.5-flash-lite` is deprecated for new
   users and returns **404** ("no longer available to new users"). Phase 1 uses
   `gemini-3.5-flash-lite` / `gemini-3.5-flash`. If you get a 404, check the
   current model list at ai.google.dev/gemini-api/docs/models FIRST.

3. **Gemini `AQ.` API keys.** As of 2026 Google AI Studio only issues keys
   starting with `AQ.` (legacy `AIza` keys are being retired ~Sept 2026). The
   `AQ.` key works fine with `Bearer` auth on the OpenAI-compat endpoint — an
   earlier 404 we chased was purely the stale model name, not the key.

4. **Content-script injection timing.** Chrome only auto-injects content
   scripts on fresh page loads. Tabs open BEFORE the extension loads/reloads
   have no content script. The side panel handles this by (a) pulling data on
   demand with retry/backoff and (b) injecting `content.js` via
   `chrome.scripting.executeScript` when it gets "Receiving end does not exist".

5. **Service worker "Inactive" is normal.** MV3 workers sleep after ~30s idle.
   The pull-based flow + `chrome.storage` persistence means nothing depends on
   the worker being awake.

## Build / dev notes

- Build with `npm.cmd run build` (plain `npm` is blocked by the PowerShell
  execution policy on this machine).
- Test in the user's real Chrome (the MCP-controlled Chrome cannot reliably
  load the unpacked extension). After a rebuild: reload at `chrome://extensions`;
  for stale-tab issues, remove + re-add unpacked and hard-refresh the LeetCode tab.
- `.kiro/settings/` (MCP config) is gitignored — machine-specific.

## BYOK decision (recap)

Phase 1 is bring-your-own-key: a client-side extension can't hide a secret, and
a managed key would need a backend (cost, abuse surface). Each user's own free
Gemini quota = zero cost/liability. Revisit a managed backend only if there's
real non-technical-user demand. Full rationale in `requirements.md`.
