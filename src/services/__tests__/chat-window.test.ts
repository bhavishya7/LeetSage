import { describe, it, expect } from 'vitest';
import { buildConversationWindow } from '../chat-window';
import type { LearningContent, ActionType } from '../../types';

/**
 * Unit tests for the bounded conversation window (E9, design §4.3).
 *
 * Pure function: array in → string out. Pins the behaviors that keep the window
 * cheap and correct — only chat turns (not action cards), the last-N limit, the
 * char-budget trim (newest wins), and the empty-history fallback.
 */

let idSeq = 0;
function userMsg(text: string): LearningContent {
  return {
    id: `u${idSeq++}`, type: 'CHAT_MESSAGE', actionType: 'CHECK_APPROACH',
    content: text, timestamp: Date.now(), expanded: true, metadata: { isUserQuery: true },
  };
}
function assistantMsg(text: string): LearningContent {
  return {
    id: `a${idSeq++}`, type: 'CHAT_MESSAGE', actionType: 'EXPLAIN_CONCEPT',
    content: text, timestamp: Date.now(), expanded: true,
  };
}
function actionCard(actionType: ActionType, text: string): LearningContent {
  return {
    id: `k${idSeq++}`, type: 'FEEDBACK', actionType,
    content: text, timestamp: Date.now(), expanded: true,
  };
}

describe('buildConversationWindow', () => {
  it('returns empty string when there are no chat turns', () => {
    expect(buildConversationWindow([])).toBe('');
    expect(buildConversationWindow([actionCard('GET_HINT', 'a hint')])).toBe('');
  });

  it('renders a single answered turn as You / LeetSage', () => {
    const out = buildConversationWindow([userMsg('what is a hash map?'), assistantMsg('a key-value store')]);
    expect(out).toContain('You: what is a hash map?');
    expect(out).toContain('LeetSage: a key-value store');
  });

  it('excludes action-card bodies — only chat turns appear', () => {
    const history = [
      userMsg('q1'), assistantMsg('a1'),
      actionCard('CHECK_APPROACH', 'ANALYSIS CARD BODY THAT MUST NOT APPEAR'),
      actionCard('GET_HINT', 'HINT CARD BODY THAT MUST NOT APPEAR'),
    ];
    const out = buildConversationWindow(history);
    expect(out).toContain('You: q1');
    expect(out).not.toContain('MUST NOT APPEAR');
  });

  it('keeps only the last N turns (default 3)', () => {
    const history: LearningContent[] = [];
    for (let i = 1; i <= 5; i++) { history.push(userMsg(`q${i}`), assistantMsg(`a${i}`)); }
    const out = buildConversationWindow(history);
    // Oldest two dropped; most recent three kept.
    expect(out).not.toContain('You: q1');
    expect(out).not.toContain('You: q2');
    expect(out).toContain('You: q3');
    expect(out).toContain('You: q5');
  });

  it('trims from the oldest end when the char budget is exceeded (newest wins)', () => {
    const big = 'x'.repeat(2000);
    const history = [
      userMsg('oldest question'), assistantMsg(big),
      userMsg('newest question'), assistantMsg('short answer'),
    ];
    const out = buildConversationWindow(history, { turns: 3, charBudget: 1500 });
    // The newest turn always survives; the oversized older turn is dropped.
    expect(out).toContain('You: newest question');
    expect(out).not.toContain('You: oldest question');
  });

  it('handles an unanswered trailing question (no assistant reply yet)', () => {
    const out = buildConversationWindow([userMsg('pending question')]);
    expect(out).toContain('You: pending question');
    expect(out).not.toContain('LeetSage:');
  });

  it('renders turns oldest→newest within the block', () => {
    const history = [userMsg('first'), assistantMsg('a1'), userMsg('second'), assistantMsg('a2')];
    const out = buildConversationWindow(history);
    expect(out.indexOf('You: first')).toBeLessThan(out.indexOf('You: second'));
  });
});
