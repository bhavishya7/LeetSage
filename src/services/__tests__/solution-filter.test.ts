import { describe, it, expect } from 'vitest';
import { filterResponse } from '../solution-filter';
import { GUARDRAIL_CASES } from '../../evals/fixtures/guardrail-cases';
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
  it('returns original content untouched when it passes (redactionMode none)', () => {
    const content = 'Here is a nudge: what if you sort first?';
    const result = filterResponse(content, COACHING);
    expect(result).toEqual({ filteredContent: content, wasFiltered: false, redactionMode: 'none' });
  });

  it('replaces an all-solution response with the reworded (non-scolding) message', () => {
    const result = filterResponse("here's the complete solution", COACHING);
    expect(result.wasFiltered).toBe(true);
    expect(result.redactionMode).toBe('full');
    expect(result.filteredContent).not.toContain("here's the complete solution");
    // R6.6: no scolding, and it names the real affordances.
    expect(result.filteredContent).not.toContain('not to solve problems for you');
    expect(result.filteredContent.toLowerCase()).toContain('coaching level');
    expect(result.filteredContent).toContain('💡 Hint');
    expect(result.filteredContent).toContain('🧠 Understand solution');
  });
});

/**
 * Coaching-logic-overhaul R6 — graceful REDACTION instead of total blanking.
 * The detection logic is UNCHANGED (see the gate-invariance test below); what
 * changes is that a leak with teaching around it is redacted-partial, not
 * blanked.
 */
