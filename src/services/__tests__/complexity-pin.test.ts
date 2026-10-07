import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  shouldRepin,
  recordOptimalPin,
  getComplexityPin,
  clearComplexityPin,
  COMPLEXITY_PIN_SCHEMA_VERSION,
  type ComplexityPin,
} from '../complexity-pin';

/**
 * B10 — canonical complexity pin (see .kiro/specs/leetsage-e6-bug-hardening §3b).
 *
 * Pin ONE optimal per problem, keyed on the slug, fed back into prompts so the
 * optimal stops drifting run-to-run. These guard: persistence, the drift
 * regression (two emissions → same pinned optimal), the authority rule (b)
 * (first emission pins; UNDERSTAND_SOLUTION overrides), current-is-NOT-pinned,
 * and the clear (escape hatch) path.
 */

// Minimal in-memory chrome.storage.local mock.
function installStorageMock() {
  const store = new Map<string, unknown>();
  const local = {
    get: (key: string, cb: (r: Record<string, unknown>) => void) =>
      cb({ [key]: store.get(key) }),
    set: (obj: Record<string, unknown>, cb: () => void) => {
      for (const [k, v] of Object.entries(obj)) store.set(k, v);
      cb();
    },
    remove: (key: string, cb: () => void) => { store.delete(key); cb(); },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local }, runtime: {} };
  return store;
}

const URL = 'https://leetcode.com/problems/encode-and-decode-strings/';
const SLUG = 'encode-and-decode-strings';
const NM = { time: 'O(N*M)', space: 'O(N*M)' };
const WRONG = { time: 'O(N)', space: 'O(N)' };

beforeEach(() => { installStorageMock(); vi.restoreAllMocks(); });

describe('shouldRepin — authority rule (b)', () => {
  it('pins when there is no existing pin (first emission wins)', () => {
    expect(shouldRepin(null, 'CHECK_APPROACH')).toBe(true);
  });
  it('UNDERSTAND_SOLUTION overrides an existing pin (canonical authority)', () => {
    const existing = { schemaVersion: 1, slug: SLUG, optimal: NM, source: 'CHECK_APPROACH', pinnedAt: 1 } as ComplexityPin;
    expect(shouldRepin(existing, 'UNDERSTAND_SOLUTION')).toBe(true);
  });
  it('a later CHECK_APPROACH does NOT overwrite an existing pin (stability is the fix)', () => {
    const existing = { schemaVersion: 1, slug: SLUG, optimal: NM, source: 'CHECK_APPROACH', pinnedAt: 1 } as ComplexityPin;
    expect(shouldRepin(existing, 'CHECK_APPROACH')).toBe(false);
    expect(shouldRepin(existing, 'GENERATE_REPORT')).toBe(false);
  });
});

describe('recordOptimalPin + getComplexityPin — persistence & drift regression', () => {
  it('pins the first authoritative optimal and reads it back', async () => {
    await recordOptimalPin(URL, NM, 'CHECK_APPROACH');
    const pin = await getComplexityPin(SLUG);
    expect(pin).not.toBeNull();
    expect(pin!.optimal).toEqual(NM);
    expect(pin!.source).toBe('CHECK_APPROACH');
    expect(pin!.schemaVersion).toBe(COMPLEXITY_PIN_SCHEMA_VERSION);
  });

  it('DRIFT REGRESSION: a second analysis emitting a different optimal does NOT change the pin', async () => {
    // First CHECK_APPROACH computes O(N*M)...
    await recordOptimalPin(URL, NM, 'CHECK_APPROACH');
    // ...a second CHECK_APPROACH drifts to O(N) — the pin must hold the FIRST value.
    const effective = await recordOptimalPin(URL, WRONG, 'CHECK_APPROACH');
    expect(effective!.optimal).toEqual(NM);
    expect((await getComplexityPin(SLUG))!.optimal).toEqual(NM);
  });

  it('UNDERSTAND_SOLUTION re-pins over an existing CHECK_APPROACH pin', async () => {
    await recordOptimalPin(URL, WRONG, 'CHECK_APPROACH');
    await recordOptimalPin(URL, NM, 'UNDERSTAND_SOLUTION');
    const pin = await getComplexityPin(SLUG);
    expect(pin!.optimal).toEqual(NM);
    expect(pin!.source).toBe('UNDERSTAND_SOLUTION');
  });

  it('does not pin when the optimal is missing/empty (no-op, keeps any existing)', async () => {
    expect(await getComplexityPin(SLUG)).toBeNull();
    await recordOptimalPin(URL, undefined, 'CHECK_APPROACH');
    expect(await getComplexityPin(SLUG)).toBeNull();
    await recordOptimalPin(URL, { time: '', space: '' }, 'CHECK_APPROACH');
    expect(await getComplexityPin(SLUG)).toBeNull();
  });

  it('clearComplexityPin removes it (the escape hatch)', async () => {
    await recordOptimalPin(URL, NM, 'CHECK_APPROACH');
    expect(await getComplexityPin(SLUG)).not.toBeNull();
    await clearComplexityPin(SLUG);
    expect(await getComplexityPin(SLUG)).toBeNull();
  });

  it('keys on slug so distinct problems have independent pins', async () => {
    await recordOptimalPin(URL, NM, 'CHECK_APPROACH');
    await recordOptimalPin('https://leetcode.com/problems/two-sum/', WRONG, 'CHECK_APPROACH');
    expect((await getComplexityPin(SLUG))!.optimal).toEqual(NM);
    expect((await getComplexityPin('two-sum'))!.optimal).toEqual(WRONG);
  });
});
