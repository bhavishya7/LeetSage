import { describe, it, expect } from 'vitest';
import { routeMessage, classify, resolveOverlap } from '../index';
import type { RouterContext, RouterEffect } from '../index';
import { isSolutionExemptAction } from '../../solution-filter';
import type { ActionType } from '../../../types';

/**
 * GOLDEN SET — the router's accuracy metric (R10, design §3).
 *
 * The router is a classifier, so we treat it like one: a labeled dataset of
 * `message → expected outcome`, scored as an accuracy check. A change that
 * regresses routing fails this test. Seeded with the three REAL observed
 * examples (design §8 / tasks §8) and expanded to cover every band:
 * confident match, overlap, borderline `ask`, multi-intent, and no-match.
 *
 * Expected-outcome grammar (what the pure pipeline decides, per requirements):
 *   route:<ACTION>  — resolveOverlap returned route(<ACTION>)
 *   ask             — resolveOverlap returned ask(...) (the abstain band)
 *   chat            — resolveOverlap returned chat (fall through)
 *
 * NOTE the layering (design §6): the DECISION is route/ask/chat; the router
 * then turns an EXEMPT route (or any ask) into a confirm EFFECT so nothing
 * solution-bearing fires silently. Both are asserted below.
 */

type Expected = `route:${ActionType}` | 'ask' | 'chat';

interface GoldenCase {
  message: string;
  context: RouterContext;
  expected: Expected;
  note?: string;
}

const CODE: RouterContext = { hasCode: true };
const NO_CODE: RouterContext = { hasCode: false };

/** Reduce a message to the decision label the resolver produced. */
function decisionLabel(message: string, ctx: RouterContext): Expected {
  const d = resolveOverlap(classify(message, ctx), ctx);
  if (d.kind === 'chat') return 'chat';
  if (d.kind === 'ask') return 'ask';
  return `route:${d.action}`;
}

// ---------------------------------------------------------------------------
// The labeled dataset.
// ---------------------------------------------------------------------------
const GOLDEN_SET: GoldenCase[] = [
  // --- The three REAL observed examples (seeds) ----------------------------
  {
    message: 'what is the current time complexity',
    context: CODE,
    // With code present, "complexity of my code" sharpens toward Analyze;
    // without a decisive single winner it may land on ask. Either is acceptable
    // per the spec seed ("route:Analyze (or ask, if borderline)"). Asserted
    // specially below — here we just require it is NOT a silent chat/no-op.
    expected: 'ask',
    note: 'seed #1 — complexity + code context (route:Analyze or ask)',
  },
  {
    message: 'difference between a set and a dict in Python?',
    context: NO_CODE,
    expected: 'chat',
    note: 'seed #2 — general knowledge question → chat',
  },
  {
    message: 'explain the optimal solution',
    context: NO_CODE,
    expected: 'route:UNDERSTAND_SOLUTION',
    note: 'seed #3 — exempt match → decision is route, EFFECT is confirm',
  },

  // --- Confident, unambiguous matches --------------------------------------
  { message: 'can you give me a hint?', context: NO_CODE, expected: 'route:GET_HINT' },
  { message: "i'm stuck, help me get started", context: NO_CODE, expected: 'route:GET_HINT' },
  { message: 'generate a study note for this problem', context: NO_CODE, expected: 'route:GENERATE_REPORT' },
  { message: 'break this down into steps', context: NO_CODE, expected: 'route:BREAK_DOWN_PROBLEM' },
  { message: 'what pattern is this problem?', context: NO_CODE, expected: 'route:PATTERN_RECOGNITION' },
  { message: 'give me another example', context: NO_CODE, expected: 'route:GENERATE_EXAMPLES' },

  // --- Exempt matches → decision route, effect confirm (never silent) ------
  { message: 'just give me the full solution', context: CODE, expected: 'route:UNDERSTAND_SOLUTION', note: 'guardrail: exempt' },
  { message: 'show me the complete answer', context: NO_CODE, expected: 'route:UNDERSTAND_SOLUTION', note: 'guardrail: exempt' },
  { message: 'analyze my code please', context: CODE, expected: 'route:CHECK_APPROACH', note: 'guardrail: exempt (analyze)' },
  { message: "what's wrong with my code", context: CODE, expected: 'route:CHECK_APPROACH', note: 'guardrail: exempt (analyze)' },

  // --- No-match / general knowledge → chat ---------------------------------
  { message: 'why is the sky blue', context: NO_CODE, expected: 'chat' },
  { message: 'thanks, that was helpful', context: NO_CODE, expected: 'chat' },
  { message: 'what should i eat for lunch', context: NO_CODE, expected: 'chat' },
];

