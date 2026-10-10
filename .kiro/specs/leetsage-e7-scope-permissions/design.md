# LeetSage — E7: Scope / Narrow Extension Permissions (least privilege)

> **Spec rigor — design-only, and why:** this is a small, fully-mapped,
> config-only change (edits to ONE file, `public/manifest.json`; no `.ts`/`.tsx`
> source changes). The surgical change list already exists — it was produced by
> the security audit (Sweep B) from a full trace of every `chrome.*` call. So a
> single design doc with the change set + execution order + breakage analysis is
> the right ceremony; requirements/tasks would be redundant. **The source of
> truth for the change list is the security-audit `findings.md` → "E7
> Permission-Narrowing Map" (§A–G).** This spec restates it as the executable plan
> and adds the live-test gating the user requires.
>
> **Status:** 📐 Designed, not built. The LAST pre-launch gate before E8 (deploy).
> Own branch `feature/e7-permissions` **created fresh from post-E5 `main`** (never
> an old branch — the branch-safety lesson).
>
> **User requirement (hard):** this is the final step and **nothing may break**.
> Therefore: document-first (this spec), change ONLY what's listed, in order, with
> a LIVE verification after each change, and STOP for review before committing.

---

## 1. Goal & motivation

Narrow the extension's permissions to least privilege before publishing. Today the
manifest over-requests: all-URLs host access, a full `tabs` permission, an unused
`contextMenus` permission, and a dev-only `localhost:5173` content-script match. A
Chrome Web Store reviewer (and a security-minded user) will see these; least
privilege is both a trust signal and a genuine attack-surface reduction. The whole
change is in `public/manifest.json`.

