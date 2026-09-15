import { describe, it, expect } from 'vitest';
import { normalizeProblemUrl } from '../../content/extractor';

/**
 * Unit tests for normalizeProblemUrl — the function that keeps a problem's
 * session/progress identity STABLE across the description/submissions tabs and
 * query params. A regression here silently wipes chat state on submit (the exact
 * bug this function was written to fix — see DEV_JOURNAL).
 */
describe('normalizeProblemUrl', () => {
  it('collapses the description tab to /problems/{slug}/', () => {
    expect(normalizeProblemUrl('https://leetcode.com/problems/two-sum/description/'))
      .toBe('https://leetcode.com/problems/two-sum/');
  });

  it('collapses the submissions tab to the same identity', () => {
    expect(normalizeProblemUrl('https://leetcode.com/problems/two-sum/submissions/'))
      .toBe('https://leetcode.com/problems/two-sum/');
  });

  it('strips query params (e.g. ?envType=...)', () => {
    expect(normalizeProblemUrl('https://leetcode.com/problems/two-sum/?envType=study-plan'))
      .toBe('https://leetcode.com/problems/two-sum/');
  });

  it('strips a hash fragment', () => {
    expect(normalizeProblemUrl('https://leetcode.com/problems/two-sum/#comments'))
      .toBe('https://leetcode.com/problems/two-sum/');
  });

  it('is scheme- and subdomain-tolerant', () => {
    expect(normalizeProblemUrl('http://cn.leetcode.com/problems/add-two-numbers/'))
      .toBe('http://cn.leetcode.com/problems/add-two-numbers/');
  });

  it('all tabs of the same problem map to one identity', () => {
    const base = normalizeProblemUrl('https://leetcode.com/problems/valid-anagram/');
    const desc = normalizeProblemUrl('https://leetcode.com/problems/valid-anagram/description/');
    const subs = normalizeProblemUrl('https://leetcode.com/problems/valid-anagram/submissions/?tab=x');
    expect(desc).toBe(base);
    expect(subs).toBe(base);
  });

  it('returns the raw href unchanged when it is not a problem URL', () => {
    expect(normalizeProblemUrl('https://leetcode.com/problemset/all/'))
      .toBe('https://leetcode.com/problemset/all/');
  });
});
