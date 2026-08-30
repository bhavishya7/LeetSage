import type { ActionType, FilterResult } from '../types';

const MAX_CODE_BLOCK_LINES = 14;
const MAX_SNIPPET_LINES = 8;

/** Actions where explaining the actual solution is the point (user's own code). */
const SOLUTION_EXEMPT_ACTIONS: ReadonlySet<ActionType> = new Set(['CHECK_APPROACH', 'UNDERSTAND_SOLUTION']);

const SOLUTION_PHRASES = [
  "here's the complete solution", "here is the complete solution", "here's the full solution",
  "complete implementation", "full implementation", "here's the code", "here is the code",
];

const COMPLETE_FUNCTION_PATTERNS = [
  /def\s+\w+\s*\([^)]*\)\s*(?:->.*?)?:\s*\n(?:\s+.+\n){5,}/,
  /(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s*\{[^}]{200,}\}/s,
  /(?:public|private|protected)?\s+\w+\s+\w+\s*\([^)]*\)\s*\{[^}]{200,}\}/s,
];

/**
 * Detects step-by-step pseudocode that amounts to a full algorithm — the
 * "1:1 pseudocode of the solution" case. We look for a block (fenced or plain
 * text) that combines control-flow keywords (for/while/if/return) across
 * several lines, which is a strong signal it's spelling out the whole thing
 * rather than illustrating one idea.
 */
function looksLikeFullPseudocode(text: string): boolean {
  const lines = text.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean);
  const controlLines = lines.filter(l =>
    /^(for |while |if |else|return |add |set |initialize|iterate|loop|repeat)/.test(l) ||
    /\bfor each\b|\bfor every\b/.test(l)
  );
  // A full algorithm typically has a loop AND a conditional AND a return/result,
  // spread across enough lines to constitute the whole procedure.
  const hasLoop = lines.some(l => /^(for |while |repeat|loop|iterate)|\bfor each\b/.test(l));
  const hasBranch = lines.some(l => /^(if |else)/.test(l));
  const hasResult = lines.some(l => /^(return |output|result|add .*to )/.test(l));
  return controlLines.length >= 5 && hasLoop && hasBranch && hasResult;
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
    if (block.lineCount > MAX_SNIPPET_LINES && COMPLETE_FUNCTION_PATTERNS.some(p => p.test(block.code))) {
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
