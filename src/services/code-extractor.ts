/**
 * Reads the user's current code + language from LeetCode's Monaco editor.
 *
 * Why MAIN world: LeetCode's editor is Monaco, and the full source (including
 * lines scrolled out of view) is only reliably available via
 * `window.monaco.editor.getModels()[].getValue()`. But `window.monaco` lives
 * in the PAGE's JS world, which content scripts (isolated world) cannot touch.
 * So we inject a reader into the MAIN world via chrome.scripting and return
 * its result directly to the side panel.
 *
 * ---------------------------------------------------------------------------
 * R2 / B15 (see .kiro/specs/leetsage-e6-bug-hardening §2) — capture MUST be
 * reliable, because an LLM analyzing the WRONG code is worse than no analysis.
 * Three hardening rules drive this module:
 *
 *  1. The full Monaco model value is the ONLY analyzed source. The old
 *     visible-only `.view-lines` DOM scrape could return a TRUNCATED fragment
 *     (just the on-screen lines of a scrolled editor) that silently masqueraded
 *     as the whole solution. A partial scrape must NEVER reach the model as if
 *     it were complete, so the DOM is used ONLY as a last-resort *liveness*
 *     signal ("is there any code at all?") — never as the code we send.
 *
 *  2. Retry/backoff on the MAIN-world read, mirroring the robust problem-data
 *     pull path. The old code made a SINGLE attempt, so an editor-not-ready /
 *     script-race / sleeping-worker timing blip read as "empty".
 *
 *  3. A discriminated result — `ok | empty | failed` — so the caller can tell
 *     "the user genuinely wrote nothing" apart from "we failed to read". The
 *     old `ExtractedCode | null` conflated those: a failed read looked identical
 *     to an empty editor, and the model then gave confident generic advice as if
 *     it had seen full code.
 * ---------------------------------------------------------------------------
 */

export interface ExtractedCode {
  code: string;
  language: string;
}

/**
 * Discriminated result of a code read. The caller branches on `status`:
 *  - `ok`      → analyze this complete code.
 *  - `empty`   → the editor was reachable but the user hasn't written anything;
 *                tell them honestly, don't fabricate an analysis.
 *  - `failed`  → we could not reach the editor model; surface an error / retry,
 *                never a silent generic analysis.
 */
export type CodeReadResult =
  | { status: 'ok'; code: string; language: string }
  | { status: 'empty' }
  | { status: 'failed' };

/**
 * What the MAIN-world reader returns. `source` distinguishes a trustworthy full
 * Monaco model read from a DOM-only liveness observation, so the caller never
 * treats a visible-only fragment as the analyzed source.
 *   - 'monaco'   → `code` is the full model value (trustworthy, analyzable).
 *   - 'dom-live' → Monaco was unreachable but the DOM shows code exists; `code`
 *                  is a (possibly truncated) fragment used ONLY as a liveness
 *                  signal — NOT analyzable.
 *   - 'none'     → neither a model nor any visible code line was found.
 */
interface PageReadResult {
  source: 'monaco' | 'dom-live' | 'none';
  /** Full model value for 'monaco'; a liveness fragment for 'dom-live'; '' otherwise. */
  code: string;
  language: string;
}

/**
 * Runs in the PAGE (MAIN) world. Must be fully self-contained — it cannot
 * reference anything from the extension's module scope.
 *
 * Returns a tagged result so the extension side can trust a Monaco read and
 * refuse a DOM fragment as the analyzed source (R2). It does NOT decide
 * ok/empty/failed — that policy lives on the extension side across retries.
 */
