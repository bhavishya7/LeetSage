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
9. [LLM Service](#9-llm-service)
10. [System Prompts](#10-system-prompts)
11. [Solution Filter](#11-solution-filter)
12. [Hint System](#12-hint-system)
13. [Example Generator & Breakdown Engine](#13-example-generator--breakdown-engine)
14. [React Side Panel](#14-react-side-panel)
15. [Quick Actions Component](#15-quick-actions-component)
16. [Content Display Component](#16-content-display-component)
17. [Settings Modal](#17-settings-modal)
18. [Chat Mode](#18-chat-mode)
19. [Stuck Timer](#19-stuck-timer)
20. [Build & Development Workflow](#20-build--development-workflow)
30. [Structured Output Pipeline](#30-structured-output-pipeline)
31. [Progress Tracking: Records, My Progress, Analytics](#31-progress-tracking-records-my-progress-analytics)

---

## 1. Project Overview

LeetSage is a Chrome extension that acts as an AI-powered learning companion for LeetCode. When you're on a problem page, it opens a side panel with action buttons that trigger AI-generated learning aids — hints, examples, breakdowns — without ever giving you the complete answer.

**Core philosophy:** Help you *understand* the problem, not solve it for you.

**Tech stack:**
- React 19 + TypeScript 5.8 (UI)
- Tailwind CSS 4 (styling)
- Vite 7 (build tool)
- Chrome Extension Manifest V3
- Google Gemini via its OpenAI-compatible endpoint (LLM) — bring-your-own-key, no backend. Base URL `https://generativelanguage.googleapis.com/v1beta/openai`; models `gemini-3.5-flash-lite` (default) / `gemini-3.5-flash`.

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
│  │  - Caches the latest extraction and answers  │   │
│  │    REQUEST_PROBLEM_DATA pulls from the panel │   │
│  │  - Also best-effort pushes a PROBLEM_DATA msg│   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         │ chrome.runtime.sendMessage (best-effort push)
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
│  - PULLS problem data on demand from the content    │
│    script (REQUEST_PROBLEM_DATA + retry/backoff),   │
│    with a chrome.scripting inject fallback          │
│  - Reads a cached copy from Chrome Storage as a     │
│    fast first paint                                 │
│  - Calls the Gemini API directly (OpenAI-compatible)│
│  - Displays action chips and learning content       │
└─────────────────────────────────────────────────────┘
```

**Why this separation?**
- Content scripts can access the page DOM but not Chrome APIs
- Background workers have Chrome API access but no DOM
- UI pages have both but can't access the *webpage's* DOM
- This is a security boundary Chrome enforces

---

## 3. Data Flow

### Problem Detection Flow (pull-based)

The shipped model is **pull-based**, not push-only. The side panel actively
requests problem data from the content script when it's ready, which sidesteps
the Manifest V3 race where the background service worker is asleep at page-load
time (so a fire-and-forget push can be dropped).

```
User navigates to leetcode.com/problems/two-sum/
  → Content script runs, waits for DOM (LeetCode is a React SPA)
  → Extracts: title, difficulty, description, examples, constraints
  → Caches that extraction in-memory; ALSO best-effort pushes a
    PROBLEM_DATA message (may be dropped if the worker is asleep)
  → Side panel PULLS on demand: sends REQUEST_PROBLEM_DATA to the tab,
    with retry/backoff (up to 6 attempts, ~700ms apart)
  → Content script answers with its cached problem (or extracts on the spot)
  → If the tab has no content script ("Receiving end does not exist" —
    common on tabs open before the extension loaded), the panel injects
    content.js via chrome.scripting.executeScript, then retries
  → A cached copy in chrome.storage.local ('problemData') is also read on
    mount for a fast first paint, and storage-change events are still honored
```

### Action / Chip Flow
```
User clicks a quick-action chip (e.g. "Hint")
  → QuickActions calls handleActionClick('GET_HINT')
  → App checks rate-limit guardrails (kill switch, daily/minute caps, cooldown)
  → For code-aware actions (CHECK_APPROACH / UNDERSTAND_SOLUTION /
    GENERATE_REPORT) it first reads the editor code via code-extractor
  → LLM Service builds the request with the action's system prompt + context
  → Calls the Gemini API (OpenAI-compatible endpoint), streaming
  → Response streams back chunk by chunk into the card
  → Solution Filter checks the finished response (skipped for the
    solution-exempt actions)
  → Filtered content rendered in ContentDisplay
  → Progress Tracker records the action was used (and bumps hint level)
  → chrome.storage.local updated with new progress + content history
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

**`ActionType`** — The 9 actions (see `src/types/models.ts`):
```typescript
'GET_HINT' | 'GENERATE_EXAMPLES' | 'BREAK_DOWN_PROBLEM' |
'EXPLAIN_CONCEPT' | 'CHECK_APPROACH' | 'TIME_COMPLEXITY_HINT' |
'PATTERN_RECOGNITION' | 'UNDERSTAND_SOLUTION' | 'GENERATE_REPORT'
```
The two newest ones are code-aware learning modes:
- `UNDERSTAND_SOLUTION` — explains the *optimal* solution (analogy, key insight,
  why it works, complexity), treating the user's editor code only as untrusted
  light context (never asserting it's correct).
- `GENERATE_REPORT` — produces a compact study-note / progress report for the
  problem, meant to be copied into personal notes.

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

Handles all communication with Google Gemini via its OpenAI-compatible endpoint
(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`),
which keeps the standard chat-completions request/response shape. Default model
is `gemini-3.5-flash-lite`.

### Why call the API from the side panel directly?
No backend server is needed — the user provides their own Gemini API key, stored in Chrome Storage. The side panel calls the API directly over HTTPS.

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
- `401` / `403` → Invalid or unauthorized Gemini API key → show settings prompt
- `429` → Rate limit / free-tier quota reached → show wait message
- `AbortError` → Request timed out (default 20s, from `DEFAULT_TIMEOUT_MS` / `requestTimeoutMs`)

---

## 10. System Prompts

**File:** `src/services/prompts.ts`

Each of the 9 action types has a specialized system prompt. This is what makes LeetSage's responses focused and educational rather than generic.

### Why separate prompts per action?
- `GET_HINT` needs to know about hint levels (1, 2, 3)
- `GENERATE_EXAMPLES` needs to produce structured output with complexity labels
- `CHECK_APPROACH` reviews the user's *current editor code* (read via
  `code-extractor`) before submission, and coaches without rewriting it
- `UNDERSTAND_SOLUTION` explains the optimal solution and treats the user's
  code as untrusted context (never claims it's correct)
- `GENERATE_REPORT` records the solution as a study note (solution included by
  design)
- Generic prompts produce generic responses

There's also a shared `OUTPUT_RULES` block injected into every prompt (output
only the final answer, no LaTeX/dollar signs, always give both time AND space
complexity), plus the `SOLUTION_PREVENTION_RULES` and `TONE_GUIDELINES` blocks.

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
- Solution-revealing phrases ("here's the complete solution", "full implementation", etc.)
- Code blocks longer than `MAX_CODE_BLOCK_LINES` (14 non-blank lines)
- Complete function implementations (detected via regex for Python/JS/Java-style
  bodies over `MAX_SNIPPET_LINES` = 8 lines)
- Full step-by-step pseudocode of the algorithm — a block (fenced *or* plain
  prose) that combines a loop, a branch, and a return/result across enough lines
  to constitute the whole procedure (`looksLikeFullPseudocode`)

### What's allowed?
- Short snippets
- Pseudocode that illustrates one idea rather than the whole algorithm
- The **solution-exempt actions** — `CHECK_APPROACH`, `UNDERSTAND_SOLUTION`, and
  `GENERATE_REPORT` — bypass the filter entirely, because analyzing/explaining
  the user's own code, teaching the optimal solution, or recording it as a study
  note all legitimately involve solution content

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
streamingId      // Which content card is currently streaming?
chatInput        // Free-form question text in the bottom input
hasCode          // Does the editor currently have code? (surfaces code-aware chips)
usageCount       // AI requests used today (shown in the header)
```

### How problem context loads (pull-based, with fallbacks)
```typescript
useEffect(() => {
  // 1. Fast path: paint whatever is cached in storage immediately.
  chrome.storage.local.get('problemData', (result) => {
    if (result.problemData) applyProblem(result.problemData);
  });

  // 2. Reliable path: actively PULL from the active tab's content script
  //    (REQUEST_PROBLEM_DATA) with retry/backoff, and inject content.js via
  //    chrome.scripting if the tab has no content script yet.
  pullFromActiveTab();
  refreshHasCode();

  // 3. Re-pull on tab switch / navigation completion.
  chrome.tabs.onActivated.addListener(onActivated);
  chrome.tabs.onUpdated.addListener(onUpdated);

  // 4. Still honor storage-change pushes as a bonus.
  chrome.storage.onChanged.addListener(storageListener);
}, [...]);
```
`applyProblem` compares the normalized `/problems/{slug}/` URL so re-extraction
after a submission doesn't wipe the live session; a genuinely different problem
resets the transient content and loads that problem's saved progress.

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

## 15. Quick Actions Component

**File:** `src/components/QuickActions.tsx`

> Note: the old two-column `ActionPanel.tsx` grid was replaced by `QuickActions`
> — a compact chip row in the bottom bar. See §24 (Chat-Hybrid UI) for the
> layout it lives in.

The actions render as compact chips split into a **primary** row (always
visible) and a **secondary** set hidden behind a "More ▾" toggle:
- Primary: `GET_HINT`, `BREAK_DOWN_PROBLEM`, `CHECK_APPROACH` ("Analyze my
  code"), `UNDERSTAND_SOLUTION` ("Understand solution").
- Secondary: `GENERATE_EXAMPLES`, `EXPLAIN_CONCEPT`, `TIME_COMPLEXITY_HINT`,
  `PATTERN_RECOGNITION`, `GENERATE_REPORT` ("Generate report").

### Chip states
- Normal: outline/filled chip, clickable
- Used: shows a ✓ next to the label (from `progress.usedActions`)
- Disabled: 40% opacity (no API key, loading, or — for Get Hint — hints exhausted at level 3)

### Context-aware ordering
When the editor has code (`hasCode`), the code-aware chips (`CHECK_APPROACH`,
`UNDERSTAND_SOLUTION`) are sorted to the front of the primary row and get a
highlighted accent, so the most relevant actions surface first.

### Check Approach — no textarea
`CHECK_APPROACH` no longer opens a textarea. It reads the user's *current Monaco
editor code* directly via `code-extractor` (see §28) and sends that for
analysis. `UNDERSTAND_SOLUTION` and `GENERATE_REPORT` read the editor the same
way.

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

### Copy button
Each finished card shows a small copy button (⧉ → ✓ for ~1.5s) that writes the
card's raw markdown to the clipboard via `navigator.clipboard.writeText`. This
pairs with `GENERATE_REPORT`: generate a study note, then copy it straight into
your own notes. The click stops propagation so it doesn't also toggle the card's
expand/collapse.

### Complexity + math rendering
The renderer also styles Big-O notation (`O(N^2)` → `O(N²)` badge) and defensively
converts stray inline LaTeX (`$...$`, `\(...\)`) into inline code, since the model
occasionally emits it despite the prompt asking for plain text.

### Auto-scroll
```typescript
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [content.length, streamingId]); // New card added, or streaming progresses
```

---

## 17. Settings Modal

**File:** `src/components/SettingsModal.tsx`

Handles Gemini API key + model selection and the free-tier guardrails.

### What it configures
- **Gemini model** dropdown: `gemini-3.5-flash-lite` (default) or `gemini-3.5-flash`.
- **Gemini API key** (password field). Validation is minimal — it just requires
  a non-empty key (Google's `AQ.`/`AIza` formats both work), so there's no
  provider-prefix check.
- **Kill switch** (pause all AI requests), proactive-suggestions toggle, and a
  collapsible "usage limits" panel that edits the guardrails (max tokens,
  requests/minute, requests/day, cooldown, timeout, reset-to-defaults).

### Security note
The API key is stored in `chrome.storage.local` — it never leaves the user's browser. It's not sent to any LeetSage server (there isn't one). It's only sent directly to Google when making Gemini API calls.

---

## 18. Chat Mode (free-form question input)

> Note: the separate `ChatMode.tsx` component is gone. Free-form questions are
> now a persistent input in the bottom bar of `App.tsx` (see §24), not a mode
> that replaces the content display.

### How it differs from the quick-action chips
- User types a custom question in the always-present "Ask a question…" input
  instead of clicking a preset chip
- The question renders as a blue right-aligned user bubble; the answer streams
  into a card below it
- Same solution filter applies
- Implemented via `LLMRequest.userQuery`, which `llm-service` substitutes for
  the templated message (still grounded by prepending the problem context), with
  `EXPLAIN_CONCEPT` as the system-prompt action

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

## 20. Build & Development Workflow

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


---

# Phase 1 Additions — Gemini, Guardrails, Chat-Hybrid UI, Theme

This section documents what changed in Phase 1 (the "make it actually usable on
the free tier" milestone). It builds on the architecture above.

## 22. LLM Provider: Google Gemini (free-tier, BYOK)

**File:** `src/services/llm-service.ts`

LeetSage calls Google Gemini through its **OpenAI-compatible endpoint**, so the
request/response shape is the familiar chat-completions format:

```
POST https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
Authorization: Bearer <user's Gemini API key>
{ "model": "gemini-3.5-flash-lite", "messages": [...], "max_tokens": 800, "stream": true }
```

### Bring-your-own-key (BYOK)
Each user supplies their own Gemini key (from aistudio.google.com — free, no
billing). Why not ship one key? A client-side extension can't hide a secret;
a shared key would be extracted and abused. A managed key would need a backend
(cost + abuse surface). BYOK = each user's own free quota = zero cost/liability.

### Gotchas learned the hard way
- **Model names drift.** `gemini-2.5-flash-lite` is deprecated for new users and
  returns **404**. Phase 1 uses `gemini-3.5-flash-lite` / `gemini-3.5-flash`.
  Always check ai.google.dev/gemini-api/docs/models for current names.
- **`AQ.` keys.** Google AI Studio now issues keys starting with `AQ.` (the old
  `AIza` format is being retired). `AQ.` works fine with `Bearer` auth here.

## 23. Free-Tier Guardrails

**File:** `src/services/rate-limiter.ts` (+ types in `types/api.ts`)

Protects the free tier from accidental overuse. All limits live in
`UserSettings.guardrails` and are adjustable; defaults (`DEFAULT_GUARDRAILS`):

| Guardrail | Default | Purpose |
|-----------|---------|---------|
| maxTokens | 800 | caps response length |
| maxRequestsPerMinute | 8 | under Gemini's ~15/min |
| maxRequestsPerDay | 200 | under Gemini's ~1000/day |
| cooldownMs | 2000 | gap between requests |
| requestTimeoutMs | 20000 | nothing hangs |
| killSwitch | false | instant stop-all when on |

`checkRateLimit()` runs before every call in this order: kill switch → daily cap
→ per-minute cap → cooldown. `recordRequest()` increments a per-day counter
persisted in `chrome.storage` (key `usage_YYYY-MM-DD`), so it survives the
service worker sleeping. The header shows a live "X/Y today" counter.

## 24. Chat-Hybrid UI

**Files:** `src/sidepanel/App.tsx`, `src/components/QuickActions.tsx`,
`src/components/ContentDisplay.tsx`

The button-grid ActionPanel and separate ChatMode were replaced by one unified
layout:

```
┌─────────────────────────────────┐
│ Header: logo · usage · theme · ⚙ │
├─────────────────────────────────┤
│ Problem: "1768. ..."     Medium │
├─────────────────────────────────┤
│                                 │
│   Content stream (cards +       │  ← scrollable
│   user chat bubbles)            │
│                                 │
├─────────────────────────────────┤
│ [Hint][Examples][Break down]... │  ← quick-command chips
│ [ Ask a question…        ][Send]│  ← free-form input
└─────────────────────────────────┘
```

- **QuickActions** = the 9 actions as compact chips, split into a primary row
  plus a "More ▾" set (checkmark when used; Get Hint disables at 3 hints).
- **Free-form input** streams a coaching answer; the question shows as a blue
  user bubble. Implemented via `LLMRequest.userQuery`, which `llm-service`
  substitutes for the templated message (still grounded with problem context).
- Design stays distinct from "Ask Leet": structured coaching cards + the
  no-solutions filter, not a generic solve-it chatbot.

## 25. Theme (dark/light)

**Files:** `src/index.css`, `src/sidepanel/App.tsx`

Tailwind v4 class-based dark mode via `@custom-variant dark (&:where(.dark, .dark *))`.
The app root toggles a `dark` class from `settings.theme` (default dark). A
☀️/🌙 header button flips and persists it. All components carry `dark:` variants.

## 26. Content-Script Injection Resilience (Phase 1 fix)

**Files:** `src/content/index.ts`, `src/sidepanel/App.tsx`

Chrome only auto-injects content scripts on fresh page loads, so tabs open
before the extension loaded have none. The side panel:
1. Pulls problem data on demand (`REQUEST_PROBLEM_DATA`) with retry/backoff.
2. If it gets "Receiving end does not exist", injects `content.js` via
   `chrome.scripting.executeScript`, then retries.

This is why the panel now reliably shows the problem even on already-open tabs.

## 27. The Manifest V3 `type: module` Fix (the big one)

The service worker was crashing on load — permanently "Inactive", breaking the
icon-click AND the push data flow. Cause: the bundled `background.js` uses ES
`import`, which requires `"type": "module"` in the manifest's `background`
block. Without it, the worker never registers. This single line was the root of
multiple symptoms we chased. Lesson: if an MV3 service worker won't start, check
whether it uses `import` and whether the manifest declares it as a module.

## 28. Pre-Submission Code Analysis (code-extractor)

**File:** `src/services/code-extractor.ts`

The code-aware actions (`CHECK_APPROACH`, `UNDERSTAND_SOLUTION`,
`GENERATE_REPORT`) read the user's *current* code straight from LeetCode's Monaco
editor, before they submit.

### Why MAIN-world injection
Monaco's full document (including lines scrolled off-screen) is only reliably
available via `window.monaco.editor.getModels()[0].getValue()`. But
`window.monaco` lives in the *page's* JS world, which content scripts (isolated
world) can't touch. So `extractCurrentCode(tabId)` uses
`chrome.scripting.executeScript` with `world: 'MAIN'` to run a self-contained
reader in the page and return `{ code, language }`.

Fallbacks inside the injected function: if the Monaco global isn't reachable, it
reconstructs the visible text from the rendered `.view-lines` DOM, and derives the
language from the toolbar's language button if Monaco didn't provide it.

### How it's wired
`App.tsx` calls this before firing a code-aware action (to attach `userCode` /
`codeLanguage` to the request) and also runs a cheap `refreshHasCode()` on
load/tab-change so `QuickActions` can surface the code-aware chips first.

### How each mode treats the code
- `CHECK_APPROACH` — coaches on the (possibly incomplete) code without rewriting it.
- `UNDERSTAND_SOLUTION` — explains the *optimal* solution and treats the editor
  code as untrusted context; the prompt explicitly forbids claiming it's correct.
- `GENERATE_REPORT` — records the code as part of a saveable study note.

## 29. What's designed but NOT yet shipped

To keep this guide honest: a couple of capabilities are **designed/planned**, not
built. Don't describe them as implemented.
- **Structured output — now partially shipped (2026-09-03).** Two actions
  (`CHECK_APPROACH`, `UNDERSTAND_SOLUTION`) *do* emit a validated JSON `data` block
  now — see [§30](#30-structured-output-pipeline). The remaining actions
  (hints/examples/breakdown/concept/chat) are still prose-only markdown by design,
  and prose↔data consistency is a prompt instruction, not a render-from-data
  guarantee.
- **Persistent, cross-session progress records + analytics — now shipped
  (2026-09-04).** Per-problem `ProblemRecord`s, a "My Progress" view, and a
  deterministic "weakest link" analytics pass are built — see
  [§31](#31-progress-tracking-records-my-progress-analytics). What's still *not*
  built: **Phase D** verified-submission auto-save (so attempt outcomes are
  inferred, not verified — which is why the attempt count is withheld from the UI),
  export-to-file, and the "struggle-first" hint gating in the Phase 2 spec.

## Roadmap (future specs)

- **Phase 2** (`.kiro/specs/leetsage-phase2-struggle-first/`): tiered
  "explain your approach to unlock deeper hints" gate — the coaching identity.
- **Phase 3** (`.kiro/specs/leetsage-phase3-analytics/`): learning analytics —
  hints used, solution-revealed, time, submissions, and "problems to revisit".
- Cross-platform (HackerRank, etc.) and a managed-key backend remain
  someday-maybe, demand-dependent.

---

## 30. Structured Output Pipeline

**Files:** `src/types/models.ts` · `src/types/api.ts` · `src/services/structured-parser.ts` · `src/services/prompts.ts` · `src/services/session-digest.ts` · `src/services/llm-service.ts` · `src/sidepanel/App.tsx`
**Spec:** `.kiro/specs/leetsage-structured-output/` · **Shipped:** 2026-09-03

### Why this exists

The "Generate report" action (§28, §8) originally produced **generic, textbook
writeups** — it ignored what the developer actually did this session. The root
cause wasn't the report prompt; it was architectural: **every action returned
freeform prose with no machine-readable data.** The report had nothing
session-specific to read, so it fell back to generic content.

The fix is a **hybrid response**: the two report-feeding actions return the human
prose *plus* a small, schema-conforming JSON `data` block. That `data` becomes a
**single source of truth** every downstream consumer reads — today the report,
later the progress records, analytics, and evals — instead of re-parsing prose.
Only 2 actions are structured (`CHECK_APPROACH`, `UNDERSTAND_SOLUTION`); the rest
stay prose-only by design (incremental migration driven by consumers).

### The end-to-end flow

```
prompt (asks for prose + trailing ```leetsage-data JSON block)
   │
   ▼
LLM stream  ──► App.tsx streams chunks
   │                │
   │                ├─ stripDataBlockForDisplay()  ← hides the JSON fence
   │                │     while streaming so raw JSON never flashes
   │                ▼
   │           user sees prose updating live
   ▼
stream ends ──► parseStructuredResponse(raw, actionType)
                     │  split prose | JSON  →  JSON.parse  →  validate/normalize
                     │  (never throws; bad block ⇒ prose-only)
                     ▼
              store { prose, data } → card.content = prose
                                      card.metadata.structured = data
                                      persist to chrome.storage.local
                     │
                     ▼
GENERATE_REPORT ──► buildSessionDigest(history, progress)  ← reads metadata.structured
                     │  deterministic, no extra LLM call
                     ▼
                report prompt gets a "SESSION ACTIVITY" block → session-aware report
```

### 1. The contract (`src/types/models.ts`)

- `StructuredResponse<T>` — the conceptual shape: `{ prose, data? }`.
- `Complexity` — `{ time, space }` strings.
- `ProblemPattern` — a **closed vocabulary** (`'Hash Map' | 'Two Pointers' | … | 'Other'`).
  Closed on purpose: analytics and "weakest link" grouping need a stable set, not
  free text.
- `AnalyzeData` (for `CHECK_APPROACH`) — `approachDetected`, `currentComplexity`,
  `optimalComplexity`, `issues[]`, `onOptimalPath`.
- `UnderstandData` (for `UNDERSTAND_SOLUTION`) — `patterns[]`, `keyInsight`,
  `optimalComplexity`.
- `StructuredData = AnalyzeData | UnderstandData`, carried on
  `ContentMetadata.structured?`. **Downstream reads this, never the prose.**

`LLMRequest.sessionDigest?` (`src/types/api.ts`) threads the report's digest text
through to the message builder.

### 2. The prompt side (`src/services/prompts.ts`)

- `structuredDataRules(schemaTs, example)` appends a `STRUCTURED DATA BLOCK
  (required, comes LAST)` section to the two structured actions — it gives the model
  the TypeScript schema, a filled example, and the rule that **the JSON is the
  source of truth and the prose must match it.** The block is tagged
  ` ```leetsage-data ` (a custom fence tag, so it's unambiguous to find and strip).
- `GENERATE_REPORT` was reworked to inject the session digest and **foreground it**:
  "treat SESSION ACTIVITY as the primary source; reflect the actual journey, not a
  textbook writeup." When no digest is present it falls back to the plain
  code-only report prompt.

### 3. Tolerant parsing (`src/services/structured-parser.ts`)

The core rule: **never trust an external boundary; validate and degrade.** The
model can omit the block, emit malformed JSON, or emit the wrong shape.

- `stripDataBlockForDisplay(raw, actionType)` — used **mid-stream**. Cuts from the
  ` ```leetsage-data ` fence onward, and also suppresses a *partially arrived*
  opening fence (e.g. a dangling ` ``` ` or ` ```leetsag ` at the very end) so the
  user never sees raw JSON flash by. Prose above the fence is untouched.
- `parseStructuredResponse(raw, actionType)` — the authoritative split, run **once
  at stream end**. It:
  1. returns `{ prose: raw }` unchanged for non-structured actions;
  2. locates the last `leetsage-data` fence (with a looser ` ```json ` fallback if
     the block contains one of our known keys, since models drift);
  3. `JSON.parse`s it — on failure, **degrades to prose-only** (still strips the
     bad block so the user never sees the failed dump);
  4. **validates/normalizes** against the action's schema.
- **It never throws.** A missing/malformed/invalid block just means
  `data: undefined` and the card renders as prose-only.

Normalization worth knowing:
- `canonicalizePattern()` maps free-text pattern names onto the closed vocabulary
  (exact match → alias table like `"dp"→"Dynamic Programming"`, `"hashmap"→"Hash
  Map"` → else `"Other"`), so consumers get predictable values.
- `toComplexity()` tolerates a partial object, defaulting missing fields to `O(?)`.
- `validateAnalyze` / `validateUnderstand` require the minimum viable fields (a
  usable complexity) or return `null` (→ prose-only).

### 4. Wiring in the UI (`src/sidepanel/App.tsx`)

- While streaming: display `stripDataBlockForDisplay(accumulated, actionType)`.
- At stream end: `parseStructuredResponse(...)` → set `card.content = prose`,
  `card.metadata.structured = data`, then persist.
- **The stale-closure gotcha (a real bug fixed here).** `handleActionClick` is a
  `useCallback` that *intentionally* omits `learningContent` from its deps (so it
  isn't re-created on every streamed chunk). That meant
  `buildSessionDigest(learningContent, …)` read a **stale, empty closure snapshot**
  → the digest came out empty → the report silently fell back to generic. Fix: a
  `learningContentRef` that a `useEffect` keeps mirrored to the latest history; the
  digest reads `learningContentRef.current` (lines ~56–58 and ~213–214). Lesson
  captured in the dev journal: for these features, "compiles" ≠ "works" — the bug
  was only visible by inspecting persisted state.

### 5. The deterministic session digest (`src/services/session-digest.ts`)

`buildSessionDigest(history, progress)` assembles a compact factual summary **at
read time from the stored structured fields** — no second LLM call. Why
deterministic: the facts (approach tried, complexity found, patterns, hints used)
already exist as `data`; re-summarizing the prose with the model would be
token-heavy and lossy. It reports hints used (from `progress.hintLevel` + counted
`GET_HINT` cards), each `CHECK_APPROACH` analysis (single vs. iterated, with
first/latest approach + complexity), issues raised, `UNDERSTAND_SOLUTION` patterns
+ key insight + optimal cost, and free-form question count. **Returns an empty
string when there's no structured data** — the report then falls back to the
code-only prompt. The output is a `SESSION ACTIVITY (…)` block the report prompt
foregrounds.

### 6. Key decisions (see the spec §6 for the full rationale)

- **Why not the provider's native `response_format: json_schema`?** It's exposed on
  Gemini's OpenAI-compatible endpoint, but (a) it conflicts with token streaming
  and (b) its JSON-Schema support is partial. The prompt-a-fenced-block + tolerant
  client parse keeps the streaming UX and doesn't depend on partial schema support.
  The prose-only fallback stays the safety net regardless. *(Verified against
  current provider docs before deciding — the same discipline as the model-name
  404 lesson.)*
- **Streaming vs. structured:** stream the prose for responsive UX; finalize the
  small data block once the stream completes.
- **Consistency:** the data is the source of truth; the prompt tells the model to
  make prose match it — a *soft* guarantee for now, not render-from-data.

### 7. What's NOT done (don't overclaim)

- Only 2 actions are structured.
- Prose↔data consistency is a prompt instruction, not enforced by rendering from
  the data.
- The degradation path (malformed/absent block → prose-only) is verified by code
  reading, not yet observed against a real bad model response.
- No unit tests yet — `structured-parser.ts` and `session-digest.ts` are pure
  functions and are prime test targets (pairs with the eval-suite roadmap item).
- Progress-tracking Phase B (populating `ProblemRecord.attempts[]` from this same
  structured data) is **enabled** by this work, not built.

---

## 31. Progress Tracking: Records, My Progress, Analytics

**Files:** `src/types/models.ts` · `src/services/progress-records.ts` · `src/services/session-digest.ts` · `src/services/progress-analytics.ts` · `src/components/ProgressView.tsx` · `src/components/ContentDisplay.tsx` · `src/sidepanel/App.tsx`
**Spec:** `.kiro/specs/leetsage-progress-tracking/` (Phases A–C) · **Shipped:** 2026-09-04

### Why this exists

Phase A shipped only an on-demand "Generate report". The real value — "track my
problems and tell me my weakest pattern" — needs **persistence + a structured data
model + aggregation**, which is a genuine system-design exercise under the
no-backend constraint. It's built directly on the structured-output layer
([§30](#30-structured-output-pipeline)): records populate from the same
machine-readable `data`.

### 1. The data model (`src/types/models.ts`)

- **`ProblemRecord`** — the full per-problem record, carrying `schemaVersion`
  (versioned for migration), `slug`, `url`, `title`, `difficulty`, `patterns[]`
  (the closed `ProblemPattern` vocabulary reused from §30), an append-only
  **`attempts[]`** log, a denormalized `bestAttemptIndex`, timestamps, and `notes`
  (the saved report markdown).
- **`Attempt`** — one entry in the event log: `date`, `approachSummary`,
  `complexity {time, space}`, `hintsUsed`, and an `AttemptOutcome`
  (`'solved' | …`). Append-only so history is preserved, not overwritten.
- **`ProblemIndexEntry`** — a **light projection** of a record (slug, title,
  difficulty, patterns, `attemptCount`, `lastUpdatedAt`) for the list + analytics,
  so the common path never deserializes every full record.
- **Key design call:** these reuse the **shipped Title-Case `ProblemPattern` +
  `Complexity {time, space}`** types, *not* the design doc's illustrative
  kebab-case schema. The doc had drifted; aligning to shipped code avoids a
  translation layer and a second pattern vocabulary. (The spec was updated to match.)

### 2. Storage layout & the write path (`src/services/progress-records.ts`)

```
progress_index        → ProblemIndexEntry[]   (small; list + analytics read this)
record_{slug}         → ProblemRecord         (full record; detail view reads this)
```

- **`slugFromUrl`** derives the stable key from the normalized
  `/problems/{slug}/` URL (mirrors the content script's normalizer, but lives here
  so the panel doesn't import across the content-script boundary).
- **`migrate()` runs on every read** — ordered, idempotent steps bring an older
  record to the current shape; a no-op on a current record. Cheap now, painful to
  retrofit later. (v1 is the first shape, so it only backfills a missing
  `schemaVersion`.)
- **`saveAttempt()` is a read-modify-write:** read the existing record, decide
  append-vs-replace (below), recompute `bestAttemptIndex`, **union** the patterns,
  bump timestamps, write the record key, then **upsert the index entry**. The cost
  of the read-optimized layout is this write-amplification / index-sync on save.
  No write-lock (single-user local store; the correct mental model — "serialize
  writes to the same key" — is noted in code, not implemented).

### 3. Append-vs-replace: a save is not a solve (the honesty rule)

Clicking "Save" (or re-generating and re-saving the same solution) must **not**
inflate the attempt log. `shouldReplaceLatest(latest, incoming)`:

- **Same calendar day** (`sameCalendarDay`) **and** unchanged `approachSummary` +
  both complexity fields → **replace** the latest attempt in place (refresh note +
  timestamp).
- Different day **or** a changed approach/complexity → **append** a genuinely new
  attempt.

Both helpers are **pure** (unit-test targets). And the attempt **count is
deliberately hidden from the UI** — even a de-duped attempt is *inferred*, not
verified, until Phase D captures real submission events. The timeline is kept
(renamed "History"); the UI shows recency + "N problems tracked".

### 4. Other pure helpers (unit-test targets)

- **`unionPatterns`** — merge pattern lists, order-preserving, de-duped.
- **`computeBestAttemptIndex`** — "best so far" = a `solved` attempt with the
  lowest complexity cost, tie-broken by fewest hints; else the most recent.
  Denormalized onto the record so reads don't recompute it.
- **`complexityRank`** — coarse Big-O ordering (`O(1)` < `O(log n)` < `O(n)` < …);
  unknown notations sort to the middle so they never falsely win "best".

### 5. The record projection (`src/services/session-digest.ts`)

Two functions turn a session into a record:

- **`extractSessionFacts(history, progress)`** — pulls the structured facts out of
  the session (approaches tried, complexity, patterns, hints).
- **`buildRecordProjection(facts, reportData, …)`** — assembles the attempt +
  patterns for the record. Two honesty rules here:
  - It **prefers the report's own `ReportData`** over the (possibly stale) session
    facts for approach/complexity — the latest analysis can lag what the user
    actually saved.
  - **Complexity honesty:** report the optimal complexity **only if
    `solvedOptimally`**, else the analysis' *measured* complexity — so a
    brute-force attempt isn't mislabeled with the optimal Big-O.

### 6. GENERATE_REPORT as a structured producer

Patterns previously came *only* from `UNDERSTAND_SOLUTION`, so a report-only save
had no patterns and silently dropped out of analytics (observed as "patterns: none"
on *Car Fleet*). Fix: `GENERATE_REPORT` now emits and parses its **own**
`ReportData` block — `patterns`, `approachSummary`, `optimalComplexity`,
`solvedOptimally` — via `prompts.ts` + `structured-parser.ts` (it's now in
`STRUCTURED_ACTIONS`). Also, the model-written `**Date:**` line was **removed** from
the report prompt — the app timestamps the saved attempt itself
(**model owns judgments, system owns facts**).

### 7. Analytics (`src/services/progress-analytics.ts`) — deterministic, no LLM

`computeInsights(records)` is a **pure aggregation pipeline**, not a model call:

- Group attempts by pattern (a problem with N patterns fans out into all N buckets)
  → `PatternStat[]`.
- `computeStruggleScore(...)` — more hints, more attempts, harder problems, and
  give-ups all raise the score.
- Derive the **weakest link** (highest struggle) and a **revisit list**
  (`RevisitItem[]`).
- **Confidence gating:** with `<3` problems the result is flagged low-confidence;
  the UI hides insights until ≥3 problems and shows a **Low/Medium/High confidence
  badge** — honest analytics on thin data.

### 8. The UI (`ProgressView.tsx`, `ContentDisplay.tsx`, `App.tsx`)

- **`ProgressView.tsx`** — a **full-panel** "My Progress" screen (chosen over a
  modal: a near-full-width dialog reads poorly in a narrow side panel). List →
  record detail with the attempts timeline, per-record copy/delete, and "Copy all".
  Insights render only at ≥3 problems, with the confidence badge.
  `displayLanguage()` omits `plaintext`/`unknown`/empty.
- **`ContentDisplay.tsx`** — a "Save to My Progress" button on report cards.
- **`App.tsx`** — the save handler + a full-panel toggle (My Progress *replaces*
  the coaching UI rather than overlaying it).

### 9. The language-detection gotcha (`src/services/code-extractor.ts`)

LeetCode leaves **Monaco's model language as `"plaintext"`** (highlighting /
execution are handled separately), so `getLanguageId()` returned `"plaintext"` and
the reliable toolbar-selector fallback **never ran** — records stored a useless
language. Fix: treat `plaintext`/empty as "not identified" so the toolbar language
(e.g. `"Python3"`) is read instead. A green build never showed this — it surfaced
only by inspecting saved records.

### 10. What's NOT done (don't overclaim)

- **Phase D** auto-save on an Accepted submission — so an attempt's `outcome` is
  *inferred*, not verified; the attempt count is deferred from the UI until then.
- **Export-to-file** — only clipboard "Copy all" exists; the file export is the
  roadmap item that must precede scoping extension permissions.
- **No unit tests yet** — the pure helpers (`complexityRank`,
  `computeBestAttemptIndex`, `computeInsights`, `computeStruggleScore`,
  `shouldReplaceLatest`, `sameCalendarDay`, `slugFromUrl`, the parser) are the
  intended targets.
- **No write-lock** on the read-modify-write (single-user local store; noted in
  code).
