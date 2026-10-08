/**
 * OFFLINE entry for the CORRECTNESS suite — deterministic notation-match only.
 * See safety-cases.offline.ts for why this is a separate file (sandbox + cache
 * make a load-time env flag unreliable). The offline config references this so
 * the correctness check runs its deterministic O(...) equivalence assertion with
 * the LLM-as-judge omitted.
 */
import { buildCorrectnessCases } from './correctness-cases';

export default function () {
  return buildCorrectnessCases(false);
}
