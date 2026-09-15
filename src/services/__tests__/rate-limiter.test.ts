import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkRateLimit, recordRequest, getUsageToday } from '../rate-limiter';
import { DEFAULT_GUARDRAILS } from '../../types';
import type { GuardrailSettings } from '../../types';

/**
 * Unit tests for the free-tier rate limiter. It persists usage in
 * chrome.storage.local (via storage.ts), so we install a minimal in-memory
 * chrome mock. Time-dependent windows (per-minute, cooldown) are driven with a
 * controlled Date.now.
 */

// ---- minimal in-memory chrome.storage.local mock --------------------------
let store: Record<string, unknown> = {};

function installChromeMock() {
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { lastError: undefined },
    storage: {
      local: {
        get: (key: string, cb: (result: Record<string, unknown>) => void) =>
          cb({ [key]: store[key] }),
        set: (obj: Record<string, unknown>, cb: () => void) => {
          Object.assign(store, obj);
          cb();
        },
        remove: (key: string, cb: () => void) => {
          delete store[key];
          cb();
        },
      },
    },
  };
}

const guardrails = (overrides: Partial<GuardrailSettings> = {}): GuardrailSettings => ({
  ...DEFAULT_GUARDRAILS,
  ...overrides,
});

/**
 * storage.ts derives the daily key from `new Date()` (the real wall clock), not
 * from Date.now(). We only mock Date.now() for the rolling-window math, so the
 * usage key must be computed with the SAME formula storage.ts uses, against the
 * real date. Deriving it here (instead of hardcoding) keeps the two in sync.
 */
function todayKeyLikeStorage(): string {
  const d = new Date();
  return `usage_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const USAGE_KEY = todayKeyLikeStorage();
const TODAY = USAGE_KEY.replace('usage_', '');

// A fixed "now" (matching today) so the rolling-window math is deterministic.
const NOW = Date.parse(`${TODAY}T12:00:00`);

beforeEach(() => {
  store = {};
  installChromeMock();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkRateLimit — kill switch', () => {
  it('blocks everything when the kill switch is on', async () => {
    const result = await checkRateLimit(guardrails({ killSwitch: true }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Kill switch');
  });
});

describe('checkRateLimit — allowed by default', () => {
  it('allows a request against a clean usage state', async () => {
    const result = await checkRateLimit(guardrails());
    expect(result.allowed).toBe(true);
  });
});

describe('checkRateLimit — daily cap', () => {
  it('blocks when the daily count is at the limit', async () => {
    store[USAGE_KEY] = { date: TODAY, count: 5, recentTimestamps: [] };
    const result = await checkRateLimit(guardrails({ maxRequestsPerDay: 5 }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily limit');
  });
});

describe('checkRateLimit — per-minute cap', () => {
  it('blocks when too many requests landed within the last minute', async () => {
    // Two timestamps within the last minute; limit is 2.
    store[USAGE_KEY] = {
      date: TODAY,
      count: 2,
      recentTimestamps: [NOW - 10_000, NOW - 5_000],
    };
    const result = await checkRateLimit(guardrails({ maxRequestsPerMinute: 2, cooldownMs: 0 }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('requests/minute');
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('prunes timestamps older than a minute (they do not count)', async () => {
    store[USAGE_KEY] = {
      date: TODAY,
      count: 2,
      recentTimestamps: [NOW - 120_000, NOW - 90_000], // both > 60s ago
    };
    const result = await checkRateLimit(guardrails({ maxRequestsPerMinute: 2, cooldownMs: 0 }));
    expect(result.allowed).toBe(true);
  });
});

describe('checkRateLimit — cooldown', () => {
  it('blocks when the last request was inside the cooldown window', async () => {
    store[USAGE_KEY] = {
      date: TODAY,
      count: 1,
      recentTimestamps: [NOW - 500], // 0.5s ago
    };
    const result = await checkRateLimit(guardrails({ cooldownMs: 2000, maxRequestsPerMinute: 100 }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('wait a moment');
    expect(result.retryAfterMs).toBeCloseTo(1500, -2);
  });
});

describe('recordRequest', () => {
  it('increments the count and appends a timestamp', async () => {
    const updated = await recordRequest();
    expect(updated.count).toBe(1);
    expect(updated.recentTimestamps).toEqual([NOW]);

    const again = await recordRequest();
    expect(again.count).toBe(2);
    expect(again.recentTimestamps).toEqual([NOW, NOW]);
  });

  it('resets the counters when the stored usage is from a previous day', async () => {
    store[USAGE_KEY] = { date: '2000-01-01', count: 99, recentTimestamps: [1, 2, 3] };
    const updated = await recordRequest();
    expect(updated.date).toBe(TODAY);
    expect(updated.count).toBe(1); // reset, not 100
  });

  it('getUsageToday reflects what recordRequest persisted', async () => {
    await recordRequest();
    const usage = await getUsageToday();
    expect(usage.count).toBe(1);
  });
});
