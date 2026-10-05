import { describe, it, expect, vi } from 'vitest';
import { runChatAgent, MAX_TOOL_ROUNDS, type ChatAgentDeps, type AgentStep } from '../chat-agent';
import type { AssistantTurn, ToolCall } from '../llm-service';

/**
 * Unit tests for the bounded agent loop (E9, design §2, R7).
 *
 * The whole loop is deps-injected, so we drive it with fakes and assert the
 * behaviors that keep it SAFE and CHEAP:
 *   - the request-accounting invariant (recordRound called once per network
 *     round — this is what proves one message never silently burns N requests);
 *   - the hard round cap forcing a final answer;
 *   - graceful stop when the budget is exhausted;
 *   - the step-trace sequence.
 */

function toolCall(name: string, id = 'c1'): ToolCall {
  return { id, name, arguments: {} };
}
function turn(content: string, toolCalls: ToolCall[] = []): AssistantTurn {
  return { content, toolCalls, usage: { promptTokens: 5, completionTokens: 5 } };
}

/** Build fake deps with a scripted sequence of tool-round responses. */
function makeDeps(roundScript: AssistantTurn[], over: Partial<ChatAgentDeps> = {}) {
  const recordRound = vi.fn(async () => {});
  const runTool = vi.fn(async (c: ToolCall) => `fenced-result-for-${c.name}`);
  const streamFinal = vi.fn(async () => 'FINAL ANSWER');
  let i = 0;
  const runToolRound = vi.fn(async () => roundScript[i++] ?? turn('fallback'));
  const steps: AgentStep[] = [];
  const deps: ChatAgentDeps = {
    runToolRound,
    streamFinal,
    runTool,
    checkBudget: async () => ({ allowed: true }),
    recordRound,
    onStep: (s) => steps.push(s),
    toolLabel: (n) => `Label:${n}`,
    ...over,
  };
  return { deps, recordRound, runTool, streamFinal, runToolRound, steps };
}

const MESSAGES = [{ role: 'user', content: 'q' }];

describe('runChatAgent — answered without tools (Tier 2)', () => {
  it('returns the answer in one round, counts exactly 1 request', async () => {
    const { deps, recordRound, runTool, streamFinal } = makeDeps([turn('direct answer')]);
    const res = await runChatAgent(MESSAGES, deps);
    expect(res).toMatchObject({ answer: 'direct answer', roundsUsed: 0, stoppedReason: 'answered' });
    expect(recordRound).toHaveBeenCalledTimes(1); // the one round
    expect(runTool).not.toHaveBeenCalled();
    expect(streamFinal).not.toHaveBeenCalled();
  });
});

describe('runChatAgent — one tool round then answer (Tier 3)', () => {
  it('runs the tool, then answers; counts 2 requests (round + final)', async () => {
    const { deps, recordRound, runTool, streamFinal, steps } = makeDeps([
      turn('', [toolCall('getEditorCode')]), // round 0: asks for a tool
      // round 1 is never scripted as a tool-call; model answers via... actually
      // after a tool round we loop; round 1 returns a plain answer:
      turn('answer using the code'),
    ]);
    const res = await runChatAgent(MESSAGES, deps);
    expect(res.stoppedReason).toBe('answered');
    expect(res.roundsUsed).toBe(1);
    expect(res.answer).toBe('answer using the code');
    expect(runTool).toHaveBeenCalledTimes(1);
    expect(recordRound).toHaveBeenCalledTimes(2); // 2 tool rounds issued (round 0 + round 1)
    expect(streamFinal).not.toHaveBeenCalled();
    // step trace includes the tool label
    expect(steps.some((s) => s.kind === 'tool' && s.label === 'Label:getEditorCode')).toBe(true);
  });
});

describe('runChatAgent — hard round cap (R7.1)', () => {
  it('caps at MAX_TOOL_ROUNDS and forces a streamed final answer', async () => {
    // Model keeps asking for tools every round.
    const greedy = Array.from({ length: 5 }, (_, k) => turn('', [toolCall('getEditorCode', `c${k}`)]));
    const { deps, recordRound, streamFinal, runToolRound } = makeDeps(greedy);
    const res = await runChatAgent(MESSAGES, deps);
    expect(res.stoppedReason).toBe('cap');
    expect(res.answer).toBe('FINAL ANSWER');
    expect(runToolRound).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS); // 2 tool rounds
    expect(streamFinal).toHaveBeenCalledTimes(1);                // forced final
    // INVARIANT: recordRound === network rounds issued = 2 tool rounds + 1 final = 3
    expect(recordRound).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS + 1);
  });
});

describe('runChatAgent — budget exhausted mid-loop (R7.3/R9)', () => {
  it('stops gracefully and still produces a final answer', async () => {
    const { deps, recordRound, runToolRound, streamFinal } = makeDeps(
      [turn('', [toolCall('getEditorCode')])],
      { checkBudget: async () => ({ allowed: false, reason: 'daily cap' }) },
    );
    const res = await runChatAgent(MESSAGES, deps);
    expect(res.stoppedReason).toBe('budget');
    expect(res.answer).toBe('FINAL ANSWER');
    expect(runToolRound).not.toHaveBeenCalled(); // denied before the first round
    expect(streamFinal).toHaveBeenCalledTimes(1);
    expect(recordRound).toHaveBeenCalledTimes(1); // just the final answer
  });
});

describe('runChatAgent — accounting invariant', () => {
  it('recordRound call count always equals the number of network rounds issued', async () => {
    // 1 tool round + 1 answering round = 2 recordRound; also assert via a counter.
    const { deps, recordRound, runToolRound, streamFinal } = makeDeps([
      turn('', [toolCall('getProblemExamples')]),
      turn('answer'),
    ]);
    await runChatAgent(MESSAGES, deps);
    const networkRounds = runToolRound.mock.calls.length + streamFinal.mock.calls.length;
    expect(recordRound).toHaveBeenCalledTimes(networkRounds);
  });

  it('is a no-op-safe when onStep is omitted', async () => {
    const { deps } = makeDeps([turn('answer')]);
    const noStep: ChatAgentDeps = { ...deps, onStep: undefined };
    const res = await runChatAgent(MESSAGES, noStep);
    expect(res.answer).toBe('answer');
  });
});
