/**
 * Central export point for all TypeScript types
 * 
 * Import types like this:
 * ```typescript
 * import type { ProblemContext, ActionType, LLMRequest } from '@/types';
 * ```
 */

// Core data models
export type {
  ProblemContext,
  Example,
  TestCase,
  ActionType,
  ContentType,
  LearningContent,
  ContentMetadata,
  SubProblem,
  ProgressState,
  GeneratedExample,
  GeneratedExamples,
  ComparisonData,
  ProblemBreakdown,
  Hint,
  StuckSuggestion,
  ActionButton,
} from './models';

// API types
export type {
  LLMRequest,
  LLMResponse,
  APIConfig,
  UserSettings,
  FilterResult,
  ChatMessage,
} from './api';

// Message passing types
export type {
  BaseMessage,
  ProblemDataMessage,
  GetProblemDataMessage,
  ProblemDataResponseMessage,
  TrackActionMessage,
  GetProgressMessage,
  ProgressResponseMessage,
  ResetProgressMessage,
  ExtensionMessage,
} from './messages';

// Message type guards
export {
  isProblemDataMessage,
  isGetProblemDataMessage,
  isProblemDataResponseMessage,
  isTrackActionMessage,
  isGetProgressMessage,
  isProgressResponseMessage,
  isResetProgressMessage,
} from './messages';
