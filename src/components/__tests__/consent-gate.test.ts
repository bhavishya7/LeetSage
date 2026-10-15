import { describe, it, expect } from 'vitest';
import { isAlreadyConsented, canSaveSettings, buildSettingsOnSave } from '../consent-gate';
import { CONSENT_VERSION, DEFAULT_GUARDRAILS } from '../../types';
import type { UserSettings } from '../../types';

// Build a UserSettings with sensible defaults + overrides for the fields under test.
function settings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    apiConfig: { provider: 'gemini', apiKey: 'AQ.test-key', model: 'gemini-3.5-flash-lite' },
    guardrails: DEFAULT_GUARDRAILS,
    enableStuckTimer: true,
    stuckTimerDelay: 300000,
    enableChatMode: false,
    theme: 'dark',
    consentAcknowledged: true,
    consentVersion: CONSENT_VERSION,
    ...overrides,
  };
}

describe('consent gate — canSaveSettings (Save enabled condition)', () => {
  // B27: an EMPTY (trimmed) key is now the REMOVAL path — saveable with no
  // consent requirement, so a user can clear their key and Save (previously
  // impossible: the old gate hard-required a non-empty key). These two cases
  // used to assert empty ⇒ false; they now assert empty ⇒ saveable.
  it('ENABLED when the key is empty (removal path), regardless of consent', () => {
    expect(canSaveSettings('', false, false)).toBe(true);
    expect(canSaveSettings('', true, false)).toBe(true);
    expect(canSaveSettings('   ', false, false)).toBe(true); // whitespace-only = empty
  });

  it('removal path is still blocked while a save is in flight', () => {
    expect(canSaveSettings('', true, true)).toBe(false);
  });

  it('disabled when a key IS present but consent is unchecked (gate unchanged)', () => {
    expect(canSaveSettings('AQ.key', false, false)).toBe(false);
  });

  it('disabled while a save is already in flight', () => {
    expect(canSaveSettings('AQ.key', true, true)).toBe(false);
  });

  it('enabled when a key is present AND consent is checked AND not saving', () => {
    expect(canSaveSettings('AQ.key', true, false)).toBe(true);
  });
});

/**
 * B27 — buildSettingsOnSave: the consent-reset-on-remove rule, as a pure
 * transform so it's unit-testable (the modal itself is DOM-free-untestable here).
 */
describe('consent gate — buildSettingsOnSave (B27 key removal)', () => {
  const base = {
    model: 'gemini-3.5-flash-lite' as const,
    guardrails: DEFAULT_GUARDRAILS,
    enableStuckTimer: true,
    current: settings(),
  };

  it('persists a present key WITH consent acknowledged at the current version', () => {
    const out = buildSettingsOnSave({ ...base, apiKey: 'AQ.new-key' });
    expect(out.apiConfig.apiKey).toBe('AQ.new-key');
    expect(out.consentAcknowledged).toBe(true);
    expect(out.consentVersion).toBe(CONSENT_VERSION);
  });

  it('trims the key before persisting', () => {
    expect(buildSettingsOnSave({ ...base, apiKey: '  AQ.spaced  ' }).apiConfig.apiKey).toBe('AQ.spaced');
  });

  it('removal (empty key) persists an empty key AND resets consent', () => {
    const out = buildSettingsOnSave({ ...base, apiKey: '' });
    expect(out.apiConfig.apiKey).toBe('');
    expect(out.consentAcknowledged).toBe(false);
    expect(out.consentVersion).toBe(0);
  });

  it('whitespace-only key is treated as removal (consent reset)', () => {
    const out = buildSettingsOnSave({ ...base, apiKey: '   ' });
    expect(out.apiConfig.apiKey).toBe('');
    expect(out.consentAcknowledged).toBe(false);
    expect(out.consentVersion).toBe(0);
  });

  it('after removal, isAlreadyConsented is false (re-key = re-consent)', () => {
    const removed = buildSettingsOnSave({ ...base, apiKey: '' });
    expect(isAlreadyConsented(removed)).toBe(false);
  });

  it('preserves non-consent fields from current settings', () => {
    const out = buildSettingsOnSave({ ...base, apiKey: 'AQ.key', enableStuckTimer: false });
    expect(out.enableStuckTimer).toBe(false);
    expect(out.theme).toBe(base.current.theme);
    expect(out.stuckTimerDelay).toBe(base.current.stuckTimerDelay);
  });
});

describe('consent gate — isAlreadyConsented (checkbox starts checked?)', () => {
  it('false for a null/first-run settings object', () => {
    expect(isAlreadyConsented(null)).toBe(false);
  });

  it('false when a key exists but consent was never acknowledged (pre-existing data)', () => {
    expect(isAlreadyConsented(settings({ consentAcknowledged: undefined, consentVersion: undefined }))).toBe(false);
  });

  it('false when consent is acknowledged but there is no key yet', () => {
    expect(isAlreadyConsented(settings({ apiConfig: { provider: 'gemini', apiKey: '', model: 'gemini-3.5-flash-lite' } }))).toBe(false);
  });

  it('false when the stored consent version is older than the current one (re-prompt)', () => {
    expect(isAlreadyConsented(settings({ consentVersion: CONSENT_VERSION - 1 }))).toBe(false);
  });

  it('true for a returning user with a key + current-version consent (no forced re-consent)', () => {
    expect(isAlreadyConsented(settings())).toBe(true);
  });
});
