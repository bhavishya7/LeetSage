import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StuckTimer } from '../stuck-timer';
import type { StuckSuggestion } from '../../types';

/**
 * Unit tests for the StuckTimer. Uses fake timers to drive the 8-minute
 * inactivity delay and the 20-minute cooldown deterministically.
 */

const STUCK_DELAY_MS = 8 * 60 * 1000;
const COOLDOWN_MS = 20 * 60 * 1000;

describe('StuckTimer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('fires a suggestion after the inactivity delay', () => {
    const cb = vi.fn();
    const timer = new StuckTimer(cb);
    timer.start({ difficulty: 'Medium' });
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(STUCK_DELAY_MS);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not fire before the delay elapses', () => {
    const cb = vi.fn();
    new StuckTimer(cb).start();
    vi.advanceTimersByTime(STUCK_DELAY_MS - 1000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('suggests a hint for a non-hard problem with hints available', () => {
    const cb = vi.fn<(s: StuckSuggestion) => void>();
    new StuckTimer(cb).start({ difficulty: 'Medium' });
    vi.advanceTimersByTime(STUCK_DELAY_MS);
    expect(cb.mock.calls[0][0].suggestedAction).toBe('GET_HINT');
  });

  it('suggests breaking down a HARD problem', () => {
    const cb = vi.fn<(s: StuckSuggestion) => void>();
    new StuckTimer(cb).start({ difficulty: 'Hard' });
    vi.advanceTimersByTime(STUCK_DELAY_MS);
    expect(cb.mock.calls[0][0].suggestedAction).toBe('BREAK_DOWN_PROBLEM');
  });

  it('never suggests a hint once hints are exhausted', () => {
    const cb = vi.fn<(s: StuckSuggestion) => void>();
    new StuckTimer(cb).start({ difficulty: 'Medium', hintsExhausted: true });
    vi.advanceTimersByTime(STUCK_DELAY_MS);
    expect(cb.mock.calls[0][0].suggestedAction).toBe('CHECK_APPROACH');
  });

  it('respects the cooldown — a second cycle within 20 min stays silent', () => {
    const cb = vi.fn();
    const timer = new StuckTimer(cb);
    timer.start();
    vi.advanceTimersByTime(STUCK_DELAY_MS);
    expect(cb).toHaveBeenCalledTimes(1);

    // Restart immediately; the next fire is within the cooldown window.
    timer.start();
    vi.advanceTimersByTime(STUCK_DELAY_MS);
    expect(cb).toHaveBeenCalledTimes(1); // still 1 — cooldown suppressed it
  });

  it('fires again after the cooldown has passed', () => {
    const cb = vi.fn();
    const timer = new StuckTimer(cb);
    timer.start();
    vi.advanceTimersByTime(STUCK_DELAY_MS); // first fire at t=8min
    // Advance well past the cooldown, then run another cycle.
    vi.advanceTimersByTime(COOLDOWN_MS);
    timer.start();
    vi.advanceTimersByTime(STUCK_DELAY_MS);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('start() cancels any pending timer (no double fire)', () => {
    const cb = vi.fn();
    const timer = new StuckTimer(cb);
    timer.start();
    vi.advanceTimersByTime(STUCK_DELAY_MS / 2);
    timer.start(); // resets the countdown
    vi.advanceTimersByTime(STUCK_DELAY_MS / 2);
    expect(cb).not.toHaveBeenCalled(); // only half the new delay elapsed
    vi.advanceTimersByTime(STUCK_DELAY_MS / 2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', () => {
    const cb = vi.fn();
    const timer = new StuckTimer(cb, false);
    timer.start();
    vi.advanceTimersByTime(STUCK_DELAY_MS * 2);
    expect(cb).not.toHaveBeenCalled();
  });

  it('stop() cancels a pending suggestion', () => {
    const cb = vi.fn();
    const timer = new StuckTimer(cb);
    timer.start();
    vi.advanceTimersByTime(STUCK_DELAY_MS / 2);
    timer.stop();
    vi.advanceTimersByTime(STUCK_DELAY_MS);
    expect(cb).not.toHaveBeenCalled();
  });

  it('setEnabled(false) stops a pending timer', () => {
    const cb = vi.fn();
    const timer = new StuckTimer(cb);
    timer.start();
    timer.setEnabled(false);
    vi.advanceTimersByTime(STUCK_DELAY_MS);
    expect(cb).not.toHaveBeenCalled();
  });
});
