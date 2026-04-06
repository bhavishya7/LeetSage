/**
 * Problem Context Extractor
 * 
 * This module extracts structured problem data from LeetCode's DOM.
 * LeetCode is a React app, so content loads dynamically - we need to wait for elements.
 * 
 * Key challenges:
 * 1. Elements load asynchronously (need polling/waiting)
 * 2. DOM structure can change (need robust selectors)
 * 3. Content is nested and needs parsing (examples, constraints)
 */

import type { ProblemContext, Example, TestCase } from '../types';

/**
 * Waits for a single DOM element to appear
 * 
 * Why we need this: LeetCode loads content dynamically with React.
 * Elements aren't immediately available when the page loads.
 * 
 * @param selector - CSS selector for the element
 * @param timeout - Max time to wait in milliseconds (default: 10 seconds)
 * @param intervalTime - How often to check (default: 500ms)
 */
export function waitForElement<T extends Element>(
  selector: string,
  timeout: number = 10000,
  intervalTime: number = 500
): Promise<T> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const interval = setInterval(() => {
      const element = document.querySelector<T>(selector);
      
      if (element) {
        clearInterval(interval);
        resolve(element);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for element: ${selector}`));
      }
    }, intervalTime);
  });
}

/**
 * Waits for multiple DOM elements to appear
 * 
 * @param selector - CSS selector for the elements
 * @param timeout - Max time to wait in milliseconds
 * @param intervalTime - How often to check
 */
export function waitForElements<T extends Element>(
  selector: string,
  timeout: number = 10000,
  intervalTime: number = 500
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const interval = setInterval(() => {
      const elements = Array.from(document.querySelectorAll<T>(selector));
      
      if (elements.length > 0) {
        clearInterval(interval);
        resolve(elements);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for elements: ${selector}`));
      }
    }, intervalTime);
  });
}

/**
 * Extracts the problem title from the page
 * 
 * LeetCode shows the title as a link with format "1. Two Sum"
 * We look for links starting with "/problems/" that have a number prefix
 */
async function extractTitle(): Promise<string> {
  const links = await waitForElements<HTMLAnchorElement>('a[href^="/problems/"]');
  
  // Find the link with number prefix (e.g., "1. Two Sum")
  const problemLink = links.find((link) => /\d+\.\s/.test(link.innerText.trim()));
  
  if (!problemLink) {
    throw new Error('Could not find problem title');
  }
  
  return problemLink.innerText.trim();
}

/**
 * Extracts the problem difficulty
 * 
 * LeetCode uses CSS classes like "text-difficulty-easy"
 */
async function extractDifficulty(): Promise<'Easy' | 'Medium' | 'Hard'> {
  const difficultyEl = await waitForElement<HTMLDivElement>(
    'div.text-difficulty-easy, div.text-difficulty-medium, div.text-difficulty-hard'
  );
  
  const difficultyText = difficultyEl.innerText.trim();
  
  // Normalize to our type
  if (difficultyText.toLowerCase().includes('easy')) return 'Easy';
  if (difficultyText.toLowerCase().includes('medium')) return 'Medium';
  if (difficultyText.toLowerCase().includes('hard')) return 'Hard';
  
  throw new Error(`Unknown difficulty: ${difficultyText}`);
}

/**
 * Extracts the problem description
 * 
 * The description is in a content area, usually with class containing "description"
 * We need to get the text content while preserving structure
 */
async function extractDescription(): Promise<string> {
  try {
    // Try multiple selectors as LeetCode's structure can vary
    const selectors = [
      '[data-track-load="description_content"]',
      '.elfjS',  // Common class for description container
      '[class*="description"]',
    ];
    
    for (const selector of selectors) {
      const descEl = document.querySelector(selector);
      if (descEl) {
        // Get text content, clean up whitespace
        return descEl.textContent?.trim().replace(/\s+/g, ' ') || '';
      }
    }
    
    // Fallback: return empty string if we can't find it
    console.warn('Could not find problem description');
    return '';
  } catch (error) {
    console.error('Error extracting description:', error);
    return '';
  }
}

/**
 * Extracts examples from the problem description
 * 
 * Examples are usually in <pre> tags or code blocks
 * Format: "Input: ...\nOutput: ...\nExplanation: ..."
 */
