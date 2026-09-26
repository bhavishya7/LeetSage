import type { ActionType } from '../../types';
import type { Decision, RouterContext } from './types';
import { isSolutionExemptAction } from '../solution-filter';
import { classify } from './classify';
import { resolveOverlap } from './resolve';

/**
 * route(decision) — the guardrail-aware dispatch layer (R3, R4, R7, design §6).
 *
 * This stays PURE by returning an EFFECT DESCRIPTOR rather than calling the App
 * handlers itself. App.tsx interprets the effect: `dispatch` → handleActionClick
 * (identical to a button press, R7); `confirm` → render the confirm affordance;
 * `chat` → the existing free-form chat path. Keeping route() pure means the
 * whole classify → resolve → route pipeline is testable end-to-end against the
 * golden set without mocking React.
 *
 * THE GUARDRAIL (R3, design §6): a filter-EXEMPT action is NEVER dispatched
 * silently. Exemptness is DERIVED from `isSolutionExemptAction(target)` — the
 * same predicate the filter and the pre-display gate use — so a future exempt
 * action automatically inherits the confirm requirement (R3.4). An exempt
 * `route` and any `ask` both become a `confirm` effect.
 */

export type RouterEffect =
  /** Fire the action now, exactly like the user pressed its button (R7). */
  | { kind: 'dispatch'; action: ActionType }
  /**
   * Surface the confirm affordance: "Did you want X? — [Yes] / [Just answer]".
   * Yes → dispatch(action); Just answer → chat. Serves BOTH the exempt-action
   * guardrail and the borderline `ask` outcome (design §6, one affordance).
   */
  | { kind: 'confirm'; action: ActionType; reason: 'exempt' | 'borderline' }
  /** Fall through to the existing free-form chat path, unchanged. */
  | { kind: 'chat' };

export function route(decision: Decision): RouterEffect {
  switch (decision.kind) {
    case 'chat':
      return { kind: 'chat' };

    case 'ask':
      // Borderline / ambiguous → always confirm, regardless of exemptness.
      return { kind: 'confirm', action: decision.action, reason: 'borderline' };

    case 'route':
      // Decisive winner. Exempt → confirm (never silent, R3.1/R3.2). Non-exempt
      // → dispatch directly; it still passes through filterResponse + the
      // pre-display gate downstream (R3.3).
      return isSolutionExemptAction(decision.action)
        ? { kind: 'confirm', action: decision.action, reason: 'exempt' }
        : { kind: 'dispatch', action: decision.action };
  }
}

/**
 * The full pure pipeline in one call: message + context → effect. This is the
 * single entry point App.tsx uses as a pre-step, and the single thing the
 * golden-set test drives (message → effect ≈ route:<action> | ask | chat).
 */
export function routeMessage(message: string, context: RouterContext): RouterEffect {
  return route(resolveOverlap(classify(message, context), context));
}
