import { describe, it, expect } from 'vitest';
import { matchingParen, splitComplexity } from '../complexity-parse';

/**
 * B7 — complexity badge splitting on nested parens
 * (see .kiro/specs/leetsage-guardrail-hardening).
 *
 * The old renderComplexity regex /O\(([^)]+)\)/ stopped at the FIRST ")", so a
 * complexity with an inner paren — "O(log(M) + log(N))", "O(N*log(N))" — matched
 * only "O(log(M)" and leaked the rest as prose. These pin the balanced-paren
 * parser that fixes it, DOM-free (the JSX rendering wraps this pure result).
 */

describe('matchingParen', () => {
  it('finds the matching close for a simple group', () => {
    // "O(N)" — the "(" is at index 1, ")" at index 3.
    expect(matchingParen('O(N)', 1)).toBe(3);
  });

  it('skips over a nested group to the true matching close', () => {
    const s = 'O(log(M) + log(N))';
    const open = s.indexOf('(');          // the outer "("
    expect(matchingParen(s, open)).toBe(s.length - 1); // the LAST ")"
  });

  it('returns -1 when parens are unbalanced', () => {
    expect(matchingParen('O(log(M)', 1)).toBe(-1);
  });
});

describe('splitComplexity', () => {
  it('captures a nested-paren complexity as ONE segment', () => {
    const segs = splitComplexity('Current: O(log(M) + log(N)) time');
    const complexities = segs.filter(s => s.kind === 'complexity');
    expect(complexities).toHaveLength(1);
    // The whole inner (incl. nested parens) is captured, not truncated.
    expect(complexities[0]).toMatchObject({ inner: 'log(M) + log(N)' });
    // No text segment should contain a stray leaked ")" fragment.
    const textJoined = segs.filter(s => s.kind === 'text').map(s => (s as { value: string }).value).join('');
    expect(textJoined).toBe('Current:  time');
    expect(textJoined).not.toContain('log(N))');
  });

  it('handles another nested form O(N*log(N))', () => {
    const segs = splitComplexity('It is O(N*log(N)) overall');
    const complexities = segs.filter(s => s.kind === 'complexity');
    expect(complexities).toHaveLength(1);
    expect(complexities[0]).toMatchObject({ inner: 'N*log(N)' });
  });

  it('still handles simple, non-nested complexities', () => {
    const segs = splitComplexity('O(N) time, O(1) space');
    const complexities = segs.filter(s => s.kind === 'complexity') as Array<{ inner: string }>;
    expect(complexities.map(c => c.inner)).toEqual(['N', '1']);
  });

  it('captures two nested complexities on one line', () => {
    const segs = splitComplexity('Current: O(log(M)) Optimal: O(log(M*N))');
    const complexities = segs.filter(s => s.kind === 'complexity') as Array<{ inner: string }>;
    expect(complexities.map(c => c.inner)).toEqual(['log(M)', 'log(M*N)']);
  });

  it('leaves an unbalanced O( as plain text (does not swallow the rest)', () => {
    const segs = splitComplexity('broken O(log(M) trailing');
    expect(segs.every(s => s.kind === 'text')).toBe(true);
    expect((segs[0] as { value: string }).value).toBe('broken O(log(M) trailing');
  });

  it('returns the whole string as text when there is no complexity', () => {
    const segs = splitComplexity('just some prose here');
    expect(segs).toEqual([{ kind: 'text', value: 'just some prose here' }]);
  });
});
