# LeetSage — Tech & Architecture (facts every session should know)

## Stack

React 19 · TypeScript 5.8 · Tailwind CSS 4 · Vite 7 · Chrome Extension
Manifest V3 · Google **Gemini** via its **OpenAI-compatible endpoint**
(base URL `https://generativelanguage.googleapis.com/v1beta/openai`).

- Models: **`gemini-3.5-flash-lite`** (default) / `gemini-3.5-flash`.
  Note: `gemini-2.5-*` is deprecated and 404s — do not use it. **Verify model
  names against provider docs before assuming** (a stale name caused a real 404
  debugging loop).
- Auth: `Bearer <user's Gemini key>`. Both `AQ.` and `AIza` key formats work.

## Build (IMPORTANT — Windows / PowerShell)

- Build with **`npm.cmd run build`** — NOT `npm run build` (PowerShell execution
  policy blocks the `npm` shim in this environment).
- The build is `tsc -b && vite build`; success prints `built in <N>ms`.
- Output goes to `dist/` (`side_panel.js`, `background.js`, `content.js`,
  `manifest.json` copied from `public/`).
- **Always build to verify a change compiles before claiming it's done.** If the
  terminal wrapper garbles a multi-part command, write build output to a temp file
  and read it, then delete the temp file.
- This is a Chrome extension — **never** start a dev server / watcher as a
  long-running task. Reload the unpacked extension at `chrome://extensions` after
  a build.

## Architecture facts (so you don't re-derive them)

- **Three isolated contexts:** content script (`src/content/`), background service
  worker (`src/background/`), side-panel React UI (`src/sidepanel/`). They share
  state only via messages + `chrome.storage.local`.
- **MV3 worker sleeps.** It's event-driven; it needs `"type": "module"` in the
  manifest or it crashes silently on ES imports.
- **Problem data is pull-based:** the side panel requests it from the content
  script (`REQUEST_PROBLEM_DATA`, retry/backoff) with a `chrome.scripting`
  inject fallback — robust against the sleeping worker. Not push-only.
- **Editor code is read from Monaco's MAIN world** via `chrome.scripting`
  (`src/services/code-extractor.ts`); the isolated content script can't reach
  `window.monaco` directly.
- **Session persistence keys on the normalized `/problems/{slug}/` URL** so a
  submission doesn't wipe the chat.
- **9 action types** live in `src/types/models.ts` (incl. `UNDERSTAND_SOLUTION`,
  `GENERATE_REPORT`). The solution filter is `src/services/solution-filter.ts`.

## Where to go deeper

- Full file-by-file walkthrough: `docs/leetsage-learning-guide.md` (kept accurate).
- Why decisions were made: `docs/career/DESIGN_DECISIONS.md`.
- Don't inline that detail here — read those when a task needs it.
