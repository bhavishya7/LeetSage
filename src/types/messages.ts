import type { ActionType, ProblemContext, ProgressState } from './models';

export interface BaseMessage { type: string; }

export interface ProblemDataMessage extends BaseMessage {
  type: 'PROBLEM_DATA';
  payload: ProblemContext;
}

export interface GetProblemDataMessage extends BaseMessage {
  type: 'GET_PROBLEM_DATA';
  payload: { url: string };
}

export interface ProblemDataResponseMessage extends BaseMessage {
  type: 'PROBLEM_DATA_RESPONSE';
  payload: ProblemContext | null;
}

export interface TrackActionMessage extends BaseMessage {
  type: 'TRACK_ACTION';
  payload: { problemUrl: string; actionType: ActionType; timestamp: number };
}

export interface GetProgressMessage extends BaseMessage {
  type: 'GET_PROGRESS';
  payload: { problemUrl: string };
}

export interface ProgressResponseMessage extends BaseMessage {
  type: 'PROGRESS_RESPONSE';
  payload: ProgressState | null;
}

export interface ResetProgressMessage extends BaseMessage {
  type: 'RESET_PROGRESS';
  payload: { problemUrl: string };
}

export type ExtensionMessage =
  | ProblemDataMessage
  | GetProblemDataMessage
  | ProblemDataResponseMessage
  | TrackActionMessage
  | GetProgressMessage
  | ProgressResponseMessage
  | ResetProgressMessage;

export function isProblemDataMessage(msg: BaseMessage): msg is ProblemDataMessage { return msg.type === 'PROBLEM_DATA'; }
export function isGetProblemDataMessage(msg: BaseMessage): msg is GetProblemDataMessage { return msg.type === 'GET_PROBLEM_DATA'; }
export function isProblemDataResponseMessage(msg: BaseMessage): msg is ProblemDataResponseMessage { return msg.type === 'PROBLEM_DATA_RESPONSE'; }
export function isTrackActionMessage(msg: BaseMessage): msg is TrackActionMessage { return msg.type === 'TRACK_ACTION'; }
export function isGetProgressMessage(msg: BaseMessage): msg is GetProgressMessage { return msg.type === 'GET_PROGRESS'; }
export function isProgressResponseMessage(msg: BaseMessage): msg is ProgressResponseMessage { return msg.type === 'PROGRESS_RESPONSE'; }
export function isResetProgressMessage(msg: BaseMessage): msg is ResetProgressMessage { return msg.type === 'RESET_PROGRESS'; }
