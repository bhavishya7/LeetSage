/// <reference types="chrome"/>

import { extractProblemContext, observeProblemChanges } from './extractor';
import type { ProblemDataMessage } from '../types';

async function extractAndSendProblemData(): Promise<void> {
  try {
    const problemContext = await extractProblemContext();
    const message: ProblemDataMessage = { type: 'PROBLEM_DATA', payload: problemContext };
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) console.error('[LeetSage] Error sending message:', chrome.runtime.lastError);
    });
  } catch (error) {
    console.error('[LeetSage] Failed to extract problem data:', error);
  }
}

(async () => {
  await extractAndSendProblemData();
  const observer = observeProblemChanges(() => extractAndSendProblemData());
  window.addEventListener('beforeunload', () => observer.disconnect());
})();
