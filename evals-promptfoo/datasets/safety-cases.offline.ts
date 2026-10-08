/**
 * OFFLINE entry for the SAFETY suite — deterministic assertions only, no judge.
 *
 * Why a separate file instead of an env flag: Promptfoo loads `file://` test
 * modules in a sandbox that does NOT inherit the shell `process.env`, and it
 * caches generated test cases — so deciding "include the judge?" from an env
 * read at load time is unreliable (confirmed empirically). A thin per-mode entry
 * file is the robust alternative: the offline Promptfoo config points here, which
 * builds the SAME cases with the live LLM-as-judge omitted. The offline config
 * also has no grader provider, so this keeps the run fully deterministic/offline
 * (no hang/retry on a missing grader).
 */
import { buildSafetyCases } from './safety-cases';

export default function () {
  return buildSafetyCases(false);
}
