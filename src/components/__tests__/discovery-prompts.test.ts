import { describe, it, expect } from 'vitest';
import { PLACEHOLDER_EXAMPLES, TRY_ASKING_CHIPS, resolveSubmitText } from '../discovery-prompts';

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
