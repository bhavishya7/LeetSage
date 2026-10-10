import { describe, it, expect } from 'vitest';
import {
  classifyPullResult,
  decidePullAction,
  MAX_ATTEMPTS,
  type PullAction,
  type PullOutcome,
  type PullState,
} from '../active-tab-pull';

/**
 * B21 — stale-tab injection. These tests pin the pure decision brain behind
 * App.tsx's `pullFromActiveTab`: arriving at a pre-existing LeetCode tab (no
 * content script receiver) must auto-INJECT and then keep retrying until the
 * already-rendered page is scraped, WITHOUT a manual reload — and must never
 * inject-loop.
 */

describe('classifyPullResult', () => {
  it('classifies a successful response with data as ok', () => {
    expect(classifyPullResult({ success: true, data: { title: 'Two Sum' } }, undefined)).toBe('ok');
  });

  it('classifies the "Receiving end does not exist" error as no-receiver (stale tab)', () => {
    expect(
      classifyPullResult(undefined, 'Could not establish connection. Receiving end does not exist.'),
    ).toBe('no-receiver');
  });

  it('classifies a present receiver with no data yet as not-ready', () => {
    expect(classifyPullResult({ success: true, data: undefined }, undefined)).toBe('not-ready');
    expect(classifyPullResult({ success: false }, undefined)).toBe('not-ready');
    expect(classifyPullResult(undefined, undefined)).toBe('not-ready');
  });

  it('classifies any non-receiver error as not-ready (so we retry, not inject)', () => {
    expect(classifyPullResult(undefined, 'The message port closed before a response was received.')).toBe('not-ready');
  });
});

describe('decidePullAction', () => {
  it('applies the moment we get data', () => {
    expect(decidePullAction('ok', { attempt: 0, hasInjected: false })).toBe('apply');
    expect(decidePullAction('ok', { attempt: 3, hasInjected: true })).toBe('apply');
  });

  it('INJECTS on a no-receiver when nothing has been injected yet (the B21 fix)', () => {
    expect(decidePullAction('no-receiver', { attempt: 0, hasInjected: false })).toBe('inject');
  });

  it('injects on a LATER no-receiver too, as long as we have not injected yet', () => {
    // Original bug: inject was gated to attempt===0. A no-receiver on attempt 2
    // (e.g. the first message arrived while classified not-ready) must still inject.
    expect(decidePullAction('no-receiver', { attempt: 2, hasInjected: false })).toBe('inject');
  });

  it('does NOT inject twice — a repeat no-receiver after injecting falls back to retry', () => {
    expect(decidePullAction('no-receiver', { attempt: 1, hasInjected: true })).toBe('retry');
  });

  it('retries while the receiver exists but has no data yet (post-inject scrape race)', () => {
    expect(decidePullAction('not-ready', { attempt: 1, hasInjected: true })).toBe('retry');
    expect(decidePullAction('not-ready', { attempt: 0, hasInjected: false })).toBe('retry');
  });

  it('gives up once attempts are exhausted', () => {
    expect(decidePullAction('not-ready', { attempt: MAX_ATTEMPTS, hasInjected: true })).toBe('giveup');
    // A no-receiver at the very end also gives up rather than inject-looping.
    expect(decidePullAction('no-receiver', { attempt: MAX_ATTEMPTS, hasInjected: false })).toBe('giveup');
  });
});

// ---------------------------------------------------------------------------
// End-to-end scenario: a pre-existing LeetCode tab with NO content script is
// recognized without a manual reload. We drive the same brain the component
// uses through a scripted sequence of outcomes.
// ---------------------------------------------------------------------------

describe('B21 — stale tab: no receiver -> inject -> success (no manual reload)', () => {
  /** Replays a pull cycle, mutating `state` the way App.tsx does on each step. */
  function runCycle(outcomes: PullOutcome[]): PullAction[] {
    const state: PullState = { attempt: 0, hasInjected: false };
    const actions: PullAction[] = [];
    for (const outcome of outcomes) {
      const action = decidePullAction(outcome, state);
      actions.push(action);
      if (action === 'apply' || action === 'giveup') break;
      // Mirror App.tsx's state transitions.
      if (action === 'inject') state.hasInjected = true;
      state.attempt += 1;
    }
    return actions;
  }

  it('injects on the first no-receiver, then applies once the scrape lands', () => {
    // stale tab: miss (no receiver) -> inject -> still extracting -> data ready
    const actions = runCycle(['no-receiver', 'not-ready', 'ok']);
    expect(actions).toEqual(['inject', 'retry', 'apply']);
  });

  it('tolerates several post-inject not-ready rounds before the page is scraped', () => {
    const actions = runCycle(['no-receiver', 'not-ready', 'not-ready', 'not-ready', 'ok']);
    expect(actions).toEqual(['inject', 'retry', 'retry', 'retry', 'apply']);
    // exactly ONE inject across the whole cycle
    expect(actions.filter(a => a === 'inject')).toHaveLength(1);
  });

  it('never injects more than once even if the receiver stays missing', () => {
    const actions = runCycle(['no-receiver', 'no-receiver', 'no-receiver', 'no-receiver']);
    expect(actions.filter(a => a === 'inject')).toHaveLength(1);
    // after the single inject, subsequent no-receivers become retries
    expect(actions.slice(1).every(a => a === 'retry')).toBe(true);
  });
});
