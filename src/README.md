# LeetSage Source Code Structure

## Directory Overview

```
src/
├── sidepanel/          # React app for the side panel UI
│   ├── App.tsx         # Root component — global state + all coordination
│   └── index.tsx       # React entry point
│
├── components/         # React components
│   ├── QuickActions.tsx      # The action-chip bar (primary + "More" overflow)
│   ├── ContentDisplay.tsx    # Renders hint cards, chat bubbles, complexity badges
│   ├── SettingsModal.tsx     # Gemini key, model, theme, guardrail settings
│   ├── ExampleComparison.tsx # Side-by-side example view
│   └── LoadingIndicator.tsx  # Loading state
│
├── services/           # Business logic and external integrations
│   ├── llm-service.ts        # Google Gemini API (streaming + non-streaming)
│   ├── code-extractor.ts     # Reads the user's Monaco editor code (MAIN-world inject)
│   ├── solution-filter.ts    # Prevents complete-solution / full-pseudocode leaks
│   ├── rate-limiter.ts       # Free-tier guardrails: caps, cooldown, usage counter
│   ├── storage.ts            # Chrome Storage wrapper (settings, progress, usage)
│   ├── progress-tracker.ts   # Per-problem action + content history
│   ├── hint-system.ts        # Progressive hint helpers
│   ├── example-generator.ts  # Example generation helper
│   ├── breakdown-engine.ts   # Problem decomposition helper
│   ├── prompts.ts            # System + user prompts per action, output rules
│   └── stuck-timer.ts        # Proactive "stuck?" suggestions
│
├── types/              # TypeScript type definitions
│   ├── models.ts       # Core data models (ProblemContext, ActionType, etc.)
│   ├── api.ts          # LLM request/response, settings, guardrails, usage
│   ├── messages.ts     # Chrome message schemas + type guards
│   └── index.ts        # Barrel exports
│
├── content/            # Content script (runs on LeetCode pages)
│   ├── index.ts        # Entry: extract on load, respond to pull requests
│   └── extractor.ts    # DOM extraction + normalizeProblemUrl()
│
└── background/         # Background service worker
    └── index.ts        # Side-panel open behavior + message routing
```

## Chrome Extension Architecture

### Content Script (src/content/)
- **Runs in**: LeetCode problem pages
- **Can access**: page DOM (problem text, and the Monaco editor)
- **Purpose**: extract the problem; respond to the side panel's on-demand
  `REQUEST_PROBLEM_DATA` requests

### Background Service Worker (src/background/)
- **Runs in**: background (event-driven, sleeps when idle — normal for MV3)
- **Can access**: all Chrome APIs; **cannot** access page DOM
- **Purpose**: enable the side panel on toolbar click, route messages, storage
- Requires `"type": "module"` in the manifest (it ships as an ES module)

### Side Panel UI (src/sidepanel/)
- **Runs in**: the browser side panel
- **Purpose**: the UI; calls Gemini directly with the user's key; renders streamed responses

## Data Flow

1. **Problem detection (pull-based — robust against the worker sleeping)**
   ```
   Side Panel  --REQUEST_PROBLEM_DATA-->  Content Script  -->  extracted problem
   (also caches to Chrome Storage as a fast-path fallback)
   ```
   The problem URL is normalized to `/problems/{slug}/` so submissions (which
   change the URL) don't look like a new problem and wipe your session.

2. **A coaching action**
   ```
   Side Panel -> rate-limiter check -> (extract code if needed)
              -> Gemini stream -> solution filter -> rendered card
              -> progress saved to Chrome Storage
   ```

## Development Workflow

1. Make code changes
2. Build: `npm run build` (on Windows PowerShell: `npm.cmd run build`)
3. Go to `chrome://extensions` → click **Reload** on LeetSage
4. If you changed the content script, also refresh the LeetCode tab
5. For tabs open before a reload, remove + re-add unpacked (Chrome only
   auto-injects content scripts on fresh loads)

## Key Files to Start With

- `src/types/models.ts` — the core data shapes
- `src/content/extractor.ts` — how problem data (and the stable URL key) is produced
- `src/sidepanel/App.tsx` — the main UI + all action handlers
- `src/services/llm-service.ts` + `src/services/prompts.ts` — the Gemini integration and coaching prompts
