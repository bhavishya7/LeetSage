import type { ActionType, StructuredData, AnalyzeData, UnderstandData, ReportData, Complexity, ProblemPattern } from '../types';

/**
 * Splits a structured action's raw response into the human-readable prose and
 * the machine-readable `data` block, then validates/normalizes that block.
 *
 * The contract with the prompt (see prompts.ts): after the prose, the model
 * appends a fenced block tagged `leetsage-data` containing a single JSON
 * object:
 *
 *   ...prose the user reads...
 *
 *   ```leetsage-data
 *   { "approachDetected": "...", ... }
 *   ```
 *
 * Design notes (see .kiro/specs/leetsage-structured-output §6):
 * - §6.1 "never trust an external boundary; validate and degrade." The model
 *   can omit the block or emit malformed JSON, so parsing is TOLERANT: on any
 *   failure we return the whole thing as prose with `data: undefined` — the
 *   card degrades to prose-only instead of breaking.
 * - §6.2 streaming: the caller streams the full text (prose + block) for
 *   responsive UX, then calls this once at the end to finalize `data`. The raw
 *   block is stripped from the prose the user sees.
 * - §6.3 the `data` is the source of truth; we do light normalization here so
 *   downstream consumers get a predictable shape.
 */

const DATA_FENCE_TAG = 'leetsage-data';

/** Which actions carry a structured `data` block. Others are prose-only. */
const STRUCTURED_ACTIONS: ReadonlySet<ActionType> = new Set(['CHECK_APPROACH', 'UNDERSTAND_SOLUTION', 'GENERATE_REPORT']);

export function isStructuredAction(actionType: ActionType): boolean {
  return STRUCTURED_ACTIONS.has(actionType);
}

/**
 * Hides the trailing `leetsage-data` block (or a partially-streamed opening
 * fence) from prose shown MID-STREAM, so the user never sees the raw JSON flash
 * by as it arrives. Only trims from the fence onward; the prose above is
 * untouched. Used for live streaming; the final authoritative split is done by
 * parseStructuredResponse once the stream completes.
 */
export function stripDataBlockForDisplay(raw: string, actionType: ActionType): string {
  if (!STRUCTURED_ACTIONS.has(actionType)) return raw;
  // Cut at the opening fence if fully present.
  const fenceIdx = raw.indexOf('```' + DATA_FENCE_TAG);
  if (fenceIdx !== -1) return raw.slice(0, fenceIdx).trimEnd();
  // Also hide a fence that's still arriving (e.g. "```leetsag" or a bare "```"
  // at the very end that may be the start of the data block).
  const tail = raw.lastIndexOf('```');
  if (tail !== -1) {
    const after = raw.slice(tail);
    // A closed fence (has a later ```) is real content — leave it. Only a
    // dangling opening fence near the end is suppressed.
    if (!after.slice(3).includes('```') && ('```' + DATA_FENCE_TAG).startsWith(after.trimEnd())) {
      return raw.slice(0, tail).trimEnd();
    }
  }
  return raw;
}

export interface ParsedStructured {
  /** Prose with the raw data block removed — safe to show/persist as content. */
  prose: string;
  /** Parsed + validated data, or undefined if absent/invalid (prose-only). */
  data?: StructuredData;
}

/**
 * Locates the `leetsage-data` fenced block, parses its JSON, and validates it
 * against the action's schema. Never throws.
 */
export function parseStructuredResponse(raw: string, actionType: ActionType): ParsedStructured {
  if (!STRUCTURED_ACTIONS.has(actionType)) return { prose: raw };

  const match = extractDataBlock(raw);
  if (!match) return { prose: raw.trim() };

  const { jsonText, prose } = match;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // Malformed JSON → degrade to prose-only (§6.1). Still strip the raw block
    // so the user never sees the failed JSON dump.
    return { prose: prose.trim() };
  }

  const data = validate(parsed, actionType);
  // If validation fails we keep the prose (block already stripped) but drop data.
  return { prose: prose.trim(), data: data ?? undefined };
}

/**
 * Finds the last ```leetsage-data ... ``` fence and returns its inner JSON plus
 * the prose with that fence removed. Also tolerates a bare ```json fence or a
 * trailing bare `{ ... }` object as looser fallbacks, since models drift.
 */
function extractDataBlock(raw: string): { jsonText: string; prose: string } | null {
  // Preferred: explicit tagged fence.
  const tagged = new RegExp('```' + DATA_FENCE_TAG + '\\s*\\n([\\s\\S]*?)```', 'gi');
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = tagged.exec(raw)) !== null) last = m;
  if (last) {
    const prose = (raw.slice(0, last.index) + raw.slice(last.index + last[0].length)).trim();
    return { jsonText: last[1].trim(), prose };
  }

  // Looser fallback: a ```json fence whose contents parse as an object with at
  // least one of our known keys. Only used if the tagged fence is missing.
  const jsonFence = /```json\s*\n([\s\S]*?)```/gi;
  let jm: RegExpExecArray | null;
  let lastJson: RegExpExecArray | null = null;
  while ((jm = jsonFence.exec(raw)) !== null) {
    if (looksLikeOurData(jm[1])) lastJson = jm;
  }
  if (lastJson) {
    const prose = (raw.slice(0, lastJson.index) + raw.slice(lastJson.index + lastJson[0].length)).trim();
    return { jsonText: lastJson[1].trim(), prose };
  }

  return null;
}

