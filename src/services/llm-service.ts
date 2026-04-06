import type { LLMRequest, LLMResponse } from '../types';
import { getSystemPrompt, buildUserMessage } from './prompts';

const DEFAULT_MODEL = 'gpt-4o-mini';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const REQUEST_TIMEOUT_MS = 30000;

export async function sendLLMRequest(request: LLMRequest): Promise<LLMResponse> {
  const systemPrompt = getSystemPrompt(request.actionType);
  const userMessage = buildUserMessage(request.actionType, request.problemContext, {
    hintLevel: request.previousHintLevel, userApproach: request.userApproach,
  });
  const body = JSON.stringify({
    model: DEFAULT_MODEL,
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
    max_tokens: 1024, temperature: 0.7,
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchWithRetry(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${request.apiKey}` },
      body, signal: controller.signal,
    }, 2);
    const data = await response.json() as any;
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      finishReason: data.choices?.[0]?.finish_reason ?? 'stop',
      usage: data.usage ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens } : undefined,
    };
  } finally { clearTimeout(timeoutId); }
}

export async function* streamLLMRequest(request: LLMRequest): AsyncGenerator<string> {
  const systemPrompt = getSystemPrompt(request.actionType);
  const userMessage = buildUserMessage(request.actionType, request.problemContext, {
    hintLevel: request.previousHintLevel, userApproach: request.userApproach,
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${request.apiKey}` },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
        max_tokens: 1024, temperature: 0.7, stream: true,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw await buildAPIError(response);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try { const parsed = JSON.parse(data); const chunk = parsed.choices?.[0]?.delta?.content; if (chunk) yield chunk; } catch { /* skip */ }
      }
    }
  } finally { clearTimeout(timeoutId); }
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries: number): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status >= 400 && response.status < 500) throw await buildAPIError(response);
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      return response;
    } catch (error) {
      lastError = error as Error;
      if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('API Error'))) throw error;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  throw lastError ?? new Error('Request failed');
}

async function buildAPIError(response: Response): Promise<Error> {
  let message = `API Error ${response.status}`;
  try { const body = await response.json() as any; message = body?.error?.message ?? message; } catch { /* ignore */ }
  if (response.status === 401) return new Error(`Invalid API key. ${message}`);
  if (response.status === 429) return new Error(`Rate limit exceeded. Please wait and try again.`);
  return new Error(message);
}
