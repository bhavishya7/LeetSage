# E10 Correctness Dataset — Seed (captured cases)

> Raw seed material for the E10 **correctness** dataset (R4). These are REAL
> observed cases (`source: 'captured'`) — the honest kind that avoids the
> authored-dataset optimism bias. The E10 build session turns these into the
> structured correctness-case format (schema is a build-session decision — see
> spec §7), wires them into Promptfoo, and labels ground truth for user confirmation.
>
> **Honesty rule:** only fully-grounded cases are filled in. Fragments I did NOT
> have verbatim are marked `TODO` with exactly what's missing — NOTHING is
> fabricated. The user will supply the missing pieces (from the E6 session or by
> re-capturing) in the E10 build session.
>
> **What a complete case needs:** problem (name/URL), the user's code, what the
> extension REPORTED (current + optimal), and the KNOWN-CORRECT answer (ground
> truth). Minimum to be usable: problem + code + reported + correct.

---

## Case 1 — Encode and Decode Strings  ✅ FULLY GROUNDED (ready to use)

- **Problem:** Encode and Decode Strings (LeetCode #271, Medium).
- **Source:** captured — dogfooded this session; code pasted by the user, reported
  value and correct value both verified in-conversation (2026-10-05).
- **User's code (Python):**
  ```python
  class Codec:
      def encode(self, strs: List[str]) -> str:
          """Encodes a list of strings to a single string."""
          start = 0
          delim = chr(start)
          combined_strs = "".join(strs)
          while delim in combined_strs:
              start += 1
              delim = chr(start)
          ret_str = ""
          for s in strs:
              ret_str += str(len(s)) + delim + s
          return delim + ret_str

      def decode(self, s: str) -> List[str]:
          """Decodes a single string to a list of strings."""
          delim = s[0]
          decoded = []
          word = ""
          i = 1
          word_len = ""
          while i < len(s):
              if s[i] == delim:
                  decoded.append(s[i + 1: i + int(word_len) + 1])
                  i = i + int(word_len) + 1
                  word_len = ""
              else:
                  word_len += s[i]
                  i += 1
          return decoded
  ```
- **What the extension REPORTED:** Current `O(N)`, Optimal `O(N)` (bare `N`, undefined).
  (On repeated runs it flip-flopped between `O(N)` and `O(N·M)` — the drift that B10
  targets.)
- **KNOWN-CORRECT ground truth:** `O(N·M)` time, `O(N·M)` space, where **N = number
  of strings** and **M = average string length** (total input = N·M). The user's
  length-prefix + dynamic-delimiter approach IS optimal (can't beat reading every
  character). Accepted equivalents for the match check: `O(N·M)` ≡ `O(N*M)` ≡ `O(NM)`
  ≡ "O(N) where N = total number of characters". A bare undefined `O(N)` is WRONG
  (fails the R4 "define your variables" rule).
- **What this case tests:** correctness of the reported complexity (reported O(N) vs
  correct O(N·M)); the no-bare-symbol rule (R4); and that the coach doesn't suggest
  the approach the user already uses.

---

## Case 2 — Longest Consecutive Sequence  ⚠️ PARTIAL (need code)

- **Problem:** Longest Consecutive Sequence (LeetCode; the B18 case, 2026-10-06).
- **KNOWN-CORRECT ground truth:** `O(N)` time (the classic hash-set approach — the
  inner `while` only advances on sequence STARTS, so it's amortized O(N), NOT O(N²)
  despite the nested loop). This is exactly the subtlety the user's question probed.
- **What the extension did:** this was primarily a **ROUTING** failure (B18) — the
  follow-up "how is it O(N) when the inner while loop can run N times?" misrouted to
  the generic `TIME_COMPLEXITY_HINT` action instead of a grounded chat answer. The
  Complexity Hint card it produced was itself correct (Target O(N)/O(N)). So this is
  a WEAKER correctness-dataset case — the complexity wasn't wrong, the action was.
- **TODO (user to supply in E10 session):** the user's ACTUAL CODE for this problem
  (not captured in this session), and the exact reported-complexity text, IF they
  want it as a correctness case. Otherwise it's better tracked as a routing case for
  the B18 fix, not the complexity eval.

---

## Case 3 — Headline-vs-breakdown contradiction (B16)  ⚠️ FRAGMENT ONLY (need problem + code)

- **Observed shape:** within ONE "Analyze my code" response, the `**Current:**`
  headline read `O(N*M + C)` while the per-operation breakdown bullet correctly said
  `O(C*N*M)` — the headline contradicted its own breakdown.
- **TODO (user / E6 session to supply):** WHICH problem produced this, the user's
  CODE, and the full reported text. These details lived in the E6 build session, not
  this one — I do not have them and will not invent them. The build session that
  logged B16 (E6 batch 1, commit `034f2ce`) is the source; ask it to produce the
  problem + code + verbatim response.
- **What it would test (once grounded):** intra-message consistency (headline ==
  aggregate of the breakdown) AND whether the aggregate is objectively correct.

---

## What to ask the E6 session for (to complete the seed)

> The user can paste this request to the E6 session:
> "For the B16 headline-vs-breakdown case and the Longest Consecutive Sequence B18
> case: give me (a) the exact problem, (b) my code, (c) the verbatim complexity text
> the extension reported, and (d) the correct answer if known — so I can seed the
> E10 correctness dataset."

Once those arrive, Cases 2 and 3 become fully-grounded captured cases alongside
Case 1. More captured cases (a spread of easy/medium/hard, different patterns) get
added over time in the E10 session via the painless paste process (spec §4).
