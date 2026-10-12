import type { UserSettings } from '../types';
import { CONSENT_VERSION } from '../types';

/**
 * Data-use consent gate logic (E8 / R7), extracted as PURE functions so the
 * rule can be unit-tested without a React testing harness (this project has
 * none — same pattern as discovery-prompts.ts's resolveSubmitText).
 *
 * The gate's whole job: a user may not SAVE an API key — the single chokepoint
 * that enables every coaching action — without acknowledging, in-UI, that
 * LeetSmith transmits the problem + their code to Google's Gemini API. Because
 * all coaching early-returns without a stored key, gating Save on consent makes
 * consent a hard precondition of every data-sending action, with no workaround.
 */

/**
 * Should the consent checkbox START checked when the modal opens?
 *
 * TRUE only for a RETURNING user who has already saved a key AND consented
 * under the CURRENT disclosure version — so they aren't forced to re-consent
 * just to tweak a model/guardrail. Otherwise FALSE (first run, or the disclosed
 * practices changed → consentVersion is now stale → re-prompt).
 *
 * Pre-existing settings that predate the consent fields read as not-consented
 * (undefined → false), which correctly shows the gate once.
 */
export function isAlreadyConsented(settings: UserSettings | null): boolean {
  if (!settings) return false;
  return (
    Boolean(settings.apiConfig?.apiKey) &&
    settings.consentAcknowledged === true &&
    (settings.consentVersion ?? 0) >= CONSENT_VERSION
  );
}

/**
 * Is the Save button enabled? Requires BOTH a non-empty key AND an acknowledged
 * consent box, and not mid-save. Either missing → Save stays disabled.
 */
export function canSaveSettings(apiKey: string, consentChecked: boolean, saving: boolean): boolean {
  return apiKey.trim().length > 0 && consentChecked && !saving;
}
