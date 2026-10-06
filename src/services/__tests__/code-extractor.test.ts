import { describe, it, expect, afterEach, vi } from 'vitest';
import { resolveReadResult, __readEditorFromPage, type __PageReadResult } from '../code-extractor';

/**
 * R2 / B15 — code capture MUST be reliable (see
 * .kiro/specs/leetsage-e6-bug-hardening §2). An LLM analyzing the WRONG code is
 * worse than no analysis, so this is the batch's top-priority path and is tested
 * hardest. Two layers are covered here, DOM-free (vitest env is 'node'):
 *
 *  1. resolveReadResult — the attempt-policy state machine that maps a sequence
 *     of per-attempt page reads onto the discriminated ok | empty | failed
 *     result. This is the logic that stops a partial scrape (dom-live) from ever
 *     being accepted as the analyzed source, and that keeps "empty" and "failed"
 *     distinct.
 *  2. __readEditorFromPage — the MAIN-world reader's model selection (prefer the
 *     user's editor model over a diff/preview), DOM-liveness tagging (never
 *     promoted to a code source), and language resolution (Monaco 'plaintext' →
 *     toolbar fallback). Driven with minimal window/document stubs.
 */

// ---- resolveReadResult: the ok | empty | failed state machine --------------

function monaco(code: string, language = 'python'): __PageReadResult {
  return { source: 'monaco', code, language };
}
function domLive(code: string): __PageReadResult {
  return { source: 'dom-live', code, language: 'unknown' };
}
const none: __PageReadResult = { source: 'none', code: '', language: 'unknown' };

describe('resolveReadResult — discriminated ok | empty | failed (R2/B15)', () => {
  it('a full Monaco read returns ok with code + language', () => {
    const r = resolveReadResult([monaco('def solve(): pass', 'python3')]);
    expect(r).toEqual({ status: 'ok', code: 'def solve(): pass', language: 'python3' });
  });

  it('ok wins as soon as a trustworthy Monaco read has code (short-circuits retries)', () => {
    // First attempt failed (threw), second got the model — must be ok, not failed.
    const r = resolveReadResult([null, monaco('x = 1')]);
    expect(r.status).toBe('ok');
  });

  it('a reachable-but-blank Monaco editor is empty, NOT failed', () => {
    const r = resolveReadResult([monaco('   '), monaco('')]);
    expect(r).toEqual({ status: 'empty' });
  });

  it('visible code we could NOT capture via Monaco is failed, NOT ok and NOT empty', () => {
    // The dangerous case: code is on screen (dom-live) but the model stayed
    // unreachable. We must refuse to analyze a partial fragment → failed.
    const r = resolveReadResult([domLive('class Codec:\n    def enc')]);
    expect(r).toEqual({ status: 'failed' });
  });

  it('NEVER returns a dom-live fragment as ok code', () => {
    const fragment = 'only the visible lines';
    const r = resolveReadResult([domLive(fragment), domLive(fragment)]);
    expect(r.status).toBe('failed');
    expect(JSON.stringify(r)).not.toContain(fragment);
  });

  it('a transient injection failure then a good read still yields ok (retry works)', () => {
    const r = resolveReadResult([null, null, monaco('answer = 42')]);
    expect(r).toEqual({ status: 'ok', code: 'answer = 42', language: 'python' });
  });

  it('all attempts threw (never reached the page) → failed', () => {
    expect(resolveReadResult([null, null, null])).toEqual({ status: 'failed' });
  });

  it('reached the page but found no model and no visible code → empty', () => {
    expect(resolveReadResult([none, none])).toEqual({ status: 'empty' });
  });

  it('monaco-empty on an early attempt but code captured later → ok (not empty)', () => {
    // Editor still initializing on attempt 1, settled by attempt 2.
    const r = resolveReadResult([monaco(''), monaco('final = True')]);
    expect(r).toEqual({ status: 'ok', code: 'final = True', language: 'python' });
  });

  it('the three statuses are mutually exclusive across representative inputs', () => {
    expect(resolveReadResult([monaco('a')]).status).toBe('ok');
    expect(resolveReadResult([monaco('')]).status).toBe('empty');
    expect(resolveReadResult([domLive('a')]).status).toBe('failed');
  });
});

