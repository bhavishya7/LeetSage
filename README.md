# LeetSage 🧠

**An AI-powered learning coach for LeetCode that helps you understand problems — without ever handing you the answer.**

LeetSage is a Chrome extension that opens a side panel on LeetCode problem pages and offers on-demand coaching: progressive hints, problem breakdowns, alternative examples, pre-submission code analysis, and deep "why does this work" explanations. It is deliberately built to *teach*, not to solve — the opposite of a solve-it-for-you tool.

It runs on your own free Google Gemini API key (bring-your-own-key), so there's no cost, no account, and no backend.

---

## What it does

Coaching actions, all grounded in the specific problem you're on:

- **💡 Hint** — progressive, 3 levels (conceptual → approach → implementation), never a full solution
- **🧩 Break down** — decomposes the problem into logical sub-steps
- **🔬 Analyze my code** — reads your current editor code and gives feedback on Approach, Efficiency (with an operation-by-operation time/space breakdown), and Code Style — *before* you submit
- **🧠 Understand solution** — after you've solved it, explains *why* your solution works: real-world analogy, key insight, why each part is necessary, and complexity
- **🔢 Examples**, **📚 Concept**, **⏱️ Complexity hint**, **🔍 Pattern recognition** (secondary actions)
- **Free-form chat** — ask your own question about the problem
- Per-problem **history** that persists across sessions, a **dark/light** theme, and **free-tier guardrails** (rate limits, token caps, a usage counter, and a kill switch — all adjustable)

A solution filter keeps responses from spelling out complete answers, preserving the learning-first philosophy.

## How it works

Standard Chrome extension (Manifest V3) architecture:

- **Content script** extracts the problem (title, difficulty, description) from the LeetCode page and reads your editor code from the Monaco editor.
- **Side panel** (React + TypeScript + Tailwind) is the UI — it calls Google Gemini directly with your key, streams responses, and renders them.
- **Background service worker** coordinates and persists state to `chrome.storage`.
- Problem data flows via a **pull-based** model: the side panel requests the current problem from the content script when it's ready (robust against the MV3 service worker sleeping).

See [`src/README.md`](src/README.md) for the source layout and [`docs/leetsage-learning-guide.md`](docs/leetsage-learning-guide.md) for a deep-dive on how everything works. For the *why* behind the architecture — plus interview prep, resume material, and the learning roadmap — see [`docs/career/`](docs/career/).

## Getting started

### Prerequisites
- Node.js (LTS)
- A free Google Gemini API key from [aistudio.google.com](https://aistudio.google.com) → **Get API key** (no billing required)

### Build & install
```bash
npm install
npm run build        # on Windows PowerShell, use: npm.cmd run build
```
Then load it in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked** and select the `dist/` folder

### Use it
1. Open any LeetCode problem (`leetcode.com/problems/...`)
2. Click the LeetSage toolbar icon to open the side panel
3. Open ⚙️ Settings, paste your Gemini API key, and pick a model (Flash-Lite is the fast, free-tier-friendly default)
4. Tap a coaching action or ask your own question

> **Note:** After rebuilding, reload the extension at `chrome://extensions`. If a LeetCode tab was already open before a reload, refresh it.

## Tech stack

React 19 · TypeScript 5.8 · Tailwind CSS 4 · Vite 7 · Chrome Extension Manifest V3 · Google Gemini (OpenAI-compatible endpoint)

## Roadmap

Planned enhancements are documented as specs under [`.kiro/specs/`](.kiro/specs/):

- **Progress tracking & study notes** (`leetsage-progress-tracking`) — a living record of solved problems: approach, best solution, notes, and progress over time
- **Language cheatsheets** (`leetsage-cheatsheet`) — static, zero-token Python/Java/C++ references + Big-O chart
- **Pseudocode playground** (`leetsage-pseudocode-mode`) — a lightweight space to plan your approach and get feedback
- **Struggle-first hint gating** (`leetsage-phase2-struggle-first`) — deeper hints unlock after you explain your reasoning
- **Learning analytics** (`leetsage-phase3-analytics`) — hints used, submission outcomes, "problems to revisit"

## Design philosophy

LeetSage is a *learning* tool first. It withholds complete solutions on purpose, so the value is in building genuine understanding — not shipping green checkmarks. It's a personal project, free to run, with your data staying in your browser.
