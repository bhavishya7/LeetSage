/**
 * Core data models for LeetSage AI Learning Assistant
 * 
 * These types define the structure of data flowing through the extension:
 * - ProblemContext: Data extracted from LeetCode pages
 * - LearningContent: AI-generated learning aids displayed to users
 * - ProgressState: Tracks which learning aids a user has used per problem
 */

/**
 * Represents a LeetCode problem extracted from the page DOM
 */
export interface ProblemContext {
  /** Problem title (e.g., "1. Two Sum") */
  title: string;
  
  /** Full URL of the problem page */
  url: string;
  
  /** Problem difficulty level */
  difficulty: 'Easy' | 'Medium' | 'Hard';
  
  /** Full problem description text */
  description: string;
  
  /** Example inputs/outputs provided in the problem */
  examples: Example[];
  
  /** Problem constraints (e.g., "1 <= nums.length <= 10^4") */
  constraints: string[];
  
  /** Test cases with expected outputs */
  testCases: TestCase[];
  
  /** Timestamp when this context was extracted (milliseconds since epoch) */
  extractedAt: number;
}

/**
 * An example input/output pair from the problem description
 */
export interface Example {
  /** Example input (e.g., "nums = [2,7,11,15], target = 9") */
  input: string;
  
  /** Expected output (e.g., "[0,1]") */
  output: string;
  
  /** Optional explanation of why this output is correct */
  explanation?: string;
}

/**
 * A test case with input and expected output
 */
export interface TestCase {
  /** Test input */
  input: string;
  
  /** Expected output for this input */
  expectedOutput: string;
}

/**
 * Types of actions users can take to get learning help
 * Each action triggers a different type of AI-generated content
 */
export type ActionType =
  | 'GET_HINT'                  // Progressive hints (3 levels)
  | 'GENERATE_EXAMPLES'         // Alternative test cases
  | 'BREAK_DOWN_PROBLEM'        // Decompose into sub-problems
  | 'EXPLAIN_CONCEPT'           // Explain relevant algorithms/data structures
  | 'CHECK_APPROACH'            // Review user's proposed approach
  | 'TIME_COMPLEXITY_HINT'      // Hint about optimal time complexity
  | 'PATTERN_RECOGNITION';      // Identify algorithmic patterns

/**
 * Types of learning content that can be displayed
 */
export type ContentType =
  | 'HINT'              // Progressive hint
  | 'EXAMPLES'          // Generated examples
  | 'BREAKDOWN'         // Problem breakdown
  | 'EXPLANATION'       // Concept explanation
  | 'FEEDBACK'          // Approach feedback
  | 'CHAT_MESSAGE';     // Free-form chat message

/**
 * AI-generated learning content displayed to the user
 */
export interface LearningContent {
  /** Unique identifier for this content piece */
  id: string;
  
  /** Type of content (determines visual styling) */
  type: ContentType;
  
  /** Which action button generated this content */
  actionType: ActionType;
  
  /** The actual content (markdown-formatted text) */
  content: string;
  
  /** When this content was generated (milliseconds since epoch) */
  timestamp: number;
  
  /** Whether this content card is currently expanded in the UI */
  expanded: boolean;
  
  /** Additional metadata specific to the content type */
  metadata?: ContentMetadata;
}

/**
 * Additional metadata for specific content types
 */
export interface ContentMetadata {
  /** For HINT type: which hint level (1, 2, or 3) */
  hintLevel?: number;
  
  /** For EXAMPLES type: complexity indicator */
  exampleComplexity?: 'Simple' | 'Medium' | 'Tricky';
  
  /** For BREAKDOWN type: list of sub-problems */
  subProblems?: SubProblem[];
}

/**
 * A sub-problem from problem breakdown
 */
export interface SubProblem {
  /** Unique identifier */
  id: string;
  
  /** Sub-problem title */
  title: string;
  
  /** Detailed description */
  description: string;
  
  /** Relevant concepts (e.g., "hash map", "two pointers") */
  relevantConcepts: string[];
  
  /** Suggested data structures or algorithms */
  suggestedDataStructures: string[];
  
  /** Whether this sub-problem is expanded in the UI */
  expanded: boolean;
}

/**
 * Tracks user's progress on a specific problem
 * Stored per problem URL in Chrome storage
 */
export interface ProgressState {
  /** Problem URL this progress is for */
  problemUrl: string;
  
  /** Set of action types the user has clicked */
  usedActions: Set<ActionType>;
  
  /** Current hint level (0-3, where 0 means no hints used yet) */
  hintLevel: number;
  
  /** History of all learning content generated for this problem */
  contentHistory: LearningContent[];
  
  /** Last time this progress was updated (milliseconds since epoch) */
  lastUpdated: number;
}

/**
 * Generated example with complexity indicator
 */
export interface GeneratedExample {
  /** Example input */
  input: string;
  
  /** Expected output */
  output: string;
  
  /** Complexity level of this example */
  complexity: 'Simple' | 'Medium' | 'Tricky';
  
  /** Explanation of what this example teaches */
  explanation: string;
  
  /** Type of edge case this covers (optional) */
  edgeCaseType?: string;
}

/**
 * Result of example generation with comparison data
 */
export interface GeneratedExamples {
  /** Array of generated examples */
  examples: GeneratedExample[];
  
  /** Data for side-by-side comparison view */
  comparisonView: ComparisonData;
}

/**
 * Data for comparing original and generated examples
 */
export interface ComparisonData {
  /** Original examples from the problem */
  originalExamples: Example[];
  
  /** Newly generated examples */
  generatedExamples: GeneratedExample[];
  
  /** Analysis of what coverage the new examples add */
  coverageAnalysis: string;
}

/**
 * Result of problem breakdown
 */
export interface ProblemBreakdown {
  /** List of sub-problems */
  subProblems: SubProblem[];
  
  /** How to visualize (checklist or flowchart) */
  visualizationType: 'checklist' | 'flowchart';
  
  /** Overall strategy description */
  overallStrategy: string;
}

/**
 * A hint with level information
 */
export interface Hint {
  /** Hint level (1, 2, or 3) */
  level: number;
  
  /** Hint title (e.g., "Hint 1: Conceptual Approach") */
  title: string;
  
  /** Hint content (markdown-formatted) */
  content: string;
  
  /** Whether this is the last available hint */
  isLastHint: boolean;
}

/**
 * Suggestion from the stuck timer
 */
export interface StuckSuggestion {
  /** Suggestion message to display */
  message: string;
  
  /** Which action to suggest */
  suggestedAction: ActionType;
  
  /** Whether user can dismiss this suggestion */
  canDismiss: boolean;
}

/**
 * Action button configuration
 */
export interface ActionButton {
  /** Action type this button triggers */
  type: ActionType;
  
  /** Button label text */
  label: string;
  
  /** Icon name or emoji */
  icon: string;
  
  /** Description shown on hover */
  description: string;
  
  /** Whether this action has been used */
  used: boolean;
}
