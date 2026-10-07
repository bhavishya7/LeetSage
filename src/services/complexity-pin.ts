import type { ActionType, Complexity } from '../types';
import { slugFromUrl } from './progress-records';

/**
 * B10 — the canonical complexity pin (see .kiro/specs/leetsage-e6-bug-hardening
 * §3b).
 *
 * THE PROBLEM: `optimalComplexity` is re-guessed by the model on every
 * CHECK_APPROACH / UNDERSTAND_SOLUTION / chat / report call. Each is an
 * independent request with no shared ground truth, so the OPTIMAL flip-flops
 * run-to-run for the SAME problem (the O(N) ↔ O(N·M) drift). Batch 1 removed the
 * prompt example-bleed but the model still drifts.
 *
 * THE FIX: pin ONE canonical OPTIMAL per problem — keyed on the normalized
 * `/problems/{slug}/` slug (the same key progress records use) — on the first
 * authoritative emission, then feed it back into every later prompt as a HARD
 * constraint so the model stops re-deriving a different optimal.
 *
 * Scope + honesty (LOCKED decisions):
 *  - Pin the OPTIMAL only. The user's CURRENT complexity legitimately changes as
 *    they edit, so it stays recomputed every call — never pinned.
 *  - Authority rule (b): pin on the first authoritative emission; a later
 *    UNDERSTAND_SOLUTION (the action whose whole job IS the optimal) OVERRIDES
 *    and re-pins. A first CHECK_APPROACH guess must not permanently outrank it.
 *  - The pin comes from a non-deterministic model with NO verifier (there is no
 *    external authoritative complexity source — confirmed, see spec §3b / ADR
 *    -007). So it can be WRONG: it is clearable via "Reset this problem" (the
 *    shipped escape hatch; a dedicated per-badge "looks off?" affordance is
 *    designed but deferred). B10 makes the optimal STABLE and self-consistent
 *    within a problem — NOT provably correct. Correctness is the eval's (E10)
 *    job. Never lock a wrong value with no way out.
 *
 * This is a small, dedicated, schema-versioned store (mirrors progress-records'
 * conventions) so a pin exists even when the user never saved a progress record.
 */

/** Bump when ComplexityPin's shape changes; drives migratePin() on read. */
export const COMPLEXITY_PIN_SCHEMA_VERSION = 1;

export interface ComplexityPin {
  schemaVersion: number;
  slug: string;
  /** The canonical optimal complexity for this problem. */
  optimal: Complexity;
  /** Which action established this pin (for the authority rule). */
  source: ActionType;
  /** epoch ms when pinned (for debugging / future staleness policy). */
  pinnedAt: number;
}

const pinKey = (slug: string) => `complexity_pin_${slug}`;

// Promise-wrapped chrome.storage.local, mirroring progress-records.ts. Kept
// local rather than importing that module's private helpers.
function getKey<T>(key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (result) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve((result[key] as T) ?? null);
    });
  });
}

function setKey(key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

function removeKey(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(key, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

/** Applied on every read; idempotent (no migrations yet — v1 is the first shape). */
function migratePin(pin: ComplexityPin): ComplexityPin {
  if (pin.schemaVersion == null) return { ...pin, schemaVersion: 1 };
  return pin;
}

export async function getComplexityPin(slug: string): Promise<ComplexityPin | null> {
  const raw = await getKey<ComplexityPin>(pinKey(slug));
  return raw ? migratePin(raw) : null;
}

export async function clearComplexityPin(slug: string): Promise<void> {
  await removeKey(pinKey(slug));
}

/**
 * The authority rule (LOCKED decision (b)), kept as a pure function so it's
 * directly testable: given the existing pin (if any) and a new emission, decide
 * whether the new value should (re-)pin.
 *
 *  - No existing pin → always pin (first authoritative emission wins).
 *  - UNDERSTAND_SOLUTION → always re-pins (it is the canonical optimal authority).
 *  - Otherwise (a later CHECK_APPROACH / GENERATE_REPORT) → do NOT overwrite an
 *    existing pin; the first value stays stable (that stability IS the fix).
 */
export function shouldRepin(existing: ComplexityPin | null, source: ActionType): boolean {
  if (!existing) return true;
  if (source === 'UNDERSTAND_SOLUTION') return true;
  return false;
}

/**
 * Records the model's emitted optimal as the pin for this problem, applying the
 * authority rule. Returns the pin now in effect (new or kept). No-ops safely if
 * `optimal` is missing. Best-effort — never let a pin write break the action.
 */
export async function recordOptimalPin(
  url: string,
  optimal: Complexity | undefined | null,
  source: ActionType,
): Promise<ComplexityPin | null> {
  if (!optimal || !optimal.time || !optimal.space) return getComplexityPin(slugFromUrl(url));
  const slug = slugFromUrl(url);
  const existing = await getComplexityPin(slug);
  if (!shouldRepin(existing, source)) return existing;
  const pin: ComplexityPin = {
    schemaVersion: COMPLEXITY_PIN_SCHEMA_VERSION,
    slug,
    optimal: { time: optimal.time, space: optimal.space },
    source,
    pinnedAt: Date.now(),
  };
  await setKey(pinKey(slug), pin);
  return pin;
}
