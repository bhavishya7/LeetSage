import { describe, it, expect } from 'vitest';
import {
  parseStructuredResponse,
  isStructuredAction,
  stripDataBlockForDisplay,
  stripDanglingDataFence,
} from '../structured-parser';
import type { ActionType, AnalyzeData, UnderstandData, ReportData, ComplexityHintData } from '../../types';

/**
 * Unit tests for the tolerant structured-output parser.
 *
 * The dev journal flagged that the prose-only fallback was "verified by
 * code-reading only, not observed against a real bad response." These tests
 * close that gap: they feed the parser the ways a real model drifts — valid,
 * malformed, partial, mis-fenced, bare-object, and pure prose — and assert it
 * NEVER throws and always degrades to something usable.
 */

const ANALYZE: ActionType = 'CHECK_APPROACH';
const UNDERSTAND: ActionType = 'UNDERSTAND_SOLUTION';
const REPORT: ActionType = 'GENERATE_REPORT';
const PROSE_ONLY: ActionType = 'GET_HINT';

function fenced(json: string): string {
  return '```leetsage-data\n' + json + '\n```';
}

describe('isStructuredAction', () => {
  it('is true for the structured producers', () => {
    expect(isStructuredAction('CHECK_APPROACH')).toBe(true);
    expect(isStructuredAction('UNDERSTAND_SOLUTION')).toBe(true);
    expect(isStructuredAction('GENERATE_REPORT')).toBe(true);
    // Coaching-logic-overhaul: the complexity hint is now code-aware + structured.
    expect(isStructuredAction('TIME_COMPLEXITY_HINT')).toBe(true);
  });
  it('is false for prose-only actions', () => {
    expect(isStructuredAction('GET_HINT')).toBe(false);
    expect(isStructuredAction('BREAK_DOWN_PROBLEM')).toBe(false);
  });
});

describe('parseStructuredResponse — prose-only actions', () => {
  it('returns the raw text as prose, no data', () => {
    const raw = 'Just a hint, no data block here.';
    const result = parseStructuredResponse(raw, PROSE_ONLY);
    expect(result.prose).toBe(raw);
    expect(result.data).toBeUndefined();
  });
});

describe('parseStructuredResponse — valid data block', () => {
  it('parses a well-formed CHECK_APPROACH block and strips it from prose', () => {
    const prose = 'Your nested loop is O(n^2). A map would help.';
    const json = JSON.stringify({
      approachDetected: 'brute-force nested loop',
      currentComplexity: { time: 'O(n^2)', space: 'O(1)' },
      optimalComplexity: { time: 'O(n)', space: 'O(n)' },
      issues: ['recomputes the complement each pass'],
      onOptimalPath: false,
    });
    const result = parseStructuredResponse(prose + '\n\n' + fenced(json), ANALYZE);
    expect(result.prose).toBe(prose);
    expect(result.prose).not.toContain('leetsage-data');
    const data = result.data as AnalyzeData;
    expect(data.approachDetected).toBe('brute-force nested loop');
    expect(data.currentComplexity).toEqual({ time: 'O(n^2)', space: 'O(1)' });
    expect(data.onOptimalPath).toBe(false);
  });

  it('parses a valid UNDERSTAND_SOLUTION block and canonicalizes patterns', () => {
    const json = JSON.stringify({
      patterns: ['hashmap', 'two-pointer', 'nonsense-pattern'],
      keyInsight: 'complement lookup',
      optimalComplexity: { time: 'O(n)', space: 'O(n)' },
    });
    const result = parseStructuredResponse('Explanation.\n' + fenced(json), UNDERSTAND);
    const data = result.data as UnderstandData;
    // aliases normalize; unknown -> 'Other'.
    expect(data.patterns).toEqual(['Hash Map', 'Two Pointers', 'Other']);
    expect(data.keyInsight).toBe('complement lookup');
  });

  it('parses a valid GENERATE_REPORT block', () => {
    const json = JSON.stringify({
      patterns: ['Hash Map'],
      approachSummary: 'single-pass hash map',
      optimalComplexity: { time: 'O(n)', space: 'O(n)' },
      solvedOptimally: true,
    });
    const result = parseStructuredResponse('Report body.\n' + fenced(json), REPORT);
    const data = result.data as ReportData;
    expect(data.solvedOptimally).toBe(true);
    expect(data.approachSummary).toBe('single-pass hash map');
  });
});

