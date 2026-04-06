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
  | 'PATTERN_RECOGNITION';

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
}

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
