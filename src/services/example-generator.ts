/**
 * Example Generator
 *
 * Generates alternative test cases with complexity indicators.
 * Helps users understand the problem through varied examples.
 */

import type { ProblemContext, GeneratedExamples } from '../types';
import { sendLLMRequest } from './llm-service';

/**
 * Generates new examples for the given problem.
 *
 * @param problemContext - The current problem
 * @param apiKey - User's API key
 */
export async function generateExamples(
  problemContext: ProblemContext,
  apiKey: string
): Promise<GeneratedExamples> {
  const response = await sendLLMRequest({
    problemContext,
    actionType: 'GENERATE_EXAMPLES',
    systemPrompt: '',
    userMessage: '',
    apiKey,
  });

  // Return the raw markdown content — the UI renders it
  // The comparison view uses the original examples from problemContext
  return {
    examples: [],  // Parsed from response.content by the UI
    comparisonView: {
      originalExamples: problemContext.examples,
      generatedExamples: [],
      coverageAnalysis: response.content,
    },
  };
}
