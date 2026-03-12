# LeetSage Source Code Structure

## Directory Overview

```
src/
├── sidepanel/          # React app for the side panel UI
│   ├── App.tsx         # Main app component with state management
│   └── index.tsx       # Entry point for React rendering
│
├── components/         # Reusable React components
│   ├── ActionPanel.tsx       # Action buttons grid
│   ├── ContentDisplay.tsx    # Learning content renderer
│   ├── SettingsModal.tsx     # API key configuration
│   └── LoadingIndicator.tsx  # Loading states
│
├── services/           # Business logic and external integrations
│   ├── llm-service.ts        # LLM API communication
│   ├── solution-filter.ts    # Prevents complete solutions
│   ├── storage.ts            # Chrome Storage wrapper
│   ├── progress-tracker.ts   # Tracks user actions
│   ├── hint-system.ts        # Progressive hints
│   ├── example-generator.ts  # Test case generation
│   ├── breakdown-engine.ts   # Problem decomposition
│   ├── prompts.ts            # System prompts for LLM
│   └── stuck-timer.ts        # Proactive suggestions
│
├── types/              # TypeScript type definitions
│   ├── models.ts       # Core data models
│   ├── api.ts          # API interfaces
│   └── messages.ts     # Chrome message schemas
│
├── content/            # Content script (runs on LeetCode pages)
│   ├── index.ts        # Main content script
│   └── extractor.ts    # DOM extraction logic
│
└── background/         # Background service worker
    └── index.ts        # Event handlers and message routing

## Chrome Extension Architecture

### Content Script (src/content/)
- **Runs in**: LeetCode problem pages
- **Can access**: Page DOM
- **Cannot access**: Extension UI, most Chrome APIs
- **Purpose**: Extract problem data from the page

### Background Service Worker (src/background/)
- **Runs in**: Background (event-driven)
- **Can access**: All Chrome APIs
- **Cannot access**: Page DOM
- **Purpose**: Coordinate between content script and UI, handle storage

### Side Panel UI (src/sidepanel/)
- **Runs in**: Browser side panel
- **Can access**: Chrome APIs, own DOM
- **Cannot access**: Page DOM
- **Purpose**: Display UI and handle user interactions

## Data Flow

1. **Problem Detection**
   ```
   LeetCode Page → Content Script → Background Worker → Chrome Storage
   ```

2. **User Action**
   ```
   Side Panel → LLM Service → Solution Filter → Content Display
   ```

3. **Progress Tracking**
   ```
   Action Click → Progress Tracker → Chrome Storage → UI Update
   ```

## Development Workflow

1. Make code changes
2. Run `npm run build` to create `dist/` folder
3. Go to `chrome://extensions`
4. Click "Reload" on LeetSage extension
5. Refresh LeetCode page (if content script changed)
6. Test your changes

## Key Files to Start With

- `src/types/models.ts` - Understand the data structures
- `src/content/extractor.ts` - See how we extract problem data
- `src/sidepanel/App.tsx` - Main UI component
- `src/services/llm-service.ts` - LLM integration
