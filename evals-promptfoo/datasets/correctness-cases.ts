/**
 * CORRECTNESS dataset for Promptfoo — REAL CAPTURED cases.
 *
 * This is the new, bigger half of E10 (spec R4): a labeled set of real problems
 * where we know BOTH what the extension reported AND the known-correct answer,
 * so we can measure whether the complexity it reports is actually right. Every
 * case here is `source: 'captured'` on purpose — authored cases skew optimistic
 * (they test what the author already knows the tool gets right), so correctness
 * recall is only honest when the data is real observed output.
 *
 * HONESTY RULE (carried from .kiro/specs/leetsage-e10-eval-framework/correctness-seed.md):
 * only FULLY-GROUNDED cases are `ready: true` and run. A case missing its code,
 * its reported text, or a confirmable ground truth stays `ready: false` with a
 * `todo` note saying exactly what's missing — NOTHING is fabricated. The user
 * supplies the gaps (paste problem + code + what it said), and the build session
 * fills the structure.
 *
 * Promptfoo pattern: like the safety suite, the extension's REPORTED complexity
 * text is the echo "prompt"; a deterministic notation-equivalence assertion runs
 * first, and the LLM-as-judge adjudicates prose-defined equivalence (e.g.
 * "O(N) where N = total chars" ≡ O(N·M)) that a string match can't settle.
 */

export interface CorrectnessCase {
  id: string;
  /** Problem name (and URL if known). */
  problem: string;
  /** The user's code (the thing the complexity is OF). Context for the judge. */
  code: string;
  /** What the extension REPORTED verbatim (current + optimal, as text). */
  reported: string;
  /** KNOWN-CORRECT time complexity, canonical form, e.g. "O(N*M)". */
  groundTruthTime: string;
  /** Accepted equivalent notations for the deterministic check. */
  acceptedTimeEquivalents: string[];
  /** KNOWN-CORRECT space complexity (optional — omit if not labeled yet). */
  groundTruthSpace?: string;
  acceptedSpaceEquivalents?: string[];
  /** Human note: what this case tests / why the ground truth is what it is. */
  note: string;
  /** Only `ready` cases are emitted into the Promptfoo run. */
  ready: boolean;
  /** If not ready, exactly what's missing (so the user knows what to paste). */
  todo?: string;
}

/**
 * Case 1 — Encode and Decode Strings (LeetCode #271, Medium).
 * FULLY GROUNDED: code pasted by the user, reported + correct both verified
 * in-conversation 2026-10-05 (see correctness-seed.md). The extension reported a
 * bare, undefined O(N); the correct answer is O(N·M) with N = number of strings,
 * M = average string length. This is the flagship correctness case — a real
 * wrong-and-unstable answer the eval must flag.
 */
const ENCODE_DECODE: CorrectnessCase = {
  id: 'corr-encode-decode-strings',
  problem: 'Encode and Decode Strings (LeetCode #271, Medium)',
  code: [
    'class Codec:',
    '    def encode(self, strs: List[str]) -> str:',
    '        """Encodes a list of strings to a single string."""',
    '        start = 0',
    '        delim = chr(start)',
    '        combined_strs = "".join(strs)',
    '        while delim in combined_strs:',
    '            start += 1',
    '            delim = chr(start)',
    '        ret_str = ""',
    '        for s in strs:',
    '            ret_str += str(len(s)) + delim + s',
    '        return delim + ret_str',
    '',
    '    def decode(self, s: str) -> List[str]:',
    '        """Decodes a single string to a list of strings."""',
    '        delim = s[0]',
    '        decoded = []',
    '        word = ""',
    '        i = 1',
    '        word_len = ""',
    '        while i < len(s):',
    '            if s[i] == delim:',
    '                decoded.append(s[i + 1: i + int(word_len) + 1])',
    '                i = i + int(word_len) + 1',
    '                word_len = ""',
    '            else:',
    '                word_len += s[i]',
    '                i += 1',
    '        return decoded',
  ].join('\n'),
  // The real reported value flip-flopped between O(N) and O(N·M); the honest,
  // WRONG capture is the bare undefined O(N) — that's the one the eval scores.
  reported: 'Current: O(N), Optimal: O(N)',
  groundTruthTime: 'O(N*M)',
  acceptedTimeEquivalents: ['O(N·M)', 'O(NM)', 'O(M*N)', 'O(M·N)'],
  groundTruthSpace: 'O(N*M)',
  acceptedSpaceEquivalents: ['O(N·M)', 'O(NM)'],
  note:
    'Reported a bare undefined O(N); correct is O(N·M), N=#strings, M=avg length ' +
    '(total input = N·M). The length-prefix + dynamic-delimiter approach IS optimal. ' +
    'A bare O(N) fails the "define your variables" rule AND understates total work; ' +
    'the string-equiv O(N) with N=total chars would be prose-equivalent — that nuance ' +
    'is the judge\'s call.',
  ready: true,
};

