/**
 * LeetSage Content Script
 * 
 * This script runs on LeetCode problem pages and extracts problem data.
 * 
 * Content scripts run in the context of web pages, so they can:
 * - Access and modify the page's DOM
 * - Extract information from the page
 * - Send messages to the background worker
 * 
 * But they CANNOT:
 * - Access most Chrome extension APIs directly
 * - Access variables from other extension contexts
 * 
 * Flow:
 * 1. Wait for page to load
 * 2. Extract problem context from DOM
 * 3. Send PROBLEM_DATA message to background worker
 * 4. Background worker stores it in Chrome storage
 * 5. Side panel UI can then retrieve it
 */

/// <reference types="chrome"/>

import { extractProblemContext, observeProblemChanges } from './extractor';
import type { ProblemDataMessage } from '../types';

/**
 * Extracts problem data and sends it to the background worker
 */
async function extractAndSendProblemData(): Promise<void> {
  try {
    console.log('[LeetSage Content Script] Starting problem extraction...');
    
    // Extract the full problem context
    const problemContext = await extractProblemContext();
    
    console.log('[LeetSage Content Script] Extraction successful:', {
      title: problemContext.title,
      difficulty: problemContext.difficulty,
      examplesCount: problemContext.examples.length,
      constraintsCount: problemContext.constraints.length,
    });
    
    // Send to background worker
    const message: ProblemDataMessage = {
      type: 'PROBLEM_DATA',
      payload: problemContext,
    };
    
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[LeetSage Content Script] Error sending message:', chrome.runtime.lastError);
      } else {
        console.log('[LeetSage Content Script] Problem data sent to background worker');
      }
    });
    
  } catch (error) {
    console.error('[LeetSage Content Script] Failed to extract problem data:', error);
    
    // Send error notification to background (optional)
    chrome.runtime.sendMessage({
      type: 'EXTRACTION_ERROR',
      payload: {
        error: error instanceof Error ? error.message : 'Unknown error',
        url: window.location.href,
      },
    });
  }
}

/**
 * Initialize the content script
 */
(async () => {
  console.log('[LeetSage Content Script] Initializing on:', window.location.href);
  
  // Extract problem data on initial load
  await extractAndSendProblemData();
  
  // Set up observer to detect problem changes (SPA navigation)
  const observer = observeProblemChanges(() => {
    console.log('[LeetSage Content Script] Problem changed, re-extracting...');
    extractAndSendProblemData();
  });
  
  console.log('[LeetSage Content Script] Initialized successfully');
  
  // Clean up observer when page unloads
  window.addEventListener('beforeunload', () => {
    observer.disconnect();
  });
})();
