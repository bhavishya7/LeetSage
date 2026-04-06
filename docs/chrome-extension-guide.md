# Chrome Extension Development Guide for LeetSage

## Introduction

This guide explains Chrome Extension fundamentals specifically in the context of LeetSage. You'll learn how the different pieces work together and why certain patterns are used.

## Chrome Extension Architecture

### The Three Main Components

Chrome extensions have three distinct execution contexts that communicate with each other:

1. **Content Scripts** - Run in the context of web pages
2. **Background Service Worker** - Runs in the background, handles events
3. **UI Pages** (Popup/Side Panel) - User interface components

Think of it like this:
- Content scripts are your "eyes and hands" on the webpage
- Background worker is your "brain" coordinating everything
- UI pages are what the user sees and interacts with

### Why This Separation?

Each component has different capabilities and restrictions:

| Component | Can Access DOM | Can Use Chrome APIs | Lifespan |
|-----------|---------------|---------------------|----------|
| Content Script | ✅ Yes (webpage DOM) | ⚠️ Limited | While page is open |
| Background Worker | ❌ No | ✅ Full access | Persistent (event-driven) |
| UI Pages | ✅ Yes (own DOM only) | ✅ Full access | While UI is open |

## Manifest V3 Basics

### What is manifest.json?

The manifest is your extension's configuration file. It tells Chrome:
- What permissions your extension needs
- Which scripts to run and where
- What UI elements to show
- Keyboard shortcuts and commands

### Key Manifest Sections in LeetSage

```json
{
  "manifest_version": 3,  // Always 3 for modern extensions
  
  "permissions": [
    "storage",    // Save data locally
    "sidePanel",  // Show side panel UI
    "commands"    // Keyboard shortcuts
  ],
  
  "background": {
    "service_worker": "background.js"  // Your background script
  },
  
  "content_scripts": [{
    "matches": ["https://leetcode.com/problems/*"],  // Which pages
    "js": ["content.js"]  // Which script to inject
  }],
  
  "side_panel": {
    "default_path": "index.html"  // Your React app
  }
}
```

### Permissions Explained

