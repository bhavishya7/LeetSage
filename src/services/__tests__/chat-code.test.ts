import { describe, it, expect } from 'vitest';
import { buildChatData } from '../llm-service';
import { getChatSystemPrompt } from '../prompts';
import type { LLMRequest, ProblemContext } from '../../types';

/**
 * B4 — code-aware guardrailed chat (see .kiro/specs/leetsage-guardrail-hardening).
 *
 * Free-form chat used to send only the problem context, so "what is my code's
 * time complexity?" returned "you didn't include your code" even with a full
 * solution in the editor. Chat now sends the editor code (when present) as
 * UNTRUSTED data, so the coach can ground its answer in the user's own work —
 * while staying NON-EXEMPT (the response still runs through filterResponse).
 *
 * These pin the data-assembly contract (`buildChatData`) and the prompt's
 * awareness of editor code, DOM-free per this project's vitest env=node.
 */

const PROBLEM: ProblemContext = {
  title: 'Search a 2D Matrix',
  url: 'https://leetcode.com/problems/search-a-2d-matrix/',
  difficulty: 'Medium',
  description: 'Search a target in a row-sorted matrix.',
  examples: [{ input: 'matrix=[[1,3]], target=3', output: 'true' }],
  constraints: ['m == matrix.length'],
  testCases: [],
  extractedAt: 0,
};

const USER_CODE = [
  'class Solution:',
  '    def searchMatrix(self, matrix, target):',
  '        lo, hi = 0, len(matrix) * len(matrix[0]) - 1',
  '        while lo <= hi:',
  '            mid = (lo + hi) // 2',
  '            ...',
].join('\n');

function chatRequest(overrides: Partial<LLMRequest>): LLMRequest {
  return {
    problemContext: PROBLEM,
    actionType: 'EXPLAIN_CONCEPT',
    systemPrompt: '',
    userMessage: '',
    apiKey: 'k',
    userQuery: 'what is the current time complexity',
    ...overrides,
  };
}

describe('buildChatData — folds editor code into the chat payload (B4)', () => {
  it('includes the fenced editor code + language when code is present', () => {
    const data = buildChatData(chatRequest({ userCode: USER_CODE, codeLanguage: 'python' }));
    // Problem context still present.
    expect(data).toContain('Search a 2D Matrix');
    // The code is fenced with its language.
    expect(data).toContain('```python');
    expect(data).toContain('def searchMatrix');
    // Framed as the user's own, possibly-incomplete code (no correctness claim).
    expect(data.toLowerCase()).toContain('my current editor code');
    expect(data.toLowerCase()).toContain('incomplete');
  });

  it('omits the code block entirely when the editor is empty', () => {
    const data = buildChatData(chatRequest({ userCode: undefined }));
    expect(data).toContain('Search a 2D Matrix');
    expect(data).not.toContain('```');
    expect(data.toLowerCase()).not.toContain('my current editor code');
  });

  it('treats whitespace-only code as empty (no code block)', () => {
    const data = buildChatData(chatRequest({ userCode: '   \n  ', codeLanguage: 'python' }));
    expect(data).not.toContain('```');
  });
});

describe('getChatSystemPrompt — aware of editor code but still guardrailed (B4)', () => {
  const chat = getChatSystemPrompt();

  it('tells the model it may have the user\'s editor code and must not assume it is correct', () => {
    expect(chat.toLowerCase()).toContain('editor code');
    expect(chat.toLowerCase()).toMatch(/incomplete|do not assume it works/i);
  });

  it('still refuses to reveal the full/optimal solution (stays guardrailed)', () => {
    // Keeps the no-solutions rules and points at Understand Solution instead.
    expect(chat).toContain('NEVER provide a complete working code solution');
    expect(chat.toLowerCase()).toContain('understand solution');
  });
});
