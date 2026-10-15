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
 * Is the Save button enabled?
 *
 * Two distinct cases (B27 — the key-removal path):
 *  - SAVING A KEY (non-empty): still requires the consent box AND not mid-save.
 *    The consent gate is unchanged for the case that actually sends data.
 *  - REMOVING THE KEY (empty, trimmed): always allowed (when not mid-save), with
 *    NO consent requirement — you can't gate "stop sending my data" behind a
 *    data-use acknowledgement. This is what lets a user clear their key and Save,
 *    which the original one-way form made impossible.
 */
export function canSaveSettings(apiKey: string, consentChecked: boolean, saving: boolean): boolean {
  if (saving) return false;
  if (apiKey.trim().length === 0) return true; // removal path — no consent needed
  return consentChecked;                        // saving a key still requires consent
}

/**
 * Build the UserSettings to PERSIST on Save, applying the B27 key-removal rule as
 * a pure, unit-testable transform (the modal is DOM-free-untestable in this repo,
 * so the consent-reset-on-remove rule lives here where a Vitest can assert it).
 *
 *  - KEY PRESENT: persist the key with consent ACKNOWLEDGED under the current
 *    disclosure version (the user ticked the box to enable Save).
 *  - KEY EMPTY (removal): persist the first-run shape — empty key AND consent
 *    RESET (consentAcknowledged:false, consentVersion:0). With no key nothing is
 *    ever sent to Google, so a persisted "consented" would record consent for an
 *    activity that cannot happen; and isAlreadyConsented() is already
 *    key-conditional, so resetting keeps the stored flag self-consistent.
 *    Re-entering a key then re-shows the consent gate (re-key = re-consent).
 */
export function buildSettingsOnSave(args: {
  apiKey: string;
  model: UserSettings['apiConfig']['model'];
  guardrails: UserSettings['guardrails'];
  enableStuckTimer: boolean;
  current: UserSettings | null;
}): UserSettings {
  const key = args.apiKey.trim();
  const hasKey = key.length > 0;
  return {
    apiConfig: { provider: 'gemini', apiKey: key, model: args.model },
    guardrails: args.guardrails,
    enableStuckTimer: args.enableStuckTimer,
    stuckTimerDelay: args.current?.stuckTimerDelay ?? 300000,
    enableChatMode: args.current?.enableChatMode ?? false,
    theme: args.current?.theme ?? 'dark',
    consentAcknowledged: hasKey,
    consentVersion: hasKey ? CONSENT_VERSION : 0,
  };
}
