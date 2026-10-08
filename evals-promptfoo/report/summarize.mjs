// @ts-check
/**
 * Honest reporting for the Promptfoo eval (spec R5).
 *
 * Promptfoo prints its own pass/fail table, but it does NOT speak the language
 * an ML reviewer wants for THIS product: catch rate / false-positive rate /
 * precision for the safety guardrail, a correctness match-rate, and — the whole
 * point of R5 — those numbers SPLIT BY SOURCE (authored vs captured). The
 * flattering authored number must never masquerade as real-world recall, so we
 * compute and print the split explicitly.
 *
 * Input: the JSON file written by `promptfoo eval -o <file>.json`. We read the
 * verified 0.124 shape: `data.results.results[]`, each row carrying
 * `testCase.metadata` (our source/suite/leak tags) and
 * `gradingResult.componentResults[]` (per-assertion pass + assertion.type/metric).
 *
 * This is a pure Node ESM script (no TypeScript, no Promptfoo import) so it runs
 * with a bare `node` after the eval — nothing to transpile, nothing to key.
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node summarize.mjs <promptfoo-output.json>');
  process.exit(2);
}

/** @type {any} */
let data;
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`Could not read eval output at ${file}: ${/** @type {Error} */ (e).message}`);
  console.error('Did the eval run? Try `npm run eval:promptfoo` (or :offline).');
  process.exit(2);
}

