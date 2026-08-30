# LeetSage — Language Cheatsheet Section (PLANNED / IDEA)

> Status: **Idea, documented for soon-ish implementation.** Not started.

## Purpose

A built-in reference section where the user can quickly look up language tricks
and common operations useful for LeetCode — Python first, then Java, C++. Plus
a Big-O reference chart. Saves the user from tabbing out to external cheatsheets
mid-problem.

Inspiration / reference material the user uses today:
- Python cheat sheets (e.g. LeetCode discuss Python cheat sheet, NeetCode's
  "Python for coding interviews")
- Big-O charts (e.g. common data-structure/algorithm complexity tables)

## KEY CONSTRAINT: zero tokens

This must NOT call the LLM. The content is **static, bundled directly in the
extension** (a local data file / JSON / markdown shipped with the build). No
API usage at all — it's a reference lookup, not an AI feature.

## Scope

- A cheatsheet panel/tab in the side panel (separate from the coaching flow).
- Language sections: Python (first), then Java, C++.
  - Common operations: list/array ops, dict/map, set, string manipulation,
    sorting with keys, heapq/priority queue, deque, itertools tricks, etc.
  - The "handy tricks for LeetCode" that the reference sheets cover.
- A Big-O reference: common data structures + operations, and a growth-rate
  chart (O(1) → O(n!)) for quick mental reference.
- Searchable/filterable would be nice but is optional for v1.

## Content sourcing / licensing note

- Author the cheatsheet content ourselves (paraphrased, our own examples) to
  avoid copying copyrighted cheat sheets verbatim. Use the external references
  only as a guide for WHAT to include, not to copy text.

## Open questions

- Format of the bundled data: markdown files rendered in-panel, or structured
  JSON we render? Markdown is simplest to author and render (we already have a
  markdown-ish renderer).
- How to surface it: a tab/toggle in the header, or an entry in the action bar?
- Keep it collapsed by default so it doesn't clutter the coaching UI.

## Notes

- Since it's static + local, it's low-risk and genuinely useful. Good candidate
  to do early since it needs no LLM plumbing.
