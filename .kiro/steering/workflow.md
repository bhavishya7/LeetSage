# LeetSage — Working Conventions

How to work on this project. These are the developer's standing preferences,
learned over the project's history.

## Starting a session (orient first)

When beginning work, read these to get current — don't rely on chat memory:
- `.kiro/specs/README.md` — what's shipped vs. designed vs. planned.
- `docs/career/DEV_JOURNAL.md` — the recent build story (most recent entries).
- `docs/career/LEARNING_ROADMAP.md` — what's next and why (in priority order).
- The specific spec under `.kiro/specs/` for the feature being built.

## Verify before you claim done

- **Always run the build (`npm.cmd run build`) and confirm it compiles** before
  saying a code change is complete. See `tech.md` for the build gotchas.
- Fix any errors surfaced by the build before presenting the result.
- Clean up any temp files created during verification.

## Get UI/UX changes reviewed before committing

- For **visual or UX changes** (layout, buttons, sizing, colors), explain what
  changed and **wait for the user to eyeball it before committing.** Don't commit
  a UI tweak on the assumption it looks right — the user reloads the extension to
  verify.
- More broadly: explain new or non-trivial work (features, agents, design choices)
  and let the user decide before committing.

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
