import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendToolRound, type ToolSpec } from '../llm-service';

/**
 * Tests for the non-streaming tool-call round (E9, design §4/§7.1).
 *
 * We stub global fetch to return canned OpenAI-compatible JSON and assert that
 * sendToolRound parses the assistant turn correctly: a tool-call response, a
 * plain-answer response, malformed arguments, and that API errors surface via
 * the shared buildAPIError path. The response is an untrusted boundary, so the
 * parsing must be defensive.
 */

const TOOLS: ToolSpec[] = [
  { type: 'function', function: { name: 'getEditorCode', description: 'd', parameters: { type: 'object', properties: {} } } },
];

function mockFetchOnceJson(json: unknown, ok = true, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok,
    status,
    json: async () => json,
  })) as unknown as typeof fetch);
}

afterEach(() => { vi.unstubAllGlobals(); });

const base = { apiKey: 'k', messages: [{ role: 'user', content: 'hi' }], tools: TOOLS };

describe('sendToolRound', () => {
  it('parses a tool-call response into normalized ToolCall[]', async () => {
    mockFetchOnceJson({
      choices: [{ message: { content: '', tool_calls: [
        { id: 'c1', function: { name: 'getEditorCode', arguments: '{}' } },
      ] } }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    });
    const turn = await sendToolRound(base);
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0]).toMatchObject({ id: 'c1', name: 'getEditorCode', arguments: {} });
    expect(turn.usage).toEqual({ promptTokens: 10, completionTokens: 2 });
  });

  it('parses a plain answer (no tool calls)', async () => {
    mockFetchOnceJson({
      choices: [{ message: { content: 'A hash map stores key/value pairs.' } }],
    });
    const turn = await sendToolRound(base);
    expect(turn.toolCalls).toHaveLength(0);
    expect(turn.content).toContain('hash map');
  });

  it('handles malformed tool-call arguments by defaulting to {}', async () => {
    mockFetchOnceJson({
      choices: [{ message: { tool_calls: [
        { id: 'c2', function: { name: 'getProblemExamples', arguments: 'NOT JSON {' } },
      ] } }],
    });
    const turn = await sendToolRound(base);
    expect(turn.toolCalls[0]).toMatchObject({ name: 'getProblemExamples', arguments: {} });
  });

  it('drops a tool call with no function name (defensive)', async () => {
    mockFetchOnceJson({
      choices: [{ message: { tool_calls: [
        { id: 'c3', function: { arguments: '{}' } },
        { id: 'c4', function: { name: 'getProblemConstraints', arguments: '{}' } },
      ] } }],
    });
    const turn = await sendToolRound(base);
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0].name).toBe('getProblemConstraints');
  });

  it('surfaces a 429 rate-limit error as a friendly, non-technical message', async () => {
    mockFetchOnceJson({ error: { message: 'quota' } }, false, 429);
    // The message is user-facing: it names the free-tier limit and the "wait"
    // action, and must NOT leak a raw status code. (chat-polish error-copy fix)
    const err = await sendToolRound(base).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/free-tier limit|try again/i);
    expect((err as Error).message).not.toMatch(/\b429\b/);
  });

  it('surfaces a transient 503 as a friendly "service busy" message (not a raw code)', async () => {
    // 503 = Google-side overload. The user should see an apologetic, temporary
    // message, never "API Error 503". Guards the chat-polish error-copy fix.
    // 503 is RETRYABLE, so fetchWithRetry backs off (1s, 2s) between attempts;
    // fake timers advance through that so the test doesn't actually wait ~3s.
    vi.useFakeTimers();
    try {
      mockFetchOnceJson({ error: { message: 'overloaded' } }, false, 503);
      const pending = sendToolRound(base).catch((e: Error) => e);
      await vi.runAllTimersAsync(); // flush the retry backoff waits
      const err = await pending;
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/busy|temporary|try again/i);
      expect((err as Error).message).not.toMatch(/\b503\b/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('RETRIES a transient 503 and succeeds if a later attempt is OK', async () => {
    // Proves the retry actually recovers: first call 503, second call 200.
    // This is the behavior that turns a one-off Google blip into a non-event.
    vi.useFakeTimers();
    try {
      let call = 0;
      vi.stubGlobal('fetch', vi.fn(async () => {
        call += 1;
        if (call === 1) return { ok: false, status: 503, json: async () => ({ error: { message: 'overloaded' } }) };
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'recovered' } }] }) };
      }) as unknown as typeof fetch);
      const pending = sendToolRound(base);
      await vi.runAllTimersAsync();
      const turn = await pending;
      expect(turn.content).toBe('recovered');
      expect(call).toBe(2); // one failure, one success
    } finally {
      vi.useRealTimers();
    }
  });

  it('tolerates an empty/zero-choice response', async () => {
    mockFetchOnceJson({ choices: [] });
    const turn = await sendToolRound(base);
    expect(turn.content).toBe('');
    expect(turn.toolCalls).toHaveLength(0);
  });
});
