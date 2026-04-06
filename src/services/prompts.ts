import type { ActionType, ProblemContext } from '../types';

const SOLUTION_PREVENTION_RULES = `
CRITICAL RULES:
1. NEVER provide a complete working code solution
2. NEVER write a full function implementation with all logic
3. You MAY provide short code snippets (under 10 lines) to illustrate a concept
4. You MAY provide pseudocode that outlines logic without language-specific syntax
5. If asked directly for the solution, redirect to a hint instead
6. Keep responses focused and educational, not exhaustive
`;

const TONE_GUIDELINES = `
TONE:
- Be encouraging and supportive, like a patient mentor
- Use analogies and real-world examples when helpful
- Celebrate small insights
- Keep responses concise
- Use markdown formatting for readability
`;

export function formatProblemContext(problem: ProblemContext): string {
  const examples = problem.examples
    .map((ex, i) => `Example ${i + 1}:\n  Input: ${ex.input}\n  Output: ${ex.output}${ex.explanation ? `\n  Explanation: ${ex.explanation}` : ''}`)
    .join('\n\n');
  const constraints = problem.constraints.length > 0
    ? `Constraints:\n${problem.constraints.map(c => `  - ${c}`).join('\n')}`
    : '';
  return `PROBLEM: ${problem.title} (${problem.difficulty})\nURL: ${problem.url}\n\nDESCRIPTION:\n${problem.description}\n\n${examples ? `EXAMPLES:\n${examples}` : ''}\n\n${constraints}`.trim();
}

export function getSystemPrompt(actionType: ActionType): string {
  const prompts: Record<ActionType, string> = {
    GET_HINT: `You are LeetSage, an AI learning coach. Provide a HINT — not a solution.\n${SOLUTION_PREVENTION_RULES}\nHINT LEVELS:\n- Level 1 (Conceptual): What kind of problem? What data structure?\n- Level 2 (Approach): Strategy or algorithm at high level\n- Level 3 (Implementation): Specific guidance, edge cases — still no complete code\n\nFORMAT:\n## Hint [level]: [title]\n[2-4 sentences]\n\n💡 **Think about:** [guiding question]\n${TONE_GUIDELINES}`,
    GENERATE_EXAMPLES: `You are LeetSage. Generate 2-3 NEW examples with complexity labels (Simple/Medium/Tricky).\n${SOLUTION_PREVENTION_RULES}\nFORMAT:\n## Generated Examples\n### Example A — [complexity]: [description]\n**Input:** ...\n**Output:** ...\n**Why this helps:** ...\n${TONE_GUIDELINES}`,
    BREAK_DOWN_PROBLEM: `You are LeetSage. Decompose the problem into 3-5 logical sub-problems.\n${SOLUTION_PREVENTION_RULES}\nFORMAT:\n## Problem Breakdown\n**Overall Strategy:** [1 sentence]\n### Step 1: [title]\n[description]\n🔧 **Relevant concepts:** ...\n${TONE_GUIDELINES}`,
    EXPLAIN_CONCEPT: `You are LeetSage. Explain the most relevant data structure or algorithm concept.\n${SOLUTION_PREVENTION_RULES}\nUse a real-world analogy, show a generic example (NOT the solution), explain complexity.\n${TONE_GUIDELINES}`,
    CHECK_APPROACH: `You are LeetSage. Review the developer's proposed approach.\n${SOLUTION_PREVENTION_RULES}\nAcknowledge what's correct, point out issues, ask guiding questions. Do NOT rewrite their approach.\n${TONE_GUIDELINES}`,
    TIME_COMPLEXITY_HINT: `You are LeetSage. Hint at the optimal time complexity WITHOUT revealing the algorithm.\n${SOLUTION_PREVENTION_RULES}\nFORMAT:\n## Time Complexity Hint\n**Target:** O(?)\n**What this means:** ...\n**Hint:** ...\n${TONE_GUIDELINES}`,
    PATTERN_RECOGNITION: `You are LeetSage. Identify the algorithmic pattern(s) in this problem.\n${SOLUTION_PREVENTION_RULES}\nName the pattern, explain how to identify it, mention 1-2 similar problems. Do NOT explain how to apply it.\n${TONE_GUIDELINES}`,
  };
  return prompts[actionType];
}

export function buildUserMessage(actionType: ActionType, problem: ProblemContext, options?: { hintLevel?: number; userApproach?: string }): string {
  const ctx = formatProblemContext(problem);
  switch (actionType) {
    case 'GET_HINT': return `${ctx}\n\nPlease give me Hint Level ${(options?.hintLevel ?? 0) + 1} for this problem.`;
    case 'GENERATE_EXAMPLES': return `${ctx}\n\nPlease generate new examples to help me understand this problem better.`;
    case 'BREAK_DOWN_PROBLEM': return `${ctx}\n\nPlease break this problem down into manageable steps.`;
    case 'EXPLAIN_CONCEPT': return `${ctx}\n\nPlease explain the most relevant concept for this problem.`;
    case 'CHECK_APPROACH': return `${ctx}\n\nHere is my proposed approach:\n${options?.userApproach ?? '(No approach provided)'}\n\nPlease review my approach.`;
    case 'TIME_COMPLEXITY_HINT': return `${ctx}\n\nPlease give me a hint about the optimal time complexity.`;
    case 'PATTERN_RECOGNITION': return `${ctx}\n\nPlease help me recognize the algorithmic pattern(s).`;
  }
}
