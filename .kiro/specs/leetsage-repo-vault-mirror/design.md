# LeetSage/LeetSmith — Private Vault → Public Mirror + Off-OneDrive Move

> **Design-only spec (documented deviation).** Per `.kiro/steering/workflow.md`
> → "Spec discipline": this is an **ops/architecture plan**, not a code feature.
> Requirements and tasks are folded into this single `design.md` because the
> scope is well-understood (git repo topology + a GitHub Action + a filesystem
> move) and the acceptance criteria are self-evident (listed in §6). This doc
> exists primarily so the plan **survives the session boundary** — it was written
> mid-conversation while the real-time focus shifted to debugging the live
> extension. **Nothing here is built yet.** It captures decisions reached in
> discussion so a later session can execute without re-deriving them.

**Status:** 📝 Planned — discussed, agreed in principle, **not implemented**.
**Date captured:** 2026-10-14.

---

## 1. Problem / motivation

Two intertwined problems surfaced post-launch (LeetSmith is published Unlisted on
the Chrome Web Store):

1. **OneDrive is actively corrupting the project.** It has, more than once,
   resurrected a file the user deleted (`public/images/LeetCode_logo_black.png`
   came back as an untracked orphan). The entire working tree lives under
   `C:\Users\bhavi\OneDrive\Desktop\Files\Projects\LeetSage`, so OneDrive's sync
   can mutate files underneath git at any time. This is the **root cause** and
   the urgent one.

