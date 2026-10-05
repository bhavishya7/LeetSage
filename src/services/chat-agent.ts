import type { AssistantTurn, ToolCall } from './llm-service';

/**
 * Chat Enhancement (E9) — the bounded agentic tool loop (Tier 3).
 * See .kiro/specs/leetsage-chat-enhancement (design §2).
 *
 * This is the control loop that makes chat "an agent": it offers the model a
 * read-only tool allowlist, lets it decide which (if any) to call, runs them,
 * feeds the results back, and repeats — BOUNDED by a hard round cap — then
 * forces a final answer. It is the FALLBACK branch behind the shipped intent
 * router (Tier 1) and context chat (Tier 2); it fires only when the model
 * decides it needs to fetch data.
 *
 * PURE + DEPS-INJECTED: every effect (network round, tool run, budget check,
 * usage/metrics accounting, step trace) is passed in via `deps`, so the whole
 * loop — including the critical "N rounds == N recorded requests" invariant and
 * the cap/budget stop conditions — is unit-testable with fakes, no React / no
 * chrome.* / no network. App.tsx wires the real deps.
 *
 * COST GUARANTEE (R7.2): `deps.recordRound` is called EXACTLY ONCE per network
 * round the loop issues (each tool round + the final answer). So one chat
 * message can cost up to MAX_TOOL_ROUNDS + 1 requests, and every one of them is
 * counted against the 200/day budget — never silently burned.
 */

/** Hard cap on tool rounds before we force a final answer (R7.1). */
export const MAX_TOOL_ROUNDS = 2;

/** Process-only step events for the live trace (never answer content, R8-safe). */
export type AgentStep =
  | { kind: 'thinking' }
  | { kind: 'tool'; label: string }
  | { kind: 'answering' };

export interface ChatAgentDeps {
  /** One NON-STREAMING tool-call round. */
  runToolRound(messages: Array<Record<string, unknown>>): Promise<AssistantTurn>;
  /** Stream the FINAL answer (tool_choice:'none'); resolves when complete. */
  streamFinal(messages: Array<Record<string, unknown>>): Promise<string>;
  /** Run one allow-listed tool (zero-API). Returns a capped, FENCED string. */
  runTool(call: ToolCall): Promise<string>;
  /** Rate-limit pre-check before each network round (R7.3). */
  checkBudget(): Promise<{ allowed: boolean; reason?: string }>;
  /** Count ONE issued request (usage + metrics). One call per network round. */
  recordRound(usage?: { promptTokens: number; completionTokens: number }): Promise<void>;
  /** Optional live step trace (omittable; no-op in tests that don't need it). */
  onStep?(step: AgentStep): void;
  /** Human label for a tool name (for the step trace). */
  toolLabel(name: string): string;
}

export interface ChatAgentResult {
  /** The final, UNFILTERED assistant answer — the caller runs filterResponse. */
  answer: string;
  /** Tool rounds actually taken (0 = answered immediately). */
  roundsUsed: number;
  stoppedReason: 'answered' | 'cap' | 'budget';
}

/**
 * Run the bounded loop. `initialMessages` is the full OpenAI message array
 * (system + the single user turn carrying problem + code + digest + window +
 * question). We MUTATE a local copy as tool turns are appended.
 */
export async function runChatAgent(
  initialMessages: Array<Record<string, unknown>>,
  deps: ChatAgentDeps,
): Promise<ChatAgentResult> {
  const messages = [...initialMessages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    deps.onStep?.({ kind: 'thinking' });

    // Pre-check: if we can't afford this round, force a final answer from what
    // we have rather than start a round we can't finish (R7.3 / R9).
    const check = await deps.checkBudget();
    if (!check.allowed) {
      return finalize(messages, deps, 'budget');
    }

    const turn = await deps.runToolRound(messages);
    await deps.recordRound(turn.usage); // R7.2 — count THIS request

    // No tool calls → the model answered. This WAS the answer (ran
    // non-streaming); return it for the single filtered reveal in App.tsx.
    if (turn.toolCalls.length === 0) {
      return { answer: turn.content, roundsUsed: round, stoppedReason: 'answered' };
    }

    // Append the assistant's tool-call turn, then run each tool and append its
    // fenced result as a `tool` message (so the next round sees it).
    messages.push(assistantToolCallMessage(turn));
    for (const call of turn.toolCalls) {
      deps.onStep?.({ kind: 'tool', label: deps.toolLabel(call.name) });
      const result = await deps.runTool(call); // zero-API, capped, graceful, fenced
      messages.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
  }

  // Cap reached: the model still wants tools after MAX_TOOL_ROUNDS → force the
  // final answer with the data gathered so far (R7.1).
  return finalize(messages, deps, 'cap');
}

/**
 * Terminal step: stream the final answer (tool_choice:'none' is set by the
 * caller's streamFinal wiring so this call can't re-request tools), count it as
 * one request, and return. We don't know token usage from the streamed call
 * here (the caller's streamFinal may surface it via its own onUsage); the loop
 * records the request regardless so the budget stays honest.
 */
async function finalize(
  messages: Array<Record<string, unknown>>,
  deps: ChatAgentDeps,
  reason: 'cap' | 'budget',
): Promise<ChatAgentResult> {
  deps.onStep?.({ kind: 'answering' });
  const answer = await deps.streamFinal(messages);
  await deps.recordRound(); // R7.2 — the final answer is also one request
  return { answer, roundsUsed: MAX_TOOL_ROUNDS, stoppedReason: reason };
}

/** The assistant message that carries the model's tool_calls (OpenAI shape). */
function assistantToolCallMessage(turn: AssistantTurn): Record<string, unknown> {
  return {
    role: 'assistant',
    content: turn.content || null,
    tool_calls: turn.toolCalls.map((c) => ({
      id: c.id,
      type: 'function',
      function: { name: c.name, arguments: JSON.stringify(c.arguments ?? {}) },
    })),
  };
}
