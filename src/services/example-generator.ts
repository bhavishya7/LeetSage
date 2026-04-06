import type { ProblemContext, GeneratedExamples } from '../types';
import { sendLLMRequest } from './llm-service';

export async function generateExamples(problemContext: ProblemContext, apiKey: string): Promise<GeneratedExamples> {
  const response = await sendLLMRequest({ problemContext, actionType: 'GENERATE_EXAMPLES', systemPrompt: '', userMessage: '', apiKey });
  return {
    examples: [],
    comparisonView: { originalExamples: problemContext.examples, generatedExamples: [], coverageAnalysis: response.content },
  };
}
