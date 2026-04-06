import type { ProblemContext, Example, TestCase } from '../types';

export function waitForElement<T extends Element>(selector: string, timeout = 10000, intervalTime = 500): Promise<T> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const el = document.querySelector<T>(selector);
      if (el) { clearInterval(interval); resolve(el); }
      else if (Date.now() - startTime > timeout) { clearInterval(interval); reject(new Error(`Timeout: ${selector}`)); }
    }, intervalTime);
  });
}

export function waitForElements<T extends Element>(selector: string, timeout = 10000, intervalTime = 500): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const els = Array.from(document.querySelectorAll<T>(selector));
      if (els.length > 0) { clearInterval(interval); resolve(els); }
      else if (Date.now() - startTime > timeout) { clearInterval(interval); reject(new Error(`Timeout: ${selector}`)); }
    }, intervalTime);
  });
}

async function extractTitle(): Promise<string> {
  const links = await waitForElements<HTMLAnchorElement>('a[href^="/problems/"]');
  const problemLink = links.find(link => /\d+\.\s/.test(link.innerText.trim()));
  if (!problemLink) throw new Error('Could not find problem title');
  return problemLink.innerText.trim();
}

async function extractDifficulty(): Promise<'Easy' | 'Medium' | 'Hard'> {
  const el = await waitForElement<HTMLDivElement>('div.text-difficulty-easy, div.text-difficulty-medium, div.text-difficulty-hard');
  const text = el.innerText.trim().toLowerCase();
  if (text.includes('easy')) return 'Easy';
  if (text.includes('medium')) return 'Medium';
  if (text.includes('hard')) return 'Hard';
  throw new Error(`Unknown difficulty: ${text}`);
}

async function extractDescription(): Promise<string> {
  try {
    for (const selector of ['[data-track-load="description_content"]', '.elfjS', '[class*="description"]']) {
      const el = document.querySelector(selector);
      if (el) return el.textContent?.trim().replace(/\s+/g, ' ') || '';
    }
    return '';
  } catch { return ''; }
}

async function extractExamples(): Promise<Example[]> {
  try {
    const examples: Example[] = [];
    const headings = Array.from(document.querySelectorAll('p, strong')).filter(el => /Example\s*\d*/i.test(el.textContent || ''));
    for (const heading of headings) {
      let nextEl = heading.nextElementSibling;
      let text = '';
      while (nextEl && !nextEl.textContent?.includes('Example')) {
        if (nextEl.tagName === 'PRE' || nextEl.querySelector('pre')) { text = nextEl.textContent || ''; break; }
        nextEl = nextEl.nextElementSibling;
      }
      if (text) {
        const inputMatch = text.match(/Input:\s*(.+?)(?=Output:|$)/s);
        const outputMatch = text.match(/Output:\s*(.+?)(?=Explanation:|$)/s);
        const explanationMatch = text.match(/Explanation:\s*(.+?)$/s);
        if (inputMatch && outputMatch) examples.push({ input: inputMatch[1].trim(), output: outputMatch[1].trim(), explanation: explanationMatch?.[1].trim() });
      }
    }
    return examples;
  } catch { return []; }
}

async function extractConstraints(): Promise<string[]> {
  try {
    const heading = Array.from(document.querySelectorAll('p, strong')).find(el => /Constraints?:/i.test(el.textContent || ''));
    if (!heading) return [];
    let nextEl = heading.nextElementSibling;
    while (nextEl && nextEl.tagName !== 'P') {
      if (nextEl.tagName === 'UL') return Array.from(nextEl.querySelectorAll('li')).map(li => li.textContent?.trim() || '').filter(Boolean);
      nextEl = nextEl.nextElementSibling;
    }
    return [];
  } catch { return []; }
}

export async function extractProblemContext(maxRetries = 3): Promise<ProblemContext> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const [title, difficulty, description] = await Promise.all([extractTitle(), extractDifficulty(), extractDescription()]);
      const [examples, constraints] = await Promise.all([extractExamples(), extractConstraints()]);
      const testCases: TestCase[] = examples.map(ex => ({ input: ex.input, expectedOutput: ex.output }));
      return { title, url: window.location.href, difficulty, description, examples, constraints, testCases, extractedAt: Date.now() };
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  throw new Error(`Failed after ${maxRetries} attempts: ${lastError?.message}`);
}

export function observeProblemChanges(callback: () => void): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    const urlChanged = mutations.some(m => Array.from(m.addedNodes).some(n => n instanceof HTMLElement && n.querySelector('a[href^="/problems/"]') !== null));
    if (urlChanged) callback();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}