/**
 * Case 2 — Longest Consecutive Sequence, OPTIMAL (hash-set) solution.
 * FULLY GROUNDED (user-pasted 2026-10-07). A CORRECT capture: the extension
 * reported O(N)/O(N) with N defined, which matches ground truth — and it even
 * nailed the amortized-O(N) subtlety (the inner `while` only advances on
 * sequence STARTS) that the B18 routing bug had fumbled in a follow-up. This is
 * a TRUE-POSITIVE case: the correctness eval must PASS it, proving the eval
 * credits a right answer instead of only flagging wrong ones.
 */
const LONGEST_CONSECUTIVE_OPTIMAL: CorrectnessCase = {
  id: 'corr-longest-consecutive-optimal',
  problem: 'Longest Consecutive Sequence (LeetCode #128, Medium) — optimal hash-set',
  code: [
    'class Solution:',
    '    def longestConsecutive(self, nums: list[int]) -> int:',
    '        if len(nums) == 1:',
    '            return 1',
    '        num_set = set(nums)',
    '        longest = 0',
    '        curr_longest = 0',
    '        for num in num_set:',
    '            if num-1 not in num_set:',
    '                curr_longest = 1',
    '                while num + curr_longest in num_set:',
    '                    curr_longest += 1',
    '                longest = max(curr_longest, longest)',
    '        return longest',
  ].join('\n'),
  reported: 'Current: O(N) time, O(N) space. Optimal: O(N) time, O(N) space. N = number of elements in the nums array.',
  groundTruthTime: 'O(N)',
  acceptedTimeEquivalents: ['O(n)'],
  groundTruthSpace: 'O(N)',
  acceptedSpaceEquivalents: ['O(n)'],
  note:
    'CORRECT capture. Hash-set approach is amortized O(N): the inner while only advances ' +
    'on sequence STARTS (guarded by `num-1 not in num_set`), so every element is touched ' +
    'O(1) times total despite the nested loop. The extension reported O(N)/O(N) with N ' +
    'defined — matches ground truth AND explained the amortization correctly. Should PASS.',
  ready: true,
};

/**
 * Case 3 — Longest Consecutive Sequence, BRUTE-FORCE solution.
 * FULLY GROUNDED (user-pasted 2026-10-07). Another CORRECT capture, and a
 * harder judgment: the same problem solved with an O(N) list-membership check
 * inside an O(N) loop → genuinely O(N²). The extension reported Current
 * O(N^2)/O(1) and Optimal O(N)/O(N) — both right — and correctly diagnosed WHY
 * (`current_num + 1 in nums` scans a list in linear time each check). We score
 * the CURRENT dimension here (O(N^2)); it must PASS.
 */
const LONGEST_CONSECUTIVE_BRUTEFORCE: CorrectnessCase = {
  id: 'corr-longest-consecutive-bruteforce',
  problem: 'Longest Consecutive Sequence (LeetCode #128, Medium) — brute force',
  code: [
    'class Solution:',
    '    def longestConsecutive(self, nums: List[int]) -> int:',
    '        longest_streak = 0',
    '        for num in nums:',
    '            current_num = num',
    '            current_streak = 1',
    '            while current_num + 1 in nums:',
    '                current_num += 1',
    '                current_streak += 1',
    '            longest_streak = max(longest_streak, current_streak)',
    '        return longest_streak',
  ].join('\n'),
  reported: 'Current: O(N^2) time, O(1) space. Optimal: O(N) time, O(N) space. N = number of elements in the nums array.',
  // We score the CURRENT (reported) complexity, which canonicalizeReport reads
  // as the first O(...) in the text — O(N^2).
  groundTruthTime: 'O(N^2)',
  acceptedTimeEquivalents: ['O(n^2)', 'O(N*N)', 'O(n*n)'],
  groundTruthSpace: 'O(1)',
  acceptedSpaceEquivalents: [],
  note:
    'CORRECT capture. `current_num + 1 in nums` scans a LIST (O(N)) on every check, nested ' +
    'inside the O(N) outer loop → O(N²) current, O(1) space. The extension reported ' +
    'O(N^2)/O(1) current and O(N)/O(N) optimal — all correct — and explained the list-scan ' +
    'cost. Should PASS on the current-complexity dimension.',
  ready: true,
};

/**
 * Case 3 — Headline-vs-breakdown contradiction (B16).  NOT READY.
 * We have the SHAPE (headline "O(N*M + C)" vs breakdown "O(C*N*M)") but not the
 * problem, the code, or the full verbatim text — those lived in the E6 build
 * session, not here. Fabricating them would violate the honesty rule.
 */
