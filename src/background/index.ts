/**
 * Background Service Worker
 * 
 * The background worker is the "brain" of the extension:
 * - Coordinates between content scripts and UI
 * - Handles Chrome Storage operations
 * - Listens for keyboard commands
 * - Routes messages between different parts of the extension
 * 
 * Service Worker Lifecycle:
 * - Starts when needed (event-driven)
 * - Stops when idle (to save resources)
 * - Doesn't maintain long-lived state in memory
 * - Must use chrome.storage for persistence
 */

/// <reference types="chrome"/>

import {
  saveProblemContext,
  getProblemContext,
  saveProgress,
  getProgress,
  resetProgress,
} from '../services/storage';

import type {
  ExtensionMessage,
  isProblemDataMessage,
  isGetProblemDataMessage,
  isTrackActionMessage,
  isGetProgressMessage,
  isResetProgressMessage,
} from '../types';

/**
 * Runs when the extension is first installed or updated
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('[LeetSage Background] Service worker installed');
});

/**
 * Message router - handles all messages from content scripts and UI
 * 
 * This is the central hub for communication in the extension.
 * Messages flow through here and get routed to the appropriate handler.
 */
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  console.log('[LeetSage Background] Received message:', message.type);
  
  // Handle PROBLEM_DATA from content script
  if (isProblemDataMessage(message)) {
    handleProblemData(message.payload)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('[LeetSage Background] Error saving problem data:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate we'll send response asynchronously
    return true;
  }
  
  // Handle GET_PROBLEM_DATA from side panel
  if (isGetProblemDataMessage(message)) {
    getProblemContext()
      .then((context) => {
        sendResponse({ success: true, data: context });
      })
      .catch((error) => {
        console.error('[LeetSage Background] Error getting problem data:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
  
  // Handle TRACK_ACTION from side panel
  if (isTrackActionMessage(message)) {
    handleTrackAction(message.payload.problemUrl, message.payload.actionType)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('[LeetSage Background] Error tracking action:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
  
  // Handle GET_PROGRESS from side panel
  if (isGetProgressMessage(message)) {
    getProgress(message.payload.problemUrl)
      .then((progress) => {
        sendResponse({ success: true, data: progress });
      })
      .catch((error) => {
        console.error('[LeetSage Background] Error getting progress:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
  
  // Handle RESET_PROGRESS from side panel
  if (isResetProgressMessage(message)) {
    resetProgress(message.payload.problemUrl)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('[LeetSage Background] Error resetting progress:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
  
  // Unknown message type
  console.warn('[LeetSage Background] Unknown message type:', message.type);
  sendResponse({ success: false, error: 'Unknown message type' });
  return false;
});

/**
 * Handles PROBLEM_DATA message from content script
 * Saves the problem context to storage
 */
async function handleProblemData(problemContext: any): Promise<void> {
  console.log('[LeetSage Background] Saving problem data:', problemContext.title);
  await saveProblemContext(problemContext);
}

/**
 * Handles TRACK_ACTION message from side panel
 * Updates progress for the given problem
 */
async function handleTrackAction(problemUrl: string, actionType: any): Promise<void> {
  console.log('[LeetSage Background] Tracking action:', actionType, 'for', problemUrl);
  
  // Get existing progress or create new
  let progress = await getProgress(problemUrl);
  
  if (!progress) {
    // Initialize new progress
    progress = {
      problemUrl,
      usedActions: new Set(),
      hintLevel: 0,
      contentHistory: [],
      lastUpdated: Date.now(),
    };
  }
  
  // Add the action to used actions
  progress.usedActions.add(actionType);
  
  // Increment hint level if this is a GET_HINT action
  if (actionType === 'GET_HINT') {
    progress.hintLevel = Math.min(progress.hintLevel + 1, 3);
  }
  
  // Update timestamp
  progress.lastUpdated = Date.now();
  
  // Save updated progress
  await saveProgress(problemUrl, progress);
}

/**
 * Handles keyboard command to open side panel
 * Command is defined in manifest.json (Ctrl+Shift+L)
 */
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open_side_panel') {
    chrome.windows.getCurrent((window) => {
      if (window.id) {
        chrome.sidePanel.open({ windowId: window.id });
        console.log('[LeetSage Background] Side panel opened via keyboard shortcut');
      }
    });
  }
});