async function extractExamples(): Promise<Example[]> {
  try {
    const examples: Example[] = [];
    
    // Look for example sections (usually have "Example" in heading)
    const exampleHeadings = Array.from(document.querySelectorAll('p, strong'))
      .filter(el => /Example\s*\d*/i.test(el.textContent || ''));
    
    for (const heading of exampleHeadings) {
      // Find the next <pre> or code block after this heading
      let nextEl = heading.nextElementSibling;
      let exampleText = '';
      
      while (nextEl && !nextEl.textContent?.includes('Example')) {
        if (nextEl.tagName === 'PRE' || nextEl.querySelector('pre')) {
          exampleText = nextEl.textContent || '';
          break;
        }
        nextEl = nextEl.nextElementSibling;
      }
      
      if (exampleText) {
        // Parse the example text
        const inputMatch = exampleText.match(/Input:\s*(.+?)(?=Output:|$)/s);
        const outputMatch = exampleText.match(/Output:\s*(.+?)(?=Explanation:|$)/s);
        const explanationMatch = exampleText.match(/Explanation:\s*(.+?)$/s);
        
        if (inputMatch && outputMatch) {
          examples.push({
            input: inputMatch[1].trim(),
            output: outputMatch[1].trim(),
            explanation: explanationMatch?.[1].trim(),
          });
        }
      }
    }
    
    return examples;
  } catch (error) {
    console.error('Error extracting examples:', error);
    return [];
  }
}

/**
 * Extracts constraints from the problem description
 * 
 * Constraints are usually in a list after "Constraints:" heading
 */
async function extractConstraints(): Promise<string[]> {
  try {
    const constraints: string[] = [];
    
    // Look for "Constraints:" heading
    const constraintsHeading = Array.from(document.querySelectorAll('p, strong'))
      .find(el => /Constraints?:/i.test(el.textContent || ''));
    
    if (constraintsHeading) {
      // Find the next <ul> or list of <li> elements
      let nextEl = constraintsHeading.nextElementSibling;
      
      while (nextEl && nextEl.tagName !== 'P') {
        if (nextEl.tagName === 'UL') {
          const items = nextEl.querySelectorAll('li');
          items.forEach(item => {
            const text = item.textContent?.trim();
            if (text) constraints.push(text);
          });
          break;
        }
        nextEl = nextEl.nextElementSibling;
      }
    }
    
    return constraints;
  } catch (error) {
    console.error('Error extracting constraints:', error);
    return [];
  }
}

/**
 * Extracts test cases (if visible)
 * 
 * Test cases might be in the examples or in a separate test case section
 * For now, we'll derive them from examples
 */
function extractTestCases(examples: Example[]): TestCase[] {
  return examples.map(example => ({
    input: example.input,
    expectedOutput: example.output,
  }));
}

/**
 * Main extraction function with retry logic
 * 
 * Attempts to extract all problem data with exponential backoff retry
 * 
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 */
export async function extractProblemContext(maxRetries: number = 3): Promise<ProblemContext> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[LeetSage] Extraction attempt ${attempt + 1}/${maxRetries}`);
      
      // Extract all components in parallel where possible
      const [title, difficulty, description] = await Promise.all([
        extractTitle(),
        extractDifficulty(),
        extractDescription(),
      ]);
      
      // These depend on the description being loaded
      const [examples, constraints] = await Promise.all([
        extractExamples(),
        extractConstraints(),
      ]);
      
      const testCases = extractTestCases(examples);
      
      const context: ProblemContext = {
        title,
        url: window.location.href,
        difficulty,
        description,
        examples,
        constraints,
        testCases,
        extractedAt: Date.now(),
      };
      
      console.log('[LeetSage] Successfully extracted problem context:', context);
      return context;
      
    } catch (error) {
      lastError = error as Error;
      console.error(`[LeetSage] Extraction attempt ${attempt + 1} failed:`, error);
      
      // Exponential backoff: wait 1s, 2s, 4s between retries
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[LeetSage] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries failed
  throw new Error(`Failed to extract problem context after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Sets up a MutationObserver to detect problem page changes
 * 
 * LeetCode is a single-page app (SPA), so navigating between problems
 * doesn't trigger a full page reload. We need to watch for DOM changes.
 * 
 * @param callback - Function to call when a problem change is detected
 */
export function observeProblemChanges(callback: () => void): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    // Check if the URL changed (problem navigation)
    const urlChanged = mutations.some(mutation => {
      return Array.from(mutation.addedNodes).some(node => {
        return node instanceof HTMLElement && 
               node.querySelector('a[href^="/problems/"]') !== null;
      });
    });
    
    if (urlChanged) {
      console.log('[LeetSage] Problem page change detected');
      callback();
    }
  });
  
  // Observe the entire document body for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  
  return observer;
}