- **storage**: Lets you save data that persists across sessions
- **sidePanel**: Enables the side panel UI (Chrome's newer UI paradigm)
- **commands**: Allows keyboard shortcuts (Ctrl+Shift+L in LeetSage)
- **host_permissions**: Allows your extension to access specific websites

## Content Scripts Deep Dive

### What Are Content Scripts?

Content scripts are JavaScript files that run in the context of web pages. They can:
- Read and modify the page's DOM
- Listen to page events
- Extract information from the page
- Inject UI elements into the page

### LeetSage's Content Script

Your `src/content/index.ts` does this:

```typescript
// Wait for LeetCode's problem elements to load
const links = await waitForElements<HTMLAnchorElement>('a[href^="/problems/"]');

// Find the actual problem title (has number prefix like "1. Two Sum")
const problemLink = links.find((link) => /\d+\.\s/.test(link.innerText.trim()));

// Extract problem data
const title = problemLink?.innerText.trim();
const url = problemLink?.href;
const difficulty = problemDifficultyEl.innerText.trim();

// Send to background worker
chrome.runtime.sendMessage({
  type: "PROBLEM_DATA",
  payload: { title, url, difficulty }
});
```

### Why waitForElements?

LeetCode loads content dynamically (React app), so elements aren't immediately available. The `waitForElements` function polls the DOM until elements appear:

```typescript
function waitForElements<T extends Element>(
  selector: string,
  intervalTime: number = 500
): Promise<T[]> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const elements = Array.from(document.querySelectorAll<T>(selector));
      if (elements.length > 0) {
        clearInterval(interval);  // Stop checking
        resolve(elements);         // Return found elements
      }
    }, intervalTime);
  });
}
```

This pattern is common in content scripts dealing with dynamic websites.

### Content Script Limitations

Content scripts CANNOT:
- Access Chrome extension APIs directly (except a few like chrome.runtime)
- Access variables from the background worker
- Access the extension's UI pages

They CAN:
- Read/modify the webpage's DOM
- Send messages to background worker
- Listen for messages from background worker

## Background Service Worker

### What Is It?

The background service worker is your extension's event handler and coordinator. It:
- Runs independently of any webpage or UI
- Handles messages from content scripts and UI pages
- Manages extension state
- Coordinates between different parts of your extension

### LeetSage's Background Worker

Your `src/background/index.ts` does this:

```typescript
// Listen for messages from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "PROBLEM_DATA") {
    // Store the problem data so UI can access it
    chrome.storage.local.set({ problemData: message.payload });
  }
});

// Listen for keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === "open_side_panel") {
    chrome.windows.getCurrent((w) => {
      chrome.sidePanel.open({ windowId: w.id! });
    });
  }
});
```

### Why Use Background Worker?

It acts as a central hub because:
- Content scripts can't directly communicate with UI pages
- Storage operations are best centralized
- Event listeners (commands, alarms) need a persistent context

### Service Worker Lifecycle

Unlike old background pages, service workers:
- Start when needed (event-driven)
- Stop when idle (to save resources)
- Don't maintain long-lived state in memory
- Must use chrome.storage for persistence

## Message Passing

### How Components Communicate

Chrome extensions use message passing for communication:

```typescript
// Content Script → Background Worker
chrome.runtime.sendMessage({
  type: "PROBLEM_DATA",
  payload: { title: "Two Sum", difficulty: "Easy" }
});

// Background Worker listens
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "PROBLEM_DATA") {
    // Handle the message
  }
});
```

### Message Patterns

**One-way messages** (fire and forget):
```typescript
chrome.runtime.sendMessage({ type: "LOG", data: "something" });
```

**Request-response pattern**:
```typescript
// Sender
chrome.runtime.sendMessage(
  { type: "GET_DATA" },
  (response) => {
    console.log(response.data);
  }
);

// Receiver
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_DATA") {
    sendResponse({ data: "here's the data" });
    return true;  // Indicates async response
  }
});
```

## Chrome Storage API

### Why Not localStorage?

Chrome extensions use `chrome.storage` instead of `localStorage` because:
- Works across all extension contexts (content, background, UI)
- Async API (doesn't block)
- Larger storage limits
- Syncs across devices (with chrome.storage.sync)

### Storage Patterns in LeetSage

```typescript
// Save data
chrome.storage.local.set({ 
  problemData: { title: "Two Sum", difficulty: "Easy" }
});

// Retrieve data
chrome.storage.local.get("problemData", (data) => {
  if (data.problemData) {
    console.log(data.problemData.title);
  }
});

// Listen for changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (changes.problemData) {
    console.log("Problem data updated!");
  }
});
```

### Storage Best Practices

- Use descriptive keys: `progress_${problemUrl}` instead of just `progress`
- Store structured data as objects
- Handle missing data gracefully
- Clear old data periodically to avoid quota issues
- Use chrome.storage.local for extension-specific data
- Use chrome.storage.sync for user preferences (syncs across devices)

## Side Panel vs Popup

### What's the Difference?

**Popup**:
- Opens when you click the extension icon
- Closes when you click outside
- Small, temporary UI
- Good for quick actions

**Side Panel**:
- Opens in browser's side panel area
- Stays open while browsing
- Larger, persistent UI
- Good for ongoing interactions

### Why LeetSage Uses Side Panel

Your extension uses side panel because:
- Users need persistent access while solving problems
- More screen space for displaying hints and examples
- Doesn't close when clicking back to LeetCode
- Better for multi-step interactions

### How It Works in LeetSage

```typescript
// manifest.json declares the side panel
"side_panel": {
  "default_path": "index.html"  // Your React app
}

// Background worker opens it via keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === "open_side_panel") {
    chrome.windows.getCurrent((w) => {
      chrome.sidePanel.open({ windowId: w.id! });
    });
  }
});
```

## Building Extensions with React + Vite

### Why This Stack?

- **React**: Component-based UI, familiar to most developers
- **TypeScript**: Type safety prevents bugs
- **Vite**: Fast builds, great dev experience
- **Tailwind**: Quick styling without CSS files

### How Vite Builds Extensions

Your `vite.config.ts` creates multiple entry points:

```typescript
build: {
  rollupOptions: {
    input: {
      side_panel: "index.html",      // React app
      background: "src/background/index.ts",  // Service worker
      content: "src/content/index.ts"         // Content script
    },
    output: {
      entryFileNames: "[name].js"  // Creates side_panel.js, background.js, content.js
    }
  }
}
```

This builds:
- `dist/side_panel.js` - Your React app bundle
- `dist/background.js` - Background worker
- `dist/content.js` - Content script

### Development Workflow

1. **Development**: `npm run dev` - Vite watches for changes
2. **Build**: `npm run build` - Creates production bundle in `dist/`
3. **Load in Chrome**: 
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select your `dist/` folder
4. **Test**: Navigate to LeetCode problem page
5. **Reload**: Click reload icon in `chrome://extensions` after changes

### Hot Reload Limitation

Unlike web apps, Chrome extensions don't support hot reload. After code changes:
- Rebuild with `npm run build`
- Click reload in `chrome://extensions`
- Refresh the LeetCode page (for content script changes)

## Common Chrome Extension Patterns

### Pattern 1: Extracting Data from Web Pages

```typescript
// Wait for dynamic content
const element = await waitForElement('.problem-title');

// Extract text content
const title = element.textContent?.trim();

// Extract from multiple elements
const examples = Array.from(document.querySelectorAll('.example'))
  .map(el => el.textContent);

// Send to background
chrome.runtime.sendMessage({ type: "DATA", payload: { title, examples } });
```

### Pattern 2: Coordinating via Background Worker

```typescript
// Background acts as message router
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "DATA_FROM_CONTENT") {
    // Store it
    chrome.storage.local.set({ data: message.payload });
    
    // Notify UI if it's open
    chrome.runtime.sendMessage({ type: "DATA_UPDATED" });
  }
});
```

### Pattern 3: React Component with Chrome APIs

```typescript
function MyComponent() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    // Load from storage on mount
    chrome.storage.local.get("problemData", (result) => {
      if (result.problemData) {
        setData(result.problemData);
      }
    });
    
    // Listen for updates
    const listener = (changes) => {
      if (changes.problemData) {
        setData(changes.problemData.newValue);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);
  
  return <div>{data?.title}</div>;
}
```

### Pattern 4: Error Handling in Extensions

```typescript
// Always check for Chrome runtime errors
chrome.storage.local.get("key", (result) => {
  if (chrome.runtime.lastError) {
    console.error("Storage error:", chrome.runtime.lastError);
    return;
  }
  // Use result
});

// Wrap async operations
try {
  const response = await fetch(apiUrl);
  const data = await response.json();
} catch (error) {
  console.error("API error:", error);
  // Show user-friendly message
}
```

## Debugging Chrome Extensions

### Tools and Techniques

**1. Inspect Different Contexts**:
- Content script: Right-click page → Inspect → Console (select content script context)
- Background worker: `chrome://extensions` → Click "service worker" link
- Side panel: Right-click side panel → Inspect

**2. Console Logging**:
```typescript
// Add context to logs
console.log("[Content Script] Problem extracted:", problemData);
console.log("[Background] Message received:", message);
console.log("[Side Panel] Rendering with:", props);
```

**3. Chrome Extension DevTools**:
- View storage: DevTools → Application → Storage → Extension Storage
- View messages: Add listeners and log all messages
- Monitor service worker: Check if it's active or stopped

**4. Common Issues**:
- Content script not running? Check manifest matches pattern
- Messages not received? Verify listener is registered
- Storage empty? Check async timing and error handling
- Service worker stopped? It's normal - it restarts on events

## Next Steps

As we implement the AI Learning Assistant feature, I'll explain:
- How to structure React components for extensions
- How to make API calls from extension context
- How to handle streaming responses in the UI
- How to implement the solution filter
- How to manage complex state across extension contexts

Ready to proceed with creating the implementation tasks?
