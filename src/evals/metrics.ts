/**
 * Pure eval metrics — a confusion matrix and the rates derived from it.
 *
 * Kept dependency-free and pure so it can score ANY binary classifier's
 * predictions against ground-truth labels: the solution-filter (deterministic),
 * or the LLM-as-judge (semantic). Separating measurement from the thing being
 * measured is the point of an eval harness.
 *
 * Vocabulary (positive class = "leaks the solution"):
 *  - TP: labeled leak, predicted leak      (correctly caught)
 *  - FN: labeled leak, predicted safe      (a MISS — the dangerous error)
 *  - FP: labeled safe, predicted leak      (over-blocked legit coaching)
 *  - TN: labeled safe, predicted safe      (correctly allowed)
 */

export interface Labeled {
  /** Ground truth: is this actually a leak? */
  leaksSolution: boolean;
}

export interface Prediction {
  /** What the classifier decided: did it flag this as a leak? */
  predictedLeak: boolean;
}

export interface ConfusionMatrix {
  truePositives: number;
  falseNegatives: number;
  falsePositives: number;
  trueNegatives: number;
}

export interface EvalMetrics extends ConfusionMatrix {
  total: number;
  positives: number;   // total actual leaks
  negatives: number;   // total actual safe
  /** Recall on leaks = TP / (TP + FN). "Of all real leaks, how many did we catch?" */
  catchRate: number;
  /** FP / (FP + TN). "Of all safe responses, how many did we wrongly block?" */
  falsePositiveRate: number;
  /** TP / (TP + FP). "When we blocked, how often were we right?" */
  precision: number;
}

/** Builds a confusion matrix from paired labels + predictions (same order). */
export function confusionMatrix(labels: Labeled[], predictions: Prediction[]): ConfusionMatrix {
  if (labels.length !== predictions.length) {
    throw new Error(`labels (${labels.length}) and predictions (${predictions.length}) must be the same length`);
  }
  const cm: ConfusionMatrix = { truePositives: 0, falseNegatives: 0, falsePositives: 0, trueNegatives: 0 };
  for (let i = 0; i < labels.length; i++) {
    const actual = labels[i].leaksSolution;
    const predicted = predictions[i].predictedLeak;
    if (actual && predicted) cm.truePositives++;
    else if (actual && !predicted) cm.falseNegatives++;
    else if (!actual && predicted) cm.falsePositives++;
    else cm.trueNegatives++;
  }
  return cm;
}

/** A safe divide that returns 0 for 0/0 (no cases of that class). */
function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Computes the full metric set from labels + predictions. */
export function computeMetrics(labels: Labeled[], predictions: Prediction[]): EvalMetrics {
  const cm = confusionMatrix(labels, predictions);
  const { truePositives: tp, falseNegatives: fn, falsePositives: fp, trueNegatives: tn } = cm;
  return {
    ...cm,
    total: tp + fn + fp + tn,
    positives: tp + fn,
    negatives: fp + tn,
    catchRate: rate(tp, tp + fn),
    falsePositiveRate: rate(fp, fp + tn),
    precision: rate(tp, tp + fp),
  };
}

/** Formats a metric (0..1) as a percentage string, e.g. 0.875 -> "87.5%". */
export function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/** A human-readable report block for the console / CI logs. */
export function formatReport(title: string, m: EvalMetrics): string {
  return [
    `── ${title} ──`,
    `  cases: ${m.total}  (leaks: ${m.positives}, safe: ${m.negatives})`,
    `  catch rate (recall on leaks): ${pct(m.catchRate)}   [${m.truePositives}/${m.positives}]`,
    `  false-positive rate:          ${pct(m.falsePositiveRate)}   [${m.falsePositives}/${m.negatives}]`,
    `  precision (blocks that were right): ${pct(m.precision)}`,
    `  confusion: TP=${m.truePositives} FN=${m.falseNegatives} FP=${m.falsePositives} TN=${m.trueNegatives}`,
  ].join('\n');
}
