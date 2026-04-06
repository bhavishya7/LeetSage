# LeetSage: Deep Dive Learning Guide

This document is maintained alongside implementation. Each section explains *what* was built, *why* it was built that way, and *how* it works. Use this as your reference for understanding the codebase.

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Chrome Extension Architecture](#2-chrome-extension-architecture)
3. [Data Flow](#3-data-flow)
4. [TypeScript Types](#4-typescript-types)
5. [Content Script & DOM Extraction](#5-content-script--dom-extraction)
6. [Background Service Worker](#6-background-service-worker)
7. [Chrome Storage](#7-chrome-storage)
8. [Progress Tracker](#8-progress-tracker)
9. [LLM Service](#9-llm-service) ← *in progress*
10. [System Prompts](#10-system-prompts)
11. [Solution Filter](#11-solution-filter)
12. [Hint System](#12-hint-system)
13. [Example Generator](#13-example-generator)
14. [Breakdown Engine](#14-breakdown-engine)
15. [React Side Panel](#15-react-side-panel)
16. [Action Panel Component](#16-action-panel-component)
17. [Content Display Component](#17-content-display-component)
18. [Settings Modal](#18-settings-modal)
19. [Chat Mode](#19-chat-mode)
20. [Stuck Timer](#20-stuck-timer)
21. [Build & Development Workflow](#21-build--development-workflow)

---

## 1. Project Overview

LeetSage is a Chrome extension that acts as an AI-powered learning companion for LeetCode. When you're on a problem page, it opens a side panel with action buttons that trigger AI-generated learning aids — hints, examples, breakdowns — without ever giving you the complete answer.

**Core philosophy:** Help you *understand* the problem, not solve it for you.

**Tech stack:**
- React 19 + TypeScript 5.8 (UI)
- Tailwind CSS 4 (styling)
- Vite 7 (build tool)
- Chrome Extension Manifest V3
- OpenAI API / Anthropic API (LLM)

---

## 2. Chrome Extension Architecture

A Chrome extension has three separate JavaScript execution contexts. They cannot share memory — they communicate only via messages and Chrome Storage.

```
┌─────────────────────────────────────────────────────┐
│                   LeetCode Page                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  Content Script (src/content/)               │   │
│  │  - Runs inside the webpage                   │   │
│  │  - Can read/modify LeetCode's DOM            │   │
│  │  - Extracts problem title, difficulty, etc.  │   │
│  │  - Sends PROBLEM_DATA message                │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         │ chrome.runtime.sendMessage
         ▼
┌─────────────────────────────────────────────────────┐
│  Background Service Worker (src/background/)         │
│  - Runs independently of any page                   │
│  - Has full Chrome API access                       │
│  - Routes messages between contexts                 │
│  - Reads/writes Chrome Storage                      │
│  - Handles keyboard shortcuts                       │
└─────────────────────────────────────────────────────┘
         │ chrome.storage.local
         ▼
┌─────────────────────────────────────────────────────┐
│  Side Panel UI (src/sidepanel/)                      │
│  - React app running in Chrome's side panel         │
│  - Reads problem data from Chrome Storage           │
│  - Calls LLM API directly                           │
│  - Displays action buttons and learning content     │
└─────────────────────────────────────────────────────┘
```

**Why this separation?**
- Content scripts can access the page DOM but not Chrome APIs
- Background workers have Chrome API access but no DOM
- UI pages have both but can't access the *webpage's* DOM
- This is a security boundary Chrome enforces

---

## 3. Data Flow

### Problem Detection Flow
```
User navigates to leetcode.com/problems/two-sum/
  → Content script runs
  → Waits for DOM elements to load (LeetCode is a React SPA)
  → Extracts: title, difficulty, description, examples, constraints
  → Sends PROBLEM_DATA message to background worker
  → Background worker saves to Chrome Storage
  → Side panel reads from Chrome Storage on mount
```

### Action Button Flow
```
User clicks "Get Hint"
  → ActionPanel calls handleActionClick('GET_HINT')
  → App retrieves problem context from state
  → LLM Service builds request with system prompt + problem context
  → Calls OpenAI API
  → Response streams back
  → Solution Filter checks for complete solutions
  → Filtered content rendered in ContentDisplay
  → Progress Tracker records 'GET_HINT' was used
  → Chrome Storage updated with new progress
```

---

## 4. TypeScript Types

**File:** `src/types/`

Types are the backbone of the app. Defining them first means every service and component knows exactly what shape data should be.

### Key types:

**`ProblemContext`** — Everything extracted from a LeetCode page:
```typescript
{
  title: "1. Two Sum",
  url: "https://leetcode.com/problems/two-sum/",
  difficulty: "Easy",
  description: "Given an array of integers...",
  examples: [{ input: "nums = [2,7,11,15]", output: "[0,1]" }],
  constraints: ["2 <= nums.length <= 10^4"],
  testCases: [...],
  extractedAt: 1712345678000
}
```

**`ActionType`** — The 7 action buttons:
```typescript
'GET_HINT' | 'GENERATE_EXAMPLES' | 'BREAK_DOWN_PROBLEM' |
'EXPLAIN_CONCEPT' | 'CHECK_APPROACH' | 'TIME_COMPLEXITY_HINT' | 'PATTERN_RECOGNITION'
```

**`LearningContent`** — AI-generated content displayed to user:
```typescript
{
  id: "abc123",
  type: "HINT",
  actionType: "GET_HINT",
  content: "## Hint 1\nThink about what data structure...",
  timestamp: 1712345678000,
  expanded: true,
  metadata: { hintLevel: 1 }
}
```

**`ProgressState`** — Per-problem tracking:
```typescript
{
  problemUrl: "https://leetcode.com/problems/two-sum/",
  usedActions: Set { 'GET_HINT', 'GENERATE_EXAMPLES' },
  hintLevel: 1,
  contentHistory: [...],
  lastUpdated: 1712345678000
}
```

**Message types** — Type-safe Chrome message passing:
```typescript
// Content → Background
{ type: 'PROBLEM_DATA', payload: ProblemContext }

// Side Panel → Background
{ type: 'GET_PROBLEM_DATA', payload: { url: string } }
{ type: 'TRACK_ACTION', payload: { problemUrl, actionType, timestamp } }
```

**Why type guards?**
```typescript
// Without type guard - TypeScript doesn't know the shape
chrome.runtime.onMessage.addListener((message) => {
  message.payload.title // ❌ Error: payload might not exist
});

// With type guard - TypeScript narrows the type
chrome.runtime.onMessage.addListener((message) => {
  if (isProblemDataMessage(message)) {
    message.payload.title // ✅ TypeScript knows this is ProblemContext
  }
});
```

---

## 5. Content Script & DOM Extraction

**Files:** `src/content/index.ts`, `src/content/extractor.ts`

### Why content scripts are tricky

LeetCode is a React single-page app (SPA). When you navigate to a problem:
1. The URL changes (e.g., `/problems/two-sum/`)
2. React re-renders the page content
3. But the browser doesn't do a full page reload

This means:
- DOM elements aren't immediately available
- We need to *wait* for them to appear
- We need to detect navigation changes (MutationObserver)

### waitForElement pattern
```typescript
function waitForElement<T extends Element>(selector: string, timeout = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const el = document.querySelector<T>(selector);
      if (el) { clearInterval(interval); resolve(el); }
      else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        reject(new Error(`Timeout: ${selector}`));
      }
    }, 500);
  });
}
```
Polls every 500ms until the element appears or times out.

### Retry with exponential backoff
```typescript
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    return await extractProblemContext();
  } catch (error) {
    const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
    await new Promise(r => setTimeout(r, delay));
  }
}
```
If extraction fails (e.g., page still loading), wait progressively longer before retrying.

### MutationObserver for SPA navigation
```typescript
const observer = new MutationObserver((mutations) => {
  // Check if new problem links appeared in the DOM
  const urlChanged = mutations.some(m =>
    Array.from(m.addedNodes).some(n =>
      n instanceof HTMLElement && n.querySelector('a[href^="/problems/"]')
    )
  );
  if (urlChanged) callback(); // Re-extract
});
observer.observe(document.body, { childList: true, subtree: true });
```

---

## 6. Background Service Worker

**File:** `src/background/index.ts`

### What it does
Acts as the central message router and storage coordinator.

### Service Worker vs Background Page
Old extensions used a persistent background page. Manifest V3 uses a *service worker* which:
- Starts when an event fires (message received, command triggered)
- Stops after ~30 seconds of inactivity
- **Cannot store state in memory** — must use Chrome Storage

### Message routing pattern
```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (isProblemDataMessage(message)) {
    saveProblemContext(message.payload)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // ← CRITICAL: tells Chrome we'll respond asynchronously
  }
});
```
The `return true` is essential — without it, Chrome closes the message channel before your async operation completes.

---

## 7. Chrome Storage

**File:** `src/services/storage.ts`

### Why not localStorage?
| Feature | localStorage | chrome.storage.local |
|---------|-------------|---------------------|
| Works in content scripts | ✅ | ✅ |
| Works in background worker | ❌ | ✅ |
| Works in side panel | ✅ | ✅ |
| Async | ❌ (blocks) | ✅ |
| Limit | 5MB | 10MB |

### The Set serialization problem
Chrome Storage uses JSON serialization. JSON doesn't support `Set`:
```typescript
JSON.stringify(new Set(['GET_HINT'])) // → "{}" ❌ Empty!
```
Solution: convert Set ↔ Array on save/load:
```typescript
// Saving
const storableProgress = { ...progress, usedActions: Array.from(progress.usedActions) };

// Loading
const progress = { ...stored, usedActions: new Set(stored.usedActions) };
```

### Storage key strategy
```typescript
// Problem data (one at a time)
"problemData" → ProblemContext

// Progress (one per problem)
"progress_https://leetcode.com/problems/two-sum/" → ProgressState

// User settings (global)
"userSettings" → UserSettings
```

---

## 8. Progress Tracker

**File:** `src/services/progress-tracker.ts`

### Why a separate service?
`storage.ts` handles *how* to persist data. `progress-tracker.ts` handles *what* to do with progress data. This separation means:
- Business logic (hint level increment) lives in one place
- Storage implementation can change without affecting tracker logic
- Easier to test each piece independently

### Hint level auto-increment
```typescript
if (actionType === 'GET_HINT') {
  progress.hintLevel = Math.min(progress.hintLevel + 1, 3); // Max 3 hints
}
```
The tracker automatically manages hint progression — the UI just calls `trackAction('GET_HINT')` and the level increments.

---

## 9. LLM Service

**File:** `src/services/llm-service.ts`

Handles all communication with the OpenAI API (or Anthropic).

### Why call the API from the side panel directly?
No backend server is needed — the user provides their own API key, stored in Chrome Storage. The side panel calls the API directly over HTTPS.

### Streaming vs non-streaming
```typescript
// Non-streaming: waits for full response (feels slow)
const response = await sendLLMRequest(request);
setContent(response.content);

// Streaming: shows text as it generates (feels fast and engaging)
for await (const chunk of streamLLMRequest(request)) {
  setContent(prev => prev + chunk);
}
```
Streaming uses the [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) format. Each line from the API looks like:
```
data: {"choices":[{"delta":{"content":"Think"}}]}
data: {"choices":[{"delta":{"content":" about"}}]}
data: [DONE]
```

### Retry logic
Network errors get 2 retries with exponential backoff (1s, 2s). Client errors (401, 429) are thrown immediately — retrying won't help.

### Error types
- `401` → Invalid API key → show settings prompt
- `429` → Rate limited → show wait message
- `AbortError` → Request timed out after 30s

---

## 10. System Prompts

**File:** `src/services/prompts.ts`

Each of the 7 action types has a specialized system prompt. This is what makes LeetSage's responses focused and educational rather than generic.

### Why separate prompts per action?
- `GET_HINT` needs to know about hint levels (1, 2, 3)
- `GENERATE_EXAMPLES` needs to produce structured output with complexity labels
- `CHECK_APPROACH` needs to review user input, not generate from scratch
- Generic prompts produce generic responses

### Solution prevention rules (in every prompt)
```
CRITICAL RULES:
1. NEVER provide a complete working code solution
2. NEVER write a full function implementation
3. You MAY provide short snippets (<10 lines) to illustrate a concept
4. You MAY provide pseudocode
```

### Problem context injection
`formatProblemContext()` converts a `ProblemContext` object into a readable string that gets appended to every user message, so the AI always knows which problem it's helping with.

---

## 11. Solution Filter

**File:** `src/services/solution-filter.ts`

A post-processing layer that checks LLM responses for complete solutions.

### Why two layers of protection?
1. System prompts tell the AI not to give solutions
2. Solution filter catches cases where the AI ignores the instruction

### What gets filtered?
- Code blocks over 20 lines
- Responses containing "here's the complete solution", "full implementation", etc.
- Complete function implementations (detected via regex patterns)

### What's allowed?
- Short snippets under 10 lines
- Pseudocode
- `CHECK_APPROACH` responses (reviewing user code is always allowed)

### Filter result
```typescript
{ filteredContent: string, wasFiltered: boolean, filterReason?: string }
```
If filtered, the content is replaced with a friendly message directing the user to use hints instead.

---

## 12. Hint System

**File:** `src/services/hint-system.ts`

Manages the 3-level progressive hint system.

### Hint levels
| Level | Name | What it covers |
|-------|------|---------------|
| 1 | Conceptual | What kind of problem is this? What data structure might help? |
| 2 | Approach | What strategy/algorithm? What are the steps? |
| 3 | Implementation | Specific techniques, edge cases, tricky parts |

### How level tracking works
- `ProgressState.hintLevel` stores the current level (0 = no hints used)
- `trackAction('GET_HINT')` increments it (max 3)
- `generateHint(context, level, apiKey)` passes the level to the LLM prompt
- The UI shows "All hints used" when `hintLevel >= 3`

---

## 13. Example Generator & Breakdown Engine

**Files:** `src/services/example-generator.ts`, `src/services/breakdown-engine.ts`

Both services follow the same pattern:
1. Call `sendLLMRequest` with the appropriate `ActionType`
2. The prompt in `prompts.ts` defines the output format
3. Return the raw markdown — the `ContentDisplay` component renders it

The LLM handles the actual generation logic. These services are thin wrappers that provide the right context.

---

## 14. React Side Panel

**File:** `src/sidepanel/App.tsx`

The root React component. Manages all global state and coordinates between components.

### State overview
```typescript
problemContext   // What problem is the user on?
progress         // What have they already tried?
learningContent  // Array of AI-generated cards to display
isLoading        // Is an API call in progress?
settings         // API key, preferences
stuckSuggestion  // Proactive suggestion from stuck timer
showChat         // Is chat mode open?
streamingId      // Which content card is currently streaming?
```

### How problem context loads
```typescript
useEffect(() => {
  // 1. Load from Chrome Storage on mount
  chrome.storage.local.get('problemData', (result) => {
    setProblemContext(result.problemData);
  });

  // 2. Listen for updates when user navigates to a new problem
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.problemData) setProblemContext(changes.problemData.newValue);
  });
}, []);
```

### The action flow (handleActionClick)
```
User clicks button
  → Set isLoading = true
  → Create empty LearningContent with unique ID
  → Add to learningContent array (shows loading card)
  → Stream from LLM API, updating content chunk by chunk
  → Run solution filter on completed response
  → Track action in progress tracker
  → Set isLoading = false
```

### Streaming UI update
```typescript
for await (const chunk of streamLLMRequest(request)) {
  fullContent += chunk;
  // Update just the streaming card, leave others unchanged
  setLearningContent(prev =>
    prev.map(c => c.id === contentId ? { ...c, content: fullContent } : c)
  );
}
```

---

## 15. Action Panel Component

**File:** `src/components/ActionPanel.tsx`

The primary UI — 7 action buttons in a 2-column grid.

### Button states
- Normal: colored background, clickable
- Used: shows ✓ checkmark in top-right corner
- Disabled: 40% opacity, not clickable (no API key, loading, or hints exhausted)
- Loading: subtle pulse animation

### Check Approach special case
This button toggles a textarea input instead of immediately calling the LLM. The user types their approach, then submits it. This is the only action that requires user input before calling the API.

### Hint level indicator
Shows 3 circles (●●●) that fill in as hints are used. When all 3 are used, the GET_HINT button is disabled and shows "All hints used".

---

## 16. Content Display Component

**File:** `src/components/ContentDisplay.tsx`

Renders AI-generated content as expandable cards.

### Custom markdown renderer
Instead of a library, we wrote a lightweight renderer that handles:
- `## Heading` → `<h2>`
- `### Heading` → `<h3>`
- `- bullet` → `<li>`
- `` `code` `` → `<code>` with monospace font
- ` ```code block``` ` → `<pre>` with dark background
- `**bold**` → `<strong>`

Why not use `react-markdown`? Keeps the bundle smaller and avoids a dependency for a side panel that needs to be lightweight.

### Streaming cursor
While a card is streaming, a blinking cursor `|` appears after the last character:
```typescript
{isStreaming && item.content && (
  <span className="inline-block w-1 h-3 bg-gray-400 animate-pulse ml-0.5" />
)}
```

### Auto-scroll
```typescript
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [content.length]); // Triggers when a new card is added
```

---

## 17. Settings Modal

**File:** `src/components/SettingsModal.tsx`

Handles API key configuration.

### API key validation
```typescript
if (provider === 'openai' && !key.startsWith('sk-')) return 'OpenAI keys start with "sk-"';
if (provider === 'anthropic' && !key.startsWith('sk-ant-')) return 'Anthropic keys start with "sk-ant-"';
```

### Security note
The API key is stored in `chrome.storage.local` — it never leaves the user's browser. It's not sent to any LeetSage server (there isn't one). It's only sent directly to OpenAI/Anthropic when making API calls.

---

## 18. Chat Mode

**File:** `src/components/ChatMode.tsx`

An optional free-form chat interface, visually secondary to the action buttons.

### How it differs from action buttons
- User types a custom question instead of clicking a preset button
- Messages appear as chat bubbles (user = blue right, assistant = gray left)
- Same solution filter applies
- Uses `EXPLAIN_CONCEPT` action type for the system prompt (general learning focus)

### Activation
A subtle "💬 Open free-form chat" link at the bottom of the side panel. Clicking it replaces the content display with the chat interface.

---

## 19. Stuck Timer

**File:** `src/services/stuck-timer.ts`

Proactively suggests help after 5 minutes of inactivity.

### How it works
```typescript
const timer = new StuckTimer((suggestion) => {
  setStuckSuggestion(suggestion); // Shows banner in UI
}, settings.enableStuckTimer);

// Start when problem loads
timer.start(problem.difficulty);

// Reset when user takes action
timer.start(problem.difficulty); // Called after every handleActionClick
```

### Rate limiting
```typescript
if (now - this.lastSuggestionTime < COOLDOWN_MS) return; // 10 min cooldown
```
Won't spam the user — maximum one suggestion per 10 minutes.

### Smart suggestions
- Easy/Medium problems → suggest `GET_HINT`
- Hard problems → suggest `BREAK_DOWN_PROBLEM`

---

## 21. Build & Development Workflow

### Building the extension
```bash
npm run build
```
Vite creates the `dist/` folder with:
- `dist/side_panel.js` — React app bundle
- `dist/background.js` — Service worker
- `dist/content.js` — Content script
- `dist/manifest.json` — Extension manifest (copied from public/)
- `dist/assets/` — CSS and other assets

### Loading in Chrome
1. Go to `chrome://extensions`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `dist/` folder
5. LeetSage appears in your extensions

### After making code changes
1. Run `npm run build`
2. Click the reload icon on LeetSage in `chrome://extensions`
3. If you changed the content script, also refresh the LeetCode tab

### Debugging each context
| Context | How to inspect |
|---------|---------------|
| Content script | Right-click LeetCode page → Inspect → Console (select content script context from dropdown) |
| Background worker | `chrome://extensions` → Click "service worker" link |
| Side panel | Right-click inside side panel → Inspect |

### Viewing Chrome Storage
DevTools → Application tab → Storage → Extension Storage → Local Storage