describe('parseStructuredResponse — graceful degradation (never throws)', () => {
  it('malformed JSON -> prose-only, block stripped, no throw', () => {
    const prose = 'Here is my analysis.';
    const broken = '```leetsage-data\n{ "approachDetected": "oops", , }\n```';
    let result!: ReturnType<typeof parseStructuredResponse>;
    expect(() => { result = parseStructuredResponse(prose + '\n' + broken, ANALYZE); }).not.toThrow();
    expect(result.data).toBeUndefined();
    expect(result.prose).toBe(prose);
    expect(result.prose).not.toContain('leetsage-data');
  });

  it('partial / truncated data block (no closing fence) -> dangling block STRIPPED, prose kept', () => {
    // Stream cut off before the closing fence: no complete block to extract. The
    // dangling `leetsage-data` fence + partial JSON must be stripped (not shown
    // as a raw JSON box in the card — the token-cap bug). Prose above it survives.
    const raw = 'Analysis text.\n```leetsage-data\n{ "approachDetected": "brute';
    let result!: ReturnType<typeof parseStructuredResponse>;
    expect(() => { result = parseStructuredResponse(raw, ANALYZE); }).not.toThrow();
    expect(result.data).toBeUndefined();
    expect(result.prose).toBe('Analysis text.');
    expect(result.prose).not.toContain('leetsage-data');
    expect(result.prose).not.toContain('approachDetected');
  });

  it('valid JSON but missing required fields -> data dropped, prose kept', () => {
    // Analyze requires BOTH currentComplexity and optimalComplexity.
    const prose = 'Partial data.';
    const json = JSON.stringify({ approachDetected: 'something', onOptimalPath: true });
    const result = parseStructuredResponse(prose + '\n' + fenced(json), ANALYZE);
    expect(result.data).toBeUndefined();
    expect(result.prose).toBe(prose);
  });

  it('pure prose with no block at all -> prose-only', () => {
    const raw = 'No structured data here, just an explanation of the approach.';
    const result = parseStructuredResponse(raw, ANALYZE);
    expect(result.data).toBeUndefined();
    expect(result.prose).toBe(raw.trim());
  });

  it('non-object JSON (array / number) -> data dropped', () => {
    const result = parseStructuredResponse('Prose.\n' + fenced('[1,2,3]'), ANALYZE);
    expect(result.data).toBeUndefined();
  });
});

describe('parseStructuredResponse — looser fallbacks for model drift', () => {
  it('accepts a ```json fence containing our keys when the tagged fence is absent', () => {
    const json = JSON.stringify({
      approachDetected: 'hash map',
      currentComplexity: { time: 'O(n)', space: 'O(n)' },
      optimalComplexity: { time: 'O(n)', space: 'O(n)' },
      issues: [],
      onOptimalPath: true,
    });
    const raw = 'Prose.\n```json\n' + json + '\n```';
    const result = parseStructuredResponse(raw, ANALYZE);
    const data = result.data as AnalyzeData;
    expect(data?.approachDetected).toBe('hash map');
  });

  it('ignores a ```json fence that is NOT our data (no known keys)', () => {
    const raw = 'Here is an example input:\n```json\n{ "foo": 1 }\n```';
    const result = parseStructuredResponse(raw, ANALYZE);
    expect(result.data).toBeUndefined();
    // The unrelated json block stays in prose (it's real content).
    expect(result.prose).toContain('foo');
  });

  it('takes the LAST tagged block when several are present', () => {
    const first = fenced(JSON.stringify({
      approachDetected: 'first',
      currentComplexity: { time: 'O(n^2)', space: 'O(1)' },
      optimalComplexity: { time: 'O(n)', space: 'O(n)' },
      issues: [],
      onOptimalPath: false,
    }));
    const second = fenced(JSON.stringify({
      approachDetected: 'second',
      currentComplexity: { time: 'O(n)', space: 'O(n)' },
      optimalComplexity: { time: 'O(n)', space: 'O(n)' },
      issues: [],
      onOptimalPath: true,
    }));
    const result = parseStructuredResponse('P.\n' + first + '\nmore\n' + second, ANALYZE);
    const data = result.data as AnalyzeData;
    expect(data.approachDetected).toBe('second');
  });
});

