import { describe, it, expect } from 'vitest';
import { filterResponse } from '../solution-filter';
import type { ActionType } from '../../types';

/**
 * Unit tests for THE guardrail (solution-filter.ts).
 *
 * This is the deterministic half of the "teaches, never hands over the full
 * solution" promise. These tests pin the behavior that the Tier-2 eval then
 * measures at the dataset level: what it catches, what it lets through, and
 * that the three exempt actions bypass it entirely.
 */

// A non-exempt action — the default coaching path the filter must police.
const COACHING: ActionType = 'GET_HINT';

// Build a fenced code block with N non-blank lines.
function codeBlock(lines: number, lang = 'python'): string {
  const body = Array.from({ length: lines }, (_, i) => `    x${i} = ${i}`).join('\n');
  return '```' + lang + '\n' + body + '\n```';
}

describe('filterResponse — exempt actions bypass entirely', () => {
  const exempt: ActionType[] = ['CHECK_APPROACH', 'UNDERSTAND_SOLUTION', 'GENERATE_REPORT'];

  for (const action of exempt) {
    it(`${action} is not filtered even with a full solution`, () => {
      // Content that would trip every other rule: solution phrase + huge block.
      const content = "Here's the complete solution:\n" + codeBlock(30);
      const result = filterResponse(content, action);
      expect(result.wasFiltered).toBe(false);
      expect(result.filteredContent).toBe(content);
    });
  }
});

describe('filterResponse — solution-revealing phrases', () => {
  const phrases = [
    "here's the complete solution",
    'here is the complete solution',
    "here's the full solution",
    'complete implementation',
    'full implementation',
    "here's the code",
    'here is the code',
  ];

  for (const phrase of phrases) {
    it(`catches "${phrase}" (case-insensitive)`, () => {
      const result = filterResponse(`Sure. ${phrase.toUpperCase()} for this problem.`, COACHING);
      expect(result.wasFiltered).toBe(true);
      expect(result.filterReason).toBe('Solution phrases detected');
    });
  }

  it('does not trip on innocent prose', () => {
    const result = filterResponse('Think about what data structure lets you look things up in O(1).', COACHING);
    expect(result.wasFiltered).toBe(false);
  });
});

describe('filterResponse — code block length limit (>14 non-blank lines)', () => {
  it('passes a block at the 14-line boundary', () => {
    const result = filterResponse('A small illustration:\n' + codeBlock(14), COACHING);
    expect(result.wasFiltered).toBe(false);
  });

  it('filters a block of 15 lines', () => {
    const result = filterResponse('Look:\n' + codeBlock(15), COACHING);
    expect(result.wasFiltered).toBe(true);
    expect(result.filterReason).toBe('Code block too long');
  });

  it('ignores blank lines when counting (blank padding does not trip it)', () => {
    // 10 real lines separated by blanks -> 19 physical lines, 10 non-blank.
    const padded = Array.from({ length: 10 }, (_, i) => `    y${i} = ${i}`).join('\n\n');
    const result = filterResponse('```python\n' + padded + '\n```', COACHING);
    expect(result.wasFiltered).toBe(false);
  });
});

describe('filterResponse — complete function implementation (>8 lines + regex)', () => {
  it('catches a full Python function between 9 and 14 lines', () => {
    // 9 body lines: over MAX_SNIPPET_LINES (8), under MAX_CODE_BLOCK_LINES (14),
    // so it must be the COMPLETE_FUNCTION_PATTERNS regex that catches it.
    const fn = [
      '```python',
      'def two_sum(nums, target):',
      '    seen = {}',
      '    for i in range(len(nums)):',
      '        a = nums[i]',
      '        b = target - a',
      '        if b in seen:',
      '            return [seen[b], i]',
      '        seen[a] = i',
      '    return []',
      '```',
    ].join('\n');
    const result = filterResponse(fn, COACHING);
    expect(result.wasFiltered).toBe(true);
    expect(result.filterReason).toBe('Complete implementation detected');
  });

  it('passes a short snippet (<=8 lines) even if it looks like code', () => {
    const snippet = [
      '```python',
      'seen = {}',
      'for i, a in enumerate(nums):',
      '    if target - a in seen:',
      '        return True',
      '```',
    ].join('\n');
    const result = filterResponse('One idea:\n' + snippet, COACHING);
    expect(result.wasFiltered).toBe(false);
  });
});

