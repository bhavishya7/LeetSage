/**
 * Pure parsing helpers for complexity-badge rendering (see ContentDisplay.tsx).
 *
 * Kept in a non-JSX module so the logic is unit-testable on its own and so
 * ContentDisplay.tsx can stay a component-only file (react-refresh lint rule).
 */

/**
 * Index of the `)` that closes the group whose `(` is at `open`; -1 if the
 * parens are unbalanced. Complexity can NEST parens — "O(log(M) + log(N))",
 * "O(N*log(N))" — so a naive `[^)]+` regex stops at the FIRST `)` and renders
 * only "O(log(M)" as a badge, leaking the remainder as prose (B7). This walks
 * the string tracking depth to find the true matching close.
 */
export function matchingParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/**
 * Splits `text` into segments, tagging each `O(...)` complexity (with balanced,
 * possibly-nested parens) so the caller can render it as a badge and leave the
 * rest as prose. `inner` is the content between `O(` and its matching `)`.
 * Unbalanced `O(` is left as plain text (not swallowed).
 */
export type ComplexitySegment =
  | { kind: 'text'; value: string }
  | { kind: 'complexity'; inner: string; at: number };

export function splitComplexity(text: string): ComplexitySegment[] {
  const segments: ComplexitySegment[] = [];
  let lastIndex = 0;
  let searchFrom = 0;

  while (true) {
    const oIdx = text.indexOf('O(', searchFrom);
    if (oIdx === -1) break;
    const close = matchingParen(text, oIdx + 1);
    if (close === -1) break; // unbalanced — leave the rest as text

    if (oIdx > lastIndex) segments.push({ kind: 'text', value: text.slice(lastIndex, oIdx) });
    segments.push({ kind: 'complexity', inner: text.slice(oIdx + 2, close), at: oIdx });
    lastIndex = close + 1;
    searchFrom = close + 1;
  }

  if (lastIndex < text.length) segments.push({ kind: 'text', value: text.slice(lastIndex) });
  return segments;
}

/**
 * Normalizes the INNER text of an O(...) complexity for display:
 *  - uppercases a `n` ONLY when it is a standalone variable (so `O(n*m)` →
 *    `O(N*M)` and `O(n log n)` → `O(N log N)`), WITHOUT corrupting `n` inside a
 *    word like `min`/`ln`/`len` (the old `/n/g → N` turned `O(min(a,b))` into
 *    `O(miN(a,b))` — B13's latent sibling bug).
 *
 * Superscripting (`^2` → ²) is applied separately by the renderer so this stays
 * a pure string→string helper, unit-testable without JSX.
 */
export function formatComplexityInner(inner: string): string {
  // \b…\b alone treats `n` in `min` as a boundary-bounded token on the wrong
  // side, so require the `n`/`m` to NOT be adjacent to another letter. A single
  // lowercase variable letter surrounded by non-letters becomes uppercase.
  return inner
    .replace(/(^|[^A-Za-z])n(?![A-Za-z])/g, (_m, pre: string) => `${pre}N`)
    .replace(/(^|[^A-Za-z])m(?![A-Za-z])/g, (_m, pre: string) => `${pre}M`);
}

/**
 * Protects complexity groups from markdown emphasis parsing.
 *
 * B13: ContentDisplay's renderInline splits on markdown emphasis
 * (`*italic*`) BEFORE complexity parsing, so the literal `*` in `O(N*M)` gets
 * consumed as italic delimiters and stripped — mangling the Big-O. This helper
 * replaces every balanced `O(...)` group with an opaque sentinel BEFORE the
 * emphasis split, then the caller restores them AFTER. The sentinel contains no
 * `*`, `` ` `` or `_`, so it survives the emphasis pass intact.
 *
 * Returns the masked text plus the ordered list of original complexity strings
 * (`O(...)` included) to splice back in.
 */
const COMPLEXITY_SENTINEL = '\u0000CX';

export function maskComplexity(text: string): { masked: string; tokens: string[] } {
  const tokens: string[] = [];
  const segments = splitComplexity(text);
  let masked = '';
  for (const seg of segments) {
    if (seg.kind === 'text') {
      masked += seg.value;
    } else {
      masked += `${COMPLEXITY_SENTINEL}${tokens.length}\u0000`;
      tokens.push(`O(${seg.inner})`);
    }
  }
  return { masked, tokens };
}

/**
 * The regex a consumer uses to find/split restored sentinels (capturing the
 * index). The NUL (\x00) bytes are intentional: an opaque sentinel that cannot
 * occur in model output or collide with markdown, so the control-char lint is
 * disabled for this one line on purpose.
 */
// eslint-disable-next-line no-control-regex
export const COMPLEXITY_SENTINEL_RE = /\u0000CX(\d+)\u0000/g;