const rows = data?.results?.results;
if (!Array.isArray(rows)) {
  console.error('Unexpected output shape — no results.results[] array. Promptfoo may have changed its JSON format.');
  process.exit(2);
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const rate = (num, den) => (den === 0 ? 0 : num / den);

/** Find the pass/fail of a specific assertion within a row's componentResults. */
function componentPass(row, { type, metric }) {
  const comps = row?.gradingResult?.componentResults ?? [];
  const hit = comps.find((c) => {
    const a = c.assertion ?? {};
    if (type && a.type !== type) return false;
    if (metric && a.metric !== metric) return false;
    return true;
  });
  return hit ? Boolean(hit.pass) : null; // null = assertion not present (e.g. judge skipped offline)
}

// ── SAFETY ────────────────────────────────────────────────────────────────
// The deterministic filter mirror is a `javascript` assertion with no metric.
// We score it as a confusion matrix against the human label (expectedLeak).
function safetyMetrics(predicate) {
  const cm = { tp: 0, fn: 0, fp: 0, tn: 0, judgedTp: 0, judgedFn: 0, judgedFp: 0, judgedTn: 0, judgeCases: 0 };
  for (const row of rows) {
    const md = row?.testCase?.metadata ?? {};
    if (md.suite !== 'safety' || md.exempt) continue; // exempt actions aren't leak-graded
    if (!predicate(md)) continue;

    const actualLeak = md.expectedLeak === true;
    // Deterministic filter decision: did the filter-mirror assertion say "leak"?
    // The assertion PASSES when filter agreed with the label, so we reconstruct
    // the filter's raw prediction from (pass, label).
    const filterAgreed = componentPass(row, { type: 'javascript' });
    // The assertion PASSES iff the filter's decision matched the label. So the
    // filter predicted a leak when (it agreed AND the case is a leak) OR
    // (it disagreed AND the case is safe → it over-flagged a safe case).
    const predictedLeak = filterAgreed === null ? null : filterAgreed ? actualLeak : !actualLeak;
    if (predictedLeak !== null) {
      if (actualLeak && predictedLeak) cm.tp++;
      else if (actualLeak && !predictedLeak) cm.fn++;
      else if (!actualLeak && predictedLeak) cm.fp++;
      else cm.tn++;
    }

    // Judge (semantic safety), when present. The judge "passes" a SAFE response
    // and "fails" a leak, so judge-flags-leak = !judgePass.
    const judgePass = componentPass(row, { metric: 'judge_safety' });
    if (judgePass !== null) {
      cm.judgeCases++;
      const judgeLeak = !judgePass;
      if (actualLeak && judgeLeak) cm.judgedTp++;
      else if (actualLeak && !judgeLeak) cm.judgedFn++;
      else if (!actualLeak && judgeLeak) cm.judgedFp++;
      else cm.judgedTn++;
    }
  }
  return cm;
}

function printSafety(title, cm) {
  const pos = cm.tp + cm.fn;
  const neg = cm.fp + cm.tn;
  console.log(`  ${title}`);
  console.log(`    cases: ${pos + neg}  (leaks: ${pos}, safe: ${neg})`);
  console.log(`    [filter] catch rate: ${pct(rate(cm.tp, pos))}  FP rate: ${pct(rate(cm.fp, neg))}  precision: ${pct(rate(cm.tp, cm.tp + cm.fp))}  (TP=${cm.tp} FN=${cm.fn} FP=${cm.fp} TN=${cm.tn})`);
  if (cm.judgeCases > 0) {
    const jpos = cm.judgedTp + cm.judgedFn;
    const jneg = cm.judgedFp + cm.judgedTn;
    console.log(`    [judge]  catch rate: ${pct(rate(cm.judgedTp, jpos))}  FP rate: ${pct(rate(cm.judgedFp, jneg))}  precision: ${pct(rate(cm.judgedTp, cm.judgedTp + cm.judgedFp))}  (over ${cm.judgeCases} non-exempt cases)`);
  } else {
    console.log(`    [judge]  not run (offline / no GEMINI_API_KEY) — deterministic numbers only`);
  }
}

// ── CORRECTNESS ─────────────────────────────────────────────────────────────
function correctnessRows() {
  return rows.filter((r) => r?.testCase?.metadata?.suite === 'correctness');
}

function printCorrectness() {
  const cr = correctnessRows();
  if (cr.length === 0) {
    console.log('  (no READY correctness cases — add captured cases in datasets/correctness-cases.ts)');
    return;
  }
  let detMatch = 0, detTotal = 0, judgeMatch = 0, judgeTotal = 0;
  for (const row of cr) {
    const det = componentPass(row, { type: 'javascript' });
    if (det !== null) { detTotal++; if (det) detMatch++; }
    const judge = componentPass(row, { metric: 'judge_correctness' });
    if (judge !== null) { judgeTotal++; if (judge) judgeMatch++; }
    const md = row.testCase.metadata;
    const label = det ? 'MATCH' : 'MISMATCH';
    console.log(`    - ${md.caseId}: deterministic ${label} (ground truth ${md.groundTruthTime})`);
  }
  console.log(`    [deterministic notation-match] ${detMatch}/${detTotal} = ${pct(rate(detMatch, detTotal))}`);
  if (judgeTotal > 0) {
    console.log(`    [judge correctness incl. prose-equiv] ${judgeMatch}/${judgeTotal} = ${pct(rate(judgeMatch, judgeTotal))}`);
  } else {
    console.log(`    [judge correctness] not run (offline / no GEMINI_API_KEY)`);
  }
}

// ── OUTPUT ──────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════');
console.log(' LeetSage — Promptfoo eval summary (split by source)');
console.log('══════════════════════════════════════════════════════════════');

console.log('\n■ SAFETY (does the guardrail stop a solution leak?)');
printSafety('ALL safety cases', safetyMetrics(() => true));
printSafety('AUTHORED only (regression gate — optimistic)', safetyMetrics((md) => md.source === 'authored'));
printSafety('CAPTURED only (the honest real-world signal)', safetyMetrics((md) => md.source === 'captured'));

console.log('\n■ CORRECTNESS (is the reported complexity actually right?)');
printCorrectness();

console.log('\n■ HONESTY NOTES');
console.log('  - The deterministic filter mirror == the shipped guardrail (same code path),');
console.log('    so these safety numbers match the Vitest CI gate by construction.');
console.log('  - The judge is model-dependent + unvalidated (Gemini grading Gemini →');
console.log('    self-preference risk). Treat its scores as a signal, not ground truth.');
console.log('  - Correctness ground truth is human-labeled; a deterministic MISMATCH may');
console.log('    still be prose-equivalent — the judge adjudicates that (ties to B8).');
console.log('  - A failing correctness case is the eval WORKING: it flags a real');
console.log('    reported-vs-correct gap (B14/R4/B16) for a follow-up fix to validate against.');
console.log('');
