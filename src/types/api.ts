/**
 * API-related types for LLM integration
 * 
 * These types define how we communicate with external LLM APIs:
 * - LLMRequest: What we send to the API
 * - LLMResponse: What we get back
 * - APIConfig: User's API configuration
 */

import type { ActionType, ProblemContext } from './models';

/**
 * Request sent to the LLM API
 */
export interface LLMRequest {
  /** The problem context for grounding the AI's response */
  problemContext: ProblemContext;
  
  /** Which action button was clicked */
  actionType: ActionType;
  
  /** System prompt that defines the AI's role and rules */
  systemPrompt: string;
  
  /** The user's message or query */
  userMessage: string;
  
  /** API key for authentication */
  apiKey: string;
  
  /** For GET_HINT: which hint level we're at (0-2) */
  previousHintLevel?: number;
  
  /** For CHECK_APPROACH: user's proposed approach */
  userApproach?: string;
}

/**
 * Response from the LLM API
 */
export interface LLMResponse {
  /** The generated content (markdown-formatted) */
  content: string;
  
  /** Why the generation stopped */
  finishReason: 'stop' | 'length' | 'content_filter';
  
  /** Token usage information (optional) */
  usage?: {
    /** Tokens in the prompt */
    promptTokens: number;
    
    /** Tokens in the completion */
    completionTokens: number;
  };
}

/**
 * User's API configuration
 */
export interface APIConfig {
  /** Which LLM provider to use */
  provider: 'openai' | 'anthropic' | 'custom';
  
  /** API key for authentication */
  apiKey: string;
  
  /** Custom base URL (for custom provider) */
  baseUrl?: string;
  
  /** Model name (e.g., "gpt-4", "claude-3-opus") */
  model?: string;
}

/**
 * User settings stored in Chrome storage
 */
export interface UserSettings {
  /** API configuration */
  apiConfig: APIConfig;
  
  /** Whether to show proactive stuck timer suggestions */
  enableStuckTimer: boolean;
  
  /** How long to wait before showing stuck suggestion (milliseconds) */
  stuckTimerDelay: number;
  
  /** Whether chat mode is enabled */
  enableChatMode: boolean;
  
  /** UI theme preference */
  theme: 'light' | 'dark' | 'auto';
}

/**
 * Result of solution filtering
 */
export interface FilterResult {
  /** The filtered content (may be modified from original) */
  filteredContent: string;
  
  /** Whether the content was modified by the filter */
  wasFiltered: boolean;
  
  /** Reason for filtering (if filtered) */
  filterReason?: string;
}

/**
 * Chat message in chat mode
 */
export interface ChatMessage {
  /** Unique message ID */
  id: string;
  
  /** Who sent this message */
  role: 'user' | 'assistant';
  
  /** Message content */
  content: string;
  
  /** When this message was sent (milliseconds since epoch) */
  timestamp: number;
}
