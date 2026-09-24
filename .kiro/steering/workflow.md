# LeetSage — Working Conventions

How to work on this project. These are the developer's standing preferences,
learned over the project's history.

## Starting a session (orient first)

When beginning work, read these to get current — don't rely on chat memory:
- `.kiro/specs/README.md` — what's shipped vs. designed vs. planned.
- `docs/career/DEV_JOURNAL.md` — the recent build story (most recent entries).
- `docs/career/LEARNING_ROADMAP.md` — what's next and why (in priority order).
- The specific spec under `.kiro/specs/` for the feature being built.

## Spec discipline (scale rigor to the feature, never skip silently)

This project showcases a spec-driven workflow, so the process itself matters — but
match the ceremony to the work, and **document any deviation** rather than letting
it drift.

- **Substantial or ambiguous feature** (new capability, non-trivial scope, unclear
  requirements): write the full trilogy under `.kiro/specs/<name>/`:
  - `requirements.md` — what must be true, as acceptance criteria (EARS-style
    "WHEN … THE SYSTEM SHALL …" is encouraged). **Get the user's sign-off on
    requirements before starting design.**
  - `design.md` — the how: architecture, decisions, alternatives considered.
  - `tasks.md` — the implementation breakdown, checked off as work completes.
  - **Pause for the user between phases** (requirements → design → tasks →
    implement); don't blow through all three unattended.
- **Small, well-understood change** (a fix, a tweak, mitigations already known):
  a single `design.md` is acceptable — but **state explicitly at the top why
  requirements/tasks were skipped** (e.g. "design-only: scope is small and
  requirements are self-evident"). Skipping is a documented decision, not silent
  drift.
- **When unsure which bucket applies, ask the user** rather than defaulting to the
  lighter path.
- Keep `.kiro/specs/README.md` accurate as specs are added or change status.

> Being able to say "I scaled process rigor to feature complexity and documented
> when I deviated" is a stronger interview answer than pretending every change got
> a full trilogy — but *undocumented* drift is the thing to avoid.

## Verify before you claim done

- **Always run the build (`npm.cmd run build`) and confirm it compiles** before
  saying a code change is complete. See `tech.md` for the build gotchas.
- Fix any errors surfaced by the build before presenting the result.
- Clean up any temp files created during verification.

## Explain and STOP for review before committing (hard rule)

This is a firm gate, not a preference:

- **Never run an autonomous build → commit → historian pass.** After building or
  changing anything non-trivial, **explain what was built (what/why/how) and STOP.
  Wait for the user's review before committing.** The user must be able to say
  "where did this come from?" and always know the answer *before* it lands in git.
- **The user triggers commits.** Do not commit on your own initiative because the
  work "looks done." Present it, then let the user decide.
- **Visual / UX changes** (layout, buttons, sizing, colors) additionally require
  the user to eyeball the built extension before committing — don't assume it
  looks right.
- The only things safe to do without pausing are read-only investigation and
  verification (builds, tests, git status). Anything that writes code or docs, or
  touches git, pauses for review first.

> This rule exists because an end-to-end autonomous run once produced good work
> the user never got to see or approve before it was committed. Visibility and
> control beat speed here.

## Git discipline

- **Detailed commit messages, always.** A summary line + a body explaining what
  changed and why. (Because the terminal wrapper can garble multi-line `-m`,
  writing the message to a temp file and using `git commit -F` is reliable; delete
  the temp file after.)
- **Commit and push are the user's calls to trigger** — don't push (or merge)
  without being asked. The user opens PRs themselves.
- Commit in **logical groups** (one concern per commit); stage specific files
  rather than `git add .`.
- Work on feature/`docs`-prefixed branches, not directly on `main`.

## Context engineering (session hygiene)

- Scope a session to roughly **one coherent unit of work / one spec**; start a
  fresh session for unrelated work.
- **Externalize durable knowledge into files** (specs, ADRs, the dev journal,
  these steering files) rather than relying on the conversation to remember it —
  context gets compacted and is lossy.
- Keep docs consistent with code and with each other; when they drift (e.g. a
  model-name mismatch), fix the drift rather than let two sources disagree.

## Documentation upkeep

- After a meaningful change, the **project-historian** agent
  (`.kiro/agents/project-historian.md`) updates `docs/career/` — run it on demand
  and review its drafts before committing.
- Never fabricate facts, numbers, or history in docs; verify against code/commits.
- **Capture workflow / AI-usage lessons at session end, not just code changes.**
  Insights about *how* the work was done — context management, agent behavior,
  tooling decisions, a debugging discipline — are prime interview material and are
  the easiest thing to lose (they live in conversation, not in diffs). They belong
  in `INTERVIEW_PREP.md` as Q&A (and a dated `DEV_JOURNAL.md` note when tied to a
  specific event). The historian captures these too — but only if the handoff
  below carries them.

## Session-end handoff (emit this at the end of a working session)

At the end of a session, produce a **handoff block** in the shape below. Its
purpose is to carry context across the session boundary to the project-historian
(which cannot see this conversation). The user pastes this block into the
historian's chat; the historian turns it into doc updates for review. Always
include every section — if a section is empty, say "none" (especially the lesson
one, so it's never silently dropped).

```
### Session Handoff

**What changed** (features/fixes, with commit hashes if committed):
- …

**Why** (motivation / key decisions made and the reasoning):
- …

**Workflow / AI-usage lesson learned** (how we worked; interview-worthy meta —
"none" if truly nothing):
- …

**Designed but NOT built** (so docs don't overstate):
- …

**Docs to update**: DEV_JOURNAL / RESUME / INTERVIEW_PREP / LEARNING_ROADMAP /
specs index — whichever apply.
```

The loop: session ends → emit this handoff → paste into the historian → historian
drafts doc updates → review → commit. Keep it a habit; it's what stops
conversational insight from evaporating.

### Handoff-authoring rule (for the GM / whoever writes a handoff for a build session)

A handoff that kicks off a *build* session must **not** authorize an end-to-end
autonomous pass. It must instruct the receiving session to follow the
"Explain and STOP for review before committing" rule above — i.e. build, explain
what was done, and **pause for the user to review before committing**, and to
seek sign-off between spec phases for substantial features. Never write a handoff
that says "build → commit → run the historian" as one unattended flow. Structure
build handoffs as: orient → (spec if substantial, with sign-off) → implement →
**explain and stop** → (commit + historian only after the user approves).
