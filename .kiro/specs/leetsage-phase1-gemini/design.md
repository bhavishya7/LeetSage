# LeetSage Phase 1 — Design

## Architecture Overview

Phase 1 keeps the existing extension architecture (content script → background worker → side panel, communicating via messages + Chrome storage) and layers on:

- A **Gemini-backed LLM service** (OpenAI-compatible endpoint).
- A **rate-limiter / usage-tracker service** for free-tier guardrails.
- A **redesigned chat-hybrid side-panel UI** with theming.

The pull-based problem-data flow (side panel requests `REQUEST_PROBLEM_DATA` from the content script) is already working and is preserved.

## Components

### 1. LLM Service (`src/services/llm-service.ts`) — modified
- Base URL: `https://generativelanguage.googleapis.com/v1beta/openai/`
- Auth: `Authorization: Bearer <geminiApiKey>`
- Default model: `gemini-2.5-flash-lite`; alt: `gemini-2.5-flash`
- Keep the streaming (SSE) generator and non-streaming paths.
- Before every request, consult the rate limiter; abort if blocked.
- Enforce a per-response `max_tokens` cap and a hard timeout.

### 2. Rate Limiter / Usage Tracker (`src/services/rate-limiter.ts`) — new
- Tracks request timestamps and a per-day counter, persisted in Chrome storage (survives service-worker sleep).
- Enforces: per-minute cap, per-day cap, minimum cooldown between requests.
- Exposes: `canMakeRequest()`, `recordRequest()`, `getUsageToday()`, and a `killSwitch` check.
- All limits read from `UserSettings` (adjustable). Kill switch defaults off.
- Daily counter resets at local midnight.

### 3. Settings (`src/types/api.ts` UserSettings, `SettingsModal.tsx`) — modified
- `APIConfig.provider` → `'gemini'`; add `model: 'gemini-2.5-flash-lite' | 'gemini-2.5-flash'`.
- New guardrail settings: `maxTokens`, `maxRequestsPerMinute`, `maxRequestsPerDay`, `cooldownMs`, `requestTimeoutMs`, `killSwitch`.
- New `theme: 'light' | 'dark'` (default `'dark'`).
- Gemini key validation (Gemini keys typically start with `AIza`).

### 4. Chat-Hybrid UI (`src/sidepanel/App.tsx`, components) — redesigned
- Primary surface: a single text input at the bottom (chat-style).
- Above/around it: the 7 actions as compact **quick-command chips**.
- Responses stream into **structured hint cards** (reusing existing card styling, decluttered).
- A slim header with usage counter ("X/Y today"), theme toggle, and settings gear.
- Dark theme by default; theme applied via a root class + Tailwind `dark:` variants or CSS variables.

### 5. Icon-Click Fix (`src/background/index.ts`, `public/manifest.json`)
- Diagnose via service-worker console. Confirm `setPanelBehavior` result.
- Keep the documented pattern; if environmental, document right-click / keyboard as the definitive method and ensure at least one reliable path.

## Data Model Additions

```
UserSettings {
  apiConfig: { provider: 'gemini'; apiKey: string; model: 'gemini-2.5-flash-lite' | 'gemini-2.5-flash' }
  theme: 'light' | 'dark'
  guardrails: {
    maxTokens: number            // e.g. 800
    maxRequestsPerMinute: number // e.g. 8
    maxRequestsPerDay: number    // e.g. 200 (generous, under free tier)
    cooldownMs: number           // e.g. 2000
    requestTimeoutMs: number     // e.g. 20000
    killSwitch: boolean          // default false
  }
}

UsageState (storage key: usage_YYYY-MM-DD) {
  date: string
  count: number
  recentTimestamps: number[]   // for per-minute window
}
```

## Guardrail Defaults (generous but safe)

| Setting | Default | Rationale |
|---|---|---|
| maxTokens | 800 | Plenty for a hint; caps runaway responses |
| maxRequestsPerMinute | 8 | Under Flash-Lite's ~15/min |
| maxRequestsPerDay | 200 | Under Flash-Lite's ~1000/day, generous for personal use |
| cooldownMs | 2000 | Prevents rapid-fire/stuck loops |
| requestTimeoutMs | 20000 | Nothing hangs |
| killSwitch | false | Off by default; instant stop when needed |

## Testing Strategy

- Build must compile clean (`npm.cmd run build`).
- Manual end-to-end test in the user's real Chrome (MCP can't host the extension).
- Verify: icon/right-click opens panel → problem shows → type or tap chip → real Gemini hint streams in → solution filter applied → usage counter increments → exceeding a test limit blocks gracefully → theme toggle persists.
