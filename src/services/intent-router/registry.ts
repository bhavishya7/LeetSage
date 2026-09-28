import type { IntentDef } from './types';

/**
 * INTENT REGISTRY — intents as data (R6.1, design §2).
 *
 * One entry per routable intent. The classifier iterates this list; the
 * resolver orders by `weight` and context; the router derives exemptness from
 * `isSolutionExemptAction(target)`. Adding a future intent is adding one entry
 * here — no routing control-flow changes.
 *
 * WEIGHT convention (higher wins a tie):
 *   30  Solution-bearing / high-intent asks that must be unmistakable when hit
 *       (Understand solution, Analyze my code). These are the exempt actions —
 *       a match still goes through the confirm affordance (never silent).
 *   20  Specific, code-context-sharpened or clearly-scoped asks (Complexity,
 *       Hint, Report).
 *   10  Generic "help me understand the problem" asks (Break down, Examples,
 *       Pattern, Concept) — the widest patterns, so they lose ties to the more
 *       specific intents above.
 *
 * Patterns are cheap keyword/phrase signals, matched case-insensitively (the
 * classifier lowercases the message and uses the `i` flag defensively). They
 * are intentionally NOT exhaustive NLP — the `classify()` seam lets an LLM
 * classifier replace this later without touching call sites (R2.3, design §9).
 */