function readEditorFromPage(): PageReadResult {
  let code = '';
  let source: 'monaco' | 'dom-live' | 'none' = 'none';
  let language = 'unknown';

  // Minimal shape of the Monaco bits we touch (Monaco's types aren't imported
  // in this MAIN-world function). Methods are optional because we're reading an
  // untrusted global that may not be present or fully-formed.
  interface MonacoModel { getValue?: () => string; getLanguageId?: () => string; uri?: { toString?: () => string } }
  interface MonacoGlobal { editor?: { getModels?: () => MonacoModel[] } }

  // Preferred (and ONLY analyzable) source: the Monaco model value — the full
  // document, including lines scrolled out of view.
  try {
    const w = window as unknown as { monaco?: MonacoGlobal };
    const models: MonacoModel[] = w.monaco?.editor?.getModels?.() ?? [];
    if (models.length > 0) {
      // Prefer the user's editor model, not a diff/preview/inline model. LeetCode's
      // editor model uri is typically "inmemory://model/..." or a file scheme; diff
      // views expose "modified"/"original" models. Heuristic: ignore models whose uri
      // looks like a diff side, then take the longest remaining getValue(). Falling
      // back to "longest overall" preserves the old behavior if the uri is unreadable.
      const scored = models.map((m) => {
        const value = typeof m.getValue === 'function' ? m.getValue() : '';
        let uri = '';
        try { uri = m.uri?.toString?.() ?? ''; } catch { uri = ''; }
        const isDiffSide = /\b(diff|original|modified|preview|output)\b/i.test(uri);
        return { value, uri, isDiffSide, len: value.length };
      });
      const editorModels = scored.filter((s) => !s.isDiffSide);
      const pool = editorModels.length > 0 ? editorModels : scored;
      const best = pool.sort((a, b) => b.len - a.len)[0];
      code = best?.value ?? '';
      source = 'monaco';

      // Language id from the model. NOTE: LeetCode often leaves the Monaco
      // model's language as "plaintext" (highlighting/execution are handled
      // separately), so treat plaintext/empty as "not identified" and let the
      // toolbar-button fallback below read the real language ("Python3", etc.).
      try {
        const langModel = models.find((m) => (typeof m.getValue === 'function' ? m.getValue() : '') === code) ?? models[0];
        const langId = langModel?.getLanguageId?.();
        if (langId && String(langId).toLowerCase() !== 'plaintext') language = String(langId);
      } catch { /* language stays 'unknown'; resolved from the toolbar below */ }
    }
  } catch {
    /* Monaco unreachable — fall through to the DOM liveness probe. */
  }

  // DOM is a LIVENESS SIGNAL ONLY (R2): if we could not read a Monaco model, we
  // check whether the rendered editor shows ANY code so the caller can tell
  // "failed to reach the model" from "genuinely empty". We deliberately do NOT
  // promote this fragment to the analyzed source — it is visible-lines-only and
  // can be truncated.
  if (source !== 'monaco') {
    const viewLines = document.querySelector('.view-lines');
    if (viewLines) {
      const lines = Array.from(viewLines.querySelectorAll('.view-line')) as HTMLElement[];
      const fragment = lines
        .map((l) => ({ top: parseInt(l.style.top || '0', 10), text: l.textContent ?? '' }))
        .sort((a, b) => a.top - b.top)
        .map((s) => s.text)
        .join('\n');
      if (fragment.trim()) { code = fragment; source = 'dom-live'; }
    }
  }

  // Language from the toolbar's language selector if Monaco didn't give a real
  // one. LeetCode renders this control differently across layouts (a <button>
  // or a clickable element), so scan buttons + elements with a button role and
  // exact-match the visible text against known languages.
  if (language === 'unknown') {
    const candidates = Array.from(
      document.querySelectorAll('button, [role="button"], [class*="lang"]')
    ) as HTMLElement[];
    const langRe = /^(C\+\+|Python3?|Java|JavaScript|TypeScript|C#|Go|Rust|Kotlin|Swift|Ruby|C|Scala|PHP|Dart|Elixir|Erlang|Racket|MySQL|Pandas)$/;
    const match = candidates.map((b) => (b.textContent ?? '').trim()).find((t) => langRe.test(t));
    if (match) language = match;
  }

  return { source, code, language };
}

/** Resolve after `ms` milliseconds (backoff between read attempts). */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One MAIN-world read attempt. Returns the page result, or `null` if the
 * injection itself threw (treated as a transient failure worth retrying).
 */
async function readOnce(tabId: number): Promise<PageReadResult | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: readEditorFromPage,
    });
    const result = results?.[0]?.result as PageReadResult | undefined;
    return result ?? null;
  } catch (err) {
    console.error('[LeetSage] Code read attempt failed:', err);
    return null;
  }
}

