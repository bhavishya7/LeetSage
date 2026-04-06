import type { ActionType, ProblemContext } from './models';

export interface LLMRequest {
  problemContext: ProblemContext;
  actionType: ActionType;
  systemPrompt: string;
  userMessage: string;
  apiKey: string;
  previousHintLevel?: number;
  userApproach?: string;
}

export interface LLMResponse {
  content: string;
  finishReason: 'stop' | 'length' | 'content_filter';
  usage?: { promptTokens: number; completionTokens: number };
}

export interface APIConfig {
  provider: 'openai' | 'anthropic' | 'custom';
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface UserSettings {
  apiConfig: APIConfig;
  enableStuckTimer: boolean;
  stuckTimerDelay: number;
  enableChatMode: boolean;
  theme: 'light' | 'dark' | 'auto';
}

export interface FilterResult {
  filteredContent: string;
  wasFiltered: boolean;
  filterReason?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
