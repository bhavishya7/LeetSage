import type { ActionType } from '../../types';

/**
 * LABELED EVAL DATASET for the solution-filter guardrail.
 *
 * This is the ground-truth set the guardrail eval scores against. Each case is
 * a sample assistant response tagged with whether it ACTUALLY leaks the full
 * solution (`leaksSolution`). The eval runs filterResponse() over every case
 * and measures catch rate (recall on leaks) and false-positive rate (legit
 * coaching wrongly blocked).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HONESTY NOTE — read before quoting any number from this eval.
 *
 * These cases are AUTHOR-GENERATED (`source: 'authored'`). They were written by
 * the same person who wrote the filter's heuristics, so they skew toward the
 * leak shapes the filter was designed to catch. That makes this a strong
 * REGRESSION GATE ("did a change break the guardrail?") but a WEAK measurement
 * of real-world recall against how Gemini actually phrases things in the wild.
 *
 * To close that gap, this file is structured to ingest REAL captured responses
 * later (`source: 'captured'`) — paste actual model outputs, hand-label them,
 * and they join the same metrics run. The semantic cases regex can't catch
 * (clever paraphrases of a full solution) are the job of the LLM-as-judge
 * scaffold (see ../llm-judge.ts), kept offline/mockable so this eval never
 * needs a live API key.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Where a case came from — drives the honesty caveat + lets us split metrics. */
export type CaseSource = 'authored' | 'captured';

/** Coarse tag for what KIND of leak a positive case represents (for reporting). */
export type LeakType =
  | 'none'                 // not a leak (negative case)
  | 'solution-phrase'      // explicit "here's the complete solution"-style language
  | 'long-code-block'      // a code block over the line limit
  | 'complete-function'    // a full function implementation
  | 'full-pseudocode';     // step-by-step pseudocode of the whole algorithm

export interface GuardrailCase {
  id: string;
  /** The action context the response was produced under. */
  actionType: ActionType;
  /** The sample assistant response text. */
  response: string;
  /** GROUND TRUTH: does this actually hand over the full solution? */
  leaksSolution: boolean;
  /** What kind of leak (or 'none'). */
  leakType: LeakType;
  source: CaseSource;
  /** Short human note on why it's labeled the way it is. */
  note: string;
}

// A compact, complete Python solution used in several positive cases.
const TWO_SUM_FULL = [
  'def two_sum(nums, target):',
  '    seen = {}',
  '    for i in range(len(nums)):',
  '        complement = target - nums[i]',
  '        if complement in seen:',
  '            return [seen[complement], i]',
  '        seen[nums[i]] = i',
  '    return []',
].join('\n');

// ---------------------------------------------------------------------------
// POSITIVE cases — these SHOULD be filtered (leaksSolution: true).
// ---------------------------------------------------------------------------
const POSITIVES: GuardrailCase[] = [
  {
    id: 'pos-phrase-1',
    actionType: 'GET_HINT',
    response: "Sure — here's the complete solution to Two Sum. Just use a hash map to store what you've seen.",
    leaksSolution: true,
    leakType: 'solution-phrase',
    source: 'authored',
    note: 'Explicit solution-revealing phrase.',
  },
  {
    id: 'pos-phrase-2',
    actionType: 'EXPLAIN_CONCEPT',
    response: "Here is the full implementation you can paste in.",
    leaksSolution: true,
    leakType: 'solution-phrase',
    source: 'authored',
    note: 'Full-implementation language.',
  },
  {
    id: 'pos-code-1',
    actionType: 'GET_HINT',
    response: 'Here you go:\n```python\n' + TWO_SUM_FULL + '\n```',
    leaksSolution: true,
    leakType: 'complete-function',
    source: 'authored',
    note: 'A complete, runnable function — the whole answer.',
  },
  {
    id: 'pos-code-2',
    actionType: 'PATTERN_RECOGNITION',
    response:
      'The optimal approach:\n```java\n' +
      [
        'public int[] twoSum(int[] nums, int target) {',
        '    Map<Integer,Integer> seen = new HashMap<>();',
        '    for (int i = 0; i < nums.length; i++) {',
        '        int c = target - nums[i];',
        '        if (seen.containsKey(c)) {',
        '            return new int[]{seen.get(c), i};',
        '        }',
        '        seen.put(nums[i], i);',
        '    }',
        '    return new int[]{};',
        '}',
      ].join('\n') +
      '\n```',
    leaksSolution: true,
    leakType: 'complete-function',
    source: 'authored',
    note: 'Complete Java implementation.',
  },
  {
    id: 'pos-longblock-1',
    actionType: 'GENERATE_EXAMPLES',
    response:
      'Trace through this:\n```python\n' +
      Array.from({ length: 20 }, (_, i) => `step_${i} = compute(${i})`).join('\n') +
      '\n```',
    leaksSolution: true,
    leakType: 'long-code-block',
    source: 'authored',
    note: 'A 20-line code block — over the length limit regardless of content.',
  },
  {
    id: 'pos-pseudo-fenced-1',
    actionType: 'BREAK_DOWN_PROBLEM',
    response:
      '```\n' +
      [
        'initialize an empty hash map',
        'for each number in the array',
        '  if target minus number is in the map',
        '    return the two indices',
        '  else set map at number to index',
        'return an empty result',
      ].join('\n') +
      '\n```',
    leaksSolution: true,
    leakType: 'full-pseudocode',
    source: 'authored',
    note: 'Fenced pseudocode spelling out the entire algorithm.',
  },
  {
    id: 'pos-pseudo-prose-1',
    actionType: 'GET_HINT',
    response: [
      'initialize an empty hash map',
      'for each number in the array',
      'if the complement is in the map',
      'return the two indices',
      'else set the map at this number to its index',
      'return an empty list at the end',
    ].join('\n'),
    leaksSolution: true,
    leakType: 'full-pseudocode',
    source: 'authored',
    note: 'The same full algorithm as prose, no code fences.',
  },
  {
    id: 'pos-pseudo-prose-2',
    actionType: 'BREAK_DOWN_PROBLEM',
    response: [
      'for each element in the list',
      'while the stack is not empty and the top is smaller',
      'pop the stack and record the result',
      'if the value is greater set the answer',
      'return the array of results at the end',
    ].join('\n'),
    leaksSolution: true,
    leakType: 'full-pseudocode',
    source: 'authored',
    note: 'Full monotonic-stack algorithm as step-by-step prose.',
  },
];

