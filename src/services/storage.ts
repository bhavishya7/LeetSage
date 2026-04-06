import type { ProblemContext, ProgressState, UserSettings } from '../types';

export const STORAGE_KEYS = {
  PROBLEM_DATA: 'problemData',
  USER_SETTINGS: 'userSettings',
  progressPrefix: (url: string) => `progress_${url}`,
} as const;

export async function saveProblemContext(context: ProblemContext): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEYS.PROBLEM_DATA]: context }, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

export async function getProblemContext(): Promise<ProblemContext | null> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEYS.PROBLEM_DATA, (result) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result[STORAGE_KEYS.PROBLEM_DATA] || null);
    });
  });
}

export async function saveProgress(problemUrl: string, progress: ProgressState): Promise<void> {
  return new Promise((resolve, reject) => {
    const storableProgress = { ...progress, usedActions: Array.from(progress.usedActions) };
    const key = STORAGE_KEYS.progressPrefix(problemUrl);
    chrome.storage.local.set({ [key]: storableProgress }, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

export async function getProgress(problemUrl: string): Promise<ProgressState | null> {
  return new Promise((resolve, reject) => {
    const key = STORAGE_KEYS.progressPrefix(problemUrl);
    chrome.storage.local.get(key, (result) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (!result[key]) resolve(null);
      else resolve({ ...result[key], usedActions: new Set(result[key].usedActions) });
    });
  });
}

export async function resetProgress(problemUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const key = STORAGE_KEYS.progressPrefix(problemUrl);
    chrome.storage.local.remove(key, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEYS.USER_SETTINGS]: settings }, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

export async function getSettings(): Promise<UserSettings> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEYS.USER_SETTINGS, (result) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result[STORAGE_KEYS.USER_SETTINGS] ?? {
        apiConfig: { provider: 'openai', apiKey: '' },
        enableStuckTimer: true,
        stuckTimerDelay: 300000,
        enableChatMode: false,
        theme: 'auto',
      });
    });
  });
}
