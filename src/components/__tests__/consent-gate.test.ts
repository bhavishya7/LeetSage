import { describe, it, expect } from 'vitest';
import { isAlreadyConsented, canSaveSettings } from '../consent-gate';
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
  it('disabled when the key is empty, even if consent is checked', () => {
    expect(canSaveSettings('', true, false)).toBe(false);
    expect(canSaveSettings('   ', true, false)).toBe(false); // whitespace-only
  });

  it('disabled when consent is unchecked, even if a key is present', () => {
    expect(canSaveSettings('AQ.key', false, false)).toBe(false);
  });

  it('disabled while a save is already in flight', () => {
    expect(canSaveSettings('AQ.key', true, true)).toBe(false);
  });

  it('enabled only when a key is present AND consent is checked AND not saving', () => {
    expect(canSaveSettings('AQ.key', true, false)).toBe(true);
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
