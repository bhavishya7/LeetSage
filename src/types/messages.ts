/**
 * Chrome extension message passing schemas
 * 
 * Chrome extensions use message passing for communication between:
 * - Content scripts (running on LeetCode pages)
 * - Background service worker (event handler)
 * - Side panel UI (React app)
 * 
 * These types ensure type-safe message passing.
 */

import type { ActionType, ProblemContext, ProgressState } from './models';

/**
 * Base message structure
 * All messages have a type field to identify them
 */
export interface BaseMessage {
  type: string;
}

/**
 * Message sent from content script to background when problem data is extracted
 * 
 * Flow: Content Script → Background Worker → Chrome Storage
 */
export interface ProblemDataMessage extends BaseMessage {
  type: 'PROBLEM_DATA';
  payload: ProblemContext;
}

/**
 * Message sent from side panel to background to request problem data
 * 
 * Flow: Side Panel → Background Worker → Response with problem data
 */
export interface GetProblemDataMessage extends BaseMessage {
  type: 'GET_PROBLEM_DATA';
  payload: {
    /** URL of the problem to get data for */
    url: string;
  };
}

/**
 * Response from background to side panel with problem data
 */
export interface ProblemDataResponseMessage extends BaseMessage {
  type: 'PROBLEM_DATA_RESPONSE';
  payload: ProblemContext | null;
}

/**
 * Message sent from side panel to background to track an action
 * 
 * Flow: Side Panel → Background Worker → Chrome Storage
 */
export interface TrackActionMessage extends BaseMessage {
  type: 'TRACK_ACTION';
  payload: {
    /** Problem URL */
    problemUrl: string;
    
    /** Which action was taken */
    actionType: ActionType;
    
    /** When the action was taken */
    timestamp: number;
  };
}

/**
 * Message sent from side panel to background to get progress
 */
export interface GetProgressMessage extends BaseMessage {
  type: 'GET_PROGRESS';
  payload: {
    /** Problem URL to get progress for */
    problemUrl: string;
  };
}

/**
 * Response from background to side panel with progress data
 */
export interface ProgressResponseMessage extends BaseMessage {
  type: 'PROGRESS_RESPONSE';
  payload: ProgressState | null;
}

/**
 * Message sent from side panel to background to reset progress
 */
export interface ResetProgressMessage extends BaseMessage {
  type: 'RESET_PROGRESS';
  payload: {
    /** Problem URL to reset progress for */
    problemUrl: string;
  };
}

/**
 * Union type of all possible messages
 * Use this for message listeners to get proper type narrowing
 */
export type ExtensionMessage =
  | ProblemDataMessage
  | GetProblemDataMessage
  | ProblemDataResponseMessage
  | TrackActionMessage
  | GetProgressMessage
  | ProgressResponseMessage
  | ResetProgressMessage;

/**
 * Type guard to check if a message is a specific type
 * 
 * Usage:
 * ```typescript
 * chrome.runtime.onMessage.addListener((message) => {
 *   if (isProblemDataMessage(message)) {
 *     // TypeScript knows message.payload is ProblemContext
 *     console.log(message.payload.title);
 *   }
 * });
 * ```
 */
export function isProblemDataMessage(message: BaseMessage): message is ProblemDataMessage {
  return message.type === 'PROBLEM_DATA';
}

export function isGetProblemDataMessage(message: BaseMessage): message is GetProblemDataMessage {
  return message.type === 'GET_PROBLEM_DATA';
}

export function isProblemDataResponseMessage(message: BaseMessage): message is ProblemDataResponseMessage {
  return message.type === 'PROBLEM_DATA_RESPONSE';
}

export function isTrackActionMessage(message: BaseMessage): message is TrackActionMessage {
  return message.type === 'TRACK_ACTION';
}

export function isGetProgressMessage(message: BaseMessage): message is GetProgressMessage {
  return message.type === 'GET_PROGRESS';
}

export function isProgressResponseMessage(message: BaseMessage): message is ProgressResponseMessage {
  return message.type === 'PROGRESS_RESPONSE';
}

export function isResetProgressMessage(message: BaseMessage): message is ResetProgressMessage {
  return message.type === 'RESET_PROGRESS';
}
