/**
 * Core data models for LeetSage AI Learning Assistant
 */

export interface ProblemContext {
  title: string;
  url: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  description: string;
  examples: Example[];
  constraints: string[];
  testCases: TestCase[];
  extractedAt: number;
}

export interface Example {
  input: string;
  output: string;
  explanation?: string;
}

export interface TestCase {
  input: string;
  expectedOutput: string;
}

export type ActionType =
  | 'GET_HINT'
  | 'GENERATE_EXAMPLES'
  | 'BREAK_DOWN_PROBLEM'
  | 'EXPLAIN_CONCEPT'
  | 'CHECK_APPROACH'
  | 'TIME_COMPLEXITY_HINT'
  | 'PATTERN_RECOGNITION'
  | 'UNDERSTAND_SOLUTION'
  | 'GENERATE_REPORT';

export type ContentType =
  | 'HINT'
  | 'EXAMPLES'
  | 'BREAKDOWN'
  | 'EXPLANATION'
  | 'FEEDBACK'
  | 'CHAT_MESSAGE';

export interface LearningContent {
  id: string;
  type: ContentType;
  actionType: ActionType;
  content: string;
  timestamp: number;
  expanded: boolean;
  metadata?: ContentMetadata;
}

export interface ContentMetadata {
  hintLevel?: number;
  exampleComplexity?: 'Simple' | 'Medium' | 'Tricky';
  subProblems?: SubProblem[];
  /** True when this entry is the user's own free-form question (chat bubble). */
  isUserQuery?: boolean;
  /**
   * The machine-readable `data` block extracted from a structured action's
   * response (see StructuredResponse). Only present for actions that emit one
   * (currently CHECK_APPROACH → AnalyzeData, UNDERSTAND_SOLUTION →
   * UnderstandData). Downstream consumers — the report digest, progress
   * records, analytics, evals — read THIS, never the prose. Absent when the
   * model returned no/invalid data block (prose-only fallback).
   */
  structured?: StructuredData;
}

/**
 * Structured-output contract (see .kiro/specs/leetsage-structured-output).
 *
 * Each structured action returns BOTH a human-readable `prose` rendering and a
 * small, schema-conforming `data` object. The prose is what the user reads
 * (unchanged UX); the `data` is the single source of truth other code consumes
 * instead of re-parsing prose. The `data` block is authoritative — prose must
 * match it, not the other way around.
 */
export interface StructuredResponse<T> {
  /** The Markdown the user sees, rendered as today. */
  prose: string;
  /** Machine-readable facts for the report / records / analytics / evals. */
  data: T;
}

/** Time + space complexity as plain-text Big-O strings, e.g. "O(N)"/"O(1)". */
export interface Complexity {
  time: string;
  space: string;
}

/**
 * Fixed algorithmic-pattern vocabulary. A closed set keeps analytics and
 * "weakest link" grouping reliable (free-text pattern names don't group). Kept
 * in sync with the progress-tracking design; extend deliberately, not ad hoc.
 */
export type ProblemPattern =
  | 'Hash Map'
  | 'Two Pointers'
  | 'Sliding Window'
  | 'Binary Search'
  | 'BFS'
  | 'DFS'
  | 'Backtracking'
  | 'Dynamic Programming'
  | 'Greedy'
  | 'Stack'
  | 'Queue'
  | 'Heap'
  | 'Linked List'
  | 'Tree'
  | 'Graph'
  | 'Sorting'
  | 'Prefix Sum'
  | 'Bit Manipulation'
  | 'Math'
  | 'Recursion'
  | 'Union Find'
  | 'Trie'
  | 'Other';

/** Structured `data` for CHECK_APPROACH (Analyze my code). */
export interface AnalyzeData {
  /** Short description of the approach detected, e.g. "brute-force nested loop". */
  approachDetected: string;
  currentComplexity: Complexity;
  optimalComplexity: Complexity;
  /** Style / correctness-risk notes surfaced in the analysis. */
  issues: string[];
  /** Whether their current approach is heading toward the optimal one. */
  onOptimalPath: boolean;
}

/** Structured `data` for UNDERSTAND_SOLUTION (optimal-solution explanation). */
export interface UnderstandData {
  patterns: ProblemPattern[];
  /** The single "aha" observation that makes the optimal solution work. */
  keyInsight: string;
  optimalComplexity: Complexity;
}

/** Union of every action's structured `data` shape. */
export type StructuredData = AnalyzeData | UnderstandData;

export interface SubProblem {
  id: string;
  title: string;
  description: string;
  relevantConcepts: string[];
  suggestedDataStructures: string[];
  expanded: boolean;
}

export interface ProgressState {
  problemUrl: string;
  usedActions: Set<ActionType>;
  hintLevel: number;
  contentHistory: LearningContent[];
  lastUpdated: number;
}

export interface GeneratedExample {
  input: string;
  output: string;
  complexity: 'Simple' | 'Medium' | 'Tricky';
  explanation: string;
  edgeCaseType?: string;
}

export interface GeneratedExamples {
  examples: GeneratedExample[];
  comparisonView: ComparisonData;
}

export interface ComparisonData {
  originalExamples: Example[];
  generatedExamples: GeneratedExample[];
  coverageAnalysis: string;
}

export interface ProblemBreakdown {
  subProblems: SubProblem[];
  visualizationType: 'checklist' | 'flowchart';
  overallStrategy: string;
}

export interface Hint {
  level: number;
  title: string;
  content: string;
  isLastHint: boolean;
}

export interface StuckSuggestion {
  message: string;
  suggestedAction: ActionType;
  canDismiss: boolean;
}

export interface ActionButton {
  type: ActionType;
  label: string;
  icon: string;
  description: string;
  used: boolean;
}
