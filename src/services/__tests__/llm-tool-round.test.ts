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

  it('surfaces a 429 rate-limit error via buildAPIError', async () => {
    mockFetchOnceJson({ error: { message: 'quota' } }, false, 429);
    await expect(sendToolRound(base)).rejects.toThrow(/rate limit|quota/i);
  });

  it('tolerates an empty/zero-choice response', async () => {
    mockFetchOnceJson({ choices: [] });
    const turn = await sendToolRound(base);
    expect(turn.content).toBe('');
    expect(turn.toolCalls).toHaveLength(0);
  });
});
