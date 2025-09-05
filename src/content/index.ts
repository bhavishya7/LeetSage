/// <reference types="chrome"/>

/**
 * Waits for a single DOM element to appear in the document.
 *
 * @param selector - A CSS selector string (e.g., 'a[href^="/problems/"]:not([data-state])')
 * @param intervalTime - How often to check, in ms (default: 500)
 * @returns A Promise that resolves with the found Element
 */
// function waitForProblemTitle<T extends Element>(
//   selector: string,
//   intervalTime: number = 500
// ): Promise<T> {
//   return new Promise((resolve) => {
//     const interval = setInterval(() => {
//       const element = document.querySelector<T>(selector);
//       if (element) {
//         clearInterval(interval);
//         resolve(element);
//       }
//     }, intervalTime);
//   });
// }

/**
 * Waits for one or more DOM elements to appear in the document.
 *
 * @param selector - A CSS selector string
 * @param intervalTime - How often to check, in ms (default: 500)
 * @returns A Promise that resolves with an array of found elements
 */
function waitForElements<T extends Element>(
  selector: string,
  intervalTime: number = 500
): Promise<T[]> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const elements = Array.from(document.querySelectorAll<T>(selector));
      if (elements.length > 0) {
        clearInterval(interval);
        resolve(elements);
      }
    }, intervalTime);
  });
}

(async () => {
  // Find the first problem link that is NOT the previous or next button
  const links = await waitForElements<HTMLAnchorElement>(
    'a[href^="/problems/"]:not([data-state])'
  );

  const problemLink = links.find((link) => link.innerText.trim().length > 0);

  console.log("Found problem link:", problemLink ?? "None");

  const title = problemLink?.innerText.trim();
  const url = problemLink?.href;

  // Persist for the popup
  chrome.storage.local.set({ currentProblem: { title, url } }, () => {
    console.log("✅ Saved LeetCode problem:", title);
  });
})();
