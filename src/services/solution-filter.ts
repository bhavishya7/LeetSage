import type { ActionType, FilterResult } from '../types';

const MAX_CODE_BLOCK_LINES = 20;
const MAX_SNIPPET_LINES = 10;

const SOLUTION_PHRASES = [
  "here's the complete solution", "here is the complete solution", "here's the full solution",
  "complete implementation", "full implementation", "here's the code", "here is the code",
];

const COMPLETE_FUNCTION_PATTERNS = [
  /def\s+\w+\s*\([^)]*\)\s*(?:->.*?)?:\s*\n(?:\s+.+\n){5,}/,
  /(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s*\{[^}]{200,}\}/s,
  /(?:public|private|protected)?\s+\w+\s+\w+\s*\([^)]*\)\s*\{[^}]{200,}\}/s,
];

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
  if (actionType === 'CHECK_APPROACH') return { filteredContent: content, wasFiltered: false };
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
  }
  return { filteredContent: content, wasFiltered: false };
}
