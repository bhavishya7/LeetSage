import type { ActionType, ProblemContext } from './models';

/** Gemini models exposed to the user (free-tier friendly). */
export type GeminiModel = 'gemini-3.5-flash-lite' | 'gemini-3.5-flash';

export interface LLMRequest {
  problemContext: ProblemContext;
  actionType: ActionType;
  systemPrompt: string;
  userMessage: string;
  apiKey: string;
  /** Which Gemini model to use. Defaults to flash-lite if omitted. */
  model?: GeminiModel;
  /** Per-response token cap. Defaults applied in the service if omitted. */
  maxTokens?: number;
  /** Hard request timeout in ms. Defaults applied in the service if omitted. */
  timeoutMs?: number;
  previousHintLevel?: number;
  userApproach?: string;
}

export interface LLMResponse {
  content: string;
  finishReason: 'stop' | 'length' | 'content_filter';
  usage?: { promptTokens: number; completionTokens: number };
}

export interface APIConfig {
  /** Phase 1 uses Gemini exclusively (bring-your-own-key). */
  provider: 'gemini';
  apiKey: string;
  model: GeminiModel;
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
