import type { GuardrailSettings, GuardrailCheck, UsageState } from '../types';
import { getUsage, saveUsage, todayKey } from './storage';

const ONE_MINUTE_MS = 60_000;

/**
 * Rate limiter / usage tracker for the free tier.
 *
 * All state is persisted in Chrome storage (per-day key) so it survives the
 * MV3 service worker sleeping and the side panel closing/reopening. Limits are
 * read from the user's GuardrailSettings, so everything is adjustable.
 */

/** Prunes timestamps older than one minute from the rolling window. */
function pruneOld(timestamps: number[], now: number): number[] {
  return timestamps.filter((t) => now - t < ONE_MINUTE_MS);
}

/**
 * Checks whether a request is allowed right now, WITHOUT recording it.
 * Order of checks: kill switch -> daily cap -> per-minute cap -> cooldown.
 */
export async function checkRateLimit(guardrails: GuardrailSettings): Promise<GuardrailCheck> {
  if (guardrails.killSwitch) {
    return { allowed: false, reason: 'Kill switch is on — all AI requests are paused. Turn it off in Settings.' };
  }

  const now = Date.now();
  const usage = await getUsage();
  const recent = pruneOld(usage.recentTimestamps, now);

  if (usage.count >= guardrails.maxRequestsPerDay) {
    return { allowed: false, reason: `Daily limit reached (${guardrails.maxRequestsPerDay}/day). Resets at midnight.` };
  }

  if (recent.length >= guardrails.maxRequestsPerMinute) {
    const oldest = Math.min(...recent);
    const retryAfterMs = ONE_MINUTE_MS - (now - oldest);
    return {
      allowed: false,
      reason: `Slow down — ${guardrails.maxRequestsPerMinute} requests/minute limit reached.`,
      retryAfterMs: Math.max(0, retryAfterMs),
    };
  }

  const lastTs = recent.length ? Math.max(...recent) : 0;
  const sinceLast = now - lastTs;
  if (lastTs && sinceLast < guardrails.cooldownMs) {
    return {
      allowed: false,
      reason: 'Please wait a moment between requests.',
      retryAfterMs: guardrails.cooldownMs - sinceLast,
    };
  }

  return { allowed: true };
}

/**
 * HARD-limit-only budget check for a CONTINUATION of an in-flight request (the
 * R6b bounded regenerate — see .kiro/specs/leetsage-coaching-logic-overhaul §4.5).
 *
 * The regenerate is not a NEW user action; it's a second attempt to produce a
 * useful answer for a request the user already triggered (and already paid one
 * credit for). So the SOFT pacing limits — per-minute rate and the inter-request
 * cooldown — should NOT block it (those exist to pace fresh user actions, and a
 * rapid-fire tester would otherwise never see the regenerate fire). The HARD
 * limits still apply: the kill switch (user paused everything) and the daily cap
 * (the real quota guard) both block it. This keeps the "always try to produce a
 * useful response for the credit spent" intent without letting the regenerate
 * run away past the daily budget.
 */
export async function checkHardBudget(guardrails: GuardrailSettings): Promise<GuardrailCheck> {
  if (guardrails.killSwitch) {
    return { allowed: false, reason: 'Kill switch is on — all AI requests are paused. Turn it off in Settings.' };
  }
  const usage = await getUsage();
  if (usage.count >= guardrails.maxRequestsPerDay) {
    return { allowed: false, reason: `Daily limit reached (${guardrails.maxRequestsPerDay}/day). Resets at midnight.` };
  }
  return { allowed: true };
}

/**
 * Records a request against today's usage. Call this right before/after a
 * successful request is initiated so the counters stay accurate.
 */
export async function recordRequest(): Promise<UsageState> {
  const now = Date.now();
  const usage = await getUsage();

  // Handle date rollover (a stale usage object from a previous day).
  const today = todayKey();
  const base: UsageState = usage.date === today
    ? usage
    : { date: today, count: 0, recentTimestamps: [] };

  const updated: UsageState = {
    date: today,
    count: base.count + 1,
    recentTimestamps: [...pruneOld(base.recentTimestamps, now), now],
  };
  await saveUsage(updated);
  return updated;
}

/** Returns today's usage count (for the UI counter). */
export async function getUsageToday(): Promise<UsageState> {
  return getUsage();
}
