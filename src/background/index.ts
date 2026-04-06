/// <reference types="chrome"/>

import { saveProblemContext, getProblemContext, saveProgress, getProgress, resetProgress } from '../services/storage';
import { isProblemDataMessage, isGetProblemDataMessage, isTrackActionMessage, isGetProgressMessage, isResetProgressMessage } from '../types';
import type { ExtensionMessage } from '../types';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[LeetSage Background] Service worker installed');
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (isProblemDataMessage(message)) {
    saveProblemContext(message.payload).then(() => sendResponse({ success: true })).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (isGetProblemDataMessage(message)) {
    getProblemContext().then(ctx => sendResponse({ success: true, data: ctx })).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (isTrackActionMessage(message)) {
    const { problemUrl, actionType } = message.payload;
    (async () => {
      let progress = await getProgress(problemUrl);
      if (!progress) progress = { problemUrl, usedActions: new Set(), hintLevel: 0, contentHistory: [], lastUpdated: Date.now() };
      progress.usedActions.add(actionType);
      if (actionType === 'GET_HINT') progress.hintLevel = Math.min(progress.hintLevel + 1, 3);
      progress.lastUpdated = Date.now();
      await saveProgress(problemUrl, progress);
      sendResponse({ success: true });
    })().catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (isGetProgressMessage(message)) {
    getProgress(message.payload.problemUrl).then(p => sendResponse({ success: true, data: p })).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (isResetProgressMessage(message)) {
    resetProgress(message.payload.problemUrl).then(() => sendResponse({ success: true })).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  return false;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open_side_panel') {
    chrome.windows.getCurrent((w) => { if (w.id) chrome.sidePanel.open({ windowId: w.id }); });
  }
});
