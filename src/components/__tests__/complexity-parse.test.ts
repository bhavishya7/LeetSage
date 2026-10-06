import { describe, it, expect } from 'vitest';
import {
  matchingParen,
  splitComplexity,
  formatComplexityInner,
  maskComplexity,
  COMPLEXITY_SENTINEL_RE,
} from '../complexity-parse';

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

/**
 * R3 / B13 — complexity rendering fixes (see .kiro/specs/leetsage-e6-bug-hardening §2).
 *
 * Three sub-fixes, all exercised DOM-free through the pure helpers:
 *   - formatComplexityInner: uppercase standalone variables WITHOUT corrupting
 *     words (the latent `/n/g → N` bug that turned O(min(a,b)) into O(miN(a,b))).
 *   - maskComplexity + sentinel restore: protect O(...) groups from the markdown
 *     emphasis split so `O(N*M)` keeps its asterisk, and renderInline honors
 *     only `**bold**`/`` `code` `` so bare `*` in prose ("N * M") survives too.
 */
describe('formatComplexityInner — uppercase variables, never corrupt words (R3)', () => {
  it('uppercases a standalone n and m', () => {
    expect(formatComplexityInner('n*m')).toBe('N*M');
    expect(formatComplexityInner('n * m')).toBe('N * M');
  });

  it('uppercases n in "n log n" → "N log N"', () => {
    expect(formatComplexityInner('n log n')).toBe('N log N');
  });

  it('does NOT corrupt "min" into "miN"', () => {
    expect(formatComplexityInner('min(a,b)')).toBe('min(a,b)');
  });

  it('does NOT corrupt "log" / "ln" / "len"', () => {
    expect(formatComplexityInner('log n')).toBe('log N');
    expect(formatComplexityInner('n + len')).toBe('N + len');
  });

  it('leaves an already-uppercase complexity unchanged', () => {
    expect(formatComplexityInner('N*M')).toBe('N*M');
  });
});

describe('maskComplexity — protects O(...) from markdown emphasis (B13)', () => {
  it('replaces O(N*M) with a *-free sentinel and restores it exactly', () => {
    const { masked, tokens } = maskComplexity('cost is O(N*M) overall');
    // The masked text must NOT contain the asterisk that the emphasis split eats.
    expect(masked).not.toContain('*');
    expect(tokens).toEqual(['O(N*M)']);
    // Simulate restoring: split on the sentinel and splice tokens back.
    const restored = masked.replace(COMPLEXITY_SENTINEL_RE, (_m, i) => tokens[Number(i)]);
    expect(restored).toBe('cost is O(N*M) overall');
  });

  it('survives a round-trip through an emphasis-style split', () => {
    const input = 'Both **Current:** O(N * M) and O(min(a,b)) hold';
    const { masked, tokens } = maskComplexity(input);
    // Emphasis split would run here on `masked`; the sentinels carry no * or `.
    for (const seg of masked.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
      // No complexity asterisk leaked into a split boundary.
      expect(seg).not.toContain('N * M');
    }
    const restored = masked.replace(COMPLEXITY_SENTINEL_RE, (_m, i) => tokens[Number(i)]);
    expect(restored).toBe(input);
    expect(tokens).toEqual(['O(N * M)', 'O(min(a,b))']);
  });

  it('masks multiple complexities independently', () => {
    const { tokens } = maskComplexity('O(N) then O(N log N) then O(1)');
    expect(tokens).toEqual(['O(N)', 'O(N log N)', 'O(1)']);
  });

  it('leaves text without complexity untouched (no sentinels)', () => {
    const { masked, tokens } = maskComplexity('just prose, no big-O here');
    expect(masked).toBe('just prose, no big-O here');
    expect(tokens).toEqual([]);
  });
});

describe('splitComplexity + formatComplexityInner — the R3 guard cases', () => {
  const cases = ['O(N*M)', 'O(N * M)', 'O(n*m)', 'O(min(a,b))', 'O(N log N)', 'O(log(M) + log(N))'];
  for (const c of cases) {
    it(`captures ${c} as a single complexity segment`, () => {
      const segs = splitComplexity(`cost is ${c} here`);
      const complexities = segs.filter((s) => s.kind === 'complexity');
      expect(complexities).toHaveLength(1);
    });
  }

  it('O(min(a,b)) renders without the min→miN corruption', () => {
    const seg = splitComplexity('O(min(a,b))').find((s) => s.kind === 'complexity') as { inner: string };
    expect(formatComplexityInner(seg.inner)).toBe('min(a,b)');
  });
});

/**
 * B13 regression guard — bare `*` in PROSE must not be eaten as italic.
 *
 * The real failure (dogfooded on Encode and Decode Strings): the Efficiency
 * explanation contained plain prose like "…the total number of characters, N *
 * M. The subsequent loop … takes O(N * M) time … input of length N * M…". The
 * old renderInline treated a single `*…*` as italic, so the stray `*` in the
 * two `N * M` mentions paired up and italicized a whole sentence (and dropped
 * the asterisks). renderInline now honors ONLY `**bold**` and `` `code` `` —
 * this pins that the emphasis regex it uses leaves bare prose `*` untouched.
 */
describe('renderInline emphasis regex — single `*` is NOT italic (B13 regression)', () => {
  // The exact regex renderInline splits on (kept in sync with ContentDisplay).
  const EMPHASIS_RE = /(\*\*[^*]+\*\*|`[^`]+`)/g;

  it('does not split a prose line with two bare `*` into an italic run', () => {
    const line = 'the total number of characters, N * M. The next loop takes time proportional to N * M overall.';
    const parts = line.split(EMPHASIS_RE);
    // Nothing matched → the whole line survives as a single plain segment.
    expect(parts).toEqual([line]);
  });

  it('still splits genuine **bold** and `code`', () => {
    const parts = 'see **Current:** and `O(N)` here'.split(EMPHASIS_RE).filter(Boolean);
    expect(parts).toContain('**Current:**');
    expect(parts).toContain('`O(N)`');
  });

  it('a bare prose "N * M" round-trips through mask + emphasis split unharmed', () => {
    const input = 'cost is O(N*M); concretely, N * M characters, then N * M again';
    const { masked, tokens } = maskComplexity(input);
    const restored = masked
      .split(EMPHASIS_RE)
      .map((p) => p.replace(COMPLEXITY_SENTINEL_RE, (_m, i) => tokens[Number(i)]))
      .join('');
    expect(restored).toBe(input);
    // Both bare "N * M" prose mentions are intact, asterisks and all.
    expect(restored.match(/N \* M/g)).toHaveLength(2);
  });
});