// ---------------------------------------------------------------------------
// NEGATIVE cases — these should PASS (leaksSolution: false). A false positive
// here is a legit coaching response wrongly blocked, which hurts UX.
// ---------------------------------------------------------------------------
const NEGATIVES: GuardrailCase[] = [
  {
    id: 'neg-hint-1',
    actionType: 'GET_HINT',
    response: 'What data structure gives you O(1) lookups? Think about what you need to check for each number as you scan.',
    leaksSolution: false,
    leakType: 'none',
    source: 'authored',
    note: 'A conceptual nudge — no algorithm handed over.',
  },
  {
    id: 'neg-hint-2',
    actionType: 'GET_HINT',
    response: 'You are recomputing the same thing each pass. Is there a way to remember what you have already seen?',
    leaksSolution: false,
    leakType: 'none',
    source: 'authored',
    note: 'Points at the inefficiency without naming the solution.',
  },
  {
    id: 'neg-snippet-1',
    actionType: 'EXPLAIN_CONCEPT',
    response:
      'A hash map lookup looks like this:\n```python\nif key in seen:\n    use(seen[key])\n```\nThat is the O(1) check — how might you apply it here?',
    leaksSolution: false,
    leakType: 'none',
    source: 'authored',
    note: 'A tiny 2-line snippet illustrating ONE idea, not the whole solution.',
  },
  {
    id: 'neg-oneidea-pseudo-1',
    actionType: 'GET_HINT',
    response: 'Try iterating once and remembering each number you have seen in a map, keyed by its value.',
    leaksSolution: false,
    leakType: 'none',
    source: 'authored',
    note: 'Single-idea pseudocode — one loop, no full branch/return structure.',
  },
  {
    id: 'neg-concept-1',
    actionType: 'EXPLAIN_CONCEPT',
    response:
      'The two-pointer technique walks two indices toward each other. It works when the array is sorted, because moving a pointer changes the sum predictably. It will not by itself solve every problem — you have to argue why the value you skip can never be part of the answer.',
    leaksSolution: false,
    leakType: 'none',
    source: 'authored',
    note: 'Teaching a technique in the abstract, not solving the problem.',
  },
  {
    id: 'neg-complexity-1',
    actionType: 'TIME_COMPLEXITY_HINT',
    response: 'Your nested loop is O(n^2) because for each element you scan the rest. Can you trade space for time to get to O(n)?',
    leaksSolution: false,
    leakType: 'none',
    source: 'authored',
    note: 'Complexity coaching — names the target cost, not the code.',
  },
  {
    id: 'neg-breakdown-1',
    actionType: 'BREAK_DOWN_PROBLEM',
    response:
      'Break it into pieces: (1) what are you searching for as you scan? (2) what would let you find it instantly? (3) what do you store so a later element can find an earlier one? Answer those in order.',
    leaksSolution: false,
    leakType: 'none',
    source: 'authored',
    note: 'Socratic sub-problems — guides thinking without the algorithm.',
  },
  {
    id: 'neg-longprose-1',
    actionType: 'EXPLAIN_CONCEPT',
    response:
      'Hashing is worth understanding deeply. A hash map stores key-value pairs and, on average, gives constant-time insert and lookup by turning a key into an index via a hash function. Collisions are handled by chaining or open addressing. The average case is what makes it attractive for lookup-heavy problems; the worst case degrades if many keys collide. Knowing this helps you reason about WHY a map turns a quadratic scan into a linear one, which is the insight most of these problems are testing.',
    leaksSolution: false,
    leakType: 'none',
    source: 'authored',
    note: 'Long, legitimate prose — must NOT trip the code/pseudocode rules.',
  },
];

/**
 * The full labeled dataset. Append `source: 'captured'` cases here as you
 * collect real Gemini responses — they flow through the same metrics.
 */
export const GUARDRAIL_CASES: GuardrailCase[] = [...POSITIVES, ...NEGATIVES];
