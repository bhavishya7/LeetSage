import { describe, it, expect } from 'vitest';
import { PLACEHOLDER_EXAMPLES, TRY_ASKING_CHIPS, resolveSubmitText, chatPlaceholder } from '../discovery-prompts';
import type { PlaceholderState } from '../discovery-prompts';

/**
 * B11 — duplicate "Try" (see .kiro/specs/leetsage-chat-polish, E3 §4.1).
 *
 * Two discovery surfaces both said "Try" on an empty chat: the chip row's
 * "Try asking:" label AND the rotating placeholder's "Try: …" prefix. The fix
 * keeps the single "Try" on the chip row and strips the prefix from the
 * placeholder examples. These pin that single-source-of-truth so a future edit
 * can't silently reintroduce the double "Try".
 */
describe('discovery placeholder examples (B11)', () => {
  it('carry no "Try:" / "Try " prefix (the chip row owns the "Try" framing)', () => {
    for (const example of PLACEHOLDER_EXAMPLES) {
      expect(example.toLowerCase().startsWith('try:')).toBe(false);
      expect(example.toLowerCase().startsWith('try ')).toBe(false);
    }
  });

  it('still leads with the resting "Ask a question…" state', () => {
    expect(PLACEHOLDER_EXAMPLES[0]).toBe('Ask a question…');
  });

  it('still offers the suggestion examples beyond the resting state', () => {
    // The discovery value depends on there being examples to cycle through.
    expect(PLACEHOLDER_EXAMPLES.length).toBeGreaterThan(1);
  });
});

describe('try-asking chips', () => {
  it('are full example questions (so B12 can submit them on tap)', () => {
    // Each chip is a complete question, not a template needing user input —
    // which is why tapping one submits immediately (B12). Guard: none ends in a
    // dangling placeholder-style separator that would imply "fill me in".
    for (const chip of TRY_ASKING_CHIPS) {
      expect(chip.trim().length).toBeGreaterThan(0);
      expect(chip.trimEnd().endsWith(':')).toBe(false);
    }
  });
});

/**
 * B12 — Try chips populated but didn't submit (see design §4.2). The fix threads
 * an explicit chip text through the submit path so a tap FIRES the message,
 * rather than only filling the box. The race-free core is `resolveSubmitText`:
 * an explicit argument must win over the input-box state (because
 * setChatInput(chip) + reading chatInput in the same tick sees the stale value).
 */
describe('resolveSubmitText (B12)', () => {
  it('prefers the explicit chip text over the current input value', () => {
    // The race: input still holds the old value when the chip tap resolves.
    expect(resolveSubmitText('What pattern is this?', 'stale half-typed')).toBe('What pattern is this?');
  });

  it('falls back to the input value when no explicit text is given (Send/Enter)', () => {
    expect(resolveSubmitText(undefined, 'my own question')).toBe('my own question');
  });

  it('trims whitespace on both paths', () => {
    expect(resolveSubmitText('  spaced chip  ', '')).toBe('spaced chip');
    expect(resolveSubmitText(undefined, '  spaced input  ')).toBe('spaced input');
  });

  it('resolves empty (a no-op submit) when both are blank', () => {
    expect(resolveSubmitText(undefined, '   ')).toBe('');
    expect(resolveSubmitText('', '')).toBe('');
  });

  it('every Try chip resolves to a non-empty submit when tapped', () => {
    // A chip tap passes the chip as explicit text; it must always produce a
    // real message to send (never a silent no-op).
    for (const chip of TRY_ASKING_CHIPS) {
      expect(resolveSubmitText(chip, '').length).toBeGreaterThan(0);
    }
  });
});

/**
 * B24 — reason-aware chat placeholder
 * (see .kiro/specs/leetsage-post-launch-ui-fixes R3).
 *
 * The bug: App derived the placeholder from the overloaded `canInteract`
 * (apiKeyConfigured && hasProblem && !isLoading), so the instant a request
 * started (isLoading→true) a key-configured user was wrongly told to "Configure
 * your API key first". `chatPlaceholder` separates the copy decision from the
 * enable/disable gate and branches on the SPECIFIC disabled reason in priority
 * order. These guards pin that busy-with-key never shows the no-key copy.
 */