2. **No single safe source of truth for the *whole* project.** The public GitHub
   repo (`bhavishya7/LeetSmith`) deliberately excludes a large body of
   gitignored material — `docs/`, `.kiro/specs/` (56 files), `.kiro/steering/`,
   `.kiro/settings/`, `logo/`, `Screenshots/`, `Project-Roadmap.docx`, `.env`.
   That material is only mirrored to an **external folder that itself lives
   inside OneDrive** (`..\LeetSage-personal-backup\`) via a manual `robocopy`.
   So the "backup" is (a) manual/stale-prone and (b) **on the same drive as the
   thing corrupting the project** — not actually isolated from the risk.

The user wants: everything (code + all docs/specs/assets) in a **private** repo
of truth, with a **public** repo auto-mirrored to show the world only the
public-facing files.

## 2. Goals / non-goals

**Goals**
- A private git repo is the single source of truth for **everything** (code,
  docs, all specs, steering, logo, screenshots, roadmap) — git history replaces
  the fragile OneDrive robocopy backup.
- A public repo shows only an **allowlisted** set of public-facing files.
- The project lives **outside OneDrive** on a plain local path.
- The live, already-published URLs **do not break**:
  - CWS listing homepage → `https://github.com/bhavishya7/LeetSmith`
  - CWS support → that repo's `/issues`
  - Privacy policy (GitHub Pages) → `https://bhavishya7.github.io/LeetSmith/PRIVACY`

**Non-goals**
- Not changing the extension code or the CWS listing itself.
- Not introducing a backend or any shipped/shared key (BYOK stays; ADR-001/003).
- Not publishing the audit methodology or accepted-risk list (the
  `leetsage-security-audit` spec stays gitignored even in the private vault, by
  the same reasoning that keeps it off the public repo today).

## 3. Decisions reached in discussion (the "why")

- **Allowlist, not denylist, for the mirror.** A file reaches the public repo
  **only if explicitly named**. A forgotten *new* sensitive file therefore
  cannot leak by default — the correct failure mode for a privacy-sensitive
  project. (Denylist mirroring was considered and rejected: a new sensitive file
  someone forgets to add to the denylist leaks.)
- **Keep the existing `bhavishya7/LeetSmith` as the PUBLIC mirror; create a NEW
  private vault repo.** This keeps the three live URLs valid with zero re-work
  (no CWS listing edit + re-review, no Pages re-wire). Recommended over renaming
  or swapping repos.
- **Clean / flattened public history** (force-pushed by the mirror Action) so no
  private intermediate commit messages or reverted mistakes become
  world-readable. (Authentic granular history was the alternative; rejected for a
  privacy-sensitive mirror.)
- **"Hidden branch in a public repo" was rejected** — branches in a public repo
  are themselves public, so it does not actually hide anything.
- **Move off OneDrive FIRST**, before wiring the vault/mirror. Building the new
  topology while OneDrive can still corrupt files mid-operation is building on
  sand. The mirror does **not** by itself fix the OneDrive problem.
- **`.env` stays gitignored even in the private vault.** The real API key is
  never in any git history, public or private — it is treated as reproducible
  (re-paste the key). It is also deliberately **excluded from the OneDrive
  robocopy backup**.

## 4. Target architecture

```
NEW private repo  (e.g. bhavishya7/LeetSmith-vault)   ← SOURCE OF TRUTH
    tracks EVERYTHING:
      src/ public/ build config, README, LICENSE, PRIVACY.md, .github/, .husky/
      docs/ (14)  .kiro/specs/ (56)  .kiro/steering/ (3)  .kiro/settings/
      logo/ (5)  Screenshots/ (12)  Project-Roadmap.docx
    still gitignored even here:  .env   (+ node_modules, dist, .vite as usual)
    [security-audit spec: keep gitignored by its own existing rule]
        │
        │  GitHub Action — on push to the vault's main branch:
        │    1. checkout private
        │    2. copy ONLY the allowlist into a clean tree
        │    3. force-push that tree to the public repo (clean/flat history)
        ▼
EXISTING public repo  (bhavishya7/LeetSmith)          ← GENERATED MIRROR
    contains only the allowlist (below). Preserves CWS + Pages URLs.
    GitHub Pages stays enabled; PRIVACY.md must be in the allowlist so the
    policy URL keeps resolving.
```

## 5. The public allowlist (proposed)

Only these reach the public mirror:

- `src/**`
- `public/**`
- `package.json`, `package-lock.json`
- `tsconfig*.json`, `vite.config.ts`, `eslint.config.js`
- `index.html`
- `README.md`
- `LICENSE`
- `PRIVACY.md`  ← **required** so GitHub Pages privacy-policy URL keeps resolving
- `.github/workflows/ci.yml`

Everything else (docs, specs, steering, settings, logo, screenshots, roadmap,
`.env`) stays private by omission.

> Open question for execution time: does the public README reference anything
> that currently lives only in a gitignored path? If so, either add that asset to
> the allowlist or adjust the README before first mirror.

## 6. Acceptance criteria (self-evident "requirements")

1. Project working tree lives on a non-OneDrive path; `git status` clean and
   `git remote -v` unchanged after the move; build (`npm.cmd run build`) + tests
   (`npm.cmd run test`) pass from the new location.
2. A private vault repo exists and tracks all the §4 "everything" material
   (verified: the 56 spec files, 14 docs, logo, screenshots, roadmap all show in
   `git ls-files`), with `.env` **absent** from `git ls-files` and from history.
3. The public repo contains **only** the §5 allowlist after a mirror run — no
   `docs/`, no `.kiro/specs/`, no `logo/`, no `Screenshots/`, no `.env`.
4. The three live URLs still resolve unchanged (CWS homepage, CWS support,
   `bhavishya7.github.io/LeetSmith/PRIVACY`).
5. A push to the vault's main triggers the Action and updates the public mirror
   automatically.

## 7. Execution order (when we build this — NOT yet)

Follows the "explain and STOP for review before committing" rule: each step
pauses for the user; nothing touches git or the filesystem move without go-ahead.

1. **Move off OneDrive first.** Copy/relocate the working tree to e.g.
   `C:\dev\LeetSmith` (git is the safety net). Re-verify `git status`,
   `git remote -v`, then `npm.cmd ci` → lint → test → build from the new path.
   Re-point the `..\LeetSage-personal-backup\` robocopy path (or retire it once
   the vault exists).
2. **Create the private vault repo**, add it as a remote, un-ignore the
   now-private-tracked material (docs/specs/steering/settings/logo/screenshots/
   roadmap) **except** `.env` and the security-audit spec, commit, push.
3. **Write the mirror GitHub Action** in the vault: checkout → copy allowlist →
   force-push to the public repo using a scoped PAT/deploy token stored as an
   Actions secret.
4. **Confirm Pages still serves `PRIVACY.md`** on the public mirror after the
   first mirrored push; verify all three live URLs.

## 8. Risks / honesty notes

- The current `..\LeetSage-personal-backup\` is **inside OneDrive** — it was
  re-mirrored and verified current on 2026-10-14 (56/56 specs, docs byte-current,
  settings + roadmap added; `.env` excluded by choice), but it is **not isolated
  from the corruption source**. It is a stopgap, not the fix. The vault is the fix.
- Force-pushing the public mirror means the public repo's history is disposable
  by design — anyone who forked/starred sees history rewrites. Acceptable for a
  generated mirror; worth a note in the public README.
- The mirror token is a credential with push rights to the public repo; it must
  be a **scoped** token stored only as an Actions secret, never committed.
```