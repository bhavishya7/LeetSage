import type { LLMRequest, LLMResponse, GeminiModel } from '../types';
import { getSystemPrompt, buildUserMessage, formatProblemContext, wrapUntrusted } from './prompts';

// Google Gemini via its OpenAI-compatible endpoint. This lets us keep the
// standard chat-completions request/response shape while using a free-tier
// provider (no billing required; over-limit requests are rejected, not billed).
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

// Minimal shape of the OpenAI-compatible chat-completions JSON we read. All
// fields optional — it's an untrusted external boundary, so every access is
// guarded with `?.` and a fallback.
interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: LLMResponse['finishReason'];
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/** Shape of the JSON error body Gemini returns on a failed request. */
interface APIErrorBody {
  error?: { message?: string };
}

const DEFAULT_MODEL: GeminiModel = 'gemini-3.5-flash-lite';
const DEFAULT_MAX_TOKENS = 800;
const DEFAULT_TIMEOUT_MS = 20000;

function buildMessages(request: LLMRequest) {
  const systemPrompt = getSystemPrompt(request.actionType);
  // Free-form questions replace the templated message but stay grounded by
  // prepending the problem context so the coach knows what we're working on.
  // The problem context is UNTRUSTED (scraped page content), so it rides inside
  // the same injection-hardening wrapper as the templated actions; the user's
  // own question stays outside the block as the instruction. (See
  // .kiro/specs/leetsage-prompt-injection.)
  const userMessage = request.userQuery
    ? wrapUntrusted(formatProblemContext(request.problemContext), `My question: ${request.userQuery}`)
    : buildUserMessage(request.actionType, request.problemContext, {
        hintLevel: request.previousHintLevel,
        userApproach: request.userApproach,
        userCode: request.userCode,
        codeLanguage: request.codeLanguage,
        sessionDigest: request.sessionDigest,
      });
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
}

export async function sendLLMRequest(request: LLMRequest): Promise<LLMResponse> {
  const model = request.model ?? DEFAULT_MODEL;
  const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const body = JSON.stringify({
    model,
    messages: buildMessages(request),
    max_tokens: maxTokens,
    temperature: 0.7,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchWithRetry(`${GEMINI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${request.apiKey}` },
      body, signal: controller.signal,
    }, 2);
    const data = await response.json() as ChatCompletionResponse;
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      finishReason: data.choices?.[0]?.finish_reason ?? 'stop',
      usage: data.usage ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens } : undefined,
    };
  } finally { clearTimeout(timeoutId); }
}

export async function* streamLLMRequest(request: LLMRequest): AsyncGenerator<string> {
  const model = request.model ?? DEFAULT_MODEL;
  const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${request.apiKey}` },
      body: JSON.stringify({
        model,
        messages: buildMessages(request),
        max_tokens: maxTokens,
        temperature: 0.7,
        stream: true,
        // Ask the OpenAI-compatible endpoint to emit a final usage-only chunk
        // (empty `choices`, populated `usage`) right before [DONE]. This is how
        // we get token counts on the streaming path for the metrics
        // instrumentation. Best-effort: if the endpoint ignores it, onUsage
        // simply never fires and metrics record the request as tokens-absent.
        stream_options: { include_usage: true },
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
        try {
          const parsed = JSON.parse(data);
          const chunk = parsed.choices?.[0]?.delta?.content;
          if (chunk) yield chunk;
          // The usage-only chunk carries no content; surface it once via the
          // optional callback. Guarded (untrusted external boundary).
          const u = parsed.usage;
          if (u && typeof u.prompt_tokens === 'number' && typeof u.completion_tokens === 'number') {
            request.onUsage?.({ promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens });
          }
        } catch { /* skip malformed chunk */ }
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
  try { const body = await response.json() as APIErrorBody; message = body?.error?.message ?? message; } catch { /* ignore */ }
  if (response.status === 401 || response.status === 403) return new Error(`Invalid or unauthorized Gemini API key. ${message}`);
  if (response.status === 429) return new Error('Gemini rate limit / free-tier quota reached. Please wait and try again.');
  return new Error(message);
}
