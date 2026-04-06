/**
 * Chrome Storage Service
 * 
 * Wraps Chrome Storage API with type-safe methods.
 * 
 * Why we need this:
 * - Chrome Storage API is callback-based, we want Promises
 * - Type safety: ensure we're storing/retrieving correct data types
 * - Centralized error handling
 * - Easy to mock for testing
 * 
 * Chrome Storage vs localStorage:
 * - Works across all extension contexts (content, background, UI)
 * - Async (doesn't block)
 * - Larger storage limits
 * - Can sync across devices (with chrome.storage.sync)
 */

import type { ProblemContext, ProgressState, UserSettings, ActionType } from '../types';

/**
 * Storage keys used throughout the extension
 */
export const STORAGE_KEYS = {
  PROBLEM_DATA: 'problemData',
  USER_SETTINGS: 'userSettings',
  STUCK_TIMER_STATE: 'stuckTimerState',
  
  /**
   * Progress is stored per problem URL
   * Format: "progress_https://leetcode.com/problems/two-sum/"
   */
  progressPrefix: (url: string) => `progress_${url}`,
} as const;

/**
 * Saves problem context to storage
 * 
 * @param context - The problem context to save
 */
export async function saveProblemContext(context: ProblemContext): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(
      { [STORAGE_KEYS.PROBLEM_DATA]: context },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('[Storage] Saved problem context:', context.title);
          resolve();
        }
      }
    );
  });
}

/**
 * Retrieves problem context from storage
 * 
 * @returns The stored problem context, or null if not found
 */
export async function getProblemContext(): Promise<ProblemContext | null> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEYS.PROBLEM_DATA, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result[STORAGE_KEYS.PROBLEM_DATA] || null);
      }
    });
  });
}

/**
 * Saves progress state for a specific problem
 * 
 * Note: ProgressState contains a Set, which can't be directly stored in Chrome Storage.
 * We convert it to an array before storing.
 * 
 * @param problemUrl - The problem URL
 * @param progress - The progress state to save
 */
export async function saveProgress(problemUrl: string, progress: ProgressState): Promise<void> {
  return new Promise((resolve, reject) => {
    // Convert Set to Array for storage
    const storableProgress = {
      ...progress,
      usedActions: Array.from(progress.usedActions),
    };
    
    const key = STORAGE_KEYS.progressPrefix(problemUrl);
    
    chrome.storage.local.set(
      { [key]: storableProgress },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('[Storage] Saved progress for:', problemUrl);
          resolve();
        }
      }
    );
  });
}

/**
 * Retrieves progress state for a specific problem
 * 
 * @param problemUrl - The problem URL
 * @returns The progress state, or null if not found
 */
export async function getProgress(problemUrl: string): Promise<ProgressState | null> {
  return new Promise((resolve, reject) => {
    const key = STORAGE_KEYS.progressPrefix(problemUrl);
    
    chrome.storage.local.get(key, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        const stored = result[key];
        
        if (!stored) {
          resolve(null);
        } else {
          // Convert Array back to Set
          const progress: ProgressState = {
            ...stored,
            usedActions: new Set(stored.usedActions),
          };
          resolve(progress);
        }
      }
    });
  });
}

/**
 * Resets progress for a specific problem
 * 
 * @param problemUrl - The problem URL
 */
export async function resetProgress(problemUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const key = STORAGE_KEYS.progressPrefix(problemUrl);
    
    chrome.storage.local.remove(key, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        console.log('[Storage] Reset progress for:', problemUrl);
        resolve();
      }
    });
  });
}

/**
 * Saves user settings
 * 
 * @param settings - The user settings to save
 */
export async function saveSettings(settings: UserSettings): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(
      { [STORAGE_KEYS.USER_SETTINGS]: settings },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('[Storage] Saved user settings');
          resolve();
        }
      }
    );
  });
}

/**
 * Retrieves user settings
 * 
 * @returns The user settings, or default settings if not found
 */
export async function getSettings(): Promise<UserSettings> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEYS.USER_SETTINGS, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        const settings = result[STORAGE_KEYS.USER_SETTINGS];
        
        if (!settings) {
          // Return default settings
          resolve({
            apiConfig: {
              provider: 'openai',
              apiKey: '',
            },
            enableStuckTimer: true,
            stuckTimerDelay: 300000, // 5 minutes
            enableChatMode: false,
            theme: 'auto',
          });
        } else {
          resolve(settings);
        }
      }
    });
  });
}

/**
 * Checks if storage quota is exceeded
 * 
 * Chrome Storage has limits:
 * - chrome.storage.local: 10MB (unlimited with "unlimitedStorage" permission)
 * - chrome.storage.sync: 100KB
 */
export async function checkStorageQuota(): Promise<{ used: number; available: number }> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        // 10MB limit for chrome.storage.local
        const limit = 10 * 1024 * 1024;
        resolve({
          used: bytesInUse,
          available: limit - bytesInUse,
        });
      }
    });
  });
}

/**
 * Clears old progress data to free up storage
 * 
 * Removes progress for problems not accessed in the last 30 days
 */
export async function clearOldProgress(): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(null, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      const now = Date.now();
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
      const keysToRemove: string[] = [];
      
      // Find old progress entries
      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith('progress_')) {
          const progress = value as any;
          if (progress.lastUpdated && progress.lastUpdated < thirtyDaysAgo) {
            keysToRemove.push(key);
          }
        }
      }
      
      if (keysToRemove.length === 0) {
        resolve(0);
        return;
      }
      
      chrome.storage.local.remove(keysToRemove, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log(`[Storage] Cleared ${keysToRemove.length} old progress entries`);
          resolve(keysToRemove.length);
        }
      });
    });
  });
}
