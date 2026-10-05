import { describe, it, expect } from 'vitest';
import { usageBand, fillFraction } from '../usage-band';

/**
 * Unit tests for the usage-reservoir band + fill math (E9, design §6, R11.2).
 * The glyph's VISUAL correctness is the build eyeball; this pins the pure
 * derivation that drives its color + water level.
 */

describe('usageBand', () => {
  it('is low well under the cap', () => {
    expect(usageBand(0, 200)).toBe('low');
    expect(usageBand(100, 200)).toBe('low');     // 50%
    expect(usageBand(139, 200)).toBe('low');     // 69.5%
  });

  it('is moderate from ~70%', () => {
    expect(usageBand(140, 200)).toBe('moderate'); // 70%
    expect(usageBand(179, 200)).toBe('moderate'); // 89.5%
  });

  it('is high from ~90%', () => {
    expect(usageBand(180, 200)).toBe('high');     // 90%
    expect(usageBand(200, 200)).toBe('high');     // 100%
    expect(usageBand(250, 200)).toBe('high');     // over
  });

  it('defaults to low for a non-positive max', () => {
    expect(usageBand(5, 0)).toBe('low');
  });
});

describe('fillFraction (fraction REMAINING)', () => {
  it('is full at zero usage, empty at the cap', () => {
    expect(fillFraction(0, 200)).toBe(1);
    expect(fillFraction(200, 200)).toBe(0);
  });

  it('is the complement of usage in between', () => {
    expect(fillFraction(50, 200)).toBeCloseTo(0.75);
    expect(fillFraction(150, 200)).toBeCloseTo(0.25);
  });

  it('clamps when usage exceeds the cap', () => {
    expect(fillFraction(300, 200)).toBe(0);
  });

  it('is full for a non-positive max (nothing to drain)', () => {
    expect(fillFraction(5, 0)).toBe(1);
  });
});