describe('golden set — routing accuracy metric (R10)', () => {
  let correct = 0;
  for (const c of GOLDEN_SET) {
    it(`${c.message} → ${c.expected}${c.note ? ` (${c.note})` : ''}`, () => {
      const actual = decisionLabel(c.message, c.context);
      // Seed #1 is explicitly allowed to be route:CHECK_APPROACH OR ask.
      if (c.message.startsWith('what is the current time complexity')) {
        expect(['route:CHECK_APPROACH', 'ask']).toContain(actual);
      } else {
        expect(actual).toBe(c.expected);
      }
      correct++;
    });
  }

  it('accuracy over the golden set is 100% (all labeled cases pass)', () => {
    // Each case above increments `correct` when it passes; if any failed, the
    // suite would already be red. This documents the metric explicitly.
    expect(correct).toBe(GOLDEN_SET.length);
  });
});

// ---------------------------------------------------------------------------
// R10.3 — THE hard guardrail test. A solution-seeking message must NEVER
// SILENTLY reach a filter-exempt action. It may DECIDE to route to one, but the
// router's EFFECT must be a confirm (deliberate act), never a silent dispatch.
// ---------------------------------------------------------------------------
describe('R10.3 — solution-seeking messages never silently reach an exempt action', () => {
  const solutionSeeking = [
    'just give me the full solution',
    'show me the complete answer',
    'explain the optimal solution',
    'solve it for me',
    "what's the solution",
    'give me the whole code',
  ];

  for (const message of solutionSeeking) {
    it(`"${message}" → confirm effect, not a silent dispatch`, () => {
      const effect: RouterEffect = routeMessage(message, { hasCode: true });
      // The forbidden outcome is a silent dispatch of an EXEMPT action.
      if (effect.kind === 'dispatch') {
        expect(isSolutionExemptAction(effect.action)).toBe(false);
      }
      // A solution-seeking phrase that matched should surface a confirm (exempt
      // guardrail) — the user's "Yes" is the deliberate act. If it matched
      // nothing it falls to chat, which is also non-silent-exempt (safe).
      expect(['confirm', 'chat']).toContain(effect.kind);
    });
  }

  it('an EXEMPT route is always turned into a confirm effect (structural, via isSolutionExemptAction)', () => {
    const effect = routeMessage('explain the optimal solution', { hasCode: false });
    expect(effect.kind).toBe('confirm');
    if (effect.kind === 'confirm') {
      expect(isSolutionExemptAction(effect.action)).toBe(true);
      expect(effect.reason).toBe('exempt');
    }
  });

  it('a NON-exempt confident match dispatches directly (still filtered downstream)', () => {
    const effect = routeMessage('can you give me a hint?', { hasCode: false });
    expect(effect.kind).toBe('dispatch');
    if (effect.kind === 'dispatch') {
      expect(isSolutionExemptAction(effect.action)).toBe(false);
      expect(effect.action).toBe('GET_HINT');
    }
  });
});

// ---------------------------------------------------------------------------
// Overlap / multi-intent behavior (R4, R5).
// ---------------------------------------------------------------------------
describe('overlap resolution (R4)', () => {
  it('context sharpens complexity+code toward Analyze (route or ask, never chat)', () => {
    const label = decisionLabel('what is the complexity of my code', CODE);
    expect(label).not.toBe('chat');
  });

  it('the same complexity question WITHOUT code does not sharpen to Analyze', () => {
    const effect = routeMessage('what is the time complexity', NO_CODE);
    // No code → analyze-code cannot win on context; it routes to the generic
    // complexity intent or asks, but never silently dispatches Analyze (exempt).
    if (effect.kind === 'dispatch') {
      expect(effect.action).not.toBe('CHECK_APPROACH');
    }
  });
});

describe('multi-intent (R5) — genuinely multiple asks fall through to chat', () => {
  it('"explain the concept and give me another example" → chat (one call, not two)', () => {
    // Two different same-tier (weight 10) generic intents, near-tied, no context
    // tiebreak → genuine multi-intent → chat (never two API calls).
    const label = decisionLabel('explain the concept and give me another example', NO_CODE);
    expect(label).toBe('chat');
  });
});

// ---------------------------------------------------------------------------
// Pipeline purity / seam sanity (R2, R6.2).
// ---------------------------------------------------------------------------
describe('pipeline is pure and local (R2.1)', () => {
  it('classify returns [] for an empty message', () => {
    expect(classify('', NO_CODE)).toEqual([]);
    expect(classify('   ', NO_CODE)).toEqual([]);
  });

  it('classify is deterministic — same input, same output', () => {
    const a = classify('give me a hint', NO_CODE);
    const b = classify('give me a hint', NO_CODE);
    expect(a).toEqual(b);
  });

  it('an empty message routes to chat (no guess)', () => {
    expect(routeMessage('', NO_CODE).kind).toBe('chat');
  });
});
