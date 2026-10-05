import type { LearningContent } from '../types';

/**
 * Chat Enhancement (E9) — short-term conversation memory.
 * See .kiro/specs/leetsage-chat-enhancement (design §4.3).
 *
 * Chat was STATELESS: each message carried problem + code + an optional digest,
 * but NO prior turns, so follow-ups ("what about the edge case I mentioned?")
 * had no referent. This builds a BOUNDED sliding window of the last few chat
 * turns, verbatim, as the "what was just said" layer of the two-layer memory
 * (the other layer — "what the user has done" — is the zero-cost sessionDigest).
 *
 * Why bounded, not the full transcript (design §4.4 / R4.4, R10.2): a full
 * transcript grows every turn and inflates EVERY request's input tokens, which
 * compounds as the chat lengthens. A fixed window + a flat digest keep
 * per-request token cost predictable. Note: context adds ZERO extra REQUESTS
 * (a chat turn is one request regardless of history) — the cost it adds is
 * input tokens, which is exactly what the window caps.
 *
 * PURE: array in → string out. No React, no chrome.*, no network. The caller
 * passes a snapshot of the history (read from learningContentRef, NOT the
 * stale useCallback closure — the same staleness fix the digest relies on).
 */

/** Last N conversational turns to include (user→assistant pairs). */
export const WINDOW_TURNS = 3;
/** Character budget for the whole window block (caps per-request growth). */
export const WINDOW_CHAR_BUDGET = 2500;

export interface WindowOptions {
  turns: number;
  charBudget: number;
}

const DEFAULTS: WindowOptions = { turns: WINDOW_TURNS, charBudget: WINDOW_CHAR_BUDGET };

/** One rendered Q→A exchange. */
interface Turn {
  question: string;
  answer: string;
}

/**
 * A chat turn is a user bubble (CHAT_MESSAGE + metadata.isUserQuery) followed by
 * the assistant's CHAT_MESSAGE reply. Action cards (hints, analyses, reports) are
 * NOT chat turns — those are summarized by the digest (R4.3), so we exclude them
 * here to keep the window about "what was just said" in conversation.
 */
function extractTurns(history: LearningContent[]): Turn[] {
  const turns: Turn[] = [];
  for (let i = 0; i < history.length; i++) {
    const c = history[i];
    if (c.type !== 'CHAT_MESSAGE' || !c.metadata?.isUserQuery) continue;
    // The user bubble; the next CHAT_MESSAGE (non-user) is its answer, if any.
    const question = c.content.trim();
    let answer = '';
    for (let j = i + 1; j < history.length; j++) {
      const n = history[j];
      if (n.type === 'CHAT_MESSAGE' && !n.metadata?.isUserQuery) { answer = n.content.trim(); break; }
      if (n.type === 'CHAT_MESSAGE' && n.metadata?.isUserQuery) break; // next question, unanswered
    }
    if (question) turns.push({ question, answer });
  }
  return turns;
}

function renderTurn(t: Turn): string {
  return t.answer ? `You: ${t.question}\nLeetSage: ${t.answer}` : `You: ${t.question}`;
}

/**
 * Builds the bounded conversation window string, or '' when there are no prior
 * chat turns (the first question — nothing to recall).
 *
 * Selection: the most recent `turns` exchanges, newest-first, dropping the
 * oldest first when the running block would exceed `charBudget`. The rendered
 * block reads oldest→newest so it flows naturally as a transcript.
 */
export function buildConversationWindow(
  history: LearningContent[],
  opts: WindowOptions = DEFAULTS,
): string {
  const all = extractTurns(history);
  if (all.length === 0) return '';

  // Take the last `turns` exchanges, then trim from the OLDEST end if the block
  // exceeds the char budget (newest turns are the most relevant to a follow-up).
  const recent = all.slice(-Math.max(0, opts.turns));

  const kept: string[] = [];
  let total = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const rendered = renderTurn(recent[i]);
    const addition = rendered.length + 1; // + newline separator
    if (kept.length > 0 && total + addition > opts.charBudget) break;
    kept.unshift(rendered);
    total += addition;
  }
  if (kept.length === 0) return '';

  return `EARLIER IN THIS CONVERSATION (most recent last — use it to resolve follow-up references like "that" or "the edge case I mentioned"):\n${kept.join('\n')}`;
}
