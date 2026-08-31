# LeetSage — Pseudocode Playground Mode (PLANNED / IDEA)

> Status: **Idea, documented for soon-ish implementation.** Not started.

## Purpose

A lightweight "playground" where the user types out their **plan / pseudocode**
for solving a problem — their thoughts on the approach before writing real code
— and can ask the AI to react to it. It reinforces the "think first" learning
philosophy: articulate your plan, get coached on it.

## Scope (deliberately minimal)

The user was explicit: keep it simple, a playground, NOT feature-rich. The main
concern is **not burning tokens** here. So:

- A dedicated text area where the user writes pseudocode / their solving plan.
- One primary action: **"Analyze pseudocode"** — the AI reviews their plan and
  says whether the approach is sound, what's missing, what to reconsider —
  WITHOUT writing the real solution (same no-solutions philosophy + solution
  filter applies).
- That's essentially it. No multi-turn, no extra bells.

## Token-conservation ideas (to decide at build time)

- Cap pseudocode analysis to a small max_tokens (smaller than normal actions).
- Possibly a tighter per-day sub-limit for this mode, or just let it share the
  existing guardrail counters.
- Keep the prompt lean.

## Open questions

- Is this a separate "mode"/tab in the side panel, or just another action that
  opens an input box (like the existing chat input)? Leaning toward: a toggle
  that swaps the bottom input into a bigger pseudocode textarea with its own
  "Analyze pseudocode" button.
- Should the pseudocode persist per-problem (like hints/history do now)?
- Reuse the existing CHECK_APPROACH-style flow, or a new PSEUDOCODE action type?

## Notes

- Builds naturally on existing pieces: the chat input, the streaming pipeline,
  the solution filter, and guardrails are all already in place.
