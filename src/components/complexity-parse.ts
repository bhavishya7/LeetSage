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
