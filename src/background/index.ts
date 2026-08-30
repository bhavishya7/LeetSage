/// <reference types="chrome"/>

import { saveProblemContext, getProblemContext, saveProgress, getProgress, resetProgress } from '../services/storage';
import { isProblemDataMessage, isGetProblemDataMessage, isTrackActionMessage, isGetProgressMessage, isResetProgressMessage } from '../types';
import type { ExtensionMessage } from '../types';

// Open the side panel when the user clicks the toolbar icon.
//
// We rely SOLELY on the native openPanelOnActionClick behavior. Chrome
// handles this click itself, so it works even when the service worker is
// asleep/inactive. Do NOT also register chrome.action.onClicked — having
// both makes Chrome suppress the native open and the manual open then fails
// because the worker cold-start loses the user-gesture context.
function enablePanelOnActionClick() {
  // Ensure the panel is enabled globally, THEN set the click-to-open behavior.
  // Some Chrome builds require an explicit enabled:true before openPanelOnActionClick
  // takes effect.
  chrome.sidePanel
    .setOptions({ path: 'index.html', enabled: true })
    .then(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }))
    .then(() => console.log('[LeetSage Background] side panel enabled + openPanelOnActionClick set'))
    .catch((err) => console.error('[LeetSage Background] side panel setup failed:', err));
}

enablePanelOnActionClick();

chrome.runtime.onInstalled.addListener(() => {
  console.log('[LeetSage Background] Service worker installed');
  enablePanelOnActionClick();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[LeetSage Background] Browser startup');
  enablePanelOnActionClick();
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