**Why E7 is deliberately LAST:** applying it requires removing + re-adding the
unpacked extension at `chrome://extensions`, which **wipes `chrome.storage.local`**
(the user's Gemini key + all progress records + metrics). The shipped
export/import feature is the mitigation. Doing E7 right before E8 pays that
storage-wipe cost exactly once.

---

## 2. Current manifest state (verified 2026-10-09)

`public/manifest.json`:
- `permissions`: `["scripting", "tabs", "sidePanel", "commands", "contextMenus", "storage"]`
- `host_permissions`: `["http://*/*", "https://*/*"]`  ← all URLs
- `content_scripts[0].matches`: `["https://leetcode.com/problems/*", "http://localhost:5173/"]`
- `content_security_policy.extension_pages`: `script-src 'self'; object-src 'self'; base-uri 'self'`  ← already tight, DO NOT touch

---

## 3. Code-usage trace (what actually uses each permission — verified against src/)

Verified by grep + reading `App.tsx` and `background/index.ts` this session:

- **`storage`** — `storage.ts`, `metrics-store.ts`, `complexity-pin.ts`,
  `progress-records.ts`, `App.tsx` (`chrome.storage.local.*`, `onChanged`). Core
  persistence. **KEEP.**
- **`scripting`** — `code-extractor.ts` (`executeScript`, MAIN-world editor read) +
  `App.tsx` (inject `content.js` fallback). **KEEP.**
- **`sidePanel`** — `background/index.ts` (`setOptions`/`setPanelBehavior`/`open`).
  The UI surface. **KEEP.**
- **`commands`** — `background/index.ts` (`chrome.commands.onCommand`). The
  `Ctrl+Shift+L` shortcut. **KEEP.**
- **`contextMenus`** — **ZERO usages** (grep of all `src/` → no matches, confirmed
  this session). **REMOVE (zero risk).**
- **`tabs`** — `App.tsx` ONLY, three distinct uses (see §5): `tabs.query` + read
  `tab.url`; `tabs.sendMessage`; `tabs.onActivated`/`onUpdated` sync listeners.
  **NARROW — empirically (the one subtle part).**
- **Background worker is NOT affected by E7:** it uses `sidePanel`, `commands`,
  `runtime.*`, `windows.*`, and `storage` (via services) — none of which E7
  changes. `chrome.windows.getCurrent` + `chrome.sidePanel.open` need no permission
  entry. Confirmed by reading `background/index.ts`.

---

## 4. The change set (ONLY these; nothing else in the manifest)

| # | Change | File | Risk | Source-code change? |
|---|--------|------|------|---------------------|
| 1 | Remove `"contextMenus"` from `permissions` | manifest | **ZERO** (unused) | None |
| 2 | Drop `"http://localhost:5173/"` from `content_scripts[0].matches` | manifest | **LOW** (dev-only origin) | None |
| 3 | Narrow `host_permissions` → `["https://leetcode.com/problems/*"]` | manifest | **MEDIUM** | None |
| 4 | Remove `"tabs"` from `permissions` — **ONLY IF the live sync test passes** | manifest | **EMPIRICAL** | None |

**No `.ts`/`.tsx` changes.** The app logic already works within the narrowed
permissions — crucially, narrowing the host permission to leetcode is what keeps
the `tab.url` reads working after `tabs` is dropped (see §5). This is a
manifest-only change.

> There is one subtlety worth noting about `commands`: the manifest has BOTH a
> top-level `"commands"` permission entry AND a `"commands": { open_side_panel }`
> block. The functional keyboard shortcut comes from the `commands` BLOCK +
> `chrome.commands.onCommand` (which the block enables). The audit listed
> `commands` as KEEP; we keep BOTH the permission entry and the block untouched to
> avoid any shortcut regression. **Do NOT remove `commands` in E7.**

---

## 5. The `tabs` ↔ `host_permissions` interaction (the ONE place care is required)

`App.tsx` uses `tabs` for three things, each with a different narrowing answer.
This is why a naive "`tabs` → `activeTab`" swap is WRONG and we do NOT use
`activeTab` at all:

1. **`chrome.tabs.query({active,currentWindow})` + read `tab.url`** (lines ~34, ~121)
   — reads `tab.url` only to check `.includes('leetcode.com/problems/')`. `tab.url`
   is readable with `tabs` **OR** a host permission matching that URL. Once
   `host_permissions` includes `https://leetcode.com/problems/*`, LeetCode-tab
   `tab.url` is readable **without** `tabs`. ✅ covered by the host narrowing.
2. **`chrome.tabs.sendMessage(tabId, …)`** (line ~126) — needs host access to that
   tab, granted by the narrowed `leetcode.com/problems/*` host permission. ✅
   covered.
3. **`chrome.tabs.onActivated` / `chrome.tabs.onUpdated`** (lines ~168–169) — the
   "auto-refresh when the user switches tabs / navigates to another problem"
   listeners. `onUpdated`'s handler reads `tab.url` (via `pullFromActiveTab` →
   `tabs.query`). **`activeTab` does NOT grant these tab events**, and `tab.url`
   visibility in them requires `tabs` OR a matching host permission. ⚠️ **This is
   the one path that could silently go quiet if BOTH `tabs` and the broad host are
   dropped.**

**Resolution (least privilege WITHOUT breaking live-sync):**
- Set `host_permissions: ["https://leetcode.com/problems/*"]`.
- `tabs` is *very likely* removable, because all three uses above are satisfied by
  the matching host permission for LeetCode tabs. **But this is empirical, not
  certain** — Chrome's exact behavior for `onUpdated`/`onActivated` url visibility
  under host-only permissions must be observed live.
- **Decision rule (do NOT assume):** after narrowing the host AND removing `tabs`,
  run the **tab-switch/navigate auto-refresh live test** (§7). If it still works →
  `tabs` stays removed. If it goes quiet → **restore ONLY `tabs`** (keep the
  narrowed host; do NOT re-widen the host). Narrowing the host alone is already a
  large least-privilege win.
- **We never introduce `activeTab`** — it wouldn't cover the sync listeners and
  isn't needed given the host narrowing.

---

## 6. Execution order (minimize blast radius; LIVE test after each — do NOT batch)

Each step is a tiny manifest edit followed by `npm.cmd run build`, reload the
unpacked extension, and the stated live check. **Do them one at a time** so if
something breaks you know exactly which change caused it.

0. **EXPORT PROGRESS FIRST** (shipped export/import, JSON backup). The host-permission
   step (4) requires remove/re-add which **wipes `chrome.storage.local`** — the key
   + all progress. This is the user's action and is non-negotiable before step 4.