export const INTENT_REGISTRY: IntentDef[] = [
  // --- Solution-bearing / high-intent (exempt: confirm-to-route) -----------
  {
    id: 'understand-solution',
    target: 'UNDERSTAND_SOLUTION',
    weight: 30,
    patterns: [
      /\b(optimal|best|intended|canonical|ideal|model)\s+(solution|approach|answer)\b/,
      /\bexplain\s+the\s+(optimal\s+)?(solution|approach)\b/,
      /\b(understand|learn)\s+the\s+(optimal\s+)?(solution|approach)\b/,
      /\bhow\s+(do|does|would)\s+(i|you|the\s+optimal)\s+solve\b/,
      /\b(show|give|tell)\s+me\s+the\s+(full|complete|whole|entire|actual)\s+(solution|answer|code)\b/,
      /\bwhat.?s\s+the\s+(solution|answer)\b/,
      /\bjust\s+(give|show|tell)\s+me\s+the\s+(solution|answer|code)\b/,
      /\bsolve\s+(it|this)\s+for\s+me\b/,
      /\bwhy\s+(does|do)\s+(it|this|the\s+solution)\s+work\b/,
    ],
  },
  {
    id: 'analyze-code',
    target: 'CHECK_APPROACH',
    weight: 30,
    requiresCodeContext: true,
    patterns: [
      /\b(analyze|review|check|look\s+at|critique|evaluate)\s+(my|this|the)?\s*(code|approach|solution|attempt)\b/,
      /\bwhat.?s\s+wrong\s+with\s+my\s+(code|approach|solution)\b/,
      /\bis\s+my\s+(code|approach|solution)\s+(right|correct|good|optimal|efficient|ok|okay)\b/,
      /\bany\s+(bugs|issues|problems)\s+(in|with)\s+my\s+(code|solution)\b/,
      /\bfeedback\s+on\s+my\s+(code|approach|solution)\b/,
      /\bhow.?s\s+my\s+(code|approach|solution)\b/,
      // "the CURRENT complexity" / "complexity of my code" is a question about
      // THEIR work — when the editor has code (requiresCodeContext), this lets
      // Analyze compete with the generic Complexity intent so context-sharpening
      // in resolveOverlap picks Analyze (the seed-#1 case). Without code, this
      // pattern still matches but analyze-code can't win the context tiebreak.
      /\b(current|my\s+code.?s?)\s+(time\s+|space\s+)?complexity\b/,
      /\bcomplexity\s+of\s+my\s+(code|solution|approach)\b/,
    ],
  },

  // --- Specific, clearly-scoped (non-exempt: route directly) ---------------
  {
    id: 'analyze-complexity',
    target: 'TIME_COMPLEXITY_HINT',
    weight: 20,
    patterns: [
      /\b(time|space|runtime)\s+complexity\b/,
      /\bbig[\s-]?o\b/,
      /\bwhat.?s\s+the\s+complexity\b/,
      /\bhow\s+(fast|efficient|slow)\b/,
      /\bcomplexity\s+of\s+(this|the)\b/,
    ],
  },
  {
    id: 'get-hint',
    target: 'GET_HINT',
    weight: 20,
    patterns: [
      /\b(give|get|need|want)\s+(me\s+)?a\s+hint\b/,
      /\b(a\s+)?hint\b/,
      /\bi.?m\s+stuck\b/,
      /\b(nudge|point)\s+me\b/,
      /\bhelp\s+me\s+(get\s+)?(started|going|unstuck)\b/,
      /\bwhere\s+(do|should)\s+i\s+(start|begin)\b/,
    ],
  },
  {
    id: 'generate-report',
    target: 'GENERATE_REPORT',
    weight: 20,
    patterns: [
      /\b(generate|make|create|write|give\s+me)\s+(a\s+)?(study\s+)?(note|notes|report|summary|writeup)\b/,
      /\b(save|record)\s+(this|my)\s+(progress|attempt|solution|notes?)\b/,
      /\bstudy\s+notes?\b/,
      /\bprogress\s+report\b/,
    ],
  },

  // --- Generic "understand the problem" (non-exempt, widest patterns) ------
  {
    id: 'break-down-problem',
    target: 'BREAK_DOWN_PROBLEM',
    weight: 10,
    patterns: [
      /\bbreak\s+(it|this|the\s+problem)?\s*down\b/,
      /\b(break|split)\s+(down|into)\b/,
      /\b(step[\s-]?by[\s-]?step|steps?\s+to\s+solve)\b/,
      /\bdecompose\b/,
      /\bhow\s+(do|should)\s+i\s+approach\b/,
      /\bwhere\s+do\s+i\s+(even\s+)?begin\b/,
    ],
  },
  {
    id: 'generate-examples',
    target: 'GENERATE_EXAMPLES',
    weight: 10,
    patterns: [
      /\b(another|more|extra|additional|new)\s+examples?\b/,
      /\b(give|show|generate|make)\s+(me\s+)?(an?\s+)?examples?\b/,
      /\b(test\s+cases?|edge\s+cases?)\b/,
      /\bwalk\s+me\s+through\s+an?\s+example\b/,
    ],
  },
  {
    id: 'recognize-pattern',
    target: 'PATTERN_RECOGNITION',
    weight: 10,
    patterns: [
      /\bwhat\s+(pattern|patterns|technique|algorithm|kind\s+of\s+problem)\b/,
      /\b(which|what)\s+(data\s+structure|ds)\b/,
      /\bpattern\s+(is|does)\s+this\b/,
      /\bwhat\s+(type|category)\s+of\s+problem\b/,
      /\brecogni[sz]e\s+the\s+pattern\b/,
    ],
  },
  {
    id: 'explain-concept',
    target: 'EXPLAIN_CONCEPT',
    weight: 10,
    // Deliberately NARROW. EXPLAIN_CONCEPT explains the concept RELEVANT TO THIS
    // PROBLEM — it is not a catch-all for any "what is X / difference between X
    // and Y" trivia. Over-broad patterns here mis-routed general knowledge
    // questions that should just go to chat (the golden set caught this: "what's
    // the difference between a set and a dict?" must fall through to chat, not
    // fire the concept action). So we require an explicit "explain the concept /
    // teach me the concept" style ask.
    patterns: [
      /\bexplain\s+(the\s+)?(concept|idea|underlying\s+concept)\b/,
      /\bexplain\s+the\s+key\s+(concept|idea)\b/,
      /\bteach\s+me\s+the\s+(concept|idea)\b/,
      /\bhelp\s+me\s+understand\s+(the\s+)?(concept|idea)\b/,
      /\bwhat\s+concept\s+(do|should)\s+i\b/,
    ],
  },
];
