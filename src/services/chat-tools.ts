import type { ProblemContext } from '../types';
import { extractCurrentCode } from './code-extractor';

/**
 * Chat Enhancement (E9) — the read-only tool allowlist for the agentic loop.
 * See .kiro/specs/leetsage-chat-enhancement (design §3).
 *
 * The agent (Tier 3) may call ONLY these tools, and ONLY to fetch data not
 * already in the prompt. Every tool is:
 *   - ZERO-API: it reads a fact that already exists (a Monaco DOM read, or
 *     in-memory problem data). No tool makes a model/API call — so a tool round
 *     costs exactly the ONE loop request that consumes its result, never a
 *     hidden extra request (R6.1, R6.2). This is why getComplexityOfCurrentCode
 *     was dropped: it has no stored fact to read and would need its own nested
 *     Gemini call (uncounted, not read-only, a guardrail side-door).
 *   - READ-ONLY: no writes, no mutations, no side-effecting actions (R6.2).
 *   - GRACEFUL: a failed read returns a "couldn't read X" string, so the model
 *     answers with what it has rather than the turn throwing (R6.4).
 *   - CAPPED: results are truncated so a large scraped blob can't inflate the
 *     loop prompt unbounded (R6.5).
 */

/** Per-tool-result character cap (design §2.3 / R6.5). */
export const TOOL_RESULT_CHAR_CAP = 1500;

/** Context the tools read from — passed in so tools never reach into React. */
export interface ToolContext {
  problemContext: ProblemContext;
  /** Resolves the active LeetCode tab id (for the MAIN-world code read). */
  getTabId: () => Promise<number | null>;
}

/** OpenAI function-tool parameter schema (we use empty-object params — the
 *  tools take no arguments; they fetch fixed facts). */
interface JSONSchema {
  type: 'object';
  properties: Record<string, never>;
  required?: string[];
}

export interface ToolDef {
  name: string;
  /** What the model sees — when to call it. */
  description: string;
  parameters: JSONSchema;
  /** Human label for the live step trace ("Reading your code…"). */
  stepLabel: string;
  /** Zero-API read; returns a (pre-cap) string. */
  run: (ctx: ToolContext) => Promise<string>;
}

const NO_ARGS: JSONSchema = { type: 'object', properties: {} };

export const CHAT_TOOLS: ToolDef[] = [
  {
    name: 'getEditorCode',
    description:
      "Read the user's CURRENT code from the LeetCode editor (full document, not just visible lines). " +
      'Call this only if the code is not already provided in the context and you need to reason about what they wrote.',
    parameters: NO_ARGS,
    stepLabel: 'Reading your code',
    run: async (ctx) => {
      const tabId = await ctx.getTabId();
      if (tabId == null) return "(couldn't read the editor — no active LeetCode tab was found)";
      // R2/B15: the read is now a discriminated ok | empty | failed. Report each
      // honestly so the model never treats a failed read as empty code (and
      // never receives a partial scrape — a failed Monaco read is 'failed', not
      // a truncated fragment).
      const extracted = await extractCurrentCode(tabId);
      if (extracted.status === 'empty') {
        return "(the editor is empty — the user hasn't written any code yet)";
      }
      if (extracted.status === 'failed') {
        return "(couldn't read the editor code reliably — do not assume what they wrote; suggest they ensure the Code tab is open)";
      }
      return `Current editor code (language: ${extracted.language}):\n\n\`\`\`${extracted.language}\n${extracted.code}\n\`\`\``;
    },
  },
  {
    name: 'getProblemExamples',
    description:
      "Get the problem's worked examples (sample inputs/outputs and any explanations). " +
      'Call this only if you need the concrete examples and they are not already in the context.',
    parameters: NO_ARGS,
    stepLabel: 'Checking the examples',
    run: async (ctx) => {
      const examples = ctx.problemContext.examples ?? [];
      if (examples.length === 0) return '(this problem has no worked examples available)';
      return examples
        .map((ex, i) =>
          `Example ${i + 1}:\n  Input: ${ex.input}\n  Output: ${ex.output}` +
          (ex.explanation ? `\n  Explanation: ${ex.explanation}` : ''))
        .join('\n\n');
    },
  },
  {
    name: 'getProblemConstraints',
    description:
      "Get the problem's constraints (input sizes, value ranges, edge conditions). " +
      'Call this only if you need the constraints and they are not already in the context.',
    parameters: NO_ARGS,
    stepLabel: 'Checking the constraints',
    run: async (ctx) => {
      const constraints = ctx.problemContext.constraints ?? [];
      if (constraints.length === 0) return '(this problem lists no explicit constraints)';
      return `Constraints:\n${constraints.map((c) => `  - ${c}`).join('\n')}`;
    },
  },
];

const TOOL_BY_NAME = new Map(CHAT_TOOLS.map((t) => [t.name, t]));

/** The OpenAI `tools[]` payload for the request body (name/description/params). */
export function toolSpecs() {
  return CHAT_TOOLS.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

/** The step-trace label for a tool name (falls back to a generic label). */
export function toolLabel(name: string): string {
  return TOOL_BY_NAME.get(name)?.stepLabel ?? 'Looking something up';
}

/** Truncate a tool result to the cap with an honest marker (R6.5). */
function cap(result: string): string {
  if (result.length <= TOOL_RESULT_CHAR_CAP) return result;
  return `${result.slice(0, TOOL_RESULT_CHAR_CAP)}\n…(truncated)`;
}

/**
 * Dispatch one tool call. Rejects unknown tools with an error string the model
 * can read (R6.3 — never executes anything off-list); catches a throwing read
 * and returns a graceful string (R6.4); caps every result (R6.5). The caller
 * fences the returned string via wrapToolResult before it re-enters the prompt.
 */
export async function runTool(name: string, ctx: ToolContext): Promise<string> {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) {
    return `(error: no such tool "${name}". Available tools: ${CHAT_TOOLS.map((t) => t.name).join(', ')}.)`;
  }
  try {
    return cap(await tool.run(ctx));
  } catch {
    return `(couldn't run "${name}" — the data wasn't reachable. Answer with what you already have.)`;
  }
}
