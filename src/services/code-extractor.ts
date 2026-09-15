/**
 * Reads the user's current code + language from LeetCode's Monaco editor.
 *
 * Why MAIN world: LeetCode's editor is Monaco, and the full source (including
 * lines scrolled out of view) is only reliably available via
 * `window.monaco.editor.getModels()[0].getValue()`. But `window.monaco` lives
 * in the PAGE's JS world, which content scripts (isolated world) cannot touch.
 * So we inject a reader into the MAIN world via chrome.scripting and return
 * its result directly to the side panel.
 *
 * Fallbacks (in the injected function): if the Monaco global isn't reachable,
 * fall back to reconstructing from the rendered `.view-lines` DOM (works for
 * on-screen lines) so we still get *something* useful.
 */

export interface ExtractedCode {
  code: string;
  language: string;
}

/**
 * Runs in the PAGE (MAIN) world. Must be fully self-contained — it cannot
 * reference anything from the extension's module scope.
 */
function readEditorFromPage(): { code: string; language: string } {
  let code = '';
  let language = 'unknown';

  // Minimal shape of the Monaco bits we touch (Monaco's types aren't imported
  // in this MAIN-world function). Methods are optional because we're reading an
  // untrusted global that may not be present or fully-formed.
  interface MonacoModel { getValue?: () => string; getLanguageId?: () => string }
  interface MonacoGlobal { editor?: { getModels?: () => MonacoModel[] } }

  // Preferred: Monaco model value (full document, not just visible lines).
  try {
    const w = window as unknown as { monaco?: MonacoGlobal };
    const models: MonacoModel[] = w.monaco?.editor?.getModels?.() ?? [];
    if (models.length > 0) {
      // The editor model is usually the largest / first; pick the longest value.
      const values: string[] = models.map((m) => (typeof m.getValue === 'function' ? m.getValue() : ''));
      code = values.sort((a, b) => b.length - a.length)[0] ?? '';
      // Language id from the model. NOTE: LeetCode often leaves the Monaco
      // model's language as "plaintext" (highlighting/execution are handled
      // separately), so treat plaintext/empty as "not identified" and let the
      // toolbar-button fallback below read the real language ("Python3", etc.).
      const langId = models[0]?.getLanguageId?.();
      if (langId && String(langId).toLowerCase() !== 'plaintext') language = String(langId);
    }
  } catch {
    /* fall through to DOM fallback */
  }

  // Fallback: reconstruct from rendered lines (visible portion only).
  if (!code) {
    const viewLines = document.querySelector('.view-lines');
    if (viewLines) {
      const lines = Array.from(viewLines.querySelectorAll('.view-line')) as HTMLElement[];
      code = lines
        .map((l) => ({ top: parseInt(l.style.top || '0', 10), text: l.textContent ?? '' }))
        .sort((a, b) => a.top - b.top)
        .map((s) => s.text)
        .join('\n');
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

  return { code, language };
}

/**
 * Extracts the current editor code from the given tab.
 * Returns null if nothing usable could be read.
 */
export async function extractCurrentCode(tabId: number): Promise<ExtractedCode | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: readEditorFromPage,
    });
    const result = results?.[0]?.result as ExtractedCode | undefined;
    if (result && result.code.trim()) return result;
    return null;
  } catch (err) {
    console.error('[LeetSage] Failed to extract code:', err);
    return null;
  }
}
