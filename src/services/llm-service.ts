/**
 * LLM Service
 *
 * Handles all communication with the LLM API (OpenAI by default).
 *
 * Why call the API from the side panel directly?
 * - No backend server needed (personal project)
 * - User provides their own API key
 * - Simpler architecture
 *
 * Why support streaming?
 * - Streaming shows text as it's generated (feels faster, more engaging)
 * - Without streaming, user stares at a spinner for 3-5 seconds
 * - With streaming, text appears word by word immediately
 *
 * API format:
 * We use the OpenAI chat completions format, which is also supported by
 * many other providers (Anthropic via compatibility layer, local models, etc.)
 */

import type { LLMRequest, LLMResponse } from '../types';
import { getSystemPrompt, buildUserMessage } from './prompts';

/** Default model to use */
const DEFAULT_MODEL = 'gpt-4o-mini';

/** Default base URL for OpenAI */
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Sends a request to the LLM API and returns the full response.
 * Use this when you don't need streaming.
 */
export async function sendLLMRequest(request: LLMRequest): Promise<LLMResponse> {
  const systemPrompt = getSystemPrompt(request.actionType);
  const userMessage = buildUserMessage(request.actionType, request.problemContext, {
    hintLevel: request.previousHintLevel,
    userApproach: request.userApproach,
  });

  const baseUrl = request.apiKey.startsWith('sk-ant-')
    ? 'https://api.anthropic.com/v1'  // Anthropic key detected
    : OPENAI_BASE_URL;

  const body = JSON.stringify({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 1024,
    temperature: 0.7,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchWithRetry(
      `${baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${request.apiKey}`,
        },
        body,
        signal: controller.signal,
      },
      2 // max retries
    );

    const data = await response.json() as any;

    return {
      content: data.choices?.[0]?.message?.content ?? '',
      finishReason: data.choices?.[0]?.finish_reason ?? 'stop',
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
      } : undefined,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Streams a response from the LLM API, yielding chunks as they arrive.
 *
 * Usage:
 * ```typescript
 * for await (const chunk of streamLLMRequest(request)) {
 *   setContent(prev => prev + chunk);
 * }
 * ```
 */
export async function* streamLLMRequest(request: LLMRequest): AsyncGenerator<string> {
  const systemPrompt = getSystemPrompt(request.actionType);
  const userMessage = buildUserMessage(request.actionType, request.problemContext, {
    hintLevel: request.previousHintLevel,
    userApproach: request.userApproach,
  });

  const baseUrl = OPENAI_BASE_URL;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 1024,
        temperature: 0.7,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw await buildAPIError(response);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // SSE format: each line is "data: {...}" or "data: [DONE]"
      const lines = decoder.decode(value).split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const chunk = parsed.choices?.[0]?.delta?.content;
          if (chunk) yield chunk;
        } catch {
          // Skip malformed chunks
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch with automatic retry on network errors.
 * Does NOT retry on 4xx errors (bad API key, rate limit, etc.)
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Don't retry client errors (4xx) — they won't fix themselves
      if (response.status >= 400 && response.status < 500) {
        throw await buildAPIError(response);
      }

      // Retry server errors (5xx)
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      return response;
    } catch (error) {
      lastError = error as Error;

      // Don't retry on abort (timeout) or client errors
      if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('API Error'))) {
        throw error;
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError ?? new Error('Request failed');
}

/**
 * Builds a descriptive error from an API response
 */
async function buildAPIError(response: Response): Promise<Error> {
  let message = `API Error ${response.status}`;

  try {
    const body = await response.json() as any;
    message = body?.error?.message ?? message;
  } catch {
    // Ignore JSON parse errors
  }

  if (response.status === 401) return new Error(`Invalid API key. ${message}`);
  if (response.status === 429) return new Error(`Rate limit exceeded. Please wait and try again.`);
  if (response.status === 403) return new Error(`Access denied. Check your API key permissions.`);

  return new Error(message);
}