1. **Remove `contextMenus`** → build → reload → smoke test (panel opens, an action
   runs). Zero risk; just confirms nothing silently referenced it.
2. **Drop `localhost:5173`** content-script match → build → reload → confirm the
   content script still injects on a real LeetCode problem (panel auto-loads the
   problem).
3. **Narrow `host_permissions`** → `["https://leetcode.com/problems/*"]` →
   **remove + re-add the unpacked extension** (host changes need a full re-add) →
   **LIVE HAPPY PATH:** open a LeetCode problem → panel auto-loads → run
   CHECK_APPROACH with real code in the editor → the analysis reflects the ACTUAL
   editor code (proves `scripting` + host + content-script all still work). Also
   open a NON-LeetCode tab → confirm no injection, no console errors.
4. **Attempt removing `tabs`** → reload → **TAB-SYNC LIVE TEST (the decisive one):**
   with the panel open on problem A, switch to a tab with problem B (and/or
   navigate the same tab to problem B) WITHOUT reopening the panel → the panel MUST
   auto-refresh to problem B. If yes → keep `tabs` removed. If it goes quiet →
   restore `tabs` only, rebuild, re-verify.
5. **RE-IMPORT PROGRESS** (the JSON from step 0) → confirm records + key are back.
6. Final `npm.cmd run build` + `npm.cmd run test` green (do not regress the CI gate).
7. **Explain + STOP for review before committing** (workflow rule). The user
   commits on a fresh `feature/e7-permissions` branch and merges. Then E8 (deploy).

---

## 7. The live tests that gate sign-off (NONE can be skipped)

A green build is NOT sufficient — permission changes only manifest at runtime in a
reloaded extension. The user must observe ALL of these on a live Chrome:

- **T1 (panel opens):** toolbar click AND `Ctrl+Shift+L` both open the side panel.
- **T2 (problem auto-load):** opening a LeetCode problem auto-populates the panel
  with that problem (content script injects + message round-trip works).
- **T3 (editor read):** run CHECK_APPROACH with code in the Monaco editor → the
  analysis reflects the REAL editor code (proves `scripting` + host + MAIN-world
  read survived). This is the single most important functional test.
- **T4 (non-LeetCode safety):** on a non-LeetCode tab, nothing injects, no console
  errors — confirms the narrowed host didn't leave a stray match.
- **T5 (tab-sync — decides `tabs`):** switch/navigate between two problems WITHOUT
  reopening the panel → auto-refresh. Pass → `tabs` stays removed; fail → restore `tabs`.
- **T6 (persistence round-trip):** after re-import, My Progress shows the records
  and the key still works (a request succeeds).

---

## 8. Rollback / safety

- **Export is the safety net** for storage. If anything about the reinstall goes
  wrong, the JSON re-imports the records; the key is re-entered in Settings.
- **The manifest is tiny and version-controlled on the branch** — any step is a
  one-line revert. Because changes are applied ONE at a time with a test after
  each, a regression is isolated to the last change.
- **If `tabs` removal fails T5:** the documented minimal fix is to restore ONLY
  `tabs` (keep the narrowed host). Do NOT re-widen `host_permissions` — that would
  throw away the biggest least-privilege gain.
- **Never touch in E7:** `storage`, `scripting`, `sidePanel`, `commands` (perm +
  block), the CSP. These are load-bearing; the audit confirmed they're minimal.

---

## 9. Non-goals

- No source-code (`.ts`/`.tsx`) changes — manifest only.
- No CSP changes (already tight — #2 in findings).
- No `activeTab` introduction (unnecessary + insufficient — see §5).
- Not E8 (store listing, privacy disclosure, packaging) — that's the next spec.

---

## 10. Interview angle

Concrete least-privilege hardening driven by a permission-by-permission usage
trace: removing a dead permission (`contextMenus`), dropping a dev-only origin,
and the non-obvious insight that narrowing `host_permissions` to the real target
origin can REPLACE a broad `tabs` permission (because host permissions grant
`tab.url` visibility + messaging for matching tabs) — verified empirically against
the one path (`onUpdated`/`onActivated` auto-sync) where it's uncertain, rather
than assumed. Pairs with the security-audit two-sweeps story.
