/**
 * Hint System
 *
 * Manages progressive hint generation with 3 levels:
 * - Level 1: Conceptual (what kind of problem is this?)
 * - Level 2: Approach (what strategy should I use?)
 * - Level 3: Implementation (what specific techniques matter?)
 *
 * The hint level is tracked in ProgressState and incremented
 * by the Progress Tracker each time GET_HINT is clicked.
 */

import type { ProblemContext, Hint } from '../types';
import { sendLLMRequest } from './llm-service';

export const MAX_HINT_LEVEL = 3;

const HINT_TITLES: Record<number, string> = {
  1: 'Conceptual Approach',
  2: 'Strategy & Algorithm',
  3: 'Implementation Details',
};

/**
 * Generates a hint at the given level for the problem.
 *
 * @param problemContext - The current problem
 * @param currentLevel - The hint level to generate (1, 2, or 3)
 * @param apiKey - User's API key
 */
export async function generateHint(
  problemContext: ProblemContext,
  currentLevel: number,
  apiKey: string
): Promise<Hint> {
  const level = Math.min(Math.max(currentLevel, 1), MAX_HINT_LEVEL);

  const response = await sendLLMRequest({
    problemContext,
    actionType: 'GET_HINT',
    systemPrompt: '',   // prompts.ts handles this inside sendLLMRequest
    userMessage: '',    // same
    apiKey,
    previousHintLevel: level - 1,
  });

  return {
    level,
    title: `Hint ${level}: ${HINT_TITLES[level]}`,
    content: response.content,
    isLastHint: level >= MAX_HINT_LEVEL,
  };
}

/** Returns the maximum hint level available */
export function getMaxHintLevel(): number {
  return MAX_HINT_LEVEL;
}
