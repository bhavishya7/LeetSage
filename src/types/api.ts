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
  /** A free-form user question. When set, it replaces the templated message. */
  userQuery?: string;
  /** The user's current editor code (for CHECK_APPROACH analysis). */
  userCode?: string;
  /** The editor language for the code above (e.g. "python", "cpp"). */
  codeLanguage?: string;
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

/**
 * Free-tier guardrails. Defaults are generous (well under Gemini's free
 * limits) but every value is user-adjustable. The kill switch is off by
 * default and, when on, blocks all API calls instantly.
 */
export interface GuardrailSettings {
  maxTokens: number;            // per-response token cap
  maxRequestsPerMinute: number; // local per-minute cap (stricter than Gemini)
  maxRequestsPerDay: number;    // local per-day cap
  cooldownMs: number;           // min gap between consecutive requests
  requestTimeoutMs: number;     // hard request timeout
  killSwitch: boolean;          // when true, block all requests
}

export const DEFAULT_GUARDRAILS: GuardrailSettings = {
  maxTokens: 800,
  maxRequestsPerMinute: 8,
  maxRequestsPerDay: 200,
  cooldownMs: 2000,
  requestTimeoutMs: 20000,
  killSwitch: false,
};

export interface UserSettings {
  apiConfig: APIConfig;
  guardrails: GuardrailSettings;
  enableStuckTimer: boolean;
  stuckTimerDelay: number;
  enableChatMode: boolean;
  theme: 'light' | 'dark' | 'auto';
}

/**
 * Per-day usage tracking, persisted so it survives service-worker sleep.
 * recentTimestamps holds request times within the last minute for the
 * per-minute window; count is the running total for `date`.
 */
export interface UsageState {
  date: string;             // YYYY-MM-DD (local)
  count: number;            // requests made today
  recentTimestamps: number[]; // epoch ms of recent requests (last ~60s)
}

/** Result of a guardrail pre-check before making a request. */
export interface GuardrailCheck {
  allowed: boolean;
  reason?: string;
  /** ms the caller should wait before retrying (for cooldown/rate limits). */
  retryAfterMs?: number;
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
