import { describe, it, expect } from 'vitest';
import { isSolutionExemptAction, filterResponse } from '../../services/solution-filter';
import { thinkingLabel } from '../../components/thinking-labels';
import type { ActionType } from '../../types';

/**
 * B1 — PRE-DISPLAY GATE guard (see .kiro/specs/leetsage-guardrail-hardening).
 *
 * The product promise is "never reveal the solution". The bug: App streamed
 * model tokens straight into the visible card, and `filterResponse` only ran
 * AFTER the stream — so a leak was briefly readable before it was replaced.
 *
 * The DOM render lives in App.tsx / ContentDisplay.tsx, but the tests here stay
 * DOM-free (this project's vitest env is `node` on purpose). Instead we pin the
 * GATE CONTRACT that the render depends on:
 *
 *   1. Non-exempt actions withhold tokens mid-stream (streamLive === false);
 *      exempt actions stream live.
 *   2. Because tokens are withheld, the ONLY content ever committed for a
 *      non-exempt action is the post-filter result — so a would-be leak is
 *      never in a committed/rendered state before the filter runs.
 *   3. The placeholder shows an action-aware "thinking" label, never model text.
 *
 * `streamLive` mirrors App.tsx exactly: `isSolutionExemptAction(actionType)`.
 */

// The exact predicate App uses to decide whether to paint tokens as they arrive.
const streamLive = (actionType: ActionType) => isSolutionExemptAction(actionType);

/**
 * Faithfully replays App's streaming commit sequence for one action, recording
 * every value that would be COMMITTED to the visible card. This is the sequence
 * a user could read. For non-exempt actions the loop commits nothing until the
 * final filtered reveal; for exempt actions it commits each cumulative chunk.
 */
function committedContents(actionType: ActionType, chunks: string[]): string[] {
  const committed: string[] = [];
  const live = streamLive(actionType);
  let full = '';
  for (const chunk of chunks) {
    full += chunk;
    if (live) committed.push(full); // exempt: paints tokens as they arrive
    // non-exempt: withholds — nothing committed mid-stream (placeholder shows)
  }
  // Post-stream: parse is a no-op for these plain cases; filter then commit.
  const { filteredContent } = filterResponse(full, actionType);
  committed.push(filteredContent);
  return committed;
}

// A response that leaks (full folded binary search) — must be filtered.
const LEAK_CHUNKS = [
  'Here is the idea:\n```\n',
  'left = 0, right = n - 1\n',
  'while left <= right:\n',
  '    mid = (left + right) / 2\n',
  '    left = mid + 1 if arr[mid] < target else left\n',
  '    right = mid - 1 if arr[mid] > target else right\n',
  'return mid if arr[mid] == target else -1\n',
  '```',
];
const LEAK_FULL = LEAK_CHUNKS.join('');

describe('B1 — streamLive predicate matches the exempt set', () => {
  const nonExempt: ActionType[] = ['GET_HINT', 'GENERATE_EXAMPLES', 'BREAK_DOWN_PROBLEM', 'EXPLAIN_CONCEPT', 'TIME_COMPLEXITY_HINT', 'PATTERN_RECOGNITION'];
  const exempt: ActionType[] = ['CHECK_APPROACH', 'UNDERSTAND_SOLUTION', 'GENERATE_REPORT'];

  for (const a of nonExempt) {
    it(`${a} does NOT stream live (tokens withheld until filtered)`, () => {
      expect(streamLive(a)).toBe(false);
    });
  }
  for (const a of exempt) {
    it(`${a} streams live (solutions allowed, filter bypassed)`, () => {
      expect(streamLive(a)).toBe(true);
    });
  }
});

describe('B1 — a leaking non-exempt response is never committed before the filter', () => {
  it('commits ONLY the filtered message — the raw leak is never in a committed state', () => {
    const committed = committedContents('PATTERN_RECOGNITION', LEAK_CHUNKS);
    // Exactly one commit (the final filtered reveal): nothing mid-stream.
    expect(committed).toHaveLength(1);
    // That single commit is the "Content filtered" coaching message…
    expect(committed[0]).toContain('Content filtered');
    // …and NONE of the committed values ever contained the leaked algorithm.
    for (const c of committed) {
      expect(c).not.toContain('while left <= right');
      expect(c).not.toContain('mid = (left + right)');
    }
  });

  it('sanity: the same response WOULD be readable if streamed live (proves the gate matters)', () => {
    // Model an exempt-style live stream over the SAME leaking text: the raw
    // algorithm shows up in committed values. This is exactly what the gate
    // prevents for non-exempt actions. (CHECK_APPROACH is exempt, so the filter
    // is a no-op here — the point is that live streaming exposes the text.)
    const committed = committedContents('CHECK_APPROACH', LEAK_CHUNKS);
    const everShowedRawAlgorithm = committed.some(c => c.includes('while left <= right'));
    expect(everShowedRawAlgorithm).toBe(true);
  });
});

describe('B1 — a clean non-exempt response reveals its content once, after the filter', () => {
  it('commits the (unfiltered) content exactly once at the end', () => {
    const cleanChunks = ['What data structure ', 'gives O(1) lookups as ', 'you scan?'];
    const committed = committedContents('GET_HINT', cleanChunks);
    expect(committed).toHaveLength(1);
    expect(committed[0]).toBe(cleanChunks.join(''));
  });
});

describe('B1 — action-aware thinking labels', () => {
  it('maps each non-exempt action to a specific working label', () => {
    expect(thinkingLabel('GET_HINT')).toBe('Thinking of a hint…');
    expect(thinkingLabel('BREAK_DOWN_PROBLEM')).toBe('Breaking it down…');
    expect(thinkingLabel('EXPLAIN_CONCEPT')).toBe('Explaining…');
    expect(thinkingLabel('TIME_COMPLEXITY_HINT')).toBe('Estimating complexity…');
    expect(thinkingLabel('GENERATE_EXAMPLES')).toBe('Coming up with examples…');
    expect(thinkingLabel('PATTERN_RECOGNITION')).toBe('Spotting the pattern…');
  });

  it('uses "Answering…" for the free-form chat card', () => {
    expect(thinkingLabel('EXPLAIN_CONCEPT', true)).toBe('Answering…');
  });

  it('never returns raw model content (always a fixed working label)', () => {
    // Whatever the action, the label is one of our fixed strings, so the
    // placeholder can never leak model text.
    const label = thinkingLabel('GET_HINT');
    expect(label.endsWith('…')).toBe(true);
    expect(LEAK_FULL).not.toContain(label);
  });
});
