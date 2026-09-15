import { describe, it, expect } from 'vitest';
import { confusionMatrix, computeMetrics, pct, type Labeled, type Prediction } from './metrics';

/**
 * Unit tests for the eval metrics themselves. An eval you can't trust the math
 * of is worse than none — so the measurement tool gets its own tests.
 */

function pairs(rows: Array<[actual: boolean, predicted: boolean]>): { labels: Labeled[]; preds: Prediction[] } {
  return {
    labels: rows.map(([a]) => ({ leaksSolution: a })),
    preds: rows.map(([, p]) => ({ predictedLeak: p })),
  };
}

describe('confusionMatrix', () => {
  it('counts TP / FN / FP / TN correctly', () => {
    const { labels, preds } = pairs([
      [true, true],   // TP
      [true, false],  // FN
      [false, true],  // FP
      [false, false], // TN
      [true, true],   // TP
    ]);
    expect(confusionMatrix(labels, preds)).toEqual({
      truePositives: 2,
      falseNegatives: 1,
      falsePositives: 1,
      trueNegatives: 1,
    });
  });

  it('throws on mismatched lengths', () => {
    expect(() => confusionMatrix([{ leaksSolution: true }], [])).toThrow();
  });
});

describe('computeMetrics', () => {
  it('computes catch rate, false-positive rate, and precision', () => {
    // 3 leaks (2 caught, 1 missed), 2 safe (1 wrongly blocked, 1 allowed).
    const { labels, preds } = pairs([
      [true, true],
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ]);
    const m = computeMetrics(labels, preds);
    expect(m.positives).toBe(3);
    expect(m.negatives).toBe(2);
    expect(m.catchRate).toBeCloseTo(2 / 3);
    expect(m.falsePositiveRate).toBeCloseTo(1 / 2);
    expect(m.precision).toBeCloseTo(2 / 3); // TP / (TP+FP) = 2/3
  });

  it('perfect classifier -> catch 100%, FP 0%', () => {
    const { labels, preds } = pairs([[true, true], [false, false], [true, true]]);
    const m = computeMetrics(labels, preds);
    expect(m.catchRate).toBe(1);
    expect(m.falsePositiveRate).toBe(0);
    expect(m.precision).toBe(1);
  });

  it('avoids divide-by-zero when a class is absent', () => {
    const { labels, preds } = pairs([[false, false], [false, false]]);
    const m = computeMetrics(labels, preds);
    expect(m.catchRate).toBe(0);          // no positives -> 0, not NaN
    expect(m.falsePositiveRate).toBe(0);
    expect(m.precision).toBe(0);
  });
});

describe('pct', () => {
  it('formats a ratio as a one-decimal percentage', () => {
    expect(pct(0.875)).toBe('87.5%');
    expect(pct(1)).toBe('100.0%');
    expect(pct(0)).toBe('0.0%');
  });
});
