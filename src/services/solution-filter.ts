/**
 * Solution Filter
 *
 * Post-processes LLM responses to prevent complete solution disclosure.
 *
 * Why do we need this if the system prompt already says "no solutions"?
 * - LLMs don't always follow instructions perfectly
 * - Defense in depth: two layers of protection are better than one
 * - Gives users confidence the tool won't accidentally spoil problems
 *
 * What counts as a "complete solution"?
 * - A full function with all logic and a return statement
 * - Code blocks over 20 lines
 * - Responses containing phrases like "here's the complete solution"
 *
 * What's ALLOWED:
 * - Short snippets under 10 lines illustrating a concept
 * - Pseudocode without language-specific syntax
 * - Code review feedback (CHECK_APPROACH action)
 */

import type { ActionType, FilterResult } from '../types';

/** Max lines allowed in a code block before it's considered a complete solution */
const MAX_CODE_BLOCK_LINES = 20;

/** Max lines for a "snippet" (always allowed) */
const MAX_SNIPPET_LINES = 10;

/** Phrases that strongly indicate a complete solution */
const SOLUTION_PHRASES = [
  "here's the complete solution",
  "here is the complete solution",
  "here's the full solution",
  "here is the full solution",
  "complete implementation",
  "full implementation",
  "here's the code",
  "here is the code",
  "the solution is",
  "solved it",
];

/** Patterns that indicate a complete function implementation */
const COMPLETE_FUNCTION_PATTERNS = [
  // Python
  /def\s+\w+\s*\([^)]*\)\s*(?:->.*?)?:\s*\n(?:\s+.+\n){5,}/,
  // JavaScript/TypeScript
  /(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s*\{[^}]{200,}\}/s,
  // Java/C++
  /(?:public|private|protected)?\s+\w+\s+\w+\s*\([^)]*\)\s*\{[^}]{200,}\}/s,
];

/**
 * Extracts all code blocks from markdown content
 */
function extractCodeBlocks(content: string): Array<{ code: string; lineCount: number }> {
  const blocks: Array<{ code: string; lineCount: number }> = [];
  const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const code = match[1];
    const lineCount = code.split('\n').filter(l => l.trim()).length;
    blocks.push({ code, lineCount });
  }

  return blocks;
}

/**
 * Checks if content contains solution-revealing phrases
 */
function containsSolutionPhrases(content: string): boolean {
  const lower = content.toLowerCase();
  return SOLUTION_PHRASES.some(phrase => lower.includes(phrase));
}

/**
 * Checks if a code block looks like a complete function implementation
 */
function isCompleteImplementation(code: string): boolean {
  return COMPLETE_FUNCTION_PATTERNS.some(pattern => pattern.test(code));
}

/**
 * Replaces a complete solution with a guidance message
 */
function buildFilteredMessage(filterReason: string): string {
  return `⚠️ **Content filtered**

This response appeared to contain too much solution detail. LeetSage is here to help you *learn*, not to solve problems for you!

Try one of these instead:
- Click **Get Hint** for a progressive hint
- Click **Break Down Problem** to approach it step by step
- Click **Pattern Recognition** to identify the algorithmic pattern

*Filter reason: ${filterReason}*`;
}

/**
 * Main filter function — processes an LLM response and removes complete solutions.
 *
 * @param content - The raw LLM response
 * @param actionType - Which action generated this response
 * @returns FilterResult with (possibly modified) content and filter metadata
 */
export function filterResponse(content: string, actionType: ActionType): FilterResult {
  // CHECK_APPROACH is exempt — it's reviewing user code, not providing solutions
  if (actionType === 'CHECK_APPROACH') {
    return { filteredContent: content, wasFiltered: false };
  }

  // Check for solution-revealing phrases
  if (containsSolutionPhrases(content)) {
    return {
      filteredContent: buildFilteredMessage('Response contained solution-revealing language'),
      wasFiltered: true,
      filterReason: 'Solution phrases detected',
    };
  }

  // Check code blocks
  const codeBlocks = extractCodeBlocks(content);

  for (const block of codeBlocks) {
    // Block is too long
    if (block.lineCount > MAX_CODE_BLOCK_LINES) {
      return {
        filteredContent: buildFilteredMessage(`Code block had ${block.lineCount} lines (max ${MAX_CODE_BLOCK_LINES})`),
        wasFiltered: true,
        filterReason: `Code block too long (${block.lineCount} lines)`,
      };
    }

    // Block looks like a complete implementation (even if short)
    if (block.lineCount > MAX_SNIPPET_LINES && isCompleteImplementation(block.code)) {
      return {
        filteredContent: buildFilteredMessage('Response contained a complete function implementation'),
        wasFiltered: true,
        filterReason: 'Complete function implementation detected',
      };
    }
  }

  // Content passed all checks
  return { filteredContent: content, wasFiltered: false };
}