describe('parseStructuredResponse — TIME_COMPLEXITY_HINT (code-aware hint)', () => {
  const HINT: ActionType = 'TIME_COMPLEXITY_HINT';

  it('parses a code-present hint block (current + optimal + onOptimalPath)', () => {
    const prose = '## ⚡ Efficiency\n**Current:** O(N^2) time, O(1) space';
    const json = JSON.stringify({
      currentComplexity: { time: 'O(N^2)', space: 'O(1)' },
      optimalComplexity: { time: 'O(N)', space: 'O(N)' },
      onOptimalPath: false,
    });
    const result = parseStructuredResponse(prose + '\n\n' + fenced(json), HINT);
    const data = result.data as ComplexityHintData;
    expect(data.currentComplexity).toEqual({ time: 'O(N^2)', space: 'O(1)' });
    expect(data.optimalComplexity).toEqual({ time: 'O(N)', space: 'O(N)' });
    expect(data.onOptimalPath).toBe(false);
    expect(result.prose).not.toContain('leetsage-data');
  });

  it('keeps currentComplexity NULL when no code was read (never fabricates one)', () => {
    // R2.2: the no-code fallback emits a null current; the parser must preserve
    // null rather than coercing it into a bogus O(?) Current line.
    const json = JSON.stringify({
      currentComplexity: null,
      optimalComplexity: { time: 'O(N)', space: 'O(1)' },
      onOptimalPath: false,
    });
    const result = parseStructuredResponse('## Complexity Hint\n' + fenced(json), HINT);
    const data = result.data as ComplexityHintData;
    expect(data.currentComplexity).toBeNull();
    expect(data.optimalComplexity).toEqual({ time: 'O(N)', space: 'O(1)' });
  });

  it('treats a missing currentComplexity key as null (not O(?))', () => {
    const json = JSON.stringify({
      optimalComplexity: { time: 'O(N log N)', space: 'O(1)' },
      onOptimalPath: true,
    });
    const result = parseStructuredResponse('Prose.\n' + fenced(json), HINT);
    const data = result.data as ComplexityHintData;
    expect(data.currentComplexity).toBeNull();
    expect(data.onOptimalPath).toBe(true);
  });

  it('drops the data when optimalComplexity is missing (optimal is required)', () => {
    const json = JSON.stringify({ currentComplexity: { time: 'O(N)', space: 'O(1)' }, onOptimalPath: false });
    const result = parseStructuredResponse('Prose.\n' + fenced(json), HINT);
    expect(result.data).toBeUndefined();
  });
});

describe('parseStructuredResponse — truncated/unclosed data block (token-cap bug)', () => {
  it('strips a DANGLING leetsage-data fence (no closing ```) so raw JSON never shows', () => {
    // A response that hit max_tokens mid-JSON: opening fence + partial object,
    // no closing fence. extractDataBlock can't match it; without the dangling
    // strip the raw JSON would render in the card (the observed scrollable box).
    const prose = 'Here is the explanation of the optimal approach.';
    const truncated =
      prose +
      '\n\n```leetsage-data\n{\n  "patterns": ["Two Pointers"],\n  "keyInsight": "Because the array is sorted",\n  "optimalComplexity": { "time';
    const result = parseStructuredResponse(truncated, UNDERSTAND);
    expect(result.data).toBeUndefined();           // no complete block to parse
    expect(result.prose).toBe(prose);              // the dangling JSON is gone
    expect(result.prose).not.toContain('leetsage-data');
    expect(result.prose).not.toContain('"patterns"');
    expect(result.prose).not.toContain('optimalComplexity');
  });

  it('a COMPLETE block is still parsed normally (dangling strip does not interfere)', () => {
    const json = JSON.stringify({
      patterns: ['Two Pointers'],
      keyInsight: 'sorted array lets two pointers converge',
      optimalComplexity: { time: 'O(N)', space: 'O(1)' },
    });
    const result = parseStructuredResponse('Explanation.\n' + fenced(json), UNDERSTAND);
    expect(result.data).toBeDefined();
    expect(result.prose).toBe('Explanation.');
  });
});

describe('stripDanglingDataFence (pure helper)', () => {
  it('cuts from a dangling opening fence to end-of-string', () => {
    const raw = 'Real prose here.\n\n```leetsage-data\n{ "patterns": ["X"], "optimalComplexity": { "time';
    expect(stripDanglingDataFence(raw)).toBe('Real prose here.');
  });

  it('leaves text with a COMPLETE fence unchanged (the extractor handles it)', () => {
    const raw = 'Prose.\n```leetsage-data\n{ "a": 1 }\n```';
    expect(stripDanglingDataFence(raw)).toBe(raw);
  });

  it('leaves text with NO data fence unchanged', () => {
    const raw = 'Just prose, no data block at all.';
    expect(stripDanglingDataFence(raw)).toBe(raw);
  });
});

describe('stripDataBlockForDisplay — mid-stream hiding', () => {
  it('hides a fully-present opening fence and everything after', () => {
    const raw = 'Visible prose.\n```leetsage-data\n{ "a": 1 }';
    expect(stripDataBlockForDisplay(raw, ANALYZE)).toBe('Visible prose.');
  });

  it('leaves prose-only actions untouched', () => {
    const raw = 'A hint with a ```leetsage-data``` mention.';
    expect(stripDataBlockForDisplay(raw, PROSE_ONLY)).toBe(raw);
  });

  it('does not clobber a real closed code block', () => {
    const raw = 'Example:\n```python\nx = 1\n```\nmore prose';
    // The trailing ``` here closes a real block, so nothing should be stripped.
    expect(stripDataBlockForDisplay(raw, ANALYZE)).toBe(raw);
  });
});
