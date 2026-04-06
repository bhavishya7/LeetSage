/**
 * Progress Tracker Service
 *
 * Tracks which learning aids a user has used per problem.
 *
 * Why per-problem tracking?
 * - Each LeetCode problem is a separate learning session
 * - Users should see which hints/examples they've already used
 * - Progress should persist if they leave and come back
 *
 * Architecture note:
 * - The side panel calls these methods directly
 * - Data is persisted via the storage service (Chrome Storage)
 * - Progress is keyed by problem URL for isolation
 */

import type { ActionType, ProgressState, LearningContent } from '../types';
import { saveProgress, getProgress, resetProgress } from './storage';

/**
 * Creates a fresh empty progress state for a problem
 */
function createInitialProgress(problemUrl: string): ProgressState {
  return {
    problemUrl,
    usedActions: new Set<ActionType>(),
    hintLevel: 0,
    contentHistory: [],
    lastUpdated: Date.now(),
  };
}

/**
 * Tracks that a user clicked an action button for a problem.
 * Persists the updated progress to Chrome Storage.
 *
 * @param problemUrl - The problem URL
 * @param actionType - Which action was clicked
 * @returns The updated progress state
 */
export async function trackAction(
  problemUrl: string,
  actionType: ActionType
): Promise<ProgressState> {
  // Load existing progress or start fresh
  let progress = await getProgress(problemUrl);

  if (!progress) {
    progress = createInitialProgress(problemUrl);
  }

  // Mark this action as used
  progress.usedActions.add(actionType);

  // Increment hint level when user requests a hint (max 3)
  if (actionType === 'GET_HINT') {
    progress.hintLevel = Math.min(progress.hintLevel + 1, 3);
  }

  progress.lastUpdated = Date.now();

  await saveProgress(problemUrl, progress);

  console.log(`[ProgressTracker] Tracked action "${actionType}" for ${problemUrl}`);
  return progress;
}

/**
 * Appends a piece of learning content to the problem's history.
 * This lets users see previously generated hints/examples when they return.
 *
 * @param problemUrl - The problem URL
 * @param content - The learning content to append
 */
export async function appendContent(
  problemUrl: string,
  content: LearningContent
): Promise<void> {
  let progress = await getProgress(problemUrl);

  if (!progress) {
    progress = createInitialProgress(problemUrl);
  }

  progress.contentHistory.push(content);
  progress.lastUpdated = Date.now();

  await saveProgress(problemUrl, progress);
}

/**
 * Loads progress for a problem from Chrome Storage.
 * Returns null if no progress exists yet.
 *
 * @param problemUrl - The problem URL
 */
export async function loadProgress(problemUrl: string): Promise<ProgressState | null> {
  return getProgress(problemUrl);
}

/**
 * Resets all progress for a problem (clears hints used, content history, etc.)
 *
 * @param problemUrl - The problem URL
 */
export async function clearProgress(problemUrl: string): Promise<void> {
  await resetProgress(problemUrl);
  console.log(`[ProgressTracker] Reset progress for ${problemUrl}`);
}

/**
 * Checks whether a specific action has been used for a problem.
 *
 * @param problemUrl - The problem URL
 * @param actionType - The action to check
 */
export async function hasUsedAction(
  problemUrl: string,
  actionType: ActionType
): Promise<boolean> {
  const progress = await getProgress(problemUrl);
  return progress?.usedActions.has(actionType) ?? false;
}

/**
 * Returns the current hint level for a problem (0 = no hints used yet).
 *
 * @param problemUrl - The problem URL
 */
export async function getHintLevel(problemUrl: string): Promise<number> {
  const progress = await getProgress(problemUrl);
  return progress?.hintLevel ?? 0;
}
