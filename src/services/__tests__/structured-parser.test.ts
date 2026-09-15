import { describe, it, expect } from 'vitest';
import {
  parseStructuredResponse,
  isStructuredAction,
  stripDataBlockForDisplay,
} from '../structured-parser';
import type { ActionType, AnalyzeData, UnderstandData, ReportData } from '../../types';

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
  it('is true for the three structured producers', () => {
    expect(isStructuredAction('CHECK_APPROACH')).toBe(true);
    expect(isStructuredAction('UNDERSTAND_SOLUTION')).toBe(true);
    expect(isStructuredAction('GENERATE_REPORT')).toBe(true);
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

  it('partial / truncated data block (no closing fence) -> prose-only', () => {
    // Stream cut off before the closing fence: no complete block to extract.
    const raw = 'Analysis text.\n```leetsage-data\n{ "approachDetected": "brute';
    let result!: ReturnType<typeof parseStructuredResponse>;
    expect(() => { result = parseStructuredResponse(raw, ANALYZE); }).not.toThrow();
    expect(result.data).toBeUndefined();
    // No complete fence found -> whole raw returned as prose (trimmed).
    expect(result.prose).toBe(raw.trim());
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
