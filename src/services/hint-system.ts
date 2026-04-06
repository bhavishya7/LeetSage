import type { ProblemContext, Hint } from '../types';
import { sendLLMRequest } from './llm-service';

export const MAX_HINT_LEVEL = 3;
const HINT_TITLES: Record<number, string> = { 1: 'Conceptual Approach', 2: 'Strategy & Algorithm', 3: 'Implementation Details' };

export async function generateHint(problemContext: ProblemContext, currentLevel: number, apiKey: string): Promise<Hint> {
  const level = Math.min(Math.max(currentLevel, 1), MAX_HINT_LEVEL);
  const response = await sendLLMRequest({ problemContext, actionType: 'GET_HINT', systemPrompt: '', userMessage: '', apiKey, previousHintLevel: level - 1 });
  return { level, title: `Hint ${level}: ${HINT_TITLES[level]}`, content: response.content, isLastHint: level >= MAX_HINT_LEVEL };
}

export function getMaxHintLevel(): number { return MAX_HINT_LEVEL; }