// ---- __readEditorFromPage: MAIN-world model selection + language -----------

/**
 * Install minimal window/document stubs so the self-contained MAIN-world reader
 * runs in node. Each test provides the Monaco models and/or DOM it needs.
 */
function installPage(opts: {
  models?: Array<{ value: string; language?: string; uri?: string }>;
  viewLines?: string[];      // visible .view-line text, in order
  toolbarLang?: string;      // text of a language toolbar button
}) {
  const models = (opts.models ?? []).map((m) => ({
    getValue: () => m.value,
    getLanguageId: () => m.language ?? 'plaintext',
    uri: { toString: () => m.uri ?? 'inmemory://model/1' },
  }));

  const g = globalThis as unknown as { window?: unknown; document?: unknown };

  g.window = { monaco: { editor: { getModels: () => models } } };

  // Tiny DOM stub: only the queries __readEditorFromPage makes.
  const viewLineEls = (opts.viewLines ?? []).map((text, i) => ({
    style: { top: `${i * 18}` },
    textContent: text,
  }));
  const toolbarButtons = opts.toolbarLang
    ? [{ textContent: opts.toolbarLang }]
    : [];

  g.document = {
    querySelector: (sel: string) => {
      if (sel === '.view-lines') {
        return opts.viewLines && opts.viewLines.length > 0
          ? { querySelectorAll: () => viewLineEls }
          : null;
      }
      return null;
    },
    querySelectorAll: () => toolbarButtons,
  };
}

afterEach(() => {
  const g = globalThis as unknown as { window?: unknown; document?: unknown };
  delete g.window;
  delete g.document;
  vi.restoreAllMocks();
});

describe('__readEditorFromPage — model selection + language (R2/B15)', () => {
  it('reads the full Monaco model value and tags it as source "monaco"', () => {
    installPage({ models: [{ value: 'def f():\n    return 1', language: 'python' }] });
    const r = __readEditorFromPage();
    expect(r.source).toBe('monaco');
    expect(r.code).toBe('def f():\n    return 1');
    expect(r.language).toBe('python');
  });

  it('prefers the user editor model over a diff/preview model', () => {
    installPage({
      models: [
        { value: 'DIFF ORIGINAL SIDE — much longer text that would win on length alone', uri: 'inmemory://model/original' },
        { value: 'user_code = True', uri: 'inmemory://model/2' },
      ],
    });
    const r = __readEditorFromPage();
    // The longer value is the diff side; we must still pick the editor model.
    expect(r.code).toBe('user_code = True');
  });

  it('falls back to the toolbar language when Monaco reports plaintext', () => {
    installPage({
      models: [{ value: 'print(1)', language: 'plaintext' }],
      toolbarLang: 'Python3',
    });
    const r = __readEditorFromPage();
    expect(r.language).toBe('Python3');
  });

  it('uses the DOM only as a liveness signal (source "dom-live") when Monaco is unreachable', () => {
    // No models → Monaco unreachable; visible lines show code exists.
    installPage({ models: [], viewLines: ['class Codec:', '    def encode(self, strs):'] });
    const r = __readEditorFromPage();
    expect(r.source).toBe('dom-live');
    // It still returns the fragment text, but tagged dom-live so the state
    // machine refuses to treat it as analyzable code.
    expect(r.code).toContain('class Codec:');
  });

  it('reports source "none" when there is neither a model nor visible code', () => {
    installPage({ models: [] });
    const r = __readEditorFromPage();
    expect(r.source).toBe('none');
    expect(r.code).toBe('');
  });
});