describe('filterResponse — graceful redaction (R6)', () => {
  const TEACHING_PARA =
    'Great question. The idea is to remember each value you have already seen so a ' +
    'later value can find its partner instantly — that is what turns the double scan ' +
    'into a single pass, trading a little memory for a lot of time.';

  it('(a) teaching survives: redacts a fenced full function but keeps the prose', () => {
    const fn = [
      '```python',
      'def two_sum(nums, target):',
      '    seen = {}',
      '    for i in range(len(nums)):',
      '        c = target - nums[i]',
      '        if c in seen:',
      '            return [seen[c], i]',
      '        seen[nums[i]] = i',
      '    return []',
      '```',
    ].join('\n');
    const content = `${TEACHING_PARA}\n\n${fn}\n\nSo the map is the key trick.`;
    const result = filterResponse(content, COACHING);
    expect(result.wasFiltered).toBe(true);
    expect(result.redactionMode).toBe('partial');
    // Teaching prose survives…
    expect(result.filteredContent).toContain('remember each value you have already seen');
    expect(result.filteredContent).toContain('So the map is the key trick.');
    // …but the function body is gone.
    expect(result.filteredContent).not.toContain('def two_sum');
    expect(result.filteredContent).not.toContain('seen[nums[i]] = i');
  });

  it('(b) a prose-only full algorithm does NOT survive redaction', () => {
    const proseAlgo = [
      'initialize an empty hash map',
      'for each number in the array',
      'if target minus number is in the map',
      'return the two indices',
      'else set map at number to index',
      'return an empty result',
    ].join('\n');
    const content = `${TEACHING_PARA}\n\n${proseAlgo}`;
    const result = filterResponse(content, COACHING);
    expect(result.wasFiltered).toBe(true);
    // The algorithm run is gone; whatever we return must be clean on a re-filter.
    expect(result.filteredContent).not.toContain('initialize an empty hash map');
    expect(filterResponse(result.filteredContent, COACHING).wasFiltered).toBe(false);
    // Teaching may survive as a partial, or (if too little) fall to full — either
    // way the surviving/returned content never leaks.
    if (result.redactionMode === 'partial') {
      expect(result.filteredContent).toContain('remember each value you have already seen');
    }
  });

  it('(c2) framing-only around a removed block → full (triggers regenerate, not a hollow partial)', () => {
    // The real "give me pseudocode" bug: the model wrote a thin lead-in + sign-off
    // bracketing the full pseudocode. Redaction removes the algorithm; the leftover
    // framing is NOT real teaching, so it must classify `full` (→ the App helper
    // regenerates a genuine conceptual answer) rather than show a hollow shell.
    const framingAroundAlgo = [
      'Here is the pseudocode for the Two Pointers approach to help you translate the concept into code:',
      '',
      'initialize left at the start and right at the end',
      'while left is less than right',
      'if the sum is too small move left rightward',
      'else if the sum is too big move right leftward',
      'else return the two indices',
      '',
      "As you write this, keep in mind that the problem requires 1-indexed results, so don't forget to add 1 to your final indices.",
    ].join('\n');
    const result = filterResponse(framingAroundAlgo, COACHING);
    expect(result.wasFiltered).toBe(true);
    expect(result.redactionMode).toBe('full');
  });

  it('(c3) a SUBSTANTIVE conceptual explanation beside a removed block survives as partial', () => {
    // The flip side of c2: when real teaching (a full sentence+ of concept) sits
    // beside the removed block, it should survive as `partial` — we don't want to
    // over-trigger the regenerate and discard genuine explanation.
    const realTeaching = [
      'The core idea is that because the array is sorted, the sum of the two outermost ' +
        'elements tells you which direction to move: too large means the right value is ' +
        'too big, too small means the left value is too small. That monotonic behavior is ' +
        'what lets you converge without checking every pair.',
      '',
      'initialize left at the start and right at the end',
      'while left is less than right',
      'if the sum is too small move left rightward',
      'else if the sum is too big move right leftward',
      'else return the two indices',
    ].join('\n');
    const result = filterResponse(realTeaching, COACHING);
    expect(result.wasFiltered).toBe(true);
    expect(result.redactionMode).toBe('partial');
    expect(result.filteredContent).toContain('monotonic behavior');
    expect(result.filteredContent).not.toContain('while left is less than right');
  });

  it('(c) an all-solution response (no teaching) → full reworded message', () => {
    const onlyAlgo = [
      'initialize an empty hash map',
      'for each number in the array',
      'if target minus number is in the map',
      'return the two indices',
      'else set map at number to index',
      'return an empty result',
    ].join('\n');
    const result = filterResponse(onlyAlgo, COACHING);
    expect(result.wasFiltered).toBe(true);
    expect(result.redactionMode).toBe('full');
    expect(result.filteredContent.toLowerCase()).toContain('coaching level');
  });

  it('(d) exempt action with a full function is untouched (never redacted)', () => {
    const fn = "Here's the complete solution:\n" + codeBlock(30);
    const result = filterResponse(fn, 'CHECK_APPROACH');
    expect(result.wasFiltered).toBe(false);
    expect(result.redactionMode).toBe('none');
    expect(result.filteredContent).toBe(fn);
  });

  it('(h) own-code discussion (few quoted lines + a tweak) is NOT over-gated', () => {
    // §4.6a lock 2: a chat answer that quotes a couple of the user's own lines
    // and suggests an improvement must pass clean — not a full solution.
    const ownCode = [
      'Your loop looks right, but line 3 recomputes the length each pass:',
      '```python',
      'for i in range(len(nums)):',
      '    total += nums[i]',
      '```',
      'Hoist `len(nums)` into a variable before the loop and you save that repeated call.',
    ].join('\n');
    const result = filterResponse(ownCode, COACHING);
    expect(result.wasFiltered).toBe(false);
  });
});

/**
 * (e) GATE INVARIANCE — the critical regression proof (R6, §4.6a enforcement).
 *
 * The redaction rewrite changes WHAT we show on a leak, never WHETHER we detect
 * one. This test runs every labeled guardrail case through the new
 * `filterResponse` and asserts `wasFiltered` equals the ground-truth label — the
 * exact decision the Vitest gate (guardrail-eval.test.ts) and the Promptfoo
 * bridge rely on. If this spec over-gated (new false positive) or under-gated
 * (missed leak), this fails. Catch rate / FP are unchanged by construction.
 */
describe('filterResponse — gate invariance over the labeled dataset (R6)', () => {
  for (const c of GUARDRAIL_CASES) {
    it(`${c.id}: wasFiltered === leaksSolution (${c.leaksSolution})`, () => {
      expect(filterResponse(c.response, c.actionType).wasFiltered).toBe(c.leaksSolution);
    });
  }
});
