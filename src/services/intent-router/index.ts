/**
 * Chat Intent Routing — public surface of the pure pipeline.
 * See .kiro/specs/leetsage-chat-intent-routing.
 *
 *   routeMessage(message, context) → RouterEffect
 *     = route(resolveOverlap(classify(message, context), context))
 *
 * classify / resolveOverlap / route are exported individually too, so each pure
 * stage can be unit-tested in isolation (R6.2). App.tsx consumes `routeMessage`
 * + `RouterEffect` and `INTENT_REGISTRY` (for discovery affordances).
 */
export type { IntentDef, RouterContext, Candidate, Decision } from './types';
export { INTENT_REGISTRY } from './registry';
export { classify } from './classify';
export { resolveOverlap } from './resolve';
export { route, routeMessage } from './route';
export type { RouterEffect } from './route';
