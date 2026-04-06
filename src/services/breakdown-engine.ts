/**
 * Breakdown Engine
 *
 * Decomposes a LeetCode problem into 3-5 logical sub-problems.
 * Helps users approach complex problems systematically.
 */

import type { ProblemContext, ProblemBreakdown } from '../types';
import { sendLLMRequest } from './llm-service';

/**
 * Breaks down the problem into manageable sub-problems.
 *
 * @param problemContext - The current problem
 * @param apiKey - User's API key
 */
export async function breakdownProblem(
  problemContext: ProblemContext,
  apiKey: string
): Promise<ProblemBreakdown> {
  const response = await sendLLMRequest({
    problemContext,
    actionType: 'BREAK_DOWN_PROBLEM',
    systemPrompt: '',
    userMessage: '',
    apiKey,
  });

  // The LLM returns markdown — we render it directly
  // Sub-problems are parsed visually from the markdown by the UI
  return {
    subProblems: [],
    visualizationType: 'checklist',
    overallStrategy: response.content,
  };
}