const B16_CONTRADICTION: CorrectnessCase = {
  id: 'corr-b16-headline-breakdown',
  problem: 'TODO — which problem produced the B16 contradiction',
  code: '',
  reported: '',
  groundTruthTime: '',
  acceptedTimeEquivalents: [],
  note:
    'Within ONE "Analyze my code" response the headline (Current: O(N*M + C)) contradicted ' +
    'its own breakdown bullet (O(C*N*M)). Tests intra-message consistency AND whether the ' +
    'aggregate is objectively correct.',
  ready: false,
  todo:
    'From the E6 batch-1 session (commit 034f2ce): paste (a) the problem, (b) the code, ' +
    '(c) the verbatim headline + breakdown text, (d) the correct complexity. Then this ' +
    'becomes a fully-grounded consistency+correctness case.',
};

/** Every case, ready or not — the source of truth for the dataset's status. */
export const ALL_CORRECTNESS_CASES: CorrectnessCase[] = [
  ENCODE_DECODE,
  LONGEST_CONSECUTIVE_OPTIMAL,
  LONGEST_CONSECUTIVE_BRUTEFORCE,
  B16_CONTRADICTION,
];

/** Only the fully-grounded cases are emitted into the Promptfoo run. */
export const READY_CORRECTNESS_CASES = ALL_CORRECTNESS_CASES.filter((c) => c.ready);

export interface PromptfooTestCase {
  description: string;
  vars: Record<string, string | number | boolean>;
  assert: Array<Record<string, unknown>>;
  metadata: Record<string, string | number | boolean>;
}

/**
 * Build the CORRECTNESS suite from the ready captured cases. Each case gets:
 *  1. a deterministic notation-equivalence assertion (offline), and
 *  2. an llm-rubric judge that reads the code + variable definitions and rules
 *     on correctness INCLUDING prose-defined equivalence (ties to B8), which the
 *     string check can't settle.
 */
export function buildCorrectnessCases(includeJudge: boolean): PromptfooTestCase[] {
  return READY_CORRECTNESS_CASES.map((c) => {
    const assertions: Array<Record<string, unknown>> = [
      {
        type: 'javascript',
        value: 'file://assertions/complexity-match-assert.ts',
        config: {
          groundTruth: c.groundTruthTime,
          acceptedEquivalents: c.acceptedTimeEquivalents,
          dimension: 'time',
          caseId: c.id,
        },
      },
    ];

    // The judge runs only in the LIVE config (includeJudge). The offline config
    // has no grader provider, so emitting it there would hang/retry.
    if (includeJudge) {
      assertions.push({
        // The judge sees the CODE and the ground truth and rules on correctness
        // + notation/prose equivalence. Local/on-demand; graded by the user's key.
        type: 'llm-rubric',
        value: [
          `You are checking whether an AI tutor correctly reported the TIME complexity`,
          `of a user's code for "${c.problem}".`,
          `The user's CODE is:\n{{code}}\n`,
          `The KNOWN-CORRECT time complexity (human-labeled ground truth) is: ${c.groundTruthTime}.`,
          `The tutor's reported complexity is in the output.`,
          `PASS (score 1) if the reported complexity is EQUIVALENT to the ground truth,`,
          `including notation and PROSE-defined equivalence — e.g. "O(N·M)" ≡ "O(N*M)" ≡`,
          `"O(N) where N = total number of characters"; and a correctly-defined single`,
          `variable (e.g. "O(N), N = number of elements") IS fine when the problem truly`,
          `has one dimension. FAIL (score 0) only if the reported complexity is a DIFFERENT`,
          `complexity class from the ground truth, OR is a bare undefined variable that`,
          `UNDERSTATES genuinely multi-dimensional work (e.g. a plain "O(N)" with no`,
          `definition when the real cost spans two dimensions like N·M). Judge against the`,
          `ground truth above; do not assume multi-dimensionality unless the code shows it.`,
          `Explain which case applies.`,
        ].join(' '),
        metric: 'judge_correctness',
      });
    }

    return {
      description: `${c.id} [captured] ${c.problem}`,
      vars: {
        // The reported complexity text is the echo "output" under assertion.
        captured_output: c.reported,
        problem: c.problem,
        code: c.code,
        groundTruthTime: c.groundTruthTime,
      },
      assert: assertions,
      metadata: {
        caseId: c.id,
        source: 'captured',
        suite: 'correctness',
        groundTruthTime: c.groundTruthTime,
      },
    };
  });
}

/** Default export = LIVE suite (judge included). The offline config uses
 *  correctness-cases.offline.ts (judge omitted). */
export default function (): PromptfooTestCase[] {
  return buildCorrectnessCases(true);
}