describe('chatPlaceholder (B24)', () => {
  const base: PlaceholderState = {
    apiKeyConfigured: true,
    hasProblem: true,
    isLoading: false,
    rotatingExample: 'what pattern is this?',
  };

  it('shows the no-key copy ONLY when no key is configured', () => {
    expect(chatPlaceholder({ ...base, apiKeyConfigured: false })).toBe('Configure your API key first');
  });

  it('no-key has top priority (even if also off-page and busy)', () => {
    // R3.3: no-key wins over every other disabled reason.
    const out = chatPlaceholder({
      apiKeyConfigured: false,
      hasProblem: false,
      isLoading: true,
      rotatingExample: 'x',
    });
    expect(out).toBe('Configure your API key first');
  });

  it('busy WITH a key never shows the no-key copy — the exact regression (R3.1/R3.2)', () => {
    const out = chatPlaceholder({ ...base, isLoading: true });
    expect(out).not.toBe('Configure your API key first');
    expect(out).toBe('Thinking…');
  });

  it('off a problem page (key configured, not busy) shows the off-page copy', () => {
    // Backward-compat: when onProblemPage is omitted it defaults to hasProblem,
    // so hasProblem:false still reads as off-page.
    expect(chatPlaceholder({ ...base, hasProblem: false })).toBe('Open a LeetCode problem to use the coaching tools');
  });

  it('off-page beats busy (both key-configured) — specific reason, not generic', () => {
    const out = chatPlaceholder({ ...base, hasProblem: false, isLoading: true });
    expect(out).toBe('Open a LeetCode problem to use the coaching tools');
  });

  it('healthy state (key + problem + idle) shows the rotating example', () => {
    expect(chatPlaceholder(base)).toBe('what pattern is this?');
  });
});

/**
 * Coaching-logic-overhaul R4 — URL-based off-page gating adds a THIRD disabled
 * reason distinct from "no context loaded". `onProblemPage` is the load-
 * independent URL signal; `hasProblem` is "context finished loading". The
 * placeholder must tell them apart so a REAL problem page mid-load never reads
 * as "off-page" (R4.4). Priority: no-key → off-page → loading → busy → healthy.
 */
describe('chatPlaceholder — URL-based off-page vs. still-loading (R4)', () => {
  const base: PlaceholderState = {
    apiKeyConfigured: true,
    onProblemPage: true,
    hasProblem: true,
    isLoading: false,
    rotatingExample: 'what pattern is this?',
  };

  it('NOT on a problem URL → off-page copy (inputs hard-disabled)', () => {
    expect(chatPlaceholder({ ...base, onProblemPage: false, hasProblem: false }))
      .toBe('Open a LeetCode problem to use the coaching tools');
  });

  it('on a problem URL but context still loading → "Reading this problem…", NOT off-page (R4.4)', () => {
    // The crux: a real page whose context is still being pulled must never be
    // mislabeled "off-page". onProblemPage:true + hasProblem:false → loading copy.
    expect(chatPlaceholder({ ...base, onProblemPage: true, hasProblem: false }))
      .toBe('Reading this problem…');
  });

  it('off-page beats the loading copy (URL signal wins)', () => {
    expect(chatPlaceholder({ ...base, onProblemPage: false, hasProblem: false, isLoading: true }))
      .toBe('Open a LeetCode problem to use the coaching tools');
  });

  it('on-page + loaded + busy → Thinking…', () => {
    expect(chatPlaceholder({ ...base, isLoading: true })).toBe('Thinking…');
  });

  it('fully healthy → rotating example', () => {
    expect(chatPlaceholder(base)).toBe('what pattern is this?');
  });
});
