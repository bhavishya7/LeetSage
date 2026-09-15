import type { ActionType, FilterResult } from '../types';

const MAX_CODE_BLOCK_LINES = 14;

/**
 * Actions where including the actual solution is the point: analyzing/explaining
 * the user's own code, or generating a study-note report that records it.
 */
const SOLUTION_EXEMPT_ACTIONS: ReadonlySet<ActionType> = new Set(['CHECK_APPROACH', 'UNDERSTAND_SOLUTION', 'GENERATE_REPORT']);

const SOLUTION_PHRASES = [
  "here's the complete solution", "here is the complete solution", "here's the full solution",
  "complete implementation", "full implementation", "here's the code", "here is the code",
];

const COMPLETE_FUNCTION_PATTERNS = [
  // Python: a def header followed by 5+ indented body lines.
  /def\s+\w+\s*\([^)]*\)\s*(?:->.*?)?:\s*\n(?:\s+.+\n){5,}/,
  // Brace-language function with a large single-scope body (no nested braces).
  /(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s*\{[^}]{200,}\}/s,
  /(?:public|private|protected)?\s+\w+\s+\w+\s*\([^)]*\)\s*\{[^}]{200,}\}/s,
];

/**
 * A "complete function" that the char-count brace patterns miss: a brace-family
 * function HEADER (optional modifiers/return type, name, params, `{`) whose body
 * contains a `return`. The `[^}]{200,}` patterns above can't match a function
 * with NESTED braces (an inner `if {...}` closes the char class early), so a
 * compact-but-complete Java/C++/JS solution slipped through — the guardrail eval
 * caught it (case pos-code-2). This detects the signature + a return statement
 * anywhere in the block, which a short illustrative snippet won't have.
 */
const BRACE_FUNCTION_HEADER = /(?:(?:public|private|protected|static|final|async)\s+)*[\w<>[\],\s]*\b\w+\s*\([^)]*\)\s*\{/;
function looksLikeCompleteBraceFunction(code: string): boolean {
  return BRACE_FUNCTION_HEADER.test(code) && /\breturn\b/.test(code);
}

/**
 * Detects step-by-step pseudocode that amounts to a full algorithm — the
 * "1:1 pseudocode of the solution" case. We look for a block (fenced or plain
 * text) that combines control-flow keywords (for/while/if/return) across
 * several lines, which is a strong signal it's spelling out the whole thing
 * rather than illustrating one idea.
 */
function looksLikeFullPseudocode(text: string): boolean {
  const lines = text.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean);
  // Control/step lines: loop & branch keywords PLUS the imperative operation
  // verbs that make up a spelled-out algorithm (pop/push/append/remove/...). A
  // line that STARTS with one of these is an instruction step, not narrative
  // prose — a monotonic-stack writeup ("pop the stack and record...") is all
  // steps, which is exactly what we want to catch (case pos-pseudo-prose-2).
  const controlLines = lines.filter(l =>
    /^(for |while |if |else|return |add |set |initialize|iterate|loop|repeat)/.test(l) ||
    /^(pop |push |append |remove |insert |swap |update |increment |decrement |mark |compute |store |record |compare |check )/.test(l) ||
    /\bfor each\b|\bfor every\b/.test(l)
  );
  // A full algorithm typically has a loop AND a conditional AND a return/result,
  // spread across enough lines to constitute the whole procedure.
  const hasLoop = lines.some(l => /^(for |while |repeat|loop|iterate)|\bfor each\b/.test(l));
  const hasResult = lines.some(l => /^(return |output|result|add .*to )/.test(l));
  // A full algorithm has a loop AND a result, spread across enough imperative
  // control lines to constitute the whole procedure. We deliberately do NOT
  // require a standalone `if`: algorithms that fold the conditional into a loop
  // header (e.g. "while the stack is not empty and the top is smaller" — a
  // monotonic stack) have no line-leading branch yet are still the complete
  // solution. The guardrail eval caught that over-fit (case pos-pseudo-prose-2).
  // Requiring loop + result + 5 control lines keeps plain narrative prose (which
  // has no loop/return structure) from tripping this.
  return controlLines.length >= 5 && hasLoop && hasResult;
}

function extractCodeBlocks(content: string): Array<{ code: string; lineCount: number }> {
  const blocks: Array<{ code: string; lineCount: number }> = [];
  const regex = /```[\w]*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const code = match[1];
    blocks.push({ code, lineCount: code.split('\n').filter(l => l.trim()).length });
  }
  return blocks;
}

function buildFilteredMessage(reason: string): string {
  return `⚠️ **Content filtered**\n\nThis response appeared to contain too much solution detail. LeetSage is here to help you *learn*, not to solve problems for you!\n\nTry one of these instead:\n- Click **Get Hint** for a progressive hint\n- Click **Break Down Problem** to approach it step by step\n\n*Filter reason: ${reason}*`;
}

export function filterResponse(content: string, actionType: ActionType): FilterResult {
  // These actions analyze/explain the user's OWN code — solutions are expected.
  if (SOLUTION_EXEMPT_ACTIONS.has(actionType)) return { filteredContent: content, wasFiltered: false };

  const lower = content.toLowerCase();
  if (SOLUTION_PHRASES.some(p => lower.includes(p))) {
    return { filteredContent: buildFilteredMessage('Solution-revealing language detected'), wasFiltered: true, filterReason: 'Solution phrases detected' };
  }

  for (const block of extractCodeBlocks(content)) {
    if (block.lineCount > MAX_CODE_BLOCK_LINES) {
      return { filteredContent: buildFilteredMessage(`Code block had ${block.lineCount} lines (max ${MAX_CODE_BLOCK_LINES})`), wasFiltered: true, filterReason: `Code block too long` };
    }
    // A COMPLETE function implementation is a leak regardless of line count: a
    // compact 8-line solution (e.g. Two Sum) is still the whole answer. The
    // patterns require a real function signature + a substantial body (5+
    // indented lines, or a 200-char brace body), so a short illustrative
    // snippet — the thing we WANT to allow — won't match. The old
    // `> MAX_SNIPPET_LINES` gate let compact full solutions slip through; the
    // guardrail eval caught it (case pos-code-1).
    if (COMPLETE_FUNCTION_PATTERNS.some(p => p.test(block.code)) || looksLikeCompleteBraceFunction(block.code)) {
      return { filteredContent: buildFilteredMessage('Complete function implementation detected'), wasFiltered: true, filterReason: 'Complete implementation detected' };
    }
    // A fenced block that's really full pseudocode of the algorithm.
    if (looksLikeFullPseudocode(block.code)) {
      return { filteredContent: buildFilteredMessage('Response spelled out the full algorithm as pseudocode'), wasFiltered: true, filterReason: 'Full pseudocode detected' };
    }
  }

  // Pseudocode often appears WITHOUT code fences — check the whole response too.
  if (looksLikeFullPseudocode(content)) {
    return { filteredContent: buildFilteredMessage('Response spelled out the full algorithm step-by-step'), wasFiltered: true, filterReason: 'Full pseudocode detected (prose)' };
  }

  return { filteredContent: content, wasFiltered: false };
}