function looksLikeOurData(text: string): boolean {
  return /"(approachDetected|approachSummary|currentComplexity|optimalComplexity|keyInsight|patterns|onOptimalPath|solvedOptimally)"/.test(text);
}

// ---- validation / normalization -------------------------------------------

function validate(parsed: unknown, actionType: ActionType): StructuredData | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  switch (actionType) {
    case 'CHECK_APPROACH': return validateAnalyze(obj);
    case 'UNDERSTAND_SOLUTION': return validateUnderstand(obj);
    case 'GENERATE_REPORT': return validateReport(obj);
    default: return null;
  }
}

function validateReport(obj: Record<string, unknown>): ReportData | null {
  const optimal = toComplexity(obj.optimalComplexity);
  if (!optimal) return null;
  return {
    patterns: toPatterns(obj.patterns),
    approachSummary: toStr(obj.approachSummary),
    optimalComplexity: optimal,
    solvedOptimally: obj.solvedOptimally === true,
  };
}

function validateAnalyze(obj: Record<string, unknown>): AnalyzeData | null {
  const current = toComplexity(obj.currentComplexity);
  const optimal = toComplexity(obj.optimalComplexity);
  if (!current || !optimal) return null;
  return {
    approachDetected: toStr(obj.approachDetected) || 'Unspecified approach',
    currentComplexity: current,
    optimalComplexity: optimal,
    issues: toStrArray(obj.issues),
    onOptimalPath: obj.onOptimalPath === true,
  };
}

function validateUnderstand(obj: Record<string, unknown>): UnderstandData | null {
  const optimal = toComplexity(obj.optimalComplexity);
  if (!optimal) return null;
  return {
    patterns: toPatterns(obj.patterns),
    keyInsight: toStr(obj.keyInsight),
    optimalComplexity: optimal,
  };
}

const KNOWN_PATTERNS: ReadonlySet<string> = new Set<ProblemPattern>([
  'Hash Map', 'Two Pointers', 'Sliding Window', 'Binary Search', 'BFS', 'DFS',
  'Backtracking', 'Dynamic Programming', 'Greedy', 'Stack', 'Queue', 'Heap',
  'Linked List', 'Tree', 'Graph', 'Sorting', 'Prefix Sum', 'Bit Manipulation',
  'Math', 'Recursion', 'Union Find', 'Trie', 'Other',
]);

function toPatterns(v: unknown): ProblemPattern[] {
  if (!Array.isArray(v)) return [];
  const out: ProblemPattern[] = [];
  for (const raw of v) {
    if (typeof raw !== 'string') continue;
    const canon = canonicalizePattern(raw);
    if (canon && !out.includes(canon)) out.push(canon);
  }
  return out;
}

/** Maps a free-text pattern name onto the closed vocabulary; else "Other". */
function canonicalizePattern(raw: string): ProblemPattern | null {
  const s = raw.trim();
  if (!s) return null;
  // Exact (case-insensitive) match against the known set first.
  for (const known of KNOWN_PATTERNS) {
    if (known.toLowerCase() === s.toLowerCase()) return known as ProblemPattern;
  }
  const lower = s.toLowerCase();
  const alias: Record<string, ProblemPattern> = {
    'hashmap': 'Hash Map', 'hash table': 'Hash Map', 'hashtable': 'Hash Map', 'dictionary': 'Hash Map',
    'two-pointer': 'Two Pointers', 'two pointer': 'Two Pointers',
    'sliding-window': 'Sliding Window',
    'dp': 'Dynamic Programming', 'memoization': 'Dynamic Programming',
    'breadth first search': 'BFS', 'breadth-first search': 'BFS',
    'depth first search': 'DFS', 'depth-first search': 'DFS',
    'binary-search': 'Binary Search',
    'prefix-sum': 'Prefix Sum', 'prefix sums': 'Prefix Sum',
    'union-find': 'Union Find', 'disjoint set': 'Union Find',
    'bit manipulation': 'Bit Manipulation', 'bitwise': 'Bit Manipulation',
  };
  if (alias[lower]) return alias[lower];
  return 'Other';
}

function toComplexity(v: unknown): Complexity | null {
  if (typeof v !== 'object' || v === null) return null;
  const obj = v as Record<string, unknown>;
  const time = toStr(obj.time);
  const space = toStr(obj.space);
  if (!time && !space) return null;
  return { time: time || 'O(?)', space: space || 'O(?)' };
}

function toStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function toStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string').map(s => s.trim()).filter(Boolean);
}
