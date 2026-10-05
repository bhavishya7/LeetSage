import { describe, it, expect } from 'vitest';
import { CHAT_TOOLS, runTool, toolSpecs, toolLabel, TOOL_RESULT_CHAR_CAP, type ToolContext } from '../chat-tools';
import type { ProblemContext } from '../../types';

/**
 * Unit tests for the read-only tool allowlist (E9, design §3).
 *
 * We avoid touching chrome.* by exercising the two in-memory tools
 * (getProblemExamples / getProblemConstraints) and the dispatcher's
 * unknown-tool / graceful-failure / capping behavior directly. getEditorCode's
 * MAIN-world read is covered by the "no tab" graceful path (getTabId → null),
 * which never calls chrome.scripting.
 */

function problem(overrides: Partial<ProblemContext> = {}): ProblemContext {
  return {
    title: 'Two Sum',
    url: 'https://leetcode.com/problems/two-sum/',
    difficulty: 'Easy',
    description: 'desc',
    examples: [
      { input: 'nums=[2,7], target=9', output: '[0,1]', explanation: '2+7=9' },
      { input: 'nums=[3,3], target=6', output: '[0,1]' },
    ],
    constraints: ['2 <= nums.length <= 10^4', '-10^9 <= nums[i] <= 10^9'],
    testCases: [],
    extractedAt: Date.now(),
    ...overrides,
  };
}

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    problemContext: problem(),
    getTabId: async () => null, // no tab → getEditorCode takes its graceful path
    ...overrides,
  };
}

describe('chat-tools: the three read-only tools', () => {
  it('exposes exactly the three allow-listed tools (no complexity tool)', () => {
    const names = CHAT_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(['getEditorCode', 'getProblemConstraints', 'getProblemExamples']);
    expect(names).not.toContain('getComplexityOfCurrentCode');
  });

  it('getProblemExamples returns the worked examples', async () => {
    const out = await runTool('getProblemExamples', ctx());
    expect(out).toContain('Example 1');
    expect(out).toContain('nums=[2,7]');
    expect(out).toContain('Explanation: 2+7=9');
  });

  it('getProblemConstraints returns the constraints', async () => {
    const out = await runTool('getProblemConstraints', ctx());
    expect(out).toContain('2 <= nums.length');
  });

  it('getProblemExamples handles a problem with no examples', async () => {
    const out = await runTool('getProblemExamples', ctx({ problemContext: problem({ examples: [] }) }));
    expect(out).toContain('no worked examples');
  });

  it('getEditorCode fails gracefully when there is no active tab', async () => {
    const out = await runTool('getEditorCode', ctx());
    expect(out).toContain("couldn't read the editor");
  });
});

describe('chat-tools: dispatcher safety', () => {
  it('rejects an unknown tool with an error string, never throws', async () => {
    const out = await runTool('deleteEverything', ctx());
    expect(out).toContain('no such tool');
    expect(out).toContain('deleteEverything');
  });

  it('caps an oversized result to the limit with a truncated marker', async () => {
    const huge = 'c'.repeat(5000);
    const out = await runTool('getProblemConstraints', ctx({ problemContext: problem({ constraints: [huge] }) }));
    expect(out.length).toBeLessThanOrEqual(TOOL_RESULT_CHAR_CAP + '\n…(truncated)'.length);
    expect(out).toContain('…(truncated)');
  });
});

describe('chat-tools: OpenAI spec + labels', () => {
  it('toolSpecs() produces the OpenAI tools[] shape', () => {
    const specs = toolSpecs();
    expect(specs).toHaveLength(3);
    for (const s of specs) {
      expect(s.type).toBe('function');
      expect(typeof s.function.name).toBe('string');
      expect(typeof s.function.description).toBe('string');
      expect(s.function.parameters.type).toBe('object');
    }
  });

  it('toolLabel returns a human step label, with a fallback for unknown tools', () => {
    expect(toolLabel('getEditorCode')).toBe('Reading your code');
    expect(toolLabel('mysteryTool')).toBe('Looking something up');
  });
});