/** Backoff schedule (ms) between read attempts; length = max attempts. */
const RETRY_BACKOFF_MS = [0, 150, 400, 800];

/**
 * Extracts the current editor code from the given tab, with retry/backoff, and
 * returns a discriminated `ok | empty | failed` result (R2 / B15).
 *
 * Policy across attempts:
 *  - A trustworthy Monaco read with code  → `ok` immediately.
 *  - A trustworthy Monaco read that is empty, OR a DOM liveness signal showing
 *    code exists → keep retrying (the model may still be initializing / the
 *    editor may be settling); only AFTER exhausting attempts do we settle:
 *      · best read was Monaco-empty across all tries → `empty` (editor really is blank).
 *      · we only ever got a DOM liveness signal (never a Monaco model) → `failed`
 *        (we saw code but could NOT capture it fully — refuse to send a fragment).
 *      · we never reached the page at all → `failed`.
 *
 * The key invariant: a DOM fragment is NEVER returned as `ok` code. If code is
 * visibly present but Monaco stayed unreachable, that is `failed`, not a
 * silently-truncated analysis.
 */
export async function extractCurrentCode(tabId: number): Promise<CodeReadResult> {
  let sawMonacoEmpty = false;
  let sawDomLiveness = false;
  let reachedPage = false;

  for (let attempt = 0; attempt < RETRY_BACKOFF_MS.length; attempt++) {
    if (RETRY_BACKOFF_MS[attempt] > 0) await delay(RETRY_BACKOFF_MS[attempt]);

    const result = await readOnce(tabId);
    if (!result) continue; // injection threw — transient; retry.
    reachedPage = true;

    if (result.source === 'monaco') {
      if (result.code.trim()) {
        // Full, trustworthy model value → analyze it.
        return { status: 'ok', code: result.code, language: result.language };
      }
      // Reached the real model and it's empty — but the editor may still be
      // initializing on an early attempt, so remember it and keep trying.
      sawMonacoEmpty = true;
    } else if (result.source === 'dom-live') {
      // Code is visibly present but we couldn't read the model. Retry to try to
      // get a trustworthy Monaco read; never accept this fragment as the source.
      sawDomLiveness = true;
    }
  }

  // Attempts exhausted — settle on the strongest evidence we gathered.
  if (sawMonacoEmpty && !sawDomLiveness) return { status: 'empty' };
  if (sawDomLiveness) return { status: 'failed' }; // saw code, couldn't capture it fully
  if (sawMonacoEmpty) return { status: 'empty' };  // model reachable, consistently blank
  if (reachedPage) return { status: 'empty' };     // reached page, no model + no visible code
  return { status: 'failed' };                     // never reached the page
}

// Exported for unit testing the attempt-policy state machine in isolation from
// chrome.scripting. Given the sequence of per-attempt page reads, it returns the
// same CodeReadResult extractCurrentCode would. `null` entries model an
// injection that threw on that attempt.
export function resolveReadResult(attempts: Array<PageReadResult | null>): CodeReadResult {
  let sawMonacoEmpty = false;
  let sawDomLiveness = false;
  let reachedPage = false;

  for (const result of attempts) {
    if (!result) continue;
    reachedPage = true;
    if (result.source === 'monaco') {
      if (result.code.trim()) return { status: 'ok', code: result.code, language: result.language };
      sawMonacoEmpty = true;
    } else if (result.source === 'dom-live') {
      sawDomLiveness = true;
    }
  }

  if (sawMonacoEmpty && !sawDomLiveness) return { status: 'empty' };
  if (sawDomLiveness) return { status: 'failed' };
  if (sawMonacoEmpty) return { status: 'empty' };
  if (reachedPage) return { status: 'empty' };
  return { status: 'failed' };
}

// Exported so a test can drive the MAIN-world reader's model-selection and
// language logic without a real browser. It is otherwise an internal detail.
export { readEditorFromPage as __readEditorFromPage };
export type { PageReadResult as __PageReadResult };