describe('filterResponse — full pseudocode (fenced and prose)', () => {
  const fullAlgorithm = [
    'initialize an empty hash map',
    'for each number in the array',
    'if target minus number is in the map',
    'return the two indices',
    'else set map at number to index',
    'return an empty result',
  ].join('\n');

  it('catches full pseudocode inside a fenced block', () => {
    const result = filterResponse('```\n' + fullAlgorithm + '\n```', COACHING);
    expect(result.wasFiltered).toBe(true);
    expect(result.filterReason).toContain('Full pseudocode detected');
  });

  it('catches full pseudocode written as prose (no fences)', () => {
    const result = filterResponse(fullAlgorithm, COACHING);
    expect(result.wasFiltered).toBe(true);
    expect(result.filterReason).toBe('Full pseudocode detected (prose)');
  });

  it('passes a single-idea pseudocode hint (one control line)', () => {
    const oneIdea = 'Try iterating once and remembering what you have seen in a map.';
    const result = filterResponse(oneIdea, COACHING);
    expect(result.wasFiltered).toBe(false);
  });

  it('passes a conceptual hint with a loop mention but no full algorithm', () => {
    const hint = 'A hash map gives O(1) lookups. As you loop, ask: have I seen the complement before?';
    const result = filterResponse(hint, COACHING);
    expect(result.wasFiltered).toBe(false);
  });
});

describe('filterResponse — folded-conditional pseudocode (B3 blind spot)', () => {
  // The real observed leak: a whole binary search whose branch is folded into
  // inline bound updates, so it has no line-leading `if`/`return` and used to
  // score under the old >= 5 control-line threshold. See B3 in
  // .kiro/specs/leetsage-guardrail-hardening/requirements.md.
  const foldedBinarySearchFenced = [
    '```',
    'left = 0, right = n - 1',
    'while left <= right:',
    '    mid = (left + right) / 2',
    '    left = mid + 1 if arr[mid] < target else left',
    '    right = mid - 1 if arr[mid] > target else right',
    'return mid if arr[mid] == target else -1',
    '```',
  ].join('\n');

  const foldedBinarySearchProse = [
    'set left to 0 and right to the last index',
    'while left is less than or equal to right, compute mid as the midpoint',
    'move left to mid plus one when the middle value is smaller than the target',
    'move right to mid minus one when the middle value is larger than the target',
    'the answer is mid once the middle value equals the target',
  ].join('\n');

  it('catches a fenced folded-conditional binary search (loop + bound updates + return)', () => {
    const result = filterResponse(foldedBinarySearchFenced, COACHING);
    expect(result.wasFiltered).toBe(true);
    expect(result.filterReason).toContain('Full pseudocode detected');
  });

  it('catches the same folded binary search written as prose (no fences)', () => {
    const result = filterResponse(foldedBinarySearchProse, COACHING);
    expect(result.wasFiltered).toBe(true);
    expect(result.filterReason).toBe('Full pseudocode detected (prose)');
  });

  it('passes a short binary-search illustration (loop + one midpoint idea, no full procedure)', () => {
    // Loop header + a single midpoint line, no bound updates, no answer — legit
    // "here is the ONE idea" coaching snippet. Must NOT be a false positive.
    const snippet = [
      'Binary search halves the range each step:',
      '```',
      'while left <= right:',
      '    mid = (left + right) / 2',
      '```',
      'Which half do you keep after comparing `arr[mid]` to the target?',
    ].join('\n');
    const result = filterResponse(snippet, 'EXPLAIN_CONCEPT');
    expect(result.wasFiltered).toBe(false);
  });

  it('passes plain prose that NAMES binary search without spelling out the procedure', () => {
    const prose = 'This looks like a Binary Search problem: the array is sorted, so compare against the middle and discard half the range each time. What invariant must your left and right bounds keep?';
    const result = filterResponse(prose, 'PATTERN_RECOGNITION');
    expect(result.wasFiltered).toBe(false);
  });
});

describe('filterResponse — return shape', () => {
  it('returns original content untouched when it passes', () => {
    const content = 'Here is a nudge: what if you sort first?';
    const result = filterResponse(content, COACHING);
    expect(result).toEqual({ filteredContent: content, wasFiltered: false });
  });

  it('replaces content with a coaching message when filtered', () => {
    const result = filterResponse("here's the complete solution", COACHING);
    expect(result.filteredContent).toContain('Content filtered');
    expect(result.filteredContent).not.toContain("here's the complete solution");
  });
});
