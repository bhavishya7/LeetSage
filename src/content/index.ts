/// <reference types="chrome"/>

import { extractProblemContext, observeProblemChanges } from './extractor';
import type { ProblemContext, ProblemDataMessage } from '../types';

// Cache the most recent successful extraction so the side panel can
// pull it on demand without waiting for a fresh extraction.
let cachedProblem: ProblemContext | null = null;

async function extractAndSendProblemData(): Promise<void> {
  try {
    const problemContext = await extractProblemContext();
    cachedProblem = problemContext;

    // Push to background/storage (best-effort — may be dropped if the
    // service worker is asleep, which is why the side panel also pulls).
    const message: ProblemDataMessage = { type: 'PROBLEM_DATA', payload: problemContext };
    chrome.runtime.sendMessage(message, () => {
      // Swallow "no receiving end" errors — the side panel pull path covers this.
      void chrome.runtime.lastError;
    });
  } catch (error) {
    // "Extension context invalidated" happens when the extension is reloaded
    // while an old content script is still alive in the page — harmless noise.
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Extension context invalidated')) return;
    console.error('[LeetSage] Failed to extract problem data:', error);
  }
}

// Respond to on-demand requests from the side panel. This is the reliable
// path: the panel asks when IT is ready, sidestepping the MV3 race where
// the service worker isn't awake when the content script first loads.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'REQUEST_PROBLEM_DATA') {
    if (cachedProblem) {
      sendResponse({ success: true, data: cachedProblem });
    } else {
      // No cache yet — extract now and respond when ready.
      extractProblemContext()
        .then((ctx) => {
          cachedProblem = ctx;
          sendResponse({ success: true, data: ctx });
        })
        .catch((err) => sendResponse({ success: false, error: String(err) }));
    }
    return true; // async response
  }
  return false;
});

(async () => {
  await extractAndSendProblemData();
  const observer = observeProblemChanges(() => extractAndSendProblemData());
  window.addEventListener('beforeunload', () => observer.disconnect());
})();
