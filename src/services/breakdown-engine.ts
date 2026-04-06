import type { ProblemContext, ProblemBreakdown } from '../types';
import { sendLLMRequest } from './llm-service';

export async function breakdownProblem(problemContext: ProblemContext, apiKey: string): Promise<ProblemBreakdown> {
  const response = await sendLLMRequest({ problemContext, actionType: 'BREAK_DOWN_PROBLEM', systemPrompt: '', userMessage: '', apiKey });
  return { subProblems: [], visualizationType: 'checklist', overallStrategy: response.content };
}
