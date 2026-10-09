/**
 * Promptfoo assertion → deterministic CORRECTNESS check for a complexity claim.
 *
 * The correctness eval asks: did the extension's REPORTED complexity match the
 * KNOWN-CORRECT (ground-truth) complexity for the problem? This file is the
 * DETERMINISTIC half of that — a notation-equivalence check that passes when the
 * reported Big-O canonicalizes to the same thing as any accepted ground-truth
 * form:  O(N·M) ≡ O(N*M) ≡ O(NM) ≡ O(M·N) ≡ O(N × M).
 *
 * What it DELIBERATELY does NOT try to do: judge PROSE-defined equivalence like
 * "O(N) where N = total number of characters" ≡ O(N·M). That's a semantic call
 * (B8 territory) — the spec routes it to the LLM-as-judge, which reads the
 * variable definitions. So a `false` here is NOT by itself "the extension is
 * wrong"; it means "not a deterministic string match — see the judge's verdict."
 * We surface that nuance in the reason text instead of pretending certainty.
 *
 * Promptfoo javascript-assertion contract (promptfoo 0.124): the function gets
 * the echo output (= the extension's reported complexity text) and reads the
 * ground truth from `context.config`.
 */
import { splitComplexity } from '../../src/components/complexity-parse';

interface AssertContext {
  config?: {
    /** Canonical correct answer, e.g. "O(N*M)". */
    groundTruth?: string;
    /** Extra accepted equivalents (already-canonical or raw forms). */
    acceptedEquivalents?: string[];
    /** Which dimension this case checks — for the reason text only. */
    dimension?: 'time' | 'space';
    caseId?: string;
  };
}

interface GradingResult {
  pass: boolean;
  score: number;
  reason: string;
  namedScores?: Record<string, number>;
}

/**
 * Reduce a Big-O inner expression to a comparison key:
 *  - lowercase, strip all whitespace
 *  - treat `·`, `×`, `*`, and implicit juxtaposition as the SAME multiply
 *  - sort multiplied factors so O(N*M) == O(M*N)
 *  - collapse `^` powers (`n^2` stays `n^2`, distinct from `n`)
 * Returns a canonical string, or '' if there's no parseable factor.
 */
export function canonicalizeComplexityInner(inner: string): string {
  let s = inner.toLowerCase().replace(/\s+/g, '');
  // Normalize the different multiply glyphs to a single '*'.
  s = s.replace(/[·×∙⋅]/g, '*');
  // Insert an explicit '*' for juxtaposed single-letter variables: "nm" → "n*m".
  // Only between two bare variable letters so we don't split log/min/etc.
  s = s.replace(/\b([a-z])([a-z])\b/g, '$1*$2');
  // Split additive terms, canonicalize each as a sorted product, re-join sorted.
  const terms = s.split('+').map((term) => {
    const factors = term.split('*').filter(Boolean).sort();
    return factors.join('*');
  });
  return terms.filter(Boolean).sort().join('+');
}

/** Pull the FIRST O(...) group out of a free-text report and canonicalize it. */
export function canonicalizeReport(text: string): string {
  const seg = splitComplexity(text).find((s) => s.kind === 'complexity');
  if (!seg || seg.kind !== 'complexity') return '';
  return canonicalizeComplexityInner(seg.inner);
}

export default function complexityMatchAssert(output: string, context: AssertContext): GradingResult {
  const cfg = context.config ?? {};
  const dimension = cfg.dimension ?? 'time';
  const groundTruth = cfg.groundTruth ?? '';
  const equivalents = cfg.acceptedEquivalents ?? [];

  const reportedCanon = canonicalizeReport(output);
  const acceptedCanon = new Set(
    [groundTruth, ...equivalents]
      .map((g) => canonicalizeReport(g) || canonicalizeComplexityInner(g.replace(/^o\(|\)$/gi, '')))
      .filter(Boolean),
  );

  const pass = reportedCanon !== '' && acceptedCanon.has(reportedCanon);

  const reason = pass
    ? `${dimension}: reported "${reportedCanon}" matches ground truth (one of {${[...acceptedCanon].join(', ')}})`
    : reportedCanon === ''
      ? `${dimension}: no parseable O(...) found in the reported text — judge handles prose-only answers`
      : `${dimension}: reported "${reportedCanon}" is NOT a deterministic match for {${[...acceptedCanon].join(', ')}} — ` +
        `may still be prose-equivalent (e.g. "O(N), N=total chars"); defer to the judge`;

  return {
    pass,
    score: pass ? 1 : 0,
    reason,
    namedScores: { complexity_match: pass ? 1 : 0 },
  };
}
