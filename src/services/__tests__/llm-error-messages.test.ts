import { describe, it, expect } from 'vitest';
import { humanizeTransportError, APIError } from '../llm-service';

/**
 * Friendly error messaging (chat-polish error-copy fix).
 *
 * The chat UI shows `error.message` verbatim, so low-level transport failures
 * must be mapped to apologetic, non-technical copy — never a raw code or a
 * cryptic DOMException. These pin that mapping.
 *
 * The headline case: an aborted request (our timeout firing) throws a
 * DOMException whose message is the infamous "signal is aborted without
 * reason". That leaked straight to the user; it must become a plain timeout
 * message instead.
 */
describe('humanizeTransportError', () => {
  it('maps an AbortError (timeout) to a friendly timeout message, not the raw DOMException', () => {
    const abort = new Error('signal is aborted without reason');
    abort.name = 'AbortError';
    const friendly = humanizeTransportError(abort, 20000);
    expect(friendly.message).not.toMatch(/signal is aborted/i);
    expect(friendly.message).toMatch(/timed out|try again/i);
    // Surfaces the timeout duration in whole seconds (20000ms -> 20s).
    expect(friendly.message).toMatch(/20s/);
  });

  it('maps a network TypeError to a connectivity message', () => {
    const netErr = new TypeError('Failed to fetch');
    const friendly = humanizeTransportError(netErr, 20000);
    expect(friendly.message).toMatch(/connection|reach/i);
    expect(friendly.message).not.toMatch(/Failed to fetch/);
  });

  it('passes an already-friendly APIError through unchanged', () => {
    const apiErr = new APIError("Google's Gemini service is busy right now.", 503, true);
    const result = humanizeTransportError(apiErr, 20000);
    expect(result).toBe(apiErr); // same instance — not re-wrapped
  });

  it('falls back to a generic friendly message for an unknown throwable', () => {
    const friendly = humanizeTransportError('a bare string', 20000);
    expect(friendly).toBeInstanceOf(Error);
    expect(friendly.message).toMatch(/something went wrong|try again/i);
  });
});
